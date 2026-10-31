// 2026-10-26 のデイリーレビューの指摘（テストの足りないところ）: 段 10・語彙はあるのに撮っていない効果の撮影（V-0503〜V-0510）で足した、
// 比べる設定 noBurstSlots と指標の、例外の道と値の形。どの指標も観測値の照合（observations.test.ts）を実データの 1 例で通るだけだった。
// 入力は、その指標を使う観測値と同じ録画・設定から作る
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import { buildTeamInput, METRICS, validateObservations, type CompareSetup, type Observation } from '../observations.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'] };

function run(recording: string, extra: Partial<CompareSetup> = {}) {
  const input = buildTeamInput(recordings.get(recording)!, { ...setup, ...extra }, data);
  return { input, result: runSimulation(input) };
}

function metric(name: string, r: ReturnType<typeof run>, args: Record<string, number | string | boolean>) {
  return METRICS[name]!.sim(r.result, { args, input: r.input as TeamInput });
}

describe('noBurstSlots（バーストを使わない枠）', () => {
  // 録画 0507: アニス：スター + ナガ（オートバースト OFF で、ナガは手で撃たなかった）
  it('drops the slot from the chain and maps the 1-based slot to 0-based', () => {
    const r = run('0507', { burst: true, noBurstSlots: [2] });
    expect(r.input.noBurstSlots).toEqual([1]);
    expect(r.result.schedule!.activations.some((a) => a.slotIndex === 1)).toBe(false);
    expect(run('0507', { burst: true }).result.schedule!.activations.some((a) => a.slotIndex === 1)).toBe(true);
  });

  it('needs the dynamic burst cycle', () => {
    const { input } = run('0507', { burst: true, noBurstSlots: [2] });
    expect(() => runSimulation({ ...input, burst: false })).toThrow(/noBurstSlots needs burst/);
    expect(() => runSimulation({ ...input, burstModel: 'fixed' })).toThrow(/needs the dynamic burst model/);
  });

  it('is validated against the team and the burst setting', () => {
    const observation = (id: string, extra: Partial<CompareSetup>): Observation => ({
      id,
      recording: '0507',
      kind: 'hit',
      use: 'compare',
      value: 1,
      description: 'x',
      source: 'V-0001',
      compare: {
        model: 'sim',
        metric: 'teamTotalDamage',
        args: {},
        tolerance: { abs: 1 },
        setup: { ...setup, ...extra },
      },
    });
    const errors = validateObservations(
      [
        observation('0507-91', { burst: true, noBurstSlots: [3] }),
        observation('0507-92', { burst: true, noBurstSlots: [0] }),
        observation('0507-93', { noBurstSlots: [2] }),
      ],
      recordings,
      data.enemies,
    );
    expect(errors).toContain('0507-91: noBurstSlots の枠 3 が編成の外');
    expect(errors).toContain('0507-92: noBurstSlots の枠 0 が編成の外');
    expect(errors).toContain('0507-93: noBurstSlots は burst が true のときだけ書く');
  });
});

describe('カウンタと状態の指標（ネオン：ビジョン・アイ。V-0503）', () => {
  // 録画 0671・0673: ネオン：ビジョン・アイは枠 3
  const r = run('0671', { burst: true });

  it('counterAtBursts gives the counter before each own burst, within its range', () => {
    const values = metric('counterAtBursts', r, { slot: 3, counter: 'firepowerGauge', count: 3 }) as number[];
    expect(values).toHaveLength(3);
    expect(values.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)).toBe(true);
    expect(() => metric('counterAtBursts', r, { slot: 3, counter: 'firepowerGauge', count: 99 })).toThrow(
      /バーストの発動が \d+ 回しか無い/,
    );
  });

  it('stateAppliedAtBursts gives 0 or 1 for each own burst', () => {
    const values = metric('stateAppliedAtBursts', r, { slot: 3, state: 'superFirepower' }) as number[];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === 0 || v === 1)).toBe(true);
    expect(() => metric('stateAppliedAtBursts', r, { slot: 3, state: 'superFirepower', count: 99 })).toThrow(
      /バーストの発動が \d+ 回しか無い/,
    );
  });

  it('stateStacksAtFullBurstEnds gives the stacks at each full burst end', () => {
    const r3 = run('0673', { burst: true });
    const values = metric('stateStacksAtFullBurstEnds', r3, { slot: 3, state: 'superFirepowerCharge' }) as number[];
    expect(values).toHaveLength(r3.result.schedule!.fullBurstWindows.length);
    expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    expect(() =>
      metric('stateStacksAtFullBurstEnds', r3, { slot: 3, state: 'superFirepowerCharge', count: 99 }),
    ).toThrow(/フルバーストが \d+ 回しか無い/);
  });

  it('refuses without a burst schedule', () => {
    const off = run('0671', { burst: false });
    for (const [name, args] of [
      ['counterAtBursts', { slot: 3, counter: 'firepowerGauge' }],
      ['stateAppliedAtBursts', { slot: 3, state: 'superFirepower' }],
      ['stateStacksAtFullBurstEnds', { slot: 3, state: 'superFirepowerCharge' }],
      ['burstActivationVideoFrames', { n: 1 }],
    ] as const) {
      expect(() => metric(name, off, args), name).toThrow(/バーストの時刻表が無い/);
    }
  });
});

describe('射撃の間・ヒットの遅れ・発動の動画のフレームの指標', () => {
  // 録画 0695: ベロータ（枠 2）のバーストのチャージ速度▲（V-0510）
  it('buffWindowShotIntervalMean averages the gaps inside or outside the window', () => {
    const r = run('0695', { burst: true });
    const args = { slot: 2, skill: 'burst', stat: 'chargeSpeed', minGap: 105, maxGap: 130 };
    for (const inside of [true, false]) {
      const mean = metric('buffWindowShotIntervalMean', r, { ...args, inside }) as number;
      expect(mean).toBeGreaterThanOrEqual(105);
      expect(mean).toBeLessThanOrEqual(130);
    }
    // チャージ速度▲の窓の中のほうが、発と発の間が短い
    expect(metric('buffWindowShotIntervalMean', r, { ...args, inside: true })).toBeLessThan(
      metric('buffWindowShotIntervalMean', r, { ...args, inside: false }) as number,
    );
    expect(() => metric('buffWindowShotIntervalMean', r, { ...args, stat: 'attack', inside: true })).toThrow(
      /窓が無い/,
    );
    expect(() => metric('buffWindowShotIntervalMean', r, { ...args, minGap: 200, inside: true })).toThrow(/間が無い/);
  });

  // 録画 0066: 枠 1 の S1 の回数トリガーの倍率ダメージ（V-0505・V-0506）
  it('skillHitShotDelay is the most common delay from the last own shot', () => {
    const r = run('0066', { burst: false });
    const delay = metric('skillHitShotDelay', r, { slot: 1, skill: 'skill1' }) as number;
    expect(Number.isInteger(delay) && delay >= 0).toBe(true);
    expect(() => metric('skillHitShotDelay', r, { slot: 1, skill: 'burst' })).toThrow(/発動が無い/);
  });

  // 録画 0665: エレグの S2（V-0504）
  it('burstActivationVideoFrames lists the first n activations in video order', () => {
    const r = run('0665', { burst: true });
    const frames = metric('burstActivationVideoFrames', r, { n: 3 }) as number[];
    expect(frames).toHaveLength(3);
    expect(frames.every((f, i) => i === 0 || f > frames[i - 1]!)).toBe(true);
    const all = r.result.schedule!.activations.length;
    expect(() => metric('burstActivationVideoFrames', r, { n: all + 1 })).toThrow(`発動が ${all} 回しかない`);
  });
});
