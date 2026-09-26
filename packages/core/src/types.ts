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
/** スキルの枠。skills/types.ts が SKILL_SLOTS と一緒に再エクスポートする（Stage 9 で TreasureData から参照するためここへ移した） */
export type SkillSlot = 'skill1' | 'skill2' | 'burst';

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
  /** Stage 18: 照準円（CDN の *_accuracy_circle_scale 等の生値）。データとして持つだけで、計算にはまだ使わない */
  accuracy?: AccuracyCircle;
};

/**
 * Stage 18: 照準円。単位は CDN の生値のまま（AR 75・SMG 110・MG 250 → 10・SR / RL 10・SG 250）。
 * auto* は AUTO 時の値（2026-09-26 時点で全キャラ手動と同じ）。命中率▲との関係は plan/design-stage18.md 0.4 節
 */
export type AccuracyCircle = {
  /** 撃ち始めの円 */
  start: number;
  /** 撃ち続けたときの円（縮む武器だけ start と違う） */
  end: number;
  /** 1 発ごとの縮み幅 */
  changePerShot: number;
  /** 戻る速さ */
  changeSpeed: number;
  autoStart: number;
  autoEnd: number;
  autoChangePerShot: number;
  autoChangeSpeed: number;
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
    /** burst_duration / 100。その III が起こすフルバーストの長さ（Stage 8 で確認。モダニアは 15 秒） */
    durationSeconds: number;
    /**
     * Stage 11 モダニア: バーストの skill_type が ChangeWeapon のキャラだけ。skill_value_data の [1] = 変更後の発射レート（rpm）、
     * [2] = 変更後の shot_id（中身は CDN に無い）。1 発のダメージは説明文の値（スキル定義の weaponChange の damageRef）を使う
     */
    changeWeapon?: { rateOfFire: number; shotId: number };
  };
  skills: { skill1: SkillRaw; skill2: SkillRaw; burst: SkillRaw };
  /** Stage 9: 宝物（SSR のお気に入りアイテム）。ないキャラは null */
  treasure: TreasureData | null;
};

/**
 * Stage 9: 宝物のスキル差し替え。宝物のステータスはスペック固定で乗らないので持たない（plan/design-stage9.md 0.5 節）。
 * 宝物の段階 N（1..3）では unlockOrder の先頭 N 個のスロットが skills の宝物版になる
 */
export type TreasureData = {
  /** 宝物 ID（CDN の favorite_{id}.json） */
  favoriteId: number;
  name: LocalizedText;
  /** 解放順（favoriteitem_skill_group_data の配列順）。3 スロットちょうど */
  unlockOrder: SkillSlot[];
  /** 宝物版のスキル。形は基礎版と同じ。CT は基礎版の burstSkill を使う */
  skills: Record<SkillSlot, SkillRaw>;
};

// ---- Stage 12: 育成のマスタ（data/masters/*.json）。plan/design-stage12.md 2 節 ----

/** 装備の種類。T9 = 通常の T9、T9Corp = 企業装備（T9 Lv3 相当から始まる）、OL = オーバーロード装備（CDN の T10） */
export type GearType = 'T9' | 'T9Corp' | 'OL';
/** 装備の部位（CDN の Module_A〜D の順） */
export type GearPart = 'head' | 'body' | 'arm' | 'leg';
/** 1 部位のステータス。index = 強化 Lv（0..5）。付かないステータスは 0 */
export type GearPartStats = Record<StatKind, number[]>;
/**
 * 装備のマスタ。Lv0 は CDN の ItemEquipTable と一致することを fetch-data が確かめる。Lv1〜5 は CDN に無い
 * （成長テーブルの ID だけ）ので、参照表の転記（plan/design-stage12.md 2.2 節）。T9 Lv5 のクラス別合計は
 * fixedSpec.ts の FIXED_SPEC_GEAR_ATTACK（射撃場の実測で確定）と一致する
 */
export type GearMaster = {
  formatVersion: 1;
  source: string;
  tiers: Record<GearType, Record<NikkeClass, Record<GearPart, GearPartStats>>>;
};

/** 好感度 1 ランク分の加算（クラス別の固定値。CDN の AttractiveLevelTable の *_rate はそのまま加算値） */
export type AffectionRankStats = { rank: number } & Record<StatKind, Record<NikkeClass, number>>;
/** 好感度のマスタ。ranks[0] = rank 1（加算 0）… ranks[39] = rank 40 */
export type AffectionMaster = { formatVersion: 1; ranks: AffectionRankStats[] };

/**
 * キューブ 1 個。attack 等は index = Lv − 1（Lv1..15）の加算値。skillStages[i][lv − 1] は Lv のときのスキル i の段階
 * （0 = 未解放）。skills は宝物と同じ形（values[段階 − 1] が段階の数値）。効果は Stage 13 で使う（buildEffects.ts）
 */
export type CubeData = {
  id: number;
  name: LocalizedText;
  stats: Record<StatKind, number[]>;
  skillStages: number[][];
  skills: SkillRaw[];
};
export type CubeMaster = { formatVersion: 1; cubes: CubeData[] };

/**
 * コレクション（R / SR のお気に入りアイテム）。武器種ごとに 1 つ。stats は index = Lv（0..15）の加算値。
 * skillStages[i][lv] は Lv のときのスキル i の段階（1..4）。SSR（宝物）は段階によらず treasureStats
 */
export type CollectionData = {
  id: number;
  rarity: 'R' | 'SR';
  weaponType: WeaponType;
  name: LocalizedText;
  stats: Record<StatKind, number[]>;
  skillStages: number[][];
  skills: SkillRaw[];
};
export type CollectionMaster = {
  formatVersion: 1;
  collections: CollectionData[];
  /** 宝物（SSR）を解放しているときのステータス（段階 1..3 で同じ。SR Lv15 と同値） */
  treasureStats: Record<StatKind, number>;
};

/** リサイクルルーム研究の 1 Lv あたりの加算（CDN の RecycleResearchStatTable。仮定: Lv × 加算） */
export type RecycleRoomMaster = {
  formatVersion: 1;
  personal: Record<StatKind, number>;
  class: Record<NikkeClass, Record<StatKind, number>>;
  corporation: Record<string, Record<StatKind, number>>;
};

// ---- Stage 13: 効果層のマスタ。plan/design-stage12.md 3・12 節 ----

/** OL 装備のオプション（CDN の equip_option_table_v2 の 9 種。state_effect_group_id 100100〜100900 の順） */
export type OverloadOption =
  | 'elementDamage'
  | 'hitRate'
  | 'maxAmmo'
  | 'attack'
  | 'chargeDamage'
  | 'chargeSpeed'
  | 'critRate'
  | 'critDamage'
  | 'defence';

export type OverloadOptionData = {
  option: OverloadOption;
  name: LocalizedText;
  /** CDN の state_effect_group_id（fetch-data が CDN の表と照合する） */
  cdnGroupId: number;
  /** Lv1..15 の上昇値（% の実数。4.77 = +4.77%）。index = Lv − 1。CDN に無いので手書き */
  values: number[];
  /** ユーザーの実装備の表示値で確かめた行か（plan/design-stage12.md 3.2 節） */
  verified: boolean;
};

/** OL オプションの上昇値の表（data/masters/overload.json、手書き） */
export type OverloadMaster = { formatVersion: 1; source: string; options: OverloadOptionData[] };

export type BuildMasters = {
  gear: GearMaster;
  affection: AffectionMaster;
  cubes: CubeMaster;
  collections: CollectionMaster;
  recycleRoom: RecycleRoomMaster;
  /** Stage 13 */
  overload: OverloadMaster;
};

// ---- Stage 15: 敵のプリセット（data/enemies.json、手書き）。plan/design-stage12.md 5.2 節 ----

/** どのコンテンツの敵か */
export type EnemyContent = 'range' | 'interception' | 'soloRaid' | 'unionRaid';

/** 敵 1 体。防御力は 1 ヒットの逆算で確かめた値だけ載せる（measuredAt・source を添える） */
export type EnemyPreset = {
  id: string;
  name: LocalizedText;
  content: EnemyContent;
  element: Element | null;
  hasCore: boolean;
  defence: number;
  /** 敵のレベル（迎撃戦・レイド）。射撃場は null */
  level: number | null;
  /** 防御力を確かめた日（YYYY-MM-DD） */
  measuredAt: string;
  /** 防御力の出どころ（verification.md の節など） */
  source: string;
  /** Stage 16-B: 選べる出来事のセット（EnemyPresetMaster.eventSets の id）。無ければ空 */
  eventSets: string[];
  /** Stage 18-C: 的の条件の表（EnemyPresetMaster.targetProfiles の id）。無ければ「この敵の条件は未測定」 */
  targetProfile?: string;
};

/** Stage 16-B: 周期で書いた敵の出来事（秒）。first から duration 秒、every 秒ごとに繰り返す（every が無ければ 1 回） */
export type EnemyEventSpec = {
  kind: 'untargetable' | 'invulnerable' | 'barrier';
  first: number;
  duration: number;
  every?: number;
};

/** Stage 16-B: 出来事のセット（射撃場 3 分モードの的のジャンプなど）。画面ではセットごとに ON/OFF する */
export type EnemyEventSet = {
  id: string;
  name: LocalizedText;
  events: EnemyEventSpec[];
  /**
   * Stage 18-C: 狙えない窓（untargetable）で区切った区間ごとの着地点（TargetProfile の着地点か配分の id）。
   * 1 つ目は最初の窓の前。区間の数より短ければ、残りの区間は「着地点が未測定」。省略は着地点なし
   */
  landings?: string[];
  /** 値の出どころと、代表値にした理由 */
  source: string;
};

// ---- Stage 18-C: 的の条件の表（plan/design-stage18.md 12.2 節） ----

/** 射撃場の距離帯（近 / 中近 / 中遠 / 遠） */
export type LandingBand = 'near' | 'midNear' | 'midFar' | 'far';

/** 的の着地点 1 か所。range は距離の範囲（m）で、距離ボーナスは range が bonusRange に丸ごと入るかで決める */
export type LandingPoint = { id: string; band: LandingBand; range: [number, number] };

/**
 * 武器種 × 着地点の値（0..1）。キーは着地点の id、帯、または all の順で引く。null・省略は未測定（手入力の値を使う）
 */
export type TargetRateTable = Partial<Record<WeaponType, Readonly<Record<string, number>> | null>>;

/** 的の条件の表。射撃場の BigArms のように、属性だけ違う敵で 1 つを共有する */
export type TargetProfile = {
  id: string;
  name: LocalizedText;
  /** 出来事が無いとき（3 分モード OFF）の着地点（初期位置） */
  initialLanding: string;
  landings: LandingPoint[];
  /** 配分の id → [着地点の id, 重み] の列（重みの和は 1）。中遠の 3 か所など */
  mixes: Record<string, [string, number][]>;
  /** コア命中率 P(コア｜命中) */
  coreHitRate: TargetRateTable;
  /** 弾丸命中率 */
  bulletHitRate: TargetRateTable;
  /** セルごとの出どころ（verification.md の節・claims.md の ID） */
  source: string;
};

export type EnemyPresetMaster = {
  formatVersion: 1;
  source: string;
  eventSets: EnemyEventSet[];
  /** Stage 18-C: 的の条件の表。省略は空 */
  targetProfiles: TargetProfile[];
  enemies: EnemyPreset[];
};
