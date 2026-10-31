import {
  computeCombatAttack,
  computeCombatStat,
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  fixedSpecGrowth,
  growthLimits,
  isEmptyBuild,
  loadBuildMasters,
  loadCharacterIndex,
  loadEnemyPresets,
  resolveBuildEffects,
  type BuildEffect,
  type BuildEffectNote,
  type BuildMasters,
  type CharacterData,
  type CharacterIndexEntry,
  type EnemyPresetMaster,
  type GrowthInput,
  type TeamInput,
  type TeamSlotInput,
} from '@nikke/core';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { NotesSummary, type NotesSummarySlot } from './components/NotesSummary.tsx';
import { SlotCard } from './components/SlotCard.tsx';
import { TeamBreakdown } from './components/TeamBreakdown.tsx';
import { TeamSettingsForm } from './components/TeamSettingsForm.tsx';
import {
  DEFAULT_BURST,
  DEFAULT_CONTROLLED_SLOT,
  DEFAULT_DURATION_SECONDS,
  INITIAL_TEAM_STATE,
  STORAGE_KEY,
  effectiveBuild,
  effectiveSkillLevels,
  effectiveTreasurePhase,
  enemyForCalc,
  enemyStateForCalc,
  eventSetsForCalc,
  parseTeamState,
  serializeTeamState,
  slotForCalc,
  takenResourceIds,
  teamReducer,
} from './team.ts';
import { useCharacterCache } from './useCharacterCache.ts';
import { slotSkillsStatus, toSlotSkills, useSkillDefinitions } from './useSkillDefinitions.ts';
import { useTeamComputation } from './useTeamComputation.ts';

const BASE_URL = import.meta.env.BASE_URL;

function clampGrowth(character: CharacterData, growth: GrowthInput): GrowthInput {
  const limits = growthLimits(character);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  return {
    level: clamp(growth.level, 1, limits.levelMax),
    grade: clamp(growth.grade, 0, limits.gradeMax),
    core: clamp(growth.core, 0, limits.coreMax),
  };
}

function readSavedTeam(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, dispatch] = useReducer(teamReducer, INITIAL_TEAM_STATE);
  // 保存済みの編成を復元し終えるまでは保存しない（初期値で上書きしないため）
  const [restored, setRestored] = useState(false);
  // Stage 12: 育成のマスタ（装備・好感度・キューブ・コレクション・リサイクルルーム）。起動時に 1 回読む
  const [masters, setMasters] = useState<BuildMasters | null>(null);
  const [mastersError, setMastersError] = useState<string | null>(null);

  // Stage 15: 敵のプリセット。読めなければ null（手入力はできる）。Stage 16-B: 出来事のセットも同じファイル
  const [enemyMaster, setEnemyMaster] = useState<EnemyPresetMaster | null>(null);
  useEffect(() => {
    loadEnemyPresets({ baseUrl: BASE_URL })
      .then(setEnemyMaster)
      .catch(() => setEnemyMaster(null));
  }, []);

  useEffect(() => {
    loadBuildMasters({ baseUrl: BASE_URL })
      .then(setMasters)
      .catch((e: unknown) => setMastersError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    loadCharacterIndex({ baseUrl: BASE_URL })
      .then((i) => {
        setIndex(i.characters);
        const saved = parseTeamState(readSavedTeam(), i.characters);
        if (saved) dispatch({ type: 'replace', state: saved });
        setRestored(true);
      })
      .catch((e: unknown) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeTeamState(team));
    } catch {
      // プライベートモード等で保存できないときは黙って諦める
    }
  }, [team, restored]);

  const resourceIds = team.slots.map((s) => s.resourceId);
  const cache = useCharacterCache(resourceIds, BASE_URL);
  const skills = useSkillDefinitions(resourceIds, BASE_URL);

  // 枠ごとのスキル定義の状態（未選択は null）
  const skillsStatuses = useMemo(
    () => team.slots.map((slot) => (slot.resourceId === null ? null : slotSkillsStatus(skills, slot.resourceId))),
    [team.slots, skills],
  );

  // 枠ごとの計算入力。データが揃っていない枠は null（合計から除外）
  const slotInputs = useMemo<(TeamSlotInput | null)[]>(
    () =>
      team.slots.map((saved, i) => {
        if (saved.resourceId === null) return null;
        const character = cache.characters.get(saved.resourceId);
        const status = skillsStatuses[i];
        const slot = slotForCalc(saved);
        if (!character || !status) return null;
        const slotSkills = toSlotSkills(
          status,
          effectiveSkillLevels(slot, team.fixedSpec),
          effectiveTreasurePhase(slot, character),
        );
        if (team.fixedSpec) {
          return {
            character,
            growth: fixedSpecGrowth(character),
            condition: slot.condition,
            conditionMode: slot.conditionMode,
            attackOverride: computeFixedSpecAttack(character).attack,
            hpOverride: computeFixedSpecHp(character),
            hpRatio: slot.hpRatio,
            defenceOverride: computeFixedSpecDefence(character),
            skills: slotSkills,
          };
        }
        const growth = clampGrowth(character, slot.growth);
        const treasurePhase = effectiveTreasurePhase(slot, character);
        let attackOverride: number | undefined;
        let hpOverride: number | undefined;
        let defenceOverride: number | undefined;
        let buildEffects: BuildEffect[] | undefined;
        if (masters && (!isEmptyBuild(slot.build) || treasurePhase > 0)) {
          try {
            attackOverride = computeCombatAttack(character, growth, slot.build, masters, { treasurePhase }).attack;
            hpOverride = computeCombatStat(character, growth, slot.build, masters, 'hp', { treasurePhase }).value;
            defenceOverride = computeCombatStat(character, growth, slot.build, masters, 'defence', {
              treasurePhase,
            }).value;
            buildEffects = resolveBuildEffects(character, slot.build, masters, { treasurePhase }).effects;
          } catch {
            attackOverride = undefined;
            hpOverride = undefined;
            defenceOverride = undefined;
            buildEffects = undefined;
          }
        }
        return {
          character,
          growth,
          condition: slot.condition,
          conditionMode: slot.conditionMode,
          attackOverride,
          hpOverride,
          hpRatio: slot.hpRatio,
          defenceOverride,
          buildEffects,
          skills: slotSkills,
        };
      }),
    [team.slots, team.fixedSpec, cache.characters, skillsStatuses, masters],
  );

  const teamInput = useMemo<TeamInput>(
    () => ({
      slots: slotInputs,
      // 2026-10-31: オーナーの指示で詳細設定の戦闘時間・防御力・コアあり・バースト・操作キャラ・3 分モードの欄を消した。
      // 保存データの値は使わず、射撃場の的・既定値・出来事のセットを常に入れる形で計算する
      enemy: enemyForCalc(
        enemyStateForCalc(team.enemy.element),
        enemyMaster,
        eventSetsForCalc(enemyMaster),
        DEFAULT_DURATION_SECONDS,
      ),
      durationSeconds: DEFAULT_DURATION_SECONDS,
      burst: DEFAULT_BURST,
      controlledSlot: DEFAULT_CONTROLLED_SLOT,
    }),
    [slotInputs, team.enemy.element, enemyMaster],
  );
  // 一本化の段 A-2（plan/design-unify-sim-calc.md 5.3 節）: 計算は runSimulation → simTeamResult の 1 本。
  // 2026-10-27 までは calc と sim の切り替え（保存キー nikke-web.model）があり、sim の表示では 1 パス目を 2 回回していた
  // (B) の段 B-2（6.2 節）: 計算は Web Worker で回し、欄の表示は計算を待たない。計算中は前の結果を出したまま印を出し、
  // 古い入力の結果は捨てる（compute.ts の LatestComputeQueue）。B-1 の useDeferredValue では計算がメインスレッドを塞いでいた
  const { computed, computing } = useTeamComputation(teamInput);

  const loadingCount = team.slots.filter(
    (s) => s.resourceId !== null && !cache.characters.has(s.resourceId) && !cache.errors.has(s.resourceId),
  ).length;
  const skillsLoadingCount = skillsStatuses.filter((s) => s?.kind === 'loading').length;

  // Stage 14: 未対応の一覧に出す育成の注記（計算に入らないもののうち未対応だけ。スペック固定では効果層が空）
  const summarySlots = useMemo<(NotesSummarySlot | null)[]>(
    () =>
      team.slots.map((slot, i) => {
        if (slot.resourceId === null) return null;
        const character = cache.characters.get(slot.resourceId);
        if (!character) return null;
        const treasurePhase = effectiveTreasurePhase(slot, character);
        let buildNotes: BuildEffectNote[] = [];
        if (masters && !team.fixedSpec) {
          try {
            buildNotes = resolveBuildEffects(character, slotForCalc(slot).build, masters, {
              treasurePhase,
            }).notes.filter((n) => n.level === 'unsupported');
          } catch {
            buildNotes = [];
          }
        }
        return {
          index: i,
          character,
          skills: skillsStatuses[i] ?? { kind: 'loading' },
          treasurePhase,
          modelNotes: computed?.ok ? (computed.result.slots[i]?.notes ?? []) : [],
          buildNotes,
        };
      }),
    [team.slots, team.fixedSpec, cache.characters, skillsStatuses, masters, computed],
  );

  const allEffectiveSkillLevels = team.slots.map((s) => effectiveSkillLevels(s, team.fixedSpec));

  return (
    <main className="app">
      <header>
        <h1>NIKKE ダメージ計算</h1>
      </header>
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {index && (
        <>
          <TeamSettingsForm
            enemy={enemyStateForCalc(team.enemy.element)}
            enemyPresets={enemyMaster?.enemies ?? []}
            fixedSpec={team.fixedSpec}
            dispatch={dispatch}
          />
          <section className="slots" aria-label="編成">
            {team.slots.map((slot, i) => {
              const character = slot.resourceId === null ? undefined : cache.characters.get(slot.resourceId);
              const input = slotInputs[i] ?? null;
              return (
                <SlotCard
                  key={i}
                  slotIndex={i}
                  slot={slot}
                  index={index}
                  excludeIds={takenResourceIds(team, i)}
                  fullySupported={skills.fullySupported}
                  character={character}
                  loading={slot.resourceId !== null && character === undefined && !cache.errors.has(slot.resourceId)}
                  error={slot.resourceId === null ? undefined : cache.errors.get(slot.resourceId)}
                  fixedSpec={team.fixedSpec}
                  effectiveGrowth={input?.growth ?? slot.growth}
                  effectiveBuild={character ? effectiveBuild(slotForCalc(slot), team.fixedSpec, character) : slot.build}
                  masters={masters}
                  mastersError={mastersError}
                  effectiveSkillLevels={allEffectiveSkillLevels[i]!}
                  skillsStatus={skillsStatuses[i] ?? { kind: 'loading' }}
                  slotResult={computed?.ok ? (computed.result.slots[i] ?? null) : null}
                  dispatch={dispatch}
                />
              );
            })}
          </section>
          {computed === null ? (
            <section className="panel result breakdown-panel">
              <p className="hint">計算中…</p>
            </section>
          ) : computed.ok ? (
            <TeamBreakdown
              result={computed.result}
              computing={computing}
              loadingCount={loadingCount}
              skillsLoadingCount={skillsLoadingCount}
            />
          ) : (
            <p className="error">
              {computed.error}
              {computing && '（計算中…）'}
            </p>
          )}
          <NotesSummary slots={summarySlots} />
        </>
      )}
    </main>
  );
}
