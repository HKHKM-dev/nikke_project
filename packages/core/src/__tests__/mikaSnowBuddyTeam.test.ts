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
const tidyingUpOf = (plan: Plan, mika: number, holder: number) =>
  stateItemsOf(plan).filter((i) => i.state === 'tidyingUp' && i.sourceSlotIndex === mika && i.slotIndex === holder);

/** ミカ自身の整理整頓が初めてフルスタックになったフレーム */
const firstFullOf = (plan: Plan, mika: number) =>
  Math.min(
    ...tidyingUpOf(plan, mika, mika)
      .filter((i) => i.stack === TIDY_UP_MAX)
      .map((i) => i.start),
  );

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const plan = planTeamRun(input);
  const mika = input.slots.findIndex((s) => s?.character.resourceId === MIKA_SB);
  const holders = input.slots.map((_, i) => i);

  it('gives every ally Tidying Up one stack at a time up to full stacks, two on the same frame at the common multiple', () => {
    for (const h of holders) {
      const items = tidyingUpOf(plan, mika, h);
      // 段は 1 段目から 1 段ずつ上がり、フルスタックの後は維持を付け直すだけ（同じ段の件）で下がらない
      const stacks = items.map((i) => i.stack ?? 1).filter((n, k, a) => k === 0 || n !== a[k - 1]);
      expect(stacks).toEqual(Array.from({ length: TIDY_UP_MAX }, (_, k) => k + 1));
      // ミカ自身の段: 命中 120・150・240・300・360・450・480 回目に 1 段ずつ、600 回目（公倍数）に S1 と S2 で 2 段、720 回目で 10 段
      // （ほかの味方の段は、その味方のスタック量▲でも上がる。アリス：ワンダーランドバニーの S1 は水冷の自分に足す）
      if (h !== mika) continue;
      const firstStart = (n: number) => Math.min(...items.filter((i) => i.stack === n).map((i) => i.start));
      const starts = stacks.map(firstStart);
      expect(starts[8]).toBe(starts[7]);
      expect(new Set(starts).size).toBe(TIDY_UP_MAX - 1);
    }
  });

  it('raises every ally’s max ammo while she is at full Tidying Up, from the frame it fills', () => {
    const full = firstFullOf(plan, mika);
    for (const h of holders) {
      const windows = effectWindows(plan, h, { resourceId: MIKA_SB, skill: 'skill1', stat: 'maxAmmo' });
      expect(windows).toEqual([{ start: full, end: plan.frames }]);
    }
  });

  // 実戦寄りの編成は、ほかの味方の最大装弾数▲・弾丸チャージでマガジンの発数が変わるので、単騎で見る
  it.runIf(name.startsWith('撮影'))(
    'loads the raised max ammo from the first reload after her Tidying Up fills',
    () => {
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
    },
  );

  it('multiplies the gauge of her own shots by the S2 gauge speed up from the first shot, and leaves the allies’ shots alone', () => {
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

  it('gives every ally caster-based ATK up for the Burst duration on each of her Bursts', () => {
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
  it('fills her own Tidying Up earlier than S1 alone would', () => {
    const withStack = planTeamRun(soloInput());
    const withoutStack = planTeamRun(soloInput(dropEffect('skill2', 0)));
    expect(firstFullOf(withStack, 0)).toBeLessThan(firstFullOf(withoutStack, 0));
  });
});

describeEveryShotInOneGroup(TEAMS);
