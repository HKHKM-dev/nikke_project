import { describe, expect, it } from 'vitest';
import { toCharacterData, toIndexEntry, type RawRoleData, type RawSkillDetail } from './normalize.ts';

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
    original_rare: 'SSR',
    class: 'Supporter',
    corporation: 'ELYSION',
    use_burst_skill: 'Step1',
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
    },
    skill1_detail: skill(2090101, ja ? 'チアリーディング' : 'Cheerleading', [['5.92', '6.46'], ['5', '5'], undefined]),
    skill2_detail: skill(2090201, 'S2', []),
    ulti_skill_detail: skill(1090301, 'Burst', [['10']]),
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
