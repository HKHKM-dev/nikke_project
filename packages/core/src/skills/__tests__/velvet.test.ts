// ベルベット編（plan/design-velvet.md 2 節）: カウンタの弾丸ポーチ（補充と、足りなければ起きない消費）、timed の条件
// 「フルバースト状態でなければ」（inFullBurst: false）と攻撃力の条件 inFullBurst の語彙の検証と、単騎の S1 の動き
import { describe, expect, it } from 'vitest';
import { effectWindows, fixedTeam, rawDefinition, skillValueOf } from '../../__tests__/teamHelpers.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { counterMax } from '../counters.ts';
import { parseSkillDefinition } from '../types.ts';

const VELVET = 316;
const raw = rawDefinition(VELVET);

// 条件 inFullBurst の読み込みの規則は trueDamageElement.test.ts で見る。ここではベルベットの定義が読めることと、読んだ形を見る
describe('語彙の検証', () => {
  it('accepts the definition, with inFullBurst false on the S1 attack up and true on the S2 attack up', () => {
    const def = parseSkillDefinition(raw);
    const attackOf = (slot: 'skill1' | 'skill2') =>
      def.skills[slot].effects.find((e) => e.kind === 'timed' && e.stat === 'attack');
    expect(attackOf('skill1')).toMatchObject({ condition: { inFullBurst: false } });
    expect(attackOf('skill2')).toMatchObject({ condition: { inFullBurst: true } });
  });

  it('caps the Ammo Pouch at the stored maximum of the description (6000)', () => {
    expect(counterMax('ammoPouch')).toBe(skillValueOf(VELVET, 'skill1', 3));
  });
});

describe('単騎（オートバースト OFF）', () => {
  const plan = planTeamRun(fixedTeam([VELVET], 0, { burst: false }));
  const shots = plan.shots[0]!.frames;
  const pouch = skillValueOf(VELVET, 'skill1', 2);
  const cost = skillValueOf(VELVET, 'skill1', 4);
  const charges = pouch / cost;
  const duration = gameSecondsToFrames(skillValueOf(VELVET, 'skill1', 6));

  it('fires more full charges than the pouch can pay for', () => {
    expect(shots.length).toBeGreaterThan(charges);
  });

  for (const stat of ['attack', 'attackDamage']) {
    it(`gives the S1 ${stat} up from the frame after each of the first ${charges} full charges, then stops (6000 / 100)`, () => {
      const windows = effectWindows(plan, 0, { resourceId: VELVET, skill: 'skill1', stat });
      expect(windows[0]!.start).toBe(shots[0]! + 1);
      expect(windows.at(-1)!.end).toBe(shots[charges - 1]! + 1 + duration);
      // 払えた発の次のフレームはどれも窓の中、払えなかった発の次のフレームは窓の外
      const covered = (f: number) => windows.some((w) => w.start <= f && f < w.end);
      expect(shots.slice(0, charges).every((f) => covered(f + 1))).toBe(true);
      expect(shots.slice(charges).some((f) => covered(f + 1))).toBe(false);
    });
  }
});
