// バーストの着弾編（plan/design-burst-landing.md）: 遅れの表、発動のヒット・効果の発火のフレーム、出来事の列、
// burst スロットの sequential の検証。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  burstDelaysFieldOf,
  burstDelaysOf,
  burstWindowTrimOf,
  isTreasureBurst,
  MEASURED_BURST_DELAYS,
  withBurstDelays,
} from '../landing.ts';
import {
  burstHitsOfSlot,
  effectFrameOf,
  hitFrameOf,
  hitFramesOf,
  hitFramesOfSlot,
  type BurstActivation,
  type BurstSchedule,
} from '../schedule.ts';
import { planFixedCycle } from '../fixedCycle.ts';
import { createTriggerTracker, replayEvents } from '../../skills/triggers.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../../skills/resolve.ts';
import { applyTreasure } from '../../skills/treasure.ts';
import { parseSkillDefinition } from '../../skills/types.ts';
import type { CharacterData } from '../../types.ts';

const ISABEL = 231;
const character = (id: number): CharacterData =>
  JSON.parse(readFileSync(new URL(`../../../data/characters/${id}.json`, import.meta.url), 'utf8')) as CharacterData;
const withTreasure = (id: number): CharacterData => applyTreasure(character(id), null, 3).character;
const activation: BurstActivation = {
  frame: 600,
  step: 'Step3',
  slotIndex: 0,
  startsFullBurst: true,
  enteredStep: null,
};

describe('遅れの表', () => {
  it('has Isabel (C-0165), Helm (C-0167) and returns 0 for characters not in the table', () => {
    expect(burstDelaysOf(character(ISABEL))).toEqual({ hitFrames: 134, effectFrames: 134 });
    expect(burstDelaysOf(withTreasure(352))).toEqual({ hitFrames: 59, effectFrames: 0 });
    expect(burstDelaysOf(character(862))).toEqual({ hitFrames: 0, effectFrames: 0 });
    for (const row of MEASURED_BURST_DELAYS) expect(row.claim).toMatch(/^C-\d{4}$/);
  });

  it('adds delays only for characters in the table', () => {
    expect(burstDelaysFieldOf(character(862))).toEqual({});
    expect(burstDelaysFieldOf(character(ISABEL))).toEqual({ delays: { hitFrames: 134, effectFrames: 134 } });
  });

  // 効果の窓の終わり（plan/design-burst-effect-window-end.md 案 B）: 印のある行（モダニア）だけ、burstUse の効果の維持を縮める
  it('counts the burst-use windows of Modernia from the activation (C-0452), and leaves other rows alone', () => {
    expect(burstWindowTrimOf(character(260))).toBe(6);
    expect(burstWindowTrimOf(character(ISABEL))).toBe(0);
    expect(burstWindowTrimOf(character(862))).toBe(0);
    const def = parseSkillDefinition(
      JSON.parse(readFileSync(new URL('../../../data/skills/260.json', import.meta.url), 'utf8')) as unknown,
    );
    const resolved = resolveTimed(def, character(260), MAX_SKILL_LEVELS);
    const burst = resolved.filter((r) => r.source.skill === 'burst');
    // 15 秒（882f）から効果の遅れ 6f を引く
    expect(burst.map((r) => [r.stat, r.durationFrames])).toEqual([
      ['infiniteAmmo', 876],
      ['weapon', 876],
    ]);
  });

  // 分かれたヒット編（plan/design-burst-split-hits.md 4.5 節）: 宝物の印のある行は、burst が宝物版のときだけ当てる
  it('applies the treasure rows only when the burst is the treasure version (Helm C-0167, Drake C-0228)', () => {
    expect(isTreasureBurst(character(101))).toBe(false);
    expect(isTreasureBurst(withTreasure(101))).toBe(true);
    expect(isTreasureBurst(applyTreasure(character(101), null, 2).character)).toBe(false);
    expect(burstDelaysOf(character(352))).toEqual({ hitFrames: 0, effectFrames: 0 });
    expect(burstDelaysOf(character(101))).toEqual({ hitFrames: 0, effectFrames: 0 });
    expect(burstDelaysOf(withTreasure(101))).toEqual({ hitFrames: 4, effectFrames: 0, hitOffsets: [0, 27, 55] });
  });

  it('splits the hits of Rapi (C-0227) and writes ascending offsets starting at 0 in every row', () => {
    expect(burstDelaysOf(character(10))).toEqual({ hitFrames: 90, effectFrames: 0, hitOffsets: [0, 7, 14] });
    for (const row of MEASURED_BURST_DELAYS) {
      const offsets = row.delays.hitOffsets ?? [0];
      expect(offsets[0]).toBe(0);
      for (let k = 1; k < offsets.length; k++) expect(offsets[k]!).toBeGreaterThan(offsets[k - 1]!);
    }
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

  it('writes the offsets of split hits and gives each hit an equal share', () => {
    const split = withBurstDelays(activation, { hitFrames: 4, effectFrames: 0, hitOffsets: [0, 27, 55] });
    expect(split).toEqual({ ...activation, hitFrame: 604, hitOffsets: [0, 27, 55] });
    expect(hitFramesOf(split)).toEqual([604, 631, 659]);
    expect(hitFramesOf(activation)).toEqual([600]);
    const schedule = { activations: [split] } as BurstSchedule;
    expect(burstHitsOfSlot(schedule, 0, 3000)).toEqual([
      { activationFrame: 600, frame: 604, share: 1 / 3 },
      { activationFrame: 600, frame: 631, share: 1 / 3 },
      { activationFrame: 600, frame: 659, share: 1 / 3 },
    ]);
    // 戦闘の終わり以降のヒットは、ヒットごとに出ない（4.2 節）
    expect(hitFramesOfSlot(schedule, 0, 640)).toEqual([604, 631]);
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

  it('accepts sequential in skill slots, and rejects a burst without burstDamage first or other than true', () => {
    // ルドミラ：ウィンターオーナー編: スキルのスロットにも書ける（plan/design-ludmilla-wo.md 2.4 節）
    const copy = structuredClone(raw);
    copy.skills.skill1!.sequential = true;
    expect(parseSkillDefinition(copy).skills.skill1.sequential).toBe(true);
    const swapped = structuredClone(raw);
    swapped.skills.burst!.effects = [...swapped.skills.burst!.effects.slice(1), swapped.skills.burst!.effects[0]];
    expect(() => parseSkillDefinition(swapped)).toThrow(/the first effect of a sequential burst must be burstDamage/);
    const notTrue = structuredClone(raw);
    notTrue.skills.burst!.sequential = false;
    expect(() => parseSkillDefinition(notTrue)).toThrow(/expected true/);
  });
});
