// 起動時の編成の保存の復元と、読めなかった保存の退避（plan/design-unreadable-team-save.md 5 節）。React に依存しない純関数だけを置く。
// 読めなかった保存は、上書きする前に 1 件ずつ別のキーへ元の文字列のまま退避し、退避がある間は画面の上に知らせを出す
// （components/UnreadableSavesNotice.tsx）。退避を書けなかったら、画面は編成を保存しない（App.tsx）
import { jstDateTime, type CharacterIndexEntry } from '@nikke/core';
import { PARTIES_STORAGE_KEY, partyLabel, readParties, type PartiesState } from './parties.ts';
import type { SaveStore } from './storage.ts';
import { STORAGE_KEY, isRecord, readTeamJson, type TeamState } from './team.ts';

/** 退避のキーは `<prefix><種類>.<退避した時刻のミリ秒>`。1 件を 1 つのキーに置く（1 つのキーの一覧だと、壊れたときに足すと消える） */
export const UNREADABLE_KEY_PREFIX = 'nikke-calc.unreadable.';
/** 種類ごとに新しいほうから持つ件数。版の違う画面を行き来すると、編集のたびに文字列が変わって増え続けるため */
export const MAX_UNREADABLE_PER_KIND = 5;

/** 編成（team.ts の STORAGE_KEY）か、保存した編成の一覧（parties.ts） */
export type SaveKind = 'team' | 'parties';
function isSaveKind(v: string): v is SaveKind {
  return v === 'team' || v === 'parties';
}

export type UnreadableEntry = {
  kind: SaveKind;
  /** 元の文字列 */
  raw: string;
  /** 読めない理由 */
  error: string;
  /** 一覧のうち、形が合わず空にした編成の番号（0 から）。一覧の全体が読めないときと編成は無い */
  dropped?: number[];
};

export type UnreadableSave = UnreadableEntry & {
  /** 退避のキー。null は退避を書けなかったもの（メモリにだけある） */
  key: string | null;
  /** 退避した時刻（ミリ秒）。キーから読めなければ null */
  savedAt: number | null;
  /** 退避のキーの中身を読めない（raw はキーの中身のまま） */
  broken?: boolean;
};

function parseEntry(kind: SaveKind, value: string): UnreadableEntry | null {
  let v: unknown;
  try {
    v = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const { raw, error, dropped } = v;
  if (typeof raw !== 'string' || typeof error !== 'string') return null;
  if (dropped === undefined) return { kind, raw, error };
  if (!Array.isArray(dropped) || !dropped.every((i) => Number.isInteger(i) && i >= 0)) return null;
  return { kind, raw, error, dropped: dropped as number[] };
}

/** 退避した保存の全部（古い順）。種類の分からないキーは飛ばす */
export function listUnreadable(store: SaveStore): UnreadableSave[] {
  const saves: UnreadableSave[] = [];
  for (const key of store.keys(UNREADABLE_KEY_PREFIX)) {
    const [kind, time, ...rest] = key.slice(UNREADABLE_KEY_PREFIX.length).split('.');
    if (kind === undefined || !isSaveKind(kind) || rest.length > 0) continue;
    const value = store.read(key);
    if (value === null) continue;
    const ms = Number(time);
    const savedAt = time !== '' && Number.isSafeInteger(ms) ? ms : null;
    const entry = parseEntry(kind, value);
    saves.push(
      entry === null
        ? { kind, raw: value, error: '退避の中身を読めません', key, savedAt, broken: true }
        : { ...entry, key, savedAt },
    );
  }
  return saves.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
}

/**
 * 読めなかった保存を退避する。同じ種類で同じ文字列の退避がもうあれば足さない。種類ごとに MAX_UNREADABLE_PER_KIND 件を超えたら
 * 古いものを消す。書けたか（もうあった場合も true）を返す
 */
export function backupUnreadable(store: SaveStore, entry: UnreadableEntry, now: number): boolean {
  const same = listUnreadable(store).filter((s) => s.kind === entry.kind);
  if (same.some((s) => !s.broken && s.raw === entry.raw)) return true;
  const key = `${UNREADABLE_KEY_PREFIX}${entry.kind}.${now}`;
  const { raw, error, dropped } = entry;
  if (!store.write(key, JSON.stringify({ raw, error, dropped }))) return false;
  for (const old of same.slice(0, Math.max(0, same.length + 1 - MAX_UNREADABLE_PER_KIND))) {
    if (old.key !== null) store.remove(old.key);
  }
  return true;
}

export type RestoredSaves = {
  /** 読めた編成（無い・読めないは null） */
  team: TeamState | null;
  /** 読めた一覧（無い・全体が読めないは null） */
  parties: PartiesState | null;
  /** 読めなかったのに退避を書けなかったもの。1 件でもあれば、画面は編成も一覧も保存しない */
  unsaved: UnreadableSave[];
};

/**
 * 起動時に編成と保存した編成の一覧を読む。読めなかった保存は、上書きされる前に退避する（ここで同期して書く。App.tsx は
 * この後で保存を始める）。キーが無い・ブラウザの保存が使えないときは、読めない保存ではない
 */
export function restoreSaves(store: SaveStore, index: readonly CharacterIndexEntry[], now: number): RestoredSaves {
  const unsaved: UnreadableSave[] = [];
  const keep = (entry: UnreadableEntry) => {
    if (!backupUnreadable(store, entry, now)) unsaved.push({ ...entry, key: null, savedAt: now });
  };

  let team: TeamState | null = null;
  const teamRaw = store.read(STORAGE_KEY);
  if (teamRaw !== null) {
    const read = readTeamJson(teamRaw, index);
    if (read.ok) team = read.value;
    else keep({ kind: 'team', raw: teamRaw, error: read.error });
  }

  let parties: PartiesState | null = null;
  const partiesRaw = store.read(PARTIES_STORAGE_KEY);
  if (partiesRaw !== null) {
    const read = readParties(partiesRaw, index);
    if (!read.ok) keep({ kind: 'parties', raw: partiesRaw, error: read.error });
    else {
      parties = read.value;
      if (read.dropped !== null) {
        keep({ kind: 'parties', raw: partiesRaw, error: read.dropped.error, dropped: read.dropped.indices });
      }
    }
  }
  return { team, parties, unsaved };
}

/** 知らせの文（何を戻したか）。退避した起動にも、その後の起動にも合うよう過去のこととして書く */
export function unreadableMessage(save: UnreadableSave): string {
  const when = save.savedAt === null ? '以前に' : `${jstDateTime(save.savedAt)} に`;
  if (save.broken) return `${when}退避した、読めなかった編成の保存の中身を読めません。`;
  const head = `${when}、ブラウザに保存した`;
  if (save.kind === 'team') {
    return `${head}編成を読めなかったので、選んでいた編成と共通の設定（敵・コンソールなど）を初期値に戻しました。`;
  }
  if (save.dropped === undefined) {
    return `${head}編成の一覧を読めなかったので、選んでいる編成のほかを空にしました。`;
  }
  return `${head}${save.dropped.map(partyLabel).join('・')} を読めなかったので、空にしました。`;
}

/** 書き出すファイルの名前 */
export function unreadableFileName(save: UnreadableSave): string {
  const stamp = save.savedAt === null ? 'unknown' : jstDateTime(save.savedAt).replace(/[-:]/g, '').replace(' ', '-');
  return `nikke-calc-unreadable-${save.kind}-${stamp}.json`;
}
