// 絞り込みの表（data/characters/filter.json）: ニケ一覧の「絞り込み」の窓が使う値だけを、全キャラ分 1 つにまとめたもの
// （plan/design-character-filter.md 3 節）。窓を初めて開いたときに 1 回だけ読む。
// 表を作るのは filterTableBuild.ts（説明文の効果の分類 skills/catalog.ts を使うので、画面と Worker の読み込みには入れない）。
import { isRecord } from './skills/parse/common.ts';

export const FILTER_TABLE_FILE = 'filter.json';

export type FilterTableEntry = {
  /** バースト CT（秒） */
  burstCooldown: number;
  /** スキル名と説明文（基礎版と宝物版）。説明文の値は最大 Lv の値。normalizeSearchText をかけたもの */
  skillText: string;
  /** スキルの効果（`${効果の鍵}:${側}`。FILTER_EFFECTS。基礎版と宝物版） */
  effects: string[];
  /** 特殊攻撃（SPECIAL_ATTACKS の鍵） */
  special: string[];
  /** 特性（TRAITS の鍵） */
  traits: string[];
};

/** 効果を受ける側: 自分・味方・敵 */
export type FilterSide = 'self' | 'ally' | 'enemy';
export const FILTER_SIDE_LABEL: Record<FilterSide, string> = { self: '自', ally: '味', enemy: '敵' };

/** スキルの効果の項目（窓に出す順）。group は窓の見出し */
export type FilterEffect = { key: string; label: string; group: string };

/**
 * スキルの効果の項目（plan/design-character-filter.md 5 節）。自・味は stat の▲（受けるダメージだけは▼）と、stat でない効果（回復・バリアなど）。
 * 敵は敵へのデバフ。鍵は catalog の stat の canon（まとめるものは STAT_KEY）か、stat でない効果の鍵（KIND_KEY）
 */
export const FILTER_EFFECTS: readonly FilterEffect[] = [
  ...(
    [
      ['attack', '攻撃力'],
      ['attackDamage', '攻撃ダメージ'],
      ['elementDamage', '有利コード'],
      ['chargeDamage', 'チャージダメージ'],
      ['trueDamage', '防御力無視ダメージ'],
      ['pierceDamage', '貫通ダメージ'],
      ['sustainedDamage', '持続ダメージ'],
      ['distributedDamage', '分配ダメージ'],
      ['partsDamage', 'パーツダメージ'],
      ['coreDamage', 'コアダメージ'],
      ['projectileExplosionDamage', '発射体爆発ダメージ'],
      ['normalAttackDamage', '通常攻撃ダメージ'],
      ['burstDamage', 'バーストスキルダメージ'],
      ['sequentialAttackDamage', '順番攻撃ダメージ'],
      ['interruptPartDamage', '阻止部位ダメージ'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: 'ダメージ' })),
  ...(
    [
      ['critRate', 'クリティカル確率'],
      ['normalCritRate', '通常攻撃のクリティカル確率'],
      ['critDamage', 'クリティカルダメージ'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: 'クリティカル' })),
  ...(
    [
      ['maxAmmo', '最大装弾数'],
      ['ammoRefill', '弾丸チャージ'],
      ['reloadSpeed', 'リロード速度'],
      ['chargeSpeed', 'チャージ速度'],
      ['hitRate', '命中率'],
      ['attackSpeed', '攻撃速度'],
      ['spinUp', 'マシンガン立ち上げ速度'],
      ['explosionRange', '爆発範囲'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: '連射と武器' })),
  ...(
    [
      ['heal', 'HP 回復'],
      ['healReceived', '受ける HP 回復量'],
      ['maxHp', '最大 HP'],
      ['defense', '防御力'],
      ['damageTakenDown', '受けるダメージ▼'],
      ['barrier', 'バリア'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: '回復と耐久' })),
  ...(
    [
      ['burstGaugeSpeed', 'バーストゲージのチャージ速度'],
      ['burstGauge', 'バーストゲージ増加'],
      ['burstCooldown', 'バースト CT 短縮'],
      ['fullBurstExtend', 'フルバースト時間延長'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: 'バースト' })),
  ...(
    [
      ['damageTaken', '受けるダメージ▲'],
      ['defenseDown', '防御力▼'],
      ['attackDown', '攻撃力▼'],
      ['taunt', '挑発'],
      ['stun', 'スタン'],
    ] as const
  ).map(([key, label]) => ({ key, label, group: '敵デバフ' })),
];

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

/** 特殊攻撃（plan/design-character-filter.md 5 節） */
export const SPECIAL_ATTACKS = [
  { key: 'pierce', label: '貫通' },
  { key: 'dot', label: '持続' },
  { key: 'distributed', label: '分配' },
  { key: 'true', label: '防御力無視' },
  { key: 'sequential', label: '順番に攻撃' },
  { key: 'weaponChange', label: '使用武器変更' },
] as const;

/** 特性。宝ものはニケ一覧の上のバッジの絞り込みにあるので置かない */
export const TRAITS = [
  { key: 'burstReentry', label: 'バースト再突入' },
  { key: 'splitReload', label: '分割リロード' },
] as const;

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
    const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (
      !isRecord(entry) ||
      !Number.isFinite(entry.burstCooldown) ||
      typeof entry.skillText !== 'string' ||
      !strings(entry.effects) ||
      !strings(entry.special) ||
      !strings(entry.traits)
    )
      throw new Error(`絞り込みの表: ${rid} の形が違う`);
  }
  return raw as FilterTable;
}
