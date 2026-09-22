import {
  computeFixedSpecAttack,
  computeTeamDamage,
  fixedSpecGrowth,
  growthLimits,
  loadCharacterIndex,
  type CharacterData,
  type CharacterIndexEntry,
  type GrowthInput,
  type TeamResult,
  type TeamSlotInput,
} from '@nikke/core';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { SlotCard } from './components/SlotCard.tsx';
import { TeamBreakdown } from './components/TeamBreakdown.tsx';
import { TeamSettingsForm } from './components/TeamSettingsForm.tsx';
import {
  INITIAL_TEAM_STATE,
  STORAGE_KEY,
  effectiveSkillLevels,
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
        const slotSkills = toSlotSkills(status, effectiveSkillLevels(slot, team.fixedSpec));
        return team.fixedSpec
          ? {
              character,
              growth: fixedSpecGrowth(character),
              condition: slot.condition,
              attackOverride: computeFixedSpecAttack(character).attack,
              skills: slotSkills,
            }
          : { character, growth: clampGrowth(character, slot.growth), condition: slot.condition, skills: slotSkills };
      }),
    [team.slots, team.fixedSpec, cache.characters, skillsStatuses],
  );

  const computed = useMemo<Computed>(() => {
    try {
      return {
        ok: true,
        result: computeTeamDamage({ slots: slotInputs, enemy: team.enemy, durationSeconds: team.durationSeconds }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [slotInputs, team.enemy, team.durationSeconds]);

  const loadingCount = team.slots.filter(
    (s) => s.resourceId !== null && !cache.characters.has(s.resourceId) && !cache.errors.has(s.resourceId),
  ).length;
  const skillsLoadingCount = skillsStatuses.filter((s) => s?.kind === 'loading').length;

  const slotNames = team.slots.map((s) =>
    s.resourceId === null ? undefined : cache.characters.get(s.resourceId)?.name.ja,
  );

  return (
    <main className="app">
      <header>
        <h1>NIKKE calc v3</h1>
        <p>5 人編成の通常攻撃 + 常時発動パッシブ（Stage 4）</p>
      </header>
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {index && (
        <>
          <TeamSettingsForm
            enemy={team.enemy}
            durationSeconds={team.durationSeconds}
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
                  character={character}
                  loading={slot.resourceId !== null && character === undefined && !cache.errors.has(slot.resourceId)}
                  error={slot.resourceId === null ? undefined : cache.errors.get(slot.resourceId)}
                  fixedSpec={team.fixedSpec}
                  effectiveGrowth={input?.growth ?? slot.growth}
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
        </>
      )}
    </main>
  );
}
