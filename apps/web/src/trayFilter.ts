// ニケ一覧の「絞り込み」の窓の状態と、合うニケ（plan/design-character-filter.md 4 節）。文字の検索とバースト CT。
// 項目どうしは AND、バースト CT は押した値のどれか（OR）。ニケ一覧の上のバッジ・宝物・お気に入りとも AND（CharacterTray）。保存しない
import {
  matchesSearchTerms,
  normalizeSearchText,
  searchTerms,
  type CharacterIndexEntry,
  type FilterTable,
} from '@nikke/core';

export type TrayFilter = {
  /** 名前の検索（日本語名・英語名） */
  name: string;
  /** スキル名・説明文の検索 */
  skill: string;
  /** バースト CT（秒）。押した値のどれか */
  burstCooldowns: readonly number[];
};

export const EMPTY_TRAY_FILTER: TrayFilter = { name: '', skill: '', burstCooldowns: [] };

/** 表（filter.json）を要る絞り込みをしているか（スキルの検索・バースト CT） */
export function needsFilterTable(filter: TrayFilter): boolean {
  return searchTerms(filter.skill).length > 0 || filter.burstCooldowns.length > 0;
}

export function trayFilterActive(filter: TrayFilter): boolean {
  return searchTerms(filter.name).length > 0 || needsFilterTable(filter);
}

/** 表にあるバースト CT の値（小さい順） */
export function burstCooldownValues(table: FilterTable): number[] {
  return [...new Set(Object.values(table.characters).map((c) => c.burstCooldown))].sort((a, b) => a - b);
}

/**
 * 絞り込みに合うニケ（並びは characters のまま）。表を読み終えていない（table が null）間は、表の要る項目では絞らない
 */
export function applyTrayFilter(
  characters: readonly CharacterIndexEntry[],
  filter: TrayFilter,
  table: FilterTable | null,
): readonly CharacterIndexEntry[] {
  if (!trayFilterActive(filter)) return characters;
  const nameTerms = searchTerms(filter.name);
  const skillTerms = table === null ? [] : searchTerms(filter.skill);
  const cooldowns = table === null ? [] : filter.burstCooldowns;
  return characters.filter((c) => {
    if (nameTerms.length > 0 && !matchesSearchTerms(normalizeSearchText(`${c.name.ja} ${c.name.en}`), nameTerms))
      return false;
    if (table === null) return true;
    const entry = table.characters[String(c.resourceId)];
    // 表に無いニケ（データの取り込みの直後に表だけ古いとき）は、表の要る項目で絞っている間は出さない
    if (entry === undefined) return skillTerms.length === 0 && cooldowns.length === 0;
    if (skillTerms.length > 0 && !matchesSearchTerms(entry.skillText, skillTerms)) return false;
    if (cooldowns.length > 0 && !cooldowns.includes(entry.burstCooldown)) return false;
    return true;
  });
}
