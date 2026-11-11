import {
  loadBuildMasters,
  loadCharacterIndex,
  loadEnemyPresets,
  type BuildMasters,
  type CharacterIndexEntry,
  type EnemyPresetMaster,
} from '@nikke/core';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { ComputeCache } from './compute.ts';
import { buildCalcView, slotResultFor } from './calcView.ts';
import { type NotesSummarySlot } from './components/NotesSummary.tsx';
import { AccountMenu } from './components/AccountMenu.tsx';
import { SettingsMenu } from './components/SettingsMenu.tsx';
import { UnreadableSavesNotice } from './components/UnreadableSavesNotice.tsx';
import { INITIAL_TEAM_STATE, STORAGE_KEY, serializeTeamState, teamReducer } from './team.ts';
import { useCharacterCache } from './useCharacterCache.ts';
import { writeStorage } from './storage.ts';
import {
  INITIAL_PARTIES,
  PARTIES_STORAGE_KEY,
  otherPartyResourceIds,
  serializeParties,
  sharedSettingsOf,
  switchParty,
  type PartiesState,
  type SharedSettings,
} from './parties.ts';
import { partyInputs, partyTotals } from './partyTotals.ts';
import { useBatchComputation } from './useBatchComputation.ts';
import { slotSkillsStatus, unsupportedNoteOf, useSkillDefinitions } from './useSkillDefinitions.ts';
import { orderCharacters } from './listOrder.ts';
import { ListOrderContext, useListOrder } from './useListOrder.ts';
import { useRoster } from './useRoster.ts';
import { useTeamComputation } from './useTeamComputation.ts';
import { useUnreadableSaves } from './useUnreadableSaves.ts';
import { useUiMode } from './uiMode.ts';
import { ClassicView } from './views/ClassicView.tsx';
import { ModernView } from './views/ModernView.tsx';
import type { ViewProps } from './views/ViewProps.ts';

const BASE_URL = import.meta.env.BASE_URL;

export function App() {
  const [uiMode, setUiMode] = useUiMode();
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [team, dispatch] = useReducer(teamReducer, INITIAL_TEAM_STATE);
  // ソロレイド用の編成 01〜05（parties.ts）。選んでいる編成の中身は team
  const [parties, setParties] = useState<PartiesState>(INITIAL_PARTIES);
  // 保存済みの編成を復元し終えるまでは保存しない（初期値で上書きしないため）。読めなかった保存を退避できなかったときも保存しない
  const [restored, setRestored] = useState(false);
  // 読めなかった編成の保存の退避と知らせ（savedTeams.ts。plan/design-unreadable-team-save.md）
  const { controls: unreadableControls, restore } = useUnreadableSaves();
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
    // StrictMode で 2 回走るので、片付けた後の結果は捨てる（読めなかった保存の退避も 1 回だけ）
    let cancelled = false;
    loadCharacterIndex({ baseUrl: BASE_URL })
      .then((i) => {
        if (cancelled) return;
        setIndex(i.characters);
        // 読めなかった保存は、ここで同期して退避してから保存を始める（下の effect が上書きする前に）
        const saved = restore(i.characters);
        if (saved.team) dispatch({ type: 'replace', state: saved.team });
        if (saved.parties) setParties(saved.parties);
        if (saved.unsaved.length === 0) setRestored(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [restore]);

  useEffect(() => {
    if (!restored) return;
    writeStorage(STORAGE_KEY, serializeTeamState(team));
  }, [team, restored]);
  // ほかの編成は切り替えたときだけ変わる（選んでいる編成は上の STORAGE_KEY）
  useEffect(() => {
    if (restored) writeStorage(PARTIES_STORAGE_KEY, serializeParties(parties));
  }, [parties, restored]);

  // 育成状況（roster.ts）。キャラをスロットに入れる操作は、育成状況の育成を写す dispatch を通す
  const { controls: rosterControls, dispatchWithRoster } = useRoster({ index, team, parties, dispatch, setParties });
  // 一覧の並び（listOrder.ts）。並べたキャラの一覧を画面に渡し、トレイと選択肢はその順のまま出す
  const { controls: listOrderControls, state: listOrder } = useListOrder(
    rosterControls.roster,
    masters,
    BASE_URL,
    team.fixedSpec,
  );
  const orderedIndex = useMemo(
    () => (index === null ? null : orderCharacters(index, listOrder.order, listOrder.values, listOrder.direction)),
    [index, listOrder],
  );

  const selectParty = (to: number) => {
    const next = switchParty(parties, team, to);
    setParties(next.parties);
    dispatch({ type: 'replace', state: next.team });
  };

  // ほかの編成のキャラも読む（全編成の合計ダメージ）
  const resourceIds = useMemo(
    () => [...team.slots, ...parties.parties.flatMap((p) => p?.slots ?? [])].map((s) => s.resourceId),
    [team.slots, parties],
  );
  const cache = useCharacterCache(resourceIds, BASE_URL);
  const skills = useSkillDefinitions(resourceIds, BASE_URL);
  const unsupportedNote = useCallback((resourceId: number) => unsupportedNoteOf(skills, resourceId), [skills]);

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
  // 古い入力の結果は捨てる（compute.ts の LatestComputeQueue）。B-1 の useDeferredValue では計算がメインスレッドを塞いでいた。
  // 結果はその計算の元（shown.source）と組で届く。結果の詳細はその元から読み、スロットの欄は slotResultFor で合わせる
  // 計算の結果を入力ごとに覚える（compute.ts の ComputeCache）。今の編成と全編成の合計で共有し、編成を切り替えたときや
  // 今の編成だけを変えたときに、中身の変わらない編成を計算し直さない
  const [computeCache] = useState(() => new ComputeCache());
  const { shown, computing } = useTeamComputation(calc, computeCache);
  const slotResults = useMemo(() => calc.slots.map((_, i) => slotResultFor(shown, calc, i)), [calc, shown]);

  // 全編成の合計ダメージ（partyTotals.ts）。ほかの編成は、共通の設定かほかの編成の中身が変わったときだけ計算し直す
  // （共通の設定は文字列にして比べ、選んでいる編成のスロットを変えても作り直さない）
  const sharedJson = JSON.stringify(sharedSettingsOf(team));
  const allPartyInputs = useMemo(
    () =>
      partyInputs(parties, JSON.parse(sharedJson) as SharedSettings, {
        characters: cache.characters,
        characterErrors: cache.errors,
        skills,
        masters,
        enemyMaster,
      }),
    [parties, sharedJson, cache.characters, cache.errors, skills, masters, enemyMaster],
  );
  const batchInputs = useMemo(() => allPartyInputs.map((p) => (p.kind === 'ready' ? p.input : null)), [allPartyInputs]);
  const batch = useBatchComputation(batchInputs, computeCache);
  const totals = partyTotals(allPartyInputs, { computed: shown?.computed ?? null, computing }, batch);
  const totalsPending =
    computing || batch.computing || shown === null || allPartyInputs.some((p) => p.kind === 'loading');

  // Stage 14: 未対応の一覧の材料（育成の注記は calcView が未対応だけにしたもの。スペック固定では効果層が空）
  const summarySlots = useMemo<(NotesSummarySlot | null)[]>(
    () =>
      calc.slots.map((slot, i) =>
        slot.character === undefined
          ? null
          : {
              index: i,
              character: slot.character,
              skills: slot.skillsStatus ?? { kind: 'loading' },
              treasurePhase: slot.treasurePhase,
              modelNotes: slotResults[i]?.result.notes ?? [],
              buildNotes: slot.buildNotes,
            },
      ),
    [calc.slots, slotResults],
  );

  const otherPartyIds = useMemo(() => otherPartyResourceIds(parties), [parties]);

  const viewProps: ViewProps | null = orderedIndex
    ? {
        team,
        dispatch: dispatchWithRoster,
        index: orderedIndex,
        characterCache: cache,
        fullySupported: skills.fullySupported,
        unsupportedNote,
        masters,
        mastersError,
        calc,
        shown,
        slotResults,
        parties,
        otherPartyIds,
        selectParty,
        totals,
        totalsPending,
        summarySlots,
        roster: rosterControls.roster,
        listOrder: listOrderControls,
      }
    : null;

  return (
    <main className="app">
      <header className="app-header">
        <h1>NIKKE ダメージ計算</h1>
        <div className="app-header-actions">
          <AccountMenu roster={rosterControls} />
          <SettingsMenu uiMode={uiMode} onSelectUiMode={setUiMode} />
        </div>
      </header>
      <UnreadableSavesNotice {...unreadableControls} />
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {viewProps && (
        <ListOrderContext value={listOrder}>
          {uiMode === 'modern' ? <ModernView {...viewProps} /> : <ClassicView {...viewProps} />}
        </ListOrderContext>
      )}
    </main>
  );
}
