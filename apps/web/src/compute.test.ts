// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: Worker が回す計算（compute.ts）。入力を構造化複製して渡しても
// 結果が変わらないこと、結果（ScreenResult）が構造化複製で崩れないこと、古い要求の結果を捨てる順番の決め方
import {
  FIXED_SPEC_ENEMY_DEFENCE,
  MAX_SKILL_LEVELS,
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  fixedSpecGrowth,
  parseSkillDefinition,
  runSimulation,
  simTeamResult,
  type CharacterData,
  type TeamInput,
  type TeamSlotInput,
} from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ComputeCache,
  LatestComputeQueue,
  compute,
  inputKey,
  respond,
  screenResult,
  type ComputeRequest,
  type ComputeResponse,
  type Computed,
} from './compute.ts';
import { DEFAULT_SLOT_CONDITION } from './team.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(
  readJson<{ resourceIds: number[] }>('../../../packages/core/data/skills/index.json').resourceIds,
);

// 画面のスペック固定の枠（calcView.ts の buildCalcView）と同じ作り方。条件は既定の自動
function fixedSpecSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../../packages/core/data/characters/${id}.json`);
  return {
    character,
    growth: fixedSpecGrowth(character),
    condition: DEFAULT_SLOT_CONDITION,
    conditionMode: 'auto',
    attackOverride: computeFixedSpecAttack(character).attack,
    hpOverride: computeFixedSpecHp(character),
    hpRatio: 1,
    defenceOverride: computeFixedSpecDefence(character),
    skills: DEFINED.has(id)
      ? {
          definition: parseSkillDefinition(readJson<unknown>(`../../../packages/core/data/skills/${id}.json`)),
          levels: MAX_SKILL_LEVELS,
          treasurePhase: 0,
        }
      : undefined,
  };
}

// 主力（plan/design-unify-sim-calc.md 3.1 節）。操作 3
const MAIN: TeamInput = {
  slots: [82, 330, 271, 870, 225].map(fixedSpecSlot),
  enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};

describe('compute (B-2)', () => {
  const direct = compute(MAIN);

  it('is the screen part of simTeamResult(runSimulation) on the main thread', () => {
    const full = simTeamResult(MAIN, runSimulation(MAIN));
    expect(direct).toEqual({ ok: true, result: screenResult(full) });
    expect(direct.ok && direct.result.totalDamage).toBe(full.totalDamage);
    expect(direct.ok && direct.result.slots.map((s) => s?.resourceId)).toEqual([82, 330, 271, 870, 225]);
  });

  it('gives the same result for a structured clone of the input, and the result survives a clone', () => {
    expect(compute(structuredClone(MAIN))).toEqual(direct);
    expect(structuredClone(direct)).toEqual(direct);
  });

  it('returns the error instead of throwing', () => {
    const bad: TeamInput = { ...MAIN, slots: [MAIN.slots[0]!, MAIN.slots[0]!] };
    const computed = compute(bad);
    expect(computed.ok).toBe(false);
    expect(computed.ok ? '' : computed.error).toContain('more than one slot');
  });

  it('answers the request with an error when the result cannot be posted, instead of throwing out of the worker', () => {
    const posted: ComputeResponse[] = [];
    respond({ seq: 7, input: MAIN }, (response) => {
      if (response.computed.ok) throw new DOMException('could not be cloned', 'DataCloneError');
      posted.push(response);
    });
    expect(posted).toEqual([
      { seq: 7, computed: { ok: false, error: '計算の結果を送れませんでした: could not be cloned' } },
    ]);

    const sent: ComputeResponse[] = [];
    respond({ seq: 8, input: MAIN }, (response) => sent.push(response));
    expect(sent).toEqual([{ seq: 8, computed: direct }]);
  });
});

describe('LatestComputeQueue (B-2)', () => {
  // 要求の元（画面では CalcView）。結果はこの元と組で届く
  const input = (durationSeconds: number) => ({ input: { ...MAIN, slots: [], durationSeconds } satisfies TeamInput });
  const done = (seq: number, durationSeconds: number) => ({
    seq,
    computed: { ok: false, error: `done ${durationSeconds}` } satisfies Computed,
  });

  function setup() {
    const sent: ComputeRequest[] = [];
    const delivered: Computed[] = [];
    const sources: ReturnType<typeof input>[] = [];
    const queue = new LatestComputeQueue<ReturnType<typeof input>>(
      (r) => sent.push(r),
      (c, source) => {
        delivered.push(c);
        sources.push(source);
      },
    );
    return { sent, delivered, sources, queue };
  }

  it('sends one request at a time and keeps only the latest input while busy', () => {
    const { sent, delivered, queue } = setup();
    queue.request(input(1));
    queue.request(input(2));
    queue.request(input(3));
    expect(sent.map((r) => r.input.durationSeconds)).toEqual([1]);
    expect(queue.busy).toBe(true);
    // 1 の結果は古いので捨て、最後の 3 を出す（2 は計算しない）
    queue.receive(done(sent[0]!.seq, 1));
    expect(delivered).toEqual([]);
    expect(sent.map((r) => r.input.durationSeconds)).toEqual([1, 3]);
    queue.receive(done(sent[1]!.seq, 3));
    expect(delivered).toEqual([{ ok: false, error: 'done 3' }]);
    expect(queue.busy).toBe(false);
  });

  it('delivers each result together with the source it was computed from', () => {
    const { sent, sources, queue } = setup();
    const first = input(1);
    queue.request(first);
    queue.receive(done(sent[0]!.seq, 1));
    // 元は同じオブジェクト（画面はこれといまの CalcView を比べて、結果が古いかを見る）
    expect(sources[0]).toBe(first);

    const last = input(5);
    queue.request(input(4));
    queue.request(last);
    queue.fail('worker failed');
    // エラーは最後に受けた元と組にする
    expect(sources[1]).toBe(last);
  });

  it('ignores a response to a request it is not waiting for', () => {
    const { sent, delivered, queue } = setup();
    queue.request(input(1));
    queue.receive(done(sent[0]!.seq + 1, 9));
    expect(delivered).toEqual([]);
    expect(queue.busy).toBe(true);
  });

  it('delivers an error when the input cannot be sent, and when the worker fails', () => {
    const delivered: Computed[] = [];
    const queue = new LatestComputeQueue(
      () => {
        throw new Error('could not be cloned');
      },
      (c) => delivered.push(c),
    );
    queue.request(input(1));
    expect(delivered).toEqual([{ ok: false, error: 'could not be cloned' }]);
    expect(queue.busy).toBe(false);

    const s = setup();
    s.queue.request(input(1));
    s.queue.request(input(2));
    s.queue.fail('worker failed');
    expect(s.delivered).toEqual([{ ok: false, error: 'worker failed' }]);
    expect(s.sources.map((x) => x.input.durationSeconds)).toEqual([2]);
    expect(s.queue.busy).toBe(false);
    s.queue.request(input(3));
    expect(s.sent.map((r) => r.input.durationSeconds)).toEqual([1, 3]);
  });

  it('answers every later input with the error once the worker has stopped, without sending it', () => {
    const { sent, delivered, queue } = setup();
    queue.request(input(1));
    queue.stop('worker stopped');
    expect(delivered).toEqual([{ ok: false, error: 'worker stopped' }]);
    // 止まった Worker に送ると答えが来ず、計算中のまま戻らない
    queue.request(input(2));
    expect(sent.map((r) => r.input.durationSeconds)).toEqual([1]);
    expect(queue.busy).toBe(false);
    expect(delivered).toEqual([
      { ok: false, error: 'worker stopped' },
      { ok: false, error: 'worker stopped' },
    ]);
  });

  it('delivers a remembered result at once, and drops the result of the request still in flight', () => {
    const { sent, delivered, sources, queue } = setup();
    queue.request(input(1));
    const known = input(2);
    queue.resolve(known, { ok: false, error: 'remembered 2' });
    expect(sources).toEqual([known]);
    expect(queue.busy).toBe(false);
    // 1 の結果は届いても古いので捨てる（覚えていた 2 の答えを上書きしない）。失敗も同じ
    queue.receive(done(sent[0]!.seq, 1));
    expect(delivered).toEqual([{ ok: false, error: 'remembered 2' }]);
    queue.request(input(3));
    queue.resolve(input(4), { ok: false, error: 'remembered 4' });
    queue.fail('lost');
    expect(delivered.map((c) => !c.ok && c.error)).toEqual(['remembered 2', 'remembered 4']);
  });

  it('sends the input that came after a remembered one when the stale request answers', () => {
    const { sent, delivered, queue } = setup();
    queue.request(input(1));
    queue.resolve(input(2), { ok: false, error: 'remembered 2' });
    queue.request(input(3));
    queue.receive(done(sent[0]!.seq, 1));
    expect(sent.map((r) => r.input.durationSeconds)).toEqual([1, 3]);
    queue.receive(done(sent[1]!.seq, 3));
    expect(delivered.map((c) => !c.ok && c.error)).toEqual(['remembered 2', 'done 3']);
  });
});

describe('ComputeCache', () => {
  const input = (over: Partial<TeamInput>): TeamInput => ({ ...MAIN, ...over });
  const result = (error: string): Computed => ({ ok: false, error });

  it('gives the same key to inputs with the same contents, and different keys to values JSON would merge', () => {
    expect(inputKey(input({}))).toBe(inputKey(structuredClone(input({}))));
    const withValue = (value: unknown) => inputKey(input({ extra: value } as Partial<TeamInput>));
    expect(withValue(new Map([[1, 2]]))).not.toBe(withValue(new Map()));
    expect(withValue(new Set([1]))).not.toBe(withValue(new Set()));
    expect(withValue(Infinity)).not.toBe(withValue(null));
    expect(withValue(NaN)).not.toBe(withValue(null));
    expect(withValue(undefined)).not.toBe(withValue(null));
  });

  it('finds a result by the contents of the input, and keeps the latest used ones', () => {
    const cache = new ComputeCache(2);
    cache.set(input({ durationSeconds: 1 }), result('1'));
    cache.set(input({ durationSeconds: 2 }), result('2'));
    // 別のオブジェクトでも中身が同じなら見つかる。見つけたものは新しく使ったことにする
    expect(cache.get(input({ durationSeconds: 1 }))).toEqual(result('1'));
    cache.set(input({ durationSeconds: 3 }), result('3'));
    expect(cache.get(input({ durationSeconds: 2 }))).toBeUndefined();
    expect(cache.get(input({ durationSeconds: 1 }))).toEqual(result('1'));
    expect(cache.get(input({ durationSeconds: 3 }))).toEqual(result('3'));
  });
});
