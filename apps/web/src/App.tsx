import {
  loadBuildMasters,
  loadCharacterIndex,
  loadEnemyPresets,
  type BuildMasters,
  type CharacterIndexEntry,
  type EnemyPresetMaster,
} from '@nikke/core';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { buildCalcView } from './calcView.ts';
import { PartyTabs } from './components/PartyTabs.tsx';
import { NotesSummary, type NotesSummarySlot } from './components/NotesSummary.tsx';
import { SettingsMenu } from './components/SettingsMenu.tsx';
import { SlotCard } from './components/SlotCard.tsx';
import { TeamBreakdown } from './components/TeamBreakdown.tsx';
import { TeamSettingsForm } from './components/TeamSettingsForm.tsx';
import {
  INITIAL_TEAM_STATE,
  STORAGE_KEY,
  parseTeamState,
  serializeTeamState,
  takenResourceIds,
  teamReducer,
} from './team.ts';
import { useCharacterCache } from './useCharacterCache.ts';
import { useDetailed } from './detailed.ts';
import { readStorage, writeStorage } from './storage.ts';
import {
  INITIAL_PARTIES,
  PARTIES_STORAGE_KEY,
  parseParties,
  serializeParties,
  switchParty,
  type PartiesState,
} from './parties.ts';
import { slotSkillsStatus, useSkillDefinitions } from './useSkillDefinitions.ts';
import { useTeamComputation } from './useTeamComputation.ts';

const BASE_URL = import.meta.env.BASE_URL;

export function App() {
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, dispatch] = useReducer(teamReducer, INITIAL_TEAM_STATE);
  const [detailed, setDetailed] = useDetailed();
  // ソロレイド用の編成 01〜05（parties.ts）。選んでいる編成の中身は team
  const [parties, setParties] = useState<PartiesState>(INITIAL_PARTIES);
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
        const saved = parseTeamState(readStorage(STORAGE_KEY), i.characters);
        if (saved) dispatch({ type: 'replace', state: saved });
        const savedParties = parseParties(readStorage(PARTIES_STORAGE_KEY), i.characters);
        if (savedParties) setParties(savedParties);
        setRestored(true);
      })
      .catch((e: unknown) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeStorage(STORAGE_KEY, serializeTeamState(team));
  }, [team, restored]);
  // ほかの編成は切り替えたときだけ変わる（選んでいる編成は上の STORAGE_KEY）
  useEffect(() => {
    if (restored) writeStorage(PARTIES_STORAGE_KEY, serializeParties(parties));
  }, [parties, restored]);

  const selectParty = (to: number) => {
    const next = switchParty(parties, team, to);
    setParties(next.parties);
    dispatch({ type: 'replace', state: next.team });
  };

  const resourceIds = team.slots.map((s) => s.resourceId);
  const cache = useCharacterCache(resourceIds, BASE_URL);
  const skills = useSkillDefinitions(resourceIds, BASE_URL);

  // 枠ごとのスキル定義の状態（未選択は null）
  const skillsStatuses = useMemo(
    () => team.slots.map((slot) => (slot.resourceId === null ? null : slotSkillsStatus(skills, slot.resourceId))),
    [team.slots, skills],
  );

  // 計算の入力と、画面に出す実効値（calcView.ts）。計算と画面の値はこれだけを読み、team は入力欄と dispatch だけが読む
  const calc = useMemo(
    () =>
      buildCalcView(team, {
        characters: cache.characters,
        skillsStatuses,
        masters,
        enemyMaster,
      }),
    [team, cache.characters, skillsStatuses, masters, enemyMaster],
  );
  // 一本化の段 A-2（plan/design-unify-sim-calc.md 5.3 節）: 計算は runSimulation → simTeamResult の 1 本。
  // 2026-10-27 までは calc と sim の切り替え（保存キー nikke-web.model）があり、sim の表示では 1 パス目を 2 回回していた
  // (B) の段 B-2（6.2 節）: 計算は Web Worker で回し、欄の表示は計算を待たない。計算中は前の結果を出したまま印を出し、
  // 古い入力の結果は捨てる（compute.ts の LatestComputeQueue）。B-1 の useDeferredValue では計算がメインスレッドを塞いでいた
  const { computed, computing } = useTeamComputation(calc.input);

  const loadingCount = team.slots.filter(
    (s) => s.resourceId !== null && !cache.characters.has(s.resourceId) && !cache.errors.has(s.resourceId),
  ).length;
  const skillsLoadingCount = skillsStatuses.filter((s) => s?.kind === 'loading').length;

  // Stage 14: 未対応の一覧の材料（育成の注記は calcView が未対応だけにしたもの。スペック固定では効果層が空）
  const summarySlots = useMemo<(NotesSummarySlot | null)[]>(
    () =>
      calc.slots.map((slot, i) =>
        slot.character === undefined
          ? null
          : {
              index: i,
              character: slot.character,
              skills: skillsStatuses[i] ?? { kind: 'loading' },
              treasurePhase: slot.treasurePhase,
              modelNotes: computed?.ok ? (computed.result.slots[i]?.notes ?? []) : [],
              buildNotes: slot.buildNotes,
              noFire: slot.noFire,
            },
      ),
    [calc.slots, skillsStatuses, computed],
  );

  return (
    <main className="app">
      <header className="app-header">
        <h1>NIKKE ダメージ計算</h1>
        <SettingsMenu detailed={detailed} onDetailedChange={setDetailed} />
      </header>
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {index && (
        <>
          <TeamSettingsForm
            element={team.enemy.element}
            fixedSpec={team.fixedSpec}
            consoleInput={team.console}
            synchroLevel={team.synchroLevel}
            durationSeconds={team.durationSeconds}
            rangeJump={team.rangeJump}
            dispatch={dispatch}
          />
          <PartyTabs active={parties.active} onSelect={selectParty} />
          <section className="slots" aria-label="編成">
            {team.slots.map((slot, i) => {
              const { character, growth, build, skillLevels, treasurePhase } = calc.slots[i]!;
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
                  effectiveGrowth={growth}
                  effectiveBuild={build}
                  treasurePhase={treasurePhase}
                  masters={masters}
                  mastersError={mastersError}
                  effectiveSkillLevels={skillLevels}
                  slotResult={computed?.ok ? (computed.result.slots[i] ?? null) : null}
                  focused={team.controlledSlot === i}
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
              detailed={detailed}
              fixedSpec={team.fixedSpec}
              slotNames={calc.slots.map((s) => s.character?.name.ja)}
              teamCharacters={calc.slots.map((s) => s.character ?? null)}
              enemyElement={team.enemy.element}
              effectiveSkillLevels={calc.slots.map((s) => s.skillLevels)}
              treasurePhases={calc.slots.map((s) => s.treasurePhase)}
              skillsStatuses={skillsStatuses}
              hpRatios={calc.slots.map((s) => s.hpRatio)}
            />
          ) : (
            <p className="error">
              {computed.error}
              {computing && '（計算中…）'}
            </p>
          )}
          <NotesSummary slots={summarySlots} enemyNotes={computed?.ok ? computed.result.enemyNotes : []} />
        </>
      )}
    </main>
  );
}
