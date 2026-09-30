// Stage 11 紅蓮BS 編: 紅蓮：ブラックシャドウ（225）を含む編成の射撃の刻み・循環の段・1 発の値・sim と calc の整合
// （plan/design-stage11-scarlet-bs.md 7.3〜7.5 節）。実測値は録画 46（単騎）・47（ラム + デルタ + 紅蓮BS（操作））、2026-09-24。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeCadence } from '../cadence.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { measuredChargeCadence } from '../frame/firing.ts';
import { planShots } from '../frame/shots.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { planTeamRun, type SkillHitEvent } from '../frame/plan.ts';
import { type TeamInput, type TeamSlotInput, type TeamResult } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const REC46 = team([fixedSlot(225)], 0);
const REC47 = team([fixedSlot(822), fixedSlot(20), fixedSlot(225)], 2);
const PRACTICAL = team([fixedSlot(82), fixedSlot(330), fixedSlot(225), fixedSlot(191), fixedSlot(172)], 2);
const TEAMS: Record<string, TeamInput> = {
  '録画 46（紅蓮BS 単騎）': REC46,
  '録画 47（ラム + デルタ + 紅蓮BS）': REC47,
  '実戦寄り（リター + クラウン + 紅蓮BS + アリス + アドミ）': PRACTICAL,
};

function segmentAt(result: TeamResult, slotIndex: number, frame: number) {
  return result.slots[slotIndex]!.segments.find((g) => g.ranges.some((r) => r.start <= frame && frame < r.end))!;
}

/** 倍率ダメージの表示の 1 ヒット（非会心）。分配の 3 ティックは ticks = 3 */
const skillHitShown = (h: SkillHitEvent, ticks = 1) =>
  Math.round((h.hit.baseHit * h.effect.multiplier * (1 + h.hit.boost.fullBurst)) / ticks);

describe('射撃の刻みの較正（3.3・7.3）', () => {
  it('fires 紅蓮BS every 43f and 172f across a reload (録画 46。046-21)', () => {
    const cadence = computeCadence(character(225).shot);
    expect(cadence.shotFrames).toEqual([0, 43, 86, 129, 172, 215, 258, 301, 344]);
    // Stage 22-A: 戦闘開始の 1 発目は 43 − 13 = 30f（046-19）。リロードの後は 43f のまま
    expect(cadence.firstShotFrames).toBe(30);
    expect(cadence.reloadFirstShotFrames).toBe(43);
    // Stage 24: リロード 2 秒 ÷ 0.017 + 11f（C-0149）。射手は端数を持ち越すので、172f と 171f が約 2:1 で混ざる（実測は 172f）
    expect(cadence.reloadFrames).toBeCloseTo(2 / 0.017 + 11, 9);
    const frames = planShots([{ character: character(225) }], 1200)[0]!.frames;
    const gaps = frames.slice(1).map((f, i) => f - frames[i]!);
    expect(gaps.slice(0, 10)).toEqual([43, 43, 43, 43, 43, 43, 43, 43, 172, 43]);
  });

  it('leaves the other charge weapons as they were (82f)', () => {
    for (const id of [304, 20, 822, 191, 172]) {
      expect(measuredChargeCadence(character(id).shot)).toBeNull();
    }
    expect(computeCadence(character(304).shot).shotFrames[1]).toBe(82);
  });
});

describe('録画 47 の予測（7.5）', () => {
  const plan = planTeamRun(REC47);
  const fb = plan.schedule!.fullBurstWindows;
  const shots = plan.shots[2]!.frames;
  const hits = plan.skillHits.filter((h) => h.slotIndex === 2);
  const stepAt = new Map(hits.map((h) => [h.frame, h.effect.cycle!.step]));

  it('opens 5 full bursts of 10 s, 40 s apart, with 紅蓮BS as III', () => {
    // Stage 21-B: 40 秒 = 2,352f、10 秒 = 588f。C-0073 で段の間隔を 20f → 29f にして 470 → 497。
    // V-0028 で 1 発のゲージを ×1.2 → ×1.0 にして 497 → 646、V-0030 で S1 の段のヒットのゲージ（C-0085）を入れて 497 に戻った
    // （録画 47 の 1 回目は約 486f）。Stage 22-A で戦闘開始の 1 発目が 13f 早くなって 497 → 484
    expect(fb.map((w) => w.start)).toEqual([0, 1, 2, 3, 4].map((k) => 484 + k * gameSecondsToFrames(40)));
    expect(fb.every((w) => w.end - w.start === Math.min(gameSecondsToFrames(10), plan.frames - w.start))).toBe(true);
    expect(fb.every((w) => w.burstUsers.includes(2))).toBe(true);
  });

  it('refills to 14 at the full burst start and opens the tier window for 10 s from the burst', () => {
    expect(plan.instants.filter((x) => x.slotIndex === 2 && x.effect.kind === 'ammoRefill')).toHaveLength(5);
    const maxAmmo = plan.timeline.windows.filter((w) => w.slotIndex === 2 && w.effect.stat === 'maxAmmo');
    const tenSeconds = (f: number) => Math.min(f + gameSecondsToFrames(10), plan.frames);
    expect(maxAmmo.map((w) => [w.start, w.end])).toEqual(fb.map((w) => [w.start, tenSeconds(w.start)]));
    const windows = plan.timeline.cycleWindows;
    const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === 2).map((a) => a.frame);
    expect(windows.map((w) => [w.slotIndex, w.start, w.end, w.every])).toEqual(
      bursts.map((f) => [2, f, tenSeconds(f), 1]),
    );
  });

  it('fires a tier on every shot inside the window and returns to multiples of 3 of the running count after it', () => {
    let count = 0;
    let step = 0;
    for (const f of shots) {
      count += 1;
      const inWindow = plan.timeline.cycleWindows.some((w) => w.start <= f && f < w.end);
      if (inWindow || count % 3 === 0) {
        expect(stepAt.get(f), `shot ${count} at f${f}`).toBe(step);
        step = (step + 1) % 3;
      } else {
        expect(stepAt.has(f), `shot ${count} at f${f}`).toBe(false);
      }
    }
    expect(hits).toHaveLength(stepAt.size);
  });

  it('matches FB1 of 録画 47: C just before, 13 tiers A → A inside, B on the 2nd shot after', () => {
    const w = plan.timeline.cycleWindows[0]!;
    const before = shots.filter((f) => f < w.start);
    const inside = shots.filter((f) => f >= w.start && f < w.end);
    const after = shots.filter((f) => f >= w.end);
    expect(stepAt.get(before[before.length - 1]!)).toBe(2);
    expect(inside.map((f) => 'ABC'[stepAt.get(f)!]).join('')).toBe('ABCABCABCABCA');
    expect(stepAt.has(after[0]!)).toBe(false);
    expect(stepAt.get(after[1]!)).toBe(1);
  });
});

describe('S1 の段のヒットで溜まるゲージ（V-0030・C-0085）', () => {
  const plan = planTeamRun(REC46);
  const shots = plan.shots[0]!.frames;

  it('charges 25,000 per hit, 5f after the shot for A and C and 5 / 19 / 33f for the 3 ticks of B', () => {
    // 段の発動（planSkillHits）から出した予約と、1 パス目で追った予約が一致する（窓の中の段も含めて）
    const delays = [[5], [5, 19, 33], [5]];
    const expected = plan.skillHits
      .filter((h) => h.slotIndex === 0 && h.effect.cycle !== undefined)
      .flatMap((h) => delays[h.effect.cycle!.step]!.map((d) => h.frame + d));
    expect(plan.cycleGaugeHits.map((h) => h.frame)).toEqual(expected);
    expect(plan.cycleGaugeHits.every((h) => h.energy === 25_000)).toBe(true);
  });

  it('fills at the 20th shot with 10 skill hits before it (20 × 37,500 + 10 × 25,000 = 1,000,000。録画 46・55・70・71)', () => {
    const full = plan.schedule!.gaugeFullFrames[0]!;
    expect(full).toBe(shots[19]);
    expect(plan.cycleGaugeHits.filter((h) => h.frame <= full)).toHaveLength(10);
  });

  it('counts no skill hit on the gauge without the definition', () => {
    const bare = planTeamRun(team([{ ...fixedSlot(225), skills: undefined }], 0));
    expect(bare.cycleGaugeHits).toEqual([]);
    expect(bare.schedule!.gaugeFullFrames[0]!).toBe(bare.shots[0]!.frames[26]);
  });
});

describe('録画 46・47 の実測（1 発の数値、2026-09-24）', () => {
  const calc = computeTeamDamage(REC47);
  const plan = planTeamRun(REC47);
  const hits = plan.skillHits.filter((h) => h.slotIndex === 2);
  const w = plan.timeline.cycleWindows[0]!;
  const outside = hits.filter((h) => h.frame < w.start || h.frame >= w.end + 600);
  const inside = hits.filter((h) => h.frame >= w.start && h.frame < w.end);
  const of = (list: SkillHitEvent[], step: number) => list.find((h) => h.effect.cycle!.step === step)!;
  /** 通常攻撃のコア・フルチャージの表示（非会心）。攻撃力は整数に丸めてから防御を引く */
  const normalShown = (frame: number, crit = 0) => {
    const t = segmentAt(calc, 2, frame).trigger;
    return Math.round(
      (Math.round(t.attack) - 100) * t.weaponMultiplier * t.chargeMultiplier * (1 + 1 + t.boost.fullBurst + crit),
    );
  };

  it('matches the tiers and the normal attack outside the window (341,317 / 227,119 × 3 / 1,022,673 / 207,265)', () => {
    expect(skillHitShown(of(outside, 0))).toBe(341317);
    expect(skillHitShown(of(outside, 1), 3)).toBe(227119);
    expect(skillHitShown(of(outside, 2))).toBe(1022673);
    expect(normalShown(60)).toBe(207265);
  });

  it('matches the tiers and the normal attack inside the window (1,101,851 / 733,192 × 3 / 3,301,427 / 1,188,135)', () => {
    expect(Math.round(segmentAt(calc, 2, w.start + 100).trigger.attack)).toBe(259637);
    expect(skillHitShown(of(inside, 0))).toBe(1101851);
    expect(skillHitShown(of(inside, 1), 3)).toBe(733192);
    expect(skillHitShown(of(inside, 2))).toBe(3301427);
    expect(normalShown(w.start + 100)).toBe(1188135);
  });

  it('matches the critical hits (511,976 / 1,534,010 outside, 1,469,135 inside)', () => {
    const crit = (h: SkillHitEvent) =>
      Math.round(h.hit.baseHit * h.effect.multiplier * (1 + h.hit.boost.fullBurst + 0.5));
    expect(crit(of(outside, 0))).toBe(511976);
    expect(crit(of(outside, 2))).toBe(1534010);
    expect(crit(of(inside, 0))).toBe(1469135);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc (7.4): %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the instants, the skill hits and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.damage).toBe(c.skillHits.totalDamage);
      expect(s.burst.damage).toBe(c.burst.totalDamage);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
