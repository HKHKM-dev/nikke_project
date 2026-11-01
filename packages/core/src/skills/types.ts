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
// モラン編で、burstGaugeHit に射撃の回数のトリガーを書けるようにした（plan/design-moran.md 2 節）。
// V-0534 で、射撃の回数のきっかけで自分の射撃を止める効果（shotPause。ラピ：レッドフード S2 の粘着榴弾）を足した。
// ソルジャーE.G. 編で、確率のきっかけ（回数トリガーの chance / chanceRef。期待値の窓）を足し、時間の周期のトリガーを 1 パス目で
// 窓を追う stat の timed にも書けるようにした（plan/design-soldier-eg.md 3.1・3.2 節）。
// 名前の付いた状態の語彙編で、状態の付与（state。値を持たない持続効果と、状態の間だけ効く中身 contents）を足し、状態の名前を
// 目録（skills/states.ts）の id にそろえた（ペルソナ編の states・timed の name、クルミ編の dot の status を置き換えた）。条件は
// timed・付与・damage で 1 つの型（鍵の AND）にした（plan/design-named-state.md 5 節・10 節の論点 8）。
// 定義は packages/core/data/skills/{resourceId}.json に手書きし、数値は CharacterData.skills の values を ref で参照する。
// 効果と notes には、根拠の結論の ID（claims）を書ける（plan/skills-guide.md 3 節。実在の検査は records/skills.ts）。
import { ELEMENTS } from '../element.ts';
import { C_ID } from '../records/ids.ts';
import type { Element, LocalizedText, NikkeClass, SkillSlot, WeaponType } from '../types.ts';
import { WEAPON_TYPES } from '../weapons.ts';
import { COUNTER_IDS, counterMax, type CounterId } from './counters.ts';
import { dependsOnRank } from './targets.ts';
import { NAMED_STATE_IDS, namedStateHolder, stateMatches, type NamedStateId, type StateHolder } from './states.ts';

export type { SkillSlot };
export const SKILL_SLOTS = ['skill1', 'skill2', 'burst'] as const satisfies readonly SkillSlot[];

/**
 * 何が上がるか。Stage 8 の 2 つ:
 * distributedDamage = 分配ダメージの乗数 (1 + Σ)。distributed の倍率ダメージにだけ掛かる（録画 0021 で攻撃ダメージ▲と別枠の乗数と確認。受けるダメージ▲とは 1 つの和。C-0767）。
 * burstGaugeSpeed = バーストゲージのチャージ速度 (1 + Σ)。対象の枠の射撃で溜まるゲージに掛かる。Stage 8 では passive にだけ
 * 書けた（timed に書くと 時刻表 → バフ窓 → ゲージ → 時刻表 と循環したため）。2 段目の段 1（plan/design-skill-stage1.md 1.6 節）で、
 * 1 パス目がフレームごとに件を作るようになったので、timed と状態の中身にも書ける（f − 1 までに付いた件を、射手と同じに読む）。
 * Stage 10 の 3 つ（射撃に効く。ダメージの式は読まない）:
 * maxAmmo = 最大装弾数（scaling 'ratio' は %、'flat' は発数）、reloadSpeed = リロード速度（%）、chargeSpeed = チャージ速度（%）。
 * 1 パス目（frame/firstPass.ts）が射手に渡すので、timed にも書ける。
 * Stage 11 モダニアの 2 つ:
 * hitRate = 命中率（%）。射撃には効かない。条件（condition）の判定と表示と、条件が自動の枠の弾丸命中率・コア命中率の N
 * （frame/landing.ts。コアは常時が C-0036・持続が C-0170、弾丸は C-0192）に使う。N は 2 パス目の与ダメージと、1 パス目のゲージ・
 * 命中の期待値の両方に掛かる（HIT_STATE_STATS）。
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
 * 2 段目の段 2（plan/design-skill-stage2.md）: enemyDefenseDown = 敵の防御力▼（敵へのデバフ）。受けるダメージ▲と同じく敵が持ち、
 * 味方全体（target 'allies' だけ）の与ダメージの式で、防御力を (1 − Σ) 倍にしてから引く（max(1, 攻撃力 − 防御力 × (1 − Σ))。
 * 通常攻撃・倍率ダメージ・持続ダメージに共通。Σ は 0〜1 に収める）
 * アニス：スター S2・バースト編（plan/design-anis-star-s2-burst.md 2.1・2.3 節）:
 * projectileExplosionDamage = 発射体爆発ダメージ▲。発射体の爆発を持つ武器（RL）の通常攻撃にだけ掛ける（式の中の置き場所は
 * damage.ts の PROJECTILE_EXPLOSION_BUCKET）。2 段目の段 12 の PR 2 で、projectileExplosion の印の付いた damage（粘着榴弾の起爆）にも掛ける。
 * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.3・2.4 節）:
 * projectileStickDamage = 発射体付着ダメージ▲。projectileStick の印の付いた damage（粘着榴弾の付着）にだけ掛ける（式の中の置き場所は
 * damage.ts の PROJECTILE_STICK_BUCKET）。
 * elementAdvantage = 「〈コード〉コードの敵に有利コードのダメージ適用」。値を持たないフラグ（ref を書かない。passive の self だけ）。
 * 効いていれば、敵のコードが自分のコードの有利でなくても有利として扱う（element.ts の elementMultiplier。有利コードの攻撃ダメージ▲の
 * 掛かり方も同じ）。どのコードの敵かは効果の enemyElement で書く。
 * fixedChargeTime = 「チャージ時間 N 秒に固定」。射撃に効く。値は秒（100 で割らない）。timed の self だけ。2 段目の段 14 の PR 3: 自分に付く
 * 状態の中身にも書け、付いている間は timed の固定より勝つ（skills/buffs.ts の applyResolvedEffect。plan/design-skill-stage14.md 2.7 節）
 * 防御力無視ダメージ編（plan/design-true-damage-element.md 3.1 節）:
 * trueDamage = 防御力無視ダメージ▲。防御力無視ダメージの発（trueDamageConversion の窓の通常攻撃と、trueDamage の使用武器の変更）
 * にだけ乗る（式の中の置き場所は damage.ts の TRUE_DAMAGE_BUCKET）。
 * trueDamageConversion = 「通常攻撃が防御力無視ダメージに変化」。値を持たないフラグ（ref を書かない。timed の self だけ）。
 * 窓のあいだ、自分の通常攻撃の 1 発の基礎を max(1, 攻撃力 − 防御力) から max(1, 攻撃力) にする
 * 持続ダメージ▲編（plan/design-sustained-damage-up.md 3 節）: sustainedDamage = 持続ダメージ▲。その枠の持続ダメージ（dot）の tick に
 * だけ掛ける（autoAttack には掛けない）。式の中の置き場所は skills/burstDamage.ts の SUSTAINED_DAMAGE_PLACEMENT
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.2 節）: attackSpeed = 攻撃速度▲（比率）。レートを蓄積して撃つ武器（AR・SMG・SG）の
 * マガジンの中の発と発の間を、レート × (1 + Σ) にする（V-0458。C-0600）。リロード・リロード明けの 1 発目の待ち・構えは変えない。射撃に効く
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
  | 'enemyDefenseDown'
  | 'projectileExplosionDamage'
  | 'projectileStickDamage'
  | 'elementAdvantage'
  | 'fixedChargeTime'
  | 'trueDamage'
  | 'trueDamageConversion'
  | 'sustainedDamage'
  | 'maxHp'
  | 'maxHpOnly'
  | 'defense'
  | 'attackSpeed'
  | 'burstCooldown'
  | 'sequentialAttackDamage'
  | 'spinUpSpeed';
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
  'enemyDefenseDown',
  'projectileExplosionDamage',
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.3 節）: 発射体付着ダメージ▲（粘着榴弾の付着のヒットにだけ掛ける）
  'projectileStickDamage',
  // 同 2.4 節: 「〈コード〉コードの敵に有利コードのダメージ適用」（フラグ。passive の self だけ。enemyElement でそのコードの敵に限る）
  'elementAdvantage',
  'fixedChargeTime',
  'trueDamage',
  'trueDamageConversion',
  'sustainedDamage',
  // 2 段目の段 6 の PR 2（plan/design-skill-stage6.md 2.4 節）: 最大HP▲（比率）。与ダメージの式は読まず、発動者の最終最大HP 基準の
  // 攻撃力▲（casterFinalMaxHp）だけが読む。「最大HP のみ▲」はこの stat では書かない（definitions.test.ts）
  'maxHp',
  // 2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.4 節）: 最大HP のみ▲（比率）。最終最大HP への足し方は maxHp と同じ。効いている
  // 間 HP の割合を下げる読み（段 6 の論点 8）は、HP の割合を読む側（selfHp・lowestHpRatio）が枠の想定で一定のままなので未実装
  'maxHpOnly',
  // 2 段目の段 7（plan/design-skill-stage7.md 1.3 節）: 防御力▲（比率）。与ダメージの式は読まず、対象の絞り込み
  // 「自分より最終防御力が低い味方」（targetDefense）だけが、発火のフレームの最終防御力として読む
  'defense',
  // 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.2 節）: 攻撃速度▲（比率）。射手のレートの蓄積に (1 + Σ) を掛ける（frame/firing.ts）
  'attackSpeed',
  // 2 段目の段 11 の PR 3（plan/design-skill-stage11.md 3.3 節。V-0530）: バーストスキルのクールタイム X 秒▼ の維持の付いた形（T4。
  // 「その間スキル自体のクールタイムを変える」）。scaling 'flat' だけで、値は縮める秒（正の値）。効いている間にバーストを使うと、
  // その発動の CT が X 秒短い（frame/firstPass.ts。0 秒より短くしない）。与ダメージの式は読まない
  'burstCooldown',
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.5 節）: 順番攻撃ダメージ▲（比率）。「N 回順番に攻撃」の倍率ダメージ
  // （damage の hitsRef）にだけ、別枠の乗数 (1 + Σ) で掛ける（分配ダメージ▲と同じ置き方。仮説。skills/burstDamage.ts の computeBurstHit）
  'sequentialAttackDamage',
  // 同 5.6 節: マシンガン立ち上げ速度▲（比率）。MG のレートの上がり方（1 発ごとの rateOfFireChangePerShot）に (1 + Σ) を掛ける
  // （読みは仮説。論点 I。cadence.ts の rateAfterShots）。スピンアップの無い武器には効かない。射撃に効く
  'spinUpSpeed',
] as const satisfies readonly BuffStat[];

/**
 * Stage 10: 射撃に効く stat（射手の実効値を変える）。Stage 11 モダニアで装弾数無限、アニス：スター編でチャージ時間の固定、2 段目の段 9 の
 * PR 2 で攻撃速度を足した
 */
export const FIRING_STATS = [
  'maxAmmo',
  'reloadSpeed',
  'chargeSpeed',
  'infiniteAmmo',
  'fixedChargeTime',
  'attackSpeed',
  'spinUpSpeed',
] as const satisfies readonly BuffStat[];

/** 射撃に効くか。Stage 11 モダニア: 解決後の使用武器の変更（stat 'weapon'。skills/resolve.ts の EffectStat）も射撃に効く */
export function isFiringStat(stat: BuffStat | 'weapon'): boolean {
  return stat === 'weapon' || (FIRING_STATS as readonly string[]).includes(stat);
}

/**
 * Stage 11 モダニア: 状態だけを表す stat（射撃に効かない）。timed の件は区間の timedEffects に入れない。区間を割り、区間の
 * buffs と鍵に入るのは、着地点の計画（条件が自動の枠）があるときだけ（C-0170。手入力の枠の区間・グループは変わらない）
 */
export const STATE_STATS = ['hitRate'] as const satisfies readonly BuffStat[];

export function isStateStat(stat: BuffStat | 'weapon'): boolean {
  return (STATE_STATS as readonly string[]).includes(stat);
}

/**
 * 当たり（弾丸命中率・コア命中率）を変える状態の stat。1 パス目（frame/firstPass.ts）が窓を追い、条件が自動の枠のゲージと
 * 命中の期待値に、2 パス目と同じ N（常時 + 持続）で掛ける（plan/design-sustained-hit-rate-gauge.md）
 */
export const HIT_STATE_STATS = ['hitRate'] as const satisfies readonly (typeof STATE_STATS)[number][];

export function isHitStateStat(stat: BuffStat | 'weapon'): boolean {
  return (HIT_STATE_STATS as readonly string[]).includes(stat);
}

/**
 * Stage 11 モダニア: 値を持たないフラグの stat（ref を書かない）。防御力無視ダメージ編で trueDamageConversion を、2 段目の段 12 の PR 2 で
 * elementAdvantage（passive だけ）を足した
 */
export const FLAG_STATS = [
  'infiniteAmmo',
  'trueDamageConversion',
  'elementAdvantage',
] as const satisfies readonly BuffStat[];

/** 2 段目の段 12 の PR 2: passive に書けるフラグの stat（ref を書かない。値 1） */
export const PASSIVE_FLAG_STATS = ['elementAdvantage'] as const satisfies readonly BuffStat[];

export function isPassiveFlagStat(stat: BuffStat): boolean {
  return (PASSIVE_FLAG_STATS as readonly string[]).includes(stat);
}

export function isFlagStat(stat: BuffStat): boolean {
  return (FLAG_STATS as readonly string[]).includes(stat);
}

/**
 * どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算、
 * flat = 実数の固定加算（Stage 10。stat が maxAmmo のときだけ。値は発数で 100 で割らない）、
 * casterChargeTime = 発動者の基礎チャージ時間 × 比率の秒数を対象のチャージ時間から引く（Stage 11 アリス編。stat が chargeSpeed のときだけ。
 * 「スキル発動者基準でチャージ速度 X%▲」。録画 0042 でアドミ（1 秒）が 0.175 秒縮んだ。plan/design-stage11.md 27 節）、
 * casterFinalMaxHp = 発動者の最終最大HP × 比率を攻撃力に固定加算する（2 段目の段 6。stat が attack のときだけ。「スキル発動者の
 * 最終最大HP の X% 分の攻撃力▲」。plan/design-skill-stage6.md 1.3 節。録画 0121 のラプラス：アルティメットヒーロー）、
 * casterDefence = 発動者のバフ前防御力 × 比率を敵の防御力から引く（マスト編。stat が enemyDefenseDown のときだけ。「スキル発動者基準で
 * 防御力 X%▼」。plan/design-mast.md 2.2 節）
 */
export type BuffScaling = 'ratio' | 'casterAttack' | 'flat' | 'casterChargeTime' | 'casterFinalMaxHp' | 'casterDefence';
export const BUFF_SCALINGS = [
  'ratio',
  'casterAttack',
  'flat',
  'casterChargeTime',
  'casterFinalMaxHp',
  'casterDefence',
] as const satisfies readonly BuffScaling[];

/**
 * 効果の対象。Stage 11: burstUsers = 「直前にバーストスキルを使用した味方」（そのフルバーストを開いたチェーンでバーストを撃った枠）。
 * トリガーが fullBurstStart / fullBurstEnd のときだけ書ける（発火のたびに対象が変わる。skills/targets.ts）。
 * Stage 11 アリス編: topAttack = 「最終攻撃力が最も高い味方 N 機」（発火のフレームの最終攻撃力の順位。自分も候補。skills/ranking.ts）。
 * N は targetCount / targetCountRef。passive には書けない。heal の順位は、そのフレームに付く件を入れずに出す
 * （plan/design-heal-top-attack.md 2 節。frame/firstPass.ts）。
 * 対象の語彙編（plan/design-target-vocab.md 2.2 節）: longestChargeTime = 「基本チャージ時間が一番長い味方 N 機」
 * （CharacterData.shot.chargeTime の長い順。同値は枠の若い順。編成で決まるので最上位の skills/composition.ts で対象の枠を決める）。
 * N は topAttack と同じ欄。timed にだけ書ける。
 * 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: lowestHpRatio = 「残りの HP の割合が最も低い味方 N 機」（枠の HP の割合の想定
 * TeamSlotInput.hpRatio の低い順。同値は枠の若い順（C-0567）。自分も候補。想定は戦闘中一定なので skills/composition.ts で対象の枠を
 * 決める）。N は topAttack と同じ欄。heal にだけ書ける
 */
export type BuffTarget = 'self' | 'allies' | 'burstUsers' | 'topAttack' | 'longestChargeTime' | 'lowestHpRatio';
export const BUFF_TARGETS = [
  'self',
  'allies',
  'burstUsers',
  'topAttack',
  'longestChargeTime',
  'lowestHpRatio',
] as const satisfies readonly BuffTarget[];

/** 対象の語彙編: N 機を選ぶ対象（targetCount / targetCountRef を持つ）。段 17 の PR 2: coverHeal の lowestCoverHp も */
export function isCountedTarget(target: BuffTarget | CoverHealEffect['target']): boolean {
  return (
    target === 'topAttack' || target === 'longestChargeTime' || target === 'lowestHpRatio' || target === 'lowestCoverHp'
  );
}

/**
 * 対象の語彙編（plan/design-target-vocab.md 2.1 節）: 「自分を除く」。topAttack の順位から発動者の枠を外す。
 * always = 外したまま、unlessShort = 外して N に足りなければ自分を足す（「対象が足りない場合、自分も対象となる」）
 */
export type ExcludeSelf = 'always' | 'unlessShort';
export const EXCLUDE_SELF = ['always', 'unlessShort'] as const satisfies readonly ExcludeSelf[];

/**
 * 対象の語彙編（同 2.3 節）: 「同じ部隊の味方全体に」。same = 対象の枠のキャラの CharacterData.squad が発動者と同じ枠だけ
 * （発動者自身も入る）。target が allies のときだけ書ける。編成で決まるので最上位の skills/composition.ts で対象の枠を決める
 */
/** 2 段目の段 9（plan/design-skill-stage9.md 1.1 節）: 「〈クラス〉型の味方」の絞り込みに書けるクラス */
export const NIKKE_CLASSES = ['Attacker', 'Defender', 'Supporter'] as const satisfies readonly NikkeClass[];

export type TargetSquad = 'same';
export const TARGET_SQUADS = ['same'] as const satisfies readonly TargetSquad[];

/**
 * 対象の語彙編: 編成で決まる対象（targetSquad・longestChargeTime）の、最上位で決めた枠（skills/composition.ts の
 * applyComposition が書く。JSON には書かない）。有れば、対象はこの枠だけに絞られる
 */
export type FixedTargetFields = { fixedTargets?: readonly number[] };

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
 * 防御力無視ダメージ編: 編成に特定のキャラがいる条件（plan/design-true-damage-element.md 3.3 節）。自分を除く編成の枠（空枠を除く）に、
 * resourceId が rid のキャラが 1 体以上いる（present: true）/ いない（false）ときだけ効果を持つ。squad と同じく編成で決まる静的な条件
 */
export type WithCharacterCondition = { rid: number; present: boolean };

/**
 * スロットの対応状況（plan/design-skill-note-kinds.md 2.2 節）。定義には書かず、効果の有無と unimplemented の notes の有無から
 * 読み込みで決める（deriveSkillSupport）。noEffect = モデルの前提の中でダメージに効く効果が無い（notes が noDamage・outOfScope・modeling・
 * indirect だけ）
 */
export type SkillSupport = 'supported' | 'partial' | 'unsupported' | 'noEffect';

/**
 * notes の種類（plan/design-skill-note-kinds.md 2.1 節）。unimplemented = 前提の中でダメージに効く（効きうる）のに定義していない、
 * outOfScope = モデルの前提（静止単体ボス・被弾なし・味方が倒れない・パーツ／阻止部位／バリアなし。要件 5.2 節）では起きない・効かない、
 * noDamage = どの編成・敵でも与ダメージを変えない、modeling = 扱っていない効果ではなく扱い方の補足。
 * 分類の設計書の論点 7（plan/design-indirect-notes.md 1.1 節）: indirect = それ自体は与ダメージを変えないが、経路（path）の値や有無を
 * 動かし、その経路を読む効果（reads）が編成にいる時だけ効く
 */
export type SkillNoteKind = 'unimplemented' | 'outOfScope' | 'noDamage' | 'modeling' | 'indirect';
export const SKILL_NOTE_KINDS = [
  'unimplemented',
  'outOfScope',
  'noDamage',
  'modeling',
  'indirect',
] as const satisfies readonly SkillNoteKind[];

/**
 * 分類の設計書の論点 7（plan/design-indirect-notes.md 1.3 節）: 間接に効く経路。間接の notes の path（動かす側）と、効果・notes の
 * reads（読む側）に書く
 */
export const INDIRECT_PATHS = ['hp', 'defense', 'barrier', 'decoy', 'cover', 'pierce', 'pellet'] as const;
export type IndirectPath = (typeof INDIRECT_PATHS)[number];

/** 経路の名前（plan/skills.md と画面） */
export const INDIRECT_PATH_NAMES: Record<IndirectPath, LocalizedText> = {
  hp: { ja: 'HP', en: 'HP' },
  defense: { ja: '防御力', en: 'DEF' },
  barrier: { ja: 'バリア', en: 'Barrier' },
  decoy: { ja: 'デコイ', en: 'Decoy' },
  cover: { ja: '遮蔽物', en: 'Cover' },
  pierce: { ja: '貫通', en: 'Pierce' },
  pellet: { ja: 'ペレット', en: 'Pellet' },
};

export type PassiveEffect = FixedTargetFields & {
  /** 無条件・常時（段階 A）。トリガー付きの持続バフは 'timed'（段階 B） */
  kind: 'passive';
  target: BuffTarget;
  /** 対象の語彙編: 「同じ部隊の味方全体に」。target が 'allies' のときだけ書ける */
  targetSquad?: TargetSquad;
  /** Stage 9: 「〈武器〉を所持する味方」。target が 'allies' のときだけ書ける */
  targetWeapon?: WeaponType;
  /** アスカ: 「〈コード〉コードの味方」。targetWeapon と同じ場所に書ける（plan/design-asuka.md 2.2 節） */
  targetElement?: Element;
  /** 2 段目の段 9: 「〈クラス〉型の味方」。targetWeapon と同じ場所に書ける（plan/design-skill-stage9.md 1.1 節） */
  targetClass?: NikkeClass;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す */
  scaling?: BuffScaling;
  /**
   * description_value_NN の NN（1 始まり）。値は % 表記（"20.1"）。100 で割るのは resolvePassives の責務。
   * 2 段目の段 12 の PR 2: passive のフラグの stat（PASSIVE_FLAG_STATS）だけは書かない（値 1）
   */
  ref?: number;
  /** Stage 11 モダニア: 「▼」。値の符号を反転する（scaling が ratio / flat のときだけ） */
  decrease?: true;
  /** アニス：スター編: バースト段階の構成の条件 */
  burstStepMix?: BurstStepMixCondition;
  /** ラム編: 同じ部隊の味方の条件 */
  squad?: SquadCondition;
  /** 防御力無視ダメージ編: 編成に特定のキャラがいる条件 */
  withCharacter?: WithCharacterCondition;
  /** 防御力無視ダメージ編: 敵の属性の条件（敵の属性がこれのときだけ効果を持つ。静的な条件） */
  enemyElement?: Element;
  /**
   * 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 自分の HP の割合の条件（selfHp だけ）。HP の割合は枠の想定
   * （TeamSlotInput.hpRatio）で戦闘中一定なので、編成の段（skills/composition.ts の resolveSelfHp）で決まる
   */
  condition?: EffectCondition;
  /**
   * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 「自分が〈状態〉（のフルスタック）状態の時のみ、…「持続」」。効果を出した
   * 枠（自分）にその状態が付いていて、スタックの条件を満たすフレームの間だけ対象に効く（窓の積。skills/holders.ts）。condition とは
   * 組み合わせない。2 段目の段 11 の PR 2: カウンタの値の条件 { selfCounter: { counter, atLeast } } も（そのカウンタが N 以上の間）
   */
  while?: WhileCondition;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果の条件。中身は条件の selfState と同じ形
 * （stacks は 'full' か N、stacksRef も書ける）で、present: false は書けない
 */
export type WhileCondition =
  | { selfState: SelfStateCondition }
  // 2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.4 節）: 自分のカウンタが atLeast 以上の間（前のフレームの終わりの値。below は使い手がいない）
  | { selfCounter: { counter: CounterId; atLeast: number } };

/**
 * Stage 6: 持続バフが付くきっかけ。
 * battleStart = 戦闘開始時（1 回だけ）、burstUse = 自分がバーストスキルを使った時（割当枠のときだけ）、
 * fullBurstStart = フルバーストタイムが発動した時、fullBurstEnd = フルバーストタイムが終了した時。
 * 固定サイクル（Stage 5）では burstUse と fullBurstStart が同じフレームになるが、段階の演出遅延を入れる Stage 7 でずれる。
 * Stage 8: burstStageNEnter = バースト N 段階突入時。1 はゲージ満タン（とリエントリー）、2 / 3 は発動の結果その段階に進んだ時
 * （通常は I / II の発動フレーム）。固定サイクルでは 3 つとも発動フレーム。
 * Stage 11: healed = 自分に回復効果が適用された時（heal 効果の対象になった時。HP は持たず、満タンでも適用とみなす）。
 * エレグのバースト編（plan/design-elegg.md 8.9 節）: burstHit = 自分のバーストの倍率ダメージのヒット（遅れの表の hitFrames のフレーム。
 * 分かれたヒットは 1 ヒット目）。burst スロットの timed・付与にだけ書ける（validateBurstHitTriggers）。burstUse の効果の発火
 * （effectFrames）とヒットが違うフレームのキャラで、ヒットから付く効果（ブームインストール）を書く
 */
export type BuffTrigger =
  | 'battleStart'
  | 'burstUse'
  | 'fullBurstStart'
  | 'fullBurstEnd'
  | 'burstStage1Enter'
  | 'burstStage2Enter'
  | 'burstStage3Enter'
  | 'healed'
  | 'burstHit';
export const BUFF_TRIGGERS = [
  'battleStart',
  'burstUse',
  'fullBurstStart',
  'fullBurstEnd',
  'burstStage1Enter',
  'burstStage2Enter',
  'burstStage3Enter',
  'healed',
  'burstHit',
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
 * 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9.6 節の論点 12）: weaponChangeShot = 使用武器の変更
 * （weaponChange）で持ち替えた武器で撃った射撃（「命中した敵に」付く徹甲炸裂弾の受けるダメージ▲。その発自身には乗らない）。
 * 循環（cycle）と during には書けない。
 * ペレットの命中編（plan/design-pellet-hit.md 2 節）: pelletHit = 的に当たったペレットの数。1 発ごとに shotCount × その発の
 * 当たったペレットの割合（SG 以外は normalHit と同じ量）を足し、累計が N の倍数に届いた発で発火する（持ち越し。C-0408）。
 * 1 発の量が N を超えてはいけないので every か everyRef が要り、循環には書けない
 */
export type ShotCountKind =
  'normalShot' | 'normalHit' | 'coreHit' | 'fullChargeShot' | 'lastShot' | 'weaponChangeShot' | 'pelletHit' | 'critHit';
export const SHOT_COUNT_KINDS = [
  'normalShot',
  'normalHit',
  'coreHit',
  'fullChargeShot',
  'lastShot',
  'weaponChangeShot',
  'pelletHit',
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: critHit = クリティカルの命中の期待値（1 発ごとに命中の期待値 ×
  // その発の通常攻撃の会心率。frame/firstPass.ts）を足し、累計が N の倍数を越えた発で発火する（coreHit と同じ持ち越し）。乱数の
  // きっかけを期待値で持つ（ソルジャーE.G. 編と同じ考え方）
  'critHit',
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
  /**
   * クルミ S2 編（plan/design-kurumi-s2.md 2.1 節）: 'fullBurst' ならフルバーストの窓（isInFullBurst と同じ [start, end)）の中の
   * 射撃だけを数える。damage にだけ書ける（gaugeHits・射撃ごとの畳み込み（every = 1）・stacksRef とは組み合わせない）
   */
  during?: ShotCountWindow;
  /** 同 2.1 節: during を書くときは必須。fullBurstStart = フルバーストが始まるフレームで 0 に戻す、never = 戻さない */
  reset?: ShotCountReset;
  /**
   * ソーダ：トゥインクルバニー S1 の数え方（V-0443）: 'fullBurst' なら、射撃は窓の外も含めて戦闘中ずっと数え、N の倍数に届いた発が
   * フルバーストの窓（[start, end)）の中のときだけ発火する（窓の外で届いた回は発火せずに過ぎる）。during・reset・stacksRef・
   * chance とは組み合わせない。書ける効果は during と同じ（damage・timed・付与）。
   * 2 段目の段 11（plan/design-skill-stage11.md 2.3 節の H1。V-0530）: 'weaponChange' なら、N の倍数に届いた発が使用武器の変更で
   * 持ち替えた武器の発のときだけ発火する（モラン S1「自分が武器変更状態の場合、通常攻撃が N 回命中した時」）
   */
  firesDuring?: FiringWindow;
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 'weaponChange' なら、N の倍数に届いた発が使用武器の変更で持ち替えた
   * 武器の発のときは発火しない（数えるのは変更の発も。紅蓮：神殺の S2「自分が花無十一日紅・満開状態でなければ」）。firesDuring・
   * during・chance・stacksRef とは組み合わせない。どの効果にも書ける
   */
  firesOutside?: 'weaponChange';
  /**
   * ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 「〜した時、p% の確率で」の p（%。0 より大きく 100 以下の即値）。
   * 1 発ごとに確率 p × その発の回数の量（normalShot は 1、normalHit はその発の弾丸命中率）で付く。モデルは期待値で持ち、
   * 窓の値を「付いている確率 × 値」にする（skills/chance.ts）。count は normalShot か normalHit、timed にだけ書ける。
   * every・everyRef・stacksRef・during とは組み合わせない。chanceRef とどちらか片方。書ける stat の制限は validateChanceTimed
   */
  chance?: number;
  /** 確率（%）の description_value_NN */
  chanceRef?: number;
};

/** ソルジャーE.G. 編: 確率のきっかけを書ける回数の種類 */
export const CHANCE_COUNT_KINDS = ['normalShot', 'normalHit'] as const satisfies readonly ShotCountKind[];

/** ソルジャーE.G. 編: 確率のきっかけ（chance / chanceRef）を持つ回数トリガーか */
export function isChanceTrigger(t: EffectTrigger): t is ShotCountTrigger {
  return isShotCountTrigger(t) && (t.chance !== undefined || t.chanceRef !== undefined);
}

/** クルミ S2 編: 回数トリガーの数える窓と、数え直し（plan/design-kurumi-s2.md 2.1 節） */
export type ShotCountWindow = 'fullBurst';
export const SHOT_COUNT_WINDOWS = ['fullBurst'] as const satisfies readonly ShotCountWindow[];
/** 2 段目の段 11: 回数トリガーの発火の窓（firesDuring）。数える窓（during）はフルバーストだけ */
export type FiringWindow = ShotCountWindow | 'weaponChange';
export const FIRING_WINDOWS = ['fullBurst', 'weaponChange'] as const satisfies readonly FiringWindow[];
export type ShotCountReset = 'fullBurstStart' | 'never';
export const SHOT_COUNT_RESETS = ['fullBurstStart', 'never'] as const satisfies readonly ShotCountReset[];

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
 * 的のジャンプ・バーストに関係しない（録画 0081 の S2。C-0091）。CT が説明文にも CDN にも無いアクティブ型のスキル用で、
 * 値は実測の即値。damage・dot・autoAttack・burstGaugeHit と timed に書ける。ソルジャーE.G. 編（plan/design-soldier-eg.md 3.2 節）で、
 * 1 パス目で窓を追う stat（最大装弾数など）の timed にも書けるようにした（1 パス目が周期のフレームで窓を登録する。frame/firstPass.ts）
 */
export type TimerTrigger = {
  everySeconds: number;
  /**
   * 防御力無視ダメージ編（plan/design-true-damage-element.md 3.5 節）: 戦闘開始時（フレーム 0）にも 1 回発火する
   * （「戦闘開始時、… 再発動周期 N 秒」）。timed にだけ書ける（1 パス目で窓を追う stat は、戦闘開始時と同じくループの前に登録する）
   */
  atStart?: true;
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 10.2 節の a）: 端数を持ち越す。k 回目を k × everySeconds 秒に達した最初の
   * フレームにする（省略は発動のたびに数え直す。C-0502）。「再発動周期」のマリアン：クイーンの S1 の槍（V-0538）
   */
  carry?: true;
};

/**
 * ペルソナ編（plan/design-persona.md 3.3 節）: 「〈名前〉が適用された時」。名前の付いた状態の語彙編（plan/design-named-state.md 5.4 節）:
 * 編成のどの枠の付与でも、その状態がこの効果を持つ枠に付いたフレーム（状態の窓の始まり。付き直しでも 1 回）で発火する。
 * damage と、2 段目の段 4（plan/design-skill-stage4.md 1.1 節）から timed・状態の付与に書ける（timed・付与は連鎖させない）
 */
export type AppliedTrigger = { applied: NamedStateId };

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: 「〈名前〉のフルスタック状態の時、スタック解除後」。持ち主（自分）のその状態の件が
 * フルスタックになったフレームに発火し、その状態のスタックを全部外す（次のフレームで閉じる。同じフレームに付いた件も外す）。
 * 回復（heal）にだけ書ける（1 パス目が回復の前にフルスタックを見つける。frame/firstPass.ts）。その状態は、同じ定義の付与で
 * 自分にスタックで付き、付与はどれも射撃の回数のきっかけ（フルスタックになる件が前のフレームまでに登録される）
 */
export type FullStackTrigger = { fullStack: NamedStateId };

export function isFullStackTrigger(t: unknown): t is FullStackTrigger {
  return typeof t === 'object' && t !== null && 'fullStack' in t;
}

/**
 * 2 段目の段 11（plan/design-skill-stage11.md 2.2.1 節。論点 1）: 「〈使用武器の変更〉状態が終了した時」。自分の使用武器の変更（撃ち切りで
 * 終わるもの）が終わって基礎の武器に戻ったフレーム（1 パス目の ShotLog.weaponChangeEnds）に発火する。残弾数減少（ammoDecrease）に
 * だけ書ける
 */
export type WeaponChangeEndTrigger = { weaponChangeEnd: true };

export function isWeaponChangeEndTrigger(t: unknown): t is WeaponChangeEndTrigger {
  return typeof t === 'object' && t !== null && 'weaponChangeEnd' in t;
}

/**
 * 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節。論点 3）: 「最大弾数のリロードが完了した時」。自分の基礎の武器のリロードを
 * 込め終えたフレームの次のフレーム（1 パス目の ShotLog.reloadEnds。durationUntil: "reloadEnd" の窓の終わりと同じフレーム）に発火する。
 * 解除（removeState）にだけ書ける。2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2 節）: timed と状態の付与にも書ける（ジルの
 * 「戦闘開始時および最大弾数のリロードが完了した時」のマグナム弾・硫酸弾）
 */
export type ReloadEndTrigger = { reloadEnd: true };

export function isReloadEndTrigger(t: unknown): t is ReloadEndTrigger {
  return typeof t === 'object' && t !== null && 'reloadEnd' in t;
}

/**
 * 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節。論点 2）: 「遮蔽物の HP を回復した時」。自分の枠が遮蔽物 HP 回復
 * （coverHeal。自分のものも味方のものも）を受けたフレームに発火する（1 パス目の FrameEvents.coverHealed。届くフレームは回復と同じ
 * skills/heals.ts の healFrameOf）。流し直し（replayEvents）では作らないので、1 パス目が件を登録する timed にだけ書ける
 */
export type CoverHealedTrigger = { coverHealed: true };

export function isCoverHealedTrigger(t: unknown): t is CoverHealedTrigger {
  return typeof t === 'object' && t !== null && 'coverHealed' in t;
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1 節。論点 3）: 「チャージ中の時、N 秒ごとに」。自分のチャージ武器の溜めの中で、
 * 溜め始めから k × everySeconds 秒（k = 1, 2, …）に発火する。k 回目は溜め始めの floor(k × everySeconds ÷ 0.017) フレーム後（端数を
 * 持ち越す。damage の perCountIntervalSeconds と同じ刻み）。溜めの進み（溜め始めからのフレーム）は、部分チャージの進みと同じ式
 * （frame/shooter.ts の chargeProgressFrames）で、撃ったフレーム・リロード中・狙えない窓（ハイド）の間は溜めていない（撃つ・リロード・
 * ハイドで切れたら、次の溜め始めから数え直す）。部分チャージの発の溜めでも発火する。1 パス目が溜めを追って発火のフレームを射撃の記録
 * （ShotLog.chargeTicks）に書き、流し直し（skills/triggers.ts の replayEvents）も同じ列を読む。timed と状態の付与にだけ書ける
 */
export type ChargeTickTrigger = { chargeTick: { everySeconds: number } };

export function isChargeTickTrigger(t: unknown): t is ChargeTickTrigger {
  return typeof t === 'object' && t !== null && 'chargeTick' in t;
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.6 節）: 「フルチャージした時」（溜めが満ちた時）。自分のチャージ武器の溜めの進みが
 * チャージのフレーム数に届いたフレーム（撃つ発の、満ちてから撃つまでのフレーム前。射撃姿勢維持型でなければ 1f 前）に発火する。
 * 窓は発火のフレームから（射撃の回数のきっかけの「次のフレームから」ではない）なので、その満ちた溜めで撃つ発自身にも乗る（0774 の
 * 戦闘の最初の発から攻撃力▲が乗る。V-0552）。「フルチャージして攻撃した時」（fullChargeShot）とは別。1 パス目が満ちたフレームを射撃の
 * 記録（ShotLog.chargeFullFrames）に書く。timed と状態の付与にだけ書ける
 */
export type ChargeFullTrigger = { chargeFull: true };

export function isChargeFullTrigger(t: unknown): t is ChargeFullTrigger {
  return typeof t === 'object' && t !== null && 'chargeFull' in t;
}

/**
 * マスト編（plan/design-mast.md 8 節の論点 7）: 「自分の HP が X% 以下である限り」。自分の HP の割合が閾値（description_value_NN の X%）以下に
 * 下がったフレームに発火し、durationUntil: "selfHpAbove" で閾値を上回るフレームまで続く。HP の割合 = 枠の想定の割合 × (1 + Σ 最大HP▲ −
 * Σ 最大HP のみ▲) ÷ (1 + Σ 最大HP▲)（Σ 最大HP▲ は最大HP のみ▲ も含む。plan/design-skill-stage6.md 2.4 節の式）で、そのフレームより前に
 * 始まった件から求める（同じフレームに付いた最大HP のみ▲ は次のフレームから。論点 8）。1 パス目の件の一覧が追う（skills/holders.ts）ので、
 * timed にだけ書ける。回復で現在の HP が戻る分は扱わない
 */
export type SelfHpAtMostTrigger = { selfHpAtMostRef: number };

export function isSelfHpAtMostTrigger(t: unknown): t is SelfHpAtMostTrigger {
  return typeof t === 'object' && t !== null && 'selfHpAtMostRef' in t;
}

/** JSON に書くトリガー。文字列は BuffTrigger、オブジェクトは回数トリガーか時間の周期のトリガー（ペルソナ編: 効果名のトリガー） */
export type EffectTrigger =
  | BuffTrigger
  | ShotCountTrigger
  | EventCountTrigger
  | TimerTrigger
  | AppliedTrigger
  | FullStackTrigger
  | WeaponChangeEndTrigger
  // 2 段目の段 16 の PR 2: { reloadEnd }（removeState と、段 17 の PR 4 から timed・状態の付与が受ける）
  | ReloadEndTrigger
  // 2 段目の段 17 の PR 1: { coverHealed }（timed だけが受ける。parseCoverHealedTrigger）
  | CoverHealedTrigger
  // 2 段目の段 14 の PR 2: { chargeTick }・{ chargeFull }（timed・状態の付与だけが受ける。parseChargeTrigger）
  | ChargeTickTrigger
  | ChargeFullTrigger
  // マスト編: { selfHpAtMostRef }（timed だけが受ける。parseSelfHpAtMostTrigger）
  | SelfHpAtMostTrigger
  // 2 段目の段 13 の PR 1: { counterFull }（damage・dot・counterChange だけが受ける。parseCounterFullTrigger）
  | CounterFullTrigger;

export function isAppliedTrigger(t: unknown): t is AppliedTrigger {
  return typeof t === 'object' && t !== null && 'applied' in t;
}

export function isTimerTrigger(t: unknown): t is TimerTrigger {
  return typeof t === 'object' && t !== null && 'everySeconds' in t;
}

export function isShotCountTrigger(t: EffectTrigger): t is ShotCountTrigger {
  return typeof t === 'object' && 'count' in t && (SHOT_COUNT_KINDS as readonly string[]).includes(t.count);
}

export function isEventCountTrigger(t: EffectTrigger): t is EventCountTrigger {
  return typeof t === 'object' && 'count' in t && (EVENT_COUNT_KINDS as readonly string[]).includes(t.count);
}

/** 最小構成の検査の窓の端編: 件の始まり・終わりを動かすフレーム */
export type EdgeShift = { start: number; end: number };

/** Stage 6: 「（トリガー）時、（対象）に （stat）X%▲、Y 秒間維持」。同じ効果が持続中に再発火したら上書き延長（窓の和集合） */
export type TimedEffect = TargetCountFields &
  FixedTargetFields & {
    kind: 'timed';
    trigger: EffectTrigger;
    target: BuffTarget;
    /** 対象の語彙編: 「同じ部隊の味方全体に」。target が 'allies' のときだけ書ける */
    targetSquad?: TargetSquad;
    /**
     * 対象の語彙編: 「自分を除く」。target が 'topAttack' のときだけ書ける。
     * ペルソナ編（plan/design-persona.md 3.2 節）: 'always' は 'allies' にも書ける（「自分を除く…味方全体」）
     */
    excludeSelf?: ExcludeSelf;
    /**
     * ペルソナ編: 「〈名前〉状態の」。名前の付いた状態の語彙編（plan/design-named-state.md 5.4 節）: 静的な状態（その枠の定義の
     * 静的な状態。staticStatesOf）を持つ枠だけ。target が 'allies' のときだけ書ける
     */
    targetState?: NamedStateId;
    /**
     * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.1 節）: 「自分と〈状態〉の味方」。targetState に当たる枠に、自分の枠を
     * 足す（自分がその状態を持たなくても付く）。targetState と組むときだけ書ける（値は true だけ）
     */
    includeSelf?: true;
    /** ペルソナ編: 「基本バースト段階が N の」。対象の枠の CharacterData.burstStep が N の枠だけ。target が 'allies' のときだけ書ける */
    targetBurstStep?: BasicBurstStep;
    /**
     * 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 「自分と自分より最終防御力が低い味方」（lowerThanSelf）。発火のフレームの
     * 最終防御力で比べ（同値は含まない。自分は含む）、維持の間は対象を変えない。target が 'allies' の timed だけに書ける
     */
    targetDefense?: TargetDefense;
    /** Stage 9: 「〈武器〉を所持する味方」。target が self 以外（allies・Stage 11 の burstUsers）のときだけ書ける */
    targetWeapon?: WeaponType;
    /** アスカ: 「〈コード〉コードの味方」 */
    targetElement?: Element;
    /** 2 段目の段 9: 「〈クラス〉型の味方」 */
    targetClass?: NikkeClass;
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
     * 効いている窓で合計 > 0。同じフレームに付いた窓も入れる）なら発火する。カウンタは状態に関係なく数える。
     * 防御力無視ダメージ編: 「フルバーストタイムなら」（inFullBurst）。名前の付いた状態の語彙編: 鍵はどれも満たすときだけ（AND）
     */
    condition?: EffectCondition;
    /** アニス：スター編: バースト段階の構成の条件 */
    burstStepMix?: BurstStepMixCondition;
    /**
     * 最小構成の検査の窓の端編（plan/design-minimal-edge.md 3.3 節）: 件の始まりと終わりを動かすフレーム（負は早い側）。
     * 検査の感度（records/sensitivity.ts）が写した定義にだけ書く。データの JSON には書けない（読み込みで弾く）
     */
    edgeShift?: EdgeShift;
    /** ラム編: 同じ部隊の味方の条件 */
    squad?: SquadCondition;
    /** 防御力無視ダメージ編: 編成に特定のキャラがいる条件 */
    withCharacter?: WithCharacterCondition;
    /** 防御力無視ダメージ編: 敵の属性の条件 */
    enemyElement?: Element;
    /** 維持秒数の description_value_NN。durationSeconds・durationShots・durationShotsRef・durationUntil とちょうど 1 つ */
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
    /**
     * 防御力無視ダメージ編（plan/design-true-damage-element.md 3.2 節）: 「解除条件：フルバーストタイムが終了した時」。付いたフレームから
     * 次のフルバースト終了のフレームまで続く（無ければ戦闘の終わりまで）。1 パス目で窓を追う stat と、スタック・順位の対象には書けない
     */
    durationUntil?: DurationUntil;
    /**
     * 環境コントロール強化編（plan/design-true-damage-element.md 3.5 節）: 「（スキルの効果）によるダメージの増加倍率が X% 効果量に
     * 対し増加」。発火の瞬間に自分（発動した枠）に、同じ枠の skill スロットの同じ stat の timed 効果の窓が効いていれば発火し
     * （「自分が〈状態〉なら」）、維持の秒数のあいだ、参照する窓が効いている所はその値の percent% を、切れた所は発動の瞬間の値の
     * (100 + percent)% を同じ stat に足す（参照する効果の▲を、切れても (100 + percent)% で保つ。V-0230）。
     * 値は参照する効果から取るので ref・scaling・decrease は書かない。1 パス目で窓を追う stat と、スタック・条件・発数や出来事の維持・
     * 順位の対象には書けない
     */
    amplifies?: Amplifies;
    /**
     * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: 射撃の回数のきっかけで、窓をきっかけの射撃のフレームの
     * delayFrames 後から始める（1 以上の整数。書かなければ次のフレームから）。測った遅れを即値で書き、根拠の結論を claims に結ぶ。
     * 確率のきっかけ・付与には書けない。V-0602: 時間の周期のきっかけ（{ everySeconds }）にも書け、窓を周期の発火の delayFrames 後から
     * 始める（書かなければ発火のフレームから）。1 パス目で窓を追う stat には書けない
     */
    delayFrames?: number;
    /** 常に満たすとみなした条件。UI に「仮定」として出す */
    assumes?: LocalizedText;
  };

/** 環境コントロール強化編: 増やす相手の効果（同じ枠の skill スロットの、同じ stat の timed 効果）と、その値に対する割合（%） */
export type Amplifies = { skill: SkillSlot; percent: number };

/**
 * 防御力無視ダメージ編: 維持の終わりの出来事。
 * ペルソナ編（plan/design-persona.md 3.4 節）: battleEnd = 戦闘の終わりまで（トリガー付きの「持続」）。窓の終わりが時刻表に依らないので、
 * fullBurstEnd と違い 1 パス目で窓を追う stat とスタックにも書ける。
 * シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: reloadEnd = 持ち主（自分）のリロードが最大装弾数まで込め終わった
 * フレームまで（「最大弾数リロード完了時に解除」）。窓の終わりは 1 パス目の射撃の列（ShotLog.reloadEnds）から作るので、1 パス目で窓を
 * 追う stat にも書ける。timed の対象が自分のときだけ（スタック・状態の付与には書けない）。
 * マスト編（plan/design-mast.md 8 節）: selfHpAbove = 発動者の HP の割合が閾値を上回るフレームまで（きっかけ { selfHpAtMostRef } とだけ組む。
 * timed だけ。順位の対象 topAttack にも書ける）
 */
export type DurationUntil = 'fullBurstEnd' | 'battleEnd' | 'reloadEnd' | 'selfHpAbove';
export const DURATION_UNTILS = [
  'fullBurstEnd',
  'battleEnd',
  'reloadEnd',
  'selfHpAbove',
] as const satisfies readonly DurationUntil[];

/**
 * 発火の条件。名前の付いた状態の語彙編（plan/design-named-state.md 10 節の論点 8）で、timed・付与・damage を 1 つの型にした。
 * キーは 1 つ以上で、すべてを満たすときだけ発火する（AND）。どの効果がどのキーを受けるかは効果の種類ごと（CONDITION_KEYS_OF）。
 * selfBuffed = 自分がその stat の増加状態なら（Stage 11 モダニア。timed・付与）。
 * inFullBurst = 発火の瞬間がフルバーストタイムの中なら（防御力無視ダメージ編。plan/design-true-damage-element.md 3.4 節。
 * 1 パス目で窓を追う stat には書けない。damage ではクルミ S2 編の fullBurst を改めた。窓 [start, end) の中）。
 * enemyState = 敵（1 体の前提）にその状態が付いているなら（クルミ S2 編の targetStatus を改めた。damage。付いている区間は
 * 同じ状態の dot の最初の発火から最後の tick まで。編成のどの枠の dot でもよい）。エレグの段 3（plan/design-elegg-s3.md 3.2 節）で
 * timed・付与にも書けるようにし、敵に付く状態の付与（エレグのブームインストール）の窓も見る（damage も同じ。そのフレームに付いた件も入れる）。
 * selfState = 自分（効果を出した枠）にその状態が付いているか（2 段目の段 1。plan/design-skill-stage1.md 1.1 節。timed・付与・damage）。
 * usedBurst = 直前に自分がバーストスキルを使用していれば（同 1.5 節。timed・付与・解除。フルバーストの開始・終了のきっかけだけ。
 * 発火の文脈の burstUsers に自分がいるか。件を見ないので、これだけの条件は効果の段を上げない）。
 * selfHp = 自分の HP の割合が閾値以上なら（2 段目の段 6。plan/design-skill-stage6.md 1.4 節。passive だけ。HP の割合は枠の想定で
 * 戦闘中一定なので、編成の段で決まる）
 */
export type EffectCondition = {
  selfBuffed?: BuffStat;
  /**
   * true = 発火の瞬間がフルバーストタイムの中なら。2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: false = フルバーストタイムの
   * 外なら（counterChange だけ。粘着榴弾の付着している数は、フルバーストの外で付いたものだけを数える）
   */
  inFullBurst?: boolean;
  enemyState?: NamedStateId;
  selfState?: SelfStateCondition;
  usedBurst?: true;
  selfHp?: SelfHpCondition;
  selfCounter?: SelfCounterCondition;
};

/**
 * 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: 自分のカウンタの値の条件。atLeast = 「N 以上（N の場合）なら」、below =
 * 「N 未満なら」（ちょうど片方）。発火のフレームの前のフレームの終わりの値を見る（同じフレームの増減は見ない。skills/holders.ts）
 */
export type SelfCounterCondition = { counter: CounterId; atLeast?: number; below?: number };

/**
 * 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 自分の HP の割合の条件。atLeastRef = 「自分の HP が X% 以上なら」の X の
 * description_value の番号（値は % 表記）。「以下」「未満」「最大の時のみ」は使い手を定義する時に足す。
 * 2 段目の段 15 の PR 1（plan/design-skill-stage15.md 2.1 節）: atLeast = 説明文に即値で書かれた X（% 表記。ミルクの基礎版の S2 の
 * 「自分の HP が 80% 以上の時のみ」）。atLeastRef とちょうど 1 つ
 */
export type SelfHpCondition = { atLeastRef: number; atLeast?: never } | { atLeast: number; atLeastRef?: never };

/** 2 段目の段 15: selfHp の閾値（割合。説明文の % ÷ 100）。valueOf は description_value_NN の値（スキル Lv の値） */
export function selfHpThreshold(hp: SelfHpCondition, valueOf: (ref: number) => number): number {
  return (hp.atLeast ?? valueOf(hp.atLeastRef!)) / 100;
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: 条件が、件を見る鍵（selfBuffed・inFullBurst・selfState・enemyState）を持つか。
 * 持たない条件（usedBurst だけ）は発火の文脈だけで決まるので、効果の段を上げない（skills/holders.ts）
 */
export function conditionReadsItems(condition: EffectCondition | undefined): boolean {
  if (condition === undefined) return false;
  // 2 段目の段 6: selfHp は編成の段で決まる（件を見ない）
  return Object.keys(condition).some((key) => key !== 'usedBurst' && key !== 'selfHp');
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 自分の状態の条件。present: true は「自分が〈状態〉なら」、false は
 * 「自分が〈状態〉でなければ」。件の出どころは問わない。JSON は "selfState": "<id>"（付いていれば）か
 * { "state": "<id>", "present": false }。静的な状態を見るものは編成の段（skills/composition.ts の resolveSelfState）で決まり、
 * 時間で変わる状態は timed・付与なら段 1.5（skills/holders.ts）、damage なら frame/plan.ts で件を見る。
 * 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: stacks は「〈名前〉N スタック以上なら」（N）と「フルスタック状態なら」（'full'）。
 * そのフレームのその状態の件のスタックの段の最大を見る（静的な状態は 1 段）。stacksRef は N の description_value_NN（解決で stacks に
 * する）。present は true（「でなければ」とは組み合わせない）
 */
export type SelfStateCondition = {
  state: NamedStateId;
  present: boolean;
  stacks?: 'full' | number;
  stacksRef?: number;
};

/** 2 段目の段 3: スタック数を見る自分の状態の条件か（stacks か stacksRef を持つ） */
export function isStacksCondition(self: SelfStateCondition | undefined): boolean {
  return self !== undefined && (self.stacks !== undefined || self.stacksRef !== undefined);
}

/** 名前の付いた状態の語彙編: 条件のキー */
export type ConditionKey = keyof EffectCondition;

/** 条件が「自分が 〈stat〉 増加状態なら」を含むならその stat、それ以外は undefined */
export function selfBuffedStatOf(condition: EffectCondition | undefined): BuffStat | undefined {
  return condition?.selfBuffed;
}

/**
 * 防御力無視ダメージ編: 1 パス目のループで窓を追う stat か（攻撃力・射撃に効く stat・状態の stat）。追わない stat の窓は
 * planBuffTimeline だけが作ったので、durationShots・durationUntil・条件 inFullBurst はそちらにだけ書ける。持ち主ごとの一覧編
 * （plan/design-holder-effects.md 2.7 節）で窓を作るコードは 1 つになった。この制限は、使うキャラの定義を足す時に外す
 */
export function isFirstPassTrackedStat(stat: BuffStat): boolean {
  // 2 段目の段 1（plan/design-skill-stage1.md 1.6 節）: 時間で変わるバーストゲージのチャージ速度は、1 パス目がゲージに読む。
  // 2 段目の段 6 の PR 2: 最大HP▲ は、1 パス目の順位（攻撃力）が発動者の最終最大HP として読むので、攻撃力と同じに扱う
  // 2 段目の段 7: 防御力▲ は、1 パス目の発火の対象の絞り込み（最終防御力の比べ）が読むので、攻撃力と同じに扱う
  return (
    stat === 'attack' ||
    isMaxHpStat(stat) ||
    stat === 'defense' ||
    stat === 'burstGaugeSpeed' ||
    stat === 'burstCooldown' ||
    isFiringStat(stat) ||
    isStateStat(stat)
  );
}

/** 2 段目の段 11 の PR 2: 最終最大HP に足す stat か（最大HP▲・最大HP のみ▲） */
export function isMaxHpStat(stat: BuffStat | 'weapon' | undefined): boolean {
  return stat === 'maxHp' || stat === 'maxHpOnly';
}

/**
 * バーストの倍率ダメージの種別。skill = バーストスキルダメージ / ダメージ / 追加ダメージ（即時 1 ヒット）、distributed = 分配ダメージ
 * （射撃場の的 1 体では全額が当たる。C-0391 など。対象と周囲の敵の分配ダメージは、等分したヒットで合計が全額になる。C-0766）。
 * 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節。論点 5）: true = 防御力無視のバーストスキルダメージ（damage の true と同じ式。
 * skills/burstDamage.ts の computeBurstHit）
 */
export type BurstDamageType = 'skill' | 'distributed' | 'true';
export const BURST_DAMAGE_TYPES = ['skill', 'distributed', 'true'] as const satisfies readonly BurstDamageType[];

/** Stage 5: 「最終攻撃力の X％の（バーストスキル）ダメージ」。burst スロットにだけ書ける */
export type BurstDamageEffect = {
  kind: 'burstDamage';
  /** description_value_NN の NN（1 始まり）。値は % 表記（"351.64"）。100 で割るのは resolveBurstDamage の責務 */
  ref: number;
  damageType: BurstDamageType;
  /**
   * 2 段目の段 10（plan/design-skill-stage10.md 2.2 節）: 「N 回順番に攻撃」の回数の description_value_NN。1 回の発動の倍率は
   * ref の値 × 回数で、遅れの表（burst/landing.ts）の分かれたヒット（hitOffsets。長さは回数と同じ）で等分すると、各ヒットが ref の値に
   * なる（シンデレラのバースト。V-0502）。省略は 1 回
   */
  hitsRef?: number;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/**
 * 倍率ダメージの種別（damage 用）。additional = 追加ダメージ。
 * 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節。論点 8）: true = 防御力無視ダメージ（「最終攻撃力の X% の防御力無視ダメージ」）。
 * 防御力を引かず、防御力無視ダメージ▲（trueDamage）を攻撃ダメージ▲と同じ和に足す（使用武器の変更の防御力無視の発と同じ。C-0376・C-0525。
 * skills/burstDamage.ts の computeBurstHit）
 */
export type SkillDamageType = BurstDamageType | 'additional' | 'true';
export const SKILL_DAMAGE_TYPES = [
  'skill',
  'distributed',
  'additional',
  'true',
] as const satisfies readonly SkillDamageType[];

/**
 * Stage 8: トリガー付きの倍率ダメージ（「最終攻撃力の X% のダメージ / 分配ダメージ / 追加ダメージ」）。どのスロットにも書ける。
 * burst スロットの無条件の発動ダメージは従来どおり burstDamage。
 * Stage 11 モダニア: 射撃の回数トリガーの毎回（every = 1。「通常攻撃が命中した時」）は、発動を 1 件ずつ作らずに
 * 1 トリガーの値に畳み込む（damage.ts の perShot）。最後の弾丸（lastShot）の毎回はマガジンに 1 回なので今までどおり 1 件ずつ
 */
export type DamageEffect = {
  kind: 'damage';
  /**
   * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.2 節）: { counterFull } は、自分のそのカウンタが上限に届いた次のフレーム
   * （counterChange の { counterFull } と同じ）。perCount の { counter } と組む（ミハラ：ボンディングチェーンのキャプチャーチェーンの攻撃）
   */
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
  /**
   * V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 時間の周期のきっかけの倍率ダメージの、どのヒット（hitsRef の N ヒット）も射手の
   * 1 ヒットぶんのバーストゲージ（targetBurstEnergyPerShot。フルチャージ倍率なし）をヒットのフレームに溜める。1 パス目
   * （frame/firstPass.ts）が周期の発火（periodShorten の短縮も）を追って予約する。delayFrames と組み、condition とは組み合わせない。
   * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節。C-0426）: 射撃の回数のきっかけ（数える窓・確率なし）にも書ける。1 パス目が
   * 射撃を数えて発火を追い、ヒット（perCount { state } の数だけ 1 つずつ出すヒットなら、発火のフレームのスタック数のヒット）のフレームの
   * ゲージに予約する（オートファイアのどのヒットも射手の target_burst_energy_pershot を溜める）
   */
  gaugePerHit?: true;
  /** 防御力無視ダメージ編: 編成に特定のキャラがいる条件 */
  withCharacter?: WithCharacterCondition;
  /** 防御力無視ダメージ編: 敵の属性の条件（クイーン（真）S1 の「1more が適用された時」） */
  enemyElement?: Element;
  /**
   * 2 段目の段 12（plan/design-skill-stage12.md 2.1 節）: バースト段階の構成の条件（ラピ：レッドフードのバーストの「バーストⅢで
   * 使用した時」。戦闘補助でない ⇔ 基本バースト段階 I の味方がいる）
   */
  burstStepMix?: BurstStepMixCondition;
  /**
   * クルミ S2 編（plan/design-kurumi-s2.md 2.2〜2.4 節）: 発火の条件（gaugeHits とは組み合わせない）。キーは inFullBurst・enemyState
   * （名前の付いた状態の語彙編で fullBurst・targetStatus を改めた）。カウンタは条件によらず数える
   */
  condition?: EffectCondition;
  /**
   * 遅れて出る倍率ダメージ編（plan/design-delayed-skill-hit.md 3 節）: きっかけのフレームの delayFrames 後に出す（1 以上の整数）。
   * バフとフルバースト補正はそのフレームのもの（同じ発動で付いた効果も入る。発動の直前のバフで固定する規則は当てない）。
   * きっかけは burstUse（クイーン（真）S1 の「1more が適用された時」。C-0310）と、ペルソナ編の { applied }（追撃が付いたフレームから数える）と、
   * 時間の周期のトリガー（周期のスキルの発動からヒットまで。C-0453）。回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md
   * 6.6 節）: 射撃の回数のきっかけ（確率を除く）にも書ける（プリバティ：UM S1・ドレイク S2 は 6。C-0659・C-0660）。gaugeHits とは組み合わせない
   */
  delayFrames?: number;
  /**
   * ミハラのバースト編（plan/design-mihara-burst-hits.md 3.2 節）: バーストの倍率ダメージの分かれたヒットのそれぞれと同じフレームに出す
   * （倍率は等分しない。条件は効果の発火のフレームで 1 回判定する。フルバースト補正はヒットのフレームで決める）。trigger が burstUse の
   * ときだけ書ける（delayFrames とは組み合わせない）。C-0565。撃つ側のバフはヒットの時点で取る（C-0657。ミハラ（161）は
   * 根拠を撮影待ち。plan/design-mihara-burst-hits.md 8 節）
   */
  perBurstHit?: true;
  /**
   * 2 段目の段 10（plan/design-skill-stage10.md 2.1 節）: 値 × 数。「〈名前〉スタックコピー」は、倍率に、効果の発火のフレームの自分のその
   * 状態のスタック数（発火のフレームより前に付いた件。条件 selfState と同じ見え方）を掛ける。0 なら出さない。trigger が burstUse の
   * ときだけ書ける（シンデレラのバーストの追加ダメージ。V-0502）。2 段目の段 11 の PR 5（plan/design-skill-stage11.md 2.5 節）: { counter } は
   * 発火のフレームの自分のそのカウンタの値（前のフレームの終わりの値。条件 selfCounter と同じ見え方）を掛ける（ラプラス：アルティメット
   * ヒーローのバーストの追加ダメージ。V-0532）
   */
  perCount?: { state: NamedStateId } | { counter: CounterId };
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2 節）: 「N 回順番に攻撃」の回数の description_value_NN。1 回の発動を
   * N ヒットに分け、どのヒットも ref の値で出す（バーストの hitsRef と同じく、ref は 1 ヒットの値）。順番攻撃ダメージ▲（sequentialAttackDamage）
   * はこのヒットにだけ乗る。射撃の回数のきっかけ・perBurstHit とは組み合わせない
   */
  hitsRef?: number;
  /**
   * 同 5.2 節: ヒットとヒットの間（フレーム。0 以上の整数）。省略は 0（N ヒットが同じフレーム）。測った値を即値で書き、根拠の結論を
   * claims に結ぶ。hitsRef と組むときだけ
   */
  hitIntervalFrames?: number;
  /**
   * エレグの S1（C-0766）: 1 回の発動を、ref の値を等分したヒットに分けて出す。各ヒットの、発火の delayFrames 後からの遅れ（フレーム。
   * 0 から始まる昇順の整数。長さがヒットの数）。測った値を即値で書き、根拠の結論を claims に結ぶ。hitsRef・perBurstHit・perCount・
   * gaugeHits とは組み合わせない（gaugePerHit なら、どのヒットも射手の 1 ヒットぶんを溜める。C-0773）
   */
  hitOffsetFrames?: number[];
  /**
   * 同: 値（撃つ側と敵の側のバフ・フルバースト補正）を、発火のこのフレーム数後のもので決め、どのヒットもその値で出す（1 以上、delayFrames
   * 以下の整数）。省略は、遅れがあればヒットのフレームの値（遅れて出る倍率ダメージ編）。hitOffsetFrames と組むときだけ
   */
  valueDelayFrames?: number;
  /**
   * 同 5.4 節: 「コア命中ダメージ」。コアに当たったヒットとして、コアの項（コア倍率 − 1 + コアダメージ▲）を足す（割合 1。敵にコアが
   * 無ければ足さない）。射撃ごとに畳み込む効果（毎回の回数のきっかけで条件なし）には書けない
   */
  coreHit?: true;
  /**
   * 同 5.3 節: 「〈状態〉再発動周期 N 秒▼」。時間の周期のきっかけ（{ everySeconds }）の damage にだけ書ける。前の発動のフレームに自分が
   * state（家族の根なら家族のどれか）で、縮めた次の発動のフレームでも state なら、次の発動までを everySeconds − N 秒にする（同 10.2 節の f。
   * C-0738）。N は slot のスロットの
   * description_value_NN（ref）。縮めた周期が 0 秒以下になる値は解決で落とす
   */
  periodShorten?: PeriodShorten;
  /**
   * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: perCount の数だけのヒットを、倍率を掛けずに 1 つずつ、発火のフレームから
   * この間隔（秒・即値。録画で読む）で出す。k 個目（0 始まり）は発火の floor(k × 間隔 ÷ 0.017) フレーム後（端数を持ち越す。ラピ：
   * レッドフードの粘着榴弾の起爆は 0.2 秒ごと。C-0726）。perCount のときだけ書ける。
   * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: perCount の { state } と、delayFrames とも組める（k 個目は発火の
   * delayFrames + floor(k × 間隔 ÷ 0.017) フレーム後。オートファイアの順番の攻撃。V-0552）
   */
  perCountIntervalSeconds?: number;
  /**
   * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.2 節）: 同じく 1 つずつ、決まったフレーム数（録画で読んだ即値）ごとに出す。k 個目は
   * 発火の delayFrames + k × この値のフレーム後（ミハラ：ボンディングチェーンのチェーンの攻撃は 15。V-0546）。perCountIntervalSeconds と
   * どちらか 1 つ
   */
  perCountIntervalFrames?: number;
  /**
   * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 「（装填数分だけ）順番に攻撃」。perCount の数だけ 1 つずつ出すヒット
   * （perCountIntervalSeconds・perCountIntervalFrames）を順番の攻撃にし、順番攻撃ダメージ▲（sequentialAttackDamage）を掛ける
   * （hitsRef のヒットと同じ。値は true だけ）
   */
  sequentialAttack?: true;
  /**
   * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: ヒットがコアに当たりうるか。当たる割合は的の表の coreHitRate.autoAttacks の
   * `<resourceId>:<スロット>` の行（無ければ 0）で、当たったヒットは倍率グループに (コア倍率 − 1) を足す（autoAttack の core と同じ。
   * 粘着榴弾の付着）
   */
  core?: true;
  /**
   * 同: ヒットに、撃った枠の通常攻撃と同じ距離ボーナス（着地点の条件。条件が手入力の枠はその値）を倍率グループに足す（粘着榴弾の付着と
   * 爆発）
   */
  distance?: true;
  /** 同 2.3 節: ヒットが発射体の爆発か。発射体爆発ダメージ▲を掛ける（autoAttack の projectileExplosion と同じ。粘着榴弾の起爆） */
  projectileExplosion?: true;
  /** 同: ヒットが発射体の付着か。発射体付着ダメージ▲（projectileStickDamage）を掛ける（damage.ts の stickHitMultiplier。粘着榴弾の付着） */
  projectileStick?: true;
  /** 常に満たすとみなした条件（対象の数など）。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/**
 * 周期の短縮（damage の periodShorten）。N 秒は slot のスロットの description_value_NN（ref）。鍵は次のどちらか:
 * - state: 自分の名前の付いた状態の間（マリアン：クイーン。C-0738。前の発動のフレームと縮めた次の発動のフレームの両方で状態のとき縮める）
 * - window: 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節。論点 7）: 名前の無い窓。自分の trigger（burstUse）のフレームから
 *   slot のスロットの description_value_NN（durationRef）秒の間。縮めた次の発動のフレームが窓の中なら縮める（前の発動のフレームは見ない。
 *   エイダの S2 の閃光手榴弾投擲の発動間隔▼。V-0569）。2 段目の段 18 の PR 1（plan/design-skill-stage18.md 2.2 節。V-0612）: elapsed なら、
 *   クールタイムを縮める窓（T4 のクールタイム▼の読み）。発動のフレームが窓の中なら次の発動まで縮めた周期、外なら縮めない周期で、窓が始まった
 *   フレームからは縮めた周期で次の発動が来る（ドロシーの発現。skills/timeline.ts の elapsedShortenedTimerFrames）。carry の周期とは組まない
 */
export type PeriodShorten = { slot: SkillSlot; ref: number } & (
  | { state: NamedStateId; window?: never }
  | { window: { trigger: 'burstUse'; durationRef: number; elapsed?: true }; state?: never }
);

/** 2 段目の段 12・13: perCount の数だけ 1 つずつ出す倍率ダメージ（perCountIntervalSeconds・perCountIntervalFrames）か */
export function splitsPerCount(
  effect: Pick<DamageEffect, 'perCountIntervalSeconds' | 'perCountIntervalFrames'>,
): boolean {
  return effect.perCountIntervalSeconds !== undefined || effect.perCountIntervalFrames !== undefined;
}

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
  targetClass?: NikkeClass;
  /** アニス：スター編: バースト段階の構成の条件 */
  burstStepMix?: BurstStepMixCondition;
  /** ラム編: 同じ部隊の味方の条件 */
  squad?: SquadCondition;
  /**
   * 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6 節）: 発火の条件。鍵は selfState だけ（モランの宝物版の S2「自分が熱血状態なら」）。
   * 発火のフレームに、timed の段 1.5 の条件と同じ件を見る（skills/holders.ts の instantConditionHolds）
   */
  condition?: EffectCondition;
  assumes?: LocalizedText;
} & (
    | {
        /** 秒数の description_value_NN */
        ref: number;
        seconds?: never;
      }
    | {
        /** 2 段目の段 12（plan/design-skill-stage12.md 2.5 節）: 説明文に直書きの秒数（「クールタイム 20 秒▼」）。ref とちょうど片方 */
        seconds: number;
        ref?: never;
      }
  );

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
  targetClass?: NikkeClass;
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
export type HealEffect = TargetCountFields &
  FixedTargetFields & {
    kind: 'heal';
    trigger: EffectTrigger;
    /** 2 段目の段 8: lowestHpRatio（残りの HP の割合が最も低い味方 N 機。N は targetCount / targetCountRef）も書ける */
    target: BuffTarget;
    targetWeapon?: WeaponType;
    targetElement?: Element;
    /** 2 段目の段 9: 「〈クラス〉型の味方」（エヌ：ミラクルフェアリーの S1・バースト） */
    targetClass?: NikkeClass;
    /**
     * 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節）: 「基本バースト段階が N の」（timed の targetBurstStep と同じ。対象 burstUsers・
     * allies だけ。エイダの S1 の吸収回復）
     */
    targetBurstStep?: BasicBurstStep;
    /** 回復量（%）の description_value_NN（UI の表示用） */
    ref: number;
    /** 維持秒数の description_value_NN（任意。durationSeconds と両方は書けない） */
    durationRef?: number;
    durationSeconds?: number;
    /** 回復の語彙編（plan/design-heal-vocabulary.md 2.1 節）: バースト段階の構成の条件（アニス：スター S2 のみんなの星） */
    burstStepMix?: BurstStepMixCondition;
    /** 回復の語彙編: 同じ部隊の味方の条件 */
    squad?: SquadCondition;
    /** F5（plan/design-heal-vocabulary.md 3.3 節）: 編成に特定のキャラがいる条件 */
    withCharacter?: WithCharacterCondition;
    /**
     * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: 射撃の回数のきっかけで、回復をきっかけの射撃のフレームの
     * delayFrames 後のフレームの始めに起こす（1 以上の整数。どの枠にもそのフレームから効き、C-0628 の枠の順の規則は当てない）
     */
    delayFrames?: number;
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
  targetClass?: NikkeClass;
  /** % の description_value_NN */
  ref: number;
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 11（plan/design-skill-stage11.md 2.2 節）: 「残弾数 X% 減少」。発火の瞬間に、対象（自分）の基礎の武器の残弾から
 * 残弾 × X% を減らす（端数は切り上げ。100% なら 0）。0 になったらリロードを始める（即時効果）。いまはきっかけ { weaponChangeEnd }
 * （使用武器の変更が終わった時）にだけ書ける
 */
export type AmmoDecreaseEffect = TargetCountFields & {
  kind: 'ammoDecrease';
  trigger: EffectTrigger;
  target: 'self';
  /** 絞り込みの欄は即時効果の型をそろえるためだけにある（検証で弾く） */
  targetWeapon?: WeaponType;
  targetElement?: Element;
  targetClass?: NikkeClass;
  /** % の description_value_NN */
  ref: number;
  assumes?: LocalizedText;
};

export type InstantEffect =
  CooldownReductionEffect | AmmoRefillEffect | HealEffect | BurstGaugeEffect | AmmoDecreaseEffect;
export type InstantKind = InstantEffect['kind'];
export const INSTANT_KINDS = [
  'cooldownReduction',
  'ammoRefill',
  'heal',
  'burstGauge',
  'ammoDecrease',
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
   * （録画 0044。照準範囲内の敵の数か弾の数かは未確定）。会心はヒットごとに判定されるので、期待値は武器倍率 × ヒット数と同じ
   */
  hitsPerShot?: number;
  /** 防御力無視ダメージ編: 変更後の武器の 1 発を防御力無視ダメージにする（「最終攻撃力の X% の防御力無視ダメージ」） */
  trueDamage?: true;
  /**
   * 炸裂弾の発射体爆発ダメージ▲編: 変更後の武器の発が発射体の爆発を持つ（発射体爆発ダメージ▲が乗る。damage.ts の hasProjectileExplosion）。
   * 基礎の武器の発射体（着弾の範囲など）は変えない。ウンファ：TU の炸裂弾は C-0376
   */
  projectileExplosion?: true;
  /**
   * 使用武器変更の武器のパラメータ（plan/design-true-damage-element.md 9 節）: 変更後の武器のチャージ時間（秒・即値）。
   * 説明文に数字で書かれている（description_value でない）。省略は基礎の武器のまま。チャージ武器にだけ書ける
   */
  chargeTimeSeconds?: number;
  /** 同: 変更後の武器のフルチャージダメージ（%・即値。300 = 300%）。省略は基礎の武器のまま。チャージ武器にだけ書ける */
  fullChargeDamage?: number;
  /**
   * 同: 変更後の武器の最大装弾数の description_value_NN。書いたら維持の欄（durationRef・durationSeconds）は書かず、
   * 変更後の武器はリロードせず、最後の弾丸を撃ったフレームの次のフレームに基礎の武器に戻る（撃ち切り。論点 8）
   */
  maxAmmoRef?: number;
  /** 維持秒数の description_value_NN。durationSeconds とちょうど片方（maxAmmoRef を書いたらどちらも書かない） */
  durationRef?: number;
  durationSeconds?: number;
  /**
   * 2 段目の段 11（plan/design-skill-stage11.md 2.1 節。論点 2）: 変更後の武器の発射レート（rpm・即値。録画で読む）。CDN に変更後の
   * レート（burstSkill.changeWeapon）が無い変更（バースト以外のスロットからの変更）にだけ書く。CDN の値があるキャラには書けない
   */
  rateOfFire?: number;
  /**
   * 同: 変更後の武器は即着弾（fireType Instant）でチャージしない（基礎の武器がチャージ武器・飛ぶ弾でも）。録画で読む。
   * chargeTimeSeconds・fullChargeDamage とは組み合わせない
   */
  instantFire?: true;
  /**
   * 同: 変更の窓が射手に見える最初のフレーム（窓の始まりの次のフレーム）から、変更後の武器の最初の発までの待ち（フレーム・即値。
   * 録画で読む）。省略はいままでどおり（skills/../frame/shooter.ts の weaponChangeShooter の待ち）
   */
  firstShotDelayFrames?: number;
  /**
   * 2 段目の段 11 の PR 4（plan/design-skill-stage11.md 3.4 節）: 変更後の武器は撃っても残弾を減らさない（維持の間リロードしない）。
   * 説明文に「装弾数無限」の行が無い変更で、録画で読む（たきなのバースト。C-0708）。維持の欄（durationRef・durationSeconds）の変更にだけ書ける
   */
  infiniteAmmo?: true;
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
  /**
   * 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: 段のダメージを、段を出した射撃の delayFrames 後に
   * 出す（1 以上の整数）。紅蓮BS は A 10・B 9・C 9（C-0651。射撃のフレームは撃ったフレーム。C-0661）。gaugeHits は射撃から数えたまま
   */
  delayFrames?: number;
  assumes?: LocalizedText;
};

/**
 * Stage 11 紅蓮BS: 「攻撃回数別の効果」「各段階の効果のみ適用」の循環。trigger の回数（射撃の通算カウンタの every の倍数）ごとに
 * steps を 1 段ずつ順に発動し、最後の次は最初に戻る。段のポインタはカウンタと別に 1 つだけ持ち、戦闘中ずっと続く
 * （リロードでもフルバーストでも戻さない）。録画 0046・0047 で確認（plan/design-stage11-scarlet-bs.md 0.3 節）。
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
 * every 回ごとに進める（通算カウンタの every の倍数。1 なら毎回）。カウンタ自体は変えない（録画 0047 の 5 回の FB で確認）。
 * 対象は常に自分。件は持ち主ごとの一覧の履歴（cycleEvery の件）に置き、区間には入れない。
 * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: slot に cycle が無ければ、そのスロットの射撃の回数のきっかけ（{ count }）
 * のすべてを、窓の間 every 回ごと（通算の回数の every の倍数。cycle と同じ数え方）に発火させる（「スキル2粘着榴弾発動回数条件 N 回▼」。
 * C-0727）。decreaseRef は「N 回▼」の N の description_value_NN で、窓の中の間隔はきっかけの回数 − N（every とちょうど片方）
 */
export type CycleEveryEffect = {
  kind: 'cycleEvery';
  trigger: EffectTrigger;
  /** 対象の cycle（か射撃の回数のきっかけ）を持つ自分のスロット */
  slot: SkillSlot;
  /** 変更後の段の間隔（即値。説明文の「1 回 / 2 回 / 3 回」は 1）。decreaseRef とちょうど片方 */
  every?: number;
  /** 2 段目の段 12 の PR 2: 「回数条件 N 回▼」の N の description_value_NN（対象のきっかけの回数から引く） */
  decreaseRef?: number;
  /** 2 段目の段 12 の PR 2: バースト段階の構成の条件（ラピ：レッドフードの「バーストⅢで使用した時」） */
  burstStepMix?: BurstStepMixCondition;
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
export type DotFirstTick = 'atApplication' | 'afterInterval' | 'halfAfterLatest';
export const DOT_FIRST_TICKS = [
  'atApplication',
  'afterInterval',
  'halfAfterLatest',
] as const satisfies readonly DotFirstTick[];

export type DotEffect = {
  kind: 'dot';
  /** 2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2 節）: 付くフレームの条件（selfState だけ。ジルの硫酸弾） */
  condition?: EffectCondition;
  /** 2 段目の段 13 の PR 1: { counterFull } も（damage と同じ。perCount の { counter } と組む） */
  trigger: EffectTrigger;
  /** 1 tick の倍率（%）の description_value_NN */
  ref: number;
  /** tick の間隔（秒の即値。説明文の「1秒間隔」は直書き）。維持時間以下 */
  intervalSeconds: number;
  /** 維持秒数の description_value_NN。durationSeconds・durationUntil とちょうど 1 つ */
  durationRef?: number;
  durationSeconds?: number;
  /** 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: 「持続」（battleEnd だけ。firstTick: halfAfterLatest のときだけ） */
  durationUntil?: 'battleEnd';
  /**
   * クルミ編: tick の時刻の形（plan/design-kurumi.md 2.1 節）。省略は atApplication。
   * atApplication = 付いた瞬間と、1.5 秒後から間隔ごと（ニヒリスターの火傷。C-0101）、
   * afterInterval = 付いた 1 間隔後から間隔ごと（クルミのハッキング。C-0130）。
   * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: halfAfterLatest = 付けるたびに刻みを付け直し、最後に付けた 0.5 間隔後から
   * 間隔ごと（ミハラ：ボンディングチェーンのチェーンバインド。V-0546）。k 回目（0 始まり）は最後の付与の round((k + 0.5) × tickIntervalFrames)
   * フレーム後（tickIntervalFrames が無ければ (k + 0.5) × 間隔の秒に達した最初のフレーム）。durationUntil: battleEnd・maxStacksRef と組む
   */
  firstTick?: DotFirstTick;
  /**
   * 同: tick の間隔の実測（ゲーム内のティック。端数を持ち越す）。チェーンバインドの 59.25 は、説明文の「1秒間隔」（58.82 ティック）より長い
   * （V-0326・V-0546）。firstTick: halfAfterLatest のときだけ書ける
   */
  tickIntervalFrames?: number;
  /**
   * 同: 付けるたびに、付けた 1 スタックぶんの 1 ヒットを付けたフレームに出す（tick の刻みは変えない。C-0411）。firstTick: halfAfterLatest の
   * ときだけ書ける
   */
  hitOnApply?: true;
  /**
   * 同 2.2・2.3 節: { counter } の数だけ、発火のフレームから perCountIntervalFrames ごとに 1 スタックずつ付ける（damage の perCount と同じ
   * 見え方。トリガーは { counterFull } だけ）。delayFrames は最初の付与の発火からの遅れ
   */
  perCount?: { counter: CounterId };
  perCountIntervalFrames?: number;
  delayFrames?: number;
  /**
   * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 「個別対象ごとに〈名前〉スタックコピー」。付けた時の tick のスタックの数を、
   * 発火のフレームに敵に付いている、同じ枠の別の dot（その state）のスタックの数にする（0 なら付かない。後で元が増減しても変わらない）。
   * tick の値は 1 スタックの倍率 × その数（ミハラ：ボンディングチェーンのプリング・チェーン）
   */
  stacksFrom?: { enemyState: NamedStateId };
  /**
   * マスト編（plan/design-mast.md 2.3 節）: stacksFrom の数を、付けた時に 1 回だけでなく tick ごとに写し直す（その tick のフレームの判定で
   * 敵に付いている元のスタックの数。0 の tick は出さない）。stacksFrom のときだけ書ける。写す時刻は撮影で決める（論点 4）
   */
  copyEachTick?: true;
  /**
   * マスト編（同 2.3 節。論点 5）: false は「持続ダメージ」でない周期のダメージ（説明文の「ダメージ」「1 秒間隔」。暴風）。tick に
   * 持続ダメージ▲（sustainedDamage）を掛けない（skills/burstDamage.ts の sustained を立てない）。省略は持続ダメージ
   */
  sustained?: false;
  /**
   * クルミ編: 状態異常の名前（「ハッキング」など）。同じキャラの同じ state の dot は 1 つの持続ダメージとして扱い、
   * 発火をまとめて tick を出す（どれで付いても付き直しと同じ。C-0136）。間隔・維持・firstTick・倍率は同じであること。
   * 省略は効果ごとに別の持続ダメージ。名前の付いた状態の語彙編（plan/design-named-state.md 5.5 節）: status を改め、目録の id
   * （持ち主が敵の状態）にした。条件 enemyState が見る
   */
  state?: NamedStateId;
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
   * 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: 付けたときのゲージ（gaugeOnApply）を、発火の
   * フレームの delayFrames 後に足す（1 以上の整数。レイヴンは 6。C-0181・C-0661）。tick の時刻は動かさない
   */
  gaugeOnApplyDelayFrames?: number;
  /**
   * 回数トリガーの遅れ編の第 2 段の残り（plan/design-shot-count-trigger-frame.md 6.7 節の論点 9）: tick の刻み（とスタックの数）を、発火のフレームの d 後を
   * 起点に数える（1 以上の整数。レイヴンは 5。付けたのは撃った 6f 後で、その 1f 前が起点。C-0765）。
   * 付けたときのゲージ（gaugeOnApplyDelayFrames）は動かさない。トリガーは射撃の回数トリガーだけ
   */
  tickDelayFrames?: number;
  /**
   * レイヴン編（2.2 節）: tick ごとに、射手の 1 ヒットぶんのバーストゲージを tick のフレームに足す。スタックの数によらない
   * （C-0181）。firstTick: afterInterval で、維持が間隔の整数倍のときだけ（8 節の 2。解決のときに見る）。トリガーは射撃の回数トリガーか、
   * burstUse（クルミのハッキング。C-0196。plan/design-raven-s1.md 10 節）。同じ state の効果は、どれも同じ値にする（tick は持続ダメージ
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
   * （アニス：スターのシューティングスター。V-0124 の 0162-12。plan/design-anis-star-s2-burst.md 9.3 節の a）
   */
  projectileExplosion?: true;
  /**
   * ヒットがコアに当たりうるか。当たる割合は的の表の coreHitRate.autoAttacks（`<resourceId>:<スロット>` の行。無ければ 0）、
   * 当たったヒットは boost に (コア倍率 − 1) を足す（通常攻撃のコアと同じ加算の枠。plan/design-anis-star-core-path.md 3.1 節）
   */
  core?: true;
  assumes?: LocalizedText;
};

/**
 * フラワー編: トリガーが発火するたびに、射手の 1 ヒットぶんのバーストゲージ（targetBurstEnergyPerShot。フルチャージ倍率は
 * 乗らない）を発火のフレームのゲージに足す。ダメージは出さない（I-DOLL・フラワーの S2。C-0178）。
 * トリガーは時間の周期のトリガー（{ everySeconds }。plan/design-flower-s2-gauge.md 2 節）か、モラン編で足した射撃の回数の
 * トリガー（{ count }。stacksRef は書けない。発火した射撃のフレームに足す。plan/design-moran.md 2 節）
 */
export type BurstGaugeHitEffect = {
  kind: 'burstGaugeHit';
  trigger: TimerTrigger | ShotCountTrigger;
  /**
   * 周期のスキルのヒットのゲージ（C-0404・C-0409）: 発火のフレームの delayFrames 後に足す（1 以上の整数）。
   * 同じスキルの倍率ダメージの delayFrames（C-0453）と揃える（plan/design-timer-ceil.md 7 節）。
   * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: 射撃の回数のトリガーにも書け、発火した射撃のフレームの
   * delayFrames 後のゲージに足す（モラン S2 の挑発。C-0480）
   */
  delayFrames?: number;
  assumes?: LocalizedText;
};

/**
 * V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717）: 射撃の回数のトリガーが発火した射撃の次のフレームから frames フレームの間、
 * 自分の射手を進めない（撃たず、待ち・リロードも進めない。残弾・スピンアップ・レートの蓄積はそのまま持ち越す）。ダメージは出さない。
 * 発火した射撃で残弾が 0 になった（その発からリロードに入る）ときは、frames の代わりに framesOnLastShot フレーム止める
 * （リロードがその分遅れる。C-0718）。止めている間のフレームは射撃の回数に入らない
 */
export type ShotPauseEffect = {
  kind: 'shotPause';
  trigger: ShotCountTrigger;
  /** 止めるフレーム数（1 以上の整数。録画で読む） */
  frames: number;
  /** 発火した射撃がマガジンの最後の弾丸のときに止めるフレーム数（1 以上の整数。省略は frames） */
  framesOnLastShot?: number;
  assumes?: LocalizedText;
};

/**
 * アニス：スター S1 の味方のゲージ編（plan/design-anis-star-ally-gauge.md 2 節）: 「味方全体のバーストゲージのチャージ速度 N%▲」の味方の分。
 * 持つ枠のほかの枠のゲージ 1 回（通常攻撃の弾のヒットと、射撃ごとの倍率ダメージのゲージのヒット）ごとに、持つ枠の 1 発のゲージ × N%
 * （ref）を足す。持つ枠の 1 発のゲージは、持つ枠の最初の発が着弾する前は burstEnergyPerShot、着弾から targetBurstEnergyPerShot
 * （C-0244・C-0245・C-0246・C-0620）。持つ枠自身の分は passive の burstGaugeSpeed（対象 self）で書く。1 つの定義に 1 つまで
 */
export type AllyGaugeAddEffect = {
  kind: 'allyGaugeAdd';
  ref: number;
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 15 の PR 2（plan/design-skill-stage15.md 2.2 節）: 「遮蔽物 HP 回復」。回復量はダメージに効かないので計算は読まない。
 * 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節）: 対象の枠ごとに「遮蔽物 HP 回復を受けた」出来事を起こし、その枠の
 * timed のきっかけ { coverHealed: true }（「遮蔽物の HP を回復した時」）が読む。起きるフレームは回復（heal）と同じ（healFrameOf）。
 * 対象は自分（ティアの S2）か味方全体（ナガの S1）。段 17 の PR 2（同 3.2 節。論点 3）: 遮蔽物 HP が最も低い味方 N 機
 * （lowestCoverHp。リターの S2）は、モデルが遮蔽物 HP を持たないので、編成（空枠を除く）が N 体以下の時だけ全員を選び、N 体より多い時は
 * 選び方を確かめていないので誰も選ばない（未実装。定義の notes に未対応で書く）
 */
export type CoverHealEffect = TargetCountFields & {
  kind: 'coverHeal';
  trigger: EffectTrigger;
  target: 'self' | 'allies' | 'lowestCoverHp';
  /** 回復量（%）の description_value_NN（表示用） */
  ref: number;
  /**
   * 段 17 の PR 2: 時間の周期のきっかけ（CT ごとのアクティブ）の発動から、回復を受けた出来事までのフレーム（1 以上の整数。測った遅れを
   * 即値で書き、根拠の結論を claims に結ぶ。C-0453 の倍率ダメージの delayFrames と同じ）。時間の周期のきっかけにだけ書ける
   */
  delayFrames?: number;
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
 * 2 段目の段 12（plan/design-skill-stage12.md 2.5 節）: 「戦闘補助：バースト N に変更」。持つ枠のバーストの段（BurstUnit.burstStep）を、
 * バーストのチェーンを組む前に step に差し替える（次の段階は段の順のまま。burstReentry があればそれ）。差し替えた段はチェーンにだけ効き、
 * ほかのキャラの burstStepMix・targetBurstStep（「基本バースト段階が N の」）は差し替える前の段で数える。編成で決まる静的な効果で、
 * 編成の条件（burstStepMix・squad）を付けられる。どのスロットにも書けるが、1 つの定義に 1 つまで
 */
export type BurstStepChangeEffect = {
  kind: 'burstStepChange';
  step: BasicBurstStep;
  /** 変更の名前（説明文の「戦闘補助」）。書けば、同じ定義の編成の条件の付いた効果に burstStepMode を付ける */
  name?: LocalizedText;
  burstStepMix?: BurstStepMixCondition;
  squad?: SquadCondition;
  assumes?: LocalizedText;
};

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.3 節）: 状態の中身の 1 項目。状態の窓の間だけ持ち主に効く stat の▲▼。
 * 欄の意味は timed の値の欄と同じ。ref は付与のあるスロットの説明文の値（そのスロットの Lv で解く）。項目に kind が無ければ
 * stat の▲▼と読む（ほかの種類は後の拡張で kind を持つ項目として足す。同 8.4 節）。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 「〈状態〉の最大スタック数 N▲」の項目（maxStacksUp）も持てる
 */
export type StateContentItem = StatContentItem | MaxStacksUpContentItem;

/** 名前の付いた状態の語彙編: stat の▲▼の中身の項目 */
export type StatContentItem = Pick<TimedEffect, 'stat' | 'ref' | 'scaling' | 'decrease'> & ClaimRefs;

/**
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 「〈状態〉の最大スタック数 N▲」（セブンスドワーフ・フルアクティブの
 * 効果 3「オートファイア準備 最大装填数 10▲・持続」）。持ち主の state の上限（同じ定義のその状態の付与の maxStacks）に、この中身の状態の
 * 件が付いている間だけ N を足す（中身の状態のスタック数によらず 1 回。skills/holders.ts）。上限は state の始まり（付与の発火）ごとに、その
 * フレームの値で見る。上限が戻っても、付いている段は切らない。amountRef は付与のあるスロットの説明文の値（整数）
 */
export type MaxStacksUpContentItem = { maxStacksUp: { state: NamedStateId; amountRef: number } } & ClaimRefs;

/** 2 段目の段 14 の PR 3: 中身の項目が stat の▲▼か（maxStacksUp でない） */
export function isStatContent(item: StateContentItem): item is StatContentItem {
  return !('maxStacksUp' in item);
}

/** 2 段目の段 14 の PR 3: 中身の項目の stat の名前（最大スタック数▲の項目は 'maxStacksUp'。最小構成の検査の形・一覧の表示） */
export function contentStatOf(item: StateContentItem): BuffStat | 'maxStacksUp' {
  return isStatContent(item) ? item.stat : 'maxStacksUp';
}

/** 2 段目の段 14 の PR 3: 中身の項目のうち stat の▲▼だけ（並びは保つ） */
export function statContentsOf(contents: readonly StateContentItem[] | undefined): StatContentItem[] {
  return (contents ?? []).filter(isStatContent);
}

/**
 * 名前の付いた状態の語彙編（同 5.2 節）: 状態の付与。timed から値の欄（stat・ref・scaling・decrease）を除き、目録の id（state）を
 * 足したもの。窓の作り方は timed と同じ（発火・対象・維持・上書き延長・スタック・条件・段）。同じ定義の同じ状態の付与は 1 つの状態
 * （発火をまとめて和集合・スタックの段にする）で、中身（contents）を持てるのはそのうち 1 つ、維持とスタックの上限は同じ。
 * 書けないのは name・amplifies と、トリガーの確率のきっかけ。{ applied } は 2 段目の段 4 から書ける（自分の状態は見ない。連鎖させない）。
 * 静的な状態（staticStatesOf）の付与は編成の段で持ち主が決まり、中身は常時パッシブとして解く。2 段目の段 4（plan/design-skill-stage4.md
 * 1.2 節）: 維持 0 秒の付与は、名前の付いた即時効果の付いた記録だけを作る（中身・スタック・解除不可は書けない）
 */
export type StateGrantEffect = Omit<TimedEffect, 'kind' | 'stat' | 'ref' | 'scaling' | 'decrease' | 'amplifies'> & {
  kind: 'state';
  /** 目録の id（持ち主が味方の状態。enemy なら敵の状態） */
  state: NamedStateId;
  /**
   * エレグのバースト編（plan/design-elegg.md 8.2 節。plan/design-named-state.md 8.3 節）: JSON の target: "enemy"（敵に付く状態の付与。
   * 敵は 1 体の前提）。状態の件の列の持ち主は敵（skills/holders.ts の ENEMY）。中身は敵が持つ stat（isEnemyHeldStat）だけで、
   * 敵の件の timed と同じく味方全体の区間の値に写すので、target は "allies" に読み替えて持つ
   */
  enemy?: true;
  /** 状態の間だけ持ち主に効く中身（同 5.3 節） */
  contents?: StateContentItem[];
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.3 節）: 説明文の「解除不可」。効果解除と、後から付く発動不可で外れない。
   * 持続の長さは変えない。読むのは解除（後の語彙）・効果解除（後の語彙）と、画面の状態の表示
   */
  undispellable?: true;
  /**
   * 2 段目の段 10（plan/design-skill-stage10.md 2.1 節）: 1 回の発火で付けるスタックの数を、発火のフレームの前のフレームの終わりの自分の
   * カウンタの値にする（0 なら付けない）。超火力チャージ（ネオン：ビジョン・アイの S2）は、火力ゲージの値をスタック数にして付く（V-0503）。
   * maxStacks（即値）がカウンタの上限以上であること。
   * 2 段目の段 10 の PR 3（同 3.3 節）: { state } は、発火のフレームの自分のその状態のスタック数（段 1 の件。条件 selfState が見るものと
   * 同じ）。その場しのぎの奇跡（トーブの宝物版のバースト）は、応急改造のスタック数で付き、後で応急改造が減っても維持の間は変わらない
   * （V-0523）。maxStacks（即値）を書く
   */
  stacksFrom?: StacksFrom;
  /**
   * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 1 回の発火で付けるスタックの数の description_value_NN（整数。
   * 上限以下）。セブンスドワーフ・フルアクティブの使用回数（値 05 = 2 回）は、バースト使用時に 2 スタックで付き、使うたびに stackChange の
   * 減少で 1 つずつ減る。maxStacks か maxStacksRef と組み、stacksFrom とは組み合わせない
   */
  stacksPerFireRef?: number;
  /**
   * 徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節。C-0816）: 回数のきっかけ { count: "weaponChangeShot" } の付与で、
   * 件をきっかけの発のフレームの leadFrames 前から始める（1 以上の整数。書かなければ次のフレームから）。付けた枠（出どころ）の値の小片
   * だけは、いままでどおり発の次のフレームから効かせ、きっかけの発自身には乗らない（C-0312）。1 パス目で状態を見るもの（条件
   * enemyState など）にも件の始まりから見える（1 パス目を回し直す。同 5 節の frame/firstPass.ts の runFirstPass）。条件・stacksFrom・
   * 順位の対象とは組み合わせない（発のフレームで判定するもの。同 5.3 節）
   */
  leadFrames?: number;
  /**
   * マスト編（plan/design-mast.md 2.1 節）: スタックの維持の数え方を、この状態だけ 'each'（スタックごとに独立の維持。skills/stacks.ts）に
   * する。省略はいまの既定（STACK_REFRESH）。maxStacks か maxStacksRef と組み、stackChange の減少と最大スタック数▲の中身とは組まない。
   * 撮影で数え方を見分ける予測の仮説（addEffects の replace）に使う
   */
  stackRefresh?: 'each';
};

/** 2 段目の段 10: 付与のスタックの数の出どころ（カウンタの値か、自分の状態のスタック数） */
export type StacksFrom = { counter: CounterId } | { state: NamedStateId };

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 「〈名前〉解除」（Removes）。発火のフレーム f に、持ち主（自分）のその状態の件
 * （出どころは問わない。スタックはすべて）を f + 1 で閉じる（f の判定には付いている）。解除不可の件（付与の undispellable）は
 * 閉じない。同じフレーム f に同じ状態が付いた件の列は閉じない（付与が勝つ）。段は、条件なし（と usedBurst だけ）は 1、件を見る
 * 条件つきは 1.5。消去（Cancels。解除不可の件も閉じる）は、使い手を定義する時に別の種類で足す（分類の設計書の論点 8）
 */
export type RemoveStateEffect = {
  kind: 'removeState';
  /** 目録の id（持ち主が味方の状態） */
  state: NamedStateId;
  trigger: EffectTrigger;
  /** 説明文の例はどれも自分なので、自分だけ（味方の状態を外す例が出たら広げる） */
  target: 'self';
  condition?: EffectCondition;
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 「〈名前〉消去」（Cancels）。発火のフレーム f の効果の判定（同じ発動の dot の
 * stacksFrom が写す数）の後に、敵に付いたその持続ダメージ（同じ定義の dot の state。解除不可も）を閉じる。f より後の tick は出ず、次に付けた時は
 * 1 スタックから。分類の設計書の論点 8 の「消去」（解除とは別）
 */
export type CancelStateEffect = {
  kind: 'cancelState';
  /** 目録の id（持ち主が敵の状態。同じ定義の dot の state） */
  state: NamedStateId;
  trigger: EffectTrigger;
  target: 'enemy';
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.1 節）: 「〈名前〉のスタック量 N 個▲」。発火のフレーム（射撃の回数のきっかけは次のフレーム）に、
 * 持ち主（自分）のその状態に N スタックを足す。上限・維持・中身は、同じ定義のその状態の付与（スタックを持つ。対象は自分）のもの。
 * 2 段目の段 3（同 1.5 節）: decrease は「〈名前〉のスタック量 N 個▼」。発火のフレームに効いている段の上から N 段を、次のフレームで
 * 切る（同じフレームの判定には付いている）。最後の 1 段は残す（V-0437）。減らす先は、足す先と同じ（同じ定義の付与の、自分の件の列）。
 * 後の付与は減った段から数える
 */
export type StackChangeEffect = {
  kind: 'stackChange';
  /** 目録の id（持ち主が味方の状態。target が enemy なら敵の状態） */
  state: NamedStateId;
  trigger: EffectTrigger;
  /**
   * 2 段目の段 13 の PR 3（plan/design-skill-stage13.md 2.6 節）: enemy なら、同じ定義の firstTick halfAfterLatest の dot（敵に付く
   * スタックの持続ダメージ）のスタック量▲。付与と同じく、1 スタックぶんのヒットと刻みの付け直しを伴う（frame/plan.ts の planSkillHits。
   * V-0548）。条件は { enemyState: state } だけで、減少（decrease）は書けない
   */
  target: 'self' | 'enemy';
  /** 足す（減らす）スタックの数（即値）。amountRef とどちらか 1 つ */
  amount?: number;
  /** 足す（減らす）スタックの数の description_value_NN */
  amountRef?: number;
  /** 2 段目の段 3: スタック量の減少（▼） */
  decrease?: true;
  /**
   * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 減少で最後の 1 段も切る（スタックが 0 になったら件を閉じる。
   * 説明文の「解除条件：使用回数を使い切った時」。セブンスドワーフ・フルアクティブの使用回数 1 回▼）。無ければ段 3 のまま最後の 1 段は
   * 残す（V-0437）。decrease の自分の状態だけ
   */
  closesAtZero?: true;
  condition?: EffectCondition;
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 10（plan/design-skill-stage10.md 2.3・2.4 節）: 「〈カウンタ〉N チャージ」「〈カウンタ〉N 消費」。発火のフレームの、そのフレームの
 * すべての判定の後に、自分のカウンタに N を足す（decrease なら減らす）。結果は 0 と上限の間で切る。トリガーは parseTrigger のものと、
 * { ended: 状態 }（自分のその状態の件が外れたフレーム。段 4 の 1.3 節）
 */
export type CounterChangeEffect = {
  kind: 'counterChange';
  counter: CounterId;
  trigger: EffectTrigger | EndedTrigger | CounterFullTrigger;
  target: 'self';
  /** 足す（減らす）値（即値）。amountRef とちょうど片方 */
  amount?: number;
  /** 足す（減らす）値の description_value_NN（整数に丸める） */
  amountRef?: number;
  decrease?: true;
  condition?: EffectCondition;
  assumes?: LocalizedText;
};

/** 2 段目の段 10（plan/design-skill-stage4.md 1.3 節の形）: 「〈名前〉状態が終了した時」。いまは counterChange にだけ書ける */
export type EndedTrigger = { ended: NamedStateId };

/**
 * 2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.4 節）: 「〈カウンタ〉が最大になった時」。自分のそのカウンタが上限に届いたフレームの
 * 次のフレームに発火する（条件は前のフレームの終わりの値を見る段 10 の規則と同じ）。いまは counterChange にだけ書ける
 */
export type CounterFullTrigger = { counterFull: CounterId };

/** 2 段目の段 11 の PR 2: { counterFull } のトリガーか */
export function isCounterFullTrigger(t: unknown): t is CounterFullTrigger {
  return typeof t === 'object' && t !== null && 'counterFull' in t;
}

/** 2 段目の段 10: { ended } のトリガーか */
export function isEndedTrigger(t: unknown): t is EndedTrigger {
  return typeof t === 'object' && t !== null && 'ended' in t;
}

/**
 * 名前の付いた状態の語彙編（同 5.2 節）: 静的な付与の形か（戦闘開始時・戦闘の終わりまで・自分・発火の条件なし・スタックなし）。
 * 2 段目の段 1（plan/design-skill-stage1.md 1.4 節）: 静的な状態かは状態ごとに決める（staticStatesOf。どの付与もこの形で、
 * 外す効果も無い状態だけ）。静的な状態の持ち主は編成の段（skills/composition.ts）で決まり、中身は常時パッシブとして解く
 * （skills/resolve.ts の resolvePassives）
 */
export function isStaticStateGrant(effect: StateGrantEffect): boolean {
  return (
    effect.trigger === 'battleStart' &&
    effect.durationUntil === 'battleEnd' &&
    effect.target === 'self' &&
    effect.condition === undefined &&
    effect.maxStacks === undefined &&
    effect.maxStacksRef === undefined
  );
}

/**
 * 名前の付いた状態の語彙編: 定義の静的な状態（宝物版・編成の条件を当てた後の定義を渡す）。重複なし・最初の付与の順。
 * 2 段目の段 1（plan/design-skill-stage1.md 1.4 節）: 状態ごとに決める。定義のその状態の付与がどれも静的な付与の形
 * （isStaticStateGrant）で、定義にその状態を外す効果（removeState）が無いときだけ静的。静的でない状態の付与は、静的な形でも
 * 時間で変わる付与として件にする
 */
export function staticStatesOf(definition: SkillDefinition | null | undefined): NamedStateId[] {
  if (!definition) return [];
  const allStatic = new Map<NamedStateId, boolean>();
  const removed = new Set<NamedStateId>();
  for (const slot of SKILL_SLOTS) {
    for (const e of definition.skills[slot].effects) {
      if (e.kind === 'state') allStatic.set(e.state, (allStatic.get(e.state) ?? true) && isStaticStateGrant(e));
      else if (e.kind === 'removeState') removed.add(e.state);
    }
  }
  return [...allStatic].flatMap(([state, all]) => (all && !removed.has(state) ? [state] : []));
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 定義の効果が使う溜めのきっかけ（{ chargeTick } の間隔の秒の一覧
 * （重複なし）と、{ chargeFull } があるか）。1 パス目は、これのある枠の溜めだけを追って射撃の記録に書く（frame/firstPass.ts）
 */
export function chargeTriggersOf(definition: SkillDefinition): { tickSeconds: number[]; full: boolean } {
  const tickSeconds = new Set<number>();
  let full = false;
  for (const slot of SKILL_SLOTS) {
    for (const e of definition.skills[slot].effects) {
      if (!('trigger' in e)) continue;
      if (isChargeTickTrigger(e.trigger)) tickSeconds.add(e.trigger.chargeTick.everySeconds);
      if (isChargeFullTrigger(e.trigger)) full = true;
    }
  }
  return { tickSeconds: [...tickSeconds], full };
}

/**
 * シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 定義に、リロードの込め終わりで終わる効果（durationUntil: reloadEnd。
 * timed の自分だけ）か、込め終わりのきっかけ（{ reloadEnd }。2 段目の段 16 の PR 2 の解除と、段 17 の PR 4 の timed・状態の付与）の効果があるか（宝物版・編成の条件を当てた後の定義を渡す）。1 パス目が、その枠の込め終わりのフレームを書くかを決める
 */
export function hasReloadEndEffect(definition: SkillDefinition): boolean {
  return SKILL_SLOTS.some((slot) =>
    definition.skills[slot].effects.some(
      (e) =>
        (e.kind === 'timed' && e.durationUntil === 'reloadEnd') || ('trigger' in e && isReloadEndTrigger(e.trigger)),
    ),
  );
}

/**
 * 効果・notes の根拠の結論の ID（`C-NNNN`。1 つ以上・重複なし）。どの結論が効果を裏付けるかは、定義のこの欄を正にする
 * （結論の側からは生成物の plan/claims.md・plan/skills.md で引く）。実在と状態の検査は records/skills.ts（npm run records:check・npm test）。
 * モデルの計算には使わない
 */
export type ClaimRefs = { claims?: string[] };

/** 分類の設計書の論点 7（plan/design-indirect-notes.md 1.2 節）: 読む側の印。その経路の値や有無で、値・対象・条件・きっかけ・維持が決まる */
export type IndirectReads = { reads?: IndirectPath[] };

/**
 * 2 段目の段 12（plan/design-skill-stage12.md 2.5 節）: 効果が、名前の付いたバースト段階の変更（burstStepChange の name）のどちらの側か。
 * parseSkillDefinition が、編成の条件 burstStepMix が変更と同じ効果に changed true、逆の効果に false を書く（JSON には書かない）。
 * 計算は読まず、画面の出どころの表示（「（戦闘補助）」「（戦闘補助でない時）」）だけが読む
 */
export type BurstStepMode = { name: LocalizedText; changed: boolean };
export type BurstStepModeField = { burstStepMode?: BurstStepMode };

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
  | ShotPauseEffect
  | BurstReentryEffect
  | CoverHealEffect
  | BurstStepChangeEffect
  | AllyGaugeAddEffect
  | StateGrantEffect
  | RemoveStateEffect
  | CancelStateEffect
  | StackChangeEffect
  | CounterChangeEffect
) &
  ClaimRefs &
  IndirectReads &
  BurstStepModeField;

/** 定義の、段を持つ静的な効果（burstReentry・burstStepChange。どちらも 1 つの定義に 1 つまで）の段。無ければ null */
function stepEffectOf(
  definition: SkillDefinition | null | undefined,
  kind: 'burstReentry' | 'burstStepChange',
): BasicBurstStep | null {
  if (!definition) return null;
  for (const slot of SKILL_SLOTS) {
    for (const e of definition.skills[slot].effects) if (e.kind === kind) return e.step;
  }
  return null;
}

/** アニス：スター編: 定義のバースト再突入の段階（編成の条件で外した後の定義を渡す）。無ければ null */
export function burstReentryStepOf(definition: SkillDefinition | null | undefined): BasicBurstStep | null {
  return stepEffectOf(definition, 'burstReentry');
}

/** 2 段目の段 12: 定義のバースト段階の変更の段（編成の条件で外した後の定義を渡す）。無ければ null */
export function burstStepChangeOf(definition: SkillDefinition | null | undefined): BasicBurstStep | null {
  return stepEffectOf(definition, 'burstStepChange');
}

/** 効果の種類（SkillEffect の kind の全部） */
export const SKILL_EFFECT_KINDS = [
  'passive',
  'burstDamage',
  'timed',
  'damage',
  ...INSTANT_KINDS,
  'weaponChange',
  'cycle',
  'cycleEvery',
  'dot',
  'autoAttack',
  'burstGaugeHit',
  'shotPause',
  'burstReentry',
  'coverHeal',
  'burstStepChange',
  'allyGaugeAdd',
  'state',
  'removeState',
  'cancelState',
  'stackChange',
  'counterChange',
] as const satisfies readonly SkillEffect['kind'][];
type MissingEffectKind = Exclude<SkillEffect['kind'], (typeof SKILL_EFFECT_KINDS)[number]>;
const _allEffectKinds: [MissingEffectKind] extends [never] ? true : never = true;
void _allEffectKinds;

/**
 * 最小構成の検査編（plan/design-minimal-relevance.md 3.3 節）: notes の効く先のきっかけ。定義のトリガーの名前（BuffTrigger・回数トリガーの
 * count・時間の周期は timer・効果名のトリガーは applied・溜めの周期は chargeTick・溜めが満ちた時は chargeFull。records/relevance.ts の
 * triggerNameOf と同じ名前）に、damaged（自分が被弾した時。射撃場 3 分モードの的の反撃で起きうる）を足したもの
 */
export const NOTE_EFFECT_TRIGGERS = [
  ...BUFF_TRIGGERS,
  ...SHOT_COUNT_KINDS,
  'timer',
  'applied',
  'chargeTick',
  'chargeFull',
  'damaged',
] as const;
export type NoteEffectTrigger = (typeof NOTE_EFFECT_TRIGGERS)[number];

/**
 * 最小構成の検査編（plan/design-minimal-relevance.md 11.8 節）: notes の効く先の stat。notes の効く先にだけ使う stat は、敵の防御力▼
 * （2 段目の段 2）と最大HP▲（2 段目の段 6 の PR 2）を計算の語彙（BuffStat）に移して無くなった（notes にも BuffStat としてそのまま書ける）
 */
export const NOTE_EFFECT_STATS = BUFF_STATS;
export type NoteEffectStat = (typeof NOTE_EFFECT_STATS)[number];

/** 最小構成の検査編（同 11.8 節）: notes の効く先にだけ使う対象。enemy は敵（デバフ） */
export const NOTE_EFFECT_TARGETS = [...BUFF_TARGETS, 'enemy'] as const;
export type NoteEffectTarget = (typeof NOTE_EFFECT_TARGETS)[number];

/** notes の効く先の欄で、語彙で書けないもの。判定では「何にでも当たる」とみなす */
export type Unknown = 'unknown';

/**
 * 最小構成の検査編（plan/design-minimal-relevance.md 3.3 節）: 未対応・前提の外の notes（と、指す効果の無い補足）が、効いたとしたら
 * どんな効果かを定義の効果と同じ語彙で書いたもの。計算（calc・sim）は読まない。対応状況（support）の決め方も変えない。
 * stat・target は passive と timed で、trigger は timed で必須（ほかの種類では書いても書かなくてもよい）
 */
export type NoteEffect = {
  kind: SkillEffect['kind'] | Unknown;
  stat?: NoteEffectStat | Unknown;
  target?: NoteEffectTarget | Unknown;
  trigger?: NoteEffectTrigger | Unknown;
};

/**
 * 扱わなかった効果や扱い方の説明。claims は「ダメージに関係しない」などの判断の根拠。
 * 最小構成の検査編: effect は効く先（unimplemented・outOfScope・indirect と、refers の無い modeling に書ける）。refers は modeling が指す
 * 同じスロットの効果（"effects[0]" の形）で、検査ではその効果と同じ要素として扱う。
 * 分類の設計書の論点 7（plan/design-indirect-notes.md 1.1・1.2 節）: path は indirect の経路（必須）。reads は読む側の印
 * （unimplemented・outOfScope と、refers の無い modeling に書ける）
 */
export type SkillNote = LocalizedText &
  ClaimRefs &
  IndirectReads & { kind: SkillNoteKind; effect?: NoteEffect; refers?: string; path?: IndirectPath };

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
   * burst スロットでは先頭は burstDamage（発動の直前のバフのまま。plan/design-burst-landing.md 11 節）。別スロットの効果は見ない
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

/** スキル定義の対応状況の索引（data/skills/support.json。生成物。skills/support.ts） */
export type SkillSupportIndex = {
  formatVersion: 1;
  /** すべてのスロットに未実装が無いキャラ（昇順） */
  fullySupported: number[];
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

function parseClaimRefs(v: Json, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of claim IDs');
  return v.map((id, i) => {
    if (typeof id !== 'string' || !C_ID.test(id))
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
  if (v.refers !== undefined) {
    if (note.kind !== 'modeling') fail(`${path}.refers`, `only allowed in a modeling note, found in ${note.kind}`);
    if (typeof v.refers !== 'string' || !NOTE_REFERS.test(v.refers))
      fail(`${path}.refers`, `expected "effects[<index>]", got ${JSON.stringify(v.refers)}`);
    note.refers = v.refers;
  }
  if (v.effect !== undefined) {
    if (note.kind === 'noDamage') fail(`${path}.effect`, 'not allowed in a noDamage note');
    if (note.refers !== undefined) fail(`${path}.effect`, 'a modeling note with refers takes its effect from there');
    note.effect = parseNoteEffect(v.effect, `${path}.effect`);
  }
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 1.1・1.2 節）: 間接の経路と、読む側の印
  if (note.kind === 'indirect') {
    if (v.path === undefined) fail(`${path}.path`, 'required in an indirect note');
    note.path = oneOf(INDIRECT_PATHS, v.path, `${path}.path`);
  } else if (v.path !== undefined) fail(`${path}.path`, `only allowed in an indirect note, found in ${note.kind}`);
  if (v.reads !== undefined) {
    if (note.kind === 'noDamage' || note.kind === 'indirect')
      fail(`${path}.reads`, `not allowed in a ${note.kind} note (indirect paths do not chain)`);
    if (note.refers !== undefined) fail(`${path}.reads`, 'a modeling note with refers: write reads in the effect');
    note.reads = parseIndirectReads(v.reads, `${path}.reads`);
  }
  for (const key of Object.keys(v)) {
    if (!['ja', 'en', 'kind', 'claims', 'refers', 'effect', 'path', 'reads'].includes(key))
      fail(`${path}.${key}`, 'unknown field');
  }
  return note;
}

/** 分類の設計書の論点 7: 読む側の印（経路の id の列。空でなく、重ならない） */
function parseIndirectReads(v: Json, path: string): IndirectPath[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of indirect paths');
  return v.map((x, i) => {
    const p = oneOf(INDIRECT_PATHS, x, `${path}[${i}]`);
    if (v.indexOf(x) !== i) fail(`${path}[${i}]`, `duplicate path ${p}`);
    return p;
  });
}

const NOTE_REFERS = /^effects\[(\d+)\]$/;

/** notes の effect（plan/design-minimal-relevance.md 3.3 節）。各欄は語彙か 'unknown' */
function parseNoteEffect(v: Json, path: string): NoteEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v))
    if (!['kind', 'stat', 'target', 'trigger'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  const orUnknown = <T extends string>(allowed: readonly T[], value: Json, at: string): T | Unknown =>
    value === 'unknown' ? 'unknown' : oneOf(allowed, value, at);
  const effect: NoteEffect = { kind: orUnknown(SKILL_EFFECT_KINDS, v.kind, `${path}.kind`) };
  const required = {
    stat: effect.kind === 'passive' || effect.kind === 'timed',
    target: effect.kind === 'passive' || effect.kind === 'timed',
    trigger: effect.kind === 'timed',
  };
  for (const key of ['stat', 'target', 'trigger'] as const)
    if (required[key] && v[key] === undefined) fail(`${path}.${key}`, `required for ${effect.kind} (or "unknown")`);
  if (v.stat !== undefined) effect.stat = orUnknown(NOTE_EFFECT_STATS, v.stat, `${path}.stat`);
  if (v.target !== undefined) effect.target = orUnknown(NOTE_EFFECT_TARGETS, v.target, `${path}.target`);
  if (v.trigger !== undefined) effect.trigger = orUnknown(NOTE_EFFECT_TRIGGERS, v.trigger, `${path}.trigger`);
  return effect;
}

/**
 * casterAttack は attack だけ、flat（Stage 10）は maxAmmo（発数）と chargeSpeed（対象の語彙編。「チャージ時間 X 秒▼」の秒）と
 * burstCooldown（段 11 の PR 3。「バーストスキルクールタイム X 秒▼」の秒。burstCooldown は flat だけ）
 */
function validateScaling(scaling: BuffScaling | undefined, stat: BuffStat, path: string): void {
  if (scaling === 'casterAttack' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterAttack is only allowed with stat "attack", got "${stat}"`);
  }
  if (scaling === 'casterFinalMaxHp' && stat !== 'attack') {
    fail(`${path}.scaling`, `casterFinalMaxHp is only allowed with stat "attack", got "${stat}"`);
  }
  if (scaling === 'casterDefence' && stat !== 'enemyDefenseDown') {
    fail(`${path}.scaling`, `casterDefence is only allowed with stat "enemyDefenseDown", got "${stat}"`);
  }
  if (scaling === 'casterChargeTime' && stat !== 'chargeSpeed') {
    fail(`${path}.scaling`, `casterChargeTime is only allowed with stat "chargeSpeed", got "${stat}"`);
  }
  if (scaling === 'flat' && stat !== 'maxAmmo' && stat !== 'chargeSpeed' && stat !== 'burstCooldown') {
    fail(
      `${path}.scaling`,
      `flat is only allowed with stat "maxAmmo", "chargeSpeed" or "burstCooldown", got "${stat}"`,
    );
  }
  if (stat === 'burstCooldown' && scaling !== 'flat') {
    fail(`${path}.scaling`, 'burstCooldown needs scaling "flat" (the value is seconds)');
  }
}

/** 対象の語彙編: chargeSpeed の flat は「チャージ時間 X 秒▼」で、正の値が縮める秒数。▼（decrease）は書かない（burstCooldown も同じ） */
function validateFlatChargeTime(
  stat: BuffStat,
  scaling: BuffScaling | undefined,
  v: Record<string, Json>,
  path: string,
) {
  if ((stat === 'chargeSpeed' || stat === 'burstCooldown') && scaling === 'flat' && v.decrease !== undefined) {
    fail(`${path}.decrease`, `${stat} with scaling "flat" is already a reduction in seconds (do not write decrease)`);
  }
}

/** 対象の語彙編: targetSquad は target が allies のときだけ */
function parseTargetSquad(v: Record<string, Json>, target: BuffTarget, path: string): TargetSquad | undefined {
  if (v.targetSquad === undefined) return undefined;
  const squad = oneOf(TARGET_SQUADS, v.targetSquad, `${path}.targetSquad`);
  if (target !== 'allies') fail(`${path}.targetSquad`, `only allowed with target "allies", got "${target}"`);
  return squad;
}

/** ペルソナ編: targetState・targetBurstStep は target が allies のときだけ（2 段目の段 15 の PR 3 から targetBurstStep は burstUsers も） */
function parsePersonaTargetFields(
  v: Record<string, Json>,
  target: BuffTarget,
  path: string,
): { targetState?: NamedStateId; includeSelf?: true; targetBurstStep?: BasicBurstStep } {
  const out: { targetState?: NamedStateId; includeSelf?: true; targetBurstStep?: BasicBurstStep } = {};
  if (v.targetState !== undefined) out.targetState = parseNamedStateId(v.targetState, `${path}.targetState`, 'ally');
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.1 節）: 「自分と〈状態〉の味方」
  if (v.includeSelf !== undefined) {
    if (v.includeSelf !== true) fail(`${path}.includeSelf`, 'must be true');
    if (out.targetState === undefined) fail(`${path}.includeSelf`, 'only allowed with targetState');
    out.includeSelf = true;
  }
  const step = parseTargetBurstStep(v, target, path);
  if (step !== undefined) out.targetBurstStep = step;
  if (out.targetState !== undefined && target !== 'allies') {
    fail(`${path}.targetState`, `only allowed with target "allies", got "${target}"`);
  }
  return out;
}

/**
 * 「基本バースト段階が N の」。対象は allies と、2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節）から burstUsers（「直前に
 * バーストスキルを使用した基本バースト段階が N の味方全体」。エイダの S1）
 */
function parseTargetBurstStep(v: Record<string, Json>, target: BuffTarget, path: string): BasicBurstStep | undefined {
  if (v.targetBurstStep === undefined) return undefined;
  if (target !== 'allies' && target !== 'burstUsers')
    fail(`${path}.targetBurstStep`, `only allowed with target "allies" or "burstUsers", got "${target}"`);
  return oneOf(BASIC_BURST_STEPS, v.targetBurstStep, `${path}.targetBurstStep`);
}

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.6 節）: 目録の id で、持ち主の側が holder のもの。味方の状態を敵の条件で
 * 見る、のような取り違えを落とす
 */
function parseNamedStateId(v: Json, path: string, holder: StateHolder): NamedStateId {
  const id = oneOf(NAMED_STATE_IDS, v, path);
  if (namedStateHolder(id) !== holder) {
    fail(path, `"${id}" is a state held by the ${namedStateHolder(id)}, not by the ${holder}`);
  }
  return id;
}

/**
 * 受けるダメージ編: damageTaken（敵の受けるダメージ▲）は敵へのデバフなので、味方全体（target 'allies'）にだけ書ける。
 * 武器種・属性で絞ることもできない（敵 1 体の前提で、敵が受ける全ダメージに掛かる）。
 * 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 敵の件なので、持ち主ごとに違いうる絞り込み（自分を除く・状態・
 * バースト段階）と維持（持ち主の発数）も書けない
 */
function validateDamageTaken(stat: BuffStat, target: BuffTarget, v: Record<string, Json>, path: string): void {
  if (!isEnemyHeldStat(stat)) return;
  if (target !== 'allies') fail(`${path}.target`, `${stat} must target "allies" (an enemy debuff), got "${target}"`);
  if (
    v.targetWeapon !== undefined ||
    v.targetElement !== undefined ||
    v.targetClass !== undefined ||
    v.targetSquad !== undefined
  )
    fail(path, `${stat} cannot narrow its target by weapon, element, class or squad (an enemy debuff)`);
  for (const key of [
    'excludeSelf',
    'targetState',
    'includeSelf',
    'targetBurstStep',
    'durationShots',
    'durationShotsRef',
  ] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `${stat} is held by the enemy, so it cannot have ${key}`);
  }
}

/**
 * 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 敵が持つ stat か（敵の受けるダメージ▲と、2 段目の段 2 の敵の防御力▼）。
 * 値は敵が受ける全ダメージに効くので、味方の各枠の区間の値に写す（skills/holders.ts の isEnemyEffect）
 */
export const ENEMY_HELD_STATS = ['damageTaken', 'enemyDefenseDown'] as const;

export function isEnemyHeldStat(stat: string): boolean {
  return (ENEMY_HELD_STATS as readonly string[]).includes(stat);
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

/** 2 段目の段 9（plan/design-skill-stage9.md 1.1 節）: targetClass は targetWeapon・targetElement と同じく target が self 以外のときだけ */
function parseTargetClass(v: Record<string, Json>, target: BuffTarget, path: string): NikkeClass | undefined {
  if (v.targetClass === undefined) return undefined;
  const nikkeClass = oneOf(NIKKE_CLASSES, v.targetClass, `${path}.targetClass`);
  if (target === 'self')
    fail(`${path}.targetClass`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return nikkeClass;
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

/** Stage 11 アリス編: topAttack の N（targetCount / targetCountRef）。topAttack・longestChargeTime（対象の語彙編）のときだけ、ちょうど片方 */
function parseTargetCount(
  v: Record<string, Json>,
  target: BuffTarget | CoverHealEffect['target'],
  path: string,
): TargetCountFields {
  const hasCount = v.targetCount !== undefined;
  const hasRef = v.targetCountRef !== undefined;
  if (!isCountedTarget(target)) {
    if (hasCount || hasRef)
      fail(
        path,
        `targetCount / targetCountRef are only allowed with target "topAttack", "longestChargeTime", "lowestHpRatio" or "lowestCoverHp", got "${target}"`,
      );
    return {};
  }
  if (hasCount === hasRef)
    fail(path, `exactly one of targetCount and targetCountRef is required with target "${target}"`);
  return hasCount
    ? { targetCount: parsePositiveInt(v.targetCount, `${path}.targetCount`) }
    : { targetCountRef: parseRef(v.targetCountRef, `${path}.targetCountRef`) };
}

/** 名前の付いた状態の語彙編: timed の name（ペルソナ編）は状態の付与に置き換えた */
const NAME_REPLACED = 'name was replaced by a state grant (kind "state". plan/design-named-state.md)';

/** 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: HP の割合の低い順の対象は、使い手のいる heal にだけ書ける */
const LOWEST_HP_RATIO_HEAL_ONLY = 'lowestHpRatio is only allowed in heal';

function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'burstUsers') fail(`${path}.target`, 'burstUsers is not allowed in passive (it needs a full burst)');
  // 常時の効果の対象が戦闘中に入れ替わるのは持続バフの窓の仕組みの外（plan/design-stage11.md 17 節）
  if (target === 'topAttack')
    fail(`${path}.target`, 'topAttack is not allowed in passive (the ranking changes during battle)');
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  if (target === 'lowestHpRatio') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const targetSquad = parseTargetSquad(v, target, path);
  if (v.excludeSelf !== undefined) fail(`${path}.excludeSelf`, 'excludeSelf is only allowed in timed');
  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 最終防御力の比べは発火の瞬間に決めるので、常時の効果には書けない
  if (v.targetDefense !== undefined) fail(`${path}.targetDefense`, 'targetDefense is only allowed in timed');
  for (const key of ['targetState', 'includeSelf', 'targetBurstStep'] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `${key} is only allowed in timed and state`);
  }
  if (v.name !== undefined) fail(`${path}.name`, NAME_REPLACED);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  const passiveFlag = isPassiveFlagStat(stat);
  if ((isFlagStat(stat) && !passiveFlag) || stat === 'fixedChargeTime')
    fail(`${path}.stat`, `${stat} is only allowed in timed`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  validateFlatChargeTime(stat, scaling, v, path);
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 常時の受けるダメージ▲（観測値の比べる設定が使う）は、いまのまま
  // 味方の各枠の常時の値に足す（敵の常時の件にするのは、敵の効果を外す語彙を足す時）
  validateDamageTaken(stat, target, v, path);
  validateAttackSpeed(stat, v, path);
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 有利コードのダメージ適用は値を持たないフラグで、自分だけ
  if (passiveFlag) {
    if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value`);
    if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value`);
    if (target !== 'self') fail(`${path}.target`, `${stat} is only allowed with target "self"`);
    if (v.while !== undefined) fail(`${path}.while`, `${stat} cannot have while`);
  }
  const effect: PassiveEffect = { kind: 'passive', target, stat };
  if (!passiveFlag) effect.ref = parseRef(v.ref, `${path}.ref`);
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  if (targetSquad !== undefined) effect.targetSquad = targetSquad;
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) effect.decrease = true;
  if (v.condition !== undefined)
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.passive);
  if (v.while !== undefined) {
    // 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: HP の条件（編成の段で決まる）とは組み合わせない（使い手がいない）。
    // 敵が持つ stat は、敵の件に写すので、自分の状態の件で切れない
    if (v.condition !== undefined) fail(`${path}.while`, 'while cannot be combined with condition');
    if (isEnemyHeldStat(stat)) fail(`${path}.while`, `${stat} is held by the enemy, so it cannot have while`);
    effect.while = parseWhileCondition(v.while, `${path}.while`);
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果の条件 { selfState }。selfState は条件と同じ形で
 * 読み、present: false は書けない（「〜でない時のみ」の使い手がいない）
 */
function parseWhileCondition(v: Json, path: string): WhileCondition {
  if (!isRecord(v)) fail(path, 'expected { selfState } or { selfCounter }');
  const keys = Object.keys(v);
  for (const key of keys)
    if (key !== 'selfState' && key !== 'selfCounter')
      fail(`${path}.${key}`, 'unknown field (allowed: selfState, selfCounter)');
  if (keys.length !== 1) fail(path, 'expected exactly one of selfState and selfCounter');
  if (v.selfCounter !== undefined) {
    const c = parseSelfCounterCondition(v.selfCounter, `${path}.selfCounter`);
    if (c.atLeast === undefined || c.atLeast < 1)
      fail(`${path}.selfCounter`, 'while needs { counter, atLeast } with atLeast of at least 1');
    return { selfCounter: { counter: c.counter, atLeast: c.atLeast } };
  }
  const selfState = parseSelfStateCondition(v.selfState, `${path}.selfState`);
  if (!selfState.present) fail(`${path}.selfState.present`, 'while needs the state (present: false is not supported)');
  return { selfState };
}

/** 2 段目の段 9 の PR 2: 攻撃速度▲を書ける武器種（レートを蓄積して撃ち、立ち上げの無い武器） */
const ATTACK_SPEED_WEAPONS = ['AR', 'SMG', 'SG'] as const satisfies readonly WeaponType[];

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.2 節）: 攻撃速度▲は、AR・SMG・SG を所持する味方にだけ書ける（targetWeapon が要る）。
 * チャージ武器（チャージの秒）・MG（立ち上げのレート）への効き方と「▼」は、使い手がいないので書けない
 */
function validateAttackSpeed(stat: BuffStat, v: Record<string, Json>, path: string): void {
  if (stat !== 'attackSpeed') return;
  if (!(ATTACK_SPEED_WEAPONS as readonly Json[]).includes(v.targetWeapon ?? null)) {
    fail(
      `${path}.targetWeapon`,
      `attackSpeed needs targetWeapon ${ATTACK_SPEED_WEAPONS.join(', ')} (charge weapons and MG are not supported)`,
    );
  }
  if (v.decrease !== undefined) fail(`${path}.decrease`, 'attackSpeed cannot decrease (no user)');
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
 * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: timed・heal の delayFrames。射撃の回数のきっかけ
 * （確率のきっかけを除く）だけに書ける
 */
function parseShotCountDelay(v: Json, trigger: EffectTrigger, path: string): number {
  if (!isShotCountTrigger(trigger) || isChanceTrigger(trigger)) {
    fail(path, 'delayFrames needs a shot count trigger ({ count }) without a chance');
  }
  return parsePositiveInt(v, path);
}

/**
 * 文字列なら BuffTrigger、オブジェクトなら回数トリガー。時間の周期のトリガー（{ everySeconds }）は allowTimer のとき
 * （damage・dot・autoAttack・burstGaugeHit・timed・heal）だけ
 */
function parseTrigger(
  v: Json,
  path: string,
  allowTimer: boolean | 'withStart' = false,
  allowDuring = false,
  allowChance = false,
  allowFullStack = false,
  allowWeaponChangeEnd = false,
  allowReloadEnd = false,
): EffectTrigger {
  if (typeof v === 'string') return oneOf(BUFF_TRIGGERS, v, path);
  if (!isRecord(v)) fail(path, 'expected a trigger name or a count trigger object');
  // ペルソナ編: 効果名のトリガーは damage と、2 段目の段 4 から timed・付与だけ（parseAppliedTrigger で先に読む）
  if (v.applied !== undefined) {
    fail(path, 'an applied trigger ({ applied }) is only allowed in damage, timed and state grants');
  }
  // 2 段目の段 3: フルスタックの消費のきっかけは heal だけ（plan/design-skill-stage3.md 1.3 節）。段 11 から weaponChange も
  // （plan/design-skill-stage11.md 2.1 節）
  if (v.fullStack !== undefined) {
    if (!allowFullStack) fail(path, 'a full-stack trigger ({ fullStack }) is only allowed in heal and weaponChange');
    for (const key of Object.keys(v)) if (key !== 'fullStack') fail(`${path}.${key}`, 'unknown field');
    return { fullStack: parseNamedStateId(v.fullStack, `${path}.fullStack`, 'ally') };
  }
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 溜めのきっかけは timed・付与だけ（parseChargeTrigger で先に読む）
  if (v.chargeTick !== undefined || v.chargeFull !== undefined) {
    fail(path, 'a charge trigger ({ chargeTick } / { chargeFull }) is only allowed in timed and state grants');
  }
  // 2 段目の段 11（plan/design-skill-stage11.md 2.2.1 節）: 使用武器の変更の終わりのきっかけは ammoDecrease だけ
  if (v.weaponChangeEnd !== undefined) {
    if (!allowWeaponChangeEnd)
      fail(path, 'a weapon change end trigger ({ weaponChangeEnd }) is only allowed in ammoDecrease');
    for (const key of Object.keys(v)) if (key !== 'weaponChangeEnd') fail(`${path}.${key}`, 'unknown field');
    if (v.weaponChangeEnd !== true) {
      fail(`${path}.weaponChangeEnd`, `expected true, got ${JSON.stringify(v.weaponChangeEnd)}`);
    }
    return { weaponChangeEnd: true };
  }
  // 2 段目の段 17 の PR 1: 遮蔽物 HP 回復を受けた時のきっかけは timed だけ（parseCoverHealedTrigger で先に読む）
  if (v.coverHealed !== undefined) fail(path, 'a { coverHealed } trigger is only allowed in timed');
  // 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: リロードの込め終わりのきっかけは removeState だけ
  if (v.reloadEnd !== undefined) {
    if (!allowReloadEnd)
      fail(path, 'a reload end trigger ({ reloadEnd }) is only allowed in removeState, timed and state grants');
    for (const key of Object.keys(v)) if (key !== 'reloadEnd') fail(`${path}.${key}`, 'unknown field');
    if (v.reloadEnd !== true) fail(`${path}.reloadEnd`, `expected true, got ${JSON.stringify(v.reloadEnd)}`);
    return { reloadEnd: true };
  }
  if (v.everySeconds !== undefined) {
    if (!allowTimer)
      fail(
        path,
        'a timer trigger ({ everySeconds }) is only allowed in damage, dot, autoAttack, burstGaugeHit, timed, heal and counterChange',
      );
    const flags = allowTimer === 'withStart' ? (['atStart', 'carry'] as const) : (['carry'] as const);
    for (const key of Object.keys(v)) {
      if (key !== 'everySeconds' && !(flags as readonly string[]).includes(key))
        fail(`${path}.${key}`, 'unknown field');
    }
    const seconds = v.everySeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.everySeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
    const timer: TimerTrigger = { everySeconds: seconds };
    for (const flag of flags) {
      if (v[flag] === undefined) continue;
      if (v[flag] !== true) fail(`${path}.${flag}`, `expected true, got ${JSON.stringify(v[flag])}`);
      timer[flag] = true;
    }
    return timer;
  }
  if ((SHOT_COUNT_KINDS as readonly string[]).includes(v.count as string)) {
    for (const key of Object.keys(v)) {
      if (
        ![
          'count',
          'every',
          'everyRef',
          'stacksRef',
          'during',
          'reset',
          'firesDuring',
          'firesOutside',
          'chance',
          'chanceRef',
        ].includes(key)
      ) {
        fail(`${path}.${key}`, 'unknown field');
      }
    }
    if (v.every !== undefined && v.everyRef !== undefined) fail(path, 'at most one of every and everyRef');
    // ペレットの命中編（plan/design-pellet-hit.md 2 節）: 1 発で複数のペレットを数えるので、毎回（1）は書けない
    if (v.count === 'pelletHit' && v.every === undefined && v.everyRef === undefined) {
      fail(path, 'pelletHit needs every or everyRef');
    }
    const trigger: ShotCountTrigger = { count: v.count as ShotCountKind };
    if (v.every !== undefined) trigger.every = parsePositiveInt(v.every, `${path}.every`);
    if (v.everyRef !== undefined) trigger.everyRef = parseRef(v.everyRef, `${path}.everyRef`);
    if (v.stacksRef !== undefined) trigger.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
    // クルミ S2 編: フルバースト中だけ数える回数トリガー（plan/design-kurumi-s2.md 2.1 節）
    if (v.during !== undefined || v.reset !== undefined) {
      if (!allowDuring) fail(`${path}.during`, 'a counting window (during) is only allowed in damage, timed and state');
      if (v.during === undefined) fail(`${path}.reset`, 'reset needs during');
      trigger.during = oneOf(SHOT_COUNT_WINDOWS, v.during, `${path}.during`);
      if (v.reset === undefined) fail(`${path}.reset`, 'during needs reset (fullBurstStart or never)');
      trigger.reset = oneOf(SHOT_COUNT_RESETS, v.reset, `${path}.reset`);
      if (trigger.stacksRef !== undefined) fail(`${path}.during`, 'during cannot be used with stacksRef');
      if (trigger.count === 'lastShot') fail(`${path}.during`, 'during cannot be used with lastShot');
      if (trigger.count === 'weaponChangeShot') fail(`${path}.during`, 'during cannot be used with weaponChangeShot');
    }
    // ソーダ：トゥインクルバニー S1 の数え方（V-0443）: 戦闘中ずっと数え、発火だけフルバーストの窓の中に限る
    if (v.firesDuring !== undefined) {
      if (!allowDuring) {
        fail(`${path}.firesDuring`, 'a firing window (firesDuring) is only allowed in damage, timed and state');
      }
      if (v.during !== undefined) fail(`${path}.firesDuring`, 'firesDuring cannot be used with during');
      trigger.firesDuring = oneOf(FIRING_WINDOWS, v.firesDuring, `${path}.firesDuring`);
      if (trigger.stacksRef !== undefined) fail(`${path}.firesDuring`, 'firesDuring cannot be used with stacksRef');
      if (trigger.count === 'lastShot') fail(`${path}.firesDuring`, 'firesDuring cannot be used with lastShot');
      if (trigger.count === 'weaponChangeShot') {
        fail(`${path}.firesDuring`, 'firesDuring cannot be used with weaponChangeShot');
      }
    }
    // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 使用武器の変更の外でだけ発火する
    if (v.firesOutside !== undefined) {
      if (v.firesOutside !== 'weaponChange') {
        fail(`${path}.firesOutside`, `expected "weaponChange", got ${JSON.stringify(v.firesOutside)}`);
      }
      for (const key of ['during', 'firesDuring', 'stacksRef', 'chance', 'chanceRef'] as const) {
        if (v[key] !== undefined) fail(`${path}.firesOutside`, `firesOutside cannot be used with ${key}`);
      }
      if (trigger.count === 'weaponChangeShot') {
        fail(`${path}.firesOutside`, 'firesOutside cannot be used with weaponChangeShot');
      }
      trigger.firesOutside = 'weaponChange';
    }
    // ソルジャーE.G. 編: 確率のきっかけ（plan/design-soldier-eg.md 3.1 節）
    if (v.chance !== undefined || v.chanceRef !== undefined) {
      if (!allowChance) fail(`${path}.chance`, 'a chance trigger (chance / chanceRef) is only allowed in timed');
      if (v.chance !== undefined && v.chanceRef !== undefined) fail(path, 'at most one of chance and chanceRef');
      if (!(CHANCE_COUNT_KINDS as readonly string[]).includes(trigger.count)) {
        fail(
          `${path}.count`,
          `a chance trigger needs count ${CHANCE_COUNT_KINDS.join(' or ')}, got "${trigger.count}"`,
        );
      }
      for (const key of ['every', 'everyRef', 'stacksRef', 'during', 'firesDuring'] as const) {
        if (v[key] !== undefined) fail(`${path}.${key}`, `a chance trigger cannot be combined with ${key}`);
      }
      if (v.chance !== undefined) {
        const chance = v.chance;
        if (typeof chance !== 'number' || !Number.isFinite(chance) || chance <= 0 || chance > 100) {
          fail(`${path}.chance`, `expected a percentage in (0, 100], got ${JSON.stringify(chance)}`);
        }
        trigger.chance = chance;
      } else {
        trigger.chanceRef = parseRef(v.chanceRef, `${path}.chanceRef`);
      }
    }
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
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  // 防御力無視ダメージ編: 周期のトリガー（ソルジャーE.G. 編で、1 パス目で窓を追う stat にも）。ソルジャーE.G. 編: 確率のきっかけ
  // 鍵の順は今までの timed と同じ（kind・trigger・target・stat の後に残りの欄）。最小構成の感度の鍵が定義の JSON から作られるので
  const { trigger, target, ...rest } = parseTimedFields(v, path, stat, true);
  return { kind: 'timed', trigger, target, stat, ...rest } as TimedEffect;
}

/** timed の、値（stat）を除いた欄。名前の付いた状態の語彙編: 付与（StateGrantEffect）はこの欄を timed と同じ規則で持つ */
type TimedFields = Omit<TimedEffect, 'kind' | 'stat'>;

/** 2 段目の段 7: 防御力の比べの対象の絞り込み。lowerThanSelf = 自分と、自分より最終防御力が低い味方 */
export type TargetDefense = 'lowerThanSelf';
export const TARGET_DEFENSES = ['lowerThanSelf'] as const satisfies readonly TargetDefense[];

/**
 * timed の欄を検証する。名前の付いた状態の語彙編（plan/design-named-state.md 3.2 節）: stat が undefined なら付与の欄だけを見る
 * （値の欄 ref・scaling・decrease・amplifies と stat ごとの規則を除く）。付与の stat ごとの規則は、付与の欄と中身の項目を合わせた
 * timed として中身ごとに通す（validateStateGrants）
 */
function parseTimedFields(
  v: Record<string, Json>,
  path: string,
  stat: BuffStat | undefined,
  allowChance: boolean,
): TimedFields {
  // 2 段目の段 3（plan/design-skill-stage3.md 1.2 節）: 回数のきっかけの数える窓（during）も、damage と同じ意味で書ける。
  // 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: 「〈名前〉が適用される時」（{ applied }）も書ける
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 「チャージ中の時、N 秒ごとに」（{ chargeTick }）と
  // 「フルチャージした時」（{ chargeFull }）も書ける
  // 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節）: 「遮蔽物の HP を回復した時」（{ coverHealed }）は timed だけ
  const trigger =
    parseAppliedTrigger(v.trigger, `${path}.trigger`) ??
    parseChargeTrigger(v.trigger, `${path}.trigger`) ??
    (stat !== undefined ? parseCoverHealedTrigger(v.trigger, `${path}.trigger`) : undefined) ??
    (stat !== undefined ? parseSelfHpAtMostTrigger(v.trigger, `${path}.trigger`) : undefined) ??
    parseTrigger(v.trigger, `${path}.trigger`, 'withStart', true, allowChance, false, false, true);
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'lowestHpRatio') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
  // 同: { applied } の効果は条件・順位の対象・強化を書けない（使い手がいない。論点 6）
  if (isAppliedTrigger(trigger)) {
    if (v.condition !== undefined) fail(`${path}.condition`, 'an effect on an applied trigger cannot have a condition');
    if (target === 'topAttack') fail(`${path}.target`, 'an effect on an applied trigger cannot target "topAttack"');
    if (v.amplifies !== undefined) fail(`${path}.amplifies`, 'an effect on an applied trigger cannot amplify');
  }
  validateBurstUsersTarget(target, trigger, path);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const targetSquad = parseTargetSquad(v, target, path);
  const count = parseTargetCount(v, target, path);
  let excludeSelf: ExcludeSelf | undefined;
  if (v.excludeSelf !== undefined) {
    excludeSelf = oneOf(EXCLUDE_SELF, v.excludeSelf, `${path}.excludeSelf`);
    // ペルソナ編: 「自分を除く…味方全体」は allies の always
    const allowed = target === 'topAttack' || (target === 'allies' && excludeSelf === 'always');
    if (!allowed) {
      fail(
        `${path}.excludeSelf`,
        `only allowed with target "topAttack" (or "always" with "allies"), got "${excludeSelf}" with "${target}"`,
      );
    }
  }
  const persona = parsePersonaTargetFields(v, target, path);
  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 「自分より最終防御力が低い味方」は allies だけ（自分を除く・状態・段階・部隊の
  // 絞り込みとは組み合わせない。使い手がいない）
  let targetDefense: TargetDefense | undefined;
  if (v.targetDefense !== undefined) {
    targetDefense = oneOf(TARGET_DEFENSES, v.targetDefense, `${path}.targetDefense`);
    if (target !== 'allies') fail(`${path}.targetDefense`, `only allowed with target "allies", got "${target}"`);
    for (const key of ['excludeSelf', 'targetState', 'targetBurstStep', 'targetSquad'] as const) {
      if (v[key] !== undefined) fail(`${path}.targetDefense`, `cannot be combined with ${key}`);
    }
  }
  if (stat === 'trueDamageConversion' && target !== 'self') {
    fail(`${path}.target`, 'trueDamageConversion is only allowed with target "self"');
  }
  let scaling: BuffScaling | undefined;
  if (stat !== undefined) {
    scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
    validateScaling(scaling, stat, path);
    validateFlatChargeTime(stat, scaling, v, path);
    validateDamageTaken(stat, target, v, path);
    validateAttackSpeed(stat, v, path);
  }
  const effect: TimedFields = { trigger, target };
  if (stat !== undefined) {
    // 環境コントロール強化編: 値は参照する効果から取る
    if (v.amplifies !== undefined) {
      effect.amplifies = parseAmplifies(v, stat, target, `${path}.amplifies`);
    }
    // Stage 11 モダニア: フラグの stat（装弾数無限）は値を持たないので ref も scaling も書かない
    else if (isFlagStat(stat)) {
      if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value (do not write ref)`);
      if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value (do not write scaling)`);
    } else {
      effect.ref = parseRef(v.ref, `${path}.ref`);
    }
  }
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  if (targetSquad !== undefined) effect.targetSquad = targetSquad;
  if (excludeSelf !== undefined) effect.excludeSelf = excludeSelf;
  Object.assign(effect, persona);
  if (targetDefense !== undefined) effect.targetDefense = targetDefense;
  if (v.name !== undefined) fail(`${path}.name`, NAME_REPLACED);
  Object.assign(effect, count);
  if (stat !== undefined) {
    if (scaling !== undefined) effect.scaling = scaling;
    if (parseDecrease(v, scaling, path)) {
      if (isFlagStat(stat)) fail(`${path}.decrease`, `${stat} has no value`);
      effect.decrease = true;
    }
  }
  Object.assign(effect, parseTimedDuration(v, stat, target, path));
  // マスト編（plan/design-mast.md 8 節）: HP の割合の窓は、きっかけと維持を組で書く
  if (isSelfHpAtMostTrigger(trigger) !== (effect.durationUntil === 'selfHpAbove'))
    fail(path, 'the trigger { selfHpAtMostRef } goes with durationUntil "selfHpAbove" (and only with it)');
  // Stage 11 モダニア: 効果のあるスタック
  if (v.maxStacks !== undefined && v.maxStacksRef !== undefined)
    fail(path, 'at most one of maxStacks and maxStacksRef');
  if (v.maxStacks !== undefined) effect.maxStacks = parsePositiveInt(v.maxStacks, `${path}.maxStacks`);
  if (v.maxStacksRef !== undefined) effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
  if (stat !== undefined && isFlagStat(stat) && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, `${stat} cannot stack`);
  }
  const byShots = effect.durationShots !== undefined || effect.durationShotsRef !== undefined;
  if (byShots && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, 'a duration in shots cannot stack');
  }
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 条件は自分の状態（selfState）だけ組める（発火のフレームで判定し、窓は
  // 発数で切る。「フルアクティブ状態の場合のみ、フルチャージした時」の 1 発間の▲）
  if (byShots && isRecord(v.condition) && Object.keys(v.condition).some((key) => key !== 'selfState'))
    fail(`${path}.condition`, 'a duration in shots can only have the condition selfState');
  if (
    (effect.durationUntil === 'fullBurstEnd' || effect.durationUntil === 'reloadEnd') &&
    (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)
  ) {
    fail(path, 'a duration until an event cannot stack');
  }
  // Stage 11 モダニア: 「自分が 〈stat〉 増加状態なら」。防御力無視ダメージ編: 「フルバーストタイムなら」。
  // 名前の付いた状態の語彙編: 鍵はどれも満たすときだけ（AND。plan/design-named-state.md 10 節の論点 8）
  if (v.condition !== undefined) {
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.timed);
    if (condition.inFullBurst === true && stat !== undefined && isFirstPassTrackedStat(stat)) {
      fail(
        `${path}.condition`,
        `inFullBurst is not supported for "${stat}" (its window is tracked inside the first pass)`,
      );
    }
    // 条件付きの効果が状態を作ると連鎖するので、同じ stat と状態だけの stat は出せない（plan/design-stage11-modernia.md 2.4 節）
    if (
      condition.selfBuffed !== undefined &&
      stat !== undefined &&
      (stat === condition.selfBuffed || isStateStat(stat))
    ) {
      fail(`${path}.stat`, `a conditional effect cannot give "${stat}" (it would feed its own condition)`);
    }
    if (target === 'topAttack') fail(`${path}.target`, 'a conditional effect cannot target "topAttack"');
    validateUsedBurst(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  // 回数トリガーの遅れ編: 確率のきっかけの検査より先に見る。2026-10-29 のキャラの編（plan/design-new-chars-1029.md 10.2 節の e）:
  // 付与（stat が undefined）は時間の周期のきっかけのときだけ書け、周期の発火の delayFrames 後のフレームに付ける（マリアン：クイーンの
  // 槍の命中で付く弱点露出。V-0538）
  if (v.delayFrames !== undefined) {
    if (stat === undefined) {
      if (!isTimerTrigger(trigger)) fail(`${path}.delayFrames`, 'delayFrames in a state grant needs a timer trigger');
      effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
    } else if (isTimerTrigger(trigger)) {
      // V-0602: 時間の周期のきっかけの timed も、周期の発火の delayFrames 後から（エーテルの S2 の防御力▼は、S2 のヒットから。
      // C-0453・C-0832）。窓は 2 パス目の件（skills/holders.ts の startOfFire）で作るので、1 パス目で窓を追う stat には書けない
      if (isFirstPassTrackedStat(stat)) {
        fail(
          `${path}.delayFrames`,
          `delayFrames on a timer trigger is not supported for "${stat}" (its window is tracked inside the first pass)`,
        );
      }
      effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
    } else effect.delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
  }
  if (stat !== undefined) {
    validateFixedChargeTime({ kind: 'timed', ...effect, stat }, path);
    validateChanceTimed({ kind: 'timed', ...effect, stat }, path);
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** 名前の付いた状態の語彙編（plan/design-named-state.md 10 節の論点 8）: 効果の種類ごとに受ける条件の鍵 */
const CONDITION_KEYS_OF = {
  // 2 段目の段 10: selfCounter（カウンタの値。付与の条件にも使う）。エレグの段 3（plan/design-elegg-s3.md 3.2 節）: enemyState
  timed: ['selfBuffed', 'inFullBurst', 'enemyState', 'selfState', 'usedBurst', 'selfCounter'],
  // 2 段目の段 11 の PR 5: damage にも selfCounter（ラプラス：アルティメットヒーローのバーストの追加ダメージ）
  damage: ['inFullBurst', 'enemyState', 'selfState', 'selfCounter'],
  // 2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2 節）: 持続ダメージは付くフレームの自分の状態だけ（ジルの硫酸弾）
  dot: ['selfState'],
  // 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除は、段 1.5 の判定に入る鍵と usedBurst
  removeState: ['selfBuffed', 'inFullBurst', 'selfState', 'usedBurst'],
  // 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 常時の効果は、自分の HP の割合の条件だけ（編成の段で決まる）
  passive: ['selfHp'],
  // 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減は、自分の状態とカウンタの値。段 12 の PR 2: フルバーストの中か外か
  // 2 段目の段 13 の PR 2: usedBurst（ミハラ：ボンディングチェーンのフルバースト終了時のキャプチャーチェーンのチャージ）
  counterChange: ['selfState', 'selfCounter', 'inFullBurst', 'usedBurst'],
  // 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6 節）: クールタイム▼は自分の状態だけ
  cooldownReduction: ['selfState'],
} as const satisfies Record<string, readonly ConditionKey[]>;

/** 2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: usedBurst はフルバーストの開始・終了のきっかけにだけ書ける */
function validateUsedBurst(condition: EffectCondition, trigger: CounterChangeEffect['trigger'], path: string): void {
  if (condition.usedBurst === undefined) return;
  if (typeof trigger === 'string' && (BURST_USERS_TRIGGERS as readonly string[]).includes(trigger)) return;
  fail(
    `${path}.usedBurst`,
    `usedBurst is only allowed with trigger ${BURST_USERS_TRIGGERS.join(' or ')}, got ${JSON.stringify(trigger)}`,
  );
}

/**
 * 発火の条件（timed・付与・damage で 1 つの型）。キーは allowed のうち 1 つ以上で、どれも満たすときだけ発火する（AND）。
 * 効果の種類ごとの規則（1 パス目で窓を追う stat には inFullBurst を書けない など）は呼ぶ側で見る
 */
function parseCondition(
  c: Json,
  path: string,
  allowed: readonly ConditionKey[],
  /** 2 段目の段 12 の PR 2: inFullBurst に false（フルバーストタイムの外なら）を書けるか（counterChange と、段 14 の PR 3 から removeState） */
  outsideFullBurst = false,
): EffectCondition {
  if (!isRecord(c)) fail(path, `expected an object with ${allowed.join(' / ')}`);
  for (const key of Object.keys(c)) {
    if (!(allowed as readonly string[]).includes(key))
      fail(`${path}.${key}`, `unknown field (allowed: ${allowed.join(', ')})`);
  }
  const condition: EffectCondition = {};
  if (c.selfBuffed !== undefined) {
    const selfBuffed = oneOf(BUFF_STATS, c.selfBuffed, `${path}.selfBuffed`);
    if (isFlagStat(selfBuffed)) fail(`${path}.selfBuffed`, `${selfBuffed} is not a buff state`);
    // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 受けるダメージ▲は敵が持つ（自分の増加状態ではない）
    if (selfBuffed === 'damageTaken') fail(`${path}.selfBuffed`, 'damageTaken is held by the enemy, not by the caster');
    condition.selfBuffed = selfBuffed;
  }
  if (c.inFullBurst !== undefined) {
    if (c.inFullBurst !== true && !(outsideFullBurst && c.inFullBurst === false))
      fail(`${path}.inFullBurst`, outsideFullBurst ? 'expected a boolean' : 'expected true');
    condition.inFullBurst = c.inFullBurst;
  }
  if (c.enemyState !== undefined) condition.enemyState = parseNamedStateId(c.enemyState, `${path}.enemyState`, 'enemy');
  if (c.selfState !== undefined) condition.selfState = parseSelfStateCondition(c.selfState, `${path}.selfState`);
  if (c.usedBurst !== undefined) {
    if (c.usedBurst !== true) fail(`${path}.usedBurst`, 'expected true');
    condition.usedBurst = true;
  }
  if (c.selfHp !== undefined) condition.selfHp = parseSelfHpCondition(c.selfHp, `${path}.selfHp`);
  if (c.selfCounter !== undefined)
    condition.selfCounter = parseSelfCounterCondition(c.selfCounter, `${path}.selfCounter`);
  if (Object.keys(condition).length === 0) fail(path, `expected at least one of ${allowed.join(', ')}`);
  return condition;
}

/** 2 段目の段 10: 自分のカウンタの値の条件。{ counter, atLeast } か { counter, below }（ちょうど片方。0 と上限の間の整数） */
function parseSelfCounterCondition(v: Json, path: string): SelfCounterCondition {
  if (!isRecord(v)) fail(path, 'expected { counter, atLeast } or { counter, below }');
  for (const key of Object.keys(v))
    if (!['counter', 'atLeast', 'below'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  const counter = oneOf(COUNTER_IDS, v.counter, `${path}.counter`);
  if ((v.atLeast === undefined) === (v.below === undefined)) fail(path, 'expected exactly one of atLeast and below');
  const key = v.atLeast !== undefined ? 'atLeast' : 'below';
  const n = parsePositiveInt(v[key], `${path}.${key}`);
  if (n > counterMax(counter))
    fail(`${path}.${key}`, `expected at most the max of ${counter} (${counterMax(counter)}), got ${n}`);
  return { counter, [key]: n };
}

/** 2 段目の段 6: 自分の HP の割合の条件。{ atLeastRef }（「自分の HP が X% 以上なら」）。段 15: { atLeast }（即値の %） */
function parseSelfHpCondition(v: Json, path: string): SelfHpCondition {
  if (!isRecord(v)) fail(path, 'expected { atLeastRef } or { atLeast }');
  for (const key of Object.keys(v))
    if (key !== 'atLeastRef' && key !== 'atLeast') fail(`${path}.${key}`, 'unknown field');
  if ((v.atLeastRef === undefined) === (v.atLeast === undefined))
    fail(path, 'write exactly one of atLeastRef and atLeast');
  if (v.atLeast !== undefined) {
    if (typeof v.atLeast !== 'number' || !(v.atLeast > 0 && v.atLeast <= 100))
      fail(`${path}.atLeast`, 'expected a percent in (0, 100]');
    return { atLeast: v.atLeast };
  }
  return { atLeastRef: parseRef(v.atLeastRef, `${path}.atLeastRef`) };
}

/**
 * 2 段目の段 1: 自分の状態の条件。"<id>"（付いていれば）か { state, present }。
 * 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: { state, stacks: "full" | N }・{ state, stacksRef }（N スタック以上。present は省略か true）
 */
function parseSelfStateCondition(v: Json, path: string): SelfStateCondition {
  if (typeof v === 'string') return { state: parseNamedStateId(v, path, 'ally'), present: true };
  if (!isRecord(v)) fail(path, 'expected a state id or { state, present } or { state, stacks }');
  for (const key of Object.keys(v)) {
    if (!['state', 'present', 'stacks', 'stacksRef'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  if (v.stacks === undefined && v.stacksRef === undefined) {
    if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
    return { state, present: v.present };
  }
  if (v.present !== undefined && v.present !== true) {
    fail(`${path}.present`, 'a stack count condition cannot be negated (present must be true or omitted)');
  }
  if (v.stacks !== undefined && v.stacksRef !== undefined) fail(path, 'expected at most one of stacks and stacksRef');
  const condition: SelfStateCondition = { state, present: true };
  if (v.stacksRef !== undefined) condition.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
  else condition.stacks = v.stacks === 'full' ? 'full' : parsePositiveInt(v.stacks, `${path}.stacks`);
  return condition;
}

/** 名前の付いた状態の語彙編: 付与に書けない欄（値の欄は中身に書く） */
const STATE_GRANT_VALUE_KEYS = ['stat', 'ref', 'scaling', 'decrease'] as const;

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.2・5.3 節）: 状態の付与。欄は timed から値の欄を除いたもので、規則も
 * timed と同じ（parseTimedFields）。中身の項目は、付与の欄と合わせた timed として今の timed の規則に通す（stat ごとの規則が
 * 中身にもそのまま効く）。同じ状態のほかの付与との規則（中身は 1 つ・維持とスタックの上限が同じ）は validateStateGrants
 */
function parseStateGrantEffect(v: Record<string, Json>, path: string): StateGrantEffect {
  for (const key of STATE_GRANT_VALUE_KEYS) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `a state grant has no value (write ${key} in contents)`);
  }
  if (v.amplifies !== undefined) fail(`${path}.amplifies`, 'amplifies is not allowed in a state grant');
  for (const key of Object.keys(v)) {
    if (!STATE_GRANT_KEYS.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  // エレグのバースト編: target: "enemy" は敵に付く状態の付与。敵の件の timed と同じく target: "allies" に読み替えて残りの欄を読む。
  // マスト編（plan/design-mast.md 2.1 節）: スタック（maxStacks・maxStacksRef）は書ける（件は味方の状態と同じ stackItems で作る）
  const onEnemy = v.target === 'enemy';
  if (onEnemy) {
    for (const key of [
      'targetWeapon',
      'targetElement',
      'targetClass',
      'targetSquad',
      'targetState',
      'includeSelf',
      'targetBurstStep',
      'targetDefense',
      'excludeSelf',
      'fixedTargets',
      'targetCount',
      'targetCountRef',
      'undispellable',
      'stacksFrom',
      'condition',
    ]) {
      if (v[key] !== undefined) fail(`${path}.${key}`, 'not allowed in a grant on the enemy (target "enemy")');
    }
    v = { ...v, target: 'allies' };
  }
  const state = parseNamedStateId(v.state, `${path}.state`, onEnemy ? 'enemy' : 'ally');
  // トリガーの確率のきっかけは書けない（窓が期待値の小片になり、見る側の「付いているか」に使えない）。
  // 2 段目の段 4: { applied } は書ける（連鎖させない。同じ定義の中の連鎖は validateAppliedTriggers）
  const fields = parseTimedFields(v, path, undefined, false);
  if (isAppliedTrigger(fields.trigger) && fields.trigger.applied === state) {
    fail(`${path}.trigger`, `a grant of "${state}" cannot be triggered by its own state`);
  }
  // 循環の禁止: 付与が、自分の付ける状態を見て対象や発火を決めない（plan/design-stage11-modernia.md 11.2 節の 7。2 段目の段 1 の
  // selfState も同じ。plan/design-skill-stage1.md 1.1 節）
  if (fields.targetState !== undefined && stateMatches(fields.targetState, state)) {
    fail(`${path}.targetState`, `a grant of "${state}" cannot look at its own state`);
  }
  // 2 段目の段 5: 家族の根を見る条件も、家族の状態の付与には書けない。
  // 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: 「〈状態〉でなければ」（present: false）だけは書ける。付いている間の
  // 再発火を止めるだけで連鎖しない（段 1.5 の selfState は前のフレームまでに付いた件を見るので、同じフレームの自分の付与は見ない）
  if (
    fields.condition?.selfState !== undefined &&
    stateMatches(fields.condition.selfState.state, state) &&
    fields.condition.selfState.present !== false
  ) {
    fail(`${path}.condition.selfState`, `a grant of "${state}" cannot look at its own state`);
  }
  const effect: StateGrantEffect = { kind: 'state', state, ...fields };
  if (onEnemy) {
    if (isAppliedTrigger(fields.trigger))
      fail(`${path}.trigger`, 'a grant on the enemy cannot be triggered by { applied }');
    // 中身の有無は定義の単位で見る（validateStateGrants。2026-10-29 のキャラの編: 同じ敵の状態を 2 つのきっかけで付ける）
    effect.enemy = true;
  }
  // 2 段目の段 1（plan/design-skill-stage1.md 1.3 節）: 解除不可の印
  if (v.undispellable !== undefined) {
    if (v.undispellable !== true)
      fail(`${path}.undispellable`, `expected true, got ${JSON.stringify(v.undispellable)}`);
    effect.undispellable = true;
  }
  if (v.stacksFrom !== undefined) {
    // 2 段目の段 10: スタックの数をカウンタの値か、自分の状態のスタック数（PR 3）から取る
    const from = v.stacksFrom;
    if (!isRecord(from) || Object.keys(from).length !== 1)
      fail(`${path}.stacksFrom`, 'expected { counter } or { state }');
    for (const key of Object.keys(from)) {
      if (key !== 'counter' && key !== 'state') fail(`${path}.stacksFrom.${key}`, 'unknown field');
    }
    if (from.state !== undefined) {
      const source = parseNamedStateId(from.state, `${path}.stacksFrom.state`, 'ally');
      if (source === state) fail(`${path}.stacksFrom.state`, `a grant of "${state}" cannot count its own stacks`);
      if (effect.maxStacks === undefined) fail(`${path}.maxStacks`, 'stacksFrom { state } needs maxStacks');
      effect.stacksFrom = { state: source };
    } else {
      const counter = oneOf(COUNTER_IDS, from.counter, `${path}.stacksFrom.counter`);
      if (effect.maxStacks === undefined || effect.maxStacks < counterMax(counter)) {
        fail(
          `${path}.maxStacks`,
          `stacksFrom needs maxStacks of at least the max of ${counter} (${counterMax(counter)})`,
        );
      }
      effect.stacksFrom = { counter };
    }
  }
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 1 回の発火で付けるスタックの数（使用回数）
  if (v.stacksPerFireRef !== undefined) {
    if (effect.maxStacks === undefined && effect.maxStacksRef === undefined)
      fail(`${path}.stacksPerFireRef`, 'stacksPerFireRef needs maxStacks or maxStacksRef');
    if (effect.stacksFrom !== undefined)
      fail(`${path}.stacksPerFireRef`, 'stacksPerFireRef cannot be used with stacksFrom');
    effect.stacksPerFireRef = parseRef(v.stacksPerFireRef, `${path}.stacksPerFireRef`);
  }
  // マスト編（plan/design-mast.md 2.1 節）: スタックの維持の数え方
  if (v.stackRefresh !== undefined) {
    if (v.stackRefresh !== 'each') fail(`${path}.stackRefresh`, 'expected "each" (omit it for the default)');
    if (effect.maxStacks === undefined && effect.maxStacksRef === undefined)
      fail(`${path}.stackRefresh`, 'stackRefresh needs maxStacks or maxStacksRef');
    effect.stackRefresh = 'each';
  }
  // 徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: 発の leadFrames 前から始める付与
  if (v.leadFrames !== undefined) {
    const t = fields.trigger;
    if (typeof t !== 'object' || t === null || !('count' in t) || t.count !== 'weaponChangeShot' || isChanceTrigger(t))
      fail(`${path}.leadFrames`, 'leadFrames needs the trigger { count: "weaponChangeShot" }');
    // 1 パス目は発の leadFrames 前のフレームで件を登録する（同 5.3 節）ので、発のフレームで判定するものは書けない
    if (effect.condition !== undefined) fail(`${path}.condition`, 'condition cannot be used with leadFrames');
    if (effect.stacksFrom !== undefined) fail(`${path}.stacksFrom`, 'stacksFrom cannot be used with leadFrames');
    if (dependsOnRank(effect)) fail(`${path}.target`, 'topAttack cannot be used with leadFrames');
    effect.leadFrames = parsePositiveInt(v.leadFrames, `${path}.leadFrames`);
  }
  if (v.contents !== undefined) {
    if (!Array.isArray(v.contents) || v.contents.length === 0) fail(`${path}.contents`, 'expected a non-empty array');
    effect.contents = v.contents.map((item, i) => parseStateContentItem(item, v, `${path}.contents[${i}]`, onEnemy));
  }
  // 2 段目の段 4（plan/design-skill-stage4.md 1.2 節）: 維持 0 秒の付与は、名前の付いた即時効果の付いた記録だけを作る（窓は無い）
  if (effect.durationSeconds === 0) {
    for (const key of ['contents', 'maxStacks', 'maxStacksRef', 'undispellable']) {
      if (v[key] !== undefined)
        fail(`${path}.${key}`, 'a grant lasting 0 seconds holds nothing (it only records the application)');
    }
  }
  return effect;
}

/**
 * 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: { applied } を damage のほかで読む。{ applied } でなければ undefined
 * （ほかのトリガーは呼ぶ側の parseTrigger が読む）
 */
function parseAppliedTrigger(v: Json, path: string): AppliedTrigger | undefined {
  if (!isRecord(v) || v.applied === undefined) return undefined;
  for (const key of Object.keys(v)) if (key !== 'applied') fail(`${path}.${key}`, 'unknown field');
  return { applied: parseNamedStateId(v.applied, `${path}.applied`, 'ally') };
}

/** 2 段目の段 17 の PR 1: { coverHealed: true }。ほかのきっかけなら undefined（状態の付与では読まず、parseTrigger が落とす） */
/** マスト編（plan/design-mast.md 8 節）: { selfHpAtMostRef: N }。それ以外の形なら undefined（timed だけが読む） */
function parseSelfHpAtMostTrigger(v: Json, path: string): SelfHpAtMostTrigger | undefined {
  if (!isRecord(v) || v.selfHpAtMostRef === undefined) return undefined;
  for (const key of Object.keys(v)) if (key !== 'selfHpAtMostRef') fail(`${path}.${key}`, 'unknown field');
  return { selfHpAtMostRef: parseRef(v.selfHpAtMostRef, `${path}.selfHpAtMostRef`) };
}

function parseCoverHealedTrigger(v: Json, path: string): CoverHealedTrigger | undefined {
  if (!isRecord(v) || v.coverHealed === undefined) return undefined;
  for (const key of Object.keys(v)) if (key !== 'coverHealed') fail(`${path}.${key}`, 'unknown field');
  if (v.coverHealed !== true) fail(`${path}.coverHealed`, `expected true, got ${JSON.stringify(v.coverHealed)}`);
  return { coverHealed: true };
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: { chargeTick: { everySeconds } } か { chargeFull: true }。それ以外の形なら
 * undefined（timed と状態の付与の parseTimedFields だけが読む）
 */
function parseChargeTrigger(v: Json, path: string): ChargeTickTrigger | ChargeFullTrigger | undefined {
  if (!isRecord(v)) return undefined;
  if (v.chargeFull !== undefined) {
    for (const key of Object.keys(v)) if (key !== 'chargeFull') fail(`${path}.${key}`, 'unknown field');
    if (v.chargeFull !== true) fail(`${path}.chargeFull`, `expected true, got ${JSON.stringify(v.chargeFull)}`);
    return { chargeFull: true };
  }
  if (v.chargeTick === undefined) return undefined;
  for (const key of Object.keys(v)) if (key !== 'chargeTick') fail(`${path}.${key}`, 'unknown field');
  const tick = v.chargeTick;
  if (!isRecord(tick)) fail(`${path}.chargeTick`, 'expected { everySeconds }');
  for (const key of Object.keys(tick)) if (key !== 'everySeconds') fail(`${path}.chargeTick.${key}`, 'unknown field');
  const seconds = tick.everySeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    fail(`${path}.chargeTick.everySeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
  }
  return { chargeTick: { everySeconds: seconds } };
}

/** 名前の付いた状態の語彙編: 付与に書ける欄（timed の欄から値の欄を除き、state・contents を足したもの） */
const STATE_GRANT_KEYS: readonly string[] = [
  'kind',
  'state',
  'contents',
  'undispellable',
  'trigger',
  'target',
  'targetWeapon',
  'targetElement',
  'targetClass',
  'targetSquad',
  'targetCount',
  'targetCountRef',
  'excludeSelf',
  'targetState',
  'includeSelf',
  'targetBurstStep',
  'durationRef',
  'durationSeconds',
  'durationShots',
  'durationShotsRef',
  'durationUntil',
  'maxStacks',
  'maxStacksRef',
  'stacksFrom',
  'stacksPerFireRef',
  'leadFrames',
  'stackRefresh',
  'condition',
  'burstStepMix',
  'squad',
  'withCharacter',
  'enemyElement',
  'delayFrames',
  'assumes',
  'claims',
];

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.3 節）: 中身の 1 項目。付与の欄（grant）と合わせた timed を
 * parseTimedEffect に通して、stat ごとの規則を確かめる
 */
function parseStateContentItem(
  item: Json,
  grant: Record<string, Json>,
  path: string,
  onEnemy = false,
): StateContentItem {
  if (!isRecord(item)) fail(path, 'expected an object');
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 「〈状態〉の最大スタック数 N▲」
  if (item.maxStacksUp !== undefined) return parseMaxStacksUpItem(item, grant, path, onEnemy);
  for (const key of Object.keys(item)) {
    if (!['stat', 'ref', 'scaling', 'decrease', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const timed = parseTimedEffect(contentAsTimed(grant, item), path);
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 味方の状態の中身に敵の件（受けるダメージ▲）は書けない。
  // エレグのバースト編: 敵に付く状態の中身は、敵が持つ stat だけ
  if (onEnemy) {
    if (!isEnemyHeldStat(timed.stat))
      fail(`${path}.stat`, `a state on the enemy holds only enemy-held stats, got ${timed.stat}`);
  } else if (timed.stat === 'damageTaken') {
    fail(`${path}.stat`, 'damageTaken is held by the enemy, not by a state of an ally');
  }
  const out: StatContentItem = { stat: timed.stat };
  if (timed.ref !== undefined) out.ref = timed.ref;
  if (timed.scaling !== undefined) out.scaling = timed.scaling;
  if (timed.decrease) out.decrease = true;
  if (item.claims !== undefined) out.claims = parseClaimRefs(item.claims, `${path}.claims`);
  return out;
}

/**
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 中身の「〈状態〉の最大スタック数 N▲」。持ち主は付与の対象で、自分にだけ
 * 付く付与に書ける（上限を足す先は持ち主の state の件の列）。state は味方の状態で、付与の状態とは別。同じ定義にその状態をスタックで付ける
 * 付与が要ること（validateMaxStacksUps）は、定義全体で見る
 */
function parseMaxStacksUpItem(
  item: Record<string, Json>,
  grant: Record<string, Json>,
  path: string,
  onEnemy: boolean,
): MaxStacksUpContentItem {
  for (const key of Object.keys(item)) {
    if (key !== 'maxStacksUp' && key !== 'claims') fail(`${path}.${key}`, 'unknown field');
  }
  if (onEnemy || grant.target !== 'self')
    fail(`${path}.maxStacksUp`, 'maxStacksUp is only allowed in a grant on "self"');
  const up = item.maxStacksUp;
  if (!isRecord(up)) fail(`${path}.maxStacksUp`, 'expected { state, amountRef }');
  for (const key of Object.keys(up)) {
    if (key !== 'state' && key !== 'amountRef') fail(`${path}.maxStacksUp.${key}`, 'unknown field');
  }
  const state = parseNamedStateId(up.state, `${path}.maxStacksUp.state`, 'ally');
  if (state === grant.state) fail(`${path}.maxStacksUp.state`, `a state cannot raise its own max stacks (${state})`);
  const out: MaxStacksUpContentItem = {
    maxStacksUp: { state, amountRef: parseRef(up.amountRef, `${path}.maxStacksUp.amountRef`) },
  };
  if (item.claims !== undefined) out.claims = parseClaimRefs(item.claims, `${path}.claims`);
  return out;
}

/**
 * 名前の付いた状態の語彙編: 付与の欄と中身の項目を合わせた timed（検証用。plan/design-named-state.md 3.2 節）。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: チャージ時間の固定（fixedChargeTime）の中身は、状態のスタック（使用回数）に
 * よらず 1 回だけ効く（固定の秒は足し合わせない。skills/buffs.ts の applyResolvedEffect）ので、付与のスタックの欄を渡さない
 */
function contentAsTimed(grant: Record<string, Json>, item: Record<string, Json>): Record<string, Json> {
  // 付与の delayFrames（周期の付与の遅れ）は付与の発火の欄なので、中身の規則には渡さない
  const {
    kind: _kind,
    state: _state,
    contents: _contents,
    claims: _claims,
    undispellable: _u,
    delayFrames: _delay,
    stacksPerFireRef: _perFire,
    leadFrames: _lead,
    stackRefresh: _refresh,
    ...fields
  } = grant;
  const { claims: _itemClaims, ...value } = item;
  if (value.stat === 'fixedChargeTime') {
    delete fields.maxStacks;
    delete fields.maxStacksRef;
  }
  return { ...fields, ...value, kind: 'timed' };
}

/**
 * ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 確率のきっかけの timed は、窓を期待値の小片にするので、値を足し合わせて
 * 意味のある stat（射撃に効かない・状態でない・フラグでない）だけに書け、スタック・条件・発数や出来事の維持・amplifies・名前・
 * 順位の対象とは組み合わせない（意味が決まっていない。使うキャラが出たら足す）
 */
function validateChanceTimed(effect: TimedEffect, path: string): void {
  if (!isChanceTrigger(effect.trigger)) return;
  const stat = effect.stat;
  if (isFiringStat(stat) || isStateStat(stat) || isFlagStat(stat) || isHitStateStat(stat)) {
    fail(`${path}.stat`, `a chance trigger is not supported for "${stat}" (it needs a value that adds up linearly)`);
  }
  // T4 の▼は、件の始まりごとに走っている CT を縮める（frame/firstPass.ts の burstCooldownStartedAt）。期待値の窓は機会の始まりと終わりで
  // 小片に割る（skills/chance.ts）ので、小片の始まりのたびに縮め直してしまう
  if (stat === 'burstCooldown') {
    fail(
      `${path}.stat`,
      'a chance trigger is not supported for "burstCooldown" (each piece of the expected window would shorten the running cooldown again)',
    );
  }
  if (effect.target === 'topAttack') fail(`${path}.target`, 'a chance trigger cannot target "topAttack"');
  const forbidden: [unknown, string][] = [
    [effect.maxStacks ?? effect.maxStacksRef, 'maxStacks'],
    [effect.condition, 'condition'],
    [effect.durationShots ?? effect.durationShotsRef, 'durationShots'],
    [effect.durationUntil, 'durationUntil'],
    [effect.amplifies, 'amplifies'],
  ];
  for (const [value, key] of forbidden) {
    if (value !== undefined) fail(`${path}.${key}`, `a chance trigger cannot be combined with ${key}`);
  }
}

/**
 * 環境コントロール強化編: amplifies の形と、組み合わせられない欄（plan/design-true-damage-element.md 3.5 節）。
 * 窓は参照する効果の件から作る（skills/holders.ts の amplify）。1 パス目で窓を追う stat には書けない（isFirstPassTrackedStat の制限）
 */
function parseAmplifies(v: Record<string, Json>, stat: BuffStat, target: BuffTarget, path: string): Amplifies {
  const a = v.amplifies;
  if (!isRecord(a) || Object.keys(a).some((k) => k !== 'skill' && k !== 'percent')) {
    fail(path, 'expected { skill, percent }');
  }
  const skill = oneOf(SKILL_SLOTS, a.skill, `${path}.skill`);
  const percent = a.percent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
    fail(`${path}.percent`, `expected a positive number, got ${JSON.stringify(percent)}`);
  }
  if (isFirstPassTrackedStat(stat) || isFlagStat(stat)) {
    fail(path, `amplifies is not supported for "${stat}" (its window is tracked inside the first pass)`);
  }
  if (target === 'topAttack') fail(path, 'amplifies cannot target "topAttack"');
  for (const key of [
    'ref',
    'scaling',
    'decrease',
    'maxStacks',
    'maxStacksRef',
    'condition',
    'durationShots',
    'durationShotsRef',
    'durationUntil',
    // 2 段目の段 7: 最終防御力の比べの対象は発火の瞬間に決める（topAttack と同じく、強化の窓の作り方の外）
    'targetDefense',
  ]) {
    if (v[key] !== undefined) fail(path, `amplifies cannot be combined with ${key}`);
  }
  return { skill, percent };
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
 * 発数の窓は 1 パス目の射撃の列から後で決めるので、1 パス目のループの中で窓を追う stat には書けない
 */
function parseTimedDuration(
  v: Record<string, Json>,
  stat: BuffStat | undefined,
  target: BuffTarget,
  path: string,
): {
  durationRef?: number;
  durationSeconds?: number;
  durationShots?: number;
  durationShotsRef?: number;
  durationUntil?: DurationUntil;
} {
  const hasShots = v.durationShots !== undefined;
  const hasShotsRef = v.durationShotsRef !== undefined;
  // 防御力無視ダメージ編: 「解除条件：フルバーストタイムが終了した時」
  if (v.durationUntil !== undefined) {
    if (hasShots || hasShotsRef || v.durationRef !== undefined || v.durationSeconds !== undefined) {
      fail(path, 'durationUntil cannot be combined with another duration');
    }
    const until = oneOf(DURATION_UNTILS, v.durationUntil, `${path}.durationUntil`);
    if (stat !== undefined && (isFlagStat(stat) || (until === 'fullBurstEnd' && isFirstPassTrackedStat(stat)))) {
      fail(
        `${path}.stat`,
        `a duration until an event is not supported for "${stat}" (its window is tracked inside the first pass)`,
      );
    }
    // マスト編: HP の割合の窓は、窓の始まりの順位で対象を決めて窓の終わりまで続く
    if (target === 'topAttack' && until !== 'selfHpAbove')
      fail(`${path}.target`, 'a duration until an event cannot target "topAttack"');
    if (until === 'selfHpAbove' && (stat === undefined || isFirstPassTrackedStat(stat) || isFlagStat(stat)))
      fail(
        `${path}.durationUntil`,
        'a duration until the HP rises is only supported for timed effects of a value not tracked in the first pass',
      );
    // シンデレラ S1 編: リロードの込め終わりは持ち主の射撃の列にある。使い手は自分にだけ付ける（timed の自分）
    if (until === 'reloadEnd' && (stat === undefined || target !== 'self')) {
      fail(`${path}.durationUntil`, 'a duration until the reload ends is only supported for timed effects on "self"');
    }
    return { durationUntil: until };
  }
  if (!hasShots && !hasShotsRef) return parseDuration(v, path);
  if (hasShots && hasShotsRef) fail(path, 'at most one of durationShots and durationShotsRef');
  if (v.durationRef !== undefined || v.durationSeconds !== undefined) {
    fail(path, 'a duration is either in seconds or in shots, not both');
  }
  // 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節。V-0569）: チャージ速度は、1 パス目の件の列が持ち主の発で窓を閉じる
  // （発数の維持の件は射撃の記録が伸びるたびに作り直す。skills/holders.ts の trackReadsOf）ので書ける。溜めの途中で付いても、それまでに
  // 溜めたフレームは残り、伸びたチャージ時間まで溜める（frame/shooter.ts の chargeProgressFrames。エイダの特殊改造）
  if (
    stat !== undefined &&
    stat !== 'chargeSpeed' &&
    (stat === 'attack' || isFiringStat(stat) || isStateStat(stat) || isFlagStat(stat))
  ) {
    fail(
      `${path}.stat`,
      `a duration in shots is not supported for "${stat}" (its window is tracked inside the first pass)`,
    );
  }
  // 順位の発数編（plan/design-ranked-shot-duration.md 2 節）: topAttack は 2 段目（順位）で、対象の枠の射撃で窓を切る
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
      ![
        'kind',
        'trigger',
        'damageRef',
        'hitsPerShot',
        'trueDamage',
        'projectileExplosion',
        'chargeTimeSeconds',
        'fullChargeDamage',
        'maxAmmoRef',
        'durationRef',
        'durationSeconds',
        'rateOfFire',
        'instantFire',
        'firstShotDelayFrames',
        'infiniteAmmo',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  // 使用武器変更の武器のパラメータ編: 最大装弾数を書いた変更は撃ち切りで終わる（維持の欄を書かない。design-true-damage-element.md 9 節）
  const untilEmpty = v.maxAmmoRef !== undefined;
  if (untilEmpty && (v.durationRef !== undefined || v.durationSeconds !== undefined)) {
    fail(
      path,
      'a weapon change with maxAmmoRef ends when its magazine is empty; durationRef/durationSeconds are not allowed',
    );
  }
  const effect: WeaponChangeEffect = {
    kind: 'weaponChange',
    // 2 段目の段 11: 状態のフルスタックで起こす変更（plan/design-skill-stage11.md 2.1 節）
    trigger: parseTrigger(v.trigger, `${path}.trigger`, false, false, false, true),
    damageRef: parseRef(v.damageRef, `${path}.damageRef`),
    ...(untilEmpty ? { maxAmmoRef: parseRef(v.maxAmmoRef, `${path}.maxAmmoRef`) } : parseDuration(v, path)),
  };
  if (v.chargeTimeSeconds !== undefined) {
    const seconds = v.chargeTimeSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.chargeTimeSeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
    effect.chargeTimeSeconds = seconds;
  }
  if (v.fullChargeDamage !== undefined) {
    const percent = v.fullChargeDamage;
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
      fail(`${path}.fullChargeDamage`, `expected a positive finite number, got ${JSON.stringify(percent)}`);
    }
    effect.fullChargeDamage = percent;
  }
  if (v.hitsPerShot !== undefined) effect.hitsPerShot = parsePositiveInt(v.hitsPerShot, `${path}.hitsPerShot`);
  // 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: CDN に無い変更後の武器の形（録画で読む即値）
  if (v.rateOfFire !== undefined) effect.rateOfFire = parsePositiveInt(v.rateOfFire, `${path}.rateOfFire`);
  if (v.instantFire !== undefined) {
    if (v.instantFire !== true) fail(`${path}.instantFire`, `expected true, got ${JSON.stringify(v.instantFire)}`);
    if (effect.chargeTimeSeconds !== undefined || effect.fullChargeDamage !== undefined) {
      fail(`${path}.instantFire`, 'instantFire cannot be combined with chargeTimeSeconds or fullChargeDamage');
    }
    effect.instantFire = true;
  }
  if (v.firstShotDelayFrames !== undefined) {
    const n = v.firstShotDelayFrames;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      fail(`${path}.firstShotDelayFrames`, `expected a non-negative integer, got ${JSON.stringify(n)}`);
    }
    effect.firstShotDelayFrames = n;
  }
  if (v.infiniteAmmo !== undefined) {
    if (v.infiniteAmmo !== true) fail(`${path}.infiniteAmmo`, `expected true, got ${JSON.stringify(v.infiniteAmmo)}`);
    if (untilEmpty) fail(`${path}.infiniteAmmo`, 'infiniteAmmo cannot be combined with maxAmmoRef');
    effect.infiniteAmmo = true;
  }
  if (v.trueDamage !== undefined) {
    if (v.trueDamage !== true) fail(`${path}.trueDamage`, `expected true, got ${JSON.stringify(v.trueDamage)}`);
    effect.trueDamage = true;
  }
  if (v.projectileExplosion !== undefined) {
    if (v.projectileExplosion !== true) {
      fail(`${path}.projectileExplosion`, `expected true, got ${JSON.stringify(v.projectileExplosion)}`);
    }
    effect.projectileExplosion = true;
  }
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
  if (trigger.count === 'weaponChangeShot') fail(`${path}.trigger.count`, 'weaponChangeShot is not allowed in a cycle');
  if (trigger.count === 'pelletHit') fail(`${path}.trigger.count`, 'pelletHit is not allowed in a cycle');
  if (trigger.stacksRef !== undefined) fail(`${path}.trigger.stacksRef`, 'stacksRef is not allowed in a cycle');
  if (!Array.isArray(v.steps) || v.steps.length < 2) fail(`${path}.steps`, 'expected an array of at least 2 steps');
  const steps = v.steps.map((raw, i): CycleStep => {
    const stepPath = `${path}.steps[${i}]`;
    if (!isRecord(raw)) fail(stepPath, 'expected an object');
    for (const key of Object.keys(raw)) {
      if (!['kind', 'ref', 'damageType', 'gaugeHits', 'delayFrames', 'assumes'].includes(key)) {
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
    if (raw.delayFrames !== undefined) step.delayFrames = parsePositiveInt(raw.delayFrames, `${stepPath}.delayFrames`);
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
    if (
      ![
        'kind',
        'trigger',
        'slot',
        'every',
        'decreaseRef',
        'burstStepMix',
        'durationRef',
        'durationSeconds',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  // 自分の射撃で自分の循環を速めると判定が循環するので、射撃の回数トリガーは書けない（plan/design-stage11-scarlet-bs.md 2.2 節）
  if (isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'cycleEvery cannot be triggered by a shot count');
  if ((v.every === undefined) === (v.decreaseRef === undefined))
    fail(path, 'expected exactly one of every and decreaseRef');
  const effect: CycleEveryEffect = {
    kind: 'cycleEvery',
    trigger,
    slot: oneOf(SKILL_SLOTS, v.slot, `${path}.slot`),
    ...(v.every !== undefined
      ? { every: parsePositiveInt(v.every, `${path}.every`) }
      : { decreaseRef: parseRef(v.decreaseRef, `${path}.decreaseRef`) }),
    ...parseDuration(v, path),
  };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstDamageEffect(v: Record<string, Json>, path: string): BurstDamageEffect {
  const damageType = oneOf(BURST_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: BurstDamageEffect = { kind: 'burstDamage', ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.hitsRef !== undefined) effect.hitsRef = parseRef(v.hitsRef, `${path}.hitsRef`);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseDamageEffect(v: Record<string, Json>, path: string): DamageEffect {
  const trigger = parseDamageTrigger(v.trigger, `${path}.trigger`);
  // Stage 11 モダニア: 射撃ごと（every = 1）の倍率ダメージも書ける。1 トリガーの値に畳み込む（skills/burstDamage.ts の resolvePerShotDamage）
  const damageType = oneOf(SKILL_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: DamageEffect = { kind: 'damage', trigger, ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.gaugeHits !== undefined) {
    // ヘルム編: ゲージは 1 パス目で射撃を数えて予約するので、射撃の回数トリガーのときだけ
    if (!isShotCountTrigger(trigger)) fail(`${path}.gaugeHits`, 'gaugeHits needs a shot count trigger');
    if (trigger.stacksRef !== undefined) fail(`${path}.gaugeHits`, 'gaugeHits cannot be used with stacksRef');
    effect.gaugeHits = parseGaugeHits(v.gaugeHits, `${path}.gaugeHits`, 0);
  }
  // クルミ S2 編: 発火の条件。名前の付いた状態の語彙編: timed と同じ型（鍵は inFullBurst・enemyState）
  if (v.condition !== undefined)
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.damage);
  // クルミ S2 編: ゲージは 1 パス目で溜めるので、1 パス目の後に決まる窓・条件とは組み合わせない（plan/design-kurumi-s2.md 2.4 節）
  if (effect.gaugeHits !== undefined && (effect.condition !== undefined || hasCountingWindow(trigger))) {
    fail(`${path}.gaugeHits`, 'gaugeHits cannot be used with a condition or a counting window (during)');
  }
  if (v.delayFrames !== undefined) {
    // 遅れて出る倍率ダメージ編（plan/design-delayed-skill-hit.md 3.1 節）: いま要るのはバースト使用時と、
    // ペルソナ編の「〈効果名〉が適用された時」（クイーン（真）S1 の追撃。plan/design-persona.md 9.3 節）と、
    // 周期のスキルの発動からヒットまでの遅れ（時間の周期のトリガー。C-0453。plan/design-timer-ceil.md 2 節の論点 4）。
    // 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: 射撃の回数のきっかけ（確率を除く）も
    if (isShotCountTrigger(trigger)) {
      effect.delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
      // ゲージのヒットのフレームは測っていない（ゲージは 1 パス目で射撃から数える）
      if (effect.gaugeHits !== undefined) fail(`${path}.delayFrames`, 'delayFrames cannot be used with gaugeHits');
    } else {
      if (
        trigger !== 'burstUse' &&
        !isAppliedTrigger(trigger) &&
        !isTimerTrigger(trigger) &&
        !isCounterFullTrigger(trigger)
      ) {
        fail(
          `${path}.delayFrames`,
          'delayFrames needs the trigger "burstUse", { applied }, { everySeconds }, { counterFull } or a shot count trigger',
        );
      }
      effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
    }
  }
  if (v.perBurstHit !== undefined) {
    // ミハラのバースト編（plan/design-mihara-burst-hits.md 3.2 節）: バーストの倍率ダメージのヒットに合わせる
    if (v.perBurstHit !== true) fail(`${path}.perBurstHit`, `expected true, got ${JSON.stringify(v.perBurstHit)}`);
    if (trigger !== 'burstUse') fail(`${path}.perBurstHit`, 'perBurstHit needs the trigger "burstUse"');
    if (effect.delayFrames !== undefined) fail(`${path}.perBurstHit`, 'perBurstHit cannot be used with delayFrames');
    effect.perBurstHit = true;
  }
  if (v.perCount !== undefined) {
    // 2 段目の段 10（plan/design-skill-stage10.md 2.1 節）: 値 × 状態のスタック数。使い手（シンデレラ）のいるバースト使用時だけ。
    // 段 11 の PR 5（plan/design-skill-stage11.md 2.5 節）: 値 × カウンタの値（ラプラス：アルティメットヒーロー）。
    // 段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: フルバーストの始まり（ラピ：レッドフードの粘着榴弾の起爆）も
    const per = v.perCount;
    if (!isRecord(per)) fail(`${path}.perCount`, 'expected an object');
    // 段 13 の PR 1（plan/design-skill-stage13.md 2.2 節）: カウンタが上限に届いた時（ミハラ：ボンディングチェーンのチェーンの数だけの攻撃）も。
    // 段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: フルチャージして攻撃した時（オートファイアの装填数分の順番の攻撃）も
    const fullChargeShot = isShotCountTrigger(trigger) && trigger.count === 'fullChargeShot';
    if (trigger !== 'burstUse' && trigger !== 'fullBurstStart' && !isCounterFullTrigger(trigger) && !fullChargeShot)
      fail(
        `${path}.perCount`,
        'perCount needs the trigger "burstUse", "fullBurstStart", { counterFull } or { count: "fullChargeShot" }',
      );
    for (const key of Object.keys(per))
      if (key !== 'state' && key !== 'counter') fail(`${path}.perCount.${key}`, 'unknown field');
    if ((per.state === undefined) === (per.counter === undefined))
      fail(`${path}.perCount`, 'expected exactly one of state and counter');
    effect.perCount =
      per.state !== undefined
        ? { state: parseNamedStateId(per.state, `${path}.perCount.state`, 'ally') }
        : { counter: oneOf(COUNTER_IDS, per.counter, `${path}.perCount.counter`) };
  }
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2 節）: 「N 回順番に攻撃」
  if (v.hitsRef !== undefined) {
    if (isShotCountTrigger(trigger)) fail(`${path}.hitsRef`, 'hitsRef cannot be used with a shot count trigger');
    if (effect.perBurstHit === true) fail(`${path}.hitsRef`, 'hitsRef cannot be used with perBurstHit');
    effect.hitsRef = parseRef(v.hitsRef, `${path}.hitsRef`);
  }
  if (v.hitIntervalFrames !== undefined) {
    if (effect.hitsRef === undefined) fail(`${path}.hitIntervalFrames`, 'hitIntervalFrames needs hitsRef');
    const n = v.hitIntervalFrames;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      fail(`${path}.hitIntervalFrames`, `expected an integer >= 0, got ${JSON.stringify(n)}`);
    }
    effect.hitIntervalFrames = n;
  }
  // エレグの S1（C-0766）: 等分した不等間隔のヒットと、値を決めるフレーム
  if (v.hitOffsetFrames !== undefined) {
    const at = `${path}.hitOffsetFrames`;
    // 昇順の 0 以上の整数はゲージのヒットと同じ検査。等分するヒットなので、2 つ以上・0 から・同じ遅れの重なりなしを足す
    const offsets = parseGaugeHits(v.hitOffsetFrames, at, 0);
    if (offsets.length < 2 || offsets[0] !== 0 || offsets.some((o, i) => i > 0 && o === offsets[i - 1]))
      fail(at, `expected strictly increasing integers starting at 0 (2 or more), got ${JSON.stringify(offsets)}`);
    if (
      effect.hitsRef !== undefined ||
      effect.perBurstHit !== undefined ||
      effect.perCount !== undefined ||
      effect.gaugeHits !== undefined
    )
      fail(at, 'hitOffsetFrames cannot be used with hitsRef, perBurstHit, perCount or gaugeHits');
    effect.hitOffsetFrames = offsets;
  }
  if (v.valueDelayFrames !== undefined) {
    const at = `${path}.valueDelayFrames`;
    if (effect.hitOffsetFrames === undefined) fail(at, 'valueDelayFrames needs hitOffsetFrames');
    const n = parsePositiveInt(v.valueDelayFrames, at);
    if (n > (effect.delayFrames ?? 0)) fail(at, 'valueDelayFrames must not exceed delayFrames');
    effect.valueDelayFrames = n;
  }
  // 同 5.3 節: 「〈状態〉再発動周期 N 秒▼」
  if (v.periodShorten !== undefined) {
    const p = v.periodShorten;
    if (!isTimerTrigger(trigger))
      fail(`${path}.periodShorten`, 'periodShorten needs a timer trigger ({ everySeconds })');
    if (!isRecord(p)) fail(`${path}.periodShorten`, 'expected an object');
    for (const key of Object.keys(p))
      if (!['state', 'window', 'slot', 'ref'].includes(key)) fail(`${path}.periodShorten.${key}`, 'unknown field');
    if ((p.state === undefined) === (p.window === undefined))
      fail(`${path}.periodShorten`, 'expected exactly one of state and window');
    const slot = oneOf(SKILL_SLOTS, p.slot, `${path}.periodShorten.slot`);
    const ref = parseRef(p.ref, `${path}.periodShorten.ref`);
    if (p.state !== undefined) {
      effect.periodShorten = { state: parseNamedStateId(p.state, `${path}.periodShorten.state`, 'ally'), slot, ref };
    } else {
      // 2 段目の段 15 の PR 3（論点 7）: 名前の無い窓（きっかけから N 秒）。きっかけはいまはバースト使用時だけ
      const w = p.window;
      const at = `${path}.periodShorten.window`;
      if (!isRecord(w)) fail(at, 'expected an object');
      for (const key of Object.keys(w))
        if (!['trigger', 'durationRef', 'elapsed'].includes(key)) fail(`${at}.${key}`, 'unknown field');
      if (w.trigger !== 'burstUse') fail(`${at}.trigger`, `expected "burstUse", got ${JSON.stringify(w.trigger)}`);
      // 2 段目の段 18 の PR 1: 経過で縮める窓（ドロシーの発現）。端数を持ち越す周期とは組まない
      if (w.elapsed !== undefined && w.elapsed !== true)
        fail(`${at}.elapsed`, `expected true, got ${JSON.stringify(w.elapsed)}`);
      if (w.elapsed === true && isTimerTrigger(trigger) && trigger.carry === true)
        fail(`${at}.elapsed`, 'elapsed cannot be used with a carry timer');
      effect.periodShorten = {
        window: {
          trigger: 'burstUse',
          durationRef: parseRef(w.durationRef, `${at}.durationRef`),
          ...(w.elapsed === true ? { elapsed: true as const } : {}),
        },
        slot,
        ref,
      };
    }
  }
  // V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 周期の倍率ダメージのヒットごとのゲージ。2 段目の段 14 の PR 2（plan/design-skill-stage14.md
  // 2.5 節）: 射撃の回数のきっかけ（数える窓なし）も
  if (v.gaugePerHit !== undefined) {
    if (v.gaugePerHit !== true) fail(`${path}.gaugePerHit`, `expected true, got ${JSON.stringify(v.gaugePerHit)}`);
    if (!isTimerTrigger(trigger) && !(isShotCountTrigger(trigger) && !hasCountingWindow(trigger)))
      fail(
        `${path}.gaugePerHit`,
        'gaugePerHit needs a timer trigger ({ everySeconds }) or a shot count trigger without a counting window',
      );
    if (effect.gaugeHits !== undefined) fail(`${path}.gaugePerHit`, 'gaugePerHit cannot be used with gaugeHits');
    // 2 段目の段 15 の PR 3: 1 パス目は名前の無い窓の短縮を追わない（使い手のエイダの S2 はゲージを溜めるかを確かめていない）
    if (effect.periodShorten?.window !== undefined)
      fail(`${path}.gaugePerHit`, 'gaugePerHit cannot be used with a periodShorten window');
    // 1 パス目は発火のフレームより後のゲージだけを予約できる。条件は 1 パス目の後に絞るので組み合わせない
    if (effect.delayFrames === undefined) fail(`${path}.gaugePerHit`, 'gaugePerHit needs delayFrames');
    // エレグの S1（C-0773）: 射撃の回数のきっかけなら、条件 enemyState だけは 1 パス目が発火のフレームで見る（skills/holders.ts の enemyStateAt）
    const enemyOnly =
      isShotCountTrigger(trigger) &&
      effect.condition !== undefined &&
      Object.keys(effect.condition).every((k) => k === 'enemyState');
    if (effect.condition !== undefined && !enemyOnly)
      fail(
        `${path}.gaugePerHit`,
        'gaugePerHit cannot be used with a condition (except enemyState with a shot count trigger)',
      );
    effect.gaugePerHit = true;
  }
  // 同 5.4 節: 「コア命中ダメージ」
  if (v.coreHit !== undefined) {
    if (v.coreHit !== true) fail(`${path}.coreHit`, `expected true, got ${JSON.stringify(v.coreHit)}`);
    effect.coreHit = true;
  }
  if (v.perCountIntervalSeconds !== undefined) {
    const key = 'perCountIntervalSeconds';
    // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: perCount の { state } と delayFrames も（オートファイアの順番の攻撃）
    if (effect.perCount === undefined) fail(`${path}.${key}`, `${key} needs perCount`);
    if (effect.perBurstHit !== undefined) fail(`${path}.${key}`, `${key} cannot be used with perBurstHit`);
    const seconds = v.perCountIntervalSeconds;
    if (typeof seconds !== 'number' || !(seconds > 0))
      fail(`${path}.${key}`, `expected a positive number, got ${JSON.stringify(seconds)}`);
    effect.perCountIntervalSeconds = seconds;
  }
  if (v.perCountIntervalFrames !== undefined) {
    const key = 'perCountIntervalFrames';
    if (effect.perCount === undefined || !('counter' in effect.perCount))
      fail(`${path}.${key}`, `${key} needs perCount { counter }`);
    if (effect.perCountIntervalSeconds !== undefined || effect.perBurstHit !== undefined)
      fail(`${path}.${key}`, `${key} cannot be used with perCountIntervalSeconds or perBurstHit`);
    effect.perCountIntervalFrames = parsePositiveInt(v.perCountIntervalFrames, `${path}.${key}`);
  }
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 「順番に攻撃」の perCount の数だけのヒット
  if (v.sequentialAttack !== undefined) {
    if (v.sequentialAttack !== true)
      fail(`${path}.sequentialAttack`, `expected true, got ${JSON.stringify(v.sequentialAttack)}`);
    if (!splitsPerCount(effect))
      fail(`${path}.sequentialAttack`, 'sequentialAttack needs perCountIntervalSeconds or perCountIntervalFrames');
    effect.sequentialAttack = true;
  }
  // 同: 射撃の回数のきっかけのヒットごとのゲージは、1 パス目が数えられるヒット（1 つずつ出すなら perCount の { state }）だけ
  if (effect.gaugePerHit === true && isShotCountTrigger(trigger) && effect.perCount !== undefined) {
    if (!('state' in effect.perCount) || !splitsPerCount(effect))
      fail(
        `${path}.gaugePerHit`,
        'gaugePerHit with perCount needs perCount { state } split by perCountIntervalSeconds or perCountIntervalFrames',
      );
  }
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2・2.3 節）: 1 ヒットの印（コア・距離ボーナス・発射体の爆発・付着）
  for (const key of ['core', 'distance', 'projectileExplosion', 'projectileStick'] as const) {
    if (v[key] === undefined) continue;
    if (v[key] !== true) fail(`${path}.${key}`, `expected true, got ${JSON.stringify(v[key])}`);
    effect[key] = true;
  }
  if (effect.projectileExplosion === true && effect.projectileStick === true)
    fail(path, 'projectileExplosion and projectileStick cannot be used together');
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * ペルソナ編: damage のトリガー。{ applied: 状態 }（名前の付いた状態の語彙編: 目録の id）のほかは parseTrigger と同じ。
 * 2 段目の段 13 の PR 1: { counterFull: カウンタ } も（dot も同じ）
 */
function parseDamageTrigger(v: Json, path: string): EffectTrigger {
  return parseCounterFullTrigger(v, path) ?? parseAppliedTrigger(v, path) ?? parseTrigger(v, path, true, true);
}

/** 2 段目の段 11 の PR 2・段 13 の PR 1: { counterFull: カウンタ }。それ以外の形なら undefined */
function parseCounterFullTrigger(v: Json, path: string): CounterFullTrigger | undefined {
  if (!isRecord(v) || v.counterFull === undefined) return undefined;
  for (const key of Object.keys(v)) if (key !== 'counterFull') fail(`${path}.${key}`, 'unknown field');
  return { counterFull: oneOf(COUNTER_IDS, v.counterFull, `${path}.counterFull`) };
}

/** クルミ S2 編: 回数トリガーに数える窓（during）か、発火の窓（firesDuring。V-0443）があるか */
export function hasCountingWindow(trigger: EffectTrigger): boolean {
  return (
    typeof trigger === 'object' &&
    'count' in trigger &&
    (('during' in trigger && trigger.during !== undefined) ||
      ('firesDuring' in trigger && trigger.firesDuring !== undefined))
  );
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
        'state',
        'maxStacksRef',
        'gaugeOnApply',
        'gaugeOnApplyDelayFrames',
        'tickDelayFrames',
        'gaugeOnTick',
        'durationUntil',
        'tickIntervalFrames',
        'hitOnApply',
        'perCount',
        'perCountIntervalFrames',
        'delayFrames',
        'stacksFrom',
        'copyEachTick',
        'sustained',
        'condition',
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
  const counterFull = parseCounterFullTrigger(v.trigger, `${path}.trigger`);
  // 2 段目の段 13 の PR 1: 「持続」は durationUntil: battleEnd
  const untilBattleEnd = v.durationUntil !== undefined;
  if (untilBattleEnd) {
    if (v.durationUntil !== 'battleEnd') fail(`${path}.durationUntil`, 'expected "battleEnd"');
    if (v.durationRef !== undefined || v.durationSeconds !== undefined)
      fail(path, 'durationUntil cannot be combined with another duration');
  }
  const effect: DotEffect = {
    kind: 'dot',
    trigger: counterFull ?? parseTrigger(v.trigger, `${path}.trigger`, true),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...(untilBattleEnd ? { durationUntil: 'battleEnd' as const } : parseDuration(v, path)),
  };
  // 2 段目の段 17 の PR 4: 付くフレームの条件（自分の状態だけ）。絞るのは frame/plan.ts の付くフレーム（damage と同じ判定）だけなので、
  // 付くフレームをほかで追うもの（ゲージを溜める dot は 1 パス目、敵の状態を付ける dot は件の一覧、{ counterFull } はカウンタの経路）とは組まない
  if (v.condition !== undefined) {
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.dot);
    for (const key of ['gaugeOnApply', 'gaugeOnTick', 'gaugeOnApplyDelayFrames'])
      if (v[key] !== undefined) fail(`${path}.${key}`, 'a dot with a condition cannot charge the gauge');
    if (v.state !== undefined) fail(`${path}.state`, 'a dot with a condition cannot apply a state');
    if (counterFull !== undefined) fail(`${path}.trigger`, 'a dot with a condition cannot use { counterFull }');
  }
  if (effect.durationSeconds !== undefined && effect.durationSeconds < interval) {
    fail(`${path}.intervalSeconds`, `must not exceed the duration (${effect.durationSeconds} s)`);
  }
  if (v.firstTick !== undefined) {
    if (typeof v.firstTick !== 'string' || !(DOT_FIRST_TICKS as readonly string[]).includes(v.firstTick)) {
      fail(`${path}.firstTick`, `expected one of ${DOT_FIRST_TICKS.join(', ')}, got ${JSON.stringify(v.firstTick)}`);
    }
    effect.firstTick = v.firstTick as DotFirstTick;
  }
  // クルミ編: 状態異常の名前。名前の付いた状態の語彙編: 目録の id（持ち主が敵の状態。status を改めた）
  if (v.state !== undefined) effect.state = parseNamedStateId(v.state, `${path}.state`, 'enemy');
  if (v.maxStacksRef !== undefined) {
    effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
    if (effect.firstTick !== 'afterInterval' && effect.firstTick !== 'halfAfterLatest')
      fail(`${path}.maxStacksRef`, 'needs firstTick afterInterval or halfAfterLatest');
  }
  // 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: チェーンバインドの形（付けるたびに刻みを付け直す持続）
  const latest = effect.firstTick === 'halfAfterLatest';
  if (latest !== untilBattleEnd) fail(`${path}.firstTick`, 'halfAfterLatest goes with durationUntil "battleEnd"');
  if (v.tickIntervalFrames !== undefined) {
    const n = v.tickIntervalFrames;
    if (!latest) fail(`${path}.tickIntervalFrames`, 'needs firstTick halfAfterLatest');
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0)
      fail(`${path}.tickIntervalFrames`, `expected a positive number, got ${JSON.stringify(n)}`);
    effect.tickIntervalFrames = n;
  }
  if (v.hitOnApply !== undefined) {
    if (v.hitOnApply !== true) fail(`${path}.hitOnApply`, 'expected true');
    if (!latest) fail(`${path}.hitOnApply`, 'needs firstTick halfAfterLatest');
    effect.hitOnApply = true;
  }
  if (v.perCount !== undefined) {
    const per = v.perCount;
    if (counterFull === undefined) fail(`${path}.perCount`, 'perCount needs the trigger { counterFull }');
    if (!isRecord(per) || per.counter === undefined || Object.keys(per).length !== 1)
      fail(`${path}.perCount`, 'expected { counter }');
    effect.perCount = { counter: oneOf(COUNTER_IDS, per.counter, `${path}.perCount.counter`) };
    if (v.perCountIntervalFrames === undefined) fail(`${path}.perCount`, 'perCount needs perCountIntervalFrames');
    effect.perCountIntervalFrames = parsePositiveInt(v.perCountIntervalFrames, `${path}.perCountIntervalFrames`);
  } else if (v.perCountIntervalFrames !== undefined) fail(`${path}.perCountIntervalFrames`, 'needs perCount');
  if (counterFull !== undefined && effect.perCount === undefined)
    fail(`${path}.trigger`, '{ counterFull } needs perCount');
  if (v.delayFrames !== undefined) {
    if (counterFull === undefined) fail(`${path}.delayFrames`, 'delayFrames needs the trigger { counterFull }');
    effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
  }
  if (v.stacksFrom !== undefined) {
    const from = v.stacksFrom;
    if (!isRecord(from) || from.enemyState === undefined || Object.keys(from).length !== 1)
      fail(`${path}.stacksFrom`, 'expected { enemyState }');
    if (effect.maxStacksRef !== undefined || effect.perCount !== undefined)
      fail(`${path}.stacksFrom`, 'stacksFrom cannot be used with maxStacksRef or perCount');
    effect.stacksFrom = { enemyState: parseNamedStateId(from.enemyState, `${path}.stacksFrom.enemyState`, 'enemy') };
  }
  // マスト編（plan/design-mast.md 2.3 節）: tick ごとに写し直す印と、持続ダメージでない印
  if (v.copyEachTick !== undefined) {
    if (v.copyEachTick !== true) fail(`${path}.copyEachTick`, 'expected true');
    if (effect.stacksFrom === undefined) fail(`${path}.copyEachTick`, 'copyEachTick needs stacksFrom');
    effect.copyEachTick = true;
  }
  if (v.sustained !== undefined) {
    if (v.sustained !== false) fail(`${path}.sustained`, 'expected false (omit it for sustained damage)');
    effect.sustained = false;
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
  if (v.gaugeOnApplyDelayFrames !== undefined) {
    if (effect.gaugeOnApply !== true) fail(`${path}.gaugeOnApplyDelayFrames`, 'needs gaugeOnApply');
    effect.gaugeOnApplyDelayFrames = parseShotCountDelay(
      v.gaugeOnApplyDelayFrames,
      effect.trigger,
      `${path}.gaugeOnApplyDelayFrames`,
    );
  }
  if (v.tickDelayFrames !== undefined) {
    if (effect.state !== undefined) fail(`${path}.tickDelayFrames`, 'cannot be combined with state');
    effect.tickDelayFrames = parseShotCountDelay(v.tickDelayFrames, effect.trigger, `${path}.tickDelayFrames`);
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
        'core',
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
  if (v.core !== undefined) {
    if (v.core !== true) fail(`${path}.core`, 'expected true');
    effect.core = true;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** V-0534: 射撃の止まり（shotPause）。きっかけは射撃の回数だけ（during・firesDuring・stacksRef・確率は書けない） */
function parseShotPauseEffect(v: Record<string, Json>, path: string): ShotPauseEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'frames', 'framesOnLastShot', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (!isShotCountTrigger(trigger)) fail(`${path}.trigger`, 'shotPause needs a shot count trigger ({ count })');
  for (const key of ['stacksRef', 'firesDuring'] as const) {
    if (trigger[key] !== undefined) fail(`${path}.trigger.${key}`, `${key} cannot be used in shotPause`);
  }
  const positive = (x: Json, at: string): number => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 1)
      fail(at, `expected a positive integer, got ${JSON.stringify(x)}`);
    return x;
  };
  const effect: ShotPauseEffect = { kind: 'shotPause', trigger, frames: positive(v.frames, `${path}.frames`) };
  if (v.framesOnLastShot !== undefined) {
    effect.framesOnLastShot = positive(v.framesOnLastShot, `${path}.framesOnLastShot`);
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseBurstGaugeHitEffect(v: Record<string, Json>, path: string): BurstGaugeHitEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'trigger', 'delayFrames', 'assumes', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  // モラン編（plan/design-moran.md 2 節）: 射撃の回数のトリガーも書ける。during・chance は parseTrigger が弾く
  if (!isTimerTrigger(trigger) && !isShotCountTrigger(trigger)) {
    fail(
      `${path}.trigger`,
      'burstGaugeHit needs a timer trigger ({ everySeconds }) or a shot count trigger ({ count })',
    );
  }
  if (isShotCountTrigger(trigger) && trigger.stacksRef !== undefined) {
    fail(`${path}.trigger.stacksRef`, 'stacksRef cannot be used in burstGaugeHit');
  }
  const effect: BurstGaugeHitEffect = { kind: 'burstGaugeHit', trigger };
  if (v.delayFrames !== undefined) {
    // 周期のスキルのヒットのゲージは、ヒットのフレームで溜まる（C-0404・C-0409 の HUD の読み。plan/design-timer-ceil.md 7 節）。
    // 回数トリガーの遅れ編: 射撃の回数のトリガーは、発火した射撃の後に遅れて溜まる（モラン S2 の挑発。C-0480）。上で両方に限ってある
    const d = v.delayFrames;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1) {
      fail(`${path}.delayFrames`, `expected a positive integer, got ${JSON.stringify(d)}`);
    }
    effect.delayFrames = d;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/** 2 段目の段 15 の PR 2: 遮蔽物 HP 回復。段 17 の PR 1: 対象は自分か味方全体 */
function parseCoverHealEffect(v: Record<string, Json>, path: string): CoverHealEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'targetCount',
        'targetCountRef',
        'ref',
        'delayFrames',
        'assumes',
        'claims',
      ].includes(key)
    )
      fail(`${path}.${key}`, 'unknown field');
  }
  if (v.target !== 'self' && v.target !== 'allies' && v.target !== 'lowestCoverHp')
    fail(`${path}.target`, `expected "self", "allies" or "lowestCoverHp", got ${JSON.stringify(v.target)}`);
  // 段 17 の PR 2: CT ごとのアクティブ（リターの S2・ココアの S1）は時間の周期のきっかけ
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  const effect: CoverHealEffect = {
    kind: 'coverHeal',
    trigger,
    target: v.target,
    ref: parseRef(v.ref, `${path}.ref`),
    ...parseTargetCount(v, v.target, path),
  };
  if (v.delayFrames !== undefined) {
    if (!isTimerTrigger(trigger)) fail(`${path}.delayFrames`, 'delayFrames needs a timer trigger ({ everySeconds })');
    effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
  }
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

function parseBurstStepChangeEffect(v: Record<string, Json>, path: string): BurstStepChangeEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'step', 'name', 'burstStepMix', 'squad', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const effect: BurstStepChangeEffect = {
    kind: 'burstStepChange',
    step: oneOf(BASIC_BURST_STEPS, v.step, `${path}.step`),
  };
  if (v.name !== undefined) effect.name = parseLocalizedText(v.name, `${path}.name`);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseAllyGaugeAddEffect(v: Record<string, Json>, path: string): AllyGaugeAddEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'ref', 'assumes', 'claims'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  const ref = v.ref;
  if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1) {
    fail(`${path}.ref`, `expected a positive integer, got ${JSON.stringify(ref)}`);
  }
  const effect: AllyGaugeAddEffect = { kind: 'allyGaugeAdd', ref };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseInstantEffect(v: Record<string, Json>, path: string, kind: InstantKind): InstantEffect {
  // 維持時間は heal だけ（plan/design-heal-window.md 1.1 節）。回数トリガーの遅れ編: delayFrames も heal だけ
  const durationKeys = kind === 'heal' ? ['durationRef', 'durationSeconds', 'delayFrames'] : [];
  // 編成の条件は cooldownReduction と heal（回復の語彙編。plan/design-heal-vocabulary.md 2.1 節）。heal は withCharacter も（F5。3.3 節）
  const compositionKeys =
    kind === 'cooldownReduction'
      ? ['burstStepMix', 'squad']
      : kind === 'heal'
        ? ['burstStepMix', 'squad', 'withCharacter', 'targetBurstStep']
        : [];
  // 種類ごとの欄: 弾丸チャージの発数（scaling）。2 段目の段 12: cooldownReduction の直書きの秒数（seconds。PR 3）と発火の条件
  // （condition。PR 4。plan/design-skill-stage12.md 2.6 節）
  const kindKeys = kind === 'ammoRefill' ? ['scaling'] : kind === 'cooldownReduction' ? ['seconds', 'condition'] : [];
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'targetWeapon',
        'targetElement',
        'targetClass',
        'targetCount',
        'targetCountRef',
        'ref',
        ...durationKeys,
        ...compositionKeys,
        ...kindKeys,
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const hasDuration = v.durationRef !== undefined || v.durationSeconds !== undefined;
  // F5（plan/design-heal-vocabulary.md 3.3 節）: heal は時間の周期のトリガー（atStart も）を書ける（エマ：TU の S1 の持続回復）
  const trigger = parseTrigger(
    v.trigger,
    `${path}.trigger`,
    kind === 'heal' ? 'withStart' : false,
    false,
    false,
    kind === 'heal',
    kind === 'ammoDecrease',
  );
  // 2 段目の段 11（plan/design-skill-stage11.md 2.2 節）: 残弾数減少は、使用武器の変更の終わりのきっかけで自分にだけ。2 段目の段 17 の
  // PR 4（plan/design-skill-stage17.md 2.2 節）: バースト使用時も（ジルのバースト。100% で残弾 0 になり、リロードを始める）
  if (kind === 'ammoDecrease') {
    if (!isWeaponChangeEndTrigger(trigger) && trigger !== 'burstUse')
      fail(`${path}.trigger`, 'ammoDecrease needs the trigger { weaponChangeEnd: true } or "burstUse"');
    if (v.target !== 'self') fail(`${path}.target`, 'ammoDecrease must target "self"');
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, 'ammoDecrease cannot narrow its target');
    }
  }
  // 回復で回復を起こすと連鎖が閉じないので、heal のトリガーに healed は書けない（plan/design-stage11.md 3.3 節）
  if (kind === 'heal' && trigger === 'healed') fail(`${path}.trigger`, 'heal cannot be triggered by "healed"');
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  validateBurstUsersTarget(target, trigger, path);
  // 対象の語彙編: 基本チャージ時間の順位は timed だけ（plan/design-target-vocab.md 2.2 節）
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  // 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: HP の割合の低い順は heal だけ。武器・コードの絞り込みとは組み合わせない
  if (target === 'lowestHpRatio') {
    if (kind !== 'heal') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass']) {
      if (v[key] !== undefined)
        fail(`${path}.${key}`, 'lowestHpRatio cannot be combined with a weapon, element or class filter');
    }
  }
  // ヘルム編: ゲージは編成で 1 本なので、対象は味方全体だけ（絞り込みも書けない）
  if (kind === 'burstGauge') {
    if (target !== 'allies') fail(`${path}.target`, 'burstGauge must target "allies" (the team shares one gauge)');
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, 'burstGauge cannot narrow its target');
    }
  }
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const count = parseTargetCount(v, target, path);
  // burstGauge は上で対象を allies に限り、絞り込みの欄も弾いてある
  // 2 段目の段 12: cooldownReduction は直書きの秒数（seconds）も書ける（ref とちょうど片方）
  const seconds = v.seconds;
  if (seconds !== undefined) {
    if (v.ref !== undefined) fail(path, 'exactly one of ref and seconds is required');
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.seconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
  }
  const effect = (
    seconds !== undefined
      ? { kind, trigger, target, seconds }
      : { kind, trigger, target, ref: parseRef(v.ref, `${path}.ref`) }
  ) as InstantEffect;
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  // 2 段目の段 15 の PR 3: heal の「基本バースト段階が N の」（欄の一覧で heal だけに限ってある）
  const step = parseTargetBurstStep(v, target, path);
  if (step !== undefined) (effect as HealEffect).targetBurstStep = step;
  // 2 段目の段 8: heal も N 機の対象（lowestHpRatio）の N を持つ
  Object.assign(effect, count);
  if (hasDuration) Object.assign(effect, parseDuration(v, path));
  if (v.scaling !== undefined) {
    if (v.scaling !== 'flat') fail(`${path}.scaling`, `ammoRefill only takes "flat", got ${JSON.stringify(v.scaling)}`);
    (effect as AmmoRefillEffect).scaling = 'flat';
  }
  // 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: heal だけ（欄の一覧で弾いてある）
  if (v.delayFrames !== undefined) {
    (effect as HealEffect).delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
  }
  // 2 段目の段 12 の PR 4: 欄の一覧で cooldownReduction だけに限ってある
  if (v.condition !== undefined) {
    (effect as CooldownReductionEffect).condition = parseCondition(
      v.condition,
      `${path}.condition`,
      CONDITION_KEYS_OF.cooldownReduction,
    );
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
 * burstGaugeHit・shotPause はどのスロットにも書ける
 */
function parseEffect(v: Json, path: string, slot: SkillSlot): SkillEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 1.2 節）: 読む側の印はどの種類の効果にも書ける（計算は読まない）
  const { reads, ...body } = v;
  const effect: SkillEffect = parseEffectBody(body, path, slot);
  if (reads !== undefined) effect.reads = parseIndirectReads(reads, `${path}.reads`);
  for (const key of ['burstStepMix', 'squad'] as const) {
    if (v[key] === undefined) continue;
    if (
      effect.kind !== 'passive' &&
      effect.kind !== 'timed' &&
      effect.kind !== 'state' &&
      effect.kind !== 'cooldownReduction' &&
      effect.kind !== 'heal' &&
      effect.kind !== 'burstReentry' &&
      effect.kind !== 'burstStepChange' &&
      // 2 段目の段 12（plan/design-skill-stage12.md 2.1 節）: damage は burstStepMix だけ。PR 2（2.4 節）: cycleEvery も
      !((effect.kind === 'damage' || effect.kind === 'cycleEvery') && key === 'burstStepMix')
    ) {
      fail(
        `${path}.${key}`,
        `only allowed in passive, timed, state, cooldownReduction, heal, burstReentry and burstStepChange (burstStepMix also in damage and cycleEvery), found in ${effect.kind}`,
      );
    }
    if (key === 'burstStepMix') effect.burstStepMix = parseBurstStepMixCondition(v[key], `${path}.${key}`);
    // damage・cycleEvery の squad は上で弾いてある
    else if (effect.kind !== 'damage' && effect.kind !== 'cycleEvery')
      effect.squad = parseSquadCondition(v[key], `${path}.${key}`);
  }
  // 防御力無視ダメージ編: 編成に特定のキャラがいる条件・敵の属性の条件（passive・timed・damage。名前の付いた状態の語彙編: 付与も）
  for (const key of ['withCharacter', 'enemyElement'] as const) {
    if (v[key] === undefined) continue;
    // F5（plan/design-heal-vocabulary.md 3.3 節）: withCharacter は heal にも書ける（エマ：TU の S1 の持続回復の周期。ウンファ：TU の有無）
    if (key === 'withCharacter' && effect.kind === 'heal') {
      effect.withCharacter = parseWithCharacterCondition(v[key], `${path}.${key}`);
      continue;
    }
    if (effect.kind !== 'passive' && effect.kind !== 'timed' && effect.kind !== 'state' && effect.kind !== 'damage') {
      fail(
        `${path}.${key}`,
        `only allowed in passive, timed, state and damage (withCharacter also in heal), found in ${effect.kind}`,
      );
    }
    if (key === 'withCharacter') effect.withCharacter = parseWithCharacterCondition(v[key], `${path}.${key}`);
    else effect.enemyElement = oneOf(ELEMENTS, v[key], `${path}.${key}`);
  }
  if (v.claims !== undefined) effect.claims = parseClaimRefs(v.claims, `${path}.claims`);
  return effect;
}

/** 防御力無視ダメージ編: 編成に特定のキャラがいる条件 */
function parseWithCharacterCondition(v: Json, path: string): WithCharacterCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) if (key !== 'rid' && key !== 'present') fail(`${path}.${key}`, 'unknown field');
  const rid = parsePositiveInt(v.rid, `${path}.rid`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { rid, present: v.present };
}

/** 2 段目の段 12: 名前の付いたバースト段階の変更と同じ（か逆の）編成の条件 burstStepMix の効果に、どちらの側かを書く（BurstStepMode） */
function markBurstStepModes(skills: Record<SkillSlot, SkillEntry>, change: BurstStepChangeEffect | undefined): void {
  const mix = change?.burstStepMix;
  if (change?.name === undefined || mix === undefined) return;
  for (const slot of SKILL_SLOTS) {
    for (const e of skills[slot].effects) {
      if (
        e.kind === 'burstStepChange' ||
        !('burstStepMix' in e) ||
        e.burstStepMix?.otherBurstStep !== mix.otherBurstStep
      )
        continue;
      e.burstStepMode = { name: change.name, changed: e.burstStepMix.present === mix.present };
    }
  }
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
  if (
    v.kind === 'cooldownReduction' ||
    v.kind === 'ammoRefill' ||
    v.kind === 'heal' ||
    v.kind === 'burstGauge' ||
    v.kind === 'ammoDecrease'
  ) {
    return parseInstantEffect(v, path, v.kind);
  }
  if (v.kind === 'weaponChange') return parseWeaponChangeEffect(v, path);
  if (v.kind === 'cycle') return parseCycleEffect(v, path);
  if (v.kind === 'cycleEvery') return parseCycleEveryEffect(v, path);
  if (v.kind === 'dot') return parseDotEffect(v, path);
  if (v.kind === 'autoAttack') return parseAutoAttackEffect(v, path);
  if (v.kind === 'burstGaugeHit') return parseBurstGaugeHitEffect(v, path);
  if (v.kind === 'shotPause') return parseShotPauseEffect(v, path);
  if (v.kind === 'burstReentry') return parseBurstReentryEffect(v, path);
  if (v.kind === 'coverHeal') return parseCoverHealEffect(v, path);
  if (v.kind === 'burstStepChange') return parseBurstStepChangeEffect(v, path);
  if (v.kind === 'allyGaugeAdd') return parseAllyGaugeAddEffect(v, path);
  if (v.kind === 'state') return parseStateGrantEffect(v, path);
  if (v.kind === 'removeState') return parseRemoveStateEffect(v, path);
  if (v.kind === 'cancelState') return parseCancelStateEffect(v, path);
  if (v.kind === 'stackChange') return parseStackChangeEffect(v, path);
  if (v.kind === 'counterChange') return parseCounterChangeEffect(v, path);
  fail(
    `${path}.kind`,
    `expected "passive", "burstDamage", "timed", "damage", "cooldownReduction", "ammoRefill", "heal", "burstGauge", "ammoDecrease", "weaponChange", "cycle", "cycleEvery", "dot", "autoAttack", "burstGaugeHit", "shotPause", "burstReentry", "coverHeal", "burstStepChange", "allyGaugeAdd", "state", "removeState", "stackChange" or "counterChange", got ${JSON.stringify(v.kind)}`,
  );
}

/** 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減。対象は自分だけ */
function parseCounterChangeEffect(v: Record<string, Json>, path: string): CounterChangeEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'counter',
        'trigger',
        'target',
        'amount',
        'amountRef',
        'decrease',
        'condition',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const counter = oneOf(COUNTER_IDS, v.counter, `${path}.counter`);
  let trigger: EffectTrigger | EndedTrigger | CounterFullTrigger;
  if (isRecord(v.trigger) && v.trigger.ended !== undefined) {
    for (const key of Object.keys(v.trigger)) if (key !== 'ended') fail(`${path}.trigger.${key}`, 'unknown field');
    trigger = { ended: parseNamedStateId(v.trigger.ended, `${path}.trigger.ended`, 'ally') };
  } else if (isRecord(v.trigger) && v.trigger.counterFull !== undefined) {
    trigger = parseCounterFullTrigger(v.trigger, `${path}.trigger`)!;
  } else {
    // 2 段目の段 16 の PR 1（plan/design-skill-stage16.md 2.1 節）: 時間の周期のきっかけも（千束の超感覚の 2 秒ごとの▼）
    trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  }
  if (v.target !== 'self') fail(`${path}.target`, `expected "self", got ${JSON.stringify(v.target)}`);
  const effect: CounterChangeEffect = { kind: 'counterChange', counter, trigger, target: 'self' };
  if ((v.amount === undefined) === (v.amountRef === undefined))
    fail(path, 'expected exactly one of amount and amountRef');
  if (v.amount !== undefined) effect.amount = parsePositiveInt(v.amount, `${path}.amount`);
  else effect.amountRef = parseRef(v.amountRef, `${path}.amountRef`);
  if (v.decrease !== undefined) {
    if (v.decrease !== true) fail(`${path}.decrease`, `expected true, got ${JSON.stringify(v.decrease)}`);
    effect.decrease = true;
  }
  if (v.condition !== undefined) {
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.counterChange, true);
    validateUsedBurst(effect.condition, trigger, `${path}.condition`);
    // 増減の判定（skills/holders.ts の counterConditionHolds）は状態が付いているかだけを見る。スタック数の条件は使うキャラが無いので拒否する
    if (isStacksCondition(effect.condition.selfState)) {
      fail(`${path}.condition.selfState`, 'a stack count condition is not supported in counterChange (only presence)');
    }
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: スタック量の増加と減少（decrease）。対象は自分だけ。トリガーと条件は解除と
 * 同じ。同じ定義にその状態をスタックで付ける付与が要ること（validateStackChanges）は、定義全体で見る
 */
function parseStackChangeEffect(v: Record<string, Json>, path: string): StackChangeEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'state',
        'trigger',
        'target',
        'amount',
        'amountRef',
        'decrease',
        'closesAtZero',
        'condition',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  if (v.target !== 'self' && v.target !== 'enemy') {
    fail(
      `${path}.target`,
      `expected "self" or "enemy" (changing the stacks of an ally is not supported), got ${JSON.stringify(v.target)}`,
    );
  }
  const target = v.target;
  const state = parseNamedStateId(v.state, `${path}.state`, target === 'enemy' ? 'enemy' : 'ally');
  // 2 段目の段 13 の PR 3: 敵の持続ダメージのスタック量▲は、フルバーストの中の命中を数える（during）
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, false, target === 'enemy');
  const effect: StackChangeEffect = { kind: 'stackChange', state, trigger, target };
  if ((v.amount === undefined) === (v.amountRef === undefined))
    fail(path, 'expected exactly one of amount and amountRef');
  if (v.amount !== undefined) effect.amount = parsePositiveInt(v.amount, `${path}.amount`);
  else effect.amountRef = parseRef(v.amountRef, `${path}.amountRef`);
  // 2 段目の段 3（plan/design-skill-stage3.md 1.5 節）: スタック量の減少
  if (v.decrease !== undefined) {
    if (v.decrease !== true) fail(`${path}.decrease`, `expected true, got ${JSON.stringify(v.decrease)}`);
    effect.decrease = true;
  }
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 6）: 減少で 0 になったら件を閉じる（使用回数を使い切った時）
  if (v.closesAtZero !== undefined) {
    if (v.closesAtZero !== true) fail(`${path}.closesAtZero`, `expected true, got ${JSON.stringify(v.closesAtZero)}`);
    if (!effect.decrease || target !== 'self')
      fail(`${path}.closesAtZero`, 'closesAtZero needs decrease on target "self"');
    effect.closesAtZero = true;
  }
  if (target === 'enemy') {
    if (effect.decrease) fail(`${path}.decrease`, 'decrease is not allowed with target enemy');
    const condition =
      v.condition === undefined ? undefined : parseCondition(v.condition, `${path}.condition`, ['enemyState']);
    if (condition?.enemyState !== state)
      fail(`${path}.condition`, `target enemy needs the condition { enemyState: "${state}" }`);
    effect.condition = condition;
  } else if (v.condition !== undefined) {
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.removeState);
    validateUsedBurst(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除。対象は自分だけ。トリガーの確率のきっかけ・{ applied }・時間の周期の
 * きっかけは書けない（使い手の時に足す）。条件は、自分がその状態なら（selfState）のように、外す状態を見てもよい（閉じるのは f + 1 で、
 * f の判定には付いている）
 */
function parseRemoveStateEffect(v: Record<string, Json>, path: string): RemoveStateEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'state', 'trigger', 'target', 'condition', 'assumes', 'claims'].includes(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, false, false, false, false, false, true);
  if (v.target !== 'self') {
    fail(
      `${path}.target`,
      `expected "self" (removing a state of an ally is not supported), got ${JSON.stringify(v.target)}`,
    );
  }
  const effect: RemoveStateEffect = { kind: 'removeState', state, trigger, target: 'self' };
  if (v.condition !== undefined) {
    // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 「フルバースト状態でなければ」（inFullBurst: false）も書ける
    // （「通常攻撃をした時、フルバースト状態でなければ、フルアクティブ解除」）
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.removeState, true);
    validateUsedBurst(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

/**
 * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 消去。いまは敵の持続ダメージの状態（同じ定義の dot の state）だけで、
 * 対象は敵。解除不可の件も閉じる
 */
function parseCancelStateEffect(v: Record<string, Json>, path: string): CancelStateEffect {
  for (const key of Object.keys(v)) {
    if (!['kind', 'state', 'trigger', 'target', 'assumes', 'claims'].includes(key))
      fail(`${path}.${key}`, 'unknown field');
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'enemy');
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (v.target !== 'enemy') fail(`${path}.target`, `expected "enemy", got ${JSON.stringify(v.target)}`);
  const effect: CancelStateEffect = { kind: 'cancelState', state, trigger, target: 'enemy' };
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

function parseEntry(v: Json, slot: SkillSlot, root: 'skills' | 'treasureSkills' = 'skills'): SkillEntry {
  const path = `${root}.${slot}`;
  if (!isRecord(v)) fail(path, 'expected an object');
  if (v.support !== undefined)
    fail(`${path}.support`, 'support is derived from effects and notes (plan/design-skill-note-kinds.md); remove it');
  if (!Array.isArray(v.effects)) fail(`${path}.effects`, 'expected an array');
  const effects = v.effects.map((e, i) => parseEffect(e, `${path}.effects[${i}]`, slot));
  validateBurstHitTriggers(effects, slot, path);
  let notes: SkillNote[] | undefined;
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes)) fail(`${path}.notes`, 'expected an array');
    notes = v.notes.map((n, i) => parseNote(n, `${path}.notes[${i}]`));
  }
  if (effects.length === 0 && (notes ?? []).length === 0)
    fail(`${path}.notes`, 'a slot without effects needs notes saying why');
  notes?.forEach((n, i) => {
    const index = n.refers === undefined ? undefined : Number(NOTE_REFERS.exec(n.refers)![1]);
    if (index !== undefined && index >= effects.length)
      fail(`${path}.notes[${i}].refers`, `${n.refers} is not an effect of this slot`);
  });
  const entry: SkillEntry = { support: deriveSkillSupport(effects, notes), effects };
  if (v.sequential !== undefined) {
    if (v.sequential !== true) fail(`${path}.sequential`, 'expected true');
    // ルドミラ：ウィンターオーナー編: スキルのスロットにも書ける（plan/design-ludmilla-wo.md 2.4 節）。burst は先頭が burstDamage
    if (slot === 'burst' && effects[0]?.kind !== 'burstDamage') {
      fail(`${path}.sequential`, 'the first effect of a sequential burst must be burstDamage');
    }
    // 回数トリガーの遅れ編の第 2 段: 順番の効果は、射撃の回数の発火の次のフレームから窓を数える（frame/plan.ts）。遅れたヒットとの順は決めていない
    if (effects.some((e) => e.kind === 'damage' && e.delayFrames !== undefined && isShotCountTrigger(e.trigger))) {
      fail(`${path}.sequential`, 'a sequential skill cannot have a delayed shot count damage');
    }
    entry.sequential = true;
  }
  if (notes !== undefined) entry.notes = notes;
  return entry;
}

/**
 * エレグのバースト編（plan/design-elegg.md 8.9 節）: トリガー burstHit は、バーストの倍率ダメージ（burstDamage）のある burst スロットの
 * timed・付与にだけ書ける（ヒットの無いバースト・ほかのスロットでは発火のフレームが決まらない）
 */
function validateBurstHitTriggers(effects: readonly SkillEffect[], slot: SkillSlot, path: string): void {
  effects.forEach((e, i) => {
    if (!('trigger' in e) || e.trigger !== 'burstHit') return;
    const at = `${path}.effects[${i}].trigger`;
    if (e.kind !== 'timed' && e.kind !== 'state')
      fail(at, `burstHit is allowed only in timed and state grants, not in ${e.kind}`);
    if (slot !== 'burst') fail(at, 'burstHit is allowed only in the burst slot');
    if (!effects.some((x) => x.kind === 'burstDamage')) fail(at, 'burstHit needs a burstDamage in the same slot');
  });
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
      if (target === undefined) {
        validateCountTriggersEvery(entries[e.slot]?.effects ?? [], e, path);
        return;
      }
      if (e.every === undefined) fail(`${path}.decreaseRef`, 'decreaseRef is only allowed for a slot without a cycle');
      if (target.trigger.every !== undefined && e.every >= target.trigger.every) {
        fail(`${path}.every`, `must be less than the cycle's every (${target.trigger.every})`);
      }
    });
  }
}

/**
 * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: cycle の無いスロットへの cycleEvery（射撃の回数のきっかけの間隔の変更）。
 * 窓の間隔は解決時に「きっかけの回数 − decreaseRef の値」にするので、対象のスロットの射撃の回数のきっかけは 1 つ以上あり、どれも同じ
 * 回数の種類と同じ N（everyRef か every）で、窓を見るのは damage（gaugeHits なし）・shotPause・counterChange だけ（ほかの効果の数え方は
 * 窓を見ないので、書けば窓の中で食い違う）
 */
function validateCountTriggersEvery(effects: readonly SkillEffect[], e: CycleEveryEffect, path: string): void {
  if (e.decreaseRef === undefined)
    fail(`${path}.every`, `${e.slot} has no cycle (use decreaseRef for its shot counts)`);
  const counted = effects.filter(
    (x) => 'trigger' in x && isShotCountTrigger(x.trigger as EffectTrigger),
  ) as (SkillEffect & { trigger: ShotCountTrigger })[];
  if (counted.length === 0) fail(`${path}.slot`, `${e.slot} has neither a cycle nor a shot count trigger`);
  const first = counted[0]!.trigger;
  for (const x of counted) {
    if (x.kind !== 'damage' && x.kind !== 'shotPause' && x.kind !== 'counterChange')
      fail(`${path}.slot`, `a shot count trigger of ${x.kind} in ${e.slot} does not follow cycleEvery`);
    if (x.kind === 'damage' && x.gaugeHits !== undefined)
      fail(`${path}.slot`, `a damage with gaugeHits in ${e.slot} does not follow cycleEvery`);
    const t = x.trigger;
    if (
      t.count !== first.count ||
      t.every !== first.every ||
      t.everyRef !== first.everyRef ||
      t.stacksRef !== undefined ||
      t.during !== undefined ||
      t.firesDuring !== undefined ||
      t.chance !== undefined ||
      t.chanceRef !== undefined
    ) {
      fail(`${path}.slot`, `the shot count triggers in ${e.slot} must be the same plain { count, every(Ref) }`);
    }
  }
}

/**
 * アニス：スター S2・バースト編: チャージ時間の固定は 1 つの定義に 1 つまで（重なると秒が足し合わされる）。2 段目の段 14 の PR 3
 * （plan/design-skill-stage14.md 2.7 節）: 状態の中身の固定も 1 つまで（状態どうしの勝ち負けを決めていない。timed の固定との兼ね合いは
 * skills/buffs.ts の applyResolvedEffect）
 */
function validateFixedChargeTimeCount(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const effects = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []);
  const timed = effects.filter((e) => e.kind === 'timed' && e.stat === 'fixedChargeTime').length;
  if (timed > 1) fail(root, 'at most one fixedChargeTime effect per definition');
  const contents = effects
    .flatMap((e) => (e.kind === 'state' ? statContentsOf(e.contents) : []))
    .filter((c) => c.stat === 'fixedChargeTime').length;
  if (contents > 1) fail(root, 'at most one fixedChargeTime state content per definition');
}

/** 同じ定義に、状態 state を自分にスタックで付ける付与がある（スタック量の増減・フルスタック・最大スタック数▲の先） */
function hasSelfStackingGrant(entries: Partial<Record<SkillSlot, SkillEntry>>, state: NamedStateId): boolean {
  return SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).some(
    (g) =>
      g.kind === 'state' &&
      g.state === state &&
      g.target === 'self' &&
      (g.maxStacks !== undefined || g.maxStacksRef !== undefined),
  );
}

/**
 * 即着弾に替える使用武器の変更（instantFire）と、コアの命中の回数のきっかけ（coreHit）は同じ定義に持てない。変更後の武器の発のコア命中率は、
 * 2 パス目が的の表の変更後の武器の行（frame/landing.ts の weaponChangeParts）に替えるが、きっかけを数える 1 パス目（frame/firstPass.ts の
 * hitsAt）は基礎の武器の値のままなので、数がずれる。使うキャラが無いので拒否する
 */
function validateInstantFireCoreHits(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const effects = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []);
  if (!effects.some((e) => e.kind === 'weaponChange' && e.instantFire === true)) return;
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (
        'trigger' in e &&
        !isEndedTrigger(e.trigger) &&
        isShotCountTrigger(e.trigger) &&
        e.trigger.count === 'coreHit'
      ) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          'a coreHit count trigger cannot be combined with an instantFire weapon change',
        );
      }
    });
  }
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フルスタックの消費のきっかけは、同じ定義にその状態を自分にスタックで付ける付与が
 * 要り、その状態の付与はどれも射撃の回数のきっかけ（フルスタックになる件が、回復を当てる前のフレームまでに登録される）
 */
function validateFullStackTriggers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const grants = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is StateGrantEffect & ClaimRefs => e.kind === 'state',
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (!('trigger' in e) || !isFullStackTrigger(e.trigger)) return;
      const state = e.trigger.fullStack;
      const own = grants.filter((g) => g.state === state);
      if (!hasSelfStackingGrant(entries, state) || !own.every((g) => isShotCountTrigger(g.trigger))) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          `a full-stack trigger of "${state}" needs grants of the same state on self with maxStacks and shot count triggers in the definition`,
        );
      }
    });
  }
}

/**
 * 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: timed・付与の { applied } は連鎖させない。同じ定義の中で、{ applied } の付与が
 * 付ける状態を、ほかの timed・付与の { applied } が見ない（damage の { applied } は見てよい。ダメージは記録を作らないので閉じる）
 */
function validateAppliedTriggers(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const chained = new Set<NamedStateId>();
  for (const slot of SKILL_SLOTS) {
    for (const e of entries[slot]?.effects ?? [])
      if (e.kind === 'state' && isAppliedTrigger(e.trigger)) chained.add(e.state);
  }
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if ((e.kind !== 'timed' && e.kind !== 'state') || !isAppliedTrigger(e.trigger)) return;
      if (chained.has(e.trigger.applied)) {
        fail(
          `${root}.${slot}.effects[${i}].trigger`,
          `"${e.trigger.applied}" is granted on an applied trigger in the definition (applied triggers do not chain)`,
        );
      }
    });
  }
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: スタック量の増減は、同じ定義にその状態をスタックで付ける付与（対象は自分）が
 * 要る（上限・維持・中身は付与のもの）
 */
function validateStackChanges(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'stackChange' || e.target === 'enemy') return;
      if (!hasSelfStackingGrant(entries, e.state)) {
        fail(
          `${root}.${slot}.effects[${i}]`,
          `stackChange of "${e.state}" needs a grant of the same state on self with maxStacks in the definition`,
        );
      }
    });
  }
}

/**
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 状態の中身の「〈状態〉の最大スタック数 N▲」は、同じ定義にその状態を自分に
 * スタックで付ける付与が要る（足す先の上限）
 */
function validateStateContentKinds(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'state') return;
      e.contents?.forEach((item, j) => {
        if (isStatContent(item)) return;
        const target = item.maxStacksUp.state;
        if (!hasSelfStackingGrant(entries, target))
          fail(
            `${root}.${slot}.effects[${i}].contents[${j}]`,
            `maxStacksUp of "${target}" needs a grant of the same state on self with maxStacks in the definition`,
          );
      });
    });
  }
}

/**
 * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.4・2.5 節）: 消去（cancelState）と、PR 3: 敵のスタック量▲（stackChange の target
 * enemy）は、同じ定義の firstTick halfAfterLatest の dot の state を指す（消去で tick を止めるのは、付けるたびに刻みを付け直す形だけ。frame/dot.ts の latestDotTicks）。dot の stacksFrom の
 * enemyState も、同じ定義の dot の state を指す
 */
function validateDotStateRefs(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const dots = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is DotEffect & ClaimRefs => e.kind === 'dot' && e.state !== undefined,
  );
  const stackedEnemyGrants = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).flatMap((e) =>
    e.kind === 'state' && e.enemy === true && (e.maxStacks !== undefined || e.maxStacksRef !== undefined)
      ? [e.state]
      : [],
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      const onDot = e.kind === 'cancelState' || (e.kind === 'stackChange' && e.target === 'enemy');
      if (onDot && !dots.some((d) => d.state === e.state && d.firstTick === 'halfAfterLatest'))
        fail(
          `${root}.${slot}.effects[${i}]`,
          `${e.kind} of "${e.state}" needs a dot of the same state with firstTick halfAfterLatest in the definition`,
        );
      // マスト編（plan/design-mast.md 2.3 節）: 元は、同じ定義の dot の状態か、敵にスタックで付く状態の付与（海風）
      const from = e.kind === 'dot' ? e.stacksFrom?.enemyState : undefined;
      if (from !== undefined && !dots.some((d) => d.state === from) && !stackedEnemyGrants.includes(from))
        fail(
          `${root}.${slot}.effects[${i}].stacksFrom`,
          `stacksFrom needs a dot of the state "${from}", or a grant of it on the enemy with stacks, in the definition`,
        );
    });
  }
}

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: while の状態は、同じ定義に、その状態を自分に付けうる時間で変わる付与（対象が
 * self か allies）が要る。スタックの条件（stacks・stacksRef）なら、その付与にスタックの上限が要る。静的な状態は常時の効果で書く
 */
function validateWhileEffects(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const grants = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is StateGrantEffect & ClaimRefs => e.kind === 'state',
  );
  const counterChanges = SKILL_SLOTS.flatMap((slot) => entries[slot]?.effects ?? []).filter(
    (e): e is CounterChangeEffect & ClaimRefs => e.kind === 'counterChange',
  );
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'passive' || e.while === undefined) return;
      // 2 段目の段 11 の PR 2: カウンタの while は、同じ定義にそのカウンタを増やす counterChange が要る
      if ('selfCounter' in e.while) {
        const { counter } = e.while.selfCounter;
        if (!counterChanges.some((c) => c.counter === counter && c.decrease !== true))
          fail(
            `${root}.${slot}.effects[${i}].while`,
            `while on "${counter}" needs a counterChange that increases it in the definition`,
          );
        return;
      }
      const { state, stacks, stacksRef } = e.while.selfState;
      const own = grants.filter(
        (g) => stateMatches(state, g.state) && !isStaticStateGrant(g) && (g.target === 'self' || g.target === 'allies'),
      );
      const stacked = stacks !== undefined || stacksRef !== undefined;
      const ok = own.some((g) => !stacked || g.maxStacks !== undefined || g.maxStacksRef !== undefined);
      if (!ok) {
        fail(
          `${root}.${slot}.effects[${i}].while`,
          `while on "${state}" needs a grant of the same state on self (target self or allies, not static${stacked ? ', with maxStacks' : ''}) in the definition`,
        );
      }
    });
  }
}

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.2・5.6 節）: 同じ定義の同じ状態の付与どうしの規則。中身（contents）を
 * 持つのは 1 つだけ、維持の形（秒・発数・出来事）とスタックの有無は同じ（即値は値も。Lv で決まる値は解決のときに見る）。
 * 中身を持たない付与も、中身の項目と合わせた timed として今の規則を通す（状態の窓を共有するので、stat ごとの規則がどの付与にも効く）
 */
function validateStateGrants(entries: Partial<Record<SkillSlot, SkillEntry>>, root: string): void {
  const byState = new Map<NamedStateId, { effect: StateGrantEffect; path: string }[]>();
  for (const slot of SKILL_SLOTS) {
    entries[slot]?.effects.forEach((e, i) => {
      if (e.kind !== 'state') return;
      byState.set(e.state, [...(byState.get(e.state) ?? []), { effect: e, path: `${root}.${slot}.effects[${i}]` }]);
    });
  }
  for (const [state, grants] of byState) {
    const bearers = grants.filter((g) => g.effect.contents !== undefined);
    // 敵に付く状態は、中身を読む側がまだ無いので、どれかの付与が中身を持つ（2026-10-29 のキャラの編（plan/design-new-chars-1029.md
    // 9 節）: 同じ状態のほかの付与は中身を共有する。マリアン：クイーンの S1 の弱点露出は、槍とバースト使用時の 2 つで付く）
    const enemyGrant = grants.find((g) => g.effect.enemy === true);
    if (enemyGrant !== undefined && bearers.length === 0) {
      fail(`${enemyGrant.path}.contents`, 'a grant on the enemy needs contents (no reader of the state yet)');
    }
    if (bearers.length > 1) {
      fail(`${bearers[1]!.path}.contents`, `only one grant of "${state}" in a definition may have contents`);
    }
    const first = grants[0]!;
    for (const g of grants.slice(1)) {
      // 2 段目の段 1（plan/design-skill-stage1.md 1.4 節）: 静的な付与の形と時間で変わる付与が混ざった状態は静的にしない
      // （staticStatesOf）。解除不可は件の列ごとに見るので、同じ状態の付与で揃える
      if ((g.effect.undispellable === true) !== (first.effect.undispellable === true)) {
        fail(g.path, `grants of "${state}" need the same undispellable`);
      }
      if (durationFormOf(g.effect) !== durationFormOf(first.effect)) {
        fail(g.path, `grants of "${state}" need the same duration (${durationFormOf(first.effect)})`);
      }
      if (stackFormOf(g.effect) !== stackFormOf(first.effect)) {
        fail(g.path, `grants of "${state}" need the same max stacks (${stackFormOf(first.effect)})`);
      }
    }
    const bearer = bearers[0];
    if (bearer === undefined) continue;
    for (const g of grants) {
      if (g === bearer) continue;
      bearer.effect.contents!.forEach((item, j) => {
        // 2 段目の段 14 の PR 3: 最大スタック数▲の項目は timed の規則を持たない
        if (!isStatContent(item)) return;
        parseTimedEffect(contentAsTimed(g.effect, item), `${g.path}（${bearer.path}.contents[${j}] と合わせて）`);
      });
    }
  }
}

/** 名前の付いた状態の語彙編: 付与の維持の形（同じ状態の付与どうしで比べる。即値は値も） */
function durationFormOf(e: StateGrantEffect): string {
  if (e.durationUntil !== undefined) return `until ${e.durationUntil}`;
  if (e.durationShots !== undefined) return `shots ${e.durationShots}`;
  if (e.durationShotsRef !== undefined) return 'shots (ref)';
  if (e.durationSeconds !== undefined) return `seconds ${e.durationSeconds}`;
  return 'seconds (ref)';
}

/** 名前の付いた状態の語彙編: 付与のスタックの形（同じ状態の付与どうしで比べる。即値は値も） */
function stackFormOf(e: StateGrantEffect): string {
  if (e.maxStacks !== undefined) return `${e.maxStacks}`;
  return e.maxStacksRef !== undefined ? 'ref' : 'none';
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
  // アニス：スター編: バースト再突入は 1 つの定義に 1 つまで（次の段階は 1 つしか持てない）。2 段目の段 12: バースト段階の変更も
  // （持つ枠の段は 1 つしか持てない）
  const effects = SKILL_SLOTS.flatMap((slot) => skills[slot]!.effects);
  for (const kind of ['burstReentry', 'burstStepChange', 'allyGaugeAdd'] as const) {
    if (effects.filter((e) => e.kind === kind).length > 1) fail('skills', `at most one ${kind} effect per definition`);
  }
  markBurstStepModes(
    skills,
    effects.find((e): e is BurstStepChangeEffect & ClaimRefs => e.kind === 'burstStepChange'),
  );
  validateCycles(skills, 'skills');
  validateFixedChargeTimeCount(skills, 'skills');
  validateInstantFireCoreHits(skills, 'skills');
  validateStateGrants(skills, 'skills');
  validateStackChanges(skills, 'skills');
  validateStateContentKinds(skills, 'skills');
  validateFullStackTriggers(skills, 'skills');
  validateAppliedTriggers(skills, 'skills');
  validateWhileEffects(skills, 'skills');
  validateDotStateRefs(skills, 'skills');
  const def: SkillDefinition = { formatVersion: 1, resourceId: raw.resourceId, checkedAt: raw.checkedAt, skills };
  // 名前の付いた状態の語彙編: ペルソナ編の states は静的な付与（kind: 'state'）に置き換えた
  if (raw.states !== undefined) {
    fail('states', 'states was replaced by a static state grant (kind "state". plan/design-named-state.md)');
  }
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
    validateInstantFireCoreHits({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateStateGrants({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateStackChanges({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateStateContentKinds({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateFullStackTriggers({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateAppliedTriggers({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateWhileEffects({ ...skills, ...treasureSkills }, 'treasureSkills');
    validateDotStateRefs({ ...skills, ...treasureSkills }, 'treasureSkills');
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

/** 対応状況の索引（生成物。skills/support.ts）。不正なら Error */
export function parseSkillSupportIndex(raw: Json): SkillSupportIndex {
  if (!isRecord(raw)) fail('support', 'expected an object');
  if (raw.formatVersion !== 1) fail('support.formatVersion', `expected 1, got ${JSON.stringify(raw.formatVersion)}`);
  const ids = raw.fullySupported;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    fail('support.fullySupported', 'expected an array of positive integers');
  }
  return { formatVersion: 1, fullySupported: ids as number[] };
}
