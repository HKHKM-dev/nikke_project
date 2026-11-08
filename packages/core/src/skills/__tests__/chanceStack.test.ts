// トーブの基礎版編（plan/design-tove-base.md 2 節）: 確率のきっかけで付く、スタックする状態（スタック数の分布の期待値の小片）と、
// その読み込みの検査。分布は、乱数で多数回回した平均と突き合わせる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chanceStackLevelsAt, chanceStackPieces, type ChanceOpportunity } from '../chance.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/** 決まった種の擬似乱数（mulberry32。テストを決定的にする） */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 機会の列で 1 回引いた、フレームごとのスタック数（STACK_REFRESH 'all'。窓は [s, s + D)） */
function sampleStacks(ops: readonly ChanceOpportunity[], d: number, frames: number, k: number, rand: () => number) {
  const out = new Array<number>(frames).fill(0);
  let stacks = 0;
  let end = -1;
  let i = 0;
  for (let f = 0; f < frames; f++) {
    if (f >= end) stacks = 0;
    while (i < ops.length && ops[i]!.start === f) {
      if (rand() < ops[i]!.q) {
        stacks = Math.min(k, stacks + 1);
        end = f + d;
      }
      i++;
    }
    out[f] = stacks;
  }
  return out;
}

/** AR の連射に似た機会の列: 5f ごと、60 発ごとに 60f 休む。確率は p（命中の重みを混ぜるため、3 発に 1 発は p × 0.5） */
function burstyOpportunities(p: number, frames: number): ChanceOpportunity[] {
  const ops: ChanceOpportunity[] = [];
  let f = 3;
  let n = 0;
  while (f < frames) {
    ops.push({ start: f, q: n % 3 === 2 ? p * 0.5 : p });
    n++;
    f += n % 60 === 0 ? 65 : 5;
  }
  return ops;
}

describe('chanceStackPieces', () => {
  const frames = 3000;
  const d = 300;
  const k = 3;
  const ops = burstyOpportunities(0.05, frames);
  const pieces = chanceStackPieces(ops, d, frames, k);

  it('matches the average of many random runs (each level = probability of at least that many stacks)', () => {
    const runs = 8000;
    const rand = seeded(7);
    const atLeast = Array.from({ length: k }, () => new Array<number>(frames).fill(0));
    for (let r = 0; r < runs; r++) {
      const s = sampleStacks(ops, d, frames, k, rand);
      for (let f = 0; f < frames; f++) for (let level = 1; level <= s[f]!; level++) atLeast[level - 1]![f]! += 1 / runs;
    }
    let worst = 0;
    for (let f = 0; f < frames; f += 7) {
      const model = chanceStackLevelsAt(pieces, f, k);
      for (let level = 0; level < k; level++) worst = Math.max(worst, Math.abs(model[level]! - atLeast[level]![f]!));
    }
    // 8000 回の平均の揺れ（標準偏差は 0.006 以下）の 5σ 程度
    expect(worst).toBeLessThan(0.03);
  });

  it('gives a non-increasing probability by level, at most 1, with no overlapping pieces per level', () => {
    for (let f = 0; f < frames; f += 13) {
      const levels = chanceStackLevelsAt(pieces, f, k);
      for (let level = 1; level < k; level++) expect(levels[level]!).toBeLessThanOrEqual(levels[level - 1]! + 1e-12);
      expect(levels[0]!).toBeLessThanOrEqual(1);
    }
    for (let level = 1; level <= k; level++) {
      const own = pieces.filter((p) => p.stack === level);
      own.slice(1).forEach((p, i) => expect(p.start).toBeGreaterThanOrEqual(own[i]!.end));
    }
  });

  it('starts at the first opportunity and ends D after the last one', () => {
    expect(Math.min(...pieces.map((p) => p.start))).toBe(ops[0]!.start);
    expect(Math.max(...pieces.map((p) => p.end))).toBe(Math.min(frames, ops[ops.length - 1]!.start + d));
  });

  it('gives the same pieces when the opportunities are appended one by one (the incremental run)', () => {
    const grown: ChanceOpportunity[] = [];
    let last: ReturnType<typeof chanceStackPieces> = [];
    for (const o of ops) {
      grown.push(o);
      last = chanceStackPieces(grown, d, frames, k);
    }
    expect(last).toEqual(chanceStackPieces([...ops], d, frames, k));
  });

  it('is a single chain with q = 1 (deterministic stacks)', () => {
    const certain = [10, 20, 30, 400].map((start) => ({ start, q: 1 }));
    const got = chanceStackPieces(certain, 100, 1000, 3);
    expect(got).toEqual([
      { start: 10, end: 130, scale: 1, stack: 1 },
      { start: 20, end: 130, scale: 1, stack: 2 },
      { start: 30, end: 130, scale: 1, stack: 3 },
      { start: 400, end: 500, scale: 1, stack: 1 },
    ]);
  });
});

describe('確率のきっかけの付与の読み込み', () => {
  const raw = readJson<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(
    '../../../data/skills/192.json',
  );
  const withEffects = (slot: string, effects: Record<string, unknown>[]): unknown => {
    const copy = structuredClone(raw);
    copy.skills[slot]!.effects = effects;
    return copy;
  };
  const grant = raw.skills.skill1!.effects[0]!;

  it('reads the base Tove S1 grant with a chance trigger', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'state',
      state: 'temporaryModification',
      trigger: { count: 'normalShot', chanceRef: 1 },
    });
  });

  it('rejects fields that a chance grant cannot have', () => {
    expect(() =>
      parseSkillDefinition(
        withEffects('skill1', [{ ...grant, condition: { inFullBurst: true } }, raw.skills.skill1!.effects[1]!]),
      ),
    ).toThrow(/chance trigger cannot be combined with condition/);
    expect(() =>
      parseSkillDefinition(
        withEffects('skill1', [{ ...grant, durationRef: undefined, durationSeconds: 0, maxStacksRef: undefined }]),
      ),
    ).toThrow(/needs a duration|holds nothing/);
  });

  it('rejects a chance grant on the enemy or on targets chosen by the fire context', () => {
    const rest = raw.skills.skill1!.effects.slice(1);
    const read = (patch: Record<string, unknown>) => () =>
      parseSkillDefinition(withEffects('skill1', [{ ...grant, ...patch }, ...rest]));
    // 敵の付与は target: "allies" に読み替えてから残りの欄を読むが、確率のきっかけは読み替える前の target で止める
    const onEnemy = {
      ...grant,
      state: 'explosiveRound',
      target: 'enemy',
      maxStacksRef: undefined,
      contents: [{ stat: 'damageTaken', ref: 6 }],
    };
    expect(() => parseSkillDefinition(withEffects('skill1', [...raw.skills.skill1!.effects, onEnemy]))).toThrow(
      /skill1\.effects\[2\]\.target: a chance trigger cannot grant a state on the enemy/,
    );
    expect(read({ target: 'topAttack', targetCount: 1 })).toThrow(
      /topAttack cannot be used with a chance trigger \(the targets depend on the fire context\)/,
    );
  });

  it('rejects another grant of the chance state', () => {
    const other = {
      kind: 'state',
      state: 'temporaryModification',
      trigger: 'fullBurstStart',
      target: 'self',
      durationRef: 5,
      maxStacksRef: 4,
      claims: ['C-0987'],
    };
    expect(() => parseSkillDefinition(withEffects('skill2', [...raw.skills.skill2!.effects, other]))).toThrow(
      /"temporaryModification" is granted by a chance trigger, so it cannot have another grant/,
    );
  });

  it('rejects a reader of the chance state other than while and stacksFrom', () => {
    const reader = {
      kind: 'timed',
      trigger: 'fullBurstStart',
      target: 'self',
      stat: 'attack',
      ref: 1,
      durationRef: 2,
      condition: { selfState: { state: 'temporaryModification', present: true } },
      claims: ['C-0987'],
    };
    expect(() => parseSkillDefinition(withEffects('skill2', [reader]))).toThrow(
      /can only be read by while or stacksFrom/,
    );
    const applied = { ...reader, trigger: { applied: 'temporaryModification' }, condition: undefined };
    expect(() => parseSkillDefinition(withEffects('skill2', [applied]))).toThrow(
      /can only be read by while or stacksFrom/,
    );
  });
});
