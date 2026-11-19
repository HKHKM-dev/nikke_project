// sim-run.ts の --trace の行
import { beforeAll, describe, expect, it } from 'vitest';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from '../../src/__tests__/teamHelpers.ts';
import { runSimulation, type SimEvent } from '../../src/sim/engine.ts';
import { parseTraceKinds, TRACE_KINDS, traceKindOf, traceLines, traceText } from './trace.ts';

const ALL = new Set(['all']);

describe('parseTraceKinds', () => {
  it('splits the kinds, and reports the unknown ones', () => {
    expect(parseTraceKinds('shots, hits,,')).toEqual({ wanted: new Set(['shots', 'hits']), unknown: [] });
    expect(parseTraceKinds('all')).toEqual({ wanted: ALL, unknown: [] });
    expect(parseTraceKinds('all,foo,buffs,bar').unknown).toEqual(['foo', 'bar']);
    expect(parseTraceKinds('').wanted.size).toBe(0);
  });
});

describe('traceText', () => {
  it('writes one event as one line, with 1-based slots', () => {
    expect(traceText({ frame: 10, kind: 'trigger', slot: 0, fullBurst: false, damage: 1234.4 }, 3)).toBe(
      '枠1 発 3 1,234',
    );
    expect(traceText({ frame: 10, kind: 'trigger', slot: 1, fullBurst: true, damage: 99.5 }, 12)).toBe(
      '枠2 発 12（FB） 100',
    );
    expect(traceText({ frame: 10, kind: 'burst', slot: 2, step: 'Step3', damage: 5000000 }, 0)).toBe(
      '枠3 バースト Step3 5,000,000',
    );
    expect(traceText({ frame: 10, kind: 'gaugeFull' }, 0)).toBe('gaugeFull');
    expect(traceText({ frame: 10, kind: 'cooldownReduction', slot: 0, source: 4, amount: 120 }, 0)).toBe(
      '枠1 cooldownReduction 120（出どころ 枠5）',
    );
  });
});

describe('出来事の列', () => {
  let events: readonly SimEvent[];
  beforeAll(() => {
    // バフ・持続ダメージ・即時効果・倍率ダメージがそろう編成
    const slots = [82, 261, 191, 225, 260].map((id) =>
      fixedSlot(id, { conditionMode: 'auto', hp: true, defence: true }),
    );
    events = runSimulation({
      ...fixedTeam(slots, null, {
        durationSeconds: 30,
        enemy: rangeEnemyWithEvents({ element: null, durationSeconds: 30 }),
      }),
      trace: true,
    }).events;
  });

  it('maps every event to a known kind, and the team shows every kind', () => {
    const kinds = new Set(events.map(traceKindOf));
    expect([...kinds].sort()).toEqual([...TRACE_KINDS].sort());
  });

  it('writes every event when all kinds are wanted, each line with the frame and the second', () => {
    const lines = traceLines(events, ALL, 0, Infinity);
    expect(lines).toHaveLength(events.length);
    for (const line of lines) expect(line).toMatch(/^f\d+ \d+\.\d\ds \S/);
  });

  it('keeps only the wanted kinds and the frames in [start, end)', () => {
    const shots = events.filter((e) => e.kind === 'trigger');
    expect(traceLines(events, new Set(['shots']), 0, Infinity)).toHaveLength(shots.length);
    const inRange = events.filter((e) => e.frame >= 600 && e.frame < 1200);
    expect(traceLines(events, ALL, 600, 1200)).toHaveLength(inRange.length);
    expect(traceLines(events, new Set(['shots', 'hits']), 600, 1200)).toHaveLength(
      inRange.filter((e) => e.kind === 'trigger' || e.kind === 'skillHit').length,
    );
    expect(traceLines(events, new Set<string>(), 0, Infinity)).toEqual([]);
  });

  it('numbers the shots per slot from the start of the battle, also when the range starts later', () => {
    const start = 600;
    const first = events.find((e) => e.kind === 'trigger' && e.slot === 0 && e.frame >= start)!;
    const before = events.filter((e) => e.kind === 'trigger' && e.slot === 0 && e.frame < start).length;
    expect(before).toBeGreaterThan(0);
    const line = traceLines(events, new Set(['shots']), start, Infinity).find((l) => l.includes(' 枠1 発 '))!;
    expect(line).toMatch(new RegExp(`^f${first.frame} `));
    expect(line).toContain(` 枠1 発 ${before + 1}`);
  });
});
