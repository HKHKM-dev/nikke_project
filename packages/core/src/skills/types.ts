// Stage 4: スキル定義（DSL）の型と検証。段階 A は常時発動パッシブ、Stage 5 でバーストスロットの倍率ダメージ（burstDamage）を足した。
// Stage 6（段階 B）でトリガー付きの持続バフ（timed）を足した。新しい BuffStat は増えず、「いつ付いて、いつ切れるか」だけが増える。
// Stage 8（段階 C）で、射撃の回数・発動の回数で発火するトリガー、バースト N 段階突入時のトリガー、
// バースト以外の倍率ダメージ（damage）、stat の distributedDamage / burstGaugeSpeed を足した（plan/design-stage8.md 2 節）。
// Stage 9 で宝物版の定義（treasureSkills）と、武器種で絞る対象（targetWeapon）を足した（plan/design-stage9.md 2・3 節）。
// 定義は packages/core/data/skills/{resourceId}.json に手書きし、数値は CharacterData.skills の values を ref で参照する。
import type { LocalizedText, SkillSlot, WeaponType } from '../types.ts';
import { WEAPON_TYPES } from '../weapons.ts';

export type { SkillSlot };
export const SKILL_SLOTS = ['skill1', 'skill2', 'burst'] as const satisfies readonly SkillSlot[];

/**
 * 何が上がるか。Stage 8 の 2 つ:
 * distributedDamage = 分配ダメージの乗数 (1 + Σ)。distributed の倍率ダメージにだけ掛かる（録画 21 で別枠の乗数と確認）。
 * burstGaugeSpeed = バーストゲージのチャージ速度 (1 + Σ)。対象の枠の射撃で溜まるゲージに掛かる。passive にだけ書ける
 * （timed に書くと 時刻表 → バフ窓 → ゲージ → 時刻表 と循環するため）。
 */
export type BuffStat =
  'attack' | 'critRate' | 'critDamage' | 'attackDamage' | 'chargeDamage' | 'distributedDamage' | 'burstGaugeSpeed';
export const BUFF_STATS = [
  'attack',
  'critRate',
  'critDamage',
  'attackDamage',
  'chargeDamage',
  'distributedDamage',
  'burstGaugeSpeed',
] as const satisfies readonly BuffStat[];

/** どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算 */
export type BuffScaling = 'ratio' | 'casterAttack';
export const BUFF_SCALINGS = ['ratio', 'casterAttack'] as const satisfies readonly BuffScaling[];

export type BuffTarget = 'self' | 'allies';
export const BUFF_TARGETS = ['self', 'allies'] as const satisfies readonly BuffTarget[];

export type SkillSupport = 'supported' | 'partial' | 'unsupported';
export const SKILL_SUPPORTS = ['supported', 'partial', 'unsupported'] as const satisfies readonly SkillSupport[];

export type PassiveEffect = {
  /** 無条件・常時（段階 A）。トリガー付きの持続バフは 'timed'（段階 B） */
  kind: 'passive';
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が 'allies' のときだけ書ける */
  targetWeapon?: WeaponType;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す */
  scaling?: BuffScaling;
  /** description_value_NN の NN（1 始まり）。値は % 表記（"20.1"）。100 で割るのは resolvePassives の責務 */
  ref: number;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/**
 * Stage 6: 持続バフが付くきっかけ。
 * battleStart = 戦闘開始時（1 回だけ）、burstUse = 自分がバーストスキルを使った時（割当枠のときだけ）、
 * fullBurstStart = フルバーストタイムが発動した時、fullBurstEnd = フルバーストタイムが終了した時。
 * 固定サイクル（Stage 5）では burstUse と fullBurstStart が同じフレームになるが、段階の演出遅延を入れる Stage 7 でずれる。
 * Stage 8: burstStageNEnter = バースト N 段階突入時。1 はゲージ満タン（とリエントリー）、2 / 3 は発動の結果その段階に進んだ時
 * （通常は I / II の発動フレーム）。固定サイクルでは 3 つとも発動フレーム。
 */
export type BuffTrigger =
  | 'battleStart'
  | 'burstUse'
  | 'fullBurstStart'
  | 'fullBurstEnd'
  | 'burstStage1Enter'
  | 'burstStage2Enter'
  | 'burstStage3Enter';
export const BUFF_TRIGGERS = [
  'battleStart',
  'burstUse',
  'fullBurstStart',
  'fullBurstEnd',
  'burstStage1Enter',
  'burstStage2Enter',
  'burstStage3Enter',
] as const satisfies readonly BuffTrigger[];

/**
 * Stage 8: 自分の射撃の回数で発火するトリガー。1 回 = 弾薬を 1 消費する 1 トリガー（SG もペレットではなくトリガー）。
 * 全弾命中の前提なので normalShot と normalHit は同じ列になる。fullChargeShot はチャージ武器の全射撃（常にフルチャージのモデル）。
 * カウンタはリロードでも戦闘中ずっとリセットしない（every: 10 は通算 10・20・30…回目）。
 */
export type ShotCountKind = 'normalShot' | 'normalHit' | 'fullChargeShot';
export const SHOT_COUNT_KINDS = [
  'normalShot',
  'normalHit',
  'fullChargeShot',
] as const satisfies readonly ShotCountKind[];

export type ShotCountTrigger = {
  count: ShotCountKind;
  /** N 回ごと（即値）。every / everyRef とも省略なら毎回（1） */
  every?: number;
  /** N の description_value_NN。every とどちらか片方 */
  everyRef?: number;
};

/**
 * Stage 8: 発動の回数の段階（「使用回数別の効果」「開始回数別の効果」、下位効果のスタック適用）。
 * atLeast 回目以降の発動のたびに発火する。burstUse = 自分がバーストスキルを使った回数、fullBurstStart = フルバーストの回数（編成全体）。
 * 回数は戦闘中ずっと数え、リセットしない。
 */
export type EventCountKind = 'burstUse' | 'fullBurstStart';
export const EVENT_COUNT_KINDS = ['burstUse', 'fullBurstStart'] as const satisfies readonly EventCountKind[];

export type EventCountTrigger = {
  count: EventCountKind;
  /** 何回目以降か（1 始まりの即値。説明文の「1 回 / 2 回 / 3 回」） */
  atLeast: number;
};

/** JSON に書くトリガー。文字列は BuffTrigger、オブジェクトは回数トリガー */
export type EffectTrigger = BuffTrigger | ShotCountTrigger | EventCountTrigger;

export function isShotCountTrigger(t: EffectTrigger): t is ShotCountTrigger {
  return typeof t === 'object' && (SHOT_COUNT_KINDS as readonly string[]).includes(t.count);
}

export function isEventCountTrigger(t: EffectTrigger): t is EventCountTrigger {
  return typeof t === 'object' && (EVENT_COUNT_KINDS as readonly string[]).includes(t.count);
}

/** Stage 6: 「（トリガー）時、（対象）に （stat）X%▲、Y 秒間維持」。同じ効果が持続中に再発火したら上書き延長（窓の和集合） */
export type TimedEffect = {
  kind: 'timed';
  trigger: EffectTrigger;
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が 'allies' のときだけ書ける */
  targetWeapon?: WeaponType;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す（passive と同じ規則） */
  scaling?: BuffScaling;
  /** description_value_NN の NN（1 始まり）。値は % 表記。100 で割るのは resolveTimed の責務 */
  ref: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  /** 維持秒数の即値（説明文に「維持時間：10秒」と直書きされている場合）。durationRef とちょうど片方 */
  durationSeconds?: number;
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

/** 倍率ダメージの種別（damage 用）。additional = 追加ダメージ */
export type SkillDamageType = BurstDamageType | 'additional';
export const SKILL_DAMAGE_TYPES = ['skill', 'distributed', 'additional'] as const satisfies readonly SkillDamageType[];

/**
 * Stage 8: トリガー付きの倍率ダメージ（「最終攻撃力の X% のダメージ / 分配ダメージ / 追加ダメージ」）。どのスロットにも書ける。
 * burst スロットの無条件の発動ダメージは従来どおり burstDamage。毎回（every = 1）の射撃トリガーは Stage 8 では書けない。
 */
export type DamageEffect = {
  kind: 'damage';
  trigger: EffectTrigger;
  /** description_value_NN の NN（1 始まり）。値は % 表記 */
  ref: number;
  damageType: SkillDamageType;
  /** 常に満たすとみなした条件（対象の数など）。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

export type SkillEffect = PassiveEffect | BurstDamageEffect | TimedEffect | DamageEffect;

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
  /**
   * Stage 9: 宝物版の定義。ref は CharacterData.treasure.skills を指す（基礎版とは番号がずれるので別に書く）。
   * 宝物の段階で宝物版になるスロットにここが無ければ、そのスロットは unsupported として扱う（skills/treasure.ts）
   */
  treasureSkills?: Partial<Record<SkillSlot, SkillEntry>>;
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

/** Stage 9: targetWeapon は target が allies のときだけ */
function parseTargetWeapon(v: Record<string, Json>, target: BuffTarget, path: string): WeaponType | undefined {
  if (v.targetWeapon === undefined) return undefined;
  const weapon = oneOf(WEAPON_TYPES, v.targetWeapon, `${path}.targetWeapon`);
  if (target !== 'allies') fail(`${path}.targetWeapon`, `only allowed with target "allies", got "${target}"`);
  return weapon;
}

function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  if (scaling === 'casterAttack' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterAttack is only allowed with stat "attack", got "${stat}"`);
  }
  const effect: PassiveEffect = { kind: 'passive', target, stat, ref: parseRef(v.ref, `${path}.ref`) };
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (scaling !== undefined) effect.scaling = scaling;
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parsePositiveInt(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** 文字列なら BuffTrigger、オブジェクトなら回数トリガー */
function parseTrigger(v: Json, path: string): EffectTrigger {
  if (typeof v === 'string') return oneOf(BUFF_TRIGGERS, v, path);
  if (!isRecord(v)) fail(path, 'expected a trigger name or a count trigger object');
  if ((SHOT_COUNT_KINDS as readonly string[]).includes(v.count as string)) {
    for (const key of Object.keys(v)) {
      if (!['count', 'every', 'everyRef'].includes(key)) fail(`${path}.${key}`, 'unknown field');
    }
    if (v.every !== undefined && v.everyRef !== undefined) fail(path, 'at most one of every and everyRef');
    const trigger: ShotCountTrigger = { count: v.count as ShotCountKind };
    if (v.every !== undefined) trigger.every = parsePositiveInt(v.every, `${path}.every`);
    if (v.everyRef !== undefined) trigger.everyRef = parseRef(v.everyRef, `${path}.everyRef`);
    return trigger;
  }
  if ((EVENT_COUNT_KINDS as readonly string[]).includes(v.count as string)) {
    for (const key of Object.keys(v)) {
      if (!['count', 'atLeast'].includes(key)) fail(`${path}.${key}`, 'unknown field');
    }
    return { count: v.count as EventCountKind, atLeast: parsePositiveInt(v.atLeast, `${path}.atLeast`) };
  }
  fail(
    `${path}.count`,
    `expected one of ${[...SHOT_COUNT_KINDS, ...EVENT_COUNT_KINDS].join(', ')}, got ${JSON.stringify(v.count)}`,
  );
}

function parseTimedEffect(v: Record<string, Json>, path: string): TimedEffect {
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  if (stat === 'burstGaugeSpeed') {
    fail(
      `${path}.stat`,
      'burstGaugeSpeed is only allowed in passive (a timed gauge speed would feed back into the schedule)',
    );
  }
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  if (scaling === 'casterAttack' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterAttack is only allowed with stat "attack", got "${stat}"`);
  }
  const hasRef = v.durationRef !== undefined;
  const hasSeconds = v.durationSeconds !== undefined;
  if (hasRef === hasSeconds) {
    fail(path, 'exactly one of durationRef and durationSeconds is required');
  }
  const effect: TimedEffect = { kind: 'timed', trigger, target, stat, ref: parseRef(v.ref, `${path}.ref`) };
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (scaling !== undefined) effect.scaling = scaling;
  if (hasRef) effect.durationRef = parseRef(v.durationRef, `${path}.durationRef`);
  if (hasSeconds) {
    const seconds = v.durationSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      fail(`${path}.durationSeconds`, `expected a non-negative finite number, got ${JSON.stringify(seconds)}`);
    }
    effect.durationSeconds = seconds;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstDamageEffect(v: Record<string, Json>, path: string): BurstDamageEffect {
  const damageType = oneOf(BURST_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: BurstDamageEffect = { kind: 'burstDamage', ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseDamageEffect(v: Record<string, Json>, path: string): DamageEffect {
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (isShotCountTrigger(trigger) && trigger.everyRef === undefined && (trigger.every ?? 1) === 1) {
    fail(`${path}.trigger`, 'damage on every shot is not supported yet (every must be >= 2)');
  }
  const damageType = oneOf(SKILL_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: DamageEffect = { kind: 'damage', trigger, ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseRef(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** passive は skill1 / skill2 にだけ、burstDamage は burst にだけ、timed と damage はどのスロットにも書ける */
function parseEffect(v: Json, path: string, slot: SkillSlot): SkillEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  if (v.kind === 'passive') {
    if (slot === 'burst')
      fail(`${path}.kind`, 'passive effects are not allowed in burst (use timed with trigger "burstUse")');
    return parsePassiveEffect(v, path);
  }
  if (v.kind === 'burstDamage') {
    if (slot !== 'burst') fail(`${path}.kind`, `burstDamage is only allowed in burst, found in ${slot}`);
    return parseBurstDamageEffect(v, path);
  }
  if (v.kind === 'timed') return parseTimedEffect(v, path);
  if (v.kind === 'damage') return parseDamageEffect(v, path);
  fail(`${path}.kind`, `expected "passive", "burstDamage", "timed" or "damage", got ${JSON.stringify(v.kind)}`);
}

function parseEntry(v: Json, slot: SkillSlot, root: 'skills' | 'treasureSkills' = 'skills'): SkillEntry {
  const path = `${root}.${slot}`;
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
  const def: SkillDefinition = { formatVersion: 1, resourceId: raw.resourceId, checkedAt: raw.checkedAt, skills };
  if (raw.treasureSkills !== undefined) {
    const treasure = raw.treasureSkills;
    if (!isRecord(treasure)) fail('treasureSkills', 'expected an object');
    const treasureSkills: Partial<Record<SkillSlot, SkillEntry>> = {};
    for (const key of Object.keys(treasure)) {
      if (!(SKILL_SLOTS as readonly string[]).includes(key)) fail(`treasureSkills.${key}`, 'unknown skill slot');
      const slot = key as SkillSlot;
      treasureSkills[slot] = parseEntry(treasure[slot], slot, 'treasureSkills');
    }
    def.treasureSkills = treasureSkills;
  }
  return def;
}

export function parseSkillIndex(raw: Json): SkillIndex {
  if (!isRecord(raw)) fail('index', 'expected an object');
  if (raw.formatVersion !== 1) fail('index.formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  if (!Array.isArray(raw.resourceIds) || !raw.resourceIds.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    fail('index.resourceIds', 'expected an array of positive integers');
  }
  return { formatVersion: 1, resourceIds: raw.resourceIds as number[] };
}
