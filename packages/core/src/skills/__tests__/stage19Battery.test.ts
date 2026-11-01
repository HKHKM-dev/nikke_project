// 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2〜4）: カウンタで続く状態の語彙。アークレンジャー・ブラック（570）の定義は
// 撮影 A1 の後に書くので、ここでは語彙だけの定義で確かめる（バーストの代わりに戦闘開始時にバッテリーを 100 にする）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import { gameSecondsToFirstFrame } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const ARK_RANGER_BLACK = 570;
const character = readJson<CharacterData>(`../../../data/characters/${ARK_RANGER_BLACK}.json`);

type Effect = Record<string, unknown>;

const transform: Effect = {
  kind: 'state',
  state: 'transformation',
  trigger: { counterFull: 'battery' },
  target: 'self',
  durationUntil: { counterEmpty: 'battery' },
  undispellable: true,
  contents: [{ stat: 'attack', ref: 5 }],
};
const drain: Effect = {
  kind: 'counterChange',
  counter: 'battery',
  trigger: { everySeconds: 0.2, carry: true, since: { applied: 'transformation' } },
  target: 'self',
  amountRef: 4,
  decrease: true,
};
const charge: Effect = {
  kind: 'counterChange',
  counter: 'battery',
  trigger: 'battleStart',
  target: 'self',
  amount: 100,
};
const afterTransform: Effect = {
  kind: 'counterChange',
  counter: 'battery',
  trigger: { applied: 'transformation' },
  target: 'self',
  amountRef: 6,
  decrease: true,
};
const collider: Effect = {
  kind: 'dot',
  trigger: { applied: 'transformation' },
  ref: 1,
  intervalSeconds: 1,
  durationUntil: { stateEnd: 'transformation' },
  firstTick: 'afterInterval',
};

/** 効果の無いスロットは notes が要る（語彙の検証の外） */
const entryOf = (effects: Effect[]) =>
  effects.length > 0
    ? { effects }
    : { effects, notes: [{ ja: 'テスト', en: 'Test', kind: 'outOfScope', effect: { kind: 'unknown' } }] };

function definitionOf(skill1: Effect[], skill2: Effect[] = [], burst: Effect[] = []) {
  return {
    formatVersion: 1,
    resourceId: ARK_RANGER_BLACK,
    checkedAt: '2026-11-01',
    skills: {
      skill1: entryOf(skill1),
      skill2: entryOf(skill2),
      burst: entryOf(burst),
    },
  };
}

describe('語彙の検証', () => {
  const parse =
    (skill1: Effect[], skill2: Effect[] = [], burst: Effect[] = []) =>
    () =>
      parseSkillDefinition(definitionOf(skill1, skill2, burst));

  it('accepts the vocabulary', () => {
    expect(parse([transform, drain], [collider], [charge, afterTransform])).not.toThrow();
  });

  it('pairs { counterFull } with durationUntil { counterEmpty } of the same counter on self', () => {
    expect(parse([{ ...transform, durationUntil: undefined, durationSeconds: 10 }])).toThrow(
      /lasts until the same counter/,
    );
    expect(parse([{ ...transform, trigger: 'battleStart' }])).toThrow(/lasts until the same counter/);
    expect(parse([{ ...transform, durationUntil: { counterEmpty: 'extrasensory' } }])).toThrow(
      /lasts until the same counter/,
    );
    expect(parse([{ ...transform, target: 'allies' }])).toThrow(/only on "self"/);
    expect(parse([{ ...transform, maxStacks: 2 }])).toThrow(/cannot stack/);
    expect(parse([{ ...transform, durationSeconds: 10 }])).toThrow(/cannot be combined with another duration/);
    expect(parse([{ ...transform, durationUntil: { counterEmpty: 'battery', x: 1 } }])).toThrow(/unknown field/);
  });

  it('keeps { counterFull } out of timed effects', () => {
    expect(
      parse([
        {
          kind: 'timed',
          stat: 'attack',
          ref: 5,
          trigger: { counterFull: 'battery' },
          target: 'self',
          durationSeconds: 5,
        },
      ]),
    ).toThrow();
  });

  it('allows since only on a timer of counterChange, with a grant of the state on self', () => {
    expect(parse([drain])).toThrow(/needs a grant of the same state on self/);
    expect(
      parse([
        transform,
        { ...drain, trigger: { count: 'normalShot', every: 1, since: { applied: 'transformation' } } },
      ]),
    ).toThrow(/since needs a timer trigger/);
    expect(parse([transform, { ...drain, trigger: { everySeconds: 0.2, since: 'transformation' } }])).toThrow(
      /expected \{ applied \}/,
    );
    expect(
      parse([
        transform,
        { kind: 'damage', ref: 1, trigger: { everySeconds: 1, since: { applied: 'transformation' } } },
      ]),
    ).toThrow(/since/);
  });

  it('needs a grant of the state on self for counterChange and dot on { applied }', () => {
    expect(parse([], [], [afterTransform])).toThrow(/needs a grant of the same state on self/);
    expect(parse([], [collider])).toThrow(/needs a grant of the same state on self/);
  });

  it('pairs a dot on { applied } with durationUntil { stateEnd } of the same state', () => {
    expect(parse([transform], [{ ...collider, durationUntil: undefined, durationSeconds: 10 }])).toThrow(
      /lasts until the same state ends/,
    );
    expect(parse([transform], [{ ...collider, trigger: 'battleStart' }])).toThrow(/lasts until the same state ends/);
    expect(parse([transform], [{ ...collider, durationUntil: { stateEnd: 'acidRound' } }])).toThrow(
      /lasts until the same state ends/,
    );
    expect(parse([transform], [{ ...collider, state: 'hacked' }])).toThrow(/cannot have state/);
    expect(parse([transform], [{ ...collider, gaugeOnTick: true }])).toThrow(/cannot have gaugeOnTick/);
  });
});

describe('バッテリーで続く変身（単騎・バーストなし）', () => {
  const fixed = computeFixedSpecAttack(character);
  const slotOf = (skill1: Effect[], skill2: Effect[], burst: Effect[]): TeamSlotInput => ({
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: false },
    skills: { definition: parseSkillDefinition(definitionOf(skill1, skill2, burst)), levels: MAX_SKILL_LEVELS },
  });
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const run = (burst: Effect[], durationSeconds = 30) =>
    runSimulation({ slots: [slotOf([transform, drain], [collider], burst)], enemy, durationSeconds, burst: false });
  type Result = ReturnType<typeof run>;
  const stateSpans = (q: Result) => itemsOf(q.history, { holder: 0, kind: 'state' }).map((i) => [i.start, i.end]);
  const tickFrames = (q: Result) =>
    q.skillHits.filter((h) => h.slotIndex === 0 && h.effect.dot !== undefined).map((h) => h.frame);

  // 戦闘開始時に 100（フレーム 0）→ 次のフレーム（1）に変身 → 同じフレームに 50 引く → 1 から 0.2 秒ごとに 1 ずつ減り、50 回目で 0
  const r = run([charge, afterTransform]);
  const start = 1;
  const empty = start + gameSecondsToFirstFrame(50 * 0.2);

  it('transforms on the frame after the battery is full, and drops it to 50', () => {
    const battery = r.history.counters.filter((x) => x.counter === 'battery');
    expect(battery.slice(0, 3).map((x) => [x.frame, x.value])).toEqual([
      [0, 100],
      [start, 50],
      [start + gameSecondsToFirstFrame(0.2), 49],
    ]);
    expect(battery.at(-1)).toMatchObject({ frame: empty, value: 0 });
  });

  it('ends the transformation on the frame after the battery is empty, and stops draining', () => {
    expect(stateSpans(r)).toEqual([[start, empty + 1]]);
    expect(r.history.counters.filter((x) => x.counter === 'battery').length).toBe(2 + 50);
  });

  it('lasts twice as long without the drop after transforming', () => {
    expect(stateSpans(run([charge]))).toEqual([[start, start + gameSecondsToFirstFrame(100 * 0.2) + 1]]);
  });

  it('ticks the collider every second from the transformation until it ends', () => {
    const ticks = tickFrames(r);
    // 1 秒後から 1 秒ごと。10 回目は、バッテリーが 0 に届いたフレーム（変身の最後のフレーム）に出る
    expect(ticks).toEqual(Array.from({ length: 10 }, (_, k) => start + gameSecondsToFirstFrame(k + 1)));
    expect(ticks.at(-1)).toBe(empty);
  });

  it('counts the drain and the collider again from a later transformation', () => {
    const every15: Effect = { ...charge, trigger: { everySeconds: 15 } };
    const q = run([every15, afterTransform], 45);
    // 周期の充電は端数を持ち越さない（k × 15 秒のフレーム数）。変身はその次のフレーム
    const firsts = [1, 2].map((k) => k * gameSecondsToFirstFrame(15) + 1);
    expect(stateSpans(q)).toEqual(firsts.map((s0) => [s0, s0 + gameSecondsToFirstFrame(10) + 1]));
    expect(tickFrames(q)).toEqual(
      firsts.flatMap((s0) => Array.from({ length: 10 }, (_, k) => s0 + gameSecondsToFirstFrame(k + 1))),
    );
  });
});
