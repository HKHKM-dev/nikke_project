// Stage 6: 持続バフのタイムライン。plan/design-stage6.md 6.1 節の表を固定する。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { assignedStepOf, isFullBurstFrame, planFixedCycle } from '../../burst/fixedCycle.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { groupTimeline, planBuffTimeline, triggerFrames, type TimelineSlot } from '../timeline.ts';
import type { BuffTrigger, SkillDefinition, SkillEntry, TimedEffect } from '../types.ts';
import type { BurstStep, SkillRaw } from '../../types.ts';

const FRAMES = 10800; // 180 秒
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const unsupported: SkillEntry = { support: 'unsupported', effects: [] };

/** values: [1] = 比率 %、[2] = 維持秒数 */
function timedSlot(
  resourceId: number,
  burstStep: BurstStep,
  effects: TimedEffect[],
  ratioPercent = '50',
  durationSeconds = '10',
  slotKey: 'skill1' | 'burst' = 'burst',
): TimelineSlot {
  const raw: SkillRaw = {
    id: resourceId,
    name: { ja: 'S', en: 'S' },
    description: { ja: '', en: '' },
    values: [tenLevels(ratioPercent), tenLevels(durationSeconds)],
  };
  const blank: SkillRaw = { ...raw, values: [] };
  const character = makeCharacter(
    {},
    {
      resourceId,
      burstStep,
      skills: {
        skill1: slotKey === 'skill1' ? raw : blank,
        skill2: blank,
        burst: slotKey === 'burst' ? raw : blank,
      },
    },
  );
  const entry: SkillEntry = { support: 'supported', effects };
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-22',
    skills: {
      skill1: slotKey === 'skill1' ? entry : unsupported,
      skill2: unsupported,
      burst: slotKey === 'burst' ? entry : unsupported,
    },
  };
  return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
}

function timed(trigger: BuffTrigger, over: Partial<TimedEffect> = {}): TimedEffect {
  return { kind: 'timed', trigger, target: 'self', stat: 'attack', ref: 1, durationRef: 2, ...over };
}

const schedule = planFixedCycle([{ burstStep: 'Step3' }, { burstStep: 'Step1' }], FRAMES);

describe('triggerFrames', () => {
  it('fires battleStart once, fullBurstStart on every activation and fullBurstEnd on every closed window', () => {
    expect(triggerFrames('battleStart', schedule, 0, FRAMES)).toEqual([0]);
    expect(triggerFrames('fullBurstStart', schedule, 0, FRAMES)).toEqual([
      600, 1800, 3000, 4200, 5400, 6600, 7800, 9000, 10200,
    ]);
    // 最後のフルバースト窓は 10,800f（= frames）で切れるので 9 回目の fullBurstEnd は発火しない
    expect(triggerFrames('fullBurstEnd', schedule, 0, FRAMES)).toEqual([
      1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600,
    ]);
  });

  it('fires burstUse only for the slot assigned to a step', () => {
    expect(assignedStepOf(schedule.assignment, 0)).toBe('Step3');
    expect(assignedStepOf(schedule.assignment, 1)).toBe('Step1');
    expect(triggerFrames('burstUse', schedule, 0, FRAMES)).toHaveLength(9);
    expect(triggerFrames('burstUse', schedule, 1, FRAMES)).toHaveLength(9);
    // 同じ段階の 2 体目・空枠は割当がないので発火しない
    const crowded = planFixedCycle([{ burstStep: 'Step3' }, { burstStep: 'Step3' }, null], FRAMES);
    expect(assignedStepOf(crowded.assignment, 1)).toBeNull();
    expect(triggerFrames('burstUse', crowded, 1, FRAMES)).toEqual([]);
    expect(triggerFrames('burstUse', crowded, 2, FRAMES)).toEqual([]);
  });

  it('fills an empty step with an AllStep slot and gives it that step’s frames', () => {
    const all = planFixedCycle([{ burstStep: 'AllStep' }, { burstStep: 'Step3' }], FRAMES);
    expect(all.assignment).toEqual({ Step1: 0, Step2: null, Step3: 1 });
    expect(assignedStepOf(all.assignment, 0)).toBe('Step1');
    expect(triggerFrames('burstUse', all, 0, FRAMES)).toHaveLength(9);
  });

  it('fires nothing but battleStart without a burst schedule', () => {
    for (const trigger of ['burstUse', 'fullBurstStart', 'fullBurstEnd'] as const) {
      expect(triggerFrames(trigger, null, 0, FRAMES)).toEqual([]);
    }
    expect(triggerFrames('battleStart', null, 0, FRAMES)).toEqual([0]);
    expect(triggerFrames('battleStart', null, 0, 0)).toEqual([]);
  });
});

describe('planBuffTimeline windows', () => {
  it('merges a re-fired window instead of stacking it (refresh, not stack)', () => {
    // 持続 20 秒（= サイクル長）を 20 秒ごとに発火 → 1 回目の発動から最後まで途切れない 1 本の窓
    const slots = [timedSlot(1, 'Step3', [timed('burstUse')], '50', '20')];
    const t = planBuffTimeline(slots, planFixedCycle([{ burstStep: 'Step3' }], FRAMES), FRAMES);
    expect(t.windows).toHaveLength(1);
    expect(t.windows[0]).toMatchObject({ slotIndex: 0, sourceSlotIndex: 0, start: 600, end: FRAMES });
    // 持続 30 秒でも同じ（重ねない）
    const longer = planBuffTimeline(
      [timedSlot(1, 'Step3', [timed('burstUse')], '50', '30')],
      planFixedCycle([{ burstStep: 'Step3' }], FRAMES),
      FRAMES,
    );
    expect(longer.windows).toHaveLength(1);
    expect(longer.windows[0]?.end).toBe(FRAMES);
    // 持続 10 秒なら 9 本に分かれる
    const short = planBuffTimeline(
      [timedSlot(1, 'Step3', [timed('burstUse')])],
      planFixedCycle([{ burstStep: 'Step3' }], FRAMES),
      FRAMES,
    );
    expect(short.windows).toHaveLength(9);
    expect(short.windows.map((w) => [w.start, w.end])[0]).toEqual([600, 1200]);
  });

  it('clips the last window at the battle end', () => {
    // fullBurstEnd の 15 秒窓: 9,600f に付いて 10,500f まで。最後は 10,800f で切れる
    const slots = [timedSlot(1, 'Step3', [timed('fullBurstEnd')], '50', '15')];
    const t = planBuffTimeline(slots, planFixedCycle([{ burstStep: 'Step3' }], FRAMES), FRAMES);
    expect(t.windows.at(-1)).toMatchObject({ start: 9600, end: 10500 });
    const short = planBuffTimeline(slots, planFixedCycle([{ burstStep: 'Step3' }], 10000), 10000);
    expect(short.windows.at(-1)).toMatchObject({ start: 9600, end: 10000 });
  });

  it('gives an allies window to every filled slot and a self window only to the caster', () => {
    const sched = planFixedCycle([{ burstStep: 'Step3' }, { burstStep: 'Step1' }, null], FRAMES);
    const allies = planBuffTimeline(
      [timedSlot(1, 'Step3', [timed('burstUse', { target: 'allies' })]), timedSlot(2, 'Step1', []), null],
      sched,
      FRAMES,
    );
    expect(new Set(allies.windows.map((w) => w.slotIndex))).toEqual(new Set([0, 1]));
    const self = planBuffTimeline(
      [timedSlot(1, 'Step3', [timed('burstUse')]), timedSlot(2, 'Step1', []), null],
      sched,
      FRAMES,
    );
    expect(new Set(self.windows.map((w) => w.slotIndex))).toEqual(new Set([0]));
  });

  it('drops a zero-duration effect entirely', () => {
    const t = planBuffTimeline(
      [timedSlot(1, 'Step3', [timed('burstUse', { durationRef: undefined, durationSeconds: 0 })])],
      planFixedCycle([{ burstStep: 'Step3' }], FRAMES),
      FRAMES,
    );
    expect(t.windows).toEqual([]);
    expect(t.segments.every((s) => s.slots[0]?.timedEffects.length === 0)).toBe(true);
  });
});

describe('planBuffTimeline segments', () => {
  const sched = planFixedCycle([{ burstStep: 'Step3' }], FRAMES);
  const t = planBuffTimeline([timedSlot(1, 'Step3', [timed('burstUse')])], sched, FRAMES);

  it('covers [0, frames) with no gaps or overlaps', () => {
    expect(t.segments[0]?.start).toBe(0);
    expect(t.segments.at(-1)?.end).toBe(FRAMES);
    for (let i = 0; i < t.segments.length; i++) {
      const seg = t.segments[i]!;
      expect(seg.start).toBeLessThan(seg.end);
      if (i > 0) expect(seg.start).toBe(t.segments[i - 1]!.end);
    }
    expect(t.segments.reduce((a, s) => a + (s.end - s.start), 0)).toBe(FRAMES);
  });

  it('agrees with isFullBurstFrame on every frame of every segment', () => {
    for (const seg of t.segments) {
      for (const f of [seg.start, seg.end - 1, Math.floor((seg.start + seg.end) / 2)]) {
        expect(isFullBurstFrame(f), `frame ${f}`).toBe(seg.fullBurst);
      }
    }
  });

  it('splits 180 s into 18 segments for a 10 s burstUse buff (buff window == full burst window)', () => {
    // バフ窓 [600, 1200) がフルバースト窓と一致するので、境界は 600 と 1200 の 2 つ/サイクル
    expect(t.segments).toHaveLength(18);
    expect(t.segments.map((s) => s.fullBurst).slice(0, 4)).toEqual([false, true, false, true]);
    expect(t.segments[0]?.slots[0]?.timedEffects).toEqual([]);
    expect(t.segments[1]?.slots[0]?.timedEffects).toHaveLength(1);
    expect(t.segments[1]?.slots[0]?.buffs.attackRatio).toBeCloseTo(0.5, 12);
  });

  it('adds boundaries for a 15 s battleStart buff that does not line up with the cycle', () => {
    const q = planBuffTimeline([timedSlot(1, 'Step3', [timed('battleStart')], '50', '15')], sched, FRAMES);
    // 境界に 900f（バフ切れ）が増える
    expect(q.segments.map((s) => s.start).slice(0, 4)).toEqual([0, 600, 900, 1200]);
    expect(q.segments[0]?.slots[0]?.buffs.attackRatio).toBeCloseTo(0.5, 12);
    expect(q.segments[1]?.slots[0]?.buffs.attackRatio).toBeCloseTo(0.5, 12);
    expect(q.segments[2]?.slots[0]?.buffs.attackRatio).toBe(0);
  });

  it('uses the caster’s pre-buff attack for casterAttack, like Stage 4', () => {
    const caster = timedSlot(1, 'Step3', [timed('burstUse', { target: 'allies', scaling: 'casterAttack' })], '10');
    const t2 = planBuffTimeline([caster, timedSlot(2, 'Step1', [])], sched, FRAMES);
    const buffed = t2.segments.find((s) => (s.slots[1]?.timedEffects.length ?? 0) > 0);
    expect(buffed?.slots[1]?.buffs.attackFlat).toBeCloseTo(100, 10); // 1000 × 0.10
    expect(buffed?.slots[1]?.buffs.attackRatio).toBe(0);
  });

  it('has a single segment without a schedule and without timed effects', () => {
    const plain = planBuffTimeline([timedSlot(1, 'Step3', [])], null, FRAMES);
    expect(plain.segments).toHaveLength(1);
    expect(plain.segments[0]).toMatchObject({ start: 0, end: FRAMES, fullBurst: false });
  });

  it('keeps only battleStart when the schedule is null', () => {
    const slots = [timedSlot(1, 'Step3', [timed('battleStart'), timed('burstUse')], '50', '15')];
    const t2 = planBuffTimeline(slots, null, FRAMES);
    expect(t2.windows).toHaveLength(1);
    expect(t2.windows[0]).toMatchObject({ start: 0, end: 900 });
    expect(t2.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 900],
      [900, FRAMES],
    ]);
  });
});

describe('groupTimeline', () => {
  const sched = planFixedCycle([{ burstStep: 'Step3' }], FRAMES);

  it('collapses the 18 segments of a 10 s burstUse buff into 2 buff states', () => {
    const groups = groupTimeline(planBuffTimeline([timedSlot(1, 'Step3', [timed('burstUse')])], sched, FRAMES), 0);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.fullBurst)).toEqual([false, true]);
    expect(groups.map((g) => g.seconds)).toEqual([90, 90]);
    expect(groups.map((g) => g.segments.length)).toEqual([9, 9]);
    expect(groups.reduce((a, g) => a + g.seconds, 0)).toBe(180);
  });

  it('degenerates to 2 groups with no timed effects (Stage 5 shape)', () => {
    const groups = groupTimeline(planBuffTimeline([timedSlot(1, 'Step3', [])], sched, FRAMES), 0);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.seconds)).toEqual([90, 90]);
  });

  it('keeps 3 groups for a 15 s battleStart buff (buffed normal / buffed FB / plain)', () => {
    const groups = groupTimeline(
      planBuffTimeline([timedSlot(1, 'Step3', [timed('battleStart')], '50', '15')], sched, FRAMES),
      0,
    );
    // [0,600) バフあり通常、[600,900) バフあり FB、[900,1200) バフなし FB、[1200,1800) バフなし通常 …
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => [g.fullBurst, g.state.buffs.attackRatio !== 0])).toEqual([
      [false, true],
      [true, true],
      [true, false],
      [false, false],
    ]);
    expect(groups.reduce((a, g) => a + g.seconds, 0)).toBeCloseTo(180, 9);
  });

  it('rounds the numeric part of the key so floating-point noise does not split a state', () => {
    // 同じ +50% を「1 件で 50%」と「2 件で 30% + 20%」で組む。加算経路が違うので最下位ビットがずれうる
    const one = planBuffTimeline([timedSlot(1, 'Step3', [timed('battleStart')], '50', '180')], sched, FRAMES);
    const twoSlot = timedSlot(2, 'Step3', [timed('battleStart'), timed('battleStart', { ref: 3 })], '30', '180')!;
    const two = planBuffTimeline(
      [
        {
          ...twoSlot,
          character: {
            ...twoSlot.character,
            skills: {
              ...twoSlot.character.skills,
              burst: {
                ...twoSlot.character.skills.burst,
                values: [tenLevels('30'), tenLevels('180'), tenLevels('20')],
              },
            },
          },
        },
      ],
      sched,
      FRAMES,
    );
    expect(two.segments[0]?.slots[0]?.buffs.attackRatio).toBeCloseTo(0.5, 12);
    // 鍵の数値部分（FB フラグ + BuffTotals の 6 桁）は 0.5 と 0.30000000000000004 + 0.2 で同じになる
    const numeric = (key: string | null | undefined): string => (key ?? '').split('|').slice(0, 7).join('|');
    expect(numeric(two.segments[0]?.slotKeys[0])).toBe(numeric(one.segments[0]?.slotKeys[0]));
    // 意味のある差（0.001）は別の鍵になる
    const other = planBuffTimeline([timedSlot(3, 'Step3', [timed('battleStart')], '50.1', '180')], sched, FRAMES);
    expect(numeric(other.segments[0]?.slotKeys[0])).not.toBe(numeric(one.segments[0]?.slotKeys[0]));
  });

  it('keeps two effects with equal totals but different sources in separate groups', () => {
    // クイーン（真）と同じ形: battleStart と fullBurstEnd がどちらも +50%。合計は同じでも出どころが違うので別グループ
    const slots = [timedSlot(4, 'Step3', [timed('battleStart'), timed('fullBurstEnd')], '50', '15')];
    const groups = groupTimeline(planBuffTimeline(slots, sched, FRAMES), 0);
    const first = groups[0]!;
    expect(first.state.timedEffects.map((e) => e.trigger)).toEqual(['battleStart']);
    expect(groups.some((g) => g.state.timedEffects.some((e) => e.trigger === 'fullBurstEnd'))).toBe(true);
    // どのグループも「効いている効果」が 1 通りに決まる
    for (const g of groups) {
      const ids = g.state.timedEffects.map((e) => `${e.trigger}`).join(',');
      for (const seg of g.segments) {
        expect(seg.slots[0]!.timedEffects.map((e) => `${e.trigger}`).join(',')).toBe(ids);
      }
    }
  });
});
