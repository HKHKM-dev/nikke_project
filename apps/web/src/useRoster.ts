// 育成状況の読み込み・書き出し・消す（roster.ts。plan/design-combat-power-sort.md 5 節）と、ブラウザへの保存
import { readBuildSnapshot, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
  clearConfirmText,
  clearRosterFromTeam,
  importSummary,
  restoreRoster,
  rosterFileName,
  rosterSlotCount,
  serializeRoster,
  withRosterFields,
} from './roster.ts';
import { readStorage, removeStorage, writeStorage } from './storage.ts';
import type { TeamAction, TeamState } from './team.ts';

/** 設定のメニューに出す結果。error は読み込めなかった理由 */
export type RosterMessage = { kind: 'ok' | 'error'; lines: string[] };

export type RosterControls = {
  roster: BuildSnapshot | null;
  /** ブラウザに保存した育成状況がある（読めないものも。消せるように） */
  stored: boolean;
  message: RosterMessage | null;
  /**
   * 「消す」の確かめの文（確かめを待っていなければ null）。ブラウザの確認の窓（window.confirm）は使わず、設定の欄の中で確かめる
   * （claude.ai のアーティファクトの枠の中では窓を出せず、confirm がすぐ false を返して何も起きない）。読み込むときは確かめない
   */
  clearPrompt: string | null;
  importFile: (file: File) => Promise<void>;
  exportFile: () => void;
  clear: () => void;
  confirmClear: () => void;
  cancelClear: () => void;
};

type Args = {
  index: readonly CharacterIndexEntry[] | null;
  team: TeamState;
  parties: PartiesState;
  dispatch: Dispatch<TeamAction>;
  setParties: (parties: PartiesState) => void;
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** 育成状況と、キャラをスロットに入れたときに育成状況の育成を写す dispatch */
export function useRoster({ index, team, parties, dispatch, setParties }: Args): {
  controls: RosterControls;
  dispatchWithRoster: Dispatch<TeamAction>;
} {
  // 保存してある JSON（読み込んだファイルのまま）。育成状況はキャラの一覧を読んでから、それで検査して読む
  const [saved, setSaved] = useState(() => readStorage(ROSTER_STORAGE_KEY));
  const restored = useMemo(() => (index === null ? null : restoreRoster(saved, index)), [saved, index]);
  const roster = restored?.ok ? restored.snapshot : null;
  const [message, setMessage] = useState<RosterMessage | null>(null);
  // 「消す」の確かめを待っているか。文は描くたびにいまの編成で作る（確かめの間に編成を変えても、戻すスロットの数と合う）
  const [clearPending, setClearPending] = useState(false);
  // 読めない保存は消さずに理由を出す
  const restoreError: RosterMessage | null =
    restored?.ok === false
      ? { kind: 'error', lines: ['ブラウザに保存した育成状況（読み込み直すか消す）', ...restored.errors] }
      : null;

  const dispatchWithRoster = useCallback(
    (action: TeamAction) => dispatch(withRosterFields(action, roster)),
    [dispatch, roster],
  );

  const importFile = async (file: File) => {
    if (index === null) return;
    const text = await file.text();
    const read = readBuildSnapshot(text, index);
    if (!read.ok) {
      setMessage({ kind: 'error', lines: read.errors });
      return;
    }
    setClearPending(false);
    // 確かめずにすぐ写す（オーナーの指示）。検査を通った元の文を保存する（read.snapshot はキャラのデータに無いキャラを飛ばしている）
    writeStorage(ROSTER_STORAGE_KEY, text);
    setSaved(text);
    const next = applyRoster(team, parties, read.snapshot);
    dispatch({ type: 'replace', state: next.team });
    setParties(next.parties);
    const lines = importSummary(read.snapshot, read.notices);
    setMessage(lines.length > 0 ? { kind: 'ok', lines } : null);
  };

  const exportFile = () => {
    if (roster !== null && saved !== null) download(rosterFileName(roster), serializeRoster(saved));
  };

  const clear = () => {
    setMessage(null);
    setClearPending(true);
  };

  const confirmClear = () => {
    setClearPending(false);
    // 育成状況から写したもの（シンクロ LV・コンソール・スロットの育成）も既定に戻す
    const next = clearRosterFromTeam(team, parties, roster);
    dispatch({ type: 'replace', state: next.team });
    setParties(next.parties);
    removeStorage(ROSTER_STORAGE_KEY);
    setSaved(null);
    setMessage(null);
  };

  return {
    controls: {
      roster,
      stored: saved !== null,
      message: message ?? restoreError,
      clearPrompt: clearPending ? clearConfirmText(roster === null ? 0 : rosterSlotCount(team, parties, roster)) : null,
      importFile,
      exportFile,
      clear,
      confirmClear,
      cancelClear: () => setClearPending(false),
    },
    dispatchWithRoster,
  };
}
