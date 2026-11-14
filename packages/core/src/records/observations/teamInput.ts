// 録画の条件と比べる設定から、モデルの入力（TeamInput）を組む（plan/design-stage19.md 2.3 節）
import { type BuildInput, emptyBuild, GEAR_PARTS } from '../../build.ts';
import { resolveBuildEffects } from '../../buildEffects.ts';
import { enemyEventsOf, enemyInputOf, enemyLandingsOf, targetProfileOf } from '../../enemies.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  fixedSpecGrowth,
} from '../../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import type { TreasurePhase } from '../../skills/treasure.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillEntry, statContentsOf } from '../../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { BuildMasters, CharacterData, EnemyPresetMaster } from '../../types.ts';
import type { RecordingBuild, RecordingEntry } from '../recordings.ts';
import type { SkillRoot } from '../skills.ts';
import {
  burstDelayOverrideOf,
  type CompareSetup,
  type DroppedEffect,
  holdFireRangesOf,
  jumpWindowsOf,
  landingFixed,
  manualBurstsOf,
  withAddedEffects,
} from './setup.ts';
import type { ObservationValue } from './types.ts';

export type RecordsData = {
  characters: ReadonlyMap<number, CharacterData>;
  skills: ReadonlyMap<number, SkillDefinition>;
  enemies: EnemyPresetMaster;
  /** 観測値の id → 値（数か数の配列のもの。setup.jumpWindows を引く。無ければ jumpWindows は使えない） */
  observationValues?: ReadonlyMap<string, ObservationValue>;
  /** 育成のマスタ（スペック固定 OFF の録画の効果層を引く。無ければ固定 OFF の録画は比べられない） */
  buildMasters?: BuildMasters;
};

/**
 * 録画の育成（RecordingBuild）を効果層の入力（BuildInput）にする。攻撃力はキャラ画面の値を attackOverride に入れるので、
 * ステータス層の項目（装備のティア・Lv・好感度など）は効かない。OL の行は OL 装備の部位に置く（Lv は検証を通す 0）
 */
function buildInputOf(build: RecordingBuild): BuildInput {
  const out = emptyBuild();
  for (const part of GEAR_PARTS) {
    const lines = build.overload?.[part];
    if (lines !== undefined && lines.length > 0) out.gear[part] = { type: 'OL', level: 0, overload: lines };
  }
  out.cube = build.cube ?? null;
  out.collection = build.collection ?? null;
  return out;
}

/** 定義に発動者の最終最大HP を読む効果（scaling casterFinalMaxHp。状態の中身も）があるか。宝物版の定義も見る */
function readsCasterMaxHp(definition: SkillDefinition | null): boolean {
  if (definition === null) return false;
  const entries = [...Object.values(definition.skills), ...Object.values(definition.treasureSkills ?? {})];
  return entries.some((entry) =>
    entry.effects.some(
      (e) =>
        ('scaling' in e && e.scaling === 'casterFinalMaxHp') ||
        (e.kind === 'state' && statContentsOf(e.contents).some((c) => c.scaling === 'casterFinalMaxHp')),
    ),
  );
}

/** 対象を最終防御力の比べで決める効果（targetDefense）があるか（plan/design-skill-stage7.md 1.4 節） */
function comparesDefence(definition: SkillDefinition | null): boolean {
  if (definition === null) return false;
  const entries = [...Object.values(definition.skills), ...Object.values(definition.treasureSkills ?? {})];
  return entries.some((entry) => entry.effects.some((e) => 'targetDefense' in e && e.targetDefense !== undefined));
}

/** 定義の効果を落とした写しを返す（CompareSetup.dropEffects）。番号は落とす前の定義の番号 */
export function withoutEffects(
  definition: SkillDefinition | null,
  drops: readonly DroppedEffect[],
): SkillDefinition | null {
  if (definition === null || drops.length === 0) return definition;
  const out: SkillDefinition = { ...definition, skills: { ...definition.skills } };
  if (definition.treasureSkills !== undefined) out.treasureSkills = { ...definition.treasureSkills };
  for (const d of drops) {
    const root: SkillRoot = d.treasure === true ? 'treasureSkills' : 'skills';
    // 番号は落とす前の定義で引く（同じスロットから 2 件以上落とすとき、落とした後の写しの番号はずれる）
    const original = definition[root]?.[d.skill]?.effects[d.index];
    if (original === undefined) {
      throw new Error(
        `dropEffects: rid ${d.rid} の ${d.treasure === true ? '宝物版の ' : ''}${d.skill} に ${d.index} 番目の効果が無い`,
      );
    }
    // 元の定義にあるスロットは写しにもある
    const entry = out[root]![d.skill]!;
    out[root]![d.skill] = { ...entry, effects: entry.effects.filter((e) => e !== original) };
  }
  return out;
}

/** drop なら、定義の各スロット（基礎版・宝物版）から回復（heal）を落とした写しを返す（CompareSetup.dropHeals） */
function withoutHealsIf(definition: SkillDefinition | null, drop: boolean): SkillDefinition | null {
  if (definition === null || !drop) return definition;
  const strip = (entry: SkillEntry): SkillEntry => ({
    ...entry,
    effects: entry.effects.filter((e) => e.kind !== 'heal'),
  });
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) skills[slot] = strip(skills[slot]);
  const out: SkillDefinition = { ...definition, skills };
  if (definition.treasureSkills !== undefined) {
    const treasureSkills: SkillDefinition['treasureSkills'] = {};
    for (const slot of SKILL_SLOTS) {
      const entry = definition.treasureSkills[slot];
      if (entry !== undefined) treasureSkills[slot] = strip(entry);
    }
    out.treasureSkills = treasureSkills;
  }
  return out;
}

/** 録画の条件と予測の条件から、モデルの入力を組む（npm run sim の --fixed-spec と同じ組み方） */
export function buildTeamInput(recording: RecordingEntry, setup: CompareSetup, data: RecordsData): TeamInput {
  if (recording.fixedSpec === null) throw new Error('スペック固定かどうか記録が無い');
  const fixedSpec = recording.fixedSpec;
  if (!fixedSpec) {
    // 固定 OFF は、枠ごとの育成（録画に映した値）で組む
    const missing = recording.team.filter((m) => m.build === undefined).map((m) => m.slot);
    if (missing.length > 0)
      throw new Error(`スペック固定 OFF の録画で、枠 ${missing.join('・')} の育成（build）が無い`);
    if (data.buildMasters === undefined) throw new Error('スペック固定 OFF の録画には育成のマスタが要る');
    // 台帳の育成には防御力が無いので、最終防御力で対象を決める効果（味方全員の
    // 防御力を読む）のある編成は、スペック固定 OFF の録画では比べない（黙って育成値だけの防御力にしない。plan/design-skill-stage7.md 1.1 節）
    const readers = recording.team.filter((m) => comparesDefence(data.skills.get(m.rid) ?? null)).map((m) => m.rid);
    if (readers.length > 0)
      throw new Error(
        `rid ${readers.join('・')}: スペック固定 OFF の録画で最終防御力で対象を決める効果のある編成は未対応（台帳に防御力が無い）`,
      );
  } else if (setup.buildEffectsOff !== undefined) throw new Error('buildEffectsOff はスペック固定 OFF の録画だけ');
  const preset = data.enemies.enemies.find((e) => e.id === setup.enemy);
  if (preset === undefined) throw new Error(`敵のプリセット ${setup.enemy} が無い`);
  const durationSeconds = setup.durationSeconds ?? 180;
  let windows: { start: number; end: number }[] | undefined;
  if (setup.jumpWindows !== undefined) {
    windows = jumpWindowsOf(data.observationValues?.get(setup.jumpWindows));
    if (windows === undefined) throw new Error(`jumpWindows の観測値 ${setup.jumpWindows} が無いか、窓の並びでない`);
  }
  const auto = setup.condition === 'auto';
  // 的の表は条件の決め方に依らず付ける（apps/web の enemyForCalc と同じ）。手入力の枠の命中率・コアは変わらず、飛ぶ時間
  // （plan/design-anis-star-gauge-timing.md 3.3 節）だけが着地点で決まる
  const target = targetProfileOf(data.enemies, preset);
  const condition = {
    coreHitRate: setup.coreHitRate ?? 1,
    distanceBonus: setup.distanceBonus ?? true,
    fullCharge: true,
    hitRate: setup.hitRate ?? 1,
  };
  const slots: TeamSlotInput[] = recording.team.map((member, index) => {
    const base = data.characters.get(member.rid);
    if (base === undefined) throw new Error(`rid ${member.rid} のデータが無い`);
    const delayOverrides = (setup.burstDelays ?? []).filter((d) => d.rid === member.rid);
    if (delayOverrides.length > 1) throw new Error(`burstDelays: rid ${member.rid} が 2 つある`);
    const character =
      delayOverrides.length === 0 ? base : { ...base, burstDelayOverride: burstDelayOverrideOf(delayOverrides[0]!) };
    const definition = withoutHealsIf(
      withoutEffects(
        data.skills.get(member.rid) ?? null,
        (setup.dropEffects ?? []).filter((d) => d.rid === member.rid),
      ),
      setup.dropHeals?.includes(member.rid) === true,
    );
    const adds = (setup.addEffects ?? []).filter((a) => a.rid === member.rid);
    if (adds.length > 0 && definition === null) throw new Error(`addEffects: rid ${member.rid} の定義が無い`);
    if (fixedSpec && member.cube !== undefined)
      throw new Error('キューブを付けた枠は未対応（スペック固定では乗らない）');
    const treasurePhase = (setup.treasure === false ? 0 : (member.treasurePhase ?? 0)) as TreasurePhase;
    const build = fixedSpec ? undefined : member.build!;
    // 台帳の育成には最大HP が無いので、最終最大HP を読む効果のある枠は
    // スペック固定 OFF の録画では比べない（黙って育成値だけの HP にしない。plan/design-skill-stage6.md 1.1 節）
    if (build !== undefined && readsCasterMaxHp(definition))
      throw new Error(
        `rid ${member.rid}: スペック固定 OFF の録画で最終最大HP を読む効果のある枠は未対応（台帳に最大HP が無い）`,
      );
    const off = new Set(setup.buildEffectsOff ?? []);
    const buildEffects =
      build === undefined
        ? undefined
        : resolveBuildEffects(character, buildInputOf(build), data.buildMasters!, { treasurePhase }).effects.filter(
            (e) => !off.has(e.source.kind),
          );
    return {
      character,
      growth: fixedSpecGrowth(character),
      condition: setup.noFireSlots?.includes(index + 1) === true ? { ...condition, hitRate: 0 } : condition,
      ...(auto ? { conditionMode: 'auto' as const } : {}),
      attackOverride: build === undefined ? computeFixedSpecAttack(character).attack : build.attack,
      ...(build === undefined
        ? { hpOverride: computeFixedSpecHp(character), defenceOverride: computeFixedSpecDefence(character) }
        : {}),
      ...(buildEffects === undefined ? {} : { buildEffects }),
      skills: {
        definition: definition === null ? null : withAddedEffects(definition, adds),
        levels: { ...MAX_SKILL_LEVELS, ...(build?.skillLevels ?? {}) },
        treasurePhase,
      },
    };
  });
  const controlled = recording.team.findIndex((m) => m.controlled === true);
  let manualBursts: number[] | undefined;
  if (setup.manualBursts !== undefined) {
    if (setup.burst === false) throw new Error('manualBursts は burst が false のときには書かない');
    manualBursts = manualBurstsOf(data.observationValues?.get(setup.manualBursts));
    if (manualBursts === undefined)
      throw new Error(`manualBursts の観測値 ${setup.manualBursts} が無いか、昇順のフレームの並びでない`);
  }
  const holdFire = (setup.holdFire ?? []).map((h) => {
    const ranges = holdFireRangesOf(data.observationValues?.get(h.frames));
    if (ranges === undefined)
      throw new Error(`holdFire の観測値 ${h.frames} が無いか、[OFF, ON, …] のフレームの並びでない`);
    return { slotIndex: h.slot - 1, ranges };
  });
  const obstacleBreaks = (setup.obstacles ?? []).map((ob) => {
    const count = data.observationValues?.get(ob.count);
    if (typeof count !== 'number') throw new Error(`obstacles の観測値 ${ob.count} が無いか、個数でない`);
    return { slotIndex: ob.slot - 1, shot: ob.shot, count };
  });
  const pelletHits = (setup.pelletHits ?? []).map((ph) => {
    const counts = data.observationValues?.get(ph.counts);
    if (!Array.isArray(counts)) throw new Error(`pelletHits の観測値 ${ph.counts} が無いか、配列でない`);
    return { slotIndex: ph.slot - 1, counts };
  });
  return {
    slots,
    enemy: {
      ...enemyInputOf(preset),
      events: enemyEventsOf(data.enemies, setup.events ?? [], durationSeconds, windows),
      ...(setup.defenceRounding === undefined ? {} : { defenceRounding: setup.defenceRounding }),
      ...(setup.burstHitEnemyDebuffs === undefined ? {} : { burstHitEnemyDebuffs: setup.burstHitEnemyDebuffs }),
      ...(setup.burstEffectEnemyDebuffs === undefined
        ? {}
        : { burstEffectEnemyDebuffs: setup.burstEffectEnemyDebuffs }),
      ...(target === undefined
        ? {}
        : {
            target,
            landings: enemyLandingsOf(
              data.enemies,
              setup.events ?? [],
              durationSeconds,
              target,
              landingFixed(setup.midFarLanding, setup.nearLanding, setup.farLanding),
              windows,
            ),
          }),
    },
    durationSeconds,
    burst: setup.burst ?? true,
    burstModel: 'dynamic',
    controlledSlot: controlled < 0 ? null : controlled,
    ...(obstacleBreaks.length === 0 ? {} : { obstacleBreaks }),
    ...(pelletHits.length === 0 ? {} : { pelletHits }),
    ...(setup.sustainedHitRateUp === false ? { sustainedHitRateUp: false } : {}),
    ...(setup.sustainedDamagePlacement === undefined
      ? {}
      : { sustainedDamagePlacement: setup.sustainedDamagePlacement }),
    ...(setup.attackRounding === undefined ? {} : { attackRounding: setup.attackRounding }),
    ...(manualBursts === undefined ? {} : { manualBursts }),
    ...(setup.noBurstSlots === undefined ? {} : { noBurstSlots: setup.noBurstSlots.map((s) => s - 1) }),
    ...(holdFire.length === 0 ? {} : { holdFire }),
  };
}
