// Blablalink roledata（生 JSON）→ 正規化済み CharacterData。単位変換はここに集約する。
import type {
  AffectionMaster,
  BurstNextStep,
  BurstStep,
  CharacterData,
  CharacterIndexEntry,
  CollectionData,
  CubeData,
  Element,
  GearMaster,
  GearPart,
  GearType,
  NikkeClass,
  OverloadMaster,
  Rarity,
  RecycleRoomMaster,
  ShotInputType,
  SkillRaw,
  SkillSlot,
  StatKind,
  TreasureData,
  WeaponType,
} from '../src/types.ts';

export type RawListEntry = {
  resource_id: number;
  name_localkey: { name: string };
  original_rare: string;
  class: string;
  is_visible: boolean;
};

export type RawSkillDetail = {
  id: number;
  name_localkey: string;
  description_localkey: string;
  description_value_list: { description_value?: string[] }[];
};

export type RawRoleData = {
  resource_id: number;
  name_localkey: string;
  /** キャラの識別番号。宝物（favorite_{id}.json）の name_code と同じ値 */
  name_code: number;
  original_rare: string;
  class: string;
  corporation: string;
  use_burst_skill: string;
  change_burst_step: string;
  burst_duration: number;
  critical_ratio: number;
  critical_damage: number;
  bonusrange_min: number;
  bonusrange_max: number;
  element_details: { element: string }[];
  stat_enhance_detail: {
    grade_ratio: number;
    grade_hp: number;
    grade_attack: number;
    grade_defence: number;
    core_hp: number;
    core_attack: number;
    core_defence: number;
  };
  shot_detail: {
    weapon_type: string;
    fire_type: string;
    input_type: string;
    damage: number;
    shot_count: number;
    muzzle_count: number;
    max_ammo: number;
    reload_time: number;
    reload_bullet: number;
    rate_of_fire: number;
    end_rate_of_fire: number;
    rate_of_fire_change_pershot: number;
    rate_of_fire_reset_time: number;
    charge_time: number;
    full_charge_damage: number;
    core_damage_rate: number;
    penetration: number;
    maintain_fire_stance: number;
    uptype_fire_timing: number;
    burst_energy_pershot: number;
    target_burst_energy_pershot: number;
    full_charge_burst_energy: number;
  };
  skill1_detail: RawSkillDetail;
  skill2_detail: RawSkillDetail;
  ulti_skill_detail: RawSkillDetail & {
    skill_cooltime: number;
    /** Stage 11 モダニア: 'ChangeWeapon' なら skill_value_data の [1] が変更後の発射レート、[2] が変更後の shot_id */
    skill_type?: string;
    skill_value_data?: { skill_value_type: string; skill_value: number }[];
  };
  character_level_attack_list: number[];
  character_level_hp_list: number[];
  character_level_defence_list: number[];
};

/** Stage 9: 宝物 1 個分（/equip/{locale}/favorite_{id}.json）のうち使うフィールド */
export type RawFavorite = {
  id: number;
  name_localkey: string;
  favorite_rare: string;
  name_code: number;
  /** SSR だけが持つ。info は roledata の skill*_detail と同じ形（バーストでも skill_cooltime は無い） */
  favoriteitem_skill_group_data?: { skill_change_slot: number; info: RawSkillDetail }[];
};

/** Stage 9: /equip/favorite_rare_map.json。レア度ごとの宝物 ID */
export type RawFavoriteRareMap = Record<string, number[]>;

const RARITIES: readonly Rarity[] = ['SSR', 'SR', 'R'];
const CLASSES: readonly NikkeClass[] = ['Attacker', 'Defender', 'Supporter'];
const ELEMENTS: readonly Element[] = ['Fire', 'Water', 'Wind', 'Electronic', 'Iron'];
const WEAPON_TYPES: readonly WeaponType[] = ['AR', 'SMG', 'SR', 'RL', 'SG', 'MG'];
const BURST_STEPS: readonly BurstStep[] = ['Step1', 'Step2', 'Step3', 'AllStep'];
const NEXT_STEPS: readonly BurstNextStep[] = ['Step1', 'Step2', 'Step3', 'StepFull', 'NextStep'];
const INPUT_TYPES: readonly ShotInputType[] = ['DOWN', 'UP', 'DOWN_Charge'];

function oneOf<T extends string>(allowed: readonly T[], value: string, field: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`unexpected ${field}: ${JSON.stringify(value)} (allowed: ${allowed.join(', ')})`);
}

function toSkill(en: RawSkillDetail, ja: RawSkillDetail): SkillRaw {
  return {
    id: en.id,
    name: { ja: ja.name_localkey, en: en.name_localkey },
    description: { ja: ja.description_localkey, en: en.description_localkey },
    values: en.description_value_list.map((entry) => entry.description_value ?? null),
  };
}

const TREASURE_SLOT: Record<number, SkillSlot> = { 1: 'skill1', 2: 'skill2', 3: 'burst' };
const BASE_SKILL_KEY = { skill1: 'skill1_detail', skill2: 'skill2_detail', burst: 'ulti_skill_detail' } as const;
/** 宝物版のスキル ID の下 6 桁は基礎版 + 50（先頭の桁は違うことがある。plan/design-stage9.md 0.3 節） */
const TREASURE_SKILL_ID_OFFSET = 50;
const SKILL_ID_LOW_DIGITS = 1_000_000;

/** Stage 9: 宝物の持ち主を name_code で探す。いなければ null（一覧に無い未実装キャラなど）、2 体以上なら Error */
export function findTreasureOwner<T extends Pick<RawRoleData, 'resource_id' | 'name_code'>>(
  favorite: Pick<RawFavorite, 'id' | 'name_code'>,
  roles: readonly T[],
): T | null {
  const owners = roles.filter((r) => r.name_code === favorite.name_code);
  if (owners.length > 1) {
    const ids = owners.map((r) => r.resource_id).join(', ');
    throw new Error(`favorite ${favorite.id}: name_code ${favorite.name_code} matches several characters (${ids})`);
  }
  return owners[0] ?? null;
}

/**
 * Stage 9: 宝物（ja / en）を TreasureData にする。owner は持ち主の roledata（en）。
 * スロットが 3 つちょうどでない、ja と en で並びが違う、スキル ID が基礎版 + 50 でない場合は Error
 */
export function toTreasureData(en: RawFavorite, ja: RawFavorite, owner: RawRoleData): TreasureData {
  if (en.id !== ja.id) throw new Error(`favorite locale mismatch: en=${en.id} ja=${ja.id}`);
  const groupsEn = en.favoriteitem_skill_group_data ?? [];
  const groupsJa = ja.favoriteitem_skill_group_data ?? [];
  const unlockOrder = groupsEn.map((g) => {
    const slot = TREASURE_SLOT[g.skill_change_slot];
    if (slot === undefined) throw new Error(`favorite ${en.id}: unexpected skill_change_slot ${g.skill_change_slot}`);
    return slot;
  });
  if (unlockOrder.length !== 3 || new Set(unlockOrder).size !== 3) {
    throw new Error(`favorite ${en.id}: expected 3 distinct skill slots, got [${unlockOrder.join(', ')}]`);
  }
  const skills = {} as Record<SkillSlot, SkillRaw>;
  groupsEn.forEach((g, i) => {
    const slot = unlockOrder[i] as SkillSlot;
    const jaGroup = groupsJa[i];
    if (jaGroup === undefined || jaGroup.skill_change_slot !== g.skill_change_slot || jaGroup.info.id !== g.info.id) {
      throw new Error(`favorite ${en.id}: ja and en skill groups differ at index ${i}`);
    }
    const baseId = owner[BASE_SKILL_KEY[slot]].id;
    if (g.info.id % SKILL_ID_LOW_DIGITS !== (baseId % SKILL_ID_LOW_DIGITS) + TREASURE_SKILL_ID_OFFSET) {
      throw new Error(
        `favorite ${en.id}: ${slot} id ${g.info.id} is not the treasure version of ${baseId} (resource ${owner.resource_id})`,
      );
    }
    skills[slot] = toSkill(g.info, jaGroup.info);
  });
  return { favoriteId: en.id, name: { ja: ja.name_localkey, en: en.name_localkey }, unlockOrder, skills };
}

export function toCharacterData(en: RawRoleData, ja: RawRoleData, treasure: TreasureData | null = null): CharacterData {
  if (en.resource_id !== ja.resource_id) {
    throw new Error(`locale mismatch: en=${en.resource_id} ja=${ja.resource_id}`);
  }
  const element = en.element_details[0]?.element;
  if (element === undefined) throw new Error(`no element for resource ${en.resource_id}`);
  const shot = en.shot_detail;
  const enhance = en.stat_enhance_detail;
  const hasBonusRange = en.bonusrange_max > 0;
  return {
    resourceId: en.resource_id,
    name: { ja: ja.name_localkey, en: en.name_localkey },
    rarity: oneOf(RARITIES, en.original_rare, 'original_rare'),
    class: oneOf(CLASSES, en.class, 'class'),
    corporation: en.corporation,
    element: oneOf(ELEMENTS, element, 'element'),
    weaponType: oneOf(WEAPON_TYPES, shot.weapon_type, 'weapon_type'),
    burstStep: oneOf(BURST_STEPS, en.use_burst_skill, 'use_burst_skill'),
    levelCurve: {
      attack: en.character_level_attack_list,
      hp: en.character_level_hp_list,
      defence: en.character_level_defence_list,
    },
    statEnhance: {
      gradeRatio: enhance.grade_ratio,
      gradeAttack: enhance.grade_attack,
      gradeHp: enhance.grade_hp,
      gradeDefence: enhance.grade_defence,
      coreAttack: enhance.core_attack,
      coreHp: enhance.core_hp,
      coreDefence: enhance.core_defence,
    },
    crit: { rate: en.critical_ratio / 10000, damage: en.critical_damage / 10000 },
    bonusRange: hasBonusRange ? { min: en.bonusrange_min, max: en.bonusrange_max } : null,
    shot: {
      damage: shot.damage,
      shotCount: shot.shot_count,
      muzzleCount: shot.muzzle_count,
      maxAmmo: shot.max_ammo,
      reloadTime: shot.reload_time / 100,
      reloadBullet: shot.reload_bullet / 10000,
      rateOfFire: shot.rate_of_fire,
      endRateOfFire: shot.end_rate_of_fire,
      rateOfFireChangePerShot: shot.rate_of_fire_change_pershot,
      rateOfFireResetTime: shot.rate_of_fire_reset_time / 100,
      chargeTime: shot.charge_time / 100,
      fullChargeDamage: shot.full_charge_damage / 10000,
      coreDamageRate: shot.core_damage_rate / 10000,
      inputType: oneOf(INPUT_TYPES, shot.input_type, 'input_type'),
      fireType: shot.fire_type,
      penetration: shot.penetration,
      maintainFireStance: shot.maintain_fire_stance,
      uptypeFireTiming: shot.uptype_fire_timing,
      targetBurstEnergyPerShot: shot.target_burst_energy_pershot,
      burstEnergyPerShot: shot.burst_energy_pershot,
      // チャージなし武器は 0 が入っているので 1 にする（式に分岐を持ち込まない）
      fullChargeBurstEnergy: shot.full_charge_burst_energy === 0 ? 1 : shot.full_charge_burst_energy / 10000,
    },
    burstSkill: {
      cooldownSeconds: en.ulti_skill_detail.skill_cooltime / 100,
      nextStep: oneOf(NEXT_STEPS, en.change_burst_step, 'change_burst_step'),
      durationSeconds: en.burst_duration / 100,
      ...changeWeaponOf(en.ulti_skill_detail),
    },
    skills: {
      skill1: toSkill(en.skill1_detail, ja.skill1_detail),
      skill2: toSkill(en.skill2_detail, ja.skill2_detail),
      burst: toSkill(en.ulti_skill_detail, ja.ulti_skill_detail),
    },
    treasure,
  };
}

/**
 * Stage 11 モダニア: バーストの使用武器の変更（skill_type 'ChangeWeapon'）。skill_value_data の [1] = 変更後の発射レート（rpm。
 * 基礎の rate_of_fire と同じ単位）、[2] = 変更後の shot_id（中身は CDN に無い）。解読はユーザーの別プロジェクト
 * （NIKKE_Damage_Calculator の scripts/build_change_weapon_from_cdn.py）による。ChangeWeapon でなければ何も足さない
 */
export function changeWeaponOf(
  ulti: RawRoleData['ulti_skill_detail'],
): { changeWeapon: { rateOfFire: number; shotId: number } } | Record<string, never> {
  if (ulti.skill_type !== 'ChangeWeapon') return {};
  const rate = ulti.skill_value_data?.[1];
  const shotId = ulti.skill_value_data?.[2];
  if (rate?.skill_value_type !== 'Integer' || shotId?.skill_value_type !== 'Integer' || !(rate.skill_value > 0)) {
    throw new Error(
      `ulti ${ulti.id}: unexpected ChangeWeapon skill_value_data ${JSON.stringify(ulti.skill_value_data)}`,
    );
  }
  return { changeWeapon: { rateOfFire: rate.skill_value, shotId: shotId.skill_value } };
}

export function toIndexEntry(data: CharacterData): CharacterIndexEntry {
  return {
    resourceId: data.resourceId,
    name: data.name,
    rarity: data.rarity,
    class: data.class,
    corporation: data.corporation,
    element: data.element,
    weaponType: data.weaponType,
    burstStep: data.burstStep,
  };
}

// ---- Stage 12: 育成のマスタ（装備・好感度・キューブ・コレクション・リサイクルルーム） ----

/** /equip/ItemEquipTable-ja.json の 1 件。stat は 6 枠（None は未使用） */
export type RawEquipRecord = {
  id: number;
  name_localkey: string;
  item_type: string;
  item_sub_type: string;
  class: string;
  item_rare: string;
  grade_core_id: number;
  grow_grade: number;
  stat: { stat_type: string; stat_value: number }[];
};
export type RawEquipTable = { version: string; records: RawEquipRecord[] };

/** /character/AttractiveLevelTable.json の 1 件。*_rate は名前に反して加算値そのもの（rank30 の Supporter = 1367） */
export type RawAttractiveRecord = {
  id: number;
  attractive_level: number;
  attractive_point: number;
} & Record<string, number>;
export type RawAttractiveTable = { version: string; records: RawAttractiveRecord[] };

/** /equip/{locale}/cube_{id}.json のうち使うフィールド。atk 等は index = Lv − 1（15 要素） */
export type RawCube = {
  id: number;
  name_localkey: string;
  atk: number[];
  hp: number[];
  def: number[];
  level1: number[];
  level2: number[];
  level3: number[];
  item_rare: string;
  /** スキル（末尾に null が入ることがある） */
  harmonycube_skill_group: (RawSkillDetail | null)[];
};

/** /equip/{locale}/favorite_{id}.json の R / SR（コレクション）で使うフィールド。atk 等は index = Lv（16 要素） */
export type RawCollection = RawFavorite & {
  atk: number[];
  hp: number[];
  def: number[];
  level1: number[];
  level2: number[];
  favorite_type: string;
  weapon_type: string;
  max_level: number;
  collection_skill_group_data: RawSkillDetail[];
};

/** /character/RecycleResearchStatTable.json の 1 件（研究 1 Lv あたりの加算） */
export type RawRecycleRecord = {
  id: number;
  recycle_type: string;
  recycle_sub_type: string;
  attack: number;
  defence: number;
  hp: number;
};
export type RawRecycleTable = { version: string; records: RawRecycleRecord[] };

const GEAR_PART_OF_SUB_TYPE: Record<string, GearPart> = {
  Module_A: 'head',
  Module_B: 'body',
  Module_C: 'arm',
  Module_D: 'leg',
};
/** CDN の item_rare → マスタの種類。T9 企業装備は CDN に無い（Lv0 が T9 Lv3 相当） */
const GEAR_TYPE_OF_RARE: Record<string, GearType> = { T9: 'T9', T10: 'OL' };
const STAT_KIND_OF_TYPE: Record<string, StatKind> = { Atk: 'attack', Hp: 'hp', Defence: 'defence' };

/**
 * Stage 12: 手書きの装備マスタ（data/masters/gear.json）の Lv0 が CDN の ItemEquipTable と一致するか。
 * 違いがあれば「種類 クラス 部位 stat: マスタ / CDN」の一覧を返す（空なら一致）
 */
export function checkGearMaster(gear: GearMaster, table: RawEquipTable): string[] {
  const problems: string[] = [];
  for (const rec of table.records) {
    const type = GEAR_TYPE_OF_RARE[rec.item_rare];
    const part = GEAR_PART_OF_SUB_TYPE[rec.item_sub_type];
    if (type === undefined || part === undefined || rec.class === 'All') continue;
    if (!(CLASSES as readonly string[]).includes(rec.class)) continue;
    const stats = gear.tiers[type]?.[rec.class as NikkeClass]?.[part];
    if (stats === undefined) {
      problems.push(`${type} ${rec.class} ${part}: missing in gear master`);
      continue;
    }
    const cdn: Record<StatKind, number> = { attack: 0, hp: 0, defence: 0 };
    for (const s of rec.stat) {
      const kind = STAT_KIND_OF_TYPE[s.stat_type];
      if (kind !== undefined) cdn[kind] += s.stat_value;
    }
    for (const kind of ['attack', 'hp', 'defence'] as const) {
      if (stats[kind][0] !== cdn[kind]) {
        problems.push(`${type} ${rec.class} ${part} ${kind} Lv0: master ${stats[kind][0]} / CDN ${cdn[kind]}`);
      }
    }
  }
  return problems;
}

export function toAffectionMaster(table: RawAttractiveTable): AffectionMaster {
  const records = [...table.records].sort((a, b) => a.attractive_level - b.attractive_level);
  const ranks = records.map((r, i) => {
    if (r.attractive_level !== i + 1) throw new Error(`attractive level ${r.attractive_level} at index ${i}`);
    const pick = (kind: 'attack' | 'hp' | 'defence'): Record<NikkeClass, number> => ({
      Attacker: r[`attacker_${kind}_rate`] ?? 0,
      Defender: r[`defender_${kind}_rate`] ?? 0,
      Supporter: r[`supporter_${kind}_rate`] ?? 0,
    });
    return { rank: r.attractive_level, attack: pick('attack'), hp: pick('hp'), defence: pick('defence') };
  });
  return { formatVersion: 1, ranks };
}

function toSkillList(en: (RawSkillDetail | null)[], ja: (RawSkillDetail | null)[], what: string): SkillRaw[] {
  const skills: SkillRaw[] = [];
  en.forEach((s, i) => {
    const j = ja[i];
    if (s === null || s === undefined) return;
    if (j === null || j === undefined || j.id !== s.id)
      throw new Error(`${what}: ja and en skills differ at index ${i}`);
    skills.push(toSkill(s, j));
  });
  return skills;
}

export function toCubeData(en: RawCube, ja: RawCube): CubeData {
  if (en.id !== ja.id) throw new Error(`cube locale mismatch: en=${en.id} ja=${ja.id}`);
  const skills = toSkillList(en.harmonycube_skill_group, ja.harmonycube_skill_group, `cube ${en.id}`);
  const stageLists = [en.level1, en.level2, en.level3].slice(0, skills.length);
  for (const list of [en.atk, en.hp, en.def, ...stageLists]) {
    if (list.length !== 15) throw new Error(`cube ${en.id}: expected 15 levels, got ${list.length}`);
  }
  return {
    id: en.id,
    name: { ja: ja.name_localkey, en: en.name_localkey },
    stats: { attack: en.atk, hp: en.hp, defence: en.def },
    skillStages: stageLists,
    skills,
  };
}

export function toCollectionData(en: RawCollection, ja: RawCollection): CollectionData {
  if (en.id !== ja.id) throw new Error(`favorite locale mismatch: en=${en.id} ja=${ja.id}`);
  if (en.favorite_rare !== 'R' && en.favorite_rare !== 'SR') {
    throw new Error(`favorite ${en.id}: expected R or SR collection, got ${en.favorite_rare}`);
  }
  const skills = toSkillList(en.collection_skill_group_data, ja.collection_skill_group_data, `favorite ${en.id}`);
  const stageLists = [en.level1, en.level2].slice(0, skills.length);
  for (const list of [en.atk, en.hp, en.def, ...stageLists]) {
    if (list.length !== 16) throw new Error(`favorite ${en.id}: expected Lv0..15 (16 values), got ${list.length}`);
  }
  return {
    id: en.id,
    rarity: en.favorite_rare,
    weaponType: oneOf(WEAPON_TYPES, en.weapon_type, 'weapon_type'),
    name: { ja: ja.name_localkey, en: en.name_localkey },
    stats: { attack: en.atk, hp: en.hp, defence: en.def },
    skillStages: stageLists,
    skills,
  };
}

/** SSR（宝物）のステータス。段階 1..3 で同じ値でなければ Error */
export function toTreasureStats(ssr: Pick<RawCollection, 'id' | 'atk' | 'hp' | 'def'>): Record<StatKind, number> {
  const same = (list: number[]) => list.every((v) => v === list[0]);
  if (!same(ssr.atk) || !same(ssr.hp) || !same(ssr.def) || ssr.atk.length === 0) {
    throw new Error(`favorite ${ssr.id}: treasure stats differ by grade`);
  }
  return { attack: ssr.atk[0]!, hp: ssr.hp[0]!, defence: ssr.def[0]! };
}

export function toRecycleRoomMaster(table: RawRecycleTable): RecycleRoomMaster {
  const triple = (r: RawRecycleRecord) => ({ attack: r.attack, hp: r.hp, defence: r.defence });
  const byType = (type: string, sub: string): RawRecycleRecord => {
    const r = table.records.find((x) => x.recycle_type === type && x.recycle_sub_type === sub);
    if (r === undefined) throw new Error(`recycle research ${type}/${sub} not found`);
    return r;
  };
  const corporation: Record<string, Record<StatKind, number>> = {};
  for (const r of table.records) if (r.recycle_type === 'Corporation') corporation[r.recycle_sub_type] = triple(r);
  return {
    formatVersion: 1,
    personal: triple(byType('Personal', 'Personal')),
    class: {
      Attacker: triple(byType('Class', 'Attacker')),
      Defender: triple(byType('Class', 'Defender')),
      Supporter: triple(byType('Class', 'Supporter')),
    },
    corporation,
  };
}

// ---- Stage 13: OL オプションの表（data/masters/overload.json、手書き）と CDN の照合 ----

/** CDN の equip_option_table_v2（配列）。OL のオプションは id 1001001〜。state_effect_id_list は 5 段ずつ */
export type RawEquipOption = {
  id: number;
  description_localkey: string;
  state_effect_group_id: number;
  state_effect_id_list: number[];
};

/** OL のオプションの id の下限（10 / 11 / 20 は OL 以外の古い行） */
const OVERLOAD_OPTION_ID_MIN = 1_000_000;
/** OL のオプションの Lv の数（CDN の 3 行 × 5 段） */
const OVERLOAD_LEVELS = 15;

/**
 * 手書きの OL の表が CDN のオプションの一覧と一致するか。group id の集合・名前（「」を除く）・Lv の数（CDN の行 × 5 段 = 15）を見る。
 * 違いがあれば一覧を返す（空なら一致）。数値は CDN に無いので見ない
 */
export function checkOverloadMaster(master: OverloadMaster, table: readonly RawEquipOption[]): string[] {
  const problems: string[] = [];
  const groups = new Map<number, { name: string; levels: number }>();
  for (const rec of table) {
    if (rec.id < OVERLOAD_OPTION_ID_MIN) continue;
    const g = groups.get(rec.state_effect_group_id) ?? {
      name: rec.description_localkey.replace(/[「」]/g, ''),
      levels: 0,
    };
    g.levels += rec.state_effect_id_list.length;
    groups.set(rec.state_effect_group_id, g);
  }
  for (const [groupId, g] of groups) {
    const option = master.options.find((o) => o.cdnGroupId === groupId);
    if (option === undefined) {
      problems.push(`group ${groupId} (${g.name}): missing in overload master`);
      continue;
    }
    if (option.name.ja !== g.name) problems.push(`group ${groupId}: master name ${option.name.ja} / CDN ${g.name}`);
    if (g.levels !== OVERLOAD_LEVELS) problems.push(`group ${groupId}: CDN has ${g.levels} levels`);
    if (option.values.length !== g.levels) {
      problems.push(`group ${groupId}: master has ${option.values.length} levels / CDN ${g.levels}`);
    }
  }
  for (const option of master.options) {
    if (!groups.has(option.cdnGroupId)) problems.push(`${option.option} (group ${option.cdnGroupId}): not in CDN`);
  }
  return problems;
}
