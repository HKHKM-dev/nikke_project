// 順位の対象の同値の向き（rankTie。plan/design-rank-tie-break.md 2.1 節）: 読み込みと並べ方
import { describe, expect, it } from 'vitest';
import { ZERO_BUFFS } from '../buffs.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { attackRankFor, rankByFinalAttack, tiedAtCutoff, type RankSlot } from '../ranking.ts';
import type { SkillEffect } from '../types.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-29',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const parse = (effect: Record<string, unknown>): SkillEffect =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

// ナガの S2 の形
const naga = {
  kind: 'timed',
  trigger: { count: 'normalShot', everyRef: 1 },
  target: 'topAttack',
  targetCountRef: 2,
  rankTie: 'lastSlot',
  stat: 'coreDamage',
  ref: 3,
  durationRef: 4,
};

describe('読み込み', () => {
  it('parses rankTie on the ranked targets of timed', () => {
    expect(parse(naga)).toMatchObject({ target: 'topAttack', rankTie: 'lastSlot' });
    expect(parse({ ...naga, target: 'lowestAttack' })).toMatchObject({ rankTie: 'lastSlot' });
    const { rankTie: _, ...plain } = naga;
    expect(parse(plain)).not.toHaveProperty('rankTie');
  });

  it('rejects rankTie on targets without a ranking, and unknown values', () => {
    const { targetCountRef: _, ...noCount } = naga;
    expect(() => parse({ ...noCount, target: 'allies' })).toThrow(/rankTie: only allowed with target "topAttack"/);
    expect(() => parse({ ...noCount, target: 'self' })).toThrow(/rankTie: only allowed with target "topAttack"/);
    expect(() => parse({ ...naga, rankTie: 'firstSlot' })).toThrow(/rankTie/);
  });
});

describe('並べ方', () => {
  const slot = (attack: number): RankSlot => ({
    casterBaseAttack: attack,
    weaponType: 'SG',
    element: 'Fire',
    passive: ZERO_BUFFS,
  });

  it('breaks ties by the later slot with lastSlot, by the earlier slot without it', () => {
    const finals = [200, 200, 300, 200];
    expect(rankByFinalAttack(finals)).toEqual([2, 0, 1, 3]);
    expect(rankByFinalAttack(finals, false, 'lastSlot')).toEqual([2, 3, 1, 0]);
    // 低い順でも同値の向きだけが変わる
    expect(rankByFinalAttack(finals, true)).toEqual([0, 1, 3, 2]);
    expect(rankByFinalAttack(finals, true, 'lastSlot')).toEqual([3, 1, 0, 2]);
  });

  it('applies the tie order before excludeSelf and the filters, and still marks the tie', () => {
    const slots = [slot(100), slot(100), slot(300), null];
    const finals = [100, 100, 300, null];
    // 2 機: 1 位の枠 2 と、同値の枠 0・1 の遅い方
    const rank = attackRankFor({ target: 'topAttack', rankTie: 'lastSlot' }, slots, finals, 0);
    expect(rank).toEqual([2, 1, 0]);
    expect(tiedAtCutoff(rank, finals, 2)).toBe(true);
    // 自分（枠 1）を除けば、残りの同値は枠 0 だけ
    expect(
      attackRankFor({ target: 'topAttack', rankTie: 'lastSlot', excludeSelf: 'always' }, slots, finals, 1),
    ).toEqual([2, 0]);
  });
});
