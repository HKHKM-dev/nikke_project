// 育成状況の読み込み・書き出し・消す（roster.ts。plan/design-combat-power-sort.md 5 節）と、ブラウザへの保存
import { readBuildSnapshot, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
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

export type RosterControls = {
  roster: BuildSnapshot | null;
  message: RosterMessage | null;
  importFile: (file: File) => Promise<void>;
  exportFile: () => void;
  clear: () => void;
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
  // 保存してある JSON。育成状況はキャラの一覧を読んでから、それで検査して読む
  const [saved, setSaved] = useState(() => readStorage(ROSTER_STORAGE_KEY));
  const roster = useMemo(() => (index === null ? null : restoreRoster(saved, index)), [saved, index]);
  const [message, setMessage] = useState<RosterMessage | null>(null);

  const dispatchWithRoster = useCallback(
    (action: TeamAction) => dispatch(withRosterFields(action, roster)),
    [dispatch, roster],
  );

  const importFile = async (file: File) => {
    if (index === null) return;
    const read = readBuildSnapshot(await file.text(), index);
    if (!read.ok) {
      setMessage({ kind: 'error', lines: read.errors });
      return;
    }
    if (!window.confirm(importConfirmText(rosterSlotCount(team, parties, read.snapshot)))) return;
    const json = serializeRoster(read.snapshot);
    writeStorage(ROSTER_STORAGE_KEY, json);
    setSaved(json);
    const next = applyRoster(team, parties, read.snapshot);
    dispatch({ type: 'replace', state: next.team });
    setParties(next.parties);
    setMessage({ kind: 'ok', lines: importSummary(read.snapshot, read.notices) });
  };

  const exportFile = () => {
    if (roster !== null) download(rosterFileName(roster), serializeRoster(roster));
  };

  const clear = () => {
    if (!window.confirm('育成状況を消します（スロットの育成はそのまま）。')) return;
    removeStorage(ROSTER_STORAGE_KEY);
    setSaved(null);
    setMessage(null);
  };

  return { controls: { roster, message, importFile, exportFile, clear }, dispatchWithRoster };
}
