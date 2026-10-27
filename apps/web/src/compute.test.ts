// (B) の段 B-2（plan/design-unify-sim-calc.md 6.2 節）: Worker が回す計算（compute.ts）。入力を構造化複製して渡しても
// 結果が変わらないこと、結果（TeamResult）が構造化複製で崩れないこと、古い要求の結果を捨てる順番の決め方
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
import { LatestComputeQueue, compute, type ComputeRequest, type Computed } from './compute.ts';
import { DEFAULT_SLOT_CONDITION } from './team.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(
  readJson<{ resourceIds: number[] }>('../../../packages/core/data/skills/index.json').resourceIds,
);

// 画面のスペック固定の枠（App.tsx の slotInputs）と同じ作り方。条件は既定の自動
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

  it('is the same as simTeamResult(runSimulation) on the main thread', () => {
    expect(direct).toEqual({ ok: true, result: simTeamResult(MAIN, runSimulation(MAIN)) });
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
});

describe('LatestComputeQueue (B-2)', () => {
  const input = (durationSeconds: number): TeamInput => ({ ...MAIN, slots: [], durationSeconds });
  const done = (seq: number, durationSeconds: number) => ({
    seq,
    computed: { ok: false, error: `done ${durationSeconds}` } satisfies Computed,
  });

  function setup() {
    const sent: ComputeRequest[] = [];
    const delivered: Computed[] = [];
    const queue = new LatestComputeQueue(
      (r) => sent.push(r),
      (c) => delivered.push(c),
    );
    return { sent, delivered, queue };
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
    expect(s.queue.busy).toBe(false);
    s.queue.request(input(3));
    expect(s.sent.map((r) => r.input.durationSeconds)).toEqual([1, 3]);
  });
});
