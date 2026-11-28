// ミカ：スノーバディ（62）を含む編成（V-0890）: S1 の命中ごとの整理整頓のスタックとフルスタックの間の最大装弾数▲、S2 の命中ごとの
// スタック量▲（自分の整理整頓にも足す）とゲージのチャージ速度▲、バーストの発動者基準の攻撃力▲が意図どおりに出るか。撮影の編成
// （単騎・射撃場の 3 分モード・条件は自動）と、実戦寄りの編成で見る
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { stateItemsOf } from './historyHelpers.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  effectWindows,
  fixedSlot,
  fixedTeam,
  rangeEnemyWithEvents,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const MIKA_SB = 62;
const CROWN = 330;
const ALICE_WB = 195;
const ALICE = 191;
const CROW = 110;

type Edit = NonNullable<NonNullable<Parameters<typeof fixedSlot>[1]>['edit']>;

/** ミカの定義から、スロット slot の effects[index] を外す */
const dropEffect =
  (slot: 'skill1' | 'skill2' | 'burst', index: number): Edit =>
  (raw) => {
    (raw.skills as Record<string, { effects: unknown[] }>)[slot]!.effects.splice(index, 1);
  };

const soloInput = (edit?: Edit): TeamInput =>
  fixedTeam([fixedSlot(MIKA_SB, { conditionMode: 'auto', ...(edit === undefined ? {} : { edit }) })], 0, {
    enemy: rangeEnemyWithEvents(),
  });

// クラウン（II）・アリス：ワンダーランドバニー（I）・アリス（III）・クロウ（III）
const realisticInput = (edit?: Edit): TeamInput =>
  fixedTeam([fixedSlot(MIKA_SB, edit === undefined ? {} : { edit }), CROWN, ALICE_WB, ALICE, CROW], 0);

const BUILDERS: Record<string, (edit?: Edit) => TeamInput> = {
  '撮影の編成（ミカ：スノーバディ単騎）': soloInput,
  '実戦寄り（ミカ：スノーバディ + クラウン + アリス：ワンダーランドバニー + アリス + クロウ）': realisticInput,
};
const TEAMS: Record<string, TeamInput> = Object.fromEntries(Object.entries(BUILDERS).map(([k, b]) => [k, b()]));

const MAX_AMMO = characterOf(MIKA_SB).shot.maxAmmo;
const AMMO_UP = skillValueOf(MIKA_SB, 'skill1', 5) / 100;
const TIDY_UP_MAX = skillValueOf(MIKA_SB, 'skill1', 3);
const GAUGE_UP = skillValueOf(MIKA_SB, 'skill2', 3) / 100;
const ATK_SECONDS = skillValueOf(MIKA_SB, 'burst', 3);

type Plan = ReturnType<typeof planTeamRun>;

/** 枠 holder にミカ（枠 mika）が付けた整理整頓の件 */
const tidyUpOf = (plan: Plan, mika: number, holder: number) =>
  stateItemsOf(plan).filter((i) => i.state === 'tidyUp' && i.sourceSlotIndex === mika && i.slotIndex === holder);

/** ミカ自身の整理整頓が初めてフルスタックになったフレーム */
const firstFullOf = (plan: Plan, mika: number) =>
  Math.min(
    ...tidyUpOf(plan, mika, mika)
      .filter((i) => i.stack === TIDY_UP_MAX)
      .map((i) => i.start),
  );

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const plan = planTeamRun(input);
  const mika = input.slots.findIndex((s) => s?.character.resourceId === MIKA_SB);
  const holders = input.slots.map((_, i) => i);

  it('gives every ally Tidy Up, raised one stack at a time (two when both counts land together), up to 10', () => {
    for (const h of holders) {
      const items = tidyUpOf(plan, mika, h);
      expect(Math.max(...items.map((i) => i.stack ?? 1))).toBe(TIDY_UP_MAX);
      // 段が上がるのは 1 段（120 回目か 150 回目）か 2 段（公倍数の 600 回目）ずつ
      const rises = items.slice(1).map((it, k) => (it.stack ?? 1) - (items[k]!.stack ?? 1));
      for (const d of rises) expect(d).toBeOneOf([0, 1, 2]);
    }
  });

  it('raises every ally’s max ammo by 40% while she is at full Tidy Up, from the frame it fills', () => {
    const full = firstFullOf(plan, mika);
    for (const h of holders) {
      const windows = effectWindows(plan, h, { resourceId: MIKA_SB, skill: 'skill1', stat: 'maxAmmo' });
      expect(windows).toEqual([{ start: full, end: plan.frames }]);
    }
  });

  // 実戦寄りの編成は、ほかの味方の最大装弾数▲・弾丸チャージでマガジンの発数が変わるので、単騎で見る
  it.runIf(name.startsWith('撮影'))('loads 168 rounds from the first reload after her Tidy Up fills', () => {
    const full = firstFullOf(plan, mika);
    // ▲の付いた後に込めたマガジンからは round(120 × 1.4) = 168 発（付いた時の残弾は増やさない）
    const shots = plan.shots[mika]!.frames;
    const ends = plan.shots[mika]!.lastShotFrames!;
    const sizes = ends.map((end, k) => shots.filter((f) => (k === 0 ? 0 : ends[k - 1]!) < f && f <= end).length);
    const before = sizes.filter((_, k) => ends[k]! < full);
    expect(before.every((n) => n === MAX_AMMO)).toBe(true);
    const raised = Math.round(MAX_AMMO * (1 + AMMO_UP));
    const after = sizes.filter((_, k) => k > 0 && ends[k - 1]! > full);
    expect(after.length).toBeGreaterThan(5);
    expect(after.every((n) => n === raised)).toBe(true);
  });

  it('multiplies the gauge of her own shots by 1 + 300% from the first shot, and leaves the allies’ shots alone', () => {
    const without = planTeamRun(BUILDERS[name]!(dropEffect('skill2', 1)));
    // 外す前と後で発の並びが同じ、最初の満タンまでの発で比べる
    const full = Math.min(plan.schedule!.gaugeFullFrames[0]!, without.schedule!.gaugeFullFrames[0]!);
    const energies = (p: Plan, slot: number) =>
      p.shotGauges.filter((g) => g.slotIndex === slot && g.frame <= full).map((g) => g.energy);
    for (const h of holders) {
      const mine = energies(plan, h);
      const base = energies(without, h);
      expect(mine.length).toBe(base.length);
      if (h === mika) expect(mine.length).toBeGreaterThan(50);
      mine.forEach((e, k) => expect(e).toBeCloseTo(base[k]! * (h === mika ? 1 + GAUGE_UP : 1), 6));
    }
  });

  it('gives every ally caster-based ATK up for 5 s on each of her Bursts', () => {
    const mine = plan
      .schedule!.activations.filter((a) => a.slotIndex === mika)
      .map(effectFrameOf)
      .filter((f) => f < plan.frames);
    expect(mine.length).toBeGreaterThan(3);
    for (const h of holders)
      expect(effectWindows(plan, h, { resourceId: MIKA_SB, skill: 'burst', stat: 'attack' })).toEqual(
        windowsFrom(mine, ATK_SECONDS, plan.frames),
      );
  });
});

describe('ミカ：スノーバディの S2 のスタック量▲', () => {
  it('fills her own Tidy Up earlier than S1 alone would', () => {
    const withStack = planTeamRun(soloInput());
    const withoutStack = planTeamRun(soloInput(dropEffect('skill2', 0)));
    expect(firstFullOf(withStack, 0)).toBeLessThan(firstFullOf(withoutStack, 0));
  });
});

describeEveryShotInOneGroup(TEAMS);
