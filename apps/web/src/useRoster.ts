// 育成状況の読み込み・書き出し・消す（roster.ts。plan/design-combat-power-sort.md 5 節）と編集（rosterEdits.ts。
// plan/design-roster-edit.md 5 節）、ブラウザへの保存
import { readBuildSnapshot, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import { downloadText } from './download.ts';
import type { PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
  applyRosterAccount,
  applyRosterSlots,
  clearConfirmText,
  clearRosterFromTeam,
  importSummary,
  restoreRoster,
  revertAllConfirmText,
  rosterFileName,
  rosterFileText,
  rosterSlotCount,
  serializeRoster,
  withRosterFields,
} from './roster.ts';
import {
  ROSTER_EDITS_STORAGE_KEY,
  accountEdited,
  editedCharacterIds,
  editedRoster,
  parseRosterEdits,
  withAccountEdit,
  withCharacterEdit,
  type RosterAccount,
  type RosterCharacterEdit,
  type RosterEdits,
} from './rosterEdits.ts';
import { readStorage, removeStorage, writeStorage } from './storage.ts';
import type { TeamAction, TeamState } from './team.ts';

/** 設定のメニューに出す結果。error は読み込めなかった理由 */
export type RosterMessage = { kind: 'ok' | 'error'; lines: string[] };

/**
 * 育成状況の編集（編集画面が使う）。どの操作も、すぐ保存して、スロット・共通育成へ写す。
 * 1 つの操作（イベント）で呼ぶのは 1 回にする: 続けて呼ぶと、2 回目は 1 回目の前の重ねと編成から作るので、1 回目が消える
 */
export type RosterEditor = {
  /** 編集を重ねた育成状況 */
  roster: BuildSnapshot;
  /** 読み込んだ値から変えたニケ */
  editedIds: ReadonlySet<number>;
  /** アカウント全体の値（シンクロ LV・リサイクルルーム）を変えているか */
  accountEdited: boolean;
  /** 直前の編集の問題（保存できなかった・検査を通らず入れなかった）。無ければ null。編集画面に出す */
  problem: string[] | null;
  editCharacter: (resourceId: number, edit: RosterCharacterEdit) => void;
  revertCharacter: (resourceId: number) => void;
  editAccount: (account: RosterAccount) => void;
  revertAccount: () => void;
};

/** 確かめてから行う操作（押す → 確かめの文が出る → 行うかやめる） */
export type ConfirmedAction = {
  /** 確かめの文（確かめを待っていなければ null） */
  prompt: string | null;
  request: () => void;
  confirm: () => void;
  cancel: () => void;
};

export type RosterControls = {
  /** 育成状況（画面で編集した値を重ねたもの） */
  roster: BuildSnapshot | null;
  /** ブラウザに保存した育成状況がある（読めないものも。消せるように） */
  stored: boolean;
  message: RosterMessage | null;
  importFile: (file: File) => Promise<void>;
  exportFile: () => void;
  /**
   * 「消す」。ブラウザの確認の窓（window.confirm）は使わず、欄の中で確かめる（claude.ai のアーティファクトの枠の中では窓を出せず、
   * confirm がすぐ false を返して何も起きない）。読み込むときは確かめない
   */
  clear: ConfirmedAction;
  /** 編集（育成状況が無い・読めない・編集の保存が読めないときは null） */
  editor: RosterEditor | null;
  /** 編集がある（読めないものも。「全部を読み込んだ値に戻す」を押せる） */
  hasEdits: boolean;
  /** 「全部を読み込んだ値に戻す」: 編集を全部捨てる */
  revertAll: ConfirmedAction;
};

type Args = {
  index: readonly CharacterIndexEntry[] | null;
  team: TeamState;
  parties: PartiesState;
  dispatch: Dispatch<TeamAction>;
  setParties: (parties: PartiesState) => void;
};

/** 編集をブラウザに保存できなかったときの知らせ */
const SAVE_FAILED = 'この編集をブラウザに保存できなかった（再読み込みすると、保存できた所まで戻る）';

/** 育成状況と、キャラをスロットに入れたときに育成状況の育成を写す dispatch */
export function useRoster({ index, team, parties, dispatch, setParties }: Args): {
  controls: RosterControls;
  dispatchWithRoster: Dispatch<TeamAction>;
} {
  // 保存してある JSON（読み込んだファイルのまま）。育成状況はキャラの一覧を読んでから、それで検査して読む
  const [saved, setSaved] = useState(() => readStorage(ROSTER_STORAGE_KEY));
  const restored = useMemo(() => (index === null ? null : restoreRoster(saved, index)), [saved, index]);
  /** 読み込んだ値（編集を重ねる前） */
  const baseline = restored?.ok ? restored.snapshot : null;
  // 保存してある編集の重ね（JSON の文）。画面が使う育成状況は、読み込んだ JSON にこれを当てて検査したもの
  const [editsJson, setEditsJson] = useState(() => readStorage(ROSTER_EDITS_STORAGE_KEY));
  const editsRead = useMemo(() => parseRosterEdits(editsJson), [editsJson]);
  const edits = editsRead.ok ? editsRead.edits : null;
  const edited = useMemo(
    () =>
      index === null || saved === null || baseline === null || edits === null
        ? null
        : editedRoster(saved, edits, index),
    [index, saved, baseline, edits],
  );
  /** 編集が読めない理由（形が合わない・当てた結果が検査を通らない）。読めていれば null */
  const editsErrors = !editsRead.ok ? [editsRead.error] : edited?.read.ok === false ? edited.read.errors : null;
  const roster = edited?.read.ok ? edited.read.snapshot : baseline;

  const [message, setMessage] = useState<RosterMessage | null>(null);
  const [editProblem, setEditProblem] = useState<string[] | null>(null);
  // 確かめを待っている操作（1 度に 1 つ）。文は描くたびにいまの編成で作る（確かめの間に編成を変えても、戻すスロットの数と合う）
  const [pending, setPending] = useState<'clear' | 'revertAll' | null>(null);
  // 読めない保存は消さずに理由を出す
  const restoreError: RosterMessage | null =
    restored?.ok === false
      ? { kind: 'error', lines: ['ブラウザに保存した育成状況（読み込み直すか消す）', ...restored.errors] }
      : editsErrors !== null && baseline !== null
        ? {
            kind: 'error',
            lines: ['ブラウザに保存した育成状況の編集（「全部を読み込んだ値に戻す」で捨てる）', ...editsErrors],
          }
        : null;

  const dispatchWithRoster = useCallback(
    (action: TeamAction) => dispatch(withRosterFields(action, roster)),
    [dispatch, roster],
  );

  const replaceTeam = (next: { team: TeamState; parties: PartiesState }) => {
    dispatch({ type: 'replace', state: next.team });
    setParties(next.parties);
  };

  /** 重ねを保存する（null はキーごと消す）。書けたか */
  const saveEdits = (json: string | null): boolean => {
    setEditsJson(json);
    if (json !== null) return writeStorage(ROSTER_EDITS_STORAGE_KEY, json);
    removeStorage(ROSTER_EDITS_STORAGE_KEY);
    return true;
  };

  const dropEdits = () => {
    saveEdits(null);
    setEditProblem(null);
    setPending(null);
  };

  const importFile = async (file: File) => {
    if (index === null) return;
    const text = await file.text();
    const read = readBuildSnapshot(text, index);
    if (!read.ok) {
      setMessage({ kind: 'error', lines: read.errors });
      return;
    }
    // 確かめずにすぐ写す（オーナーの指示。編集があっても確かめず、編集は捨てる）。検査を通った元の文を保存する
    // （read.snapshot はキャラのデータに無いキャラを飛ばしている）
    writeStorage(ROSTER_STORAGE_KEY, text);
    setSaved(text);
    dropEdits();
    replaceTeam(applyRoster(team, parties, read.snapshot));
    const lines = importSummary(read.snapshot, read.notices);
    setMessage(lines.length > 0 ? { kind: 'ok', lines } : null);
  };

  const exportFile = () => {
    if (roster === null || saved === null) return;
    // 編集があれば、編集を重ねた JSON（editedAt つき）を書く。無ければ読み込んだファイルのまま
    const text = edited?.read.ok ? rosterFileText(edited.raw) : serializeRoster(saved);
    downloadText(rosterFileName(roster), text);
  };

  const confirmClear = () => {
    // 育成状況から写したもの（シンクロ LV・コンソール・スロットの育成）も既定に戻す
    replaceTeam(clearRosterFromTeam(team, parties, roster));
    removeStorage(ROSTER_STORAGE_KEY);
    setSaved(null);
    dropEdits();
    setMessage(null);
  };

  const confirmRevertAll = () => {
    dropEdits();
    setMessage(null);
    if (baseline !== null) replaceTeam(applyRoster(team, parties, baseline));
  };

  /**
   * 重ねを change の返すものにして保存し、できた育成状況を copy でスロット・共通育成へ写す。当てた結果が検査を通らない重ねは
   * 入れない（欄は範囲の中の値しか出さないので、ふつうは起きない）
   */
  const commit = (
    change: (edits: RosterEdits | null, baseline: BuildSnapshot, now: string) => RosterEdits | null,
    copy: (roster: BuildSnapshot) => { team: TeamState; parties: PartiesState },
  ) => {
    if (index === null || saved === null || baseline === null) return;
    const next = change(edits, baseline, new Date().toISOString());
    const read = next === null ? null : editedRoster(saved, next, index).read;
    if (read?.ok === false) {
      setEditProblem(['この編集は入れられない', ...read.errors]);
      return;
    }
    const written = saveEdits(next && JSON.stringify(next));
    setEditProblem(written ? null : [SAVE_FAILED]);
    setMessage(null);
    replaceTeam(copy(read?.snapshot ?? baseline));
  };

  const editCharacter = (resourceId: number, edit: RosterCharacterEdit | null) =>
    commit(
      (current, base, now) => withCharacterEdit(current, base, resourceId, edit, now),
      (r) => applyRosterSlots(team, parties, r, resourceId),
    );
  const editAccount = (account: RosterAccount | null) =>
    commit(
      (current, base, now) => withAccountEdit(current, base, account, now),
      (r) => ({ team: applyRosterAccount(team, r), parties }),
    );

  const editor: RosterEditor | null =
    roster === null || editsErrors !== null
      ? null
      : {
          roster,
          editedIds: editedCharacterIds(edits),
          accountEdited: accountEdited(edits),
          problem: editProblem,
          editCharacter,
          revertCharacter: (resourceId) => editCharacter(resourceId, null),
          editAccount,
          revertAccount: () => editAccount(null),
        };

  /** 確かめてから行う操作（確かめの文は、待っているときだけ作る） */
  const confirmed = (action: 'clear' | 'revertAll', prompt: () => string, confirm: () => void): ConfirmedAction => ({
    prompt: pending === action ? prompt() : null,
    request: () => {
      setMessage(null);
      setPending(action);
    },
    confirm,
    cancel: () => setPending(null),
  });

  return {
    controls: {
      roster,
      stored: saved !== null,
      message: message ?? restoreError,
      importFile,
      exportFile,
      clear: confirmed(
        'clear',
        () => clearConfirmText(roster === null ? 0 : rosterSlotCount(team, parties, roster), editsJson !== null),
        confirmClear,
      ),
      editor,
      // 育成状況が無い・読めないときは、戻す先が無い（読み込み直すか消すと、編集も消える）
      hasEdits: editsJson !== null && baseline !== null,
      revertAll: confirmed(
        'revertAll',
        // 編集が読めないとき（editor が無い）は、何を編集したか分からない
        () => revertAllConfirmText(editor && { count: editor.editedIds.size, account: editor.accountEdited }),
        confirmRevertAll,
      ),
    },
    dispatchWithRoster,
  };
}
