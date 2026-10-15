// 持ち主ごとの一覧編（plan/design-holder-effects.md 3 節の段 A の 1）: 件の種類ごとの単体テスト。
// 付き直しの境目・スタック・発数・出来事の終わり・吸収回復の窓・段の見え方（2.5 節の表）・確率のきっかけ・書き出しの並び（論点 5）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { FullBurstWindow } from '../../burst/schedule.ts';
import type { ShotLog } from '../../frame/shots.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { SkillRaw } from '../../types.ts';
import { dotActiveSpans } from '../../frame/dot.ts';
import {
  ENEMY,
  buffTimelineOf,
  createHolderLists,
  itemsOf,
  type HeldTrack,
  type HolderListsOptions,
} from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveInstant } from '../resolve.ts';
import type { TimelineSlot } from '../timeline.ts';
import type { FrameEvents, ShotEvent } from '../triggers.ts';
import type { SkillDefinition, SkillEntry, TimedEffect } from '../types.ts';

const D10 = gameSecondsToFrames(10);
const D5 = gameSecondsToFrames(5);
const FRAMES = 10 * D10;
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const unsupported: SkillEntry = { support: 'unsupported', effects: [] };
const SHOT: ShotEvent = { lastShot: false, fullCharge: false, hits: 1, coreHits: 0 };

/** skill1 に効果を並べた枠。値: [1] = 50%、[2] = 10 秒、[3] = 5 秒 */
function slotWith(resourceId: number, effects: SkillEntry['effects']): NonNullable<TimelineSlot> {
  const raw: SkillRaw = {
    id: resourceId,
    name: { ja: 'S', en: 'S' },
    description: { ja: '', en: '' },
    values: [tenLevels('50'), tenLevels('10'), tenLevels('5')],
  };
  const blank: SkillRaw = { ...raw, values: [] };
  const character = makeCharacter({}, { resourceId, skills: { skill1: raw, skill2: blank, burst: blank } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-10-15',
    skills: { skill1: { support: 'supported', effects }, skill2: unsupported, burst: unsupported },
  };
  return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
}

function timed(over: Partial<TimedEffect> = {}): TimedEffect {
  return { kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'attack', ref: 1, durationRef: 2, ...over };
}

function listsOf(slots: TimelineSlot[], over: Partial<HolderListsOptions> = {}) {
  return createHolderLists(slots, {
    frames: FRAMES,
    scheduleModel: 'fixed',
    logs: slots.map(() => null),
    fullBurstWindows: () => [],
    ...over,
  });
}

function events(frame: number, over: Partial<FrameEvents> = {}, slotCount = 1): FrameEvents {
  return {
    frame,
    shots: Array.from({ length: slotCount }, () => null),
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: Array.from({ length: slotCount }, () => false),
    ...over,
  };
}

/** 持ち主 holder の、効果の番号 effectIndex の timed の件の列 */
function timedTrack(tracks: readonly HeldTrack[], holder: number, effectIndex: number): HeldTrack {
  const track = tracks.find(
    (t) => t.holder === holder && t.origin.kind === 'timed' && t.origin.effect.effectIndex === effectIndex,
  );
  if (track === undefined) throw new Error(`no timed track ${effectIndex} on ${holder}`);
  return track;
}

describe('付き直しの境目（和集合）', () => {
  it('extends the item when the effect fires again exactly at its end (f ≤ end)', () => {
    const lists = listsOf([slotWith(1, [timed()])]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(100 + D10, { fullBurstStart: true }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([{ start: 100, end: 100 + 2 * D10 }]);
  });

  it('opens a new item when the effect fires one frame after its end', () => {
    const lists = listsOf([slotWith(1, [timed()])]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(101 + D10, { fullBurstStart: true }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([
      { start: 100, end: 100 + D10 },
      { start: 101 + D10, end: 101 + 2 * D10 },
    ]);
  });

  it('starts a shot-count trigger on the frame after the shot', () => {
    const lists = listsOf([slotWith(1, [timed({ trigger: { count: 'normalShot', every: 2 } })])]);
    lists.registerBattleStart();
    lists.registerFrame(events(10, { shots: [SHOT] }));
    lists.registerFrame(events(20, { shots: [SHOT] }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([{ start: 21, end: 21 + D10 }]);
  });

  it('starts a battleStart effect at frame 0 before the loop', () => {
    const lists = listsOf([slotWith(1, [timed({ trigger: 'battleStart' })])]);
    lists.registerBattleStart();
    lists.registerFrame(events(0));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([{ start: 0, end: D10 }]);
  });
});

describe('スタック・発数・出来事の終わり', () => {
  it('raises stacks and refreshes every stack on each fire (STACK_REFRESH all)', () => {
    const lists = listsOf([slotWith(1, [timed({ maxStacks: 2 })])]);
    lists.registerBattleStart();
    for (const f of [100, 200, 300]) lists.registerFrame(events(f, { fullBurstStart: true }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([
      { start: 100, end: 300 + D10, stack: 1 },
      { start: 200, end: 300 + D10, stack: 2 },
    ]);
  });

  it('keeps a shot-count duration until the frame after the holder’s N-th shot', () => {
    const log: ShotLog = { frames: [50, 150, 160, 170, 180], fullCharge: false };
    const lists = listsOf([slotWith(1, [timed({ stat: 'critRate', durationRef: undefined, durationShots: 3 })])], {
      logs: [log],
    });
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([{ start: 100, end: 171 }]);
  });

  it('ends a fullBurstEnd duration at the next full burst end, or at the end of the battle', () => {
    const windows: FullBurstWindow[] = [{ start: 100, end: 100 + D10, burstUsers: [] }];
    const lists = listsOf(
      [slotWith(1, [timed({ stat: 'critRate', durationRef: undefined, durationUntil: 'fullBurstEnd' })])],
      { fullBurstWindows: () => windows },
    );
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(150 + D10, { fullBurstStart: true }));
    expect(timedTrack(lists.history().tracks, 0, 0).items).toEqual([
      { start: 100, end: 100 + D10 },
      { start: 150 + D10, end: FRAMES },
    ]);
  });
});

describe('吸収回復の窓', () => {
  it('opens (heals) only when no window is active, with a strict end (f < end)', () => {
    const slot = slotWith(1, [{ kind: 'heal', trigger: 'fullBurstStart', target: 'self', ref: 1, durationRef: 3 }]);
    const heal = resolveInstant(slot.definition!, slot.character, slot.levels).find((e) => e.kind === 'heal')!;
    const lists = listsOf([slot]);
    lists.registerBattleStart();
    expect(lists.applyHeal(heal, 0, 0, 0)).toBe(true);
    // 窓 [0, D5) の中の付き直しは回復を起こさず、窓を延ばす（[0, 2·D5 − 1)）
    expect(lists.applyHeal(heal, 0, 0, D5 - 1)).toBe(false);
    // 窓のちょうど終わりのフレームは窓の外
    expect(lists.applyHeal(heal, 0, 0, 2 * D5 - 1)).toBe(true);
    expect(lists.history().heals).toEqual([
      { frame: 0, sourceSlotIndex: 0, slotIndex: 0 },
      { frame: 2 * D5 - 1, sourceSlotIndex: 0, slotIndex: 0 },
    ]);
  });
});

describe('吸収回復の窓（効果ごと・対象の枠ごと）', () => {
  it('keeps one window per target, extends it on a refresh, and always heals without a duration', () => {
    const slot = slotWith(1, [
      { kind: 'heal', trigger: 'fullBurstStart', target: 'allies', ref: 1, durationRef: 3 },
      { kind: 'heal', trigger: 'fullBurstStart', target: 'self', ref: 1 },
    ]);
    const [lasting, instant] = resolveInstant(slot.definition!, slot.character, slot.levels).filter(
      (e) => e.kind === 'heal',
    );
    const lists = listsOf([slot, slotWith(2, [])]);
    lists.registerBattleStart();
    expect(lists.applyHeal(lasting!, 0, 0, 10)).toBe(true);
    expect(lists.applyHeal(lasting!, 0, 0, 60)).toBe(false); // 付き直し（窓は 60 + D5 まで延びる）
    expect(lists.applyHeal(lasting!, 0, 0, 59 + D5)).toBe(false); // 延びた窓の中
    expect(lists.applyHeal(lasting!, 0, 1, 60)).toBe(true); // 対象の枠ごと
    expect(lists.applyHeal(lasting!, 0, 0, 59 + 2 * D5)).toBe(true); // 延びた窓が切れた後
    expect(lists.applyHeal(instant!, 0, 0, 61)).toBe(true);
    expect(lists.applyHeal(instant!, 0, 0, 62)).toBe(true);
  });
});

describe('段の見え方（2.5 節の表）', () => {
  // e0: 攻撃力▲（段 1）。e1: 攻撃力の増加状態なら会心率▲（段 1.5）。e2: 会心率の増加状態なら会心ダメージ▲（段 1.5）
  const slot = slotWith(1, [
    timed(),
    timed({ stat: 'critRate', condition: { selfBuffed: 'attack' } }),
    timed({ stat: 'critDamage', condition: { selfBuffed: 'critRate' } }),
  ]);

  it('lets a conditional effect see a stage-1 item that starts on the same frame', () => {
    const lists = listsOf([slot]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    const { tracks } = lists.history();
    expect(timedTrack(tracks, 0, 0).items).toEqual([{ start: 100, end: 100 + D10 }]);
    expect(timedTrack(tracks, 0, 1).items).toEqual([{ start: 100, end: 100 + D10 }]);
  });

  it('stops seeing an item at its end frame (f < end), and does not see another slot’s item', () => {
    const conditional = timed({ trigger: 'fullBurstEnd', stat: 'critRate', condition: { selfBuffed: 'attack' } });
    // 枠 0: 攻撃力▲（フルバースト開始から 10 秒）と、フルバースト終了で攻撃力の増加状態なら会心率▲。枠 1 は同じ条件の効果だけ
    const lists = listsOf([slotWith(1, [timed(), conditional]), slotWith(2, [conditional])]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }, 2));
    lists.registerFrame(events(99 + D10, { fullBurstEnd: true }, 2));
    lists.registerFrame(events(100 + D10, { fullBurstEnd: true }, 2));
    const history = lists.history();
    expect(timedTrack(history.tracks, 0, 1).items).toEqual([{ start: 99 + D10, end: 99 + 2 * D10 }]);
    expect(timedTrack(history.tracks, 1, 0).items).toEqual([]);
    expect(history.conditionSkips.map((s) => [s.frame, s.sourceSlotIndex])).toEqual([
      [99 + D10, 1],
      [100 + D10, 0],
      [100 + D10, 1],
    ]);
  });

  it('counts a passive of the holder as the buffed state', () => {
    const lists = listsOf([
      slotWith(1, [
        { kind: 'passive', target: 'self', stat: 'attack', ref: 1 },
        timed({ stat: 'critRate', condition: { selfBuffed: 'attack' } }),
      ]),
    ]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    const history = lists.history();
    expect(timedTrack(history.tracks, 0, 1).items).toEqual([{ start: 100, end: 100 + D10 }]);
    expect(history.conditionSkips).toEqual([]);
  });

  it('hides a conditional item from another conditional effect (no chaining), even while it is active', () => {
    const lists = listsOf([slot]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(200, { fullBurstStart: true }));
    const history = lists.history();
    expect(timedTrack(history.tracks, 0, 2).items).toEqual([]);
    expect(history.conditionSkips.map((s) => [s.frame, s.effect.effectIndex])).toEqual([
      [100, 2],
      [200, 2],
    ]);
  });
});

describe('確率のきっかけ', () => {
  it('keeps the opportunity from the frame after the shot, with the expected value of the piece', () => {
    const lists = listsOf([slotWith(1, [timed({ trigger: { count: 'normalShot', chance: 50 } })])]);
    lists.registerBattleStart();
    lists.registerFrame(events(10, { shots: [SHOT] }));
    const history = lists.history();
    expect(timedTrack(history.tracks, 0, 0).items).toEqual([{ start: 11, end: 11 + D10, scale: 0.5 }]);
    const [w] = buffTimelineOf(history, null).windows;
    expect(w).toMatchObject({ start: 11, end: 11 + D10 });
    expect(w!.effect.value).toBeCloseTo(0.25, 12);
  });
});

describe('書き出しの並び（論点 5）', () => {
  it('writes windows in time order, and on the same frame by stage, source slot and definition order', () => {
    const slots = [
      slotWith(1, [
        timed({ trigger: 'fullBurstEnd', stat: 'critDamage' }),
        timed({ stat: 'critRate', condition: { selfBuffed: 'attack' } }),
        timed(),
      ]),
      slotWith(2, [timed({ stat: 'chargeDamage' })]),
    ];
    const lists = listsOf(slots);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }, 2));
    lists.registerFrame(events(300, { fullBurstEnd: true }, 2));
    const order = buffTimelineOf(lists.history(), null).windows.map((w) => [
      w.start,
      w.sourceSlotIndex,
      w.effect.effectIndex,
    ]);
    // 100: 段 1（枠 0 の効果 2、枠 1 の効果 0）→ 段 1.5（枠 0 の効果 1）。300: 枠 0 の効果 0
    expect(order).toEqual([
      [100, 0, 2],
      [100, 1, 0],
      [100, 0, 1],
      [300, 0, 0],
    ]);
  });
});

describe('敵の件（段 C。plan/design-holder-effects.md 2.8 節）', () => {
  it('keeps an enemy debuff as one enemy item and writes it to every ally', () => {
    const slots = [slotWith(1, [timed({ stat: 'damageTaken', target: 'allies' })]), slotWith(2, []), null];
    const lists = listsOf(slots);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }, 3));
    const history = lists.history();
    expect(itemsOf(history, { stat: 'damageTaken' }).map((i) => [i.holder, i.start, i.end])).toEqual([
      [ENEMY, 100, 100 + D10],
    ]);
    const written = buffTimelineOf(history, null).windows.filter((w) => w.effect.stat === 'damageTaken');
    expect(written.map((w) => [w.slotIndex, w.start, w.end])).toEqual([
      [0, 100, 100 + D10],
      [1, 100, 100 + D10],
    ]);
  });

  it('keeps the enemy state of a dot from its first fire to its last tick', () => {
    const slot = slotWith(1, [
      {
        kind: 'dot',
        trigger: 'fullBurstStart',
        ref: 1,
        intervalSeconds: 1,
        durationRef: 3,
        firstTick: 'afterInterval',
        state: 'hacked',
      },
    ]);
    const lists = listsOf([slot]);
    lists.registerBattleStart();
    lists.registerFrame(events(100, { fullBurstStart: true }));
    lists.registerFrame(events(150, { fullBurstStart: true }));
    const items = itemsOf(lists.history(), { holder: ENEMY, state: 'hacked' });
    expect(items.map((i) => [i.start, i.end])).toEqual(
      dotActiveSpans([100, 150], 1, 5, 'afterInterval').map((sp) => [sp.start, sp.end]),
    );
    expect(items).toHaveLength(1);
  });
});
