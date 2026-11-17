// ニケ一覧の「絞り込み」の窓の状態と、合うニケ（plan/design-character-filter.md 4・5 節）。文字の検索・バースト CT・
// スキルの効果・特殊攻撃・特性。項目どうしは AND。バースト CT・特殊攻撃・特性は押したもののどれか（OR）。スキルの効果は、
// 同じ効果の自・味は OR、効果どうしは AND。ニケ一覧の上のバッジ・宝物・お気に入りとも AND（CharacterTray）。保存しない
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
  /** スキルの効果（`${効果の鍵}:${側}`。FilterTableEntry.effects と同じ形） */
  effects: readonly string[];
  /** 特殊攻撃（SPECIAL_ATTACKS の鍵）。押したもののどれか */
  special: readonly string[];
  /** 特性（TRAITS の鍵）。押したもののどれか */
  traits: readonly string[];
};

export const EMPTY_TRAY_FILTER: TrayFilter = {
  name: '',
  skill: '',
  burstCooldowns: [],
  effects: [],
  special: [],
  traits: [],
};

/** 表（filter.json）を要る絞り込みをしているか（名前の検索のほか） */
export function needsFilterTable(filter: TrayFilter): boolean {
  return (
    searchTerms(filter.skill).length > 0 ||
    filter.burstCooldowns.length > 0 ||
    filter.effects.length > 0 ||
    filter.special.length > 0 ||
    filter.traits.length > 0
  );
}

/** 配列に値を足すか外す（窓のボタン） */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** 押した効果を、効果の鍵ごとにまとめる（同じ効果の自・味は OR、効果どうしは AND） */
function effectGroups(tags: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const tag of tags) {
    const key = tag.slice(0, tag.lastIndexOf(':'));
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  return [...groups.values()];
}

/** 表にある効果の項目（`${効果の鍵}:${側}`） */
export function effectTagsInTable(table: FilterTable): Set<string> {
  return new Set(Object.values(table.characters).flatMap((c) => c.effects));
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
  const effects = table === null ? [] : effectGroups(filter.effects);
  const special = table === null ? [] : filter.special;
  const traits = table === null ? [] : filter.traits;
  return characters.filter((c) => {
    if (nameTerms.length > 0 && !matchesSearchTerms(normalizeSearchText(`${c.name.ja} ${c.name.en}`), nameTerms))
      return false;
    if (table === null) return true;
    const entry = table.characters[String(c.resourceId)];
    // 表に無いニケ（データの取り込みの直後に表だけ古いとき）は、表の要る項目で絞っている間は出さない
    if (entry === undefined) return !needsFilterTable(filter);
    if (skillTerms.length > 0 && !matchesSearchTerms(entry.skillText, skillTerms)) return false;
    if (cooldowns.length > 0 && !cooldowns.includes(entry.burstCooldown)) return false;
    if (!effects.every((tags) => tags.some((t) => entry.effects.includes(t)))) return false;
    if (special.length > 0 && !special.some((k) => entry.special.includes(k))) return false;
    if (traits.length > 0 && !traits.some((k) => entry.traits.includes(k))) return false;
    return true;
  });
}
