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
// Stage 11 紅蓮BS で、段の循環（cycle。「攻撃回数別の効果」「各段階の効果のみ適用」）と、その間隔の変更（cycleEvery。
// 「スキル 1 のフルチャージ攻撃回数の条件が 1 回 / 2 回 / 3 回に変更」）を足した（plan/design-stage11-scarlet-bs.md 2 節）。
// ヘルム編で、stat の normalCritRate（通常攻撃のクリティカル確率）と chargeDamageMultiplier（チャージダメージ倍率）、即時効果「バーストゲージのチャージ」（burstGauge）、
// 「N 発間維持」（timed の durationShots / durationShotsRef）を足した（plan/design-helm.md 2 節）。
// ニヒリスター編で持続ダメージ（dot。「持続ダメージ」「1秒間隔」「10秒間維持」）を足した（plan/design-nihilister.md 2.1 節）。
// 撮影の後に、時間の周期のトリガー（{ everySeconds }。CT ごとに発動するアクティブ型のスキル）を足した（同 8 節）。
// フラワー編で、周期でゲージだけを溜める効果（burstGaugeHit）を足した（plan/design-flower-s2-gauge.md 2 節）。
// 定義は packages/core/data/skills/{resourceId}.json に手書きし、数値は CharacterData.skills の values を ref で参照する。
// 効果と notes には、根拠の結論の ID（claims）を書ける（plan/skills-guide.md 3 節。実在の検査は records/skills.ts）。
import { ELEMENTS } from '../element.ts';
import type { Element, LocalizedText, SkillSlot, WeaponType } from '../types.ts';
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
 * 1 パス目（frame/firstPass.ts）が射手に渡すので、timed にも書ける。
 * Stage 11 モダニアの 2 つ:
 * hitRate = 命中率（%）。全弾命中の前提なので射撃にも弾丸命中率にも効かない。条件（condition）の判定と表示と、条件が自動の枠の
 * コア命中率の N（frame/landing.ts。常時は C-0036、持続は C-0170）に使う。
 * infiniteAmmo = 装弾数無限（射撃に効く。値を持たないフラグなので ref を書かない。timed だけ）。
 * Stage 13 の 3 つ（OL・キューブ・コレクションの効果層で使う。スキルの DSL にも書ける。plan/design-stage12.md 3.1 節）:
 * elementDamage = 有利コードの攻撃ダメージ。属性有利のときだけ (1.1 + Σ)、非有利は 1 のまま。
 * coreDamage = コアダメージ。コア命中の加算項を (コア倍率 − 1 + Σ) にする（通常攻撃だけ）。
 * normalAttackDamage = 通常攻撃ダメージ倍率（SG・SMG のコレクション）。通常攻撃の武器倍率に (1 + Σ) を掛けて四捨五入する（C-0121。damage.ts）。
 * ヘルム編の 1 つ: normalCritRate = 通常攻撃のクリティカル確率。通常攻撃の会心率にだけ足す（バーストスキル・倍率ダメージには足さない）。
 * ヘルム編の 2 つ目: chargeDamageMultiplier = 「チャージダメージ X% 倍率▲」（スキル・RL / SR のコレクション）。素のフルチャージ
 * 倍率に (1 + Σ) を掛けて四捨五入する（C-0099・C-0122・C-0126）。「倍率」の無い「チャージダメージ X%▲」（スキル・OL の増加）は
 * chargeDamage で、その後に足す（C-0020・C-0122・C-0134）。
 * 受けるダメージ編: damageTaken = 敵の受けるダメージ▲（敵へのデバフ）。敵 1 体の前提なので、味方全体（target 'allies' だけ）の
 * 与ダメージに別枠の乗数 (1 + Σ) で掛ける（通常攻撃・射撃ごとの倍率ダメージ・倍率ダメージ・持続ダメージ。C-0138。plan/design-damage-taken.md）
 * アニス：スター S2・バースト編（plan/design-anis-star-s2-burst.md 2.1・2.3 節）:
 * projectileExplosionDamage = 発射体爆発ダメージ▲。発射体の爆発を持つ武器（RL）の通常攻撃にだけ掛ける（式の中の置き場所は
 * damage.ts の PROJECTILE_EXPLOSION_BUCKET）。
 * fixedChargeTime = 「チャージ時間 N 秒に固定」。射撃に効く。値は秒（100 で割らない）。timed の self だけ
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
  | 'infiniteAmmo'
  | 'elementDamage'
  | 'coreDamage'
  | 'normalAttackDamage'
  | 'normalCritRate'
  | 'chargeDamageMultiplier'
  | 'damageTaken'
  | 'projectileExplosionDamage'
  | 'fixedChargeTime';
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
  'elementDamage',
  'coreDamage',
  'normalAttackDamage',
  'normalCritRate',
  'chargeDamageMultiplier',
  'damageTaken',
  'projectileExplosionDamage',
  'fixedChargeTime',
] as const satisfies readonly BuffStat[];

/** Stage 10: 射撃に効く stat（射手の実効値を変える）。Stage 11 モダニアで装弾数無限、アニス：スター編でチャージ時間の固定を足した */
export const FIRING_STATS = [
  'maxAmmo',
  'reloadSpeed',
  'chargeSpeed',
  'infiniteAmmo',
  'fixedChargeTime',
] as const satisfies readonly BuffStat[];

/** 射撃に効くか。Stage 11 モダニア: 解決後の使用武器の変更（stat 'weapon'。skills/resolve.ts の EffectStat）も射撃に効く */
export function isFiringStat(stat: BuffStat | 'weapon'): boolean {
  return stat === 'weapon' || (FIRING_STATS as readonly string[]).includes(stat);
}

/**
 * Stage 11 モダニア: 状態だけを表す stat（射撃に効かない）。timed の窓は BuffTimeline.stateWindows に置く。区間を割り、区間の
 * buffs と鍵に入るのは、着地点の計画（条件が自動の枠）があるときだけ（C-0170。手入力の枠の区間・グループは変わらない）
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

/**
 * アニス：スター編: バースト段階の構成の条件（plan/design-anis-star-s1.md 2.1 節。plan/design-ram-s1.md で squad から改名）。
 * 自分を除く編成の枠（空枠を除く）に、基本バースト段階（CharacterData.burstStep）が otherBurstStep のキャラが 1 体以上いる
 * （present: true）/ 1 体もいない（false）ときだけ効果を持つ。編成で決まる静的な条件で、満たさない効果は最上位で外す
 * （skills/composition.ts）。AllStep は段階 1〜3 のどれにも数えない（同 5 節の論点 1）
 */
export type BurstStepMixCondition = { otherBurstStep: BasicBurstStep; present: boolean };
export type BasicBurstStep = 'Step1' | 'Step2' | 'Step3';
export const BASIC_BURST_STEPS = ['Step1', 'Step2', 'Step3'] as const satisfies readonly BasicBurstStep[];

/**
 * ラム編: 同じ部隊の味方の条件（plan/design-ram-s1.md 2.1 節）。自分を除く編成の枠（空枠を除く）に、ゲーム内の部隊
 * （CharacterData.squad）が自分と同じキャラが 1 体以上いる（present: true）/ 1 体もいない（false）ときだけ効果を持つ。
 * バースト段階の構成の条件と同じく、編成で決まる静的な条件で、満たさない効果は最上位で外す（skills/composition.ts）
 */
export type SquadCondition = { present: boolean };

/**
 * スロットの対応状況（plan/design-skill-note-kinds.md 2.2 節）。定義には書かず、効果の有無と unimplemented の notes の有無から
 * 読み込みで決める（deriveSkillSupport）。noEffect = モデルの前提の中でダメージに効く効果が無い（notes が noDamage・outOfScope・modeling だけ）
 */
export type SkillSupport = 'supported' | 'partial' | 'unsupported' | 'noEffect';

/**
 * notes の種類（plan/design-skill-note-kinds.md 2.1 節）。unimplemented = 前提の中でダメージに効く（効きうる）のに定義していない、
 * outOfScope = モデルの前提（静止単体ボス・被弾なし・味方が倒れない・パーツ／阻止部位／バリアなし。要件 5.2 節）では起きない・効かない、
 * noDamage = どの編成・敵でも与ダメージを変えない、modeling = 扱っていない効果ではなく扱い方の補足
 */
export type SkillNoteKind = 'unimplemented' | 'outOfScope' | 'noDamage' | 'modeling';
export const SKILL_NOTE_KINDS = [
  'unimplemented',
  'outOfScope',
  'noDamage',
  'modeling',
] as const satisfies readonly SkillNoteKind[];

export type PassiveEffect = {
  /** 無条件・常時（段階 A）。トリガー付きの持続バフは 'timed'（段階 B） */
  kind: 'passive';
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が 'allies' のときだけ書ける */
  targetWeapon?: WeaponType;
  /** アスカ: 「〈コード〉コードの味方」。targetWeapon と同じ場所に書ける（plan/design-asuka.md 2.2 節） */
  targetElement?: Element;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す */
  scaling?: BuffScaling;
  /** description_value_NN の NN（1 始まり）。値は % 表記（"20.1"）。100 で割るのは resolvePassives の責務 */
  ref: number;
  /** Stage 11 モダニア: 「▼」。値の符号を反転する（scaling が ratio / flat のときだけ） */
  decrease?: true;
  /** アニス：スター編: バースト段階の構成の条件 */
  burstStepMix?: BurstStepMixCondition;
  /** ラム編: 同じ部隊の味方の条件 */
  squad?: SquadCondition;
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
 * fullChargeShot はチャージ武器の射撃のうち、部分チャージの発（Stage 22-B）を除いたもの。
 * ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.2・2.3 節）: normalHit は命中の期待値（1 発ごとにその発の弾丸命中率。
 * SG は 1 トリガーを 1 回）、coreHit はコアの命中の期待値（弾丸命中率 × コア命中率）を足し、累計が N の倍数を越えた発で発火する
 * （skills/triggers.ts）。弾丸命中率が 1 の枠では normalHit は normalShot と同じ列になる。
 * カウンタはリロードでも戦闘中ずっとリセットしない（every: 10 は通算 10・20・30…回目）。
 * Stage 10: lastShot = 残弾を 0 にした射撃（「最後の弾丸で攻撃した時 / 命中した時」）。最大装弾数▲で遅れ、弾丸チャージで出なくなる。
 */
export type ShotCountKind = 'normalShot' | 'normalHit' | 'coreHit' | 'fullChargeShot' | 'lastShot';
export const SHOT_COUNT_KINDS = [
  'normalShot',
  'normalHit',
  'coreHit',
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

/**
 * ニヒリスター編: 時間の周期のトリガー。戦闘開始から k × everySeconds 秒（k = 1, 2, …）に発火する。射撃・リロード・
 * 的のジャンプ・バーストに関係しない（録画 081 の S2。C-0091）。CT が説明文にも CDN にも無いアクティブ型のスキル用で、
 * 値は実測の即値。射撃に効かない damage と dot にだけ書ける（1 パス目の出来事の列にタイマーのフレームが無いため。
 * plan/design-nihilister.md 8.1 節）
 */
export type TimerTrigger = { everySeconds: number };

/** JSON に書くトリガー。文字列は BuffTrigger、オブジェクトは回数トリガーか時間の周期のトリガー */
export type EffectTrigger = BuffTrigger | ShotCountTrigger | EventCountTrigger | TimerTrigger;

export function isTimerTrigger(t: unknown): t is TimerTrigger {
  return typeof t === 'object' && t !== null && 'everySeconds' in t;
}

export function isShotCountTrigger(t: EffectTrigger): t is ShotCountTrigger {
  return typeof t === 'object' && 'count' in t && (SHOT_COUNT_KINDS as readonly string[]).includes(t.count);
}

export function isEventCountTrigger(t: EffectTrigger): t is EventCountTrigger {
  return typeof t === 'object' && 'count' in t && (EVENT_COUNT_KINDS as readonly string[]).includes(t.count);
}

/** Stage 6: 「（トリガー）時、（対象）に （stat）X%▲、Y 秒間維持」。同じ効果が持続中に再発火したら上書き延長（窓の和集合） */
export type TimedEffect = TargetCountFields & {
  kind: 'timed';
  trigger: EffectTrigger;
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が self 以外（allies・Stage 11 の burstUsers）のときだけ書ける */
  targetWeapon?: WeaponType;
  /** アスカ: 「〈コード〉コードの味方」 */
  targetElement?: Element;
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
  /** アニス：スター編: バースト段階の構成の条件 */
  burstStepMix?: BurstStepMixCondition;
  /** ラム編: 同じ部隊の味方の条件 */
  squad?: SquadCondition;
  /** 維持秒数の description_value_NN。durationSeconds・durationShots・durationShotsRef とちょうど 1 つ */
  durationRef?: number;
  /** 維持秒数の即値（説明文に「維持時間：10秒」と直書きされている場合） */
  durationSeconds?: number;
  /**
   * ヘルム編: 「N 発間維持」の N の即値。付いたフレームから、対象の枠の N 発目の通常攻撃まで続く（N 発目にも効く）。
   * 対象ごとにその枠の射撃を数え、維持中にまた付いたら数え直す。窓は 1 パス目の射撃の列で決まるので、
   * 1 パス目のループの中で窓を追う stat（攻撃力・射撃に効く stat・状態の stat）と、スタック・条件・順位の対象には書けない
   */
  durationShots?: number;
  /** ヘルム編: 「N 発間維持」の N の description_value_NN */
  durationShotsRef?: number;
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
  /**
   * ヘルム編（V-0034）: 1 回の発動のヒットのうちバーストゲージを溜めるものの、発動した射撃からの遅れ（フレーム。昇順）。
   * 0 は発と同じフレーム（V-0035 のモダニア）。段の gaugeHits（V-0030、C-0085）と同じで、1 ヒットで射手の targetBurstEnergyPerShot（フルチャージ倍率なし）を溜める。
   * 射撃の回数トリガーのときだけ書ける。省略は溜めない
   */
  gaugeHits?: number[];
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
  targetElement?: Element;
  /** 秒数の description_value_NN */
  ref: number;
  /** アニス：スター編: バースト段階の構成の条件 */
  burstStepMix?: BurstStepMixCondition;
  /** ラム編: 同じ部隊の味方の条件 */
  squad?: SquadCondition;
  assumes?: LocalizedText;
};

/**
 * Stage 10: 「弾丸チャージ X%」。発火の瞬間に対象の残弾へ 最大装弾数 × X% を足す（最大で止める。即時効果）。
 * ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.1 節）: scaling 'flat' は「弾丸チャージ N 発」で、値を発数のまま足す
 */
export type AmmoRefillEffect = TargetCountFields & {
  kind: 'ammoRefill';
  trigger: EffectTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  targetElement?: Element;
  /** % の description_value_NN（scaling 'flat' なら発数） */
  ref: number;
  scaling?: 'flat';
  assumes?: LocalizedText;
};

/**
 * Stage 11: 「HP を X% 回復」。数値はダメージに関係しないので、対象に「回復を受けた」出来事（トリガー healed）を起こすだけ。
 * 回復は heal の窓が始まるはずのフレーム（射撃の回数起点なら次のフレーム）に起きる。トリガーに healed は書けない（連鎖させない）
 * V-0024: 維持時間（吸収回復などの「N 秒間維持」）を書くと、同じ効果の窓が付いている対象への付き直しでは healed を起こさず、
 * 窓を延ばすだけにする（plan/design-heal-window.md 1.1 節、C-0082）。書かなければ付くたびに healed を起こす
 */
export type HealEffect = {
  kind: 'heal';
  trigger: EffectTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  targetElement?: Element;
  /** 回復量（%）の description_value_NN（UI の表示用） */
  ref: number;
  /** 維持秒数の description_value_NN（任意。durationSeconds と両方は書けない） */
  durationRef?: number;
  durationSeconds?: number;
  assumes?: LocalizedText;
};

/**
 * ヘルム編: 「バーストゲージのチャージ X%」。編成のバーストゲージへ最大値の X% を足す（即時効果）。射撃の回数トリガーは
 * 発と同じフレームのゲージに足し（V-0034: バーは発のフレームで 1 回に跳ぶ）、ほかのトリガーは発火の次のフレームに足す。
 * ゲージが溜まる状態のときだけ足し（射撃のゲージと同じ）、チャージ速度は掛けない（仮定。plan/design-helm.md 2.2 節）。
 * ゲージは編成で 1 本なので、対象は allies だけ書ける（対象の数によらず 1 回だけ足す）
 */
export type BurstGaugeEffect = TargetCountFields & {
  kind: 'burstGauge';
  trigger: EffectTrigger;
  target: 'allies';
  /** 絞り込みの欄は即時効果の型をそろえるためだけにある（検証で弾く） */
  targetWeapon?: WeaponType;
  targetElement?: Element;
  /** % の description_value_NN */
  ref: number;
  assumes?: LocalizedText;
};

export type InstantEffect = CooldownReductionEffect | AmmoRefillEffect | HealEffect | BurstGaugeEffect;
export type InstantKind = InstantEffect['kind'];
export const INSTANT_KINDS = [
  'cooldownReduction',
  'ammoRefill',
  'heal',
  'burstGauge',
] as const satisfies readonly InstantKind[];

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
  /**
   * 1 発のヒット数（即値。省略 1）。説明文にも CDN にも無いので実測で書く。モダニアの殲滅モードは射撃場の的で 2
   * （録画 44。照準範囲内の敵の数か弾の数かは未確定）。会心はヒットごとに判定されるので、期待値は武器倍率 × ヒット数と同じ
   */
  hitsPerShot?: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  durationSeconds?: number;
  assumes?: LocalizedText;
};

/** Stage 11 紅蓮BS: 段の中身。DamageEffect から trigger を除いた形（今は倍率ダメージだけ） */
export type CycleStep = {
  kind: 'damage';
  /** description_value_NN の NN（1 始まり）。値は % 表記 */
  ref: number;
  damageType: SkillDamageType;
  /**
   * V-0030: この段のヒットのうちバーストゲージを溜めるものの、段を出した射撃からの遅れ（フレーム。昇順）。
   * 1 ヒットで射手の targetBurstEnergyPerShot（フルチャージ倍率なし）を溜める。省略は溜めない
   */
  gaugeHits?: number[];
  assumes?: LocalizedText;
};

/**
 * Stage 11 紅蓮BS: 「攻撃回数別の効果」「各段階の効果のみ適用」の循環。trigger の回数（射撃の通算カウンタの every の倍数）ごとに
 * steps を 1 段ずつ順に発動し、最後の次は最初に戻る。段のポインタはカウンタと別に 1 つだけ持ち、戦闘中ずっと続く
 * （リロードでもフルバーストでも戻さない）。録画 46・47 で確認（plan/design-stage11-scarlet-bs.md 0.3 節）。
 * 回数トリガーの「N 回ごとに同じ効果」（damage の every）とは別物
 */
export type CycleEffect = {
  kind: 'cycle';
  /** 1 段進むきっかけ。射撃の回数トリガーだけ（every = 段の間隔。「3 回 / 6 回 / 9 回」なら 3。stacksRef・lastShot は不可） */
  trigger: ShotCountTrigger;
  /** 段の中身（2 つ以上） */
  steps: CycleStep[];
  assumes?: LocalizedText;
};

/**
 * Stage 11 紅蓮BS: 「スキル N の（フルチャージ）攻撃回数の条件が … に変更」。維持時間のあいだ、自分のスロット slot の cycle を
 * every 回ごとに進める（通算カウンタの every の倍数。1 なら毎回）。カウンタ自体は変えない（録画 47 の 5 回の FB で確認）。
 * 対象は常に自分。窓は BuffTimeline.cycleWindows に置き、区間には入れない
 */
export type CycleEveryEffect = {
  kind: 'cycleEvery';
  trigger: EffectTrigger;
  /** 対象の cycle を持つ自分のスロット */
  slot: SkillSlot;
  /** 変更後の段の間隔（即値。説明文の「1 回 / 2 回 / 3 回」は 1） */
  every: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  durationSeconds?: number;
  assumes?: LocalizedText;
};

/**
 * ニヒリスター編: 「最終攻撃力の X% の持続ダメージ」「N 秒間隔」「Y 秒間維持」。発火から維持時間のあいだ、間隔ごとに
 * 倍率ダメージを 1 tick ずつ与える（1 tick の式は damage と同じ。plan/design-nihilister.md 2.1 節）。対象は敵（1 体の前提）。
 * tick の時刻は firstTick で決まる。持続中の再発火は、tick の刻みを変えずに終わりを延ばす（C-0129。frame/plan.ts の dotTickFrames）
 */
export type DotFirstTick = 'atApplication' | 'afterInterval';
export const DOT_FIRST_TICKS = ['atApplication', 'afterInterval'] as const satisfies readonly DotFirstTick[];

export type DotEffect = {
  kind: 'dot';
  trigger: EffectTrigger;
  /** 1 tick の倍率（%）の description_value_NN */
  ref: number;
  /** tick の間隔（秒の即値。説明文の「1秒間隔」は直書き）。維持時間以下 */
  intervalSeconds: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  durationSeconds?: number;
  /**
   * クルミ編: tick の時刻の形（plan/design-kurumi.md 2.1 節）。省略は atApplication。
   * atApplication = 付いた瞬間と、1.5 秒後から間隔ごと（ニヒリスターの火傷。C-0101）、
   * afterInterval = 付いた 1 間隔後から間隔ごと（クルミのハッキング。C-0130）
   */
  firstTick?: DotFirstTick;
  /**
   * クルミ編: 状態異常の名前（「ハッキング」など）。同じキャラの同じ status の dot は 1 つの持続ダメージとして扱い、
   * 発火をまとめて tick を出す（どれで付いても付き直しと同じ。C-0136）。間隔・維持・firstTick・倍率は同じであること。
   * 省略は効果ごとに別の持続ダメージ
   */
  status?: string;
  /**
   * レイヴン編（plan/design-raven-s1.md 2.1 節）: 最大スタック数の description_value_NN。有れば発火のたびに 1 スタック足し
   * （上限で止める）、tick の値は 1 スタックの倍率 × その tick の時点のスタックの数（C-0182）。付け直しで全スタックの時間が
   * 付け直され、まとまりが終われば次は 1 スタックから。firstTick: atApplication とは組み合わせられない
   */
  maxStacksRef?: number;
  /**
   * レイヴン編（2.2 節）: 発火（付けた）ごとに、射手の 1 ヒットぶんのバーストゲージ（targetBurstEnergyPerShot。フルチャージ
   * 倍率なし）を発火のフレームに足す（C-0181）。トリガーは射撃の回数トリガーだけ
   */
  gaugeOnApply?: true;
  /**
   * レイヴン編（2.2 節）: tick ごとに、射手の 1 ヒットぶんのバーストゲージを tick のフレームに足す。スタックの数によらない
   * （C-0181）。firstTick: afterInterval で、維持が間隔の整数倍のときだけ（8 節の 2。解決のときに見る）。トリガーは射撃の回数トリガーか、
   * burstUse（クルミのハッキング。C-0196。plan/design-raven-s1.md 10 節）。同じ status の効果は、どれも同じ値にする（tick は持続ダメージ
   * 1 つの性質なので）
   */
  gaugeOnTick?: true;
  assumes?: LocalizedText;
};

/**
 * アニス：スター S2・バースト編: 周期の自動攻撃（「機能：…自動攻撃する／ダメージ：最終攻撃力の X%／攻撃間隔：N 秒／維持時間：Y 秒」。
 * アニス：スターのシューティングスター、ベスティーのミサイルコンテナ。plan/design-anis-star-s2-burst.md 2.2 節）。
 * 1 ヒットの式と刻みは dot と同じ（解決で dot の形にして流す。skills/burstDamage.ts の resolveDotEffects）。持続ダメージではないので
 * 種類を分け、画面のラベルを「自動攻撃」にする。対象は敵 1 体の前提
 */
export type AutoAttackEffect = {
  kind: 'autoAttack';
  trigger: EffectTrigger;
  /** 1 ヒットの倍率（%）の description_value_NN */
  ref: number;
  /** 攻撃間隔（秒の即値。説明文の「攻撃間隔：0.25秒」は直書き）。維持時間以下 */
  intervalSeconds: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方 */
  durationRef?: number;
  durationSeconds?: number;
  /** 最初のヒットの時刻の形（dot と同じ値）。省略は afterInterval（付いた 1 間隔後から間隔ごと） */
  firstTick?: DotFirstTick;
  /**
   * ヒットごとに射手の 1 ヒットぶんのバーストゲージ（targetBurstEnergyPerShot。フルチャージ倍率なし）をヒットのフレームに足す
   * （dot の gaugeOnTick と同じ。firstTick: afterInterval で、トリガーは射撃の回数トリガーか burstUse）
   */
  gaugePerHit?: true;
  /**
   * ヒットが発射体の爆発か。発射体爆発ダメージ▲を、RL の通常攻撃と同じ形（damage.ts の explosionHitMultiplier）で掛ける
   * （アニス：スターのシューティングスター。V-0124 の 162-12。plan/design-anis-star-s2-burst.md 9.3 節の a）
   */
  projectileExplosion?: true;
  assumes?: LocalizedText;
};

/**
 * フラワー編: トリガーが発火するたびに、射手の 1 ヒットぶんのバーストゲージ（targetBurstEnergyPerShot。フルチャージ倍率は
 * 乗らない）を発火のフレームのゲージに足す。ダメージは出さない（I-DOLL・フラワーの S2。C-0178）。
 * トリガーは時間の周期のトリガー（{ everySeconds }）だけ（plan/design-flower-s2-gauge.md 2 節）
 */
export type BurstGaugeHitEffect = {
  kind: 'burstGaugeHit';
  trigger: TimerTrigger;
  assumes?: LocalizedText;
};

/**
 * アニス：スター編: 「バースト再突入 N 段階に変更」（plan/design-anis-star-rest.md 3 節）。持つ枠のバーストの次の段階（CDN の
 * change_burst_step。BurstUnit.nextStep）を step に差し替える。I を撃った後にもう一度 I に入れば、このチェーンで未使用の
 * 別の I の枠が撃つ。編成の条件（burstStepMix・squad）を付けられる。どのスロットにも書けるが、1 つの定義に 1 つまで
 */
export type BurstReentryEffect = {
  kind: 'burstReentry';
  step: BasicBurstStep;
  burstStepMix?: BurstStepMixCondition;
  squad?: SquadCondition;
  assumes?: LocalizedText;
};

/**
 * 効果・notes の根拠の結論の ID（`C-NNNN`。1 つ以上・重複なし）。どの結論が効果を裏付けるかは、定義のこの欄を正にする
 * （結論の側からは生成物の plan/claims.md・plan/skills.md で引く）。実在と状態の検査は records/skills.ts（npm run records:check・npm test）。
 * モデルの計算には使わない
 */
export type ClaimRefs = { claims?: string[] };

export type SkillEffect = (
  | PassiveEffect
  | BurstDamageEffect
  | TimedEffect
  | DamageEffect
  | InstantEffect
  | WeaponChangeEffect
  | CycleEffect
  | CycleEveryEffect
  | DotEffect
  | AutoAttackEffect
  | BurstGaugeHitEffect
  | BurstReentryEffect
) &
  ClaimRefs;

/** アニス：スター編: 定義のバースト再突入の段階（編成の条件で外した後の定義を渡す）。無ければ null */
export function burstReentryStepOf(definition: SkillDefinition | null | undefined): BasicBurstStep | null {
  if (!definition) return null;
  for (const slot of SKILL_SLOTS) {
    for (const e of definition.skills[slot].effects) if (e.kind === 'burstReentry') return e.step;
  }
  return null;
}

/** 扱わなかった効果や扱い方の説明。claims は「ダメージに関係しない」などの判断の根拠 */
export type SkillNote = LocalizedText & ClaimRefs & { kind: SkillNoteKind };

/** 効果と notes からスロットの対応状況を決める（plan/design-skill-note-kinds.md 2.2 節） */
export function deriveSkillSupport(
  effects: readonly SkillEffect[],
  notes: readonly SkillNote[] | undefined,
): SkillSupport {
  const unimplemented = (notes ?? []).some((n) => n.kind === 'unimplemented');
  if (effects.length > 0) return unimplemented ? 'partial' : 'supported';
  return unimplemented ? 'unsupported' : 'noEffect';
}

export type SkillEntry = {
  /** 効果と notes から読み込みで決める（deriveSkillSupport）。定義の JSON には書かない */
  support: SkillSupport;
  effects: SkillEffect[];
  /** 扱わなかった効果や扱い方の説明。種類は kind */
  notes?: SkillNote[];
  /**
   * 着弾編（plan/design-burst-landing.md 3 節）: 「下位効果のスタック適用」。同じ発動で発火する効果を書いた順に当て、
   * 後の damage は、同じ発動で前に書いた timed の値を足したバフで計算する（C-0163）。ルドミラ：ウィンターオーナー編で
   * スキルのスロットにも書けるようにした（plan/design-ludmilla-wo.md 2.4 節。射撃の回数トリガーの窓は発火の次のフレームから）。
   * burst スロットでは先頭は burstDamage（ヒットの直前のバフのまま）。別スロットの効果は見ない
   */
  sequential?: true;
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

/** 結論の ID の形（records/claims.ts の CLAIM_ID と同じ）。実在は records/skills.ts で見る */
const CLAIM_REF = /^C-\d{4,}$/;

function parseClaimRefs(v: Json, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of claim IDs');
  return v.map((id, i) => {
    if (typeof id !== 'string' || !CLAIM_REF.test(id))
      fail(`${path}[${i}]`, `expected C-<4+ digits>, got ${JSON.stringify(id)}`);
    if (v.indexOf(id) !== i) fail(`${path}[${i}]`, `duplicate claim ID ${id}`);
    return id;
  });
}

function parseNote(v: Json, path: string): SkillNote {
  const text = parseLocalizedText(v, path);
  if (!isRecord(v)) fail(path, 'expected an object');
  const note: SkillNote = { ...text, kind: oneOf(SKILL_NOTE_KINDS, v.kind, `${path}.kind`) };
  if (v.claims !== undefined) note.claims = parseClaimRefs(v.claims, `${path}.claims`);
  return note;
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

/**
 * 受けるダメージ編: damageTaken（敵の受けるダメージ▲）は敵へのデバフなので、味方全体（target 'allies'）にだけ書ける。
 * 武器種・属性で絞ることもできない（敵 1 体の前提で、敵が受ける全ダメージに掛かる）
 */
function validateDamageTaken(stat: BuffStat, target: BuffTarget, v: Record<string, Json>, path: string): void {
  if (stat !== 'damageTaken') return;
  if (target !== 'allies')
    fail(`${path}.target`, `damageTaken must target "allies" (an enemy debuff), got "${target}"`);
  if (v.targetWeapon !== undefined || v.targetElement !== undefined)
    fail(path, 'damageTaken cannot narrow its target by weapon or element (an enemy debuff)');
}

/** Stage 9: targetWeapon は target が self 以外のときだけ（Stage 11 で burstUsers・topAttack にも広げた） */
function parseTargetWeapon(v: Record<string, Json>, target: BuffTarget, path: string): WeaponType | undefined {
  if (v.targetWeapon === undefined) return undefined;
  const weapon = oneOf(WEAPON_TYPES, v.targetWeapon, `${path}.targetWeapon`);
  if (target === 'self')
    fail(`${path}.targetWeapon`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return weapon;
}

/** アスカ: targetElement は targetWeapon と同じく target が self 以外のときだけ */
function parseTargetElement(v: Record<string, Json>, target: BuffTarget, path: string): Element | undefined {
  if (v.targetElement === undefined) return undefined;
  const element = oneOf(ELEMENTS, v.targetElement, `${path}.targetElement`);
  if (target === 'self')
    fail(`${path}.targetElement`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return element;
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
  const targetElement = parseTargetElement(v, target, path);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  if (isFlagStat(stat) || stat === 'fixedChargeTime') fail(`${path}.stat`, `${stat} is only allowed in timed`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  validateDamageTaken(stat, target, v, path);
  const effect: PassiveEffect = { kind: 'passive', target, stat, ref: parseRef(v.ref, `${path}.ref`) };
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
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

/**
 * 文字列なら BuffTrigger、オブジェクトなら回数トリガー。時間の周期のトリガー（{ everySeconds }）は allowTimer のとき
 * （damage・dot・burstGaugeHit）だけ
 */
function parseTrigger(v: Json, path: string, allowTimer = false): EffectTrigger {
  if (typeof v === 'string') return oneOf(BUFF_TRIGGERS, v, path);
  if (!isRecord(v)) fail(path, 'expected a trigger name or a count trigger object');
  if (v.everySeconds !== undefined) {
    if (!allowTimer)
      fail(path, 'a timer trigger ({ everySeconds }) is only allowed in damage, dot, autoAttack and burstGaugeHit');
    for (const key of Object.keys(v)) if (key !== 'everySeconds') fail(`${path}.${key}`, 'unknown field');
    const seconds = v.everySeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.everySeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
    return { everySeconds: seconds };
  }
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
  const targetElement = parseTargetElement(v, target, path);
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
  validateDamageTaken(stat, target, v, path);
  const effect: TimedEffect = { kind: 'timed', trigger, target, stat };
  // Stage 11 モダニア: フラグの stat（装弾数無限）は値を持たないので ref も scaling も書かない
  if (isFlagStat(stat)) {
    if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value (do not write ref)`);
    if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value (do not write scaling)`);
  } else {
    effect.ref = parseRef(v.ref, `${path}.ref`);
  }
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  Object.assign(effect, count);
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) {
    if (isFlagStat(stat)) fail(`${path}.decrease`, `${stat} has no value`);
    effect.decrease = true;
  }
  Object.assign(effect, parseTimedDuration(v, stat, target, path));
  // Stage 11 モダニア: 効果のあるスタック
  if (v.maxStacks !== undefined && v.maxStacksRef !== undefined)
    fail(path, 'at most one of maxStacks and maxStacksRef');
  if (v.maxStacks !== undefined) effect.maxStacks = parsePositiveInt(v.maxStacks, `${path}.maxStacks`);
  if (v.maxStacksRef !== undefined) effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
  if (isFlagStat(stat) && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, `${stat} cannot stack`);
  }
  const byShots = effect.durationShots !== undefined || effect.durationShotsRef !== undefined;
  if (byShots && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, 'a duration in shots cannot stack');
  }
  if (byShots && v.condition !== undefined) fail(`${path}.condition`, 'a duration in shots cannot have a condition');
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
  validateFixedChargeTime(effect, path);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * アニス：スター S2・バースト編: fixedChargeTime（チャージ時間の固定）は値が秒で、足し合わせると意味が無くなるので、
 * 自分にだけ・倍率の書き方なし・スタックなし・条件なしで書ける（plan/design-anis-star-s2-burst.md 2.3 節）
 */
function validateFixedChargeTime(effect: TimedEffect, path: string): void {
  if (effect.stat !== 'fixedChargeTime') return;
  if (effect.target !== 'self') fail(`${path}.target`, `fixedChargeTime is only allowed with target "self"`);
  if (effect.scaling !== undefined) fail(`${path}.scaling`, 'fixedChargeTime is in seconds (do not write scaling)');
  if (effect.decrease) fail(`${path}.decrease`, 'fixedChargeTime cannot be decreased');
  if (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined) fail(path, 'fixedChargeTime cannot stack');
  if (effect.condition !== undefined) fail(`${path}.condition`, 'fixedChargeTime cannot have a condition');
}

/** durationRef / durationSeconds のちょうど片方 */
/**
 * ヘルム編: timed の維持。秒（durationRef / durationSeconds）か発数（durationShots / durationShotsRef）のちょうど 1 つ。
 * 発数の窓は 1 パス目の射撃の列から後で決めるので、1 パス目のループの中で窓を追う stat と順位の対象には書けない
 */
function parseTimedDuration(
  v: Record<string, Json>,
  stat: BuffStat,
  target: BuffTarget,
  path: string,
): { durationRef?: number; durationSeconds?: number; durationShots?: number; durationShotsRef?: number } {
  const hasShots = v.durationShots !== undefined;
  const hasShotsRef = v.durationShotsRef !== undefined;
  if (!hasShots && !hasShotsRef) return parseDuration(v, path);
  if (hasShots && hasShotsRef) fail(path, 'at most one of durationShots and durationShotsRef');
  if (v.durationRef !== undefined || v.durationSeconds !== undefined) {
    fail(path, 'a duration is either in seconds or in shots, not both');
  }
  if (stat === 'attack' || isFiringStat(stat) || isStateStat(stat) || isFlagStat(stat)) {
    fail(
      `${path}.stat`,
      `a duration in shots is not supported for "${stat}" (its window is tracked inside the first pass)`,
    );
  }
  if (target === 'topAttack') fail(`${path}.target`, 'a duration in shots cannot target "topAttack"');
  if (hasShots) return { durationShots: parsePositiveInt(v.durationShots, `${path}.durationShots`) };
  return { durationShotsRef: parseRef(v.durationShotsRef, `${path}.durationShotsRef`) };
}

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
    if (
      !['kind', 'trigger', 'damageRef', 'hitsPerShot', 'durationRef', 'durationSeconds', 'assumes', 'claims'].includes(
        key,
      )
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const effect: WeaponChangeEffect = {
    kind: 'weaponChange',
    trigger: parseTrigger(v.trigger, `${path}.trigger`),
    damageRef: parseRef(v.damageRef, `${path}.damageRef`),
    ...parseDuration(v, path),
  };
  if (v.hitsPerShot !== undefined) effect.hitsPerShot = parsePositiveInt(v.hitsPerShot, `${path}.hitsPerShot`);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * V-0030: 段のゲージのヒットの遅れ（minDelay 以上の整数・昇順・1 つ以上）。段は射撃と同じフレームのゲージを足し終えた後に数えるので
 * 1 以上。damage の gaugeHits は射撃と同じフレームのゲージに足せるので 0 から（V-0035 のモダニア）
 */
function parseGaugeHits(v: Json, path: string, minDelay: 0 | 1): number[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of frame delays');
  return v.map((d, i) => {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < minDelay) {
      fail(`${path}[${i}]`, minDelay === 1 ? 'expected a positive integer' : 'expected a non-negative integer');
    }
    const prev = v[i - 1];
    if (i > 0 && typeof prev === 'number' && d < prev) fail(`${path}[${i}]`, 'delays must be ascending');
    return d;
  });
}

/** Stage 11 紅蓮BS: 段の循環 */
function parseCycleEffect(v: Record<string, Json>, path: string): CycleEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'steps', 'assumes', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (!isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'a cycle needs a shot count trigger');
  if (trigger.count === 'lastShot') fail(`${path}.trigger.count`, 'lastShot is not allowed in a cycle');
  if (trigger.stacksRef !== undefined) fail(`${path}.trigger.stacksRef`, 'stacksRef is not allowed in a cycle');
  if (!Array.isArray(v.steps) || v.steps.length < 2) fail(`${path}.steps`, 'expected an array of at least 2 steps');
  const steps = v.steps.map((raw, i): CycleStep => {
    const stepPath = `${path}.steps[${i}]`;
    if (!isRecord(raw)) fail(stepPath, 'expected an object');
    for (const key of Object.keys(raw)) {
      if (!['kind', 'ref', 'damageType', 'gaugeHits', 'assumes'].includes(key)) {
        fail(`${stepPath}.${key}`, 'unknown field');
      }
    }
    if (raw.kind !== 'damage') fail(`${stepPath}.kind`, `expected "damage", got ${JSON.stringify(raw.kind)}`);
    const step: CycleStep = {
      kind: 'damage',
      ref: parseRef(raw.ref, `${stepPath}.ref`),
      damageType: oneOf(SKILL_DAMAGE_TYPES, raw.damageType, `${stepPath}.damageType`),
    };
    if (raw.gaugeHits !== undefined) step.gaugeHits = parseGaugeHits(raw.gaugeHits, `${stepPath}.gaugeHits`, 1);
    if (raw.assumes !== undefined) step.assumes = parseLocalizedText(raw.assumes, `${stepPath}.assumes`);
    return step;
  });
  const effect: CycleEffect = { kind: 'cycle', trigger, steps };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** Stage 11 紅蓮BS: 循環の間隔の変更。slot に cycle がちょうど 1 つあるかは定義全体で見る（validateCycles） */
function parseCycleEveryEffect(v: Record<string, Json>, path: string): CycleEveryEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'slot', 'every', 'durationRef', 'durationSeconds', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  // 自分の射撃で自分の循環を速めると判定が循環するので、射撃の回数トリガーは書けない（plan/design-stage11-scarlet-bs.md 2.2 節）
  if (isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'cycleEvery cannot be triggered by a shot count');
  const effect: CycleEveryEffect = {
    kind: 'cycleEvery',
    trigger,
    slot: oneOf(SKILL_SLOTS, v.slot, `${path}.slot`),
    every: parsePositiveInt(v.every, `${path}.every`),
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
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  // Stage 11 モダニア: 射撃ごと（every = 1）の倍率ダメージも書ける。1 トリガーの値に畳み込む（skills/burstDamage.ts の resolvePerShotDamage）
  const damageType = oneOf(SKILL_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: DamageEffect = { kind: 'damage', trigger, ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.gaugeHits !== undefined) {
    // ヘルム編: ゲージは 1 パス目で射撃を数えて予約するので、射撃の回数トリガーのときだけ
    if (!isShotCountTrigger(trigger)) fail(`${path}.gaugeHits`, 'gaugeHits needs a shot count trigger');
    if (trigger.stacksRef !== undefined) fail(`${path}.gaugeHits`, 'gaugeHits cannot be used with stacksRef');
    effect.gaugeHits = parseGaugeHits(v.gaugeHits, `${path}.gaugeHits`, 0);
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * ニヒリスター編: 持続ダメージ。間隔は正の有限数。維持時間との比較（間隔 ≤ 維持）は、durationRef なら Lv で決まるので解決時に見る
 * （skills/burstDamage.ts の resolveDotEffects）
 */
function parseDotEffect(v: Record<string, Json>, path: string): DotEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'ref',
        'intervalSeconds',
        'durationRef',
        'durationSeconds',
        'firstTick',
        'status',
        'maxStacksRef',
        'gaugeOnApply',
        'gaugeOnTick',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const interval = v.intervalSeconds;
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) {
    fail(`${path}.intervalSeconds`, `expected a positive finite number, got ${JSON.stringify(interval)}`);
  }
  const effect: DotEffect = {
    kind: 'dot',
    trigger: parseTrigger(v.trigger, `${path}.trigger`, true),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...parseDuration(v, path),
  };
  if (effect.durationSeconds !== undefined && effect.durationSeconds < interval) {
    fail(`${path}.intervalSeconds`, `must not exceed the duration (${effect.durationSeconds} s)`);
  }
  if (v.firstTick !== undefined) {
    if (typeof v.firstTick !== 'string' || !(DOT_FIRST_TICKS as readonly string[]).includes(v.firstTick)) {
      fail(`${path}.firstTick`, `expected one of ${DOT_FIRST_TICKS.join(', ')}, got ${JSON.stringify(v.firstTick)}`);
    }
    effect.firstTick = v.firstTick as DotFirstTick;
  }
  if (v.status !== undefined) {
    if (typeof v.status !== 'string' || v.status.trim() === '') {
      fail(`${path}.status`, `expected a non-empty string, got ${JSON.stringify(v.status)}`);
    }
    effect.status = v.status;
  }
  if (v.maxStacksRef !== undefined) {
    effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
    if (effect.firstTick !== 'afterInterval') fail(`${path}.maxStacksRef`, 'needs firstTick afterInterval');
  }
  for (const key of ['gaugeOnApply', 'gaugeOnTick'] as const) {
    if (v[key] === undefined) continue;
    if (v[key] !== true) fail(`${path}.${key}`, 'expected true');
    // V-0113: tick のゲージは、バースト使用時に付くハッキング（クルミ）にも要る。付けたときの分は射撃の回数トリガーだけ
    if (key === 'gaugeOnTick' && effect.trigger === 'burstUse') {
      effect[key] = true;
      continue;
    }
    if (!isShotCountTrigger(effect.trigger)) {
      fail(
        `${path}.${key}`,
        key === 'gaugeOnTick' ? 'needs a shot count trigger or burstUse' : 'needs a shot count trigger',
      );
    }
    effect[key] = true;
  }
  if (effect.gaugeOnTick === true && effect.firstTick !== 'afterInterval') {
    fail(`${path}.gaugeOnTick`, 'needs firstTick afterInterval');
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** アニス：スター S2・バースト編: 周期の自動攻撃。検証の規則は dot の同じ欄と同じ */
function parseAutoAttackEffect(v: Record<string, Json>, path: string): AutoAttackEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'ref',
        'intervalSeconds',
        'durationRef',
        'durationSeconds',
        'firstTick',
        'gaugePerHit',
        'projectileExplosion',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const interval = v.intervalSeconds;
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) {
    fail(`${path}.intervalSeconds`, `expected a positive finite number, got ${JSON.stringify(interval)}`);
  }
  const effect: AutoAttackEffect = {
    kind: 'autoAttack',
    trigger: parseTrigger(v.trigger, `${path}.trigger`, true),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...parseDuration(v, path),
  };
  if (effect.durationSeconds !== undefined && effect.durationSeconds < interval) {
    fail(`${path}.intervalSeconds`, `must not exceed the duration (${effect.durationSeconds} s)`);
  }
  if (v.firstTick !== undefined) {
    if (typeof v.firstTick !== 'string' || !(DOT_FIRST_TICKS as readonly string[]).includes(v.firstTick)) {
      fail(`${path}.firstTick`, `expected one of ${DOT_FIRST_TICKS.join(', ')}, got ${JSON.stringify(v.firstTick)}`);
    }
    effect.firstTick = v.firstTick as DotFirstTick;
  }
  if (v.gaugePerHit !== undefined) {
    if (v.gaugePerHit !== true) fail(`${path}.gaugePerHit`, 'expected true');
    if (effect.trigger !== 'burstUse' && !isShotCountTrigger(effect.trigger)) {
      fail(`${path}.gaugePerHit`, 'needs a shot count trigger or burstUse');
    }
    if ((effect.firstTick ?? 'afterInterval') !== 'afterInterval') {
      fail(`${path}.gaugePerHit`, 'needs firstTick afterInterval');
    }
    effect.gaugePerHit = true;
  }
  if (v.projectileExplosion !== undefined) {
    if (v.projectileExplosion !== true) fail(`${path}.projectileExplosion`, 'expected true');
    effect.projectileExplosion = true;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstGaugeHitEffect(v: Record<string, Json>, path: string): BurstGaugeHitEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'assumes', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  if (!isTimerTrigger(trigger)) fail(`${path}.trigger`, 'burstGaugeHit needs a timer trigger ({ everySeconds })');
  const effect: BurstGaugeHitEffect = { kind: 'burstGaugeHit', trigger };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstReentryEffect(v: Record<string, Json>, path: string): BurstReentryEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'step', 'burstStepMix', 'squad', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const effect: BurstReentryEffect = { kind: 'burstReentry', step: oneOf(BASIC_BURST_STEPS, v.step, `${path}.step`) };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseInstantEffect(v: Record<string, Json>, path: string, kind: InstantKind): InstantEffect {
  // 維持時間は heal だけ（plan/design-heal-window.md 1.1 節）
  const durationKeys = kind === 'heal' ? ['durationRef', 'durationSeconds'] : [];
  const compositionKeys = kind === 'cooldownReduction' ? ['burstStepMix', 'squad'] : [];
  const scalingKeys = kind === 'ammoRefill' ? ['scaling'] : [];
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'targetWeapon',
        'targetElement',
        'targetCount',
        'targetCountRef',
        'ref',
        ...durationKeys,
        ...compositionKeys,
        ...scalingKeys,
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const hasDuration = v.durationRef !== undefined || v.durationSeconds !== undefined;
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  // 回復で回復を起こすと連鎖が閉じないので、heal のトリガーに healed は書けない（plan/design-stage11.md 3.3 節）
  if (kind === 'heal' && trigger === 'healed') fail(`${path}.trigger`, 'heal cannot be triggered by "healed"');
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  validateBurstUsersTarget(target, trigger, path);
  // 回復 → healed の攻撃力の窓 → 順位 → 回復の対象、と循環するので heal には書けない（plan/design-stage11.md 19.3 節）
  if (kind === 'heal' && target === 'topAttack') fail(`${path}.target`, 'heal cannot target "topAttack"');
  // ヘルム編: ゲージは編成で 1 本なので、対象は味方全体だけ（絞り込みも書けない）
  if (kind === 'burstGauge') {
    if (target !== 'allies') fail(`${path}.target`, 'burstGauge must target "allies" (the team shares one gauge)');
    for (const key of ['targetWeapon', 'targetElement', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, 'burstGauge cannot narrow its target');
    }
  }
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const count = parseTargetCount(v, target, path);
  // burstGauge は上で対象を allies に限り、絞り込みの欄も弾いてある
  const effect = { kind, trigger, target, ref: parseRef(v.ref, `${path}.ref`) } as InstantEffect;
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (kind !== 'heal') Object.assign(effect, count);
  if (hasDuration) Object.assign(effect, parseDuration(v, path));
  if (v.scaling !== undefined) {
    if (v.scaling !== 'flat') fail(`${path}.scaling`, `ammoRefill only takes "flat", got ${JSON.stringify(v.scaling)}`);
    (effect as AmmoRefillEffect).scaling = 'flat';
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseRef(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * passive は skill1 / skill2 にだけ、burstDamage は burst にだけ、timed・damage・即時効果・weaponChange・cycle・cycleEvery・dot・
 * burstGaugeHit はどのスロットにも書ける
 */
function parseEffect(v: Json, path: string, slot: SkillSlot): SkillEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  const effect: SkillEffect = parseEffectBody(v, path, slot);
  for (const key of ['burstStepMix', 'squad'] as const) {
    if (v[key] === undefined) continue;
    if (
      effect.kind !== 'passive' &&
      effect.kind !== 'timed' &&
      effect.kind !== 'cooldownReduction' &&
      effect.kind !== 'burstReentry'
    ) {
      fail(
        `${path}.${key}`,
        `only allowed in passive, timed, cooldownReduction and burstReentry, found in ${effect.kind}`,
      );
    }
    if (key === 'burstStepMix') effect.burstStepMix = parseBurstStepMixCondition(v[key], `${path}.${key}`);
    else effect.squad = parseSquadCondition(v[key], `${path}.${key}`);
  }
  if (v.claims !== undefined) effect.claims = parseClaimRefs(v.claims, `${path}.claims`);
  return effect;
}

/** アニス：スター編: バースト段階の構成の条件 */
function parseBurstStepMixCondition(v: Json, path: string): BurstStepMixCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) {
    if (key !== 'otherBurstStep' && key !== 'present') fail(`${path}.${key}`, 'unknown field');
  }
  const otherBurstStep = oneOf(BASIC_BURST_STEPS, v.otherBurstStep, `${path}.otherBurstStep`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { otherBurstStep, present: v.present };
}

/** ラム編: 同じ部隊の味方の条件 */
function parseSquadCondition(v: Json, path: string): SquadCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) if (key !== 'present') fail(`${path}.${key}`, 'unknown field');
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { present: v.present };
}

function parseEffectBody(v: Record<string, Json>, path: string, slot: SkillSlot): SkillEffect {
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
  if (v.kind === 'cooldownReduction' || v.kind === 'ammoRefill' || v.kind === 'heal' || v.kind === 'burstGauge') {
    return parseInstantEffect(v, path, v.kind);
  }
  if (v.kind === 'weaponChange') return parseWeaponChangeEffect(v, path);
  if (v.kind === 'cycle') return parseCycleEffect(v, path);
  if (v.kind === 'cycleEvery') return parseCycleEveryEffect(v, path);
  if (v.kind === 'dot') return parseDotEffect(v, path);
  if (v.kind === 'autoAttack') return parseAutoAttackEffect(v, path);
  if (v.kind === 'burstGaugeHit') return parseBurstGaugeHitEffect(v, path);
  if (v.kind === 'burstReentry') return parseBurstReentryEffect(v, path);
  fail(
    `${path}.kind`,
    `expected "passive", "burstDamage", "timed", "damage", "cooldownReduction", "ammoRefill", "heal", "burstGauge", "weaponChange", "cycle", "cycleEvery", "dot", "autoAttack", "burstGaugeHit" or "burstReentry", got ${JSON.stringify(v.kind)}`,
  );
}

function parseEntry(v: Json, slot: SkillSlot, root: 'skills' | 'treasureSkills' = 'skills'): SkillEntry {
  const path = `${root}.${slot}`;
  if (!isRecord(v)) fail(path, 'expected an object');
  if (v.support !== undefined)
    fail(`${path}.support`, 'support is derived from effects and notes (plan/design-skill-note-kinds.md); remove it');
  if (!Array.isArray(v.effects)) fail(`${path}.effects`, 'expected an array');
  const effects = v.effects.map((e, i) => parseEffect(e, `${path}.effects[${i}]`, slot));
  let notes: SkillNote[] | undefined;
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes)) fail(`${path}.notes`, 'expected an array');
    notes = v.notes.map((n, i) => parseNote(n, `${path}.notes[${i}]`));
  }
  if (effects.length === 0 && (notes ?? []).length === 0)
    fail(`${path}.notes`, 'a slot without effects needs notes saying why');
  const entry: SkillEntry = { support: deriveSkillSupport(effects, notes), effects };
  if (v.sequential !== undefined) {
    if (v.sequential !== true) fail(`${path}.sequential`, 'expected true');
    // ルドミラ：ウィンターオーナー編: スキルのスロットにも書ける（plan/design-ludmilla-wo.md 2.4 節）。burst は先頭が burstDamage
    if (slot === 'burst' && effects[0]?.kind !== 'burstDamage') {
      fail(`${path}.sequential`, 'the first effect of a sequential burst must be burstDamage');
    }
    entry.sequential = true;
  }
  if (notes !== undefined) entry.notes = notes;
  return entry;
}

/**
 * Stage 11 紅蓮BS: cycle は 1 スロットに 1 つまで。cycleEvery の slot にはちょうど 1 つの cycle があり、
 * every が即値ならそれより小さい（間隔を「速める」効果だけ。everyRef との比較は Lv で決まるので解決時に見る）
 */
function validateCycles(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    const cycles = entries[slot]?.effects.filter((e) => e.kind === 'cycle') ?? [];
    if (cycles.length > 1) fail(`${root}.${slot}.effects`, 'at most one cycle per skill');
  }
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'cycleEvery') return;
      const path = `${root}.${slot}.effects[${i}]`;
      const target = entries[e.slot]?.effects.find((x): x is CycleEffect => x.kind === 'cycle');
      if (target === undefined) fail(`${path}.slot`, `${e.slot} has no cycle`);
      if (target.trigger.every !== undefined && e.every >= target.trigger.every) {
        fail(`${path}.every`, `must be less than the cycle's every (${target.trigger.every})`);
      }
    });
  }
}

/** アニス：スター S2・バースト編: チャージ時間の固定は 1 つの定義に 1 つまで（重なると秒が足し合わされる） */
function validateFixedChargeTimeCount(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const count = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e) => e.kind === 'timed' && e.stat === 'fixedChargeTime',
  ).length;
  if (count > 1) fail(root, 'at most one fixedChargeTime effect per definition');
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
  // アニス：スター編: バースト再突入は 1 つの定義に 1 つまで（次の段階は 1 つしか持てない）
  if (SKILL_SLOTS.flatMap((slot) => skills[slot]!.effects).filter((e) => e.kind === 'burstReentry').length > 1) {
    fail('skills', 'at most one burstReentry effect per definition');
  }
  validateCycles(skills, 'skills');
  validateFixedChargeTimeCount(skills, 'skills');
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
    validateCycles({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateFixedChargeTimeCount({ ...skills, ...treasureSkills }, 'treasureSkills');
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
