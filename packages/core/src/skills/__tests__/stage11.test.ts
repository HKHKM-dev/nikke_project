// Stage 11: 対象「直前にバーストスキルを使用した味方」（burstUsers）、フルスタックの射撃の回数トリガー（stacksRef）、
// 即時効果「回復」（heal）とトリガー「回復効果が適用された時」（healed）。plan/design-stage11.md 2・3 節・7.1〜7.3 節。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  stepBurstController,
  type BurstUnit,
} from '../../burst/controller.ts';
import { planFixedCycle } from '../../burst/fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { firstPassTimeline } from '../../__tests__/firstPassTimeline.ts';
import type { CharacterData, ShotParams, SkillRaw } from '../../types.ts';
import { itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { isEffectTarget } from '../targets.ts';
import { triggerFrames, type TimelineSlot } from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const skillRaw = (values: string[]): SkillRaw => ({
  id: 9,
  name: { ja: 'テスト', en: 'Test' },
  description: { ja: '', en: '' },
  values: values.map(tenLevels),
});

function definition(skills: Record<string, unknown>, resourceId = 1): unknown {
  const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-23',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

const supported = (...effects: unknown[]) => ({ effects });

describe('parseSkillDefinition (Stage 11, 7.1)', () => {
  it('accepts burstUsers with full burst triggers (also with a weapon), stacksRef, heal and healed', () => {
    const def = parseSkillDefinition(
      definition({
        skill1: supported(
          { kind: 'timed', trigger: 'fullBurstStart', target: 'burstUsers', stat: 'attack', ref: 1, durationRef: 2 },
          {
            kind: 'timed',
            trigger: 'fullBurstEnd',
            target: 'burstUsers',
            targetWeapon: 'MG',
            stat: 'attackDamage',
            ref: 1,
            durationRef: 2,
          },
          { kind: 'heal', trigger: { count: 'normalShot', everyRef: 1, stacksRef: 3 }, target: 'self', ref: 6 },
          { kind: 'timed', trigger: 'healed', target: 'allies', stat: 'attackDamage', ref: 7, durationRef: 8 },
        ),
      }),
    );
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['timed', 'timed', 'heal', 'timed']);
  });

  it.each([
    [
      'burstUsers with a non full burst trigger',
      { kind: 'timed', trigger: 'burstUse', target: 'burstUsers', stat: 'attack', ref: 1, durationRef: 2 },
      /burstUsers is only allowed with trigger/,
    ],
    [
      'burstUsers in passive',
      { kind: 'passive', target: 'burstUsers', stat: 'attack', ref: 1 },
      /burstUsers is not allowed in passive/,
    ],
    [
      'targetWeapon with self',
      {
        kind: 'timed',
        trigger: 'burstUse',
        target: 'self',
        targetWeapon: 'MG',
        stat: 'attack',
        ref: 1,
        durationRef: 2,
      },
      /targetWeapon/,
    ],
    [
      'heal triggered by healed',
      { kind: 'heal', trigger: 'healed', target: 'self', ref: 1 },
      /heal cannot be triggered/,
    ],
    [
      'burstUsers heal with a shot count trigger',
      { kind: 'heal', trigger: { count: 'normalShot', every: 5 }, target: 'burstUsers', ref: 1 },
      /burstUsers is only allowed/,
    ],
    [
      'an unknown field in a shot count trigger',
      { kind: 'heal', trigger: { count: 'normalShot', every: 5, stacks: 20 }, target: 'self', ref: 1 },
      /unknown field/,
    ],
  ])('rejects %s', (_name, effect, message) => {
    expect(() => parseSkillDefinition(definition({ skill1: supported(effect) }))).toThrow(message);
  });
});

describe('resolve: stacksRef and heal (Stage 11)', () => {
  const character = makeCharacter({}, {
    skills: { skill1: skillRaw(['43', '4.06', '20', '5.23', '20.5']), skill2: skillRaw([]), burst: skillRaw([]) },
  } as Partial<CharacterData>);
  const def = (trigger: unknown): SkillDefinition =>
    parseSkillDefinition(definition({ skill1: supported({ kind: 'heal', trigger, target: 'self', ref: 4 }) }));

  it('multiplies the per-stack count by the stack count (43 × 20 = 860) and keeps the stacks for labels', () => {
    const [heal] = resolveInstant(def({ count: 'normalShot', everyRef: 1, stacksRef: 3 }), character, MAX_SKILL_LEVELS);
    expect(heal).toMatchObject({ kind: 'heal', trigger: { count: 'normalShot', every: 860, stacks: 20 } });
    expect(heal!.value).toBeCloseTo(0.0523, 10);
  });

  it('rejects a non-integer stack count', () => {
    expect(() =>
      resolveInstant(def({ count: 'normalShot', everyRef: 1, stacksRef: 5 }), character, MAX_SKILL_LEVELS),
    ).toThrow(/stack count/);
  });
});

describe('isEffectTarget: burstUsers (Stage 11)', () => {
  const effect = { target: 'burstUsers' as const };
  it('hits only the slots in the fire context, and nobody without a context', () => {
    expect(isEffectTarget(effect, 1, 0, { weaponType: 'AR', element: 'Fire' }, { burstUsers: [0, 1, 3] })).toBe(true);
    expect(isEffectTarget(effect, 1, 2, { weaponType: 'AR', element: 'Fire' }, { burstUsers: [0, 1, 3] })).toBe(false);
    expect(isEffectTarget(effect, 1, 0, { weaponType: 'AR', element: 'Fire' }, null)).toBe(false);
    expect(
      isEffectTarget(
        { ...effect, targetWeapon: 'MG' },
        1,
        0,
        { weaponType: 'AR', element: 'Fire' },
        { burstUsers: [0] },
      ),
    ).toBe(false);
  });
});

// ---- 時刻表（7.2） ----

const NEXT = { Step1: 'Step2', Step2: 'Step3', Step3: 'StepFull', AllStep: 'NextStep' } as const;
const unit = (burstStep: 'Step1' | 'Step2' | 'Step3', cooldownFrames: number): BurstUnit => ({
  burstStep,
  nextStep: NEXT[burstStep],
  cooldownFrames,
});

function runController(units: readonly BurstUnit[], frames: number, gaugePerFrame: number) {
  const state = initialBurstController(units, DEFAULT_BURST_TIMING);
  for (let f = 0; f < frames; f++) stepBurstController(state, f, gaugePerFrame);
  return finishSchedule(state, frames);
}

describe('FullBurstWindow.burstUsers (Stage 11, 7.2)', () => {
  it('records the chain that opened each full burst; two IIIs alternate', () => {
    // I・II は CT 0、III は 2 体とも CT 2400f なので交互に撃つ（枠の若い 2 が先）
    const s = runController([unit('Step1', 0), unit('Step2', 0), unit('Step3', 2400), unit('Step3', 2400)], 3000, 5000);
    expect(s.fullBurstWindows.map((w) => w.burstUsers)).toEqual([
      [0, 1, 2],
      [0, 1, 3],
      [0, 1, 2],
    ]);
  });

  it('leaves out bursts of a chain that timed out', () => {
    // III の CT が長いので 2 回目のチェーンは II の後で途切れ、3 回目のチェーンでフルバーストに入る
    const s = runController([unit('Step1', 0), unit('Step2', 0), unit('Step3', 1500)], 3600, 5000);
    expect(s.chainTimeouts.length).toBeGreaterThan(0);
    for (const w of s.fullBurstWindows) expect(w.burstUsers).toEqual([0, 1, 2]);
    // 途切れたチェーンの発動（I・II）は数えていない: フルバーストの数 × 3 < 発動の数
    expect(s.fullBurstWindows.length * 3).toBeLessThan(s.activations.length);
  });

  it('uses the assigned slots in the fixed cycle', () => {
    const s = planFixedCycle([{ burstStep: 'Step3' }, { burstStep: 'Step1' }, null, { burstStep: 'Step2' }], 1800);
    expect(s.fullBurstWindows[0]!.burstUsers).toEqual([1, 3, 0]);
  });
});

// ---- 窓と回復（7.3） ----

function synthetic(
  resourceId: number,
  burstStep: CharacterData['burstStep'],
  cooldownSeconds: number,
  values: string[] = [],
  shot: Partial<ShotParams> = {},
): CharacterData {
  const base = makeCharacter(shot, { burstStep });
  return {
    ...base,
    resourceId,
    burstSkill: { ...base.burstSkill, cooldownSeconds },
    skills: { ...base.skills, skill1: skillRaw(values) },
  };
}

function slotOf(character: CharacterData, effects: unknown[] | null = null): TimelineSlot {
  const def =
    effects === null ? null : parseSkillDefinition(definition({ skill1: supported(...effects) }, character.resourceId));
  return { character, definition: def, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
}

const FRAMES = gameSecondsToFrames(180);

describe('burstUsers: items per target (Stage 11, 3.2)', () => {
  // I・II（CT 20 秒）と III 2 体（CT 40 秒）: フルバーストごとに III が入れ替わる
  const crownLike = [
    { kind: 'timed', trigger: 'fullBurstStart', target: 'burstUsers', stat: 'attack', ref: 1, durationRef: 2 },
  ];
  const slots = [
    slotOf(synthetic(1, 'Step1', 20)),
    slotOf(synthetic(2, 'Step2', 20, ['10', '15']), crownLike),
    slotOf(synthetic(3, 'Step3', 40)),
    slotOf(synthetic(4, 'Step3', 40)),
  ];
  const pass = firstPassTimeline(slots, { frames: FRAMES, burst: true }).first;
  const startsOf = (slotIndex: number) =>
    itemsOf(pass.history, { kind: 'timed', holder: slotIndex }).map((i) => i.start);

  it('gives each full burst to the slots of that chain only', () => {
    const fbs = pass.schedule!.fullBurstWindows;
    expect(fbs.length).toBeGreaterThanOrEqual(4);
    for (const slotIndex of [0, 1, 2, 3]) {
      const mine = fbs.filter((w) => w.burstUsers.includes(slotIndex)).map((w) => w.start);
      expect(startsOf(slotIndex)).toEqual(mine);
    }
    // III は交互なので、どちらも全部のフルバーストには入らない
    expect(startsOf(2).length).toBeLessThan(fbs.length);
    expect(startsOf(3).length).toBeLessThan(fbs.length);
    expect(startsOf(2).length + startsOf(3).length).toBe(fbs.length);
  });

  it('never gives the item to a slot outside the chain (a II that did not burst)', () => {
    const withIdleII = [...slots, slotOf(synthetic(5, 'Step2', 40))];
    const p = firstPassTimeline(withIdleII, { frames: FRAMES, burst: true }).first;
    expect(p.schedule!.activations.some((a) => a.slotIndex === 4)).toBe(false);
    expect(itemsOf(p.history, { holder: 4, kind: 'timed' })).toEqual([]);
  });

  it('gives a firing stat (reload speed) on burstUsers to the slots of each chain, in the loop', () => {
    const reload = [
      { kind: 'timed', trigger: 'fullBurstStart', target: 'burstUsers', stat: 'reloadSpeed', ref: 1, durationRef: 2 },
    ];
    const s2 = [slots[0]!, slotOf(synthetic(2, 'Step2', 20, ['50', '15']), reload), slots[2]!, slots[3]!];
    const p = firstPassTimeline(s2, { frames: FRAMES, burst: true }).first;
    const fbs = p.schedule!.fullBurstWindows;
    const items = itemsOf(p.history, { stat: 'reloadSpeed' });
    expect(items.length).toBeGreaterThan(0);
    for (const slotIndex of [0, 1, 2, 3]) {
      expect(items.filter((i) => i.holder === slotIndex).map((i) => i.start)).toEqual(
        fbs.filter((w) => w.burstUsers.includes(slotIndex)).map((w) => w.start),
      );
    }
  });
});

describe('heal and healed (Stage 11, 3.3)', () => {
  // 自分の通常攻撃 5 回 × 4 スタック = 20 発ごとに自分を回復し、回復で味方全体に攻撃ダメージ▲ 1 秒
  const selfHeal = [
    { kind: 'heal', trigger: { count: 'normalShot', everyRef: 1, stacksRef: 2 }, target: 'self', ref: 3 },
    { kind: 'timed', trigger: 'healed', target: 'allies', stat: 'attackDamage', ref: 4, durationRef: 5 },
  ];
  const slots = [
    slotOf(synthetic(1, 'Step1', 20, ['5', '4', '5.23', '20', '1']), selfHeal),
    slotOf(synthetic(2, 'Step3', 20)),
  ];
  const { first: pass, timeline } = firstPassTimeline(slots, { frames: 1800, burst: true });

  it('heals on the frame after every 20th shot', () => {
    const heals = pass.history.heals;
    const shots = pass.shots[0]!.frames;
    const expected = shots
      .filter((_, i) => (i + 1) % 20 === 0)
      .map((f) => f + 1)
      .filter((f) => f < 1800);
    expect(heals.map((h) => h.frame)).toEqual(expected);
    expect(heals.every((h) => h.sourceSlotIndex === 0 && h.slotIndex === 0)).toBe(true);
  });

  it('opens the healed item on the heal frame for every ally (1 s)', () => {
    const heals = pass.history.heals.map((h) => h.frame);
    expect(heals.length).toBeGreaterThan(3);
    const items = itemsOf(pass.history, { kind: 'timed' });
    for (const slotIndex of [0, 1]) {
      expect(items.filter((i) => i.holder === slotIndex).map((i) => i.start)).toEqual(heals);
    }
    expect(items.every((i) => i.end - i.start === gameSecondsToFrames(1) || i.end === 1800)).toBe(true);
    expect(timeline.heals).toEqual(pass.history.heals);
  });

  it('records the heals of the loop as instant applications too', () => {
    const loop = pass.instants.filter((x) => x.effect.kind === 'heal');
    expect(loop.map((x) => [x.frame, x.sourceSlotIndex, x.slotIndex])).toEqual(
      pass.history.heals.map((h) => [h.frame, h.sourceSlotIndex, h.slotIndex]),
    );
  });

  it('heals on the burst frame itself for a burst trigger, and every ally reacts on that frame', () => {
    const burstHeal = [
      { kind: 'heal', trigger: 'burstUse', target: 'allies', ref: 1 },
      { kind: 'timed', trigger: 'healed', target: 'self', stat: 'attack', ref: 2, durationRef: 3 },
    ];
    const s = [slotOf(synthetic(1, 'Step1', 20, ['10', '10', '1']), burstHeal), slotOf(synthetic(2, 'Step3', 20))];
    const p = firstPassTimeline(s, { frames: 1800, burst: true }).first;
    const bursts = p.schedule!.activations.filter((a) => a.slotIndex === 0).map((a) => a.frame);
    expect(p.history.heals.filter((h) => h.slotIndex === 1).map((h) => h.frame)).toEqual(bursts);
    expect(itemsOf(p.history, { kind: 'timed' }).map((i) => i.start)).toEqual(bursts);
  });

  it('does not fire healed without heals (the cached events of another call are not reused)', () => {
    const [healed] = resolveTimed(slots[0]!.definition!, slots[0]!.character, MAX_SKILL_LEVELS);
    const withHeals = pass.history.heals;
    expect(triggerFrames(healed!.trigger, pass.schedule, 0, 1800, pass.shots, withHeals).length).toBeGreaterThan(0);
    expect(triggerFrames(healed!.trigger, pass.schedule, 0, 1800, pass.shots)).toEqual([]);
  });
});
