import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { predictionKey, runObservations, type Prediction } from '../src/records/observations.ts';
import { loadObservations, loadRecordingsFile, loadRecordsData, recordingMap } from './records-data.ts';
import { modelHash, openPredictionMemo, runObservationsCached } from './residual-cache.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const all = loadObservations();
// 比べる観測値のうち、条件がほかの観測値の ID を指すもの（0056-02 は jumpWindows に 0056-11）と、同じ録画のもの
const picked = all.filter((o) => o.recording === '0056');

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'residual-cache-'));
}

describe('modelHash', () => {
  it('changes with the content and the path of a file, and ignores __tests__', () => {
    const root = tempDir();
    mkdirSync(join(root, 'a/__tests__'), { recursive: true });
    writeFileSync(join(root, 'a/x.ts'), 'one');
    const first = modelHash([root]);
    writeFileSync(join(root, 'a/__tests__/x.test.ts'), 'test');
    expect(modelHash([root])).toBe(first);
    writeFileSync(join(root, 'a/x.ts'), 'two');
    const second = modelHash([root]);
    expect(second).not.toBe(first);
    writeFileSync(join(root, 'a/y.ts'), '');
    expect(modelHash([root])).not.toBe(second);
  });
});

describe('openPredictionMemo', () => {
  it('saves what was set, merges what another process saved, and keeps the 4 newest models', () => {
    const dir = tempDir();
    const a = openPredictionMemo(dir, 'm1');
    const b = openPredictionMemo(dir, 'm1');
    a.set('k1', { predicted: 1 });
    b.set('k2', { error: 'x' });
    a.save();
    b.save();
    const c = openPredictionMemo(dir, 'm1');
    expect(c.get('k1')).toEqual({ predicted: 1 });
    expect(c.get('k2')).toEqual({ error: 'x' });
    expect(c.get('k3')).toBeUndefined();
    expect([c.hits, c.misses]).toEqual([2, 1]);

    const old = Date.now() / 1000 - 1000;
    for (const [i, m] of ['m2', 'm3', 'm4', 'm5'].entries()) {
      const memo = openPredictionMemo(dir, m);
      memo.set('k', { predicted: i });
      memo.save();
      if (m === 'm2') utimesSync(join(dir, 'm1.json'), old, old);
    }
    expect(readdirSync(dir).sort()).toEqual(['m2.json', 'm3.json', 'm4.json', 'm5.json']);
  });
});

describe('runObservations with a memo', () => {
  it('gives the same residuals as without a memo, and runs nothing on the second time', () => {
    const dir = tempDir();
    const plain = runObservations(picked, recordings, data);
    expect(plain.filter((r) => r.status !== 'invalid').length).toBeGreaterThan(2);
    expect(runObservationsCached(picked, recordings, data, dir)).toEqual(plain);
    const memo = openPredictionMemo(dir, modelHash());
    expect(runObservations(picked, recordings, data, memo)).toEqual(plain);
    expect(memo.misses).toBe(0);
    expect(memo.hits).toBe(plain.filter((r) => r.status !== 'invalid').length);
  });

  it('uses the remembered prediction instead of running the model', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    const stored = new Map<string, Prediction>([[predictionKey(o, recordings.get('0056'), data), { predicted: 42 }]]);
    const [r] = runObservations([o], recordings, data, { get: (k) => stored.get(k), set: () => {} });
    expect(r!.predicted).toBe(42);
  });

  it('changes the key when an observation that the compare points to changes, but not the observation itself', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    expect(JSON.stringify(o.compare)).toContain('0056-11');
    const key = predictionKey(o, recordings.get('0056'), data);
    expect(predictionKey({ ...o, value: 0 }, recordings.get('0056'), data)).toBe(key);
    const values = new Map(data.observationValues);
    values.set('0056-11', [1, 2]);
    expect(predictionKey(o, recordings.get('0056'), { ...data, observationValues: values })).not.toBe(key);
  });

  it('remembers why it could not predict', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    const set: Prediction[] = [];
    const memo = { get: () => undefined, set: (_: string, p: Prediction) => void set.push(p) };
    const [r] = runObservations(
      [{ ...o, compare: { ...o.compare!, metric: 'no-such-metric' } }],
      recordings,
      data,
      memo,
    );
    expect(r).toMatchObject({ status: 'error', message: 'metric no-such-metric が語彙に無い' });
    expect(set).toEqual([{ error: 'metric no-such-metric が語彙に無い' }]);
  });
});
