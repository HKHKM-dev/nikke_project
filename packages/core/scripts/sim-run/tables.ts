// sim-run.ts が標準出力に出す文字の全部を作る: 表の見出しと行、1 行の文（出すかどうかと順は sim-run.ts。ここは console を呼ばない）。
// 出すものが無いときは、文は undefined、行は空の配列を返す。枠は 1 始まりで出す。秒はゲームの秒
import type { CombatAttack } from '../../src/build.ts';
import type { BuildEffects } from '../../src/buildEffects.ts';
import { slotsByStep, type BurstSchedule } from '../../src/burst/schedule.ts';
import type { EnemyEvent } from '../../src/damage.ts';
import { LANDING_BAND_LABEL } from '../../src/enemies.ts';
import { firingParams } from '../../src/frame/firing.ts';
import { simIntervalTotals, type SimResult } from '../../src/sim/engine.ts';
import {
  compositionAllows,
  compositionConditionsOf,
  resolveSelfState,
  selfStateLookupsForTeam,
  type CompositionConditions,
} from '../../src/skills/composition.ts';
import { expectedHitCount } from '../../src/skills/burstDamage.ts';
import { itemsOf } from '../../src/skills/holders.ts';
import { SKILL_SLOTS, type SkillEffect } from '../../src/skills/types.ts';
import type { TeamInput, TeamResult, TeamSlotInput, TeamSlotResult } from '../../src/team.ts';
import { framesToGameSeconds, gameSecondsToFrame } from '../../src/time.ts';
import type { Element, TargetProfile } from '../../src/types.ts';
import { effectValueText, itemLabel, stateLabelOf, triggerLabel } from './labels.ts';

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

type Slots = readonly TeamSlotInput[];

/** 育成入力から作った戦闘中の攻撃力と、その内訳（--build の枠ごとに 1 行） */
export function buildAttackLine(name: string, combat: CombatAttack): string {
  return (
    `build ${name}: attack ${combat.attack} = round((${combat.gradeBase} + affection ${combat.affection}` +
    ` + recycle ${combat.recycleRoom}) × core) ${combat.withCore}` +
    ` + gear ${combat.gear} + cube ${combat.cube} + collection ${combat.collection} + extra ${combat.extra}`
  );
}

/** 育成入力の効果層（OL・キューブ・コレクション）の効果と、計算に入れなかったもの。どちらも無ければ undefined */
export function buildEffectsLine(effects: BuildEffects): string | undefined {
  if (effects.effects.length === 0 && effects.notes.length === 0) return undefined;
  const pctOf = (v: number) => `${(v * 100).toFixed(2)}%`;
  return (
    `  effects: ${effects.effects.map((e) => `${e.source.kind} ${e.stat} +${pctOf(e.value)}`).join(', ') || 'none'}` +
    (effects.notes.length > 0
      ? `; not applied: ${effects.notes.map((n) => `${n.source.kind} ${n.source.name.en} (${n.level})`).join(', ')}`
      : '')
  );
}

export const COMPOSITION_TITLE = 'composition conditions (effects that do not apply are left out)';

/** 編成の条件の表の、条件ごとの文（CompositionConditions の項目を全部持つ。並びは表の並び） */
const COMPOSITION_CONDITION_TEXTS: {
  [K in keyof CompositionConditions]: (condition: NonNullable<CompositionConditions[K]>, slot: TeamSlotInput) => string;
} = {
  burstStepMix: (mix) => `other ${mix.otherBurstStep} ${mix.present ? 'present' : 'absent'}`,
  squad: (squad, slot) => `same squad (${slot.character.squad}) ${squad.present ? 'present' : 'absent'}`,
  withCharacter: (w) => `character ${w.rid} ${w.present ? 'present' : 'absent'}`,
  enemyElement: (element) => `enemy ${element}`,
  row: (row) => `${row} row`,
};

/** 効果の編成の条件の文（持つ条件だけ） */
function compositionConditionTexts(effect: SkillEffect, slot: TeamSlotInput): string[] {
  const conditions = compositionConditionsOf(effect);
  return (Object.keys(COMPOSITION_CONDITION_TEXTS) as (keyof CompositionConditions)[]).flatMap((key) => {
    const condition = conditions[key];
    if (condition === undefined) return [];
    const text = COMPOSITION_CONDITION_TEXTS[key] as (c: typeof condition, s: TeamSlotInput) => string;
    return [text(condition, slot)];
  });
}

/**
 * 編成の条件（burstStepMix・squad・withCharacter・enemyElement・row）と、編成で決まる自分の状態の条件（selfState。
 * plan/design-skill-stage1.md 1.1 節）の付いた効果と、この編成で効くか（効かない効果は計算に入らない）
 */
export function compositionRows(
  slots: Slots,
  enemyElement: Element | null,
): { slot: string; effect: string; condition: string; applies: boolean }[] {
  const characters = slots.map((s) => s.character);
  const selfStates = selfStateLookupsForTeam(
    slots.map((s) => s.skills?.definition ?? null),
    characters,
    enemyElement,
  );
  return slots.flatMap((slot, i) =>
    SKILL_SLOTS.flatMap((skill) =>
      (slot.skills?.definition?.skills[skill].effects ?? []).flatMap((e, effectIndex) => {
        const selfState = 'condition' in e ? e.condition?.selfState : undefined;
        const decided = selfState !== undefined && selfStates[i]!(selfState.state) !== undefined;
        const conditions = [
          ...compositionConditionTexts(e, slot),
          ...(decided ? [`self ${selfState.present ? 'in' : 'not in'} ${selfState.state}`] : []),
        ];
        if (conditions.length === 0) return [];
        return [
          {
            slot: `slot ${i + 1} ${slot.character.name.ja}`,
            // 付与の行には状態の id も出す（state camouflage）。解除も（removeState metalSigma）
            effect: `${skill}[${effectIndex}] ${e.kind}${stateLabelOf(e)}`,
            condition: conditions.join(' & '),
            applies: compositionAllows(e, characters, i, enemyElement) && resolveSelfState(e, selfStates[i]!) !== null,
          },
        ];
      }),
    ),
  );
}

/** 頭書きに出す、引数で決まること */
export type RunSettings = {
  fixedSpec: boolean;
  /** --build の値 */
  build?: string;
  /** --manual-bursts の値（渡したとおりの文） */
  manualBursts?: string;
  /** --enemy のプリセットの id */
  enemyPresetId?: string;
  conditionMode: 'auto' | 'manual';
  /** 手入力の条件 */
  condition: { coreHitRate: number; hitRate: number };
  /** 着地点の固定（--mid-far・--near・--far） */
  midFar?: string;
  near?: readonly string[];
  far?: readonly string[];
};

/** 頭書き（戦闘時間・バーストの回し方・育成・操作キャラ・敵・条件の決め方） */
export function headerLine(
  input: Required<Pick<TeamInput, 'durationSeconds' | 'burst' | 'enemy' | 'burstModel' | 'controlledSlot'>>,
  frames: number,
  settings: RunSettings,
): string {
  const { midFar, near, far } = settings;
  return (
    `duration ${input.durationSeconds}s (${frames}f), burst ${input.burst ? input.burstModel : 'off'}${settings.manualBursts === undefined ? '' : ` (manual bursts ${settings.manualBursts})`}, ` +
    `fixed spec ${settings.fixedSpec}, build ${settings.build ?? 'none'}, controlled ${input.controlledSlot === null ? 'none (all AI)' : `slot ${input.controlledSlot + 1}`}, ` +
    `enemy ${settings.enemyPresetId ?? 'custom'} defence ${input.enemy.defence}, element ${input.enemy.element ?? 'none'}, ` +
    `conditions ${settings.conditionMode}${
      settings.conditionMode === 'manual'
        ? ` (core ${settings.condition.coreHitRate}, hit rate ${settings.condition.hitRate})`
        : [midFar ? `mid-far ${midFar}` : '', near ? `near ${near.join(',')}` : '', far ? `far ${far.join(',')}` : '']
            .filter(Boolean)
            .map((x) => ` (${x})`)
            .join('')
    }`
  );
}

/** 着地点の区間（配分の区間は mix、測っていない区間は unmeasured）。区間が無ければ undefined */
export function landingsLine(landings: TeamResult['landings'], target: TargetProfile): string | undefined {
  if (landings.length === 0) return undefined;
  const labelOf = (id: string | null): string => {
    if (id === null) return 'unmeasured';
    const band = target.landings.find((l) => l.id === id)?.band ?? id;
    const name = band in LANDING_BAND_LABEL ? LANDING_BAND_LABEL[band as keyof typeof LANDING_BAND_LABEL].en : id;
    return id in target.mixes ? `${name} (mix)` : `${name} [${id}]`;
  };
  return `landings ${landings.map((s) => `${framesToGameSeconds(s.start).toFixed(1)}-${framesToGameSeconds(s.end).toFixed(1)}s ${labelOf(s.landing)}`).join(', ')}`;
}

/** 敵の出来事（jumpWindows は --jump-windows の値。渡したとおりの文） */
export function enemyEventsLine(
  eventSetIds: readonly string[],
  jumpWindows: string | undefined,
  events: readonly EnemyEvent[],
): string {
  return `enemy events ${eventSetIds.join(', ')}${jumpWindows === undefined ? '' : ` (jump windows ${jumpWindows})`}: ${events.map((e) => `${e.kind} ${e.start.toFixed(1)}-${e.end.toFixed(1)}s`).join(', ')}`;
}

/** バーストの要約（フルバーストの回数・最初の秒・平均の周期・稼働率・発動の数・チェーン切れと、段ごとの枠） */
export function burstSummaryLine(
  schedule: BurstSchedule,
  summary: NonNullable<TeamResult['burstSummary']>,
  slots: Slots,
): string {
  const byStep = slotsByStep(schedule);
  const who = (list: number[]) =>
    list.length === 0 ? '-' : list.map((i) => `slot ${i + 1} ${slots[i]!.character.name.ja}`).join(' / ');
  const sec = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}s`);
  return (
    `full bursts ${summary.fullBursts} (first ${sec(summary.firstFullBurstSeconds)}, mean cycle ${sec(summary.meanCycleSeconds)}, ` +
    `uptime ${pct(summary.fullBurstUptime)}), activations ${summary.activations}, chain timeouts ${summary.chainTimeouts}; ` +
    `I: ${who(byStep.Step1)}, II: ${who(byStep.Step2)}, III: ${who(byStep.Step3)}`
  );
}

const STEP_LABEL = { Step1: 'I', Step2: 'II', Step3: 'III' } as const;

/** バーストの発動の表（フルバーストを開いた発動には、その長さと、開いたチェーンで撃った枠） */
export function activationRows(schedule: BurstSchedule, slots: Slots) {
  return schedule.activations.map((a) => ({
    time: `${framesToGameSeconds(a.frame).toFixed(2)}s`,
    frame: a.frame,
    step: STEP_LABEL[a.step],
    nike: `slot ${a.slotIndex + 1} ${slots[a.slotIndex]!.character.name.ja}`,
    fullBurst: a.startsFullBurst
      ? `start (${framesToGameSeconds((schedule.fullBurstWindows.find((w) => w.start >= a.frame)?.end ?? a.frame) - a.frame).toFixed(1)}s)`
      : '',
    // そのフルバーストを開いたチェーンで撃った枠（「直前にバーストスキルを使用した味方」）
    burstUsers: a.startsFullBurst
      ? (schedule.fullBurstWindows.find((w) => w.start >= a.frame)?.burstUsers ?? []).map((i) => i + 1).join(',')
      : '',
  }));
}

/** チェーン切れの秒。チェーン切れが無ければ undefined */
export function chainTimeoutsLine(schedule: BurstSchedule): string | undefined {
  if (schedule.chainTimeouts.length === 0) return undefined;
  return `chain timeouts at ${schedule.chainTimeouts.map((f) => `${framesToGameSeconds(f).toFixed(2)}s`).join(', ')}`;
}

/** フルバーストの始まりから次の始まりまでの秒 */
export function fullBurstIntervalsLine(schedule: BurstSchedule): string {
  const starts = schedule.fullBurstWindows.map((w) => w.start);
  return `full burst intervals ${starts
    .slice(1)
    .map((f, k) => `${framesToGameSeconds(f - starts[k]!).toFixed(2)}s`)
    .join(', ')}`;
}

export const RANKING_TITLE = 'top final ATK targets (topAttack)';

/** 「最終攻撃力が最も高い味方 N 機」の発火ごとの順位。同じ発火の同じ対象（S1 の 2 効果など）はまとめる */
export function rankingRows(rankings: TeamResult['history']['rankings'], slots: Slots) {
  const merged = new Map<string, { time: string; frame: number; from: string; targets: string; tied: string }>();
  for (const r of rankings) {
    const key = `${r.frame}.${r.sourceSlotIndex}.${r.effect.source.skill}.${r.targets.join(',')}`;
    if (merged.has(key)) continue;
    merged.set(key, {
      time: `${framesToGameSeconds(r.frame).toFixed(2)}s`,
      frame: r.frame,
      from: `slot ${r.sourceSlotIndex + 1} ${r.effect.source.skill}`,
      targets: r.targets
        .map((i) => `slot ${i + 1} ${slots[i]!.character.name.ja} ${fmt(r.finalAttacks[i]!)}`)
        .join(' / '),
      tied: r.tied ? (r.rankTie === 'lastSlot' ? 'yes (last slot)' : 'yes (first slot, assumed)') : '',
    });
  }
  return [...merged.values()];
}

export const INSTANT_TITLE =
  'instant effects (cooldownReduction: frames actually cut, negative when lengthened by an increase, ammoRefill: rounds added, heal: always 0, burstGauge: ratio of the gauge max)';

/**
 * 即時効果（CT 短縮・弾丸チャージ・回復など）。同じフレーム・同じ種類・同じ出どころの枠・同じ枠は量を足してまとめる（1 行の量は
 * 1 つの出どころのもの。plan/design-sim-run-split.md 10 節）
 */
export function instantRows(instants: SimResult['instants'], slots: Slots) {
  const merged = new Map<string, { time: string; kind: string; from: string; to: string; amount: number }>();
  for (const x of instants) {
    const key = `${x.frame}.${x.effect.kind}.${x.sourceSlotIndex}.${x.slotIndex}`;
    const row = merged.get(key) ?? {
      time: `${framesToGameSeconds(x.frame).toFixed(2)}s`,
      kind: x.effect.kind,
      from: `slot ${x.sourceSlotIndex + 1}`,
      to: `slot ${x.slotIndex + 1} ${slots[x.slotIndex]!.character.name.ja}`,
      amount: 0,
    };
    row.amount += x.amount;
    merged.set(key, row);
  }
  return [...merged.values()];
}

/** 枠ごとの合計の表 */
export function summaryRows(sim: SimResult, result: TeamResult, slots: Slots) {
  return slots.map((slot, i) => {
    const s = sim.slots[i]!;
    const c = result.slots[i]!;
    return {
      slot: i + 1,
      name: slot.character.name.ja,
      weapon: slot.character.weaponType,
      burst: slot.character.burstStep,
      // 宝物の段階（宝物版で計算したスロット数）
      treasure: c.treasurePhase === 0 ? '-' : `${c.treasurePhase} (${c.treasureSlots.join('+')})`,
      attack: fmt(c.segments[0]?.trigger.attack ?? c.baseAttack),
      'normal (nonFB/FB triggers)': `${fmt(c.normalDamage)} (${simIntervalTotals(s).nonFullBurst.triggers}/${simIntervalTotals(s).fullBurst.triggers})`,
      segments: c.segments.length,
      'burst skill': `${fmt(s.burst.damage)} (${s.burst.activations.length}× ${fmt(s.burst.hit?.perActivation ?? 0)})`,
      // トリガー付きの倍率ダメージ（damage）
      'skill hits': `${fmt(s.skillHits.damage)} (${fmt(s.skillHits.count)}×)`,
      total: fmt(c.totalDamage),
      share: pct(c.share),
    };
  });
}

/** 合計の 1 行 */
export function totalLine(result: TeamResult): string {
  return `TOTAL ${fmt(result.totalDamage)}`;
}

export const AUTO_CONDITION_TITLE = 'auto conditions (shot-weighted means)';

/** 条件が自動の枠で使った条件の平均（1 パス目の射撃の列の発数で重みを付けた） */
export function autoConditionRows(result: TeamResult, slots: Slots) {
  return result.slots.flatMap((c, i) =>
    c?.autoCondition
      ? [
          {
            slot: i + 1,
            name: slots[i]!.character.name.ja,
            shots: c.autoCondition.shots,
            'core hit rate': c.autoCondition.coreHitRate.toFixed(4),
            'distance bonus': pct(c.autoCondition.distanceBonus),
            'bullet hit rate': c.autoCondition.hitRate.toFixed(4),
            'hit rate up': pct(c.autoCondition.hitRateUp),
          },
        ]
      : [],
  );
}

/** 条件の注記（自動の条件・着地点・命中率）。見出しと、注記ごとに 1 行。注記が無ければ undefined */
export function conditionNotesText(result: TeamResult): string | undefined {
  const lines = result.slots.flatMap((c, i) =>
    (c?.notes ?? [])
      .filter((n) => n.code.startsWith('auto-') || n.code.startsWith('landing-') || n.code === 'hit-rate')
      .map((n) => `  [slot ${i + 1}] ${n.level}: ${n.message.ja}`),
  );
  return lines.length === 0 ? undefined : `condition notes\n${lines.join('\n')}`;
}

/** 枠ごとの区間の表の見出し（前に空行を 1 つ置く） */
export function segmentsTitle(slotIndex: number, slot: TeamSlotInput): string {
  return `\n[slot ${slotIndex + 1}] ${slot.character.name.ja} — segments`;
}

/** 同じ効果のスタックの段をまとめる（「critDamage+14.25% ×5」） */
export function compactTimed<
  T extends { sourceSlotIndex: number; effectIndex: number; subIndex?: number; source: { skill: string } },
>(effects: readonly T[]): { e: T; n: number }[] {
  const out: { e: T; n: number }[] = [];
  for (const e of effects) {
    // 状態の中身は付与の中身の何番目か（subIndex）でも分ける
    const found = out.find(
      (x) =>
        x.e.sourceSlotIndex === e.sourceSlotIndex &&
        x.e.source.skill === e.source.skill &&
        x.e.effectIndex === e.effectIndex &&
        x.e.subIndex === e.subIndex,
    );
    if (found) found.n += 1;
    else out.push({ e, n: 1 });
  }
  return out;
}

/** バフ状態ごとの区間の表（枠 1 つ分）。発数は 1 パス目の射撃の列から数えた数 */
export function segmentRows(slot: TeamSlotInput, c: TeamSlotResult) {
  return c.segments.map((g) => ({
    ranges: g.ranges
      .map((r) => `${framesToGameSeconds(r.start).toFixed(1)}-${framesToGameSeconds(r.end).toFixed(1)}s`)
      .join(' '),
    sec: g.seconds.toFixed(1),
    FB: g.fullBurst ? 'yes' : '',
    attack: fmt(g.trigger.attack),
    boost: g.trigger.boost.total.toFixed(3),
    atkDmg: g.trigger.attackDamageMultiplier.toFixed(4),
    // 使用武器の変更（1 発の倍率）と、最大装弾数（スタックの▼・装弾数無限込み）
    weapon: g.buffs.weapon ? `${(g.trigger.weaponMultiplier * 100).toFixed(2)}%` : '',
    ammo: g.buffs.infiniteAmmo > 0 ? '∞' : firingParams(slot.character.shot, g.buffs).maxAmmo,
    // 1 トリガーの値と内訳（通常攻撃 + 射撃ごとの倍率ダメージ + 与えたダメージ量の X% の固定ダメージ。0 の項は省く）
    perTrigger:
      g.trigger.perShot > 0 || g.trigger.fixedShare > 0
        ? `${fmt(g.trigger.perTrigger)} (${[g.trigger.normal, g.trigger.perShot, g.trigger.fixedShare]
            .filter((v, k) => k === 0 || v > 0)
            .map((v) => fmt(v))
            .join('+')})`
        : fmt(g.trigger.perTrigger),
    triggers: g.triggers,
    damage: fmt(g.damage),
    timed: compactTimed(g.timedEffects)
      .map(
        ({ e, n }) =>
          // 状態の中身はトリガーの代わりに、効いている状態（while:camouflage）
          `${itemLabel(e)} ${effectValueText(e, e.appliedAmount)}${n > 1 ? ` ×${n}` : ''}${e.targetWeapon ? ` (${e.targetWeapon}${e.targetLeftmost ? ', leftmost' : ''})` : ''}`,
      )
      .join(', '),
  }));
}

/** 条件「自分が 〈stat〉 増加状態なら」を満たさずに発火しなかった回数と秒（履歴の判定の記録）。無ければ undefined */
export function conditionSkipsLine(
  conditionSkips: readonly { frame: number; sourceSlotIndex: number }[],
  slotIndex: number,
): string | undefined {
  const skips = conditionSkips.filter((x) => x.sourceSlotIndex === slotIndex);
  if (skips.length === 0) return undefined;
  return `condition skips: ${skips.length} (${skips.map((x) => framesToGameSeconds(x.frame).toFixed(2)).join(', ')}s)`;
}

/**
 * 段の循環の内訳（段ごとの回数・合計）の 1 行と、間隔の変更の窓ごとの並びの表
 * （窓の前の段なしの発数 p・窓の中の段・窓の後の最初の段が何発目か。plan/design-stage11-scarlet-bs.md 0.3・7.5 節）。
 * 段の循環の無い枠は undefined
 */
export function cycleReport(slotIndex: number, sim: SimResult, result: TeamResult) {
  const cycled = (result.slots[slotIndex]?.skillHits.activations ?? []).filter((a) => a.effect.cycle !== undefined);
  if (cycled.length === 0) return undefined;
  const letter = (step: number) => String.fromCharCode(65 + step);
  const bySteps = new Map<number, { n: number; damage: number; multiplier: number }>();
  for (const a of cycled) {
    const s = bySteps.get(a.effect.cycle!.step) ?? { n: 0, damage: 0, multiplier: a.effect.multiplier };
    s.n += 1;
    s.damage += a.hit.perActivation;
    bySteps.set(a.effect.cycle!.step, s);
  }
  const line = `cycle tiers: ${[...bySteps.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, s]) => `${letter(step)} ${(s.multiplier * 100).toFixed(2)}% ×${s.n} = ${fmt(s.damage)}`)
    .join(', ')}`;
  const shots = sim.shots[slotIndex]?.frames ?? [];
  const stepAt = new Map(cycled.map((a) => [gameSecondsToFrame(a.seconds), a.effect.cycle!.step]));
  // 間隔の変更の件（時刻の順）
  const rows = itemsOf(result.history, { holder: slotIndex, kind: 'cycleEvery' }).map((w) => {
    const before = shots.filter((f) => f < w.start);
    let lastTier = before.length - 1;
    while (lastTier >= 0 && !stepAt.has(before[lastTier]!)) lastTier -= 1;
    const inside = shots.filter((f) => f >= w.start && f < w.end);
    const after = shots.filter((f) => f >= w.end);
    const k = after.findIndex((f) => stepAt.has(f));
    return {
      window: `${framesToGameSeconds(w.start).toFixed(2)}-${framesToGameSeconds(w.end).toFixed(2)}s`,
      'last tier before': lastTier < 0 ? '-' : letter(stepAt.get(before[lastTier]!)!),
      p: lastTier < 0 ? before.length : before.length - 1 - lastTier,
      inside: `${inside.length} ${inside.map((f) => (stepAt.has(f) ? letter(stepAt.get(f)!) : '-')).join('')}`,
      'first tier after': k < 0 ? '-' : `shot ${k + 1} (${letter(stepAt.get(after[k]!)!)})`,
    };
  });
  return { line, rows };
}

/** 持続ダメージの内訳（効果ごとの tick の数・合計と、tick の秒。plan/design-nihilister.md 2.1 節）。周期の自動攻撃も同じ形で出す */
export function dotLines(c: TeamSlotResult): string[] {
  const ticks = c.skillHits.activations.filter((a) => a.effect.dot !== undefined);
  const byEffect = new Map<
    string,
    {
      n: number;
      damage: number;
      multiplier: number;
      seconds: number[];
      stacks: number[];
      maxStacks: number;
      label: string;
    }
  >();
  for (const a of ticks) {
    const key = `${a.effect.source.skill}.${a.effect.effectIndex}`;
    const d = byEffect.get(key) ?? {
      n: 0,
      damage: 0,
      multiplier: a.effect.multiplier,
      seconds: [],
      stacks: [],
      maxStacks: a.effect.dot!.maxStacks,
      label: a.effect.dot!.autoAttack ? 'autoAttack' : 'dot',
    };
    // 確率のきっかけの持続ダメージは、起点ごとの tick を出る確率で数え、時刻は並べない（期待値の tick の時刻はどの付き方の時刻でもない）
    d.n += expectedHitCount(a.hit);
    d.damage += a.hit.perActivation;
    if (a.hit.chance === undefined) d.seconds.push(a.seconds);
    // スタックする持続ダメージは tick ごとのスタックの数も出す
    if (a.stacks !== undefined) d.stacks.push(a.stacks);
    byEffect.set(key, d);
  }
  return [...byEffect].map(([key, d]) => {
    const perStack = d.maxStacks > 1 ? `/stack (max ${d.maxStacks})` : '';
    const stacks = d.stacks.length > 0 ? ` (stacks ${d.stacks.join(', ')})` : '';
    return `${d.label} ${key}: ${(d.multiplier * 100).toFixed(2)}%${perStack} ×${fmt(d.n)} ticks = ${fmt(d.damage)} (ticks at ${d.seconds.map((x) => x.toFixed(2)).join(', ')}s)${stacks}`;
  });
}

/** delayFrames のある倍率ダメージの遅れと、出た秒・合計（plan/design-delayed-skill-hit.md）。効果ごとに 1 行 */
export function delayedHitLines(c: TeamSlotResult): string[] {
  const delayed = c.skillHits.activations.filter((a) => a.effect.delayFrames !== undefined);
  const byEffect = new Map<string, typeof delayed>();
  for (const a of delayed) {
    const key = `${a.effect.source.skill}.${a.effect.effectIndex}`;
    byEffect.set(key, [...(byEffect.get(key) ?? []), a]);
  }
  return [...byEffect].map(([key, list]) => {
    const e = list[0]!.effect;
    return `delayed hit ${key}: ${(e.multiplier * 100).toFixed(2)}% +${e.delayFrames}f after ${triggerLabel(e.trigger)} ×${list.length} = ${fmt(list.reduce((t, a) => t + a.hit.perActivation, 0))} (at ${list.map((a) => a.seconds.toFixed(2)).join(', ')}s)`;
  });
}
