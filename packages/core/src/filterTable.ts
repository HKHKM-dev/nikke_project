// 絞り込みの表（data/characters/filter.json）: ニケ一覧の「絞り込み」の窓が使う値だけを、全キャラ分 1 つにまとめたもの
// （plan/design-character-filter.md 3 節）。窓を初めて開いたときに 1 回だけ読む。
// 書くのは fetch-data（キャラのデータと一緒に）と scripts/filter-table.ts（手元のキャラのデータから作り直す）。
import { isRecord } from './skills/parse/common.ts';
import { SKILL_SLOTS } from './skills/types.ts';
import type { CharacterData, SkillRaw } from './types.ts';

export const FILTER_TABLE_FILE = 'filter.json';

export type FilterTableEntry = {
  /** バースト CT（秒） */
  burstCooldown: number;
  /** スキル名と説明文（基礎版と宝物版）。説明文の値は最大 Lv の値。normalizeSearchText をかけたもの */
  skillText: string;
};

export type FilterTable = {
  formatVersion: 1;
  /** キーは resourceId */
  characters: Record<string, FilterTableEntry>;
};

/**
 * 検索の文字をそろえる: 全角・半角（NFKC）と大文字・小文字をそろえ、ひらがなをカタカナにし、改行と空白の並びを 1 つの空白にする
 * （「らぴ」で「ラピ」が、「ar」で「AR」が出る）
 */
export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 検索の語（空白で区切る。空の語は捨てる）。語はすべて含むものに絞る */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(' ')
    .filter((t) => t.length > 0);
}

/** text（normalizeSearchText をかけたもの）が、語をすべて含むか */
export function matchesSearchTerms(text: string, terms: readonly string[]): boolean {
  return terms.every((t) => text.includes(t));
}

/** 説明文の書式（色・用語の印）を除き、値の差し込みを最大 Lv の値にする */
function skillDescriptionText(skill: SkillRaw): string {
  return skill.description.ja
    .replace(/<\/?word_group[^>]*>/g, '')
    .replace(/<\/?color[^>]*>/g, '')
    .replace(/\{description_value_(\d+)\}/g, (_, n: string) => skill.values[Number(n) - 1]?.at(-1) ?? '')
    .replace(/｣/g, '」');
}

function skillsOf(c: CharacterData): SkillRaw[] {
  const base = SKILL_SLOTS.map((s) => c.skills[s]);
  return c.treasure === null ? base : [...base, ...SKILL_SLOTS.map((s) => c.treasure!.skills[s])];
}

export function buildFilterTable(characters: readonly CharacterData[]): FilterTable {
  const entries = [...characters]
    .sort((a, b) => a.resourceId - b.resourceId)
    .map((c): [string, FilterTableEntry] => [
      String(c.resourceId),
      {
        burstCooldown: c.burstSkill.cooldownSeconds,
        skillText: normalizeSearchText(
          skillsOf(c)
            .map((s) => `${s.name.ja}\n${skillDescriptionText(s)}`)
            .join('\n'),
        ),
      },
    ]);
  return { formatVersion: 1, characters: Object.fromEntries(entries) };
}

/**
 * 読んだ JSON が、この版の絞り込みの表の形かを確かめる（不正なら Error）。デプロイの直後に古い JS と新しい表が混ざっても、
 * 違う意味の値で絞らず、読めないと知らせる
 */
export function parseFilterTable(raw: unknown): FilterTable {
  if (!isRecord(raw)) throw new Error('絞り込みの表: オブジェクトでない');
  if (raw.formatVersion !== 1)
    throw new Error(`この版の絞り込みの表は読めない（formatVersion ${JSON.stringify(raw.formatVersion) ?? 'なし'}）`);
  const characters = raw.characters;
  if (!isRecord(characters)) throw new Error('絞り込みの表: characters がオブジェクトでない');
  for (const [rid, entry] of Object.entries(characters)) {
    if (!isRecord(entry) || !Number.isFinite(entry.burstCooldown) || typeof entry.skillText !== 'string')
      throw new Error(`絞り込みの表: ${rid} の形が違う`);
  }
  return raw as FilterTable;
}
