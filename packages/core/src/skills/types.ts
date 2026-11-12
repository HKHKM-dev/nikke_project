// スキル定義（DSL）の型。定義は packages/core/data/skills/{resourceId}.json に手書きし、数値は CharacterData.skills の values を ref で参照する。
// 効果の種類は SkillEffect、定義の全体は SkillDefinition。書き方の手順は plan/skills-guide.md。
// 読み込みの検査は skills/parse/ に効果の種類ごとに置く（入口の parseSkillDefinition はこのファイルが公開する）。
// 効果と notes には、根拠の結論の ID（claims）を書ける（plan/skills-guide.md 3 節。実在の検査は records/skills.ts）。
import type { Element, LocalizedText, NikkeClass, SkillSlot, WeaponType } from '../types.ts';
import type { CounterId } from './counters.ts';
import type { NamedStateId } from './states.ts';
import type { SummonId } from './summons.ts';

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
 * レッドフード編（plan/design-red-hood.md 2.4 節）: chargeSpeedOverflow = 「チャージ速度 100% を超えた場合、超過した値をチャージダメージに
 * 変換」「超過した値の X% のチャージダメージ▲」（比率。passive の self だけ）。フルチャージの発で、その発のチャージ速度▲の和 Σ（比率の和。
 * 発動者基準のチャージ時間▼は入れない。未確定）の 1 を超えた分 × X をチャージダメージ▲（chargeDamage）に足す（skills/buffs.ts の
 * applyChargeBuffs）
 * エード：エージェントバニー編（plan/design-agent-bunny.md 2.1・2.3 節）:
 * minEffectiveRange = 適正最小射程距離▲（比率）。状態だけの stat（STATE_STATS）。適正射程距離（bonusRange）の下端を 下端 × (1 − Σ) に
 * 縮める（C-1043。式は R1 の仮説 C-1033）。条件が自動の枠の距離ボーナス（frame/landing.ts の distanceBonusAt）と、条件 inEffectiveRange が読む。射撃は変えない。
 * pierce = 貫通特化。値を持たないフラグ（ref を書かない）。それ自体は与ダメージを変えず、pierceDamage の乗る発にする。
 * pierceDamage = 貫通ダメージ▲（比率）。貫通特化（pierce）の効いている枠の通常攻撃にだけ、攻撃ダメージ▲と同じ和に足す（P1。C-1031）。
 * 倍率ダメージ・バーストのダメージには足さない（確かめていない）
 * ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.1・2.2 節）:
 * pelletCount = ペレット数 N 個▲（scaling 'flat'。値は個の数）。singlePellet = 「ペレットの数を 1 個に固定」。値を持たないフラグ
 * （ref を書かない）。効いていれば 1 発のペレットは 1 個で、▲より勝つ（C-1077）。どちらも timed の self だけ（PELLET_STATS）
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
  | 'reloadRatio'
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
  | 'spinUpSpeed'
  | 'chargeSpeedOverflow'
  | 'accumulateRatio'
  | 'minEffectiveRange'
  | 'pierce'
  | 'pierceDamage'
  | 'pelletCount'
  | 'singlePellet';
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
  // グレイブ編（plan/design-grave.md 2.3 節）: リロード比率（比率）。分割リロードの 1 段で込める割合（CDN の reloadBullet）に (1 + Σ) を掛ける
  // （▼は decrease で負の値。V-0735）。分割リロードでない武器には効かない（frame/firing.ts）。射撃に効く
  'reloadRatio',
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
  // 間は HP の割合を下げ（段 6 の論点 8）、自分の HP の割合のきっかけ（selfHpAtMostRef。マスト編・エード編）と、timed の条件 selfHp の
  // atMost（紅蓮編）が読む。HP の割合を時間で読む編（plan/design-hp-ratio-readers.md）: passive の条件 selfHp（割合が動きうる枠）と対象の
  // lowestHpRatio（回復の発火の時）も読む
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
  // レッドフード編（plan/design-red-hood.md 2.4 節）: チャージ速度の超過分のチャージダメージへの変換（passive の self だけ）
  'chargeSpeedOverflow',
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.3 節）: 蓄積爆破のダメージ蓄積割合▲（比率）。damage の accumulate
  // （capOrExpire）の割合（ratioRef）に、溜める発の時の値を足す（C-0903）。与ダメージの式は読まない
  'accumulateRatio',
  // エード：エージェントバニー編（plan/design-agent-bunny.md 2.1・2.3 節）: 適正最小射程距離▲・貫通特化（フラグ）・貫通ダメージ▲
  'minEffectiveRange',
  'pierce',
  'pierceDamage',
  // ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.1・2.2 節）: ペレット数▲（個。flat）・ペレットの数を 1 個に固定（フラグ）
  'pelletCount',
  'singlePellet',
] as const satisfies readonly BuffStat[];

/**
 * Stage 10: 射撃に効く stat（射手の実効値を変える）。Stage 11 モダニアで装弾数無限、アニス：スター編でチャージ時間の固定、2 段目の段 9 の
 * PR 2 で攻撃速度を足した
 */
export const FIRING_STATS = [
  'maxAmmo',
  'reloadSpeed',
  'reloadRatio',
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
export const STATE_STATS = ['hitRate', 'minEffectiveRange'] as const satisfies readonly BuffStat[];

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
  'pierce',
  'singlePellet',
] as const satisfies readonly BuffStat[];

/**
 * ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.1・2.2 節）: 1 発のペレットの数を変える stat。timed の self だけに書ける。
 * 1 パス目（frame/firstPass.ts）が窓を追い、ペレットの命中の量（pelletHit）とゲージを実効のペレットの数で数える。1 発の総ダメージは
 * 変えない（固定は 1 個に総ダメージが乗り C-1074、▲は総ダメージをペレットで分ける C-1076）。区間の buffs にも入り、照合の 1 ペレットの値
 * （records/observations.ts の hitDamage）が割る数を決める
 */
export const PELLET_STATS = ['pelletCount', 'singlePellet'] as const satisfies readonly BuffStat[];

export function isPelletStat(stat: BuffStat | 'weapon'): boolean {
  return (PELLET_STATS as readonly string[]).includes(stat);
}

/** 2 段目の段 12 の PR 2: passive に書けるフラグの stat（ref を書かない。値 1） */
export const PASSIVE_FLAG_STATS = ['elementAdvantage', 'pierce'] as const satisfies readonly BuffStat[];

/**
 * passive のフラグのうち、編成の段で静的に読むもの（while を書けない）。有利コードのダメージ適用は composition.ts が常時の値から読む。
 * 貫通特化（エード：エージェントバニー編）は区間の値で読むので while を書ける
 */
export const STATIC_PASSIVE_FLAG_STATS = [
  'elementAdvantage',
] as const satisfies readonly (typeof PASSIVE_FLAG_STATS)[number][];

export function isPassiveFlagStat(stat: BuffStat): boolean {
  return (PASSIVE_FLAG_STATS as readonly string[]).includes(stat);
}

export function isFlagStat(stat: BuffStat): boolean {
  return (FLAG_STATS as readonly string[]).includes(stat);
}

/**
 * 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 敵が持つ stat か（敵の受けるダメージ▲と、2 段目の段 2 の敵の防御力▼）。
 * 値は敵が受ける全ダメージに効くので、味方の各枠の区間の値に写す（skills/holders.ts の isEnemyEffect）
 */
export const ENEMY_HELD_STATS = ['damageTaken', 'enemyDefenseDown'] as const;

export function isEnemyHeldStat(stat: string): boolean {
  return (ENEMY_HELD_STATS as readonly string[]).includes(stat);
}

/**
 * 課題 2-64（plan/design-debuff-removal-timed.md 2.1 節）: 味方に付く▼（decrease で、敵が持つ stat でない）か。timed のこれはデバフ解除で
 * 外れる（定義の検証・skills/holders.ts の fireRemoveDebuff・最小構成の読む側の印）
 */
export function isAllyDecrease(effect: { stat: string; decrease?: true }): boolean {
  return effect.decrease === true && !isEnemyHeldStat(effect.stat);
}

/**
 * どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算、
 * flat = 実数の固定加算（Stage 10。stat が maxAmmo のときだけ。値は発数で 100 で割らない）、
 * casterChargeTime = 発動者の基礎チャージ時間 × 比率の秒数を対象のチャージ時間から引く（Stage 11 アリス編。stat が chargeSpeed のときだけ。
 * 「スキル発動者基準でチャージ速度 X%▲」。録画 0042 でアドミ（1 秒）が 0.175 秒縮んだ。plan/design-stage11.md 27 節）、
 * casterFinalMaxHp = 発動者の最終最大HP × 比率を攻撃力に固定加算する（2 段目の段 6。stat が attack のときだけ。「スキル発動者の
 * 最終最大HP の X% 分の攻撃力▲」。plan/design-skill-stage6.md 1.3 節。録画 0121 のラプラス：アルティメットヒーロー）、
 * casterDefence = 発動者のバフ前防御力 × 比率を敵の防御力から引く（マスト編。stat が enemyDefenseDown のときだけ。「スキル発動者基準で
 * 防御力 X%▼」。plan/design-mast.md 2.2 節）、
 * copyTopAttack = バフ前攻撃力が最も高い味方 1 機（自分も候補。空枠は除く）のバフ前攻撃力 × 比率の固定加算（2 段目の段 19 の PR 2。
 * stat が attack のときだけ。「攻撃力が最も高い味方 1 機の攻撃力のコピー X%」。順位も写す値も「最終」の付かない攻撃力で読む。V-0627）、
 * casterMaxHp = 発動者のバフ前の最大HP × 比率を対象の最大HP に足す（HP の割合を時間で読む編。stat が maxHp・maxHpOnly の timed だけ。
 * 「スキル発動者基準で最大HP（のみ）X%▲」。対象の比率は X × 発動者のバフ前の最大HP ÷ 対象のバフ前の最大HP で、件の列を対象の枠ごとに
 * 作る時に直す（skills/holders.ts）。plan/design-hp-ratio-readers.md 9 節の論点 8。V-0730）
 */
export type BuffScaling =
  | 'ratio'
  | 'casterAttack'
  | 'flat'
  | 'casterChargeTime'
  | 'casterFinalMaxHp'
  | 'casterDefence'
  | 'copyTopAttack'
  | 'casterMaxHp';
export const BUFF_SCALINGS = [
  'ratio',
  'casterAttack',
  'flat',
  'casterChargeTime',
  'casterFinalMaxHp',
  'casterDefence',
  'copyTopAttack',
  'casterMaxHp',
] as const satisfies readonly BuffScaling[];

/** 攻撃力に実数を固定加算するスケーリング（比率で足さない。stat は attack だけ） */
export function isFixedAttackScaling(scaling: BuffScaling | undefined): boolean {
  return scaling === 'casterAttack' || scaling === 'copyTopAttack' || scaling === 'casterFinalMaxHp';
}

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
export type BuffTarget =
  'self' | 'allies' | 'burstUsers' | 'topAttack' | 'longestChargeTime' | 'lowestHpRatio' | 'appliedCaster';
export const BUFF_TARGETS = [
  'self',
  'allies',
  'burstUsers',
  'topAttack',
  'longestChargeTime',
  'lowestHpRatio',
  'appliedCaster',
] as const satisfies readonly BuffTarget[];

/** 対象の語彙編: N 機を選ぶ対象（targetCount / targetCountRef を持つ）。段 17 の PR 2: coverHeal の lowestCoverHp も */
export function isCountedTarget(
  target: BuffTarget | CoverHealEffect['target'] | RemoveDebuffEffect['target'],
): boolean {
  return (
    target === 'topAttack' ||
    target === 'longestChargeTime' ||
    target === 'lowestHpRatio' ||
    target === 'lowestCoverHp' ||
    target === 'debuffedRandom'
  );
}

/**
 * 対象の語彙編（plan/design-target-vocab.md 2.1 節）: 「自分を除く」。topAttack の順位から発動者の枠を外す。
 * always = 外したまま、unlessShort = 外して N に足りなければ自分を足す（「対象が足りない場合、自分も対象となる」）
 */
export type ExcludeSelf = 'always' | 'unlessShort';
export const EXCLUDE_SELF = ['always', 'unlessShort'] as const satisfies readonly ExcludeSelf[];

/** 2 段目の段 7: 防御力の比べの対象の絞り込み。lowerThanSelf = 自分と、自分より最終防御力が低い味方 */
export type TargetDefense = 'lowerThanSelf';
export const TARGET_DEFENSES = ['lowerThanSelf'] as const satisfies readonly TargetDefense[];

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
export const INDIRECT_PATHS = ['hp', 'defense', 'barrier', 'decoy', 'cover', 'pierce', 'pellet', 'debuff'] as const;
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
  /** 課題 2-59: デバフ解除が動かし、デバフの状態（ほろ酔い）を付ける効果が読む（plan/design-indirect-notes.md の経過） */
  debuff: { ja: 'デバフ', en: 'Debuff' },
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
  during?: ShotCountWindow | StateCountWindow;
  /**
   * 同 2.1 節: during が 'fullBurst' のときは必須。fullBurstStart = フルバーストが始まるフレームで 0 に戻す、never = 戻さない。
   * during が { state } のときは書かない（状態が付くたびに 0 から数え直す）
   */
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
/**
 * グレイブ編（plan/design-grave.md 2.4 節）: 自分のその状態が付いている間の発だけを数え、その状態が付くたびに 0 から数え直す窓
 * （「〈状態〉なら、通常攻撃が命中した時…攻撃命中回数別の効果」）。状態の付与にだけ書ける。見る状態は、同じ定義の自分に付ける付与の
 * あるもの。発火は 1 パス目の件の一覧が追う（skills/holders.ts の firesOf）
 */
export type StateCountWindow = { state: NamedStateId };

/** グレイブ編: 回数トリガーの数える窓が自分の状態か */
export function isStateCountWindow(w: ShotCountWindow | StateCountWindow | undefined): w is StateCountWindow {
  return typeof w === 'object' && w !== null && 'state' in w;
}
export const SHOT_COUNT_WINDOWS = ['fullBurst'] as const satisfies readonly ShotCountWindow[];
/** 2 段目の段 11: 回数トリガーの発火の窓（firesDuring）。数える窓（during）はフルバーストだけ */
export type FiringWindow = ShotCountWindow | 'weaponChange';
export const FIRING_WINDOWS = ['fullBurst', 'weaponChange'] as const satisfies readonly FiringWindow[];
export type ShotCountReset = 'fullBurstStart' | 'never';
export const SHOT_COUNT_RESETS = ['fullBurstStart', 'never'] as const satisfies readonly ShotCountReset[];

/**
 * Stage 8: 発動の回数の段階（「使用回数別の効果」「開始回数別の効果」、下位効果のスタック適用）。
 * atLeast 回目以降の発動のたびに発火する。burstUse = 自分がバーストスキルを使った回数、fullBurstStart = フルバーストの回数（編成全体）。
 * メイド編（plan/design-maids.md 2.3 節）: fullBurstEnd = フルバーストタイムが終了した回数（編成全体。終わりのフレームで発火する）。
 * 回数は戦闘中ずっと数え、リセットしない（resetAfterSeconds を書いたものを除く）。
 */
export type EventCountKind = 'burstUse' | 'fullBurstStart' | 'fullBurstEnd';
export const EVENT_COUNT_KINDS = [
  'burstUse',
  'fullBurstStart',
  'fullBurstEnd',
] as const satisfies readonly EventCountKind[];

export type EventCountTrigger = {
  count: EventCountKind;
  /** 何回目以降か（1 始まりの即値。説明文の「1 回 / 2 回 / 3 回」） */
  atLeast: number;
  /**
   * ディーゼル：ウィンタースイーツ編（plan/design-diesel-ws.md 2.1 節）: 何回目までか（1 始まりの即値。atLeast 以上）。
   * 「初めて〈出来事〉が発動した時」は atLeast: 1・atMost: 1。回数は条件と関係なく数える（maxFires とは別物）。省略は上限なし
   */
  atMost?: number;
  /**
   * V-0631（イサベルのターゲットマーキング）: 前の発動から N 秒（ゲーム内の秒）より後に次の発動が来たら、その発動から数え直す
   * （その発動が 1 回目になる）。burstUse にだけ書ける
   */
  resetAfterSeconds?: number;
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
   * （「戦闘開始時、… 再発動周期 N 秒」）。timed にだけ書ける（1 パス目で窓を追う stat は、戦闘開始時と同じくループの前に登録する）。
   * A2 の B モード編（plan/design-hp-down-interval.md 2.1 節。V-0729）: since のある currentHpDown にも書け、状態の付いたフレームにも発火する
   */
  atStart?: true;
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 10.2 節の a）: 端数を持ち越す。k 回目を k × everySeconds 秒に達した最初の
   * フレームにする（省略は発動のたびに数え直す。C-0502）。「再発動周期」のマリアン：クイーンの S1 の槍（V-0538）
   */
  carry?: true;
  /**
   * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2）: 周期の起点を、その状態が自分に付いた最後のフレーム（付いた記録）にする。
   * k 回目は起点から k × everySeconds 秒に達した最初のフレーム（carry と同じ数え方）で、その状態が自分に付いている間だけ発火する（外れたら止まり、
   * 次に付いた時は数え直す）。counterChange にだけ書ける（変身の間 0.2 秒ごとのバッテリーの▼）。
   * A2 の B モード編（plan/design-hp-down-interval.md 2.1 節）: currentHpDown にも書ける（「現在のHP X%▼」「1 秒間隔」。B モードの間 1 秒ごと）
   */
  since?: AppliedTrigger;
  /**
   * 魔術師のカード編（plan/design-arcana-magician.md 2.2 節）: この周期は、説明文にきっかけの無いアクティブ型のスキルのクールタイム
   * （録画で読んだ周期）。状態の中身の skillCooldownDown が縮めるのは、この印のある周期だけ。damage と burstGaugeHit にだけ書け、
   * carry・atStart・since・periodShorten・gaugePerHit とは組まない。同じスロットの印のある周期は同じ秒
   */
  cooldown?: true;
};

/**
 * アインのニアフェザー編（plan/design-ein-near-feather.md 1.2 節）: 召喚の攻撃。自分のその召喚（展開 kind: 'summon'）の機数で間隔が
 * 決まる周期。進み（0〜1）を、いまの機数の間隔（intervalSeconds。機数 → ゲームの秒）の逆数の速さでフレームごとに積み、1 に届いた
 * フレームで発火する（余りは持ち越す。機数が変わっても進みは保つ）。展開のたびに進みを 0 に戻し、展開から startDelaySeconds の間は
 * 進めない。機数が 0 なら進めない。1 パス目（frame/firstPass.ts）が機数と進みを追って発火のフレームを決める。damage にだけ書ける
 */
export type SummonAttackTrigger = {
  summon: SummonId;
  intervalSeconds: Readonly<Record<number, number>>;
  startDelaySeconds: number;
};

export function isSummonAttackTrigger(t: unknown): t is SummonAttackTrigger {
  return typeof t === 'object' && t !== null && 'summon' in t;
}

/**
 * ペルソナ編（plan/design-persona.md 3.3 節）: 「〈名前〉が適用された時」。名前の付いた状態の語彙編（plan/design-named-state.md 5.4 節）:
 * 編成のどの枠の付与でも、その状態がこの効果を持つ枠に付いたフレーム（状態の窓の始まり。付き直しでも 1 回）で発火する。
 * damage と、2 段目の段 4（plan/design-skill-stage4.md 1.1 節）から timed・状態の付与に書ける（timed・付与は連鎖させない）。
 * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 3・4）: counterChange と dot にも書ける（その状態の、自分に付ける付与が同じ定義に
 * あること。validateOwnStateTriggers）
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
 * timed にだけ書ける。回復で現在の HP が戻る分は扱わない。
 * エード編（plan/design-ade.md 2.1 節）: 「自分の HP が X% 以下の時」「N 秒間維持」は、同じきっかけを秒の維持（durationRef・durationSeconds）と組む（下がったフレームに
 * 1 回発火して N 秒。閾値以下のまま続く間は発火しない。C-1025）
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
  | CounterFullTrigger
  // アインのニアフェザー編: { summon }（damage だけが受ける。parseSummonAttackTrigger）
  | SummonAttackTrigger
  // グレイブ編（plan/design-grave.md 2.1 節）: { ended }（counterChange・ammoDecrease・状態の付与だけが受ける）
  | EndedTrigger;

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

/**
 * Stage 11: 発火の文脈 burstUsers を持つきっかけ（フルバーストの開始・終了）なら、その出来事。ディーゼル：ウィンタースイーツ編
 * （plan/design-diesel-ws.md 2.2 節）: その出来事の回数のきっかけ（{ count: 'fullBurstStart' | 'fullBurstEnd' }）も。ほかは undefined。
 * 解決済みのきっかけ（skills/resolve.ts）も同じ形なので、読み込みと発火の両方が使う
 */
export function burstUsersEventOf(trigger: object | string): (typeof BURST_USERS_TRIGGERS)[number] | undefined {
  const kind =
    typeof trigger === 'object' && trigger !== null && isEventCountTrigger(trigger as EffectTrigger)
      ? (trigger as EventCountTrigger).count
      : trigger;
  return (BURST_USERS_TRIGGERS as readonly unknown[]).includes(kind)
    ? (kind as (typeof BURST_USERS_TRIGGERS)[number])
    : undefined;
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
    /**
     * メイド編（plan/design-maids.md 2.1 節）: 「X% × 〈状態〉のスタック数」。値に、発火のフレームの自分のその状態のスタック数（発火の
     * フレームより前に付いた件。条件 selfState と同じ見え方。damage の perCount と同じ）を掛ける。0 なら出さない。掛けた値は付いた時に
     * 決まり、維持の間は変えない。出来事のきっかけ（burstUse・バースト N 段階突入時・フルバーストの始まりと終わり）だけに書け、スタック・
     * 確率・発数や出来事の維持・amplifies とは組まない
     */
    perCount?: { state: NamedStateId };
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
     * 1 パス目のループの中で窓を追う stat（攻撃力・射撃に効く stat・状態の stat）と、スタック・条件・順位の対象には書けない。
     * 例外は、1 パス目の件の列が持ち主の発で窓を閉じる stat（チャージ速度、ドロシー：セレンディピティ編の命中率▲・貫通特化・
     * ペレットの数の固定。plan/design-dorothy-serendipity.md 2.3 節）
     */
    durationShots?: number;
    /** ヘルム編: 「N 発間維持」の N の description_value_NN */
    durationShotsRef?: number;
    /**
     * キラーワイフ編（plan/design-killer-wife.md 2.2 節）: 「〈状態〉の対象に命中させた味方に」。発火のフレームから withinRef（秒の
     * description_value_NN。対象に付く状態の維持）の間に、対象の枠（持ち主）が撃った最初の通常攻撃の次のフレームから、維持の秒数だけ付く。
     * その発自身には乗らず、同じ発火の後の命中では付き直さない（V-0717）。命中は持ち主の射撃のフレームで数える（外れと的の部位は見ない）。
     * 秒の維持（durationRef・durationSeconds）とだけ組み、スタック・条件・発数や出来事の維持・強化・確率・遅れ・perCount とは組まない
     */
    holderHit?: { withinRef: number };
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
 * 追う stat にも書ける。timed の対象が自分のときだけ（スタックには書けない）。グレイブ編（plan/design-grave.md 2.2 節）: 自分に付く、スタックしない
 * 状態の付与にも書ける（「過熱I：…」「最大装弾リロード完了時に解除」）。
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
 * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2）: 状態の付与の維持の「解除条件：〈カウンタ〉が 0 になった時」。自分のそのカウンタが
 * 0 に届いたフレームの次のフレームで件を閉じる（それまでは戦闘の終わりまで。解除不可の印があっても閉じる）。自分にだけ付き、スタックせず、
 * きっかけは同じカウンタの { counterFull } の付与にだけ書ける（アークレンジャー・ブラックの変身）
 */
export type CounterEmptyUntil = { counterEmpty: CounterId };

/**
 * A2 の B モード編（plan/design-hp-down-interval.md 2.2 節）: 状態の付与の維持の「自分の HP が X% 以下の時、〈状態〉解除」。X は % の
 * description_value_NN。付いたフレームの次のフレームから、持ち主（自分）の HP の割合（skills/holders.ts の selfHpRatioAt。現在の HP▼ は
 * 発火の次のフレームから読む）が閾値以下と読めたフレーム g に、件を g + 1 で閉じる（g には付いている。解除 removeState と同じ）。それまでは
 * 戦闘の終わりまで。発火のフレームにすでに閾値以下なら付かない（V-0729）。自分にだけ付き、スタックせず、条件を持たない
 */
export type SelfHpAtMostUntil = SelfHpAtMostTrigger;

/** 状態の付与の維持の終わり（timed と同じ出来事と、オブジェクトの形の解除条件） */
export type GrantDurationUntil = DurationUntil | CounterEmptyUntil | SelfHpAtMostUntil | StateEndUntil;

/**
 * 同（論点 4）: dot の「〈状態〉解除まで」。きっかけ { applied } の状態の、自分の件の終わり（付いたフレームを含む件）より後の tick を出さない
 * （それまでは戦闘の終わりまで）。きっかけは同じ状態の { applied } だけ（アークレンジャー・ブラックの S2 のアークブラックコレダー）。
 * グレイブ編（plan/design-grave.md 2.5 節）: 状態の付与の維持にも書ける（「〈状態〉の時に限り…持続」）。見る状態の自分の件が外れたフレームで
 * 閉じる（そのフレームには付いていない）。自分にだけ付き、スタックしない。見る状態は、同じ定義の自分に付ける付与のあるもの
 */
export type StateEndUntil = { stateEnd: NamedStateId };

/** グレイブ編: 維持が { stateEnd } か */
export function isStateEndUntil(u: unknown): u is StateEndUntil {
  return typeof u === 'object' && u !== null && 'stateEnd' in u;
}

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
 * 発火の文脈の burstUsers に自分がいるか。件を見ないので、これだけの条件は効果の段を上げない）。ディーゼル：ウィンタースイーツ編
 * （plan/design-diesel-ws.md 2.2 節）: false = 使用していなければ（burstUsers に自分がいない）。フルバーストの開始・終了の出来事の
 * 回数のきっかけ（{ count: 'fullBurstStart' | 'fullBurstEnd' }）にも書ける。
 * selfHp = 自分の HP の割合が閾値以上なら（2 段目の段 6。plan/design-skill-stage6.md 1.4 節。passive だけ。HP の割合は枠の想定で
 * 戦闘中一定なので、編成の段で決まる）。紅蓮編（plan/design-scarlet.md 2.2 節）: 閾値以下なら（atMost の形。timed だけ。発火のフレームの
 * HP の割合で見る。件の一覧が発火の文脈の条件と同じ所で見る）。ソリン編（plan/design-soline.md 2.1 節）: damage にも以上の形を書ける
 * （発火のフレームの HP の割合を 2 パス目の frame/plan.ts が見る。編成の段では決めない）。
 * burstStep = この発動を撃った段階が N なら（レッドフード編。plan/design-red-hood.md 2.1 節。『バーストⅠで使用時』など）。burstUse の
 * きっかけの timed・付与・cooldownReduction・weaponChange にだけ書ける。発火の文脈（このフレームの自分の発動の段階）だけで決まるので、
 * usedBurst と同じく件を見ず、効果の段を上げない。書けるのは burstStep が AllStep のキャラの定義だけ（definitions.test.ts）
 * inEffectiveRange = 発火のフレームの自分の着地点が、適正最小射程距離▲（minEffectiveRange）で縮めた適正射程距離の中なら（エード：
 * エージェントバニー編。plan/design-agent-bunny.md 2.2 節。距離ボーナスが乗る着地点と同じ判定。timed だけ）。条件が手入力の枠は、
 * 手入力の距離ボーナスの有無で決める
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
  usedBurst?: boolean;
  selfHp?: SelfHpCondition;
  selfCounter?: SelfCounterCondition;
  burstStep?: BasicBurstStep;
  inEffectiveRange?: true;
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
 * 「自分の HP が 80% 以上の時のみ」）。atLeastRef とちょうど 1 つ。
 * 紅蓮編（plan/design-scarlet.md 2.2 節）: atMostRef・atMost = 「自分の HP が X% 以下の場合」（timed だけ。発火のフレームの HP の割合
 * （skills/holders.ts の selfHpRatioAt）で見る。編成の段では決めない）。passive は atLeast の形だけ、timed は atMost の形だけ書ける。
 * ソリン編（plan/design-soline.md 2.1 節）: damage は atLeast の形だけ（「自分の HP が最大の場合」は atLeast 100。発火のフレームで見る）
 */
export type SelfHpCondition =
  | { atLeastRef: number; atLeast?: never; atMostRef?: never; atMost?: never }
  | { atLeast: number; atLeastRef?: never; atMostRef?: never; atMost?: never }
  | { atMostRef: number; atMost?: never; atLeastRef?: never; atLeast?: never }
  | { atMost: number; atMostRef?: never; atLeastRef?: never; atLeast?: never };

/** 紅蓮編: 「以下」の形（発火のフレームの HP の割合で見る）か */
export function isSelfHpAtMost(hp: SelfHpCondition): boolean {
  return hp.atMostRef !== undefined || hp.atMost !== undefined;
}

/**
 * ソリン編（plan/design-soline.md 2.1 節）: 解いた selfHp（atLeast・atMost。% 表記）を、HP の割合 ratio が満たすか（境は 1e-9 を許す）。
 * 発火のフレームで見る条件（timed の以下の形・damage の以上の形）が読む。解いていない形（atLeastRef・atMostRef）は投げる
 */
export function selfHpHolds(hp: SelfHpCondition, ratio: number): boolean {
  if (hp.atLeast !== undefined) return ratio >= hp.atLeast / 100 - 1e-9;
  if (hp.atMost !== undefined) return ratio <= hp.atMost / 100 + 1e-9;
  throw new RangeError(`selfHp ${JSON.stringify(hp)} is not resolved`);
}

/** 2 段目の段 15: selfHp の「以上」の閾値（割合。説明文の % ÷ 100）。valueOf は description_value_NN の値（スキル Lv の値） */
export function selfHpThreshold(hp: SelfHpCondition, valueOf: (ref: number) => number): number {
  return (hp.atLeast ?? valueOf(hp.atLeastRef!)) / 100;
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: 条件が、件を見る鍵（selfBuffed・inFullBurst・selfState・enemyState）を持つか。
 * 持たない条件（usedBurst だけ）は発火の文脈だけで決まるので、効果の段を上げない（skills/holders.ts）
 */
export function conditionReadsItems(condition: EffectCondition | undefined): boolean {
  if (condition === undefined) return false;
  // 2 段目の段 6: passive の selfHp は編成の段で決まる（件を見ない）。紅蓮編: timed の selfHp（以下）は最大HP の件の列を読むが、発火のフレームより
  // 前に始まった件だけなので段を上げない（skills/holders.ts の fireContextHolds）
  // レッドフード編: burstStep も発火の文脈だけで決まる
  return Object.keys(condition).some((key) => key !== 'usedBurst' && key !== 'selfHp' && key !== 'burstStep');
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
  /**
   * クエンシー：エスケープクイーン編（plan/design-quency-eq.md 2 節の論点 3）: 「下位効果のスタック適用」の段階。同じ発火で、同じスロットの
   * 前に書いた同じきっかけの付与が付ける分も数えてスタックを見る（下の段階が満ちた発火で上の段階も付く）。状態の付与の、スタックの
   * 条件にだけ書ける（parse/crossChecks.ts の validateSameFiring）
   */
  sameFiring?: true;
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
   * ゲージに予約する（オートファイアのどのヒットも射手の target_burst_energy_pershot を溜める）。
   * アインのニアフェザー編（plan/design-ein-near-feather.md 1.2 節）: 召喚の攻撃（{ summon }）のきっかけなら、射手の何ヒットぶん溜めるかの
   * 数（2 以上の整数）も書ける（true は 1 ヒットぶん）
   * V-0692（ラピ：レッドフードの粘着榴弾の付着は 25。C-0991）: 射撃の回数のきっかけは、回数の間隔の変更（cycleEvery の shotCounts）の窓の
   * 中は窓の間隔で数える（射撃の止まりと同じ。C-0727）
   */
  gaugePerHit?: true | number;
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
   * イサベルの S2（V-0632）: 値（撃つ側と敵の側のバフ・フルバースト補正）を、発火の直前のもので決める（遅れの間と、発火のフレームで付いた
   * ものは乗らない）。delayFrames のある damage だけ。valueDelayFrames とは組まない
   */
  valueBeforeFire?: true;
  /**
   * 2 段目の段 21 の PR 2（plan/design-skill-stage21.md 2.3 節。V-0634）: SG の射撃ごと（every 1）のダメージを、ペレットごとでなく 1 回の射撃
   * （トリガー）に 1 回出す（ソーダ：トゥインクルバニーの S2 の時間延長状態別のダメージ）。SG はどちらかが決まっていないので、書かないと
   * 解決で止まる（skills/burstDamage.ts）。射撃の回数のきっかけで、条件の付いた（畳み込まない）damage にだけ書ける
   */
  perTrigger?: true;
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
  /**
   * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.1 節）: きっかけから窓の間に的が受けたダメージを累計し、爆発の 1 ヒットで
   * 出す。ref は最大量（発動者の最終攻撃力の %）。爆発の値には式の補正を掛けない（C-0901）
   */
  accumulate?: AccumulateSpec;
  /** 常に満たすとみなした条件（対象の数など）。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

/**
 * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.1〜2.3 節）。最大量は、付けたフレームの最終攻撃力 × ref% ×
 * (1 + 分配ダメージ▲)（C-0904。烙印では録画で届いていないので同じ形とみた）。形は次の 2 つ:
 * - source team・release windowEnd（烙印）: 窓の間に的が受けた味方全員のダメージ（C-0901）を、窓の終わりの releaseDelayFrames 後に
 *   1 ヒット出す（最大量で切る。C-0902）
 * - source self・release capOrExpire（蓄積爆破）: 付けた発の後の発動者の発の値 × (ratioRef% + 蓄積割合▲) を溜め（C-0903）、最大量に届いた
 *   発の capDelayFrames 後に最大量を出して解除する（C-0904）。付くのは付けた発の applyDelayFrames 後で、最大量はそのフレームの値で読み
 *   （C-0916）、届かなければ付いてから窓の長さで切れ、切れる capDelayFrames 前までの発の溜めた値を出す（C-0903・C-0910・C-0927）。切れる時に射手の 1 ヒットぶんのゲージを溜める
 *   （C-0430・C-0911）。付いている間は付け直さない
 */
export type AccumulateSpec =
  | {
      source: 'team';
      release: 'windowEnd';
      /** 窓の長さ（秒）の description_value_NN */
      durationRef: number;
      /** 窓の終わりから爆発のヒットまでのフレーム（録画で読んだ即値） */
      releaseDelayFrames: number;
    }
  | {
      source: 'self';
      release: 'capOrExpire';
      /** 窓の長さ（秒）の description_value_NN */
      durationRef: number;
      /** 溜める割合（%）の description_value_NN */
      ratioRef: number;
      /** 付けた発から付くまでのフレーム（録画で読んだ即値）。窓の長さと最大量の読みはそこから */
      applyDelayFrames: number;
      /**
       * 最大量に届いた発から爆発のヒットまでのフレーム（録画で読んだ即値）。切れる時の爆発には、切れるフレームのこの前までに撃った発だけを
       * 溜める（発が溜まるのは発のこのフレーム後とみた形。C-0927）
       */
      capDelayFrames: number;
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
   * 発火のフレームに、timed の段 1.5 の条件と同じ件を見る（skills/holders.ts の instantConditionHolds）。レッドフード編（plan/design-red-hood.md
   * 2.1 節）: 使った段階（burstStep）も。発火の文脈で見る（skills/triggers.ts の burstStepHolds）
   */
  condition?: EffectCondition;
  /**
   * レッドフード編（plan/design-red-hood.md 2.3 節）: 「戦闘中 N 回発動」。戦闘を通して、条件を満たして効いた発火を数え、N 回の後の発火は
   * 無かったことにする（frame/firstPass.ts）。効果ごとに別に数える
   */
  maxFires?: number;
  /**
   * ミント・プリカ編（plan/design-mint-prika.md 2.6 節）: 「バーストスキルクールタイム X 秒▲」。発火のフレームの発動の後に、対象の走っている CT の
   * 残りに X 秒を足す（明けている枠には何もしない）
   */
  increase?: true;
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
    /**
     * ミント・プリカ編（plan/design-mint-prika.md 2.7 節）: 発火の条件（鍵は selfState だけ。ミントの S1 の「自分がダンス状態なら」）。発火のフレームに
     * 即時効果の条件と同じ件を見る（skills/holders.ts の instantConditionHolds）
     */
    condition?: EffectCondition;
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
  /** 使用武器の変更の終わり・バースト使用時と、グレイブ編から { ended }（plan/design-grave.md 2.1 節） */
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

/**
 * 紅蓮編（plan/design-scarlet.md 2.1 節）: 「現在のHP X%▼」。発火のたびに、自分の現在の HP を X% 下げる（HP の割合に (1 − X) を掛ける。
 * 最大HP は変えない。即時効果）。自分の HP の割合を読む効果（きっかけ { selfHpAtMostRef }・条件 selfHp の atMost）が、発火の次のフレーム
 * から読む（skills/holders.ts の selfHpRatioAt）。回復で戻る分は扱わない。対象は自分だけ。
 * A2 の B モード編（plan/design-hp-down-interval.md 2.1 節）: 「1 秒間隔」は、状態の付いた時から数える周期 { everySeconds, since } で書く
 * （付いたフレームにも起きるなら atStart。V-0729）
 */
export type CurrentHpDownEffect = Omit<AmmoDecreaseEffect, 'kind'> & { kind: 'currentHpDown' };

/**
 * 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: 「フルバーストタイム（の持続時間）X 秒▲」。フルバーストの窓を X 秒延ばす
 * （即時効果）。窓の外の発火（バースト 3 段階突入時。ソーダ：トゥインクルバニー）は次に作る窓に予約し、窓を作る発動のバースト使用時の
 * 発火（D）はその発動が作る窓に足す。件の一覧が窓の終わりを読むので、窓の終わりは窓を作る時に決め、後から動かさない。窓は編成で
 * 1 つなので、対象は allies だけ書ける（対象の数によらず 1 回だけ足す）。固定サイクルでは足さない（状態機械を回さない）。
 * 条件の無いバーストの「フルバーストタイム X 秒▲▼」は CDN の burst_duration に入っているので書かない
 */
export type FullBurstExtendEffect = TargetCountFields & {
  kind: 'fullBurstExtend';
  /** バースト 3 段階突入時（burstStage3Enter）かバースト使用時（burstUse）だけ */
  trigger: EffectTrigger;
  target: 'allies';
  /** 絞り込みの欄は即時効果の型をそろえるためだけにある（検証で弾く） */
  targetWeapon?: WeaponType;
  targetElement?: Element;
  targetClass?: NikkeClass;
  /** 秒の description_value_NN */
  ref: number;
  /** 発火の条件。鍵は selfState だけ（ゴールデンチップの段・気絶免疫状態なら）。発火のフレームに見る */
  condition?: EffectCondition;
  assumes?: LocalizedText;
};

export type InstantEffect =
  | CooldownReductionEffect
  | AmmoRefillEffect
  | HealEffect
  | BurstGaugeEffect
  | AmmoDecreaseEffect
  | FullBurstExtendEffect
  | CurrentHpDownEffect;
export type InstantKind = InstantEffect['kind'];
export const INSTANT_KINDS = [
  'cooldownReduction',
  'ammoRefill',
  'heal',
  'burstGauge',
  'ammoDecrease',
  'fullBurstExtend',
  'currentHpDown',
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
   * ツバイ編（plan/design-zwei.md 2.1 節。V-0718）: 追加効果「貫通特化」。変更後の武器の発（通常攻撃）を貫通特化の発にし、貫通ダメージ▲
   * （pierceDamage）を攻撃ダメージ▲と同じ和に足す（C-1031 の形）
   */
  pierce?: true;
  /**
   * 同 2.2 節: 変更後の武器の 1 発の弾の数（SG のペレット数 shotCount の即値。録画で読む）。省略は基礎の武器のまま。
   * 二丁持ちの銃口の数（muzzleCount）は基礎の武器のまま（ツバイのバーストは 1 弾 × 2 銃口）
   */
  shotCount?: number;
  /**
   * 使用武器変更の武器のパラメータ（plan/design-true-damage-element.md 9 節）: 変更後の武器のチャージ時間（秒・即値）。
   * 説明文に数字で書かれている（description_value でない）。省略は基礎の武器のまま。チャージ武器にだけ書ける
   */
  chargeTimeSeconds?: number;
  /**
   * ナユタ編（plan/design-nayuta.md 2.4 節。V-0666）: 説明文の「チャージ時間：N 秒固定」。変更後の武器のチャージ時間を、チャージ速度▲を受けずに
   * chargeTimeSeconds のままにする（stat fixedChargeTime と同じ読み。C-0214）。chargeTimeSeconds と組む
   */
  chargeTimeFixed?: true;
  /** 同: 変更後の武器のフルチャージダメージ（%・即値。300 = 300%）。省略は基礎の武器のまま。チャージ武器にだけ書ける */
  fullChargeDamage?: number;
  /**
   * レッドフード編（plan/design-red-hood.md 7.1 節の論点 10。V-0639）: 変更後の武器の解放の長さ（ゲーム内の秒・即値。録画で読む）。
   * 省略は武器の形の解放（SR は 23f）。端数は発ごとに持ち越す（0.3 秒 = 17.647f は 18・18・17f の繰り返し）。チャージ武器にだけ書ける。
   * 確かめたのはチャージが 0 のとき（チャージ速度の和が 100% 以上）だけ
   */
  chargeReleaseSeconds?: number;
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
   * レッドフード編（plan/design-red-hood.md 7.1 節の論点 13。V-0639）: 持ち替え（この変更を起こした発動がフルバーストに入るなら窓の
   * 始まり、ほかは変更の窓が射手に見える最初のフレーム）から変更後の武器の最初の発までのフレーム（即値。録画で読む）。持ち替えの時の
   * 基礎の武器が、リロード中ならそのまま、構え解除の途中（最後の発から WeaponModel.aimOutFrames 未満）なら構え解除の終わりから数え、
   * 構え直し・チャージの途中なら構え解除 1 回分（aimOutFrames）を足す（frame/firstPass.ts）。firstShotDelayFrames とは組まない
   */
  firstShotAfterSwapFrames?: number;
  /**
   * 2 段目の段 11 の PR 4（plan/design-skill-stage11.md 3.4 節）: 変更後の武器は撃っても残弾を減らさない（維持の間リロードしない）。
   * 説明文に「装弾数無限」の行が無い変更で、録画で読む（たきなのバースト。C-0708）。維持の欄（durationRef・durationSeconds）の変更にだけ書ける
   */
  infiniteAmmo?: true;
  /** レッドフード編（plan/design-red-hood.md 2.1 節）: 発火の条件。鍵は使った段階（burstStep）だけ */
  condition?: EffectCondition;
  /**
   * ナユタ編（plan/design-nayuta.md 2.5 節。論点 2）: 変更の窓の間だけ自分に付く状態の id（「記憶燃焼：使用武器変更」の記憶燃焼）。
   * 読み込み（parse/definition.ts の parseEntry）が、同じきっかけ・維持・条件の中身の無い付与（kind: 'state'・自分。weaponChangeOf の印）を
   * 同じスロットの効果の終わりに足す。撃ち切りで終わる変更（maxAmmoRef）とは組まない
   */
  state?: NamedStateId;
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
  /**
   * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: 「持続」（battleEnd。firstTick: halfAfterLatest のときだけ）。
   * 2 段目の段 19 の PR 1: 「〈状態〉解除まで」（StateEndUntil。きっかけ { applied } と組む）
   */
  durationUntil?: 'battleEnd' | StateEndUntil;
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
 * （リロードがその分遅れる。C-0718）。止めている間のフレームは射撃の回数に入らない。
 * プリバティ編（plan/design-privaty-burst-pause.md 2 節）: きっかけ 'burstUse'（burst スロットだけ）は、自分のバーストの発動の次のフレームから
 * frames フレーム止める（framesOnLastShot は書けない）
 */
export type ShotPauseEffect = {
  kind: 'shotPause';
  /**
   * メイド編（plan/design-maids.md 2.2 節）: { applied } は、その状態が自分に付いた時（付いていない所から付いた次のフレーム）から止める
   * （気絶。マスト：ロマンチックメイドの二日酔い）。止めている間は、バーストの候補からも外す（論点 2）
   */
  trigger: ShotCountTrigger | 'burstUse' | AppliedTrigger;
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
export type StateContentItem = StatContentItem | MaxStacksUpContentItem | SkillCooldownDownContentItem;

/** 名前の付いた状態の語彙編: stat の▲▼の中身の項目 */
export type StatContentItem = Pick<TimedEffect, 'stat' | 'ref' | 'scaling' | 'decrease'> & ClaimRefs;

/**
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 「〈状態〉の最大スタック数 N▲」（セブンスドワーフ・フルアクティブの
 * 効果 3「オートファイア準備 最大装填数 10▲・持続」）。持ち主の state の上限（同じ定義のその状態の付与の maxStacks）に、この中身の状態の
 * 件が付いている間だけ N を足す（中身の状態のスタック数によらず 1 回。skills/holders.ts）。上限は state の始まり（付与の発火）ごとに、その
 * フレームの値で見る。上限が戻っても、付いている段は切らない。amountRef は付与のあるスロットの説明文の値（整数）
 */
export type MaxStacksUpContentItem = { maxStacksUp: { state: NamedStateId; amountRef: number } } & ClaimRefs;

/**
 * 魔術師のカード編（plan/design-arcana-magician.md 2.1 節）: 「スキル N クールタイム X%▼」の維持の付いた形（T4）。持ち主の slot の、
 * クールタイムの印（TimerTrigger の cooldown）のある周期を、状態の窓の間だけ 元の周期 × (1 − X / 100) 秒にする。付いたフレームで次の
 * 発動をそこから縮めた周期に早め（もっと早い予定ならそのまま）、窓の中の発動の次は縮めた周期、外の発動の次は元の周期（ドロシーの発現の
 * elapsed と同じ規則。skills/timeline.ts の cooldownTimer）。percentRef は付与のあるスロットの説明文の値（%）。1 パス目
 * （frame/firstPass.ts）が発火を追って記録する。C-1055（アルカナの S1）
 */
export type SkillCooldownDownContentItem = {
  skillCooldownDown: { slot: 'skill1' | 'skill2'; percentRef: number };
} & ClaimRefs;

/** 2 段目の段 14 の PR 3: 中身の項目が stat の▲▼か（maxStacksUp でない） */
export function isStatContent(item: StateContentItem): item is StatContentItem {
  return !isMaxStacksUpContent(item) && !isSkillCooldownDownContent(item);
}

/**
 * 2 段目の段 14 の PR 3: 中身の項目の stat の名前（最大スタック数▲の項目は 'maxStacksUp'、スキルのクールタイム▼の項目は
 * 'skillCooldownDown'。最小構成の検査の形・一覧の表示）
 */
export function contentStatOf(item: StateContentItem): BuffStat | 'maxStacksUp' | 'skillCooldownDown' {
  if (isMaxStacksUpContent(item)) return 'maxStacksUp';
  if (isSkillCooldownDownContent(item)) return 'skillCooldownDown';
  return item.stat;
}

/** 2 段目の段 14 の PR 3: 中身の項目が最大スタック数▲か */
export function isMaxStacksUpContent(item: StateContentItem): item is MaxStacksUpContentItem {
  return 'maxStacksUp' in item;
}

/** 魔術師のカード編: 中身の項目がスキルのクールタイム▼か */
export function isSkillCooldownDownContent(item: StateContentItem): item is SkillCooldownDownContentItem {
  return 'skillCooldownDown' in item;
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
export type StateGrantEffect = Omit<
  TimedEffect,
  'kind' | 'stat' | 'ref' | 'scaling' | 'decrease' | 'amplifies' | 'durationUntil'
> & {
  kind: 'state';
  /**
   * timed と同じ維持の終わりの出来事。2 段目の段 19 の PR 1: カウンタが 0 になった時（CounterEmptyUntil）も。A2 の B モード編: HP が X% 以下の時
   * （SelfHpAtMostUntil）も。グレイブ編: ほかの状態が終わった時（StateEndUntil）も
   */
  durationUntil?: GrantDurationUntil;
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
  /**
   * ナユタ編（plan/design-nayuta.md 2.5 節。論点 1）: 説明文の「スタック量増減効果無効」。この状態のスタック量を変える効果（stackChange の
   * 増加・減少）が効かない。stackChange は同じ定義の付与にしか書けないので、同じ定義の stackChange を読み込みで弾く（validateStackChanges）。
   * 付与そのもの（発火ごとに付くスタック）と上限の▲（中身の maxStacksUp）は増減に数えない。maxStacks か maxStacksRef と組み、同じ状態の付与で揃える
   */
  stackImmutable?: true;
  /**
   * ナユタ編（plan/design-nayuta.md 2.5 節）: 使用武器の変更の state から読み込みが作った付与の印。JSON には書けない（読み込みで決まる欄。
   * JSON に戻すときは付与ごと外す）
   */
  weaponChangeOf?: true;
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
 * 課題 2-59（plan/design-debuff-removal.md 2.2 節）: 「デバフ効果解除 N 個」。効くフレーム（発火のフレーム。delayFrames があればその後）に、
 * そのフレームまでに付いた状態から、対象の味方ごとに、デバフの印の付いた状態（skills/states.ts の debuff）を count 個、スタックごと外す
 * （解除不可の件は外さない）。target は味方全体（allies）か、デバフのかかった味方からランダムに N 機（debuffedRandom。N は
 * targetCount / targetCountRef。デバフのかかった味方が N 機以下なら全員。より多いときは選び方を確かめていないので、枠の若い順）。状態が
 * count 個より多く付いた味方では、付いたのが早い順（確かめていない）。決め打ちで選んだ時は sim の枠の注記を出す
 */
export type RemoveDebuffEffect = TargetCountFields & {
  kind: 'removeDebuff';
  trigger: EffectTrigger;
  target: 'allies' | 'debuffedRandom';
  /** 外す個数（説明文の「N 個」） */
  count: number;
  /** 時間の周期のきっかけの発動から外すまでのフレーム（coverHeal の delayFrames と同じ） */
  delayFrames?: number;
  assumes?: LocalizedText;
};

/**
 * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 「〈名前〉消去」（Cancels）。発火のフレーム f の効果の判定（同じ発動の dot の
 * stacksFrom が写す数）の後に、敵に付いたその持続ダメージ（同じ定義の dot の state。解除不可も）を閉じる。f より後の tick は出ず、次に付けた時は
 * 1 スタックから。分類の設計書の論点 8 の「消去」（解除とは別）
 */
export type CancelStateEffect = {
  kind: 'cancelState';
  /** 目録の id（持ち主が敵の状態。同じ定義の dot の state。target が self なら持ち主が味方の状態） */
  state: NamedStateId;
  trigger: EffectTrigger;
  /**
   * ミント・プリカ編（plan/design-mint-prika.md 2.1 節）: self は自分の状態の消去。解除（removeState）と同じく発火のフレーム f に、持ち主（自分）の
   * その状態の件（出どころは問わない）を f + 1 で閉じ、解除不可の件も閉じる
   */
  target: 'enemy' | 'self';
  /** ミント・プリカ編: self の発火の条件（解除と同じ鍵） */
  condition?: EffectCondition;
  assumes?: LocalizedText;
};

/**
 * ミント・プリカ編（plan/design-mint-prika.md 2.5 節）: 「〈状態〉維持時間 X 秒▲」。即時効果。発火のフレーム f に、対象の各枠で、f に付いていて
 * f より後まで続くその状態の件の終わりを X 秒延ばす。付いていない枠には何もしない（後から付く件は延ばさない）。件の中身と、その状態を見る
 * 効果（while など）も延びた窓に従う
 */
export type StateExtendEffect = {
  kind: 'stateExtend';
  /** 目録の id（持ち主が味方の状態） */
  state: NamedStateId;
  trigger: EffectTrigger;
  target: 'self' | 'allies';
  /** 延ばす秒の description_value_NN */
  secondsRef: number;
  /** 発火の条件（鍵は selfState だけ） */
  condition?: EffectCondition;
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
 * アインのニアフェザー編（plan/design-ein-near-feather.md 1.1 節）: 召喚の展開。自分にその召喚を lifetimesSeconds の数だけ展開し、
 * 1 機ずつ維持時間（ゲームの秒。null は消えない）が過ぎたら消す。展開は同じ召喚の前の組を置き換える（残っていた機も消える）。
 * 機数は維持時間の残っている機の数で、攻撃（damage のきっかけ { summon }）の間隔を決める。展開のフレームは battleStart が 0、
 * burstUse がその枠のバーストの効果のフレーム
 */
export type SummonEffect = {
  kind: 'summon';
  summon: SummonId;
  trigger: 'battleStart' | 'burstUse';
  lifetimesSeconds: (number | null)[];
  assumes?: LocalizedText;
};

/**
 * アインのニアフェザー編（plan/design-ein-near-feather.md 1.2 節）: 召喚の攻撃は、同じ定義にその召喚の展開が要る。展開の組がなりうる
 * 機数（維持時間の並びで、消えた後に残る数。0 を除く）は、どれも攻撃の intervalSeconds の表にある
 */
export function summonCountsOf(lifetimesSeconds: readonly (number | null)[]): number[] {
  const finite = lifetimesSeconds.filter((x): x is number => x !== null);
  const counts = new Set<number>([lifetimesSeconds.length]);
  for (const t of finite) counts.add(lifetimesSeconds.filter((x) => x === null || x > t).length);
  counts.delete(0);
  return [...counts].sort((a, b) => a - b);
}

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

/**
 * 2 段目の段 10（plan/design-skill-stage4.md 1.3 節の形）: 「〈名前〉状態が終了した時」。自分のその状態の件（段によらない）が外れた最初の
 * フレームに発火する。counterChange と、グレイブ編（plan/design-grave.md 2.1 節）から ammoDecrease・状態の付与に書ける。見る状態は、同じ定義の
 * 自分に付ける付与のあるもの
 */
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
        ((e.kind === 'timed' || e.kind === 'state') && e.durationUntil === 'reloadEnd') ||
        ('trigger' in e && isReloadEndTrigger(e.trigger)),
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
  | RemoveDebuffEffect
  | CancelStateEffect
  | StateExtendEffect
  | StackChangeEffect
  | CounterChangeEffect
  | SummonEffect
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
  'removeDebuff',
  'cancelState',
  'stateExtend',
  'stackChange',
  'counterChange',
  'summon',
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
 * どんな効果かを定義の効果と同じ語彙で書いたもの。計算（sim）は読まない。対応状況（support）の決め方も変えない。
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
  /** 完全対応でないキャラ（resourceId の文字列）の、未対応・仮定の件数 */
  gaps: Record<string, SkillSupportGap>;
};

/** 完全対応でないキャラの、未対応（unimplemented の notes）と仮定（assumes のある効果）の件数（skills/support.ts） */
export type SkillSupportGap = { unimplemented: number; assumed: number };

// 読み込みの検査（skills/parse/）の入口。parse/ は types.ts の値を読むので循環 import になる。parse/ の最上位（関数の外）では types.ts の値を読まない
export { parseSkillDefinition, parseSkillIndex, parseSkillSupportIndex } from './parse/definition.ts';
