// Stage 4: スキル定義（DSL）の型と検証。段階 A は常時発動パッシブ、Stage 5 でバーストスロットの倍率ダメージ（burstDamage）を足した。
// 定義は packages/core/data/skills/{resourceId}.json に手書きし、数値は CharacterData.skills の values を ref で参照する。
import type { LocalizedText } from '../types.ts';

export type SkillSlot = 'skill1' | 'skill2' | 'burst';
export const SKILL_SLOTS = ['skill1', 'skill2', 'burst'] as const satisfies readonly SkillSlot[];

/** 何が上がるか */
export type BuffStat = 'attack' | 'critRate' | 'critDamage' | 'attackDamage' | 'chargeDamage';
export const BUFF_STATS = [
  'attack',
  'critRate',
  'critDamage',
  'attackDamage',
  'chargeDamage',
] as const satisfies readonly BuffStat[];

/** どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算 */
export type BuffScaling = 'ratio' | 'casterAttack';
export const BUFF_SCALINGS = ['ratio', 'casterAttack'] as const satisfies readonly BuffScaling[];

export type BuffTarget = 'self' | 'allies';
export const BUFF_TARGETS = ['self', 'allies'] as const satisfies readonly BuffTarget[];

export type SkillSupport = 'supported' | 'partial' | 'unsupported';
export const SKILL_SUPPORTS = ['supported', 'partial', 'unsupported'] as const satisfies readonly SkillSupport[];

export type PassiveEffect = {
  /** 段階 A はこれだけ。段階 B で 'onFullBurst' 等を足す */
  kind: 'passive';
  target: BuffTarget;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す */
  scaling?: BuffScaling;
  /** description_value_NN の NN（1 始まり）。値は % 表記（"20.1"）。100 で割るのは resolvePassives の責務 */
  ref: number;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/** バーストの倍率ダメージの種別。skill = バーストスキルダメージ / ダメージ / 追加ダメージ（即時 1 ヒット）、distributed = 分配ダメージ（単体ボスでは全額と仮定） */
export type BurstDamageType = 'skill' | 'distributed';
export const BURST_DAMAGE_TYPES = ['skill', 'distributed'] as const satisfies readonly BurstDamageType[];

/** Stage 5: 「最終攻撃力の X％の（バーストスキル）ダメージ」。burst スロットにだけ書ける */
export type BurstDamageEffect = {
  kind: 'burstDamage';
  /** description_value_NN の NN（1 始まり）。値は % 表記（"351.64"）。100 で割るのは resolveBurstDamage の責務 */
  ref: number;
  damageType: BurstDamageType;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

export type SkillEffect = PassiveEffect | BurstDamageEffect;

export type SkillEntry = {
  /** そのスキルの効果のうち扱えたもの: すべて / 一部 / ゼロ */
  support: SkillSupport;
  effects: SkillEffect[];
  /** 扱わなかった効果の説明（partial / unsupported のとき） */
  notes?: LocalizedText[];
};

export type SkillDefinition = {
  formatVersion: 1;
  resourceId: number;
  /** 説明文を確認した日（YYYY-MM-DD）。データ更新で説明文が変わったときの目印 */
  checkedAt: string;
  skills: Record<SkillSlot, SkillEntry>;
};

/** 定義済みキャラの一覧（data/skills/index.json） */
export type SkillIndex = {
  formatVersion: 1;
  resourceIds: number[];
};

// ---- 検証 ----

type Json = unknown;

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, message: string): never {
  throw new Error(`skill definition: ${path}: ${message}`);
}

function oneOf<T extends string>(allowed: readonly T[], value: Json, path: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  fail(path, `expected one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
}

function parseLocalizedText(v: Json, path: string): LocalizedText {
  if (!isRecord(v) || typeof v.ja !== 'string' || typeof v.en !== 'string') {
    fail(path, 'expected { ja: string, en: string }');
  }
  return { ja: v.ja, en: v.en };
}

function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  if (scaling === 'casterAttack' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterAttack is only allowed with stat "attack", got "${stat}"`);
  }
  const effect: PassiveEffect = { kind: 'passive', target, stat, ref: parseRef(v.ref, `${path}.ref`) };
  if (scaling !== undefined) effect.scaling = scaling;
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstDamageEffect(v: Record<string, Json>, path: string): BurstDamageEffect {
  const damageType = oneOf(BURST_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: BurstDamageEffect = { kind: 'burstDamage', ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseRef(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** passive は skill1 / skill2 にだけ、burstDamage は burst にだけ書ける（バースト使用時のバフは Stage 6 の別 kind） */
function parseEffect(v: Json, path: string, slot: SkillSlot): SkillEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  if (v.kind === 'passive') {
    if (slot === 'burst')
      fail(`${path}.kind`, 'passive effects are not allowed in burst (burst-time buffs are Stage 6)');
    return parsePassiveEffect(v, path);
  }
  if (v.kind === 'burstDamage') {
    if (slot !== 'burst') fail(`${path}.kind`, `burstDamage is only allowed in burst, found in ${slot}`);
    return parseBurstDamageEffect(v, path);
  }
  fail(`${path}.kind`, `expected "passive" or "burstDamage", got ${JSON.stringify(v.kind)}`);
}

function parseEntry(v: Json, slot: SkillSlot): SkillEntry {
  const path = `skills.${slot}`;
  if (!isRecord(v)) fail(path, 'expected an object');
  const support = oneOf(SKILL_SUPPORTS, v.support, `${path}.support`);
  if (!Array.isArray(v.effects)) fail(`${path}.effects`, 'expected an array');
  const effects = v.effects.map((e, i) => parseEffect(e, `${path}.effects[${i}]`, slot));
  if (support === 'unsupported' && effects.length > 0)
    fail(`${path}.effects`, 'unsupported skills must have no effects');
  if (support !== 'unsupported' && effects.length === 0)
    fail(`${path}.effects`, `${support} skills need at least one effect`);
  const entry: SkillEntry = { support, effects };
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes)) fail(`${path}.notes`, 'expected an array');
    entry.notes = v.notes.map((n, i) => parseLocalizedText(n, `${path}.notes[${i}]`));
  }
  return entry;
}

/** JSON.parse 済みの値を検証して SkillDefinition にする。不正なら Error */
export function parseSkillDefinition(raw: Json): SkillDefinition {
  if (!isRecord(raw)) fail('', 'expected an object');
  if (raw.formatVersion !== 1) fail('formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  if (typeof raw.resourceId !== 'number' || !Number.isInteger(raw.resourceId) || raw.resourceId < 1) {
    fail('resourceId', 'expected a positive integer');
  }
  if (typeof raw.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.checkedAt)) {
    fail('checkedAt', 'expected a YYYY-MM-DD string');
  }
  if (!isRecord(raw.skills)) fail('skills', 'expected an object');
  for (const key of Object.keys(raw.skills)) {
    if (!(SKILL_SLOTS as readonly string[]).includes(key)) fail(`skills.${key}`, 'unknown skill slot');
  }
  const skills = {} as Record<SkillSlot, SkillEntry>;
  for (const slot of SKILL_SLOTS) skills[slot] = parseEntry(raw.skills[slot], slot);
  return { formatVersion: 1, resourceId: raw.resourceId, checkedAt: raw.checkedAt, skills };
}

export function parseSkillIndex(raw: Json): SkillIndex {
  if (!isRecord(raw)) fail('index', 'expected an object');
  if (raw.formatVersion !== 1) fail('index.formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  if (!Array.isArray(raw.resourceIds) || !raw.resourceIds.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    fail('index.resourceIds', 'expected an array of positive integers');
  }
  return { formatVersion: 1, resourceIds: raw.resourceIds as number[] };
}
