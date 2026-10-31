import { mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { predictionKey, runObservations, type Prediction } from '../src/records/observations.ts';
import { loadObservations, loadRecordingsFile, loadRecordsData, recordingMap } from './records-data.ts';
import { MODEL_ROOTS, modelHash, openPredictionMemo, runObservationsCached } from './residual-cache.ts';

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

describe('the inputs of the memo key', () => {
  /** ファイルから相対の import で辿れるファイル（予測に効くコード） */
  function reachable(entry: string): string[] {
    const seen = new Set<string>();
    const visit = (path: string) => {
      if (seen.has(path)) return;
      seen.add(path);
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) visit(resolve(dirname(path), m[1]!));
    };
    visit(entry);
    return [...seen];
  }

  it('hashes every file of the code that reads the records and runs the model', () => {
    const entry = fileURLToPath(new URL('./residual-cache.ts', import.meta.url));
    const files = reachable(entry);
    expect(files.length).toBeGreaterThan(10);
    const covered = (f: string) => MODEL_ROOTS.some((r) => (r.endsWith('/') ? f.startsWith(r) : f === r));
    expect(files.filter((f) => !covered(f))).toEqual([]);
  });

  it('hashes a file given as a root', () => {
    const root = tempDir();
    writeFileSync(join(root, 'x.ts'), 'one');
    const first = modelHash([join(root, 'x.ts')]);
    writeFileSync(join(root, 'x.ts'), 'two');
    expect(modelHash([join(root, 'x.ts')])).not.toBe(first);
  });

  it('changes the key with the recording, the setup and the args', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    const recording = recordings.get('0056')!;
    const key = predictionKey(o, recording, data);
    expect(predictionKey(o, { ...recording, team: recording.team.slice(1) }, data)).not.toBe(key);
    expect(
      predictionKey({ ...o, compare: { ...o.compare!, setup: { ...o.compare!.setup, burst: true } } }, recording, data),
    ).not.toBe(key);
    expect(predictionKey({ ...o, compare: { ...o.compare!, args: { slot: 2 } } }, recording, data)).not.toBe(key);
    expect(predictionKey({ ...o, compare: { ...o.compare!, metric: 'other' } }, recording, data)).not.toBe(key);
  });

  it('keeps the recording ID in the key when the recording is missing', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    expect(predictionKey({ ...o, recording: 'x1' }, undefined, data)).not.toBe(
      predictionKey({ ...o, recording: 'x2' }, undefined, data),
    );
    const stored = new Map<string, Prediction>();
    const memo = { get: (k: string) => stored.get(k), set: (k: string, p: Prediction) => void stored.set(k, p) };
    const residuals = runObservations(
      [
        { ...o, id: 'x1-01', recording: 'x1' },
        { ...o, id: 'x2-01', recording: 'x2' },
      ],
      recordings,
      data,
      memo,
    );
    expect(residuals.map((r) => r.message)).toEqual(['録画 x1 が無い', '録画 x2 が無い']);
  });
});

describe('runObservations on a draft', () => {
  it('reports a compare without a tolerance as an error instead of throwing', () => {
    const o = picked.find((x) => x.id === '0056-02')!;
    const draft = { ...o, compare: { ...o.compare!, tolerance: undefined as never } };
    for (const memo of [undefined, { get: () => ({ predicted: 1 }), set: () => {} }]) {
      const [r] = runObservations([draft], recordings, data, memo);
      expect(r).toMatchObject({ status: 'error', predicted: null, diff: null });
    }
  });
});
