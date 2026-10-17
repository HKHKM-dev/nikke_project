// 2 段目の段 3 の PR 3（plan/design-skill-stage3.md 1.4・1.5 節）: スタック数の条件（selfState の stacks）とスタック量の減少
// （stackChange の decrease）の読み込み・解決・段の件・件の一覧での判定
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { SkillRaw } from '../../types.ts';
import { createHolderLists, itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveStackChanges, resolveTimed } from '../resolve.ts';
import { stackItems } from '../stacks.ts';
import type { TimelineSlot } from '../timeline.ts';
import type { FrameEvents } from '../triggers.ts';
import { parseSkillDefinition, type SkillDefinition, type SkillEntry } from '../types.ts';

const D10 = gameSecondsToFrames(10);
const FRAMES = 10 * D10;
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const unsupported: SkillEntry = { support: 'unsupported', effects: [] };

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-17',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
/** 自分にスタックで付く状態（最大 5・持続）。フルバーストの開始ごとに 1 スタック */
const grant = {
  kind: 'state',
  state: 'camouflage',
  trigger: 'fullBurstStart',
  target: 'self',
  maxStacks: 5,
  durationUntil: 'battleEnd',
};
const timedWith = (selfState: unknown, stat = 'attack') => ({
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'self',
  stat,
  ref: 1,
  durationRef: 2,
  condition: { selfState },
});

describe('スタック数の条件の読み込み', () => {
  it('reads N stacks or more, the full stack and a reference to the description value', () => {
    const def = parse([
      grant,
      timedWith({ state: 'camouflage', stacks: 3 }),
      timedWith({ state: 'camouflage', stacks: 'full' }),
      timedWith({ state: 'camouflage', stacksRef: 3 }),
    ]);
    const conditions = def.skills.skill1.effects.slice(1).map((e) => ('condition' in e ? e.condition : undefined));
    expect(conditions).toEqual([
      { selfState: { state: 'camouflage', present: true, stacks: 3 } },
      { selfState: { state: 'camouflage', present: true, stacks: 'full' } },
      { selfState: { state: 'camouflage', present: true, stacksRef: 3 } },
    ]);
  });

  it('rejects a negated stack count, both stacks and stacksRef, and values that are not a stack count', () => {
    expect(() => parse([grant, timedWith({ state: 'camouflage', stacks: 3, present: false })])).toThrow(
      /cannot be negated/,
    );
    expect(() => parse([grant, timedWith({ state: 'camouflage', stacks: 3, stacksRef: 3 })])).toThrow(
      /at most one of stacks and stacksRef/,
    );
    expect(() => parse([grant, timedWith({ state: 'camouflage', stacks: 0 })])).toThrow();
    expect(() => parse([grant, timedWith({ state: 'camouflage', stacks: 'half' })])).toThrow();
    expect(() => parse([grant, timedWith({ state: 'camouflage', level: 3 })])).toThrow(/unknown field/);
  });

  it('keeps the presence form as before', () => {
    const def = parse([grant, timedWith({ state: 'camouflage', present: false })]);
    expect(def.skills.skill1.effects[1]).toMatchObject({
      condition: { selfState: { state: 'camouflage', present: false } },
    });
  });
});

describe('スタック量の減少の読み込み', () => {
  const decrease = {
    kind: 'stackChange',
    state: 'camouflage',
    trigger: 'fullBurstEnd',
    target: 'self',
    decrease: true,
    amount: 2,
  };

  it('reads a decrease of a stacking state on self', () => {
    expect(parse([grant, decrease]).skills.skill1.effects[1]).toEqual(decrease);
  });

  it('rejects decrease: false and a decrease without a stacking grant', () => {
    expect(() => parse([grant, { ...decrease, decrease: false }])).toThrow(/expected true/);
    const { maxStacks: _, ...single } = grant;
    expect(() => parse([single, decrease])).toThrow(/needs a grant of the same state on self with maxStacks/);
  });
});

/** skill1 に効果を並べた枠。値: [1] = 50%、[2] = 10 秒、[3] = 4（スタック数の参照に使う） */
function slotWith(effects: SkillEntry['effects']): NonNullable<TimelineSlot> {
  const raw: SkillRaw = {
    id: 1,
    name: { ja: 'S', en: 'S' },
    description: { ja: '', en: '' },
    values: [tenLevels('50'), tenLevels('10'), tenLevels('4')],
  };
  const blank: SkillRaw = { ...raw, values: [] };
  const character = makeCharacter({}, { resourceId: 1, skills: { skill1: raw, skill2: blank, burst: blank } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-17',
    skills: { skill1: { support: 'supported', effects }, skill2: unsupported, burst: unsupported },
  };
  return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
}

const parsedEffects = (effects: Record<string, unknown>[]) => parse(effects).skills.skill1.effects;

describe('解決（スタック数の参照・減少）', () => {
  it('resolves stacksRef to the description value and keeps the decrease mark', () => {
    const slot = slotWith(
      parsedEffects([
        grant,
        timedWith({ state: 'camouflage', stacksRef: 3 }),
        {
          kind: 'stackChange',
          state: 'camouflage',
          trigger: 'fullBurstEnd',
          target: 'self',
          decrease: true,
          amountRef: 3,
        },
      ]),
    );
    const [timed] = resolveTimed(slot.definition!, slot.character, slot.levels);
    expect(timed!.condition).toEqual({ selfState: { state: 'camouflage', present: true, stacks: 4 } });
    expect(resolveStackChanges(slot.definition!, slot.character, slot.levels)).toMatchObject([
      { state: 'camouflage', amount: 4, decrease: true },
    ]);
  });
});

describe('段の件のスタック量の減少（skills/stacks.ts）', () => {
  const five = [0, 0, 0, 0, 0];

  it('cuts the top stacks on the frame after the decrease and counts later stacks from the lower level', () => {
    expect(stackItems([...five, 300], 10_000, 1000, 5, 'all', [{ frame: 100, amount: 2 }])).toEqual([
      { stack: 1, start: 0, end: 1000 },
      { stack: 2, start: 0, end: 1000 },
      { stack: 3, start: 0, end: 1000 },
      { stack: 4, start: 0, end: 101 },
      { stack: 5, start: 0, end: 101 },
      { stack: 4, start: 300, end: 1000 },
    ]);
  });

  it('counts a start on the same frame before the decrease, and keeps the last stack when the decrease is larger', () => {
    expect(stackItems([0, 100, 400], 10_000, 1000, 5, 'all', [{ frame: 100, amount: 9 }])).toEqual([
      { stack: 1, start: 0, end: 1000 },
      { stack: 2, start: 100, end: 101 },
      { stack: 2, start: 400, end: 1000 },
    ]);
  });

  it('ignores a decrease when no stack is active and needs the refresh-all mode', () => {
    expect(stackItems([200], 50, 1000, 5, 'all', [{ frame: 100, amount: 1 }])).toEqual([
      { stack: 1, start: 200, end: 250 },
    ]);
    expect(() => stackItems([0], 50, 1000, 5, 'each', [{ frame: 10, amount: 1 }])).toThrow(/STACK_REFRESH/);
  });
});

function events(frame: number, over: Partial<FrameEvents> = {}): FrameEvents {
  return {
    frame,
    shots: [null],
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: [false],
    ...over,
  };
}

function listsOf(slot: NonNullable<TimelineSlot>) {
  return createHolderLists([slot], {
    frames: FRAMES,
    scheduleModel: 'fixed',
    logs: [null],
    fullBurstWindows: () => [],
  });
}

describe('件の一覧でのスタック数の条件と減少（skills/holders.ts）', () => {
  // 戦闘開始時に 3 スタック、フルバーストの開始ごとに 1 スタック、終了ごとに 2 スタック▼。開始時の▲（4 スタック以上・フルスタック）
  const slot = () =>
    slotWith(
      parsedEffects([
        grant,
        { kind: 'stackChange', state: 'camouflage', trigger: 'battleStart', target: 'self', amount: 3 },
        {
          kind: 'stackChange',
          state: 'camouflage',
          trigger: 'fullBurstEnd',
          target: 'self',
          decrease: true,
          amount: 2,
        },
        timedWith({ state: 'camouflage', stacksRef: 3 }),
        timedWith({ state: 'camouflage', stacks: 'full' }, 'hitRate'),
      ]),
    );
  const run = () => {
    const lists = listsOf(slot());
    lists.registerBattleStart();
    // 開始 1（3 → 4）、開始 2（4 → 5）、終了（5 → 3）、開始 3（3 → 4）
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(200, { fullBurstStart: true }));
    lists.registerFrame(events(300, { fullBurstEnd: true }));
    lists.registerFrame(events(400, { fullBurstStart: true }));
    return lists;
  };
  const levelAt = (lists: ReturnType<typeof run>, frame: number) =>
    Math.max(
      0,
      ...itemsOf(lists.history(), { holder: 0, state: 'camouflage' })
        .filter((i) => i.start <= frame && frame < i.end)
        .map((i) => i.stack ?? 1),
    );

  it('decreases the stacks on the frame after the decrease and stacks again from there', () => {
    const lists = run();
    expect([0, 100, 200, 300, 301, 400].map((f) => levelAt(lists, f))).toEqual([3, 4, 5, 5, 3, 4]);
  });

  it('fires the condition when the stacks of that frame (including a stack added on the frame) reach N or the max', () => {
    const lists = run();
    const history = lists.history();
    const starts = (effectIndex: number) =>
      itemsOf(history, { holder: 0, kind: 'timed' })
        .filter((i) => i.origin.kind === 'timed' && i.origin.effect.effectIndex === effectIndex)
        .map((i) => i.start);
    // 4 スタック以上（stacksRef）: 開始 1・2・3 のどれでも付く（付き直しで 1 つの件）。フルスタック: 開始 2 だけ
    expect(starts(3)).toEqual([100]);
    expect(starts(4)).toEqual([200]);
    expect(history.conditionSkips.map((s) => [s.frame, s.effect.effectIndex])).toEqual([
      [100, 4],
      [400, 4],
    ]);
  });

  it('reads a conditional hit rate increase in the hit view of the first pass', () => {
    const lists = run();
    // 命中率▲（フルスタックの時だけ。10 秒）の件は段 1.5 にあり、当たりの件として読む（区間と同じ N）
    expect(lists.hitUpAt(0, 199)).toBe(0);
    expect(lists.hitUpAt(0, 200)).toBeCloseTo(0.5, 12);
  });
});
