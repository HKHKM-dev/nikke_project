import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OverloadMaster } from '../src/types.ts';
import {
  checkOverloadMaster,
  findTreasureOwner,
  toCharacterData,
  toIndexEntry,
  toTreasureData,
  type RawEquipOption,
  type RawFavorite,
  type RawRoleData,
  type RawSkillDetail,
} from './normalize.ts';

// Emma (resourceId 90) の roledata から必要フィールドだけを抜き出した固定値。曲線は先頭 3 レベル分。
function skill(id: number, name: string, values: (string[] | undefined)[]): RawSkillDetail {
  return {
    id,
    name_localkey: name,
    description_localkey: `${name} description`,
    description_value_list: values.map((v) => (v ? { description_value: v } : {})),
  };
}

function emma(locale: 'en' | 'ja'): RawRoleData {
  const ja = locale === 'ja';
  return {
    resource_id: 90,
    name_localkey: ja ? 'エマ' : 'Emma',
    name_code: 5001,
    original_rare: 'SSR',
    class: 'Supporter',
    corporation: 'ELYSION',
    use_burst_skill: 'Step1',
    change_burst_step: 'Step2',
    burst_duration: 1000,
    critical_ratio: 1500,
    critical_damage: 15000,
    bonusrange_min: 35,
    bonusrange_max: 55,
    element_details: [{ element: 'Fire' }],
    stat_enhance_detail: {
      grade_ratio: 200,
      grade_hp: 3000,
      grade_attack: 20,
      grade_defence: 100,
      core_hp: 200,
      core_attack: 200,
      core_defence: 200,
    },
    shot_detail: {
      weapon_type: 'MG',
      fire_type: 'Instant',
      input_type: 'DOWN',
      damage: 557,
      shot_count: 1,
      muzzle_count: 1,
      max_ammo: 300,
      reload_time: 250,
      reload_bullet: 10000,
      rate_of_fire: 60,
      end_rate_of_fire: 4200,
      rate_of_fire_change_pershot: 100,
      rate_of_fire_reset_time: 100,
      charge_time: 0,
      full_charge_damage: 10000,
      core_damage_rate: 20000,
      penetration: 0,
      maintain_fire_stance: 0,
      uptype_fire_timing: 0,
      burst_energy_pershot: 500,
      target_burst_energy_pershot: 1000,
      full_charge_burst_energy: 0,
      start_accuracy_circle_scale: 250,
      end_accuracy_circle_scale: 10,
      accuracy_change_pershot: 7,
      accuracy_change_speed: 150,
      auto_start_accuracy_circle_scale: 250,
      auto_end_accuracy_circle_scale: 10,
      auto_accuracy_change_pershot: 7,
      auto_accuracy_change_speed: 150,
    },
    skill1_detail: skill(2090101, ja ? 'チアリーディング' : 'Cheerleading', [['5.92', '6.46'], ['5', '5'], undefined]),
    skill2_detail: skill(2090201, 'S2', []),
    ulti_skill_detail: { ...skill(1090301, 'Burst', [['10']]), skill_cooltime: 2000 },
    character_level_attack_list: [500, 525, 550],
    character_level_hp_list: [15000, 15750, 16500],
    character_level_defence_list: [84, 88, 92],
  };
}

describe('toCharacterData', () => {
  const data = toCharacterData(emma('en'), emma('ja'));

  it('converts units', () => {
    expect(data.crit).toEqual({ rate: 0.15, damage: 1.5 });
    expect(data.shot.reloadTime).toBe(2.5);
    expect(data.shot.reloadBullet).toBe(1);
    expect(data.shot.rateOfFireResetTime).toBe(1);
    expect(data.shot.fullChargeDamage).toBe(1);
    expect(data.shot.coreDamageRate).toBe(2);
    expect(data.shot.damage).toBe(557); // 生値のまま
    expect(data.shot.maxAmmo).toBe(300);
  });

  it('keeps the accuracy circle as raw values (Stage 18)', () => {
    expect(data.shot.accuracy).toEqual({
      start: 250,
      end: 10,
      changePerShot: 7,
      changeSpeed: 150,
      autoStart: 250,
      autoEnd: 10,
      autoChangePerShot: 7,
      autoChangeSpeed: 150,
    });
  });

  it('converts burst gauge and cooldown fields (Stage 7)', () => {
    expect(data.shot.targetBurstEnergyPerShot).toBe(1000);
    expect(data.shot.burstEnergyPerShot).toBe(500);
    expect(data.shot.fullChargeBurstEnergy).toBe(1); // 0 → 1
    expect(data.burstSkill).toEqual({ cooldownSeconds: 20, nextStep: 'Step2', durationSeconds: 10 });
    const charged = emma('en');
    charged.shot_detail.full_charge_burst_energy = 25000;
    expect(toCharacterData(charged, emma('ja')).shot.fullChargeBurstEnergy).toBe(2.5);
    const bad = emma('en');
    bad.change_burst_step = 'Step4';
    expect(() => toCharacterData(bad, emma('ja'))).toThrow(/change_burst_step/);
  });

  it('keeps the changed weapon of a ChangeWeapon burst (Stage 11 モダニア)', () => {
    const modernia = emma('en');
    modernia.ulti_skill_detail = {
      ...modernia.ulti_skill_detail,
      skill_type: 'ChangeWeapon',
      skill_value_data: [
        { skill_value_type: 'Percent', skill_value: 152 },
        { skill_value_type: 'Integer', skill_value: 4200 },
        { skill_value_type: 'Integer', skill_value: 1026002 },
        { skill_value_type: 'None', skill_value: 0 },
        { skill_value_type: 'Integer', skill_value: 1 },
      ],
    };
    expect(toCharacterData(modernia, emma('ja')).burstSkill.changeWeapon).toEqual({
      rateOfFire: 4200,
      shotId: 1026002,
    });
    // ChangeWeapon でなければキーごと無い（既存のデータは変わらない）
    expect(data.burstSkill).not.toHaveProperty('changeWeapon');
    const broken = emma('en');
    broken.ulti_skill_detail = { ...broken.ulti_skill_detail, skill_type: 'ChangeWeapon', skill_value_data: [] };
    expect(() => toCharacterData(broken, emma('ja'))).toThrow(/ChangeWeapon/);
  });

  it('keeps both locale names and enum fields', () => {
    expect(data.name).toEqual({ ja: 'エマ', en: 'Emma' });
    expect(data.element).toBe('Fire');
    expect(data.weaponType).toBe('MG');
    expect(data.bonusRange).toEqual({ min: 35, max: 55 });
    expect(data.levelCurve.attack).toEqual([500, 525, 550]);
  });

  it('keeps skill value slots aligned with description placeholders', () => {
    expect(data.skills.skill1.name).toEqual({ ja: 'チアリーディング', en: 'Cheerleading' });
    expect(data.skills.skill1.values).toEqual([['5.92', '6.46'], ['5', '5'], null]);
  });

  it('maps bonusrange (0,0) to null', () => {
    const rl = emma('en');
    rl.bonusrange_min = 0;
    rl.bonusrange_max = 0;
    expect(toCharacterData(rl, emma('ja')).bonusRange).toBeNull();
  });

  it('rejects unknown enum values', () => {
    const bad = emma('en');
    bad.shot_detail.weapon_type = 'LASER';
    expect(() => toCharacterData(bad, emma('ja'))).toThrow(/weapon_type/);
  });

  it('builds a compact index entry', () => {
    expect(toIndexEntry(data)).toEqual({
      resourceId: 90,
      name: { ja: 'エマ', en: 'Emma' },
      rarity: 'SSR',
      class: 'Supporter',
      corporation: 'ELYSION',
      element: 'Fire',
      weaponType: 'MG',
      burstStep: 'Step1',
    });
  });
});

// Stage 9: 宝物。エマの宝物は実在しないが、形はドレイクの 200801 と同じ（配列順 = 解放順、ID は基礎版 + 50）
function favorite(locale: 'en' | 'ja', order: number[] = [2, 3, 1]): RawFavorite {
  const ja = locale === 'ja';
  const info: Record<number, RawSkillDetail> = {
    1: skill(2090151, ja ? 'チアリーディング改' : 'Cheerleading+', [['9.99'], ['5']]),
    2: skill(2090251, 'S2+', [['1']]),
    // 先頭の桁が基礎版（1090301）と違っても、下 6 桁が + 50 なら同じスキルの宝物版
    3: skill(2090351, 'Burst+', [['30']]),
  };
  return {
    id: 209901,
    name_localkey: ja ? 'テストの宝物' : 'Test Treasure',
    favorite_rare: 'SSR',
    name_code: 5001,
    favoriteitem_skill_group_data: order.map((slot) => ({ skill_change_slot: slot, info: info[slot]! })),
  };
}

describe('toTreasureData (Stage 9)', () => {
  const treasure = toTreasureData(favorite('en'), favorite('ja'), emma('en'));

  it('keeps the array order as the unlock order and maps slots', () => {
    expect(treasure.favoriteId).toBe(209901);
    expect(treasure.name).toEqual({ ja: 'テストの宝物', en: 'Test Treasure' });
    expect(treasure.unlockOrder).toEqual(['skill2', 'burst', 'skill1']);
    expect(treasure.skills.skill1.name).toEqual({ ja: 'チアリーディング改', en: 'Cheerleading+' });
    expect(treasure.skills.skill1.values).toEqual([['9.99'], ['5']]);
    expect(treasure.skills.burst.id).toBe(2090351);
  });

  it('is stored on CharacterData (null when absent)', () => {
    expect(toCharacterData(emma('en'), emma('ja')).treasure).toBeNull();
    expect(toCharacterData(emma('en'), emma('ja'), treasure).treasure).toBe(treasure);
  });

  it('rejects a skill id that is not base + 50', () => {
    const bad = favorite('en');
    bad.favoriteitem_skill_group_data![0]!.info.id = 2090252;
    const badJa = favorite('ja');
    badJa.favoriteitem_skill_group_data![0]!.info.id = 2090252;
    expect(() => toTreasureData(bad, badJa, emma('en'))).toThrow(/not the treasure version/);
  });

  it('rejects missing or duplicated slots and ja/en mismatches', () => {
    expect(() => toTreasureData(favorite('en', [1, 2]), favorite('ja', [1, 2]), emma('en'))).toThrow(/3 distinct/);
    expect(() => toTreasureData(favorite('en', [1, 1, 2]), favorite('ja', [1, 1, 2]), emma('en'))).toThrow(
      /3 distinct/,
    );
    expect(() => toTreasureData(favorite('en', [1, 2, 3]), favorite('ja', [2, 1, 3]), emma('en'))).toThrow(/ja and en/);
  });

  it('finds the owner by name_code', () => {
    const roles = [
      { resource_id: 90, name_code: 5001 },
      { resource_id: 91, name_code: 5002 },
    ];
    expect(findTreasureOwner(favorite('en'), roles)?.resource_id).toBe(90);
    expect(findTreasureOwner({ id: 1, name_code: 9999 }, roles)).toBeNull();
    expect(() => findTreasureOwner(favorite('en'), [...roles, { resource_id: 92, name_code: 5001 }])).toThrow(
      /several characters \(90, 92\)/,
    );
  });
});

describe('checkOverloadMaster (Stage 13)', () => {
  const master: OverloadMaster = JSON.parse(
    readFileSync(new URL('../data/masters/overload.json', import.meta.url), 'utf8'),
  ) as OverloadMaster;
  // CDN の equip_option_table_v2 の形: オプションごとに 3 行 × state_effect 5 段。id 10 / 11 / 20 は OL 以外の古い行
  const cdn: RawEquipOption[] = [
    {
      id: 10,
      description_localkey: '「攻撃力増加」',
      state_effect_group_id: 1000,
      state_effect_id_list: [1, 2, 3, 4, 5],
    },
    ...master.options.flatMap((o, k) =>
      [1, 2, 3].map((row) => ({
        id: 1000000 + (k + 1) * 1000 + row,
        description_localkey: `「${o.name.ja}」`,
        state_effect_group_id: o.cdnGroupId,
        state_effect_id_list: [1, 2, 3, 4, 5].map((i) => 7000000 + k * 100 + row * 5 + i),
      })),
    ),
  ];

  it('accepts the hand-written table against the CDN option list', () => {
    expect(checkOverloadMaster(master, cdn)).toEqual([]);
  });

  it('reports a missing option, a renamed option and a level-count mismatch', () => {
    const extra = { ...cdn[1]!, id: 1010001, state_effect_group_id: 101000, description_localkey: '「新オプション」' };
    expect(checkOverloadMaster(master, [...cdn, extra])).toEqual([
      'group 101000 (新オプション): missing in overload master',
    ]);
    const renamed = cdn.map((r) =>
      r.state_effect_group_id === 100400 ? { ...r, description_localkey: '「攻撃」' } : r,
    );
    expect(checkOverloadMaster(master, renamed)).toEqual(['group 100400: master name 攻撃力増加 / CDN 攻撃']);
    const short = cdn.filter((r) => r.id !== 1004003);
    expect(checkOverloadMaster(master, short)).toEqual([
      'group 100400: CDN has 10 levels',
      'group 100400: master has 15 levels / CDN 10',
    ]);
  });
});
