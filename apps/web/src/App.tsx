import { useCallback, useMemo, useReducer, useState } from 'react';
import { ComputeCache } from './compute.ts';
import { buildCalcView, notesSummarySlots, slotResultFor } from './calcView.ts';
import { AccountMenu } from './components/AccountMenu.tsx';
import { BadgeSprite } from './components/modern/BadgeIcon.tsx';
import { RosterEditModal } from './components/RosterEditModal.tsx';
import { SettingsMenu } from './components/SettingsMenu.tsx';
import { UnreadableSavesNotice } from './components/UnreadableSavesNotice.tsx';
import { INITIAL_TEAM_STATE, teamReducer } from './team.ts';
import { useCharacterCache } from './useCharacterCache.ts';
import { INITIAL_PARTIES, otherPartyResourceIds, switchParty, type PartiesState } from './parties.ts';
import { slotSkillsStatus, unsupportedNoteOf, useSkillDefinitions } from './useSkillDefinitions.ts';
import { orderCharacters } from './listOrder.ts';
import { ListOrderContext, useListOrder } from './useListOrder.ts';
import { useMasters } from './useMasters.ts';
import { usePartyTotals } from './usePartyTotals.ts';
import { useRoster } from './useRoster.ts';
import { useSavedTeam } from './useSavedTeam.ts';
import { useTeamComputation } from './useTeamComputation.ts';
import { useUiMode } from './uiMode.ts';
import { ClassicView } from './views/ClassicView.tsx';
import { ModernView } from './views/ModernView.tsx';
import type { ViewProps } from './views/ViewProps.ts';

const BASE_URL = import.meta.env.BASE_URL;

export function App() {
  const [uiMode, setUiMode] = useUiMode();
  const [team, dispatch] = useReducer(teamReducer, INITIAL_TEAM_STATE);
  // ソロレイド用の編成 01〜05（parties.ts）。選んでいる編成の中身は team
  const [parties, setParties] = useState<PartiesState>(INITIAL_PARTIES);
  // 育成のマスタと敵のプリセット（起動時に 1 回読む）
  const { masters, mastersError, enemyMaster } = useMasters(BASE_URL);
  // キャラ一覧の読み込みと、編成の保存の復元・保存（読めなかった保存の退避と知らせも）
  const { index, loadError, unreadableControls } = useSavedTeam({
    baseUrl: BASE_URL,
    team,
    dispatch,
    parties,
    setParties,
  });

  // 育成状況（roster.ts）。キャラをスロットに入れる操作は、育成状況の育成を写す dispatch を通す
  const { controls: rosterControls, dispatchWithRoster } = useRoster({ index, team, parties, dispatch, setParties });
  // 育成状況の編集画面を開いているか（アカウントのメニューの「編集」。plan/design-roster-edit.md 6 節）
  const [rosterEditing, setRosterEditing] = useState(false);
  const closeRosterEdit = useCallback(() => setRosterEditing(false), []);
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
  // 印の知らせは索引だけで決まる（スロットの定義の読み込みでは作り直さない）
  const { index: skillIndex, fullySupported, supportGaps } = skills;
  const unsupportedNote = useCallback(
    (resourceId: number) => unsupportedNoteOf({ index: skillIndex, fullySupported, supportGaps }, resourceId),
    [skillIndex, fullySupported, supportGaps],
  );

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
  // 計算は Web Worker で回す（plan/design-unify-sim-calc.md 6.2 節）。欄の表示は計算を待たない。計算中は前の結果を出したまま印を出し、
  // 古い入力の結果は捨てる（compute.ts の LatestComputeQueue）。
  // 結果はその計算の元（shown.source）と組で届く。結果の詳細はその元から読み、スロットの欄は slotResultFor で合わせる
  // 計算の結果を入力ごとに覚える（compute.ts の ComputeCache）。今の編成と全編成の合計で共有し、編成を切り替えたときや
  // 今の編成だけを変えたときに、中身の変わらない編成を計算し直さない
  const [computeCache] = useState(() => new ComputeCache());
  const { shown, computing } = useTeamComputation(calc, computeCache);
  const slotResults = useMemo(() => calc.slots.map((_, i) => slotResultFor(shown, calc, i)), [calc, shown]);

  // 全編成の合計ダメージ（usePartyTotals.ts）
  const { totals, totalsPending } = usePartyTotals({
    team,
    parties,
    cache,
    skills,
    masters,
    enemyMaster,
    computeCache,
    shown,
    computing,
  });

  // 未対応の一覧の材料（育成の注記は calcView が未対応だけにしたもの。スペック固定では効果層が空）
  const summarySlots = useMemo(() => notesSummarySlots(calc, slotResults), [calc, slotResults]);

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
      {/* バッジ（BadgeIcon）が <use> で引くスプライト。モダン UI のほか、育成状況の編集画面（クラシックでも開く）が使う */}
      <BadgeSprite />
      <header className="app-header">
        <h1>NIKKE ダメージ計算</h1>
        <div className="app-header-actions">
          <AccountMenu roster={rosterControls} onEditRoster={() => setRosterEditing(true)} />
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
      {rosterEditing && rosterControls.editor !== null && orderedIndex !== null && (
        <RosterEditModal
          editor={rosterControls.editor}
          hasEdits={rosterControls.hasEdits}
          revertAll={rosterControls.revertAll}
          index={orderedIndex}
          masters={masters}
          mastersError={mastersError}
          baseUrl={BASE_URL}
          onClose={closeRosterEdit}
        />
      )}
    </main>
  );
}
