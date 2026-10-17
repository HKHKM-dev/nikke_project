// 比べる設定の拡張（plan/design-compare-setup-extension.md）: 遅れの表の上書き・手で撃ったバースト・予測の複数の編成・表示の時刻の指標
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { hexagonFrameOf } from '../../burst/schedule.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import { buildTeamInput, METRICS, validateObservations, type CompareSetup, type Observation } from '../observations.ts';
import { runPredictions, validatePredictions, type PredictionFile } from '../predictions.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'] };

function run(recording: string, extra: Partial<CompareSetup> = {}, values?: Map<string, number | number[]>) {
  const d = values === undefined ? data : { ...data, observationValues: values };
  const input = buildTeamInput(recordings.get(recording)!, { ...setup, ...extra }, d);
  return { input, result: runSimulation(input) };
}

function metric(name: string, r: ReturnType<typeof run>, args: Record<string, number | string | boolean>) {
  return METRICS[name]!.sim(r.result, { args, input: r.input as TeamInput });
}

describe('burstDelays（遅れの表の上書き）', () => {
  // 録画 400: フラワー（I）+ アドミ（II。遅れの表の行 C-0479 の 19f）+ アリス + サン
  it('removes, replaces and shifts the row of the delay table', () => {
    const base = metric('burstEffectDelay', run('400'), { slot: 2, n: 0 });
    expect(base).toBe(19);
    // 行を外すと、効果は本当の発動（印の 5f 前）
    expect(metric('burstEffectDelay', run('400', { burstDelays: [{ rid: 172, row: null }] }), { slot: 2, n: 0 })).toBe(
      -5,
    );
    // 行を置き換える
    const replaced = run('400', { burstDelays: [{ rid: 172, row: { hitFrames: 0, effectFrames: 7 } }] });
    expect(metric('burstEffectDelay', replaced, { slot: 2, n: 0 })).toBe(7);
    // 負の遅れ（印の 3f 前）と、本当の発動を起点にした遅れ
    expect(
      metric('burstEffectDelay', run('400', { burstDelays: [{ rid: 172, row: { hitFrames: 0, effectFrames: -3 } }] }), {
        slot: 2,
        n: 0,
      }),
    ).toBe(-3);
    expect(
      metric(
        'burstEffectDelay',
        run('400', { burstDelays: [{ rid: 172, row: { hitFrames: 0, effectFrames: 2, origin: 'activation' } }] }),
        { slot: 2, n: 0 },
      ),
    ).toBe(-3);
  });

  it('adds a row to a character without one, and refuses a frame before the activation', () => {
    // サン（308）は表に行が無い
    const added = run('400', { burstDelays: [{ rid: 304, row: { hitFrames: 20, effectFrames: 0 } }] });
    const plain = run('400');
    expect(metric('burstHitDelays', plain, { slot: 1, count: 1 })).toEqual([14]);
    expect(metric('burstHitDelays', added, { slot: 1, count: 1 })).toEqual([20]);
    expect(() => run('400', { burstDelays: [{ rid: 172, row: { hitFrames: 0, effectFrames: -6 } }] })).toThrow(
      /before the activation/,
    );
  });

  it('leaves the model unchanged without an override', () => {
    const a = run('400');
    const b = run('400', { burstDelays: [] });
    expect(b.result.totalDamage).toBe(a.result.totalDamage);
  });
});

describe('manualBursts（手で撃ったバースト）', () => {
  // 録画 263: エマ：TU 単騎・バーストを手で撃った（263-01 の I の発動のゲーム内のフレーム）
  it('fires the first step of each chain at the given frames and stops when they run out', () => {
    const frames = [1999, 4972, 8918];
    const values = new Map<string, number | number[]>([['263-01', frames]]);
    const { result } = run('263', { manualBursts: '263-01' }, values);
    expect(result.schedule!.activations.map((a) => a.frame)).toEqual(frames);
    const short = run('263', { manualBursts: '263-01' }, new Map([['263-01', [1999]]]));
    expect(short.result.schedule!.activations.map((a) => a.frame)).toEqual([1999]);
  });

  it('waits for the gauge when the given frame comes before it', () => {
    const auto = run('263').result.schedule!;
    const first = auto.gaugeFullFrames[0]!;
    const { result } = run('263', { manualBursts: 'x' }, new Map([['x', [1]]]));
    expect(result.schedule!.activations.map((a) => a.frame)).toEqual([first + 23]);
  });

  it('checks the referenced observation', () => {
    const observations: Observation[] = [
      {
        id: '263-90',
        recording: '263',
        kind: 'timing',
        use: 'record',
        value: [3, 2],
        description: 'x',
        source: 'V-0001',
      },
      {
        id: '263-91',
        recording: '263',
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
          setup: { ...setup, burst: false, manualBursts: '263-90' },
        },
      },
    ];
    const errors = validateObservations(observations, recordings, data.enemies);
    expect(errors).toContain('263-91: manualBursts は burst が false のときには書かない');
    expect(errors).toContain('263-91: manualBursts の観測値 263-90 の use は input');
    expect(errors).toContain('263-91: manualBursts の観測値 263-90 の値は昇順の 0 以上の整数の配列');
  });
});

describe('表示の時刻の指標', () => {
  // 録画 222: ココア（I）+ デルタ（II）+ ドレイク（III・操作）。2〜4 回目は CT が律速（222-21）
  it('ctEndToFullBurstStart is the model III from the CT end to 00.00', () => {
    const r = run('222');
    expect(metric('ctEndToFullBurstStart', r, { slot: 3, n: '1,2,3' })).toEqual([6, 6, 6]);
    expect(() => metric('ctEndToFullBurstStart', r, { slot: 3, n: 0 })).toThrow(/CT が律速でない/);
  });

  it('chainStepIntervals is 29 video frames between the true activations', () => {
    const r = run('222');
    expect(metric('chainStepIntervals', r, { n: 0 })).toEqual([29, 29]);
    const chain = r.result.schedule!.activations.slice(0, 3);
    expect(hexagonFrameOf(chain[2]!) - chain[2]!.frame).toBe(6);
  });
});

describe('予測の複数の編成', () => {
  const prediction: PredictionFile = {
    verification: 'V-0382',
    team: [{ rid: 311 }, { rid: 160, controlled: true }],
    fixedSpec: true,
    hypotheses: [{ id: 'H0' }],
    targets: [
      { id: 'file', model: 'sim', metric: 'burstCount', args: { slot: 1 }, setup },
      { id: 'rec', model: 'sim', metric: 'burstCount', args: { slot: 3 }, setup, recording: '222' },
      {
        id: 'team',
        model: 'sim',
        metric: 'burstCount',
        args: { slot: 3 },
        setup,
        team: [{ rid: 311 }, { rid: 20 }, { rid: 101, controlled: true, treasurePhase: 3 }],
      },
    ],
    predicted: null,
  };

  it('runs each target with its own team', () => {
    const values = runPredictions(prediction, data, recordings)['H0']!;
    expect(values['rec']).toBe(metric('burstCount', run('222'), { slot: 3 }));
    expect(values['team']).toBe(values['rec']);
    expect(typeof values['file']).toBe('number');
  });

  it('checks the recording and the team of a target', () => {
    const ctx = {
      verificationIds: new Set(['V-0382']),
      knownRids: new Set([311, 160, 20, 101]),
      observations: [],
      recordingIds: new Set(recordings.keys()),
    };
    expect(validatePredictions([prediction], ctx)).toEqual([]);
    const bad: PredictionFile = {
      ...prediction,
      targets: [
        { ...prediction.targets[1]!, recording: '99999' },
        { ...prediction.targets[2]!, id: 'both', recording: '222' },
        { ...prediction.targets[0]!, id: 'spec', fixedSpec: false },
      ],
    };
    expect(validatePredictions([bad], ctx)).toEqual([
      '予測 V-0382: 指標 rec の録画 99999 が無い',
      '予測 V-0382: 指標 both の recording は team・fixedSpec と一緒に書かない',
      '予測 V-0382: 指標 spec の fixedSpec は team と一緒に書く',
    ]);
  });
});
