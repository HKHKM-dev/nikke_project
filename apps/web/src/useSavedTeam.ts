// キャラ一覧の読み込みと、保存した編成（選んでいる編成と、ソロレイド用の編成 01〜05）の復元・保存。読めなかった保存の退避と知らせ
// （savedTeams.ts。plan/design-unreadable-team-save.md）もここで回す
import { loadCharacterIndex, type CharacterIndexEntry } from '@nikke/core';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { PARTIES_STORAGE_KEY, serializeParties, withoutCrossPartyDuplicates, type PartiesState } from './parties.ts';
import { writeStorage } from './storage.ts';
import { INITIAL_TEAM_STATE, STORAGE_KEY, serializeTeamState, type TeamAction, type TeamState } from './team.ts';
import { useUnreadableSaves } from './useUnreadableSaves.ts';

type Params = {
  baseUrl: string;
  team: TeamState;
  dispatch: Dispatch<TeamAction>;
  parties: PartiesState;
  /** useState の setter（参照が変わらないものを渡す。読み込みの effect の deps に入る） */
  setParties: Dispatch<SetStateAction<PartiesState>>;
};

export function useSavedTeam({ baseUrl, team, dispatch, parties, setParties }: Params) {
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 保存済みの編成を復元し終えるまでは保存しない（初期値で上書きしないため）。読めなかった保存を退避できなかったときも保存しない
  const [restored, setRestored] = useState(false);
  const { controls: unreadableControls, restore } = useUnreadableSaves();

  useEffect(() => {
    // StrictMode で 2 回走るので、片付けた後の結果は捨てる（読めなかった保存の退避も 1 回だけ）
    let cancelled = false;
    loadCharacterIndex({ baseUrl })
      .then((i) => {
        if (cancelled) return;
        setIndex(i.characters);
        // 読めなかった保存は、ここで同期して退避してから保存を始める（下の effect が上書きする前に）
        const saved = restore(i.characters);
        // 同じニケが 2 つ以上の編成にいたら、番号の小さい編成にだけ残す（parties.ts の withoutCrossPartyDuplicates）
        const next = saved.parties
          ? withoutCrossPartyDuplicates(saved.parties, saved.team ?? INITIAL_TEAM_STATE)
          : { parties: null, team: saved.team };
        if (saved.team && next.team) dispatch({ type: 'replace', state: next.team });
        if (next.parties) setParties(next.parties);
        if (saved.unsaved.length === 0) setRestored(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [restore, baseUrl, dispatch, setParties]);

  useEffect(() => {
    if (!restored) return;
    writeStorage(STORAGE_KEY, serializeTeamState(team));
  }, [team, restored]);
  // ほかの編成は切り替えたときだけ変わる（選んでいる編成は上の STORAGE_KEY）
  useEffect(() => {
    if (restored) writeStorage(PARTIES_STORAGE_KEY, serializeParties(parties));
  }, [parties, restored]);

  return { index, loadError, unreadableControls };
}
