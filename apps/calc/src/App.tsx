import {
  computeCombatAttack,
  computeFixedSpecAttack,
  computeTeamDamage,
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
  type EnemyPreset,
  type GrowthInput,
  type TeamResult,
  type TeamSlotInput,
} from '@nikke/core';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { DataPanel } from './components/DataPanel.tsx';
import { NotesSummary, type NotesSummarySlot } from './components/NotesSummary.tsx';
import { SlotCard } from './components/SlotCard.tsx';
import { TeamBreakdown } from './components/TeamBreakdown.tsx';
import { TeamSettingsForm } from './components/TeamSettingsForm.tsx';
import {
  INITIAL_TEAM_STATE,
  STORAGE_KEY,
  effectiveBuild,
  effectiveSkillLevels,
  effectiveTreasurePhase,
  parseTeamState,
  serializeTeamState,
  takenResourceIds,
  teamReducer,
} from './team.ts';
import { useCharacterCache } from './useCharacterCache.ts';
import { slotSkillsStatus, toSlotSkills, useSkillDefinitions } from './useSkillDefinitions.ts';

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

type Computed = { ok: true; result: TeamResult } | { ok: false; error: string };

export function App() {
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, dispatch] = useReducer(teamReducer, INITIAL_TEAM_STATE);
  // 保存済みの編成を復元し終えるまでは保存しない（初期値で上書きしないため）
  const [restored, setRestored] = useState(false);
  // Stage 12: 育成のマスタ（装備・好感度・キューブ・コレクション・リサイクルルーム）。起動時に 1 回読む
  const [masters, setMasters] = useState<BuildMasters | null>(null);
  const [mastersError, setMastersError] = useState<string | null>(null);

  // Stage 15: 敵のプリセット。読めなければ空（手入力はできる）
  const [enemyPresets, setEnemyPresets] = useState<EnemyPreset[]>([]);
  useEffect(() => {
    loadEnemyPresets({ baseUrl: BASE_URL })
      .then((m) => setEnemyPresets(m.enemies))
      .catch(() => setEnemyPresets([]));
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
      team.slots.map((slot, i) => {
        if (slot.resourceId === null) return null;
        const character = cache.characters.get(slot.resourceId);
        const status = skillsStatuses[i];
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
            attackOverride: computeFixedSpecAttack(character).attack,
            skills: slotSkills,
          };
        }
        const growth = clampGrowth(character, slot.growth);
        // Stage 12: 育成入力か宝物のステータスがあれば、戦闘中の攻撃力（バフ前）を computeCombatAttack で作る。
        // Stage 13: 同じ入力から効果層（OL・キューブ・コレクション → 常時バフ）を resolveBuildEffects で作る。
        // マスタの読み込み前・入力がマスタと合わないときは素のステータスのまま（BuildSection が知らせる）
        const treasurePhase = effectiveTreasurePhase(slot, character);
        let attackOverride: number | undefined;
        let buildEffects: BuildEffect[] | undefined;
        if (masters && (!isEmptyBuild(slot.build) || treasurePhase > 0)) {
          try {
            attackOverride = computeCombatAttack(character, growth, slot.build, masters, { treasurePhase }).attack;
            buildEffects = resolveBuildEffects(character, slot.build, masters, { treasurePhase }).effects;
          } catch {
            attackOverride = undefined;
            buildEffects = undefined;
          }
        }
        return { character, growth, condition: slot.condition, attackOverride, buildEffects, skills: slotSkills };
      }),
    [team.slots, team.fixedSpec, cache.characters, skillsStatuses, masters],
  );

  const computed = useMemo<Computed>(() => {
    try {
      return {
        ok: true,
        result: computeTeamDamage({
          slots: slotInputs,
          enemy: team.enemy,
          durationSeconds: team.durationSeconds,
          burst: team.burst,
          controlledSlot: team.controlledSlot,
        }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [slotInputs, team.enemy, team.durationSeconds, team.burst, team.controlledSlot]);

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
            buildNotes = resolveBuildEffects(character, slot.build, masters, { treasurePhase }).notes.filter(
              (n) => n.level === 'unsupported',
            );
          } catch {
            buildNotes = [];
          }
        }
        return {
          index: i,
          character,
          skills: skillsStatuses[i] ?? { kind: 'loading' },
          treasurePhase,
          modelNotes: computed.ok ? (computed.result.slots[i]?.notes ?? []) : [],
          buildNotes,
        };
      }),
    [team.slots, team.fixedSpec, cache.characters, skillsStatuses, masters, computed],
  );

  const slotNames = team.slots.map((s) =>
    s.resourceId === null ? undefined : cache.characters.get(s.resourceId)?.name.ja,
  );

  return (
    <main className="app">
      <header>
        <h1>NIKKE ダメージ計算（calc）</h1>
        <p>
          ソロレイド / ユニオンレイド（単体ボス・180 秒）向けに、5
          人編成の総ダメージの期待値を出します。通常攻撃・スキルのバフ・ ゲージと CT
          で回るフルバースト・バーストスキル・倍率ダメージ・育成（装備・OL・キューブ・好感度・コレクション）を含みます。
          確かめたのはユニオン射撃場の録画だけで、実戦とは未照合です（下の「未対応・近似・仮定の一覧」）。
        </p>
      </header>
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {index && (
        <>
          <TeamSettingsForm
            enemy={team.enemy}
            enemyPresets={enemyPresets}
            durationSeconds={team.durationSeconds}
            fixedSpec={team.fixedSpec}
            burst={team.burst}
            controlledSlot={team.controlledSlot}
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
                  character={character}
                  loading={slot.resourceId !== null && character === undefined && !cache.errors.has(slot.resourceId)}
                  error={slot.resourceId === null ? undefined : cache.errors.get(slot.resourceId)}
                  fixedSpec={team.fixedSpec}
                  effectiveGrowth={input?.growth ?? slot.growth}
                  effectiveBuild={character ? effectiveBuild(slot, team.fixedSpec, character) : slot.build}
                  masters={masters}
                  mastersError={mastersError}
                  effectiveSkillLevels={effectiveSkillLevels(slot, team.fixedSpec)}
                  skillsStatus={skillsStatuses[i] ?? { kind: 'loading' }}
                  slotNames={slotNames}
                  slotResult={computed.ok ? (computed.result.slots[i] ?? null) : null}
                  dispatch={dispatch}
                />
              );
            })}
          </section>
          {computed.ok ? (
            <TeamBreakdown
              result={computed.result}
              loadingCount={loadingCount}
              skillsLoadingCount={skillsLoadingCount}
              fixedSpec={team.fixedSpec}
            />
          ) : (
            <p className="error">{computed.error}</p>
          )}
          <NotesSummary slots={summarySlots} />
          <DataPanel team={team} index={index} dispatch={dispatch} />
        </>
      )}
    </main>
  );
}
