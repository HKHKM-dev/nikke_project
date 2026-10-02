// 予測の固定（records/predictions/。plan/design-records-automation.md 3.2・3.5 節）: ファイルの検証、モデルの実行、観測値との突き合わせ、
// plan/verifications.md に足す行。
import { describe, expect, it } from 'vitest';
import {
  knownRids,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadVerifications,
  misplacedPredictions,
} from '../../../scripts/records-data.ts';
import { gradeCandidate, type Claim } from '../claims.ts';
import type { Observation } from '../observations.ts';
import {
  comparePredictions,
  observationsOfTarget,
  renderPredictionLines,
  runPredictions,
  todayLocal,
  validatePredictions,
  type PredictionFile,
} from '../predictions.ts';

const observations = loadObservations();
const predictions = loadPredictions();

const SETUP = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: false, condition: 'auto' as const };

function file(over: Partial<PredictionFile> = {}): PredictionFile {
  return {
    verification: 'V-0063',
    team: [{ rid: 307, controlled: true }],
    fixedSpec: true,
    hypotheses: [{ id: 'H1' }, { id: 'H2', override: { durationSeconds: 90 } }],
    targets: [
      { id: 'shots', model: 'sim', metric: 'shotCount', args: { slot: 1 }, setup: SETUP, observations: ['101-09'] },
      {
        id: 'total',
        model: 'sim',
        metric: 'slotTotalDamage',
        args: { slot: 1 },
        setup: SETUP,
        observations: ['101-01'],
      },
    ],
    predicted: null,
    ...over,
  };
}

const ctx = {
  verificationIds: new Set(loadVerifications().map((v) => v.id)),
  knownRids: knownRids(),
  observations,
};

describe('records/predictions', () => {
  it('the committed files pass validation and sit under their own names', () => {
    expect(misplacedPredictions()).toEqual([]);
    expect(validatePredictions(predictions, ctx)).toEqual([]);
  });

  it('rejects a missing verification, unknown metric, missing args, duplicate ids and stale predicted', () => {
    const bad = file({
      verification: 'V-9999',
      hypotheses: [{ id: 'H1' }, { id: 'H1' }],
      targets: [
        { id: 't', model: 'sim', metric: 'nope', setup: SETUP },
        { id: 't', model: 'calc', metric: 'shotCount', setup: SETUP },
      ],
      predicted: { at: '2026-10-02', commit: 'abc1234', values: { H9: { t: 1 } } },
    });
    const errors = validatePredictions([bad], ctx);
    expect(errors).toEqual(
      expect.arrayContaining([
        '予測 V-9999: 検証記録が無い',
        '予測 V-9999: 仮説の id が空か重複している: H1',
        '予測 V-9999: 指標の id が空か重複している: t',
        '予測 V-9999: 指標 t の metric nope が語彙に無い',
        '予測 V-9999: 指標 t の shotCount は calc の出力に無い',
        '予測 V-9999: 指標 t に引数 slot が要る',
        '予測 V-9999: predicted に無い仮説 H9 がある',
        '予測 V-9999: predicted に H1 の t が無い（records:predict で出し直す）',
      ]),
    );
  });

  it('runs the model per hypothesis and target, applying the override to the setup', () => {
    const f = file();
    const data = loadRecordsData(loadRecordingsFile(), [307]);
    const values = runPredictions(f, data);
    expect(values.H1!.shots).toBe(187);
    // H2 は 90 秒（override）なので発が減る
    expect(values.H2!.shots as number).toBeLessThan(187);
    expect(values.H2!.total as number).toBeLessThan(values.H1!.total as number);
  });

  it('links a target to observations by explicit ids or by the same metric・args・setup of the same verification', () => {
    const f = file();
    expect(observationsOfTarget(f, f.targets[1]!, observations).map((o) => o.id)).toEqual(['101-01']);
    // 101-01（slotTotalDamage・slot 1・近 A・B・録画 101 のジャンプの窓・source V-0063）が自動で結び付く。
    // 102-01 は setup の jumpWindows（録画 102 の窓）が違うので結び付かない（V-0086）
    const auto = {
      id: 'a',
      model: 'sim' as const,
      metric: 'slotTotalDamage',
      args: { slot: 1 },
      setup: { ...SETUP, nearLanding: ['A', 'B'] as ['A', 'B'], jumpWindows: '101-19' },
    };
    expect(observationsOfTarget(f, auto, observations).map((o) => o.id)).toEqual(['101-01']);
    const other = { ...f, verification: 'V-0001' };
    expect(observationsOfTarget(other, auto, observations)).toEqual([]);
  });

  it('compares predictions with observations and renders the lines for plan/verifications.md', () => {
    const f = file({
      predicted: {
        at: '2026-10-02',
        commit: 'abc1234def',
        values: { H1: { shots: 189, total: 29_000_000 }, H2: { shots: 170, total: 20_000_000 } },
      },
    });
    const cmp = comparePredictions(f, observations);
    expect(cmp.score.get('H1')).toEqual({ ok: 2, total: 2 });
    expect(cmp.score.get('H2')).toEqual({ ok: 0, total: 2 });
    const lines = renderPredictionLines(cmp);
    expect(lines[0]).toBe('  - 予測（2026-10-02、commit abc1234）との比べ:');
    expect(
      lines.some((l) =>
        l.includes('shots（shotCount）: 実測 189（101-09）。H1 189（+0、許容内）、H2 170（-19、**許容外**）'),
      ),
    ).toBe(true);
    expect(lines.at(-1)).toBe('    - 許容内の指標: H1 2/2・H2 0/2。合う仮説は H1 だけ');
  });

  it('says so when the prediction has not been produced yet, or no observation exists', () => {
    expect(renderPredictionLines(comparePredictions(file(), observations))[0]).toContain('まだ出していない');
    const f = file({
      targets: [
        {
          id: 'x',
          model: 'sim',
          metric: 'shotCount',
          args: { slot: 1 },
          setup: { ...SETUP, enemy: 'range-bigarms-wind' },
        },
      ],
      predicted: { at: '2026-10-02', commit: 'abc1234', values: { H1: { x: 1 }, H2: { x: 2 } } },
    });
    const lines = renderPredictionLines(comparePredictions(f, observations));
    expect(lines[1]).toBe('    - x（shotCount）: 実測なし。H1 1、H2 2');
    expect(lines).toHaveLength(2);
  });

  it('todayLocal uses the local date', () => {
    expect(todayLocal(new Date(2026, 9, 2, 1, 0, 0))).toBe('2026-10-02');
  });
});

describe('gradeCandidate（等級の候補）', () => {
  const claim = (basis: string): Claim => ({
    id: 'C-9999',
    text: 't',
    state: '確定',
    topic: '命中率・距離',
    grade: '推論',
    basis,
    model: '',
    replaces: [],
    updated: '2026-10-02',
    observations: [...basis.matchAll(/`([^`]+)`/g)].map((m) => m[1]!),
  });
  const residuals = new Map<string, { status: string; diff: number | null; value: number | number[]; metric?: string }>(
    [
      ['101-09', { status: 'ok', diff: 0, value: 189 }],
      ['102-09', { status: 'ok', diff: 1, value: 188 }],
      ['101-01', { status: 'ok', diff: 0.01, value: 29_066_175 }],
      ['074-08', { status: 'outside', diff: 0.05, value: 63_036_302 }],
      ['079-07', { status: 'ok', diff: 0.621, value: 10_854_092, metric: 'burstHitDamage' }],
      ['012-01', { status: 'ok', diff: -0.12, value: 47_172, metric: 'hitDamage' }],
      ['013-01', { status: 'ok', diff: 1.2, value: 47_172, metric: 'hitDamage' }],
      ['047-11', { status: 'ok', diff: 0.5, value: 1_200, metric: 'gaugeFullFrame' }],
    ],
  );
  it('is undefined without compared observations, 厳密一致 for an exact integer match, 反復実測 across recordings, else 単独実測', () => {
    expect(gradeCandidate(claim('verification.md Stage 2'), residuals)).toBeUndefined();
    expect(gradeCandidate(claim('`101-16`'), residuals)).toBeUndefined();
    expect(gradeCandidate(claim('`101-09`'), residuals)).toBe('厳密一致');
    expect(gradeCandidate(claim('`101-01`・`102-09`'), residuals)).toBe('反復実測');
    expect(gradeCandidate(claim('`101-01`'), residuals)).toBe('単独実測');
    expect(gradeCandidate(claim('`074-08`'), residuals)).toBe('単独実測');
    expect(gradeCandidate(claim('`101-09`'), residuals, new Set(['101-09']))).toBeUndefined();
  });
  it('counts a 1-hit value within 1 of the model as 厳密一致 (the model keeps fractions; 3.5 節)', () => {
    expect(gradeCandidate(claim('`079-07`'), residuals)).toBe('厳密一致');
    expect(gradeCandidate(claim('`012-01`'), residuals)).toBe('厳密一致');
    // 1 以上ずれた 1 ヒット、1 ヒットでない指標の端数の差は厳密一致にしない
    expect(gradeCandidate(claim('`013-01`'), residuals)).toBe('単独実測');
    expect(gradeCandidate(claim('`047-11`'), residuals)).toBe('単独実測');
  });
  it('an observation is a dummy for the type', () => {
    const o: Observation = observations[0]!;
    expect(o.id).toBeTruthy();
  });
});
