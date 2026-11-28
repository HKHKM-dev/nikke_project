// 射撃の列がどの区間・グループにも 1 回ずつ入ることの確かめ（plan/design-workflow-simplification-20.md 1 節）:
// runSimulation は時間の区間ごとの発数の和を、simTeamResult はグループの区間で数えた発数の和を、枠の射撃の列の発数と比べて投げる
import { describe, expect, it } from 'vitest';
import { fixedTeam } from '../../__tests__/teamHelpers.ts';
import { assertEveryShotCounted } from '../../frame/shots.ts';
import { runSimulation } from '../engine.ts';
import { simTeamResult } from '../teamResult.ts';

// リター・デルタ・A2（A2 のモード B で区間が分かれる編成）
const input = fixedTeam([82, 20, 811], 2);

describe('assertEveryShotCounted', () => {
  it('passes when the counted shots equal the fired shots', () => {
    expect(() => assertEveryShotCounted('test', 0, 12, 12)).not.toThrow();
  });

  it('throws with the place, the slot and both counts when they differ', () => {
    expect(() => assertEveryShotCounted('test', 1, 11, 12)).toThrow(
      'test: slot 1 counted 11 shots in its ranges, but fired 12',
    );
  });
});

describe('simTeamResult', () => {
  const sim = runSimulation(input);

  it('accepts the result of runSimulation', () => {
    expect(() => simTeamResult(input, sim)).not.toThrow();
  });

  it('throws when the groups miss a segment that holds shots', () => {
    const first = sim.shots[0]!.frames[0]!;
    const segments = sim.timeline.segments.filter((s) => !(s.start <= first && first < s.end));
    expect(segments.length).toBe(sim.timeline.segments.length - 1);
    const broken = { ...sim, timeline: { ...sim.timeline, segments } };
    expect(() => simTeamResult(input, broken)).toThrow(/^simTeamResult: slot 0 counted \d+ shots in its ranges/);
  });
});
