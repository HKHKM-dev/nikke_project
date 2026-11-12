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
  applyRosterCharacter,
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

/** 育成状況の編集（編集画面が使う）。どの操作も、すぐ保存して、スロット・共通育成へ写す */
export type RosterEditor = {
  /** 編集を重ねた育成状況 */
  roster: BuildSnapshot;
  /** 読み込んだ値から変えたニケ */
  editedIds: ReadonlySet<number>;
  /** アカウント全体の値（シンクロ LV・リサイクルルーム）を変えているか */
  accountEdited: boolean;
  /** 直前の編集の問題（保存できなかった・検査を通らず入れなかった）。無ければ null */
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
const SAVE_FAILED = '編集をブラウザに保存できなかった（この画面を閉じると、編集は消える）';

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
  // 確かめを待っているか。文は描くたびにいまの編成で作る（確かめの間に編成を変えても、戻すスロットの数と合う）
  const [clearPending, setClearPending] = useState(false);
  const [revertAllPending, setRevertAllPending] = useState(false);
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

  const dropEdits = () => {
    removeStorage(ROSTER_EDITS_STORAGE_KEY);
    setEditsJson(null);
    setEditProblem(null);
    setRevertAllPending(false);
  };

  const importFile = async (file: File) => {
    if (index === null) return;
    const text = await file.text();
    const read = readBuildSnapshot(text, index);
    if (!read.ok) {
      setMessage({ kind: 'error', lines: read.errors });
      return;
    }
    setClearPending(false);
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
    setClearPending(false);
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
   * 重ねを next にして保存し、できた育成状況を copy でスロット・共通育成へ写す。当てた結果が検査を通らない重ねは入れない
   * （欄は範囲の中の値しか出さないので、ふつうは起きない）
   */
  const commit = (
    next: RosterEdits | null,
    copy: (roster: BuildSnapshot) => { team: TeamState; parties: PartiesState },
  ) => {
    if (index === null || saved === null || baseline === null) return;
    const read = next === null ? null : editedRoster(saved, next, index).read;
    if (read?.ok === false) {
      setEditProblem(['この編集は入れられない', ...read.errors]);
      return;
    }
    const json = next === null ? null : JSON.stringify(next);
    if (json === null) removeStorage(ROSTER_EDITS_STORAGE_KEY);
    const written = json === null || writeStorage(ROSTER_EDITS_STORAGE_KEY, json);
    setEditsJson(json);
    setEditProblem(written ? null : [SAVE_FAILED]);
    setMessage(null);
    replaceTeam(copy(read?.snapshot ?? baseline));
  };

  const now = () => new Date().toISOString();
  const editCharacter = (resourceId: number, edit: RosterCharacterEdit | null) => {
    if (baseline === null) return;
    commit(withCharacterEdit(edits, baseline, resourceId, edit, now()), (r) =>
      applyRosterCharacter(team, parties, r, resourceId),
    );
  };
  const editAccount = (account: RosterAccount | null) => {
    if (baseline === null) return;
    commit(withAccountEdit(edits, baseline, account, now()), (r) => ({ team: applyRosterAccount(team, r), parties }));
  };

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

  return {
    controls: {
      roster,
      stored: saved !== null,
      message: message ?? restoreError ?? (editProblem === null ? null : { kind: 'ok', lines: editProblem }),
      importFile,
      exportFile,
      clear: {
        prompt: clearPending
          ? clearConfirmText(roster === null ? 0 : rosterSlotCount(team, parties, roster), editsJson !== null)
          : null,
        request: () => {
          setMessage(null);
          setRevertAllPending(false);
          setClearPending(true);
        },
        confirm: confirmClear,
        cancel: () => setClearPending(false),
      },
      editor,
      hasEdits: editsJson !== null,
      revertAll: {
        prompt: revertAllPending
          ? revertAllConfirmText(editor === null ? null : editor.editedIds.size, accountEdited(edits))
          : null,
        request: () => {
          setMessage(null);
          setClearPending(false);
          setRevertAllPending(true);
        },
        confirm: confirmRevertAll,
        cancel: () => setRevertAllPending(false),
      },
    },
    dispatchWithRoster,
  };
}
