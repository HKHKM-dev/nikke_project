// トリナ（412）の語彙（plan/design-trina.md 2 節）: 「スキル対象の説明部分が『敵全体に』で終わるバーストスキルダメージ▲」
// （allEnemiesBurstDamage と印 allEnemies）と、対象「部隊の一番左側にいる〈絞り込み〉の味方 1 機」（targetLeftmost）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { EnemyInput } from '../../damage.ts';
import type { CharacterData, SkillRaw } from '../../types.ts';
import { computeBurstHit, resolveBurstDamage, type ResolvedSkillDamage } from '../burstDamage.ts';
import { fixedTargetsOf } from '../composition.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from '../treasure.ts';
import type { SkillDefinition } from '../types.ts';

const same = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };
const burst: SkillRaw = {
  id: 3,
  name: { ja: 'バースト', en: 'Burst' },
  description: {
    ja:
      '■敵全体に\n<color=#00AEFF>「最終攻撃力の{description_value_01}％の\nバーストスキルダメージ」</color>\n' +
      '■攻撃範囲内の敵に\n「最終攻撃力の{description_value_02}％のダメージ」\n' +
      '■照準線に最も近い敵 1機に\n「最終攻撃力の{description_value_03}％のバーストスキルダメージ」',
    en: '',
  },
  values: [same('300'), same('200'), same('100')],
};
const character = makeCharacter({}, { resourceId: 7, skills: { skill1: empty, skill2: empty, burst } });
const definition: SkillDefinition = {
  formatVersion: 1,
  resourceId: 7,
  checkedAt: '2026-11-15',
  skills: {
    skill1: { support: 'unsupported', effects: [] },
    skill2: { support: 'unsupported', effects: [] },
    burst: {
      support: 'supported',
      effects: [
        { kind: 'burstDamage', ref: 1, damageType: 'skill' },
        { kind: 'burstDamage', ref: 2, damageType: 'skill' },
        { kind: 'burstDamage', ref: 3, damageType: 'skill' },
      ],
    },
  },
};

describe('resolveBurstDamage: allEnemies', () => {
  it('marks only the burstDamage whose line ends with 敵全体に', () => {
    const resolved = resolveBurstDamage(definition, character, MAX_SKILL_LEVELS);
    expect(resolved.map((r) => r.allEnemies)).toEqual([true, undefined, undefined]);
    expect(resolved.map((r) => r.oneEnemy)).toEqual([undefined, undefined, true]);
  });
});

describe('computeBurstHit: allEnemiesBurstDamage', () => {
  const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: false };
  const source = { resourceId: 7, skill: 'burst' as const, name: burst.name };
  const all: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 3, allEnemies: true };
  const other: ResolvedSkillDamage = { source, damageType: 'skill', multiplier: 2 };
  const hit = (attackDamageMultiplier: number, allEnemiesBurstDamage?: number) =>
    computeBurstHit({
      attack: 10100,
      enemy,
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier,
      elementMultiplier: 1,
      effects: [all, other],
      ...(allEnemiesBurstDamage === undefined ? {} : { allEnemiesBurstDamage }),
    });

  it('adds Σ to the attack damage sum of the marked hit only', () => {
    const base = hit(1);
    const up = hit(1, 4.356);
    expect(up.perEffect[0]!.expected).toBeCloseTo(base.perEffect[0]!.expected * 5.356, 6);
    expect(up.perEffect[1]!.expected).toBe(base.perEffect[1]!.expected);
    expect(up.allEnemiesBurstDamageMultiplier).toBeCloseTo(5.356, 12);
  });

  it('shares the sum with the attack damage up', () => {
    const base = hit(1.209);
    const up = hit(1.209, 4.356);
    expect(up.perEffect[0]!.expected / base.perEffect[0]!.expected).toBeCloseTo(5.565 / 1.209, 12);
  });

  it('is 1 without the buff', () => {
    expect(hit(1).allEnemiesBurstDamageMultiplier).toBe(1);
  });
});

describe('data: which burstDamage get the allEnemies mark', () => {
  // 説明文を取り込み直して対象の句が変わったら、ここで気づく（宝物版は宝物の説明文で決まる）
  it('marks the 敵全体に bursts of the defined characters, base and treasure', () => {
    const dir = new URL('../../../data/', import.meta.url);
    const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, dir), 'utf8'));
    const ids = (read('skills/index.json') as { resourceIds: number[] }).resourceIds;
    const marked: string[] = [];
    for (const id of ids) {
      const def = parseSkillDefinition(read(`skills/${id}.json`));
      const character = read(`characters/${id}.json`) as CharacterData;
      const variants: [string, SkillDefinition, CharacterData][] = [[`${id}`, def, character]];
      if (def.treasureSkills !== undefined && character.treasure !== null) {
        const applied = applyTreasure(character, def, TREASURE_PHASE_MAX);
        variants.push([`${id}t`, applied.definition!, applied.character]);
      }
      for (const [label, d, c] of variants)
        if (resolveBurstDamage(d, c, MAX_SKILL_LEVELS).some((r) => r.allEnemies === true)) marked.push(label);
    }
    expect(marked).toEqual([
      '19',
      '40',
      '103',
      '161',
      '170',
      '170t',
      '222',
      '223',
      '231',
      '271',
      '313',
      '353',
      '403',
      '581',
      '583',
      '831',
      '834',
      '870',
      '871',
    ]);
  });
});

function definitionWith(effect: Record<string, unknown>): unknown {
  const emptySlot = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-15',
    skills: { skill1: { effects: [effect] }, skill2: emptySlot, burst: emptySlot },
  };
}

const effectOf = (effect: Record<string, unknown>) =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

const timed = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'allies',
  targetWeapon: 'AR',
  targetElement: 'Electronic',
  targetLeftmost: true,
  stat: 'attackDamage',
  ref: 1,
  durationRef: 2,
};

describe('「部隊の一番左側にいる〈絞り込み〉の味方 1 機」（targetLeftmost）', () => {
  const ar = (element: CharacterData['element']) => makeCharacter({}, { weaponType: 'AR', element });
  const rl = makeCharacter({}, { weaponType: 'RL', element: 'Electronic' });

  it('targets the leftmost slot among those matching the filters, not only slot 1', () => {
    expect(fixedTargetsOf(effectOf(timed), [rl, ar('Water'), ar('Electronic'), ar('Electronic')], 0)).toEqual([2]);
    expect(fixedTargetsOf(effectOf(timed), [ar('Electronic'), rl, ar('Electronic')], 1)).toEqual([0]);
    // 空枠は数えない
    expect(fixedTargetsOf(effectOf(timed), [null, rl, null, ar('Electronic')], 1)).toEqual([3]);
  });

  it('has no target when no slot matches', () => {
    expect(fixedTargetsOf(effectOf(timed), [rl, ar('Water')], 0)).toEqual([]);
  });

  it('is only allowed as true with target allies, on timed, without other slot filters', () => {
    expect(() => parseSkillDefinition(definitionWith({ ...timed, targetLeftmost: false }))).toThrow(
      /targetLeftmost: must be true/,
    );
    const { targetWeapon: _w, targetElement: _e, ...unnarrowed } = timed;
    expect(() => parseSkillDefinition(definitionWith({ ...unnarrowed, target: 'self' }))).toThrow(
      /targetLeftmost: only allowed with target "allies"/,
    );
    for (const extra of [
      { targetBurstStep: 'Step1' },
      { targetSquad: 'same' },
      { excludeSelf: 'always' },
      { targetAdjacent: true },
    ]) {
      expect(() => parseSkillDefinition(definitionWith({ ...timed, ...extra }))).toThrow(/cannot be combined/);
    }
    const passive = { kind: 'passive', target: 'allies', targetLeftmost: true, stat: 'attack', ref: 1 };
    expect(() => parseSkillDefinition(definitionWith(passive))).toThrow(/targetLeftmost is only allowed in timed/);
  });
});
