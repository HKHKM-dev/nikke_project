import { describe, expect, it } from 'vitest';
import { stateMatches, statesMatching, type NamedStateId } from '../../skills/states.ts';
import { enemyStateSpansHold } from '../plan.ts';

// 条件 enemyState の家族の判定は、1 パス目（ゲージの予約。skills/holders.ts の enemyStateAt が stateMatches で見る）と 2 パス目
// （ヒット。frame/plan.ts の enemyStateSpansHold）で同じ。いまは敵が持つ状態に家族が無いので、味方の家族（臨戦）の id を区間の表に
// 入れて、2 パス目の判定だけを直接見る（目録の表は書き換えない）
describe('enemyStateSpansHold（2 パス目の条件 enemyState）', () => {
  const spans = new Map<NamedStateId, { start: number; end: number }[]>([
    ['intoTheFraySereneMind', [{ start: 10, end: 20 }]],
    ['hacked', [{ start: 30, end: 40 }]],
  ]);

  it('holds for the root of a family while any member of the family is on', () => {
    expect(enemyStateSpansHold(spans, 'intoTheFray', 10)).toBe(true);
    expect(enemyStateSpansHold(spans, 'intoTheFray', 19)).toBe(true);
    expect(enemyStateSpansHold(spans, 'intoTheFray', 20)).toBe(false);
    expect(enemyStateSpansHold(spans, 'intoTheFray', 9)).toBe(false);
  });

  it('holds for a member or a state without a family only by its own spans', () => {
    expect(enemyStateSpansHold(spans, 'intoTheFraySereneMind', 15)).toBe(true);
    expect(enemyStateSpansHold(spans, 'intoTheFrayPenetrantWish', 15)).toBe(false);
    expect(enemyStateSpansHold(spans, 'hacked', 35)).toBe(true);
    expect(enemyStateSpansHold(spans, 'hacked', 15)).toBe(false);
  });

  it('uses the same rule as the first pass (stateMatches)', () => {
    for (const condition of ['intoTheFray', 'intoTheFraySereneMind', 'hacked'] as const) {
      for (const state of spans.keys()) {
        const own = new Map([[state, spans.get(state)!]]);
        const frame = spans.get(state)![0]!.start;
        expect(enemyStateSpansHold(own, condition, frame)).toBe(stateMatches(condition, state));
      }
      expect(statesMatching(condition).every((s) => stateMatches(condition, s))).toBe(true);
    }
  });
});
