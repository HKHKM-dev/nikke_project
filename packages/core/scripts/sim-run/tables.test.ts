// sim-run.ts の表の行と 1 行の文
import { beforeAll, describe, expect, it } from 'vitest';
import { fixedSlot, fixedTeam, RANGE_BIGARMS, rangeEnemyWithEvents } from '../../src/__tests__/teamHelpers.ts';
import { runSimulation, type SimResult } from '../../src/sim/engine.ts';
import { simTeamResult } from '../../src/sim/teamResult.ts';
import type { TeamInput, TeamResult, TeamSlotInput } from '../../src/team.ts';
import {
  activationRows,
  autoConditionRows,
  burstSummaryLine,
  chainTimeoutsLine,
  compositionRows,
  conditionNoteLines,
  conditionSkipsLine,
  cycleReport,
  delayedHitLines,
  dotLines,
  enemyEventsLine,
  fullBurstIntervalsLine,
  headerLine,
  instantRows,
  landingsLine,
  rankingRows,
  segmentRows,
  summaryRows,
  totalLine,
  type RunSettings,
} from './tables.ts';

const NUMBER = /^\d{1,3}(,\d{3})*$/;

const SETTINGS: RunSettings = {
  fixedSpec: true,
  build: undefined,
  manualBursts: undefined,
  enemyPresetId: undefined,
  conditionMode: 'auto',
  condition: { coreHitRate: 1, hitRate: 1 },
  midFar: undefined,
  near: undefined,
  far: undefined,
};

describe('headerLine', () => {
  const input = {
    durationSeconds: 180,
    burst: true,
    burstModel: 'dynamic' as const,
    controlledSlot: null,
    enemy: { defence: 100, element: null, hasCore: true },
  };

  it('writes the settings of a plain run', () => {
    expect(headerLine(input, 10589, SETTINGS)).toBe(
      'duration 180s (10589f), burst dynamic, fixed spec true, build none, controlled none (all AI), ' +
        'enemy custom defence 100, element none, conditions auto',
    );
  });

  it('writes what the arguments changed', () => {
    const line = headerLine(
      { ...input, controlledSlot: 1, enemy: { defence: 500, element: 'Fire', hasCore: true } },
      3530,
      {
        ...SETTINGS,
        fixedSpec: false,
        build: 'builds.json',
        manualBursts: '0263-01',
        enemyPresetId: 'range-bigarms-fire',
        midFar: 'B',
        near: ['A', 'B'],
        far: ['B', 'A'],
      },
    );
    expect(line).toBe(
      'duration 180s (3530f), burst dynamic (manual bursts 0263-01), fixed spec false, build builds.json, ' +
        'controlled slot 2, enemy range-bigarms-fire defence 500, element Fire, ' +
        'conditions auto (mid-far B) (near A,B) (far B,A)',
    );
  });

  it('writes the manual condition, and the burst that is off', () => {
    const line = headerLine({ ...input, burst: false }, 10589, {
      ...SETTINGS,
      conditionMode: 'manual',
      condition: { coreHitRate: 0.5, hitRate: 0.8 },
      // 手入力では、着地点の固定は出さない
      midFar: 'B',
    });
    expect(line).toContain('burst off, ');
    expect(line.endsWith('conditions manual (core 0.5, hit rate 0.8)')).toBe(true);
  });
});

describe('landingsLine・enemyEventsLine', () => {
  it('names a landing by its band, a mix as a mix, and a span without a landing as unmeasured', () => {
    const landing = RANGE_BIGARMS.landings[0]!;
    const mix = Object.keys(RANGE_BIGARMS.mixes)[0]!;
    const line = landingsLine(
      [
        { start: 0, end: 600, landing: landing.id, band: landing.band },
        { start: 600, end: 1200, landing: mix, band: null },
        { start: 1200, end: 1800, landing: null, band: null },
      ] as TeamResult['landings'],
      RANGE_BIGARMS,
    );
    expect(line).toMatch(new RegExp(`^landings 0\\.0-\\d+\\.\\ds \\S.* \\[${landing.id}\\], `));
    expect(line).toMatch(/s \S.* \(mix\), /);
    expect(line.endsWith('s unmeasured')).toBe(true);
  });

  it('lists the events, with the jump windows when they were given', () => {
    const events = [
      { kind: 'untargetable' as const, start: 32.4, end: 34.4 },
      { kind: 'untargetable' as const, start: 68.71, end: 70.71 },
    ];
    expect(enemyEventsLine(['range-3min-jump'], undefined, events)).toBe(
      'enemy events range-3min-jump: untargetable 32.4-34.4s, untargetable 68.7-70.7s',
    );
    expect(enemyEventsLine(['a', 'b'], '0056-11', [])).toBe('enemy events a, b (jump windows 0056-11): ');
  });
});

describe('conditionSkipsLine', () => {
  it('counts the skips of the slot, and is undefined without one', () => {
    const skips = [
      { frame: 60, sourceSlotIndex: 1 },
      { frame: 120, sourceSlotIndex: 0 },
      { frame: 180, sourceSlotIndex: 1 },
    ] as unknown as TeamResult['history']['conditionSkips'];
    expect(conditionSkipsLine(skips, 1)).toBe('condition skips: 2 (1.02, 3.06s)');
    expect(conditionSkipsLine(skips, 2)).toBeUndefined();
  });
});

describe('計算の結果から作る行', () => {
  // 持続ダメージ（261）・段の循環（225）・最終攻撃力の順位・即時効果・遅れのある倍率ダメージがそろう編成
  const IDS = [82, 261, 191, 225, 260];
  let slots: TeamSlotInput[];
  let input: TeamInput;
  let sim: SimResult;
  let result: TeamResult;
  beforeAll(() => {
    slots = IDS.map((id) => fixedSlot(id, { conditionMode: 'auto', hp: true, defence: true }));
    input = fixedTeam(slots, null, { enemy: rangeEnemyWithEvents({ element: null }) });
    sim = runSimulation(input);
    result = simTeamResult(input, sim);
  });

  it('summarizes the bursts, and lists every activation', () => {
    const schedule = result.schedule!;
    const line = burstSummaryLine(schedule, result.burstSummary!, slots);
    expect(line).toMatch(
      /^full bursts \d+ \(first \d+\.\d\ds, mean cycle \d+\.\d\ds, uptime \d+\.\d{3}%\), activations \d+, chain timeouts \d+; I: slot \d /,
    );
    expect(line).toContain(
      `I: slot 1 ${slots[0]!.character.name.ja}, II: slot 2 ${slots[1]!.character.name.ja}, III: slot 3 `,
    );

    const rows = activationRows(schedule, slots);
    expect(rows).toHaveLength(schedule.activations.length);
    expect(rows.map((r) => r.frame)).toEqual(schedule.activations.map((a) => a.frame));
    const opening = rows.filter((r) => r.fullBurst !== '');
    expect(opening).toHaveLength(schedule.fullBurstWindows.length);
    for (const row of opening) {
      expect(row.fullBurst).toMatch(/^start \(\d+\.\ds\)$/);
      expect(row.burstUsers).toMatch(/^\d(,\d)*$/);
    }
    for (const row of rows) expect(['I', 'II', 'III']).toContain(row.step);

    const intervals = fullBurstIntervalsLine(schedule);
    expect(intervals.startsWith('full burst intervals ')).toBe(true);
    expect(intervals.match(/\d+\.\d\ds/g)).toHaveLength(schedule.fullBurstWindows.length - 1);
    expect(chainTimeoutsLine({ ...schedule, chainTimeouts: [60, 600] })).toBe('chain timeouts at 1.02s, 10.20s');
  });

  it('lists the top-attack rankings once per fire and targets', () => {
    expect(result.history.rankings.length).toBeGreaterThan(0);
    const rows = rankingRows(result.history.rankings, slots);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(result.history.rankings.length);
    expect(new Set(rows.map((r) => `${r.frame} ${r.from} ${r.targets}`)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.from).toMatch(/^slot \d (skill1|skill2|burst)$/);
      expect(row.targets).toMatch(/^slot \d .+ \d[\d,]*( \/ slot \d .+ \d[\d,]*)*$/);
    }
  });

  it('merges the instant effects of the same frame, kind and slot, keeping the total amount', () => {
    expect(sim.instants.length).toBeGreaterThan(0);
    const rows = instantRows(sim.instants, slots);
    expect(rows.length).toBeLessThanOrEqual(sim.instants.length);
    expect(new Set(rows.map((r) => `${r.time} ${r.kind} ${r.to}`)).size).toBe(rows.length);
    const total = (list: readonly { amount: number }[]) => list.reduce((sum, x) => sum + x.amount, 0);
    expect(total(rows)).toBeCloseTo(total(sim.instants), 6);
  });

  it('writes one summary row per slot, and the total', () => {
    const rows = summaryRows(slots, sim, result);
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.name)).toEqual(slots.map((s) => s.character.name.ja));
    expect(Object.keys(rows[0]!)).toEqual([
      'slot',
      'name',
      'weapon',
      'burst',
      'treasure',
      'attack',
      'normal (nonFB/FB triggers)',
      'segments',
      'burst skill',
      'skill hits',
      'total',
      'share',
    ]);
    for (const [i, row] of rows.entries()) {
      expect(row.total).toBe(Math.round(result.slots[i]!.totalDamage).toLocaleString('en-US'));
      expect(row.attack).toMatch(NUMBER);
      expect(row['normal (nonFB/FB triggers)']).toMatch(/^\d[\d,]* \(\d+\/\d+\)$/);
      expect(row['burst skill']).toMatch(/^\d[\d,]* \(\d+× \d[\d,]*\)$/);
      expect(row['skill hits']).toMatch(/^\d[\d,]* \(\d+×\)$/);
      expect(row.share).toMatch(/^\d+\.\d{3}%$/);
      // 宝物なしの枠
      expect(row.treasure).toBe('-');
    }
    expect(totalLine(result)).toBe(`TOTAL ${Math.round(result.totalDamage).toLocaleString('en-US')}`);
  });

  it('shows the treasure phase and its slots', () => {
    // 宝物のあるキャラ（141）を段階 2 で回す
    const treasure = [fixedSlot(141, { conditionMode: 'auto', hp: true, defence: true, treasurePhase: 2 })];
    const team = fixedTeam(treasure, null, { enemy: rangeEnemyWithEvents({ element: null }) });
    const run = runSimulation(team);
    expect(summaryRows(treasure, run, simTeamResult(team, run))[0]!.treasure).toMatch(/^2 \(\w+\+\w+\)$/);
  });

  it('lists the auto conditions and the condition notes of the slots', () => {
    const rows = autoConditionRows(result, slots);
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5]);
    for (const row of rows) {
      expect(row['core hit rate']).toMatch(/^\d\.\d{4}$/);
      expect(row['bullet hit rate']).toMatch(/^\d\.\d{4}$/);
      expect(row['distance bonus']).toMatch(/^\d+\.\d{3}%$/);
      expect(row.shots).toBeGreaterThan(0);
    }
    for (const line of conditionNoteLines(result)) expect(line).toMatch(/^ {2}\[slot \d\] \w+: \S/);

    // 手入力の条件の枠には、自動の条件の行が無い
    const manual = [fixedSlot(82)];
    const team = fixedTeam(manual, null);
    expect(autoConditionRows(simTeamResult(team, runSimulation(team)), manual)).toEqual([]);
  });

  it('writes one row per segment, with the effects that hold in it', () => {
    for (const [i, slot] of slots.entries()) {
      const c = result.slots[i]!;
      const rows = segmentRows(slot, c);
      expect(rows).toHaveLength(c.segments.length);
      expect(rows.map((r) => r.triggers)).toEqual(c.segments.map((g) => g.triggers));
      for (const row of rows) {
        expect(row.ranges).toMatch(/^\d+\.\d-\d+\.\ds( \d+\.\d-\d+\.\ds)*$/);
        expect(row.damage).toMatch(NUMBER);
        expect(String(row.perTrigger)).toMatch(/^\d[\d,]*( \(\d[\d,]*(\+\d[\d,.]*)+\))?$/);
        expect(row.timed).not.toMatch(/undefined|NaN|\[object/);
      }
    }
    const timed = slots.flatMap((slot, i) => segmentRows(slot, result.slots[i]!).map((r) => String(r.timed)));
    // 持続バフはきっかけ、同じ効果の段は ×N
    expect(timed.some((t) => /(^|, )burstUse \w+[+-]\d/.test(t))).toBe(true);
    expect(timed.some((t) => /% ×\d+/.test(t))).toBe(true);
  });

  it('shows the multiplier of one shot in the windows of a weapon change', () => {
    // バーストで使用武器が変わるキャラ（260）を、バーストが回る編成に入れる
    const trio = [82, 261, 260].map((id) => fixedSlot(id, { conditionMode: 'auto', hp: true, defence: true }));
    const team = fixedTeam(trio, null, { enemy: rangeEnemyWithEvents({ element: null }) });
    const weapon = segmentRows(trio[2]!, simTeamResult(team, runSimulation(team)).slots[2]!).map((r) =>
      String(r.weapon),
    );
    expect(weapon.some((w) => /^\d+\.\d\d%$/.test(w))).toBe(true);
    expect(weapon.some((w) => w === '')).toBe(true);
  });

  it('labels the contents of a state and the effects of a counter by what holds them', () => {
    // 状態の中身と、カウンタが N 以上の間だけ効く常時の効果を持つキャラ（103）
    const solo = [fixedSlot(103, { conditionMode: 'auto', hp: true, defence: true })];
    const team = fixedTeam(solo, null, { enemy: rangeEnemyWithEvents({ element: null }) });
    const timed = segmentRows(solo[0]!, simTeamResult(team, runSimulation(team)).slots[0]!).map((r) => String(r.timed));
    expect(timed.some((t) => /(^|, )while:[A-Za-z]+ \w+[+-]\d/.test(t))).toBe(true);
    expect(timed.some((t) => /(^|, )while:[A-Za-z]+>=\d+ \w+[+-]\d/.test(t))).toBe(true);
  });

  it('breaks down the cycle tiers, the dots and the delayed hits of the slots that have them', () => {
    const cycles = slots.map((_, i) => cycleReport(i, result.slots[i]!, sim, result));
    expect(cycles.map((c) => c !== undefined)).toEqual([false, false, false, true, false]);
    expect(cycles[3]!.line).toMatch(/^cycle tiers: A \d+\.\d\d% ×\d+ = \d[\d,]*(, [B-Z] \d+\.\d\d% ×\d+ = \d[\d,]*)*$/);
    for (const row of cycles[3]!.rows) expect(row.window).toMatch(/^\d+\.\d\d-\d+\.\d\ds$/);

    const dots = slots.map((_, i) => dotLines(result.slots[i]!));
    expect(dots.map((d) => d.length > 0)).toEqual([false, true, false, false, false]);
    for (const line of dots[1]!) {
      expect(line).toMatch(
        /^(dot|autoAttack) (skill1|skill2|burst)\.\d+: \d+\.\d\d%(\/stack \(max \d+\))? ×\d+ ticks = \d[\d,]* \(ticks at \d+\.\d\d(, \d+\.\d\d)*s\)/,
      );
    }

    for (const [i, c] of result.slots.entries()) {
      const delayed = c!.skillHits.activations.filter((a) => a.effect.delayFrames !== undefined);
      const lines = delayedHitLines(c!);
      expect(lines.length > 0, `slot ${i + 1}`).toBe(delayed.length > 0);
      for (const line of lines) {
        expect(line).toMatch(
          /^delayed hit (skill1|skill2|burst)\.\d+: \d+\.\d\d% \+\d+f after \S+ ×\d+ = \d[\d,]* \(at \d+\.\d\d(, \d+\.\d\d)*s\)$/,
        );
      }
    }
    expect(result.slots.some((c) => delayedHitLines(c!).length > 0)).toBe(true);
  });
});

describe('compositionRows', () => {
  it('lists the effects with a composition condition, and whether they apply in the team', () => {
    // 編成の条件のある効果を持つキャラ（271）
    const withCondition = [271, 82].map((id) => fixedSlot(id));
    const rows = compositionRows(withCondition, null);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.slot).toBe(`slot 1 ${withCondition[0]!.character.name.ja}`);
      expect(row.effect).toMatch(/^(skill1|skill2|burst)\[\d+\] \w+( \w+)?$/);
      expect(row.condition).not.toBe('');
      expect(typeof row.applies).toBe('boolean');
    }
  });

  it('is empty for a team without such effects, and for slots without a definition', () => {
    expect(compositionRows([fixedSlot(82, { definition: null })], null)).toEqual([]);
    const all = compositionRows(
      [82, 261, 191, 225, 260].map((id) => fixedSlot(id)),
      null,
    );
    for (const row of all) expect(row.condition).not.toBe('');
  });
});
