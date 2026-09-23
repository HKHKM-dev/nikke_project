// Stage 4: スキル定義（DSL）の型と検証。段階 A は常時発動パッシブ、Stage 5 でバーストスロットの倍率ダメージ（burstDamage）を足した。
// Stage 6（段階 B）でトリガー付きの持続バフ（timed）を足した。新しい BuffStat は増えず、「いつ付いて、いつ切れるか」だけが増える。
// Stage 8（段階 C）で、射撃の回数・発動の回数で発火するトリガー、バースト N 段階突入時のトリガー、
// バースト以外の倍率ダメージ（damage）、stat の distributedDamage / burstGaugeSpeed を足した（plan/design-stage8.md 2 節）。
// Stage 9 で宝物版の定義（treasureSkills）と、武器種で絞る対象（targetWeapon）を足した（plan/design-stage9.md 2・3 節）。
// Stage 10（段階 D）で射撃に効く stat（maxAmmo / reloadSpeed / chargeSpeed）と scaling 'flat'、即時効果（cooldownReduction /
// ammoRefill）、トリガー「最後の弾丸」（lastShot）を足した（plan/design-stage10.md 2 節）。
// Stage 11 で対象「直前にバーストスキルを使用した味方」（burstUsers）、フルスタックで発火する射撃の回数トリガー（stacksRef）、
// 即時効果「回復」（heal）とトリガー「回復効果が適用された時」（healed）を足した（plan/design-stage11.md 2 節）。
// Stage 11 アリス編で対象「最終攻撃力が最も高い味方 N 機」（topAttack と targetCount / targetCountRef）を足した（同 17 節）。
// Stage 11 モダニア編で、射撃ごとの倍率ダメージ（damage の every = 1）、効果のあるスタック（maxStacks / maxStacksRef）、「▼」（decrease）、
// stat の hitRate（命中率）と infiniteAmmo（装弾数無限）、条件「自分が 〈stat〉 増加状態なら」（condition）、
// 使用武器の変更（weaponChange）を足した（plan/design-stage11-modernia.md 2 節）。
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
 * Stage 10 の 3 つ（射撃に効く。ダメージの式は読まない）:
 * maxAmmo = 最大装弾数（scaling 'ratio' は %、'flat' は発数）、reloadSpeed = リロード速度（%）、chargeSpeed = チャージ速度（%）。
 * 1 パス目（sim/firstPass.ts）が射手に渡すので、timed にも書ける。
 * Stage 11 モダニアの 2 つ:
 * hitRate = 命中率（%）。全弾命中の前提なのでダメージにも射撃にも効かない。区間の鍵にも入れず、条件（condition）の判定と表示にだけ使う。
 * infiniteAmmo = 装弾数無限（射撃に効く。値を持たないフラグなので ref を書かない。timed だけ）。
 */
export type BuffStat =
  | 'attack'
  | 'critRate'
  | 'critDamage'
  | 'attackDamage'
  | 'chargeDamage'
  | 'distributedDamage'
  | 'burstGaugeSpeed'
  | 'maxAmmo'
  | 'reloadSpeed'
  | 'chargeSpeed'
  | 'hitRate'
  | 'infiniteAmmo';
export const BUFF_STATS = [
  'attack',
  'critRate',
  'critDamage',
  'attackDamage',
  'chargeDamage',
  'distributedDamage',
  'burstGaugeSpeed',
  'maxAmmo',
  'reloadSpeed',
  'chargeSpeed',
  'hitRate',
  'infiniteAmmo',
] as const satisfies readonly BuffStat[];

/** Stage 10: 射撃に効く stat（射手の実効値を変える）。Stage 11 モダニアで装弾数無限を足した */
export const FIRING_STATS = [
  'maxAmmo',
  'reloadSpeed',
  'chargeSpeed',
  'infiniteAmmo',
] as const satisfies readonly BuffStat[];

/** 射撃に効くか。Stage 11 モダニア: 解決後の使用武器の変更（stat 'weapon'。skills/resolve.ts の EffectStat）も射撃に効く */
export function isFiringStat(stat: BuffStat | 'weapon'): boolean {
  return stat === 'weapon' || (FIRING_STATS as readonly string[]).includes(stat);
}

/**
 * Stage 11 モダニア: 状態だけを表す stat（ダメージにも射撃にも効かない）。timed の窓は区間に入れず、BuffTimeline.stateWindows に置く
 * （区間の鍵・グループが変わらないので、既存の編成の区間は 1 つも変わらない）
 */
export const STATE_STATS = ['hitRate'] as const satisfies readonly BuffStat[];

export function isStateStat(stat: BuffStat | 'weapon'): boolean {
  return (STATE_STATS as readonly string[]).includes(stat);
}

/** Stage 11 モダニア: 値を持たないフラグの stat（ref を書かない） */
export const FLAG_STATS = ['infiniteAmmo'] as const satisfies readonly BuffStat[];

export function isFlagStat(stat: BuffStat): boolean {
  return (FLAG_STATS as readonly string[]).includes(stat);
}

/**
 * どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算、
 * flat = 実数の固定加算（Stage 10。stat が maxAmmo のときだけ。値は発数で 100 で割らない）、
 * casterChargeTime = 発動者の基礎チャージ時間 × 比率の秒数を対象のチャージ時間から引く（Stage 11 アリス編。stat が chargeSpeed のときだけ。
 * 「スキル発動者基準でチャージ速度 X%▲」。録画 42 でアドミ（1 秒）が 0.175 秒縮んだ。plan/design-stage11.md 27 節）
 */
export type BuffScaling = 'ratio' | 'casterAttack' | 'flat' | 'casterChargeTime';
export const BUFF_SCALINGS = [
  'ratio',
  'casterAttack',
  'flat',
  'casterChargeTime',
] as const satisfies readonly BuffScaling[];

/**
 * 効果の対象。Stage 11: burstUsers = 「直前にバーストスキルを使用した味方」（そのフルバーストを開いたチェーンでバーストを撃った枠）。
 * トリガーが fullBurstStart / fullBurstEnd のときだけ書ける（発火のたびに対象が変わる。skills/targets.ts）。
 * Stage 11 アリス編: topAttack = 「最終攻撃力が最も高い味方 N 機」（発火のフレームの最終攻撃力の順位。自分も候補。skills/ranking.ts）。
 * N は targetCount / targetCountRef。passive と heal には書けない
 */
export type BuffTarget = 'self' | 'allies' | 'burstUsers' | 'topAttack';
export const BUFF_TARGETS = ['self', 'allies', 'burstUsers', 'topAttack'] as const satisfies readonly BuffTarget[];

/** Stage 11 アリス編: 「最終攻撃力が最も高い味方 N 機」の N。target が topAttack のときだけ、ちょうど片方 */
export type TargetCountFields = {
  /** N の即値 */
  targetCount?: number;
  /** N の description_value_NN */
  targetCountRef?: number;
};

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
  /** Stage 11 モダニア: 「▼」。値の符号を反転する（scaling が ratio / flat のときだけ） */
  decrease?: true;
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
 * Stage 11: healed = 自分に回復効果が適用された時（heal 効果の対象になった時。HP は持たず、満タンでも適用とみなす）。
 */
export type BuffTrigger =
  | 'battleStart'
  | 'burstUse'
  | 'fullBurstStart'
  | 'fullBurstEnd'
  | 'burstStage1Enter'
  | 'burstStage2Enter'
  | 'burstStage3Enter'
  | 'healed';
export const BUFF_TRIGGERS = [
  'battleStart',
  'burstUse',
  'fullBurstStart',
  'fullBurstEnd',
  'burstStage1Enter',
  'burstStage2Enter',
  'burstStage3Enter',
  'healed',
] as const satisfies readonly BuffTrigger[];

/** Stage 11: 対象 burstUsers を書けるトリガー */
export const BURST_USERS_TRIGGERS = ['fullBurstStart', 'fullBurstEnd'] as const satisfies readonly BuffTrigger[];

/**
 * Stage 8: 自分の射撃の回数で発火するトリガー。1 回 = 弾薬を 1 消費する 1 トリガー（SG もペレットではなくトリガー）。
 * 全弾命中の前提なので normalShot と normalHit は同じ列になる。fullChargeShot はチャージ武器の全射撃（常にフルチャージのモデル）。
 * カウンタはリロードでも戦闘中ずっとリセットしない（every: 10 は通算 10・20・30…回目）。
 * Stage 10: lastShot = 残弾を 0 にした射撃（「最後の弾丸で攻撃した時 / 命中した時」）。最大装弾数▲で遅れ、弾丸チャージで出なくなる。
 */
export type ShotCountKind = 'normalShot' | 'normalHit' | 'fullChargeShot' | 'lastShot';
export const SHOT_COUNT_KINDS = [
  'normalShot',
  'normalHit',
  'fullChargeShot',
  'lastShot',
] as const satisfies readonly ShotCountKind[];

export type ShotCountTrigger = {
  count: ShotCountKind;
  /** N 回ごと（即値）。every / everyRef とも省略なら毎回（1） */
  every?: number;
  /** N の description_value_NN。every とどちらか片方 */
  everyRef?: number;
  /**
   * Stage 11: フルスタックの数の description_value_NN。N 回ごとに 1 スタック、満ちたら解除して発火する（N × スタック数 回ごと）。
   * スタック自体に効果が無い場合だけ使う（クラウン S2 のリラックス）
   */
  stacksRef?: number;
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
export type TimedEffect = TargetCountFields & {
  kind: 'timed';
  trigger: EffectTrigger;
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が self 以外（allies・Stage 11 の burstUsers）のときだけ書ける */
  targetWeapon?: WeaponType;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す（passive と同じ規則） */
  scaling?: BuffScaling;
  /**
   * description_value_NN の NN（1 始まり）。値は % 表記。100 で割るのは resolveTimed の責務。
   * Stage 11 モダニア: フラグの stat（infiniteAmmo）だけは書かない（値 1）
   */
  ref?: number;
  /** Stage 11 モダニア: 「▼」。値の符号を反転する（scaling が ratio / flat のときだけ） */
  decrease?: true;
  /**
   * Stage 11 モダニア: 効果のあるスタックの最大数（即値）。有れば発火のたびに 1 スタック足し（上限で止める）、値は 1 スタックあたり。
   * 維持時間の数え方は skills/stacks.ts の STACK_REFRESH。クラウンの ShotCountTrigger.stacksRef（数えるだけのスタックが満ちたら発火）とは別物
   */
  maxStacks?: number;
  /** 最大スタック数の description_value_NN。maxStacks と片方まで */
  maxStacksRef?: number;
  /**
   * Stage 11 モダニア: 「自分が 〈stat〉 増加状態なら」。発火の瞬間に、効果を持つ枠がその stat の増加状態（常時パッシブか、
   * 効いている窓で合計 > 0。同じフレームに付いた窓も入れる）なら発火する。カウンタは状態に関係なく数える
   */
  condition?: EffectCondition;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  /** 維持秒数の即値（説明文に「維持時間：10秒」と直書きされている場合）。durationRef とちょうど片方 */
  durationSeconds?: number;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/** Stage 11 モダニア: 発火の条件。selfBuffed = 自分がその stat の増加状態なら */
export type EffectCondition = { selfBuffed: BuffStat };

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
 * burst スロットの無条件の発動ダメージは従来どおり burstDamage。
 * Stage 11 モダニア: 射撃の回数トリガーの毎回（every = 1。「通常攻撃が命中した時」）は、発動を 1 件ずつ作らずに
 * 1 トリガーの値に畳み込む（damage.ts の perShot）。最後の弾丸（lastShot）の毎回はマガジンに 1 回なので今までどおり 1 件ずつ
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

/**
 * Stage 10: 「バーストスキルクールタイム X 秒▼」。発火の瞬間に対象の残りの CT を X 秒減らす（0 未満にはしない。即時効果）。
 * 同じフレームの発動の後に当てる（plan/design-stage10.md 4 節）
 */
export type CooldownReductionEffect = TargetCountFields & {
  kind: 'cooldownReduction';
  trigger: EffectTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  /** 秒数の description_value_NN */
  ref: number;
  assumes?: LocalizedText;
};

/** Stage 10: 「弾丸チャージ X%」。発火の瞬間に対象の残弾へ 最大装弾数 × X% を足す（最大で止める。即時効果） */
export type AmmoRefillEffect = TargetCountFields & {
  kind: 'ammoRefill';
  trigger: EffectTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  /** % の description_value_NN */
  ref: number;
  assumes?: LocalizedText;
};

/**
 * Stage 11: 「HP を X% 回復」。数値はダメージに関係しないので、対象に「回復を受けた」出来事（トリガー healed）を起こすだけ。
 * 回復は heal の窓が始まるはずのフレーム（射撃の回数起点なら次のフレーム）に起きる。トリガーに healed は書けない（連鎖させない）
 */
export type HealEffect = {
  kind: 'heal';
  trigger: EffectTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  /** 回復量（%）の description_value_NN（UI の表示用） */
  ref: number;
  assumes?: LocalizedText;
};

export type InstantEffect = CooldownReductionEffect | AmmoRefillEffect | HealEffect;
export type InstantKind = InstantEffect['kind'];
export const INSTANT_KINDS = ['cooldownReduction', 'ammoRefill', 'heal'] as const satisfies readonly InstantKind[];

/**
 * Stage 11 モダニア: 「殲滅モード」「使用武器変更」。維持時間のあいだ、自分の通常攻撃を別の武器にする（対象は常に自分）。
 * 変更後の武器のレートは CharacterData.burstSkill.changeWeapon（CDN の skill_value_data）から取る。
 * CDN に無いパラメータ（コア倍率・スピンアップなど）は仮の定数（skills/resolve.ts の changedWeaponShot）
 */
export type WeaponChangeEffect = {
  kind: 'weaponChange';
  trigger: EffectTrigger;
  /** 変更後の 1 発のダメージ（%）の description_value_NN */
  damageRef: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  durationSeconds?: number;
  assumes?: LocalizedText;
};

export type SkillEffect =
  PassiveEffect | BurstDamageEffect | TimedEffect | DamageEffect | InstantEffect | WeaponChangeEffect;

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

/** casterAttack は attack だけ、flat（Stage 10）は maxAmmo だけ */
function validateScaling(scaling: BuffScaling | undefined, stat: BuffStat, path: string): void {
  if (scaling === 'casterAttack' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterAttack is only allowed with stat "attack", got "${stat}"`);
  }
  if (scaling === 'casterChargeTime' && stat !== 'chargeSpeed') {
    fail(`${path}.scaling`, `casterChargeTime is only allowed with stat "chargeSpeed", got "${stat}"`);
  }
  if (scaling === 'flat' && stat !== 'maxAmmo') {
    fail(`${path}.scaling`, `flat is only allowed with stat "maxAmmo", got "${stat}"`);
  }
}

/** Stage 9: targetWeapon は target が self 以外のときだけ（Stage 11 で burstUsers・topAttack にも広げた） */
function parseTargetWeapon(v: Record<string, Json>, target: BuffTarget, path: string): WeaponType | undefined {
  if (v.targetWeapon === undefined) return undefined;
  const weapon = oneOf(WEAPON_TYPES, v.targetWeapon, `${path}.targetWeapon`);
  if (target === 'self')
    fail(`${path}.targetWeapon`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return weapon;
}

/** Stage 11: burstUsers はトリガーが fullBurstStart / fullBurstEnd のときだけ */
function validateBurstUsersTarget(target: BuffTarget, trigger: EffectTrigger, path: string): void {
  if (target !== 'burstUsers') return;
  if (typeof trigger === 'string' && (BURST_USERS_TRIGGERS as readonly string[]).includes(trigger)) return;
  fail(
    `${path}.target`,
    `burstUsers is only allowed with trigger ${BURST_USERS_TRIGGERS.join(' or ')}, got ${JSON.stringify(trigger)}`,
  );
}

/** Stage 11 アリス編: topAttack の N（targetCount / targetCountRef）。topAttack のときだけ、ちょうど片方 */
function parseTargetCount(v: Record<string, Json>, target: BuffTarget, path: string): TargetCountFields {
  const hasCount = v.targetCount !== undefined;
  const hasRef = v.targetCountRef !== undefined;
  if (target !== 'topAttack') {
    if (hasCount || hasRef)
      fail(path, `targetCount / targetCountRef are only allowed with target "topAttack", got "${target}"`);
    return {};
  }
  if (hasCount === hasRef)
    fail(path, 'exactly one of targetCount and targetCountRef is required with target "topAttack"');
  return hasCount
    ? { targetCount: parsePositiveInt(v.targetCount, `${path}.targetCount`) }
    : { targetCountRef: parseRef(v.targetCountRef, `${path}.targetCountRef`) };
}

function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'burstUsers') fail(`${path}.target`, 'burstUsers is not allowed in passive (it needs a full burst)');
  // 常時の効果の対象が戦闘中に入れ替わるのは持続バフの窓の仕組みの外（plan/design-stage11.md 17 節）
  if (target === 'topAttack')
    fail(`${path}.target`, 'topAttack is not allowed in passive (the ranking changes during battle)');
  const targetWeapon = parseTargetWeapon(v, target, path);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  if (isFlagStat(stat)) fail(`${path}.stat`, `${stat} is only allowed in timed`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  const effect: PassiveEffect = { kind: 'passive', target, stat, ref: parseRef(v.ref, `${path}.ref`) };
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) effect.decrease = true;
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** Stage 11 モダニア: decrease（「▼」）は true だけ・scaling が ratio / flat のときだけ */
function parseDecrease(v: Record<string, Json>, scaling: BuffScaling | undefined, path: string): boolean {
  if (v.decrease === undefined) return false;
  if (v.decrease !== true) fail(`${path}.decrease`, `expected true, got ${JSON.stringify(v.decrease)}`);
  if (scaling !== undefined && scaling !== 'ratio' && scaling !== 'flat') {
    fail(`${path}.decrease`, `only allowed with scaling "ratio" or "flat", got "${scaling}"`);
  }
  return true;
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
      if (!['count', 'every', 'everyRef', 'stacksRef'].includes(key)) fail(`${path}.${key}`, 'unknown field');
    }
    if (v.every !== undefined && v.everyRef !== undefined) fail(path, 'at most one of every and everyRef');
    const trigger: ShotCountTrigger = { count: v.count as ShotCountKind };
    if (v.every !== undefined) trigger.every = parsePositiveInt(v.every, `${path}.every`);
    if (v.everyRef !== undefined) trigger.everyRef = parseRef(v.everyRef, `${path}.everyRef`);
    if (v.stacksRef !== undefined) trigger.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
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
  validateBurstUsersTarget(target, trigger, path);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const count = parseTargetCount(v, target, path);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  if (stat === 'burstGaugeSpeed') {
    fail(
      `${path}.stat`,
      'burstGaugeSpeed is only allowed in passive (a timed gauge speed would feed back into the schedule)',
    );
  }
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  const effect: TimedEffect = { kind: 'timed', trigger, target, stat };
  // Stage 11 モダニア: フラグの stat（装弾数無限）は値を持たないので ref も scaling も書かない
  if (isFlagStat(stat)) {
    if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value (do not write ref)`);
    if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value (do not write scaling)`);
  } else {
    effect.ref = parseRef(v.ref, `${path}.ref`);
  }
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  Object.assign(effect, count);
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) {
    if (isFlagStat(stat)) fail(`${path}.decrease`, `${stat} has no value`);
    effect.decrease = true;
  }
  Object.assign(effect, parseDuration(v, path));
  // Stage 11 モダニア: 効果のあるスタック
  if (v.maxStacks !== undefined && v.maxStacksRef !== undefined)
    fail(path, 'at most one of maxStacks and maxStacksRef');
  if (v.maxStacks !== undefined) effect.maxStacks = parsePositiveInt(v.maxStacks, `${path}.maxStacks`);
  if (v.maxStacksRef !== undefined) effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
  if (isFlagStat(stat) && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, `${stat} cannot stack`);
  }
  // Stage 11 モダニア: 「自分が 〈stat〉 増加状態なら」
  if (v.condition !== undefined) {
    const c = v.condition;
    if (!isRecord(c) || Object.keys(c).some((k) => k !== 'selfBuffed')) {
      fail(`${path}.condition`, 'expected { selfBuffed: stat }');
    }
    const selfBuffed = oneOf(BUFF_STATS, c.selfBuffed, `${path}.condition.selfBuffed`);
    if (isFlagStat(selfBuffed)) fail(`${path}.condition.selfBuffed`, `${selfBuffed} is not a buff state`);
    // 条件付きの効果が状態を作ると連鎖するので、同じ stat と状態だけの stat は出せない（plan/design-stage11-modernia.md 2.4 節）
    if (stat === selfBuffed || isStateStat(stat)) {
      fail(`${path}.stat`, `a conditional effect cannot give "${stat}" (it would feed its own condition)`);
    }
    if (target === 'topAttack') fail(`${path}.target`, 'a conditional effect cannot target "topAttack"');
    effect.condition = { selfBuffed };
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** durationRef / durationSeconds のちょうど片方 */
function parseDuration(v: Record<string, Json>, path: string): { durationRef?: number; durationSeconds?: number } {
  const hasRef = v.durationRef !== undefined;
  const hasSeconds = v.durationSeconds !== undefined;
  if (hasRef === hasSeconds) {
    fail(path, 'exactly one of durationRef and durationSeconds is required');
  }
  if (hasRef) return { durationRef: parseRef(v.durationRef, `${path}.durationRef`) };
  const seconds = v.durationSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    fail(`${path}.durationSeconds`, `expected a non-negative finite number, got ${JSON.stringify(seconds)}`);
  }
  return { durationSeconds: seconds };
}

/** Stage 11 モダニア: 使用武器の変更 */
function parseWeaponChangeEffect(v: Record<string, Json>, path: string): WeaponChangeEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'damageRef', 'durationRef', 'durationSeconds', 'assumes'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const effect: WeaponChangeEffect = {
    kind: 'weaponChange',
    trigger: parseTrigger(v.trigger, `${path}.trigger`),
    damageRef: parseRef(v.damageRef, `${path}.damageRef`),
    ...parseDuration(v, path),
  };
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
  // Stage 11 モダニア: 射撃ごと（every = 1）の倍率ダメージも書ける。1 トリガーの値に畳み込む（skills/burstDamage.ts の resolvePerShotDamage）
  const damageType = oneOf(SKILL_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: DamageEffect = { kind: 'damage', trigger, ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseInstantEffect(v: Record<string, Json>, path: string, kind: InstantKind): InstantEffect {
  for (const key of Object.keys(v)) {
    if (
      !['kind', 'trigger', 'target', 'targetWeapon', 'targetCount', 'targetCountRef', 'ref', 'assumes'].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  // 回復で回復を起こすと連鎖が閉じないので、heal のトリガーに healed は書けない（plan/design-stage11.md 3.3 節）
  if (kind === 'heal' && trigger === 'healed') fail(`${path}.trigger`, 'heal cannot be triggered by "healed"');
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  validateBurstUsersTarget(target, trigger, path);
  // 回復 → healed の攻撃力の窓 → 順位 → 回復の対象、と循環するので heal には書けない（plan/design-stage11.md 19.3 節）
  if (kind === 'heal' && target === 'topAttack') fail(`${path}.target`, 'heal cannot target "topAttack"');
  const targetWeapon = parseTargetWeapon(v, target, path);
  const count = parseTargetCount(v, target, path);
  const effect: InstantEffect = { kind, trigger, target, ref: parseRef(v.ref, `${path}.ref`) };
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (kind !== 'heal') Object.assign(effect, count);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseRef(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/** passive は skill1 / skill2 にだけ、burstDamage は burst にだけ、timed・damage・即時効果・weaponChange はどのスロットにも書ける */
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
  if (v.kind === 'cooldownReduction' || v.kind === 'ammoRefill' || v.kind === 'heal') {
    return parseInstantEffect(v, path, v.kind);
  }
  if (v.kind === 'weaponChange') return parseWeaponChangeEffect(v, path);
  fail(
    `${path}.kind`,
    `expected "passive", "burstDamage", "timed", "damage", "cooldownReduction", "ammoRefill", "heal" or "weaponChange", got ${JSON.stringify(v.kind)}`,
  );
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
