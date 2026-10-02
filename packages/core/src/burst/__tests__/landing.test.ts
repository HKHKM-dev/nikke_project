// バーストの着弾編（plan/design-burst-landing.md）: 遅れの表、発動のヒット・効果の発火のフレーム、出来事の列、
// burst スロットの sequential の検証。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { burstDelaysFieldOf, burstDelaysOf, MEASURED_BURST_DELAYS, withBurstDelays } from '../landing.ts';
import { effectFrameOf, hitFrameOf, hitFramesOfSlot, type BurstActivation, type BurstSchedule } from '../schedule.ts';
import { planFixedCycle } from '../fixedCycle.ts';
import { createTriggerTracker, replayEvents } from '../../skills/triggers.ts';
import { parseSkillDefinition } from '../../skills/types.ts';

const ISABEL = 231;
const activation: BurstActivation = {
  frame: 600,
  step: 'Step3',
  slotIndex: 0,
  startsFullBurst: true,
  enteredStep: null,
};

describe('遅れの表', () => {
  it('has Isabel (C-0165), Helm (C-0167) and returns 0 for characters not in the table', () => {
    expect(burstDelaysOf(ISABEL)).toEqual({ hitFrames: 134, effectFrames: 134 });
    expect(burstDelaysOf(352)).toEqual({ hitFrames: 59, effectFrames: 0 });
    expect(burstDelaysOf(862)).toEqual({ hitFrames: 0, effectFrames: 0 });
    for (const row of MEASURED_BURST_DELAYS) expect(row.claim).toMatch(/^C-\d{4}$/);
  });

  it('adds delays only for characters in the table', () => {
    expect(burstDelaysFieldOf(862)).toEqual({});
    expect(burstDelaysFieldOf(ISABEL)).toEqual({ delays: { hitFrames: 134, effectFrames: 134 } });
  });
});

describe('発動のヒットと効果の発火のフレーム', () => {
  it('defaults both to the activation frame and writes only the delayed ones', () => {
    expect(hitFrameOf(activation)).toBe(600);
    expect(effectFrameOf(activation)).toBe(600);
    expect(withBurstDelays(activation, { hitFrames: 0, effectFrames: 0 })).toEqual(activation);
    const delayed = withBurstDelays(activation, { hitFrames: 80, effectFrames: 10 });
    expect(delayed).toEqual({ ...activation, hitFrame: 680, effectFrame: 610 });
  });

  it('drops hits after the end of the battle', () => {
    const schedule = {
      activations: [withBurstDelays(activation, { hitFrames: 134, effectFrames: 134 })],
    } as BurstSchedule;
    expect(hitFramesOfSlot(schedule, 0, 735)).toEqual([734]);
    expect(hitFramesOfSlot(schedule, 0, 734)).toEqual([]);
  });

  it('delays the activations of the fixed cycle for characters with delays', () => {
    const schedule = planFixedCycle([{ burstStep: 'Step3', delays: { hitFrames: 134, effectFrames: 134 } }], 3000);
    const first = schedule.activations[0]!;
    expect(first.hitFrame).toBe(first.frame + 134);
    expect(first.effectFrame).toBe(first.frame + 134);
  });
});

describe('出来事の列の burstEffects', () => {
  const schedule: BurstSchedule = {
    model: 'dynamic',
    activations: [withBurstDelays(activation, { hitFrames: 134, effectFrames: 134 })],
    fullBurstWindows: [{ start: 600, end: 900, burstUsers: [0] }],
    fullBurstFramesTotal: 300,
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
  };
  const events = replayEvents(schedule, [null], 3000);

  it('puts the activation at its frame and the burst effects at the effect frame', () => {
    expect(events.find((e) => e.frame === 600)!.activations).toHaveLength(1);
    expect(events.find((e) => e.frame === 600)!.burstEffects).toHaveLength(0);
    expect(events.find((e) => e.frame === 734)!.burstEffects).toHaveLength(1);
  });

  it('fires burstUse and its count at the effect frame', () => {
    for (const trigger of ['burstUse', { count: 'burstUse', atLeast: 1 }] as const) {
      const tracker = createTriggerTracker(trigger, 0, 'dynamic');
      expect(events.filter((e) => tracker(e)).map((e) => e.frame)).toEqual([734]);
    }
  });
});

describe('burst スロットの sequential の検証', () => {
  const raw = JSON.parse(readFileSync(new URL('../../../data/skills/231.json', import.meta.url), 'utf8')) as {
    skills: Record<string, Record<string, unknown> & { effects: unknown[] }>;
  };

  it('parses the burst of Isabel', () => {
    expect(parseSkillDefinition(raw).skills.burst.sequential).toBe(true);
  });

  it('rejects sequential outside the burst slot, without burstDamage first, or other than true', () => {
    const copy = structuredClone(raw);
    copy.skills.skill1!.sequential = true;
    expect(() => parseSkillDefinition(copy)).toThrow(/only allowed in the burst slot/);
    const swapped = structuredClone(raw);
    swapped.skills.burst!.effects = [...swapped.skills.burst!.effects.slice(1), swapped.skills.burst!.effects[0]];
    expect(() => parseSkillDefinition(swapped)).toThrow(/the first effect must be burstDamage/);
    const notTrue = structuredClone(raw);
    notTrue.skills.burst!.sequential = false;
    expect(() => parseSkillDefinition(notTrue)).toThrow(/expected true/);
  });
});
