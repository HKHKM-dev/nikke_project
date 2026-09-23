// Blablalink roledata（生 JSON）→ 正規化済み CharacterData。単位変換はここに集約する。
import type {
  BurstNextStep,
  BurstStep,
  CharacterData,
  CharacterIndexEntry,
  Element,
  NikkeClass,
  Rarity,
  ShotInputType,
  SkillRaw,
  SkillSlot,
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
  ulti_skill_detail: RawSkillDetail & { skill_cooltime: number };
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
    },
    skills: {
      skill1: toSkill(en.skill1_detail, ja.skill1_detail),
      skill2: toSkill(en.skill2_detail, ja.skill2_detail),
      burst: toSkill(en.ulti_skill_detail, ja.ulti_skill_detail),
    },
    treasure,
  };
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
