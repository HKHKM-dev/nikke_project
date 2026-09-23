// 正規化済みキャラデータの型。数値の単位は各フィールドのコメントを参照。
// 方針: レベル曲線と武器倍率は CDN の生の整数を保持し、倍率化は計算関数で行う。

export type Locale = 'ja' | 'en';
export type LocalizedText = Record<Locale, string>;

export type Rarity = 'SSR' | 'SR' | 'R';
export type NikkeClass = 'Attacker' | 'Defender' | 'Supporter';
export type Element = 'Fire' | 'Water' | 'Wind' | 'Electronic' | 'Iron';
export type WeaponType = 'AR' | 'SMG' | 'SR' | 'RL' | 'SG' | 'MG';
export type BurstStep = 'Step1' | 'Step2' | 'Step3' | 'AllStep';
/** バースト後に進む段階（CDN の change_burst_step）。Step1〜3 はその段階へ（戻り = リエントリーを含む）、StepFull はフルバースト、NextStep は 1 つ上 */
export type BurstNextStep = 'Step1' | 'Step2' | 'Step3' | 'StepFull' | 'NextStep';
export type StatKind = 'attack' | 'hp' | 'defence';
export type ShotInputType = 'DOWN' | 'UP' | 'DOWN_Charge';

export type CharacterIndexEntry = {
  resourceId: number;
  name: LocalizedText;
  rarity: Rarity;
  class: NikkeClass;
  corporation: string;
  element: Element;
  weaponType: WeaponType;
  burstStep: BurstStep;
};

export type CharacterIndex = {
  /** データ形式のバージョン。互換性のない変更で上げる。 */
  formatVersion: 1;
  characters: CharacterIndexEntry[];
};

/** 限界突破・コア強化の係数。CDN 生値（比率は 1e-4 単位、加算値はそのまま）。 */
export type StatEnhance = {
  gradeRatio: number;
  gradeAttack: number;
  gradeHp: number;
  gradeDefence: number;
  coreAttack: number;
  coreHp: number;
  coreDefence: number;
};

export type ShotParams = {
  /** 武器倍率（1e-4 単位。557 = 5.57%。SG は全ペレット合計） */
  damage: number;
  /** 1 トリガーで出るペレット数（CDN の shot_count。SG は 10、それ以外は通常 1）。弾薬の消費数ではない（消費は 1 トリガー = 1） */
  shotCount: number;
  muzzleCount: number;
  maxAmmo: number;
  /** リロード時間（秒） */
  reloadTime: number;
  /** 1 回のリロードで回復する割合（0..1。1 未満は分割リロード） */
  reloadBullet: number;
  /** 発射レート（rpm）。MG は rateOfFire から endRateOfFire まで 1 発ごとに changePerShot ずつ上昇 */
  rateOfFire: number;
  endRateOfFire: number;
  rateOfFireChangePerShot: number;
  /** この秒数以上射撃が途切れるとレートが初期化される（秒） */
  rateOfFireResetTime: number;
  /** チャージ時間（秒）。0 はチャージなし */
  chargeTime: number;
  /** フルチャージ倍率（1.0 = チャージなし、2.5 等） */
  fullChargeDamage: number;
  /** コアヒット倍率（通常 2.0） */
  coreDamageRate: number;
  inputType: ShotInputType;
  fireType: string;
  penetration: number;
  maintainFireStance: number;
  uptypeFireTiming: number;
  /** 敵に 1 ペレット（SG 以外は 1 発）当たったときのバーストゲージ量（上限 BURST_GAUGE_MAX = 1,000,000） */
  targetBurstEnergyPerShot: number;
  /** 敵以外に当たったときのゲージ量（保持のみ。Stage 7 では使わない） */
  burstEnergyPerShot: number;
  /** フルチャージ時のゲージ倍率（2.5 = ×2.5）。チャージなし武器は 1 */
  fullChargeBurstEnergy: number;
};

/** スキルの説明文と Lv 別数値（Stage 4 で構造化する。今は保持のみ）。 */
export type SkillRaw = {
  id: number;
  name: LocalizedText;
  description: LocalizedText;
  /** description_value_list と同じ並び。{description_value_NN} は values[NN-1] を参照。空要素は null */
  values: (string[] | null)[];
};

export type CharacterData = CharacterIndexEntry & {
  /** index = level - 1 */
  levelCurve: Record<StatKind, number[]>;
  statEnhance: StatEnhance;
  /** rate は確率（0.15）、damage は倍率（1.5 = 会心時 150%） */
  crit: { rate: number; damage: number };
  /** 距離ボーナスが付く距離（m）。RL のように存在しない場合は null */
  bonusRange: { min: number; max: number } | null;
  shot: ShotParams;
  burstSkill: {
    /** バースト CT（秒）。skill_cooltime / 100。Lv で変わらない */
    cooldownSeconds: number;
    nextStep: BurstNextStep;
    /** burst_duration / 100。意味は未確認（フルバースト時間かもしれない）。Stage 7 では使わない */
    durationSeconds: number;
  };
  skills: { skill1: SkillRaw; skill2: SkillRaw; burst: SkillRaw };
};
