// 育成状況の読み込み・書き出し・消す（roster.ts。plan/design-combat-power-sort.md 5 節）と、ブラウザへの保存
import { readBuildSnapshot, type BuildSnapshot, type BuildSnapshotRead, type CharacterIndexEntry } from '@nikke/core';
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
  clearConfirmText,
  clearRosterFromTeam,
  importConfirmText,
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

/**
 * 読み込み・消すの前の確かめ。ブラウザの確認の窓（window.confirm）は使わず、設定の欄の中で確かめる
 * （claude.ai のアーティファクトの枠の中では窓を出せず、confirm がすぐ false を返して何も起きない）
 */
export type RosterPending = { kind: 'import' | 'clear'; prompt: string };

export type RosterControls = {
  roster: BuildSnapshot | null;
  /** ブラウザに保存した育成状況がある（読めないものも。消せるように） */
  stored: boolean;
  message: RosterMessage | null;
  /** 確かめを待っている操作（無ければ null） */
  pending: RosterPending | null;
  importFile: (file: File) => Promise<void>;
  exportFile: () => void;
  clear: () => void;
  confirmPending: () => void;
  cancelPending: () => void;
};

type PendingAction =
  | { kind: 'import'; prompt: string; text: string; read: Extract<BuildSnapshotRead, { ok: true }> }
  | { kind: 'clear'; prompt: string };

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
  const [pending, setPending] = useState<PendingAction | null>(null);
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
    setMessage(null);
    setPending({
      kind: 'import',
      prompt: importConfirmText(rosterSlotCount(team, parties, read.snapshot)),
      text,
      read,
    });
  };

  const applyImport = (text: string, read: Extract<BuildSnapshotRead, { ok: true }>) => {
    // 検査を通った元の文を保存する（read.snapshot はキャラのデータに無いキャラを飛ばしている）
    writeStorage(ROSTER_STORAGE_KEY, text);
    setSaved(text);
    const next = applyRoster(team, parties, read.snapshot);
    dispatch({ type: 'replace', state: next.team });
    setParties(next.parties);
    setMessage({ kind: 'ok', lines: importSummary(read.snapshot, read.notices) });
  };

  const exportFile = () => {
    if (roster !== null && saved !== null) download(rosterFileName(roster), serializeRoster(saved));
  };

  const clear = () => {
    setMessage(null);
    setPending({
      kind: 'clear',
      prompt: clearConfirmText(roster === null ? 0 : rosterSlotCount(team, parties, roster)),
    });
  };

  const confirmPending = () => {
    if (pending === null) return;
    setPending(null);
    if (pending.kind === 'import') {
      applyImport(pending.text, pending.read);
      return;
    }
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
      pending: pending && { kind: pending.kind, prompt: pending.prompt },
      importFile,
      exportFile,
      clear,
      confirmPending,
      cancelPending: () => setPending(null),
    },
    dispatchWithRoster,
  };
}
