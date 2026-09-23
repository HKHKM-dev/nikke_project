// Stage 11 モダニア編: モダニア（260）を含む編成の窓の一致・射撃・sim と calc の整合（plan/design-stage11-modernia.md 7.2〜7.5 節）。
// 録画 44（I-DOLL・フラワー + デルタ + モダニア（操作））の予測と実測値の回帰、実戦寄りの編成（リター + クラウン + モダニア + アリス + アドミ）。
// 実測値は plan/verification.md Stage 11 モダニア節（録画 44・45、2026-09-24）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { firingParams } from '../sim/firing.ts';
import { runFirstPass } from '../sim/firstPass.ts';
import { initialShooter, resumeShooter, stepShooter } from '../sim/shooter.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import {
  computeTeamDamage,
  countShotsInRanges,
  planTeamRun,
  toTimelineSlots,
  type TeamInput,
  type TeamResult,
  type TeamSlotInput,
} from '../team.ts';
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function fixedSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
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

const REC44 = team([fixedSlot(304), fixedSlot(20), fixedSlot(260)], 2);
const PRACTICAL = team([fixedSlot(82), fixedSlot(330), fixedSlot(260), fixedSlot(191), fixedSlot(172)], 2);
const TEAMS: Record<string, TeamInput> = {
  '録画 44（I-DOLL・フラワー + デルタ + モダニア）': REC44,
  '実戦寄り（リター + クラウン + モダニア + アリス + アドミ）': PRACTICAL,
};

type Window = { slotIndex: number; start: number; end: number; stack?: number };
const key = (w: Window) => `${w.slotIndex}:${w.start}-${w.end}:${w.stack ?? '-'}`;

function segmentAt(result: TeamResult, slotIndex: number, frame: number) {
  return result.slots[slotIndex]!.segments.find((g) => g.ranges.some((r) => r.start <= frame && frame < r.end))!;
}

describe('録画 44 の予測（7.5）', () => {
  const plan = planTeamRun(REC44);
  const calc = computeTeamDamage(REC44);
  const fb = plan.schedule!.fullBurstWindows;
  const shots = plan.shots[2]!.frames;
  const windows = plan.timeline.windows.filter((w) => w.slotIndex === 2);
  const of = (stat: string) => windows.filter((w) => w.effect.stat === stat);

  it('opens 4 full bursts of 15 s, each started by モダニア', () => {
    expect(fb).toHaveLength(4);
    expect(fb.every((w) => w.end - w.start === 900 && w.burstUsers.includes(2))).toBe(true);
    expect(fb.map((w) => w.start)).toEqual([724, 3634, 6544, 9454]);
  });

  it('stacks S1 on every 200th shot and keeps 5 stacks (300 → 285 → 270 → 255 → 240 → 224)', () => {
    const ammo = of('maxAmmo');
    // 段 1〜5 は 200・400・600・800・1000 発目の次のフレームから。付与のたびに維持時間が更新されるので途切れない
    expect(ammo.map((w) => [w.stack, w.start])).toEqual([1, 2, 3, 4, 5].map((k) => [k, shots[200 * k - 1]! + 1]));
    expect(ammo.every((w) => w.end === plan.frames)).toBe(true);
    const crit = of('critDamage');
    expect(crit.map((w) => w.start)).toEqual(ammo.map((w) => w.start));
    // 区間の実効値（殲滅モードの外）
    const maxAmmoAt = (f: number) => firingParams(REC44.slots[2]!.character.shot, segmentAt(calc, 2, f).buffs).maxAmmo;
    expect([1, 2, 3, 4, 5].map((k) => maxAmmoAt(ammo[k - 1]!.start))).toEqual([285, 270, 255, 240, 224]);
    expect(maxAmmoAt(plan.frames - 1)).toBe(224);
  });

  it('fires S2’s attack only at the 200th shots inside the hit rate windows', () => {
    const hit = plan.timeline.stateWindows.filter((w) => w.slotIndex === 2 && w.effect.stat === 'hitRate');
    expect(hit.map((w) => [w.start, w.end])).toEqual(fb.map((w) => [w.start, w.end]));
    const fires = shots.filter((_, i) => (i + 1) % 200 === 0);
    const inside = fires.filter((f) => hit.some((w) => w.start <= f && f < w.end));
    const outside = fires.filter((f) => !hit.some((w) => w.start <= f && f < w.end));
    expect(plan.timeline.conditionSkips.map((s) => s.frame)).toEqual(outside);
    // 攻撃力の窓は S2 が通った 200 発目の次のフレームから 10 秒（和集合）
    const attack = of('attack');
    expect(attack.length).toBeGreaterThan(0);
    for (const f of inside) expect(attack.some((w) => w.start <= f + 1 && f + 1 < w.end)).toBe(true);
    expect(attack.every((w) => inside.includes(w.start - 1))).toBe(true);
    expect(Math.round(segmentAt(calc, 2, attack[0]!.start).trigger.attack)).toBe(156154);
  });

  it('switches to Annihilation Mode from the frame after the burst: 1 shot / frame, no reload, base MG fully reloaded afterwards', () => {
    // 持ち替えるのは発動の次のフレームから、終わりは装弾数無限と同じ（weaponStartTrim）
    const weapon = of('weapon');
    expect(weapon.map((w) => [w.start, w.end])).toEqual(fb.map((w) => [w.start + 1, w.end]));
    const infinite = of('infiniteAmmo');
    expect(infinite.map((w) => [w.start, w.end])).toEqual(fb.map((w) => [w.start, w.end]));
    const last = new Set(plan.shots[2]!.lastShotFrames);
    for (const w of weapon) {
      const inside = shots.filter((f) => f >= w.start && f < w.end);
      expect(inside).toHaveLength(w.end - w.start); // 毎フレーム 1 発（4200 rpm は 1 フレーム 1 発で止まる）
      expect(inside.some((f) => last.has(f))).toBe(false);
      if (w.end >= plan.frames) continue;
      // 終わったら基礎の MG を最大装弾数（224）まで込め直して戻り、1 発目の遅延 20f の後に撃つ（録画 44: 約 22〜23f 後、4 回とも 224）
      expect(shots.find((f) => f >= w.end)).toBe(w.end + 20);
      const nextLast = plan.shots[2]!.lastShotFrames!.find((f) => f >= w.end);
      if (nextLast !== undefined) expect(shots.filter((f) => f >= w.end && f <= nextLast)).toHaveLength(224);
    }
    // 1 発に 2 ヒット（2.24% × 2）
    const g = segmentAt(calc, 2, weapon[0]!.start + 10);
    expect(g.trigger.weaponMultiplier).toBeCloseTo(0.0448, 12);
    expect(g.fullBurst).toBe(true);
  });

  it('adds S1’s additional damage to every shot (3.05%, no core)', () => {
    const outside = segmentAt(calc, 2, 60);
    expect(outside.trigger.perShot).toBeCloseTo(120594 * 0.0305 * (1 + 0.15 * 0.5), 6);
    const inFb = segmentAt(calc, 2, fb[0]!.start + 5);
    expect(inFb.trigger.perShot).toBeGreaterThan(outside.trigger.perShot * 1.4);
  });

  it('agrees between the loop and planBuffTimeline on every firing window, stacks included', () => {
    const first = runFirstPass(toTimelineSlots(REC44.slots), { frames: plan.frames, burst: true, controlledSlot: 2 });
    const firing = plan.timeline.windows.filter((w) => ['maxAmmo', 'infiniteAmmo', 'weapon'].includes(w.effect.stat));
    expect(first.firingWindows.map(key).sort()).toEqual(firing.map(key).sort());
    expect(first.shots).toEqual(plan.shots);
  });
});

describe('録画 44 の実測（1 発の数値、2026-09-24）', () => {
  const calc = computeTeamDamage(REC44);
  const plan = planTeamRun(REC44);
  const fb = plan.schedule!.fullBurstWindows;
  const attack = plan.timeline.windows.filter((w) => w.slotIndex === 2 && w.effect.stat === 'attack');
  /** 表示の 1 ヒット（非会心）。攻撃力は整数に丸めてから防御を引く（capture-pitfalls） */
  const hit = (frame: number, ratio: number, boost: number) =>
    Math.round((Math.round(segmentAt(calc, 2, frame).trigger.attack) - 100) * ratio * boost);

  it('matches the normal attack and S1’s additional damage outside full bursts (9,298 / 18,596 / 3,678 / 4,760)', () => {
    const t = segmentAt(calc, 2, 60).trigger;
    expect(t.weaponMultiplier).toBeCloseTo(0.0771, 12);
    expect(hit(60, 0.0771, 1)).toBe(9298);
    expect(hit(60, 0.0771, 2)).toBe(18596);
    expect(hit(60, 0.0305, 1)).toBe(3678);
    // FB の後の S2 の攻撃力▲の残り
    const afterFb = attack.find((w) => w.end > fb[0]!.end)!;
    expect(fb[0]!.end).toBeLessThan(afterFb.end);
    expect(hit(fb[0]!.end + 5, 0.0305, 1)).toBe(4760);
  });

  it('matches Annihilation Mode: 2 hits of 6,753 (8,739 with S2) + one additional 5,517 (7,139) per frame', () => {
    const before = fb[0]!.start + 5;
    const after = attack[0]!.start + 10;
    expect(segmentAt(calc, 2, before).trigger.weaponMultiplier).toBeCloseTo(0.0448, 12);
    expect(hit(before, 0.0224, 2.5)).toBe(6753);
    expect(hit(before, 0.0305, 1.5)).toBe(5517);
    expect(2 * hit(before, 0.0224, 2.5) + hit(before, 0.0305, 1.5)).toBe(19023);
    expect(hit(after, 0.0224, 2.5)).toBe(8739);
    expect(hit(after, 0.0305, 1.5)).toBe(7139);
    expect(2 * hit(after, 0.0224, 2.5) + hit(after, 0.0305, 1.5)).toBe(24617);
    // 追加ダメージの会心（FB 中・S2・5 スタック）: 4,759.6 × (1 + 0.5 + 0.5 + 0.7125) = 12,911
    expect(hit(after + 600, 0.0305, 2 + 0.7125)).toBe(12911);
    expect(segmentAt(calc, 2, after + 600).buffs.critDamage).toBeCloseTo(0.7125, 12);
  });
});

describe('実戦寄りの編成: 条件付きの攻撃力もアリスの順位に入る（3.3）', () => {
  const plan = planTeamRun(PRACTICAL);

  it('tracks the same attack windows (conditional ones included) in the loop and in planBuffTimeline', () => {
    const first = runFirstPass(toTimelineSlots(PRACTICAL.slots), {
      frames: plan.frames,
      burst: true,
      controlledSlot: 2,
    });
    const attack = plan.timeline.windows.filter((w) => w.effect.stat === 'attack' && w.effect.target !== 'topAttack');
    expect(first.rankAttackWindows.map(key).sort()).toEqual(attack.map(key).sort());
    expect(attack.some((w) => w.effect.condition !== undefined)).toBe(true);
    const speed = first.firingWindows.filter((w) => w.effect.target === 'topAttack');
    const damage = plan.timeline.windows.filter((w) => w.effect.stat === 'chargeDamage');
    expect(speed.map(key).sort()).toEqual(damage.map(key).sort());
  });

  it('lets モダニア and アリス alternate as III', () => {
    const iii = plan.schedule!.fullBurstWindows.map((w) => w.burstUsers[2]);
    expect(iii.slice(0, 4)).toEqual([2, 3, 2, 3]);
  });
});

describe('射手: 装弾数無限と基礎の武器に戻るとき（3.4・7.3）', () => {
  const mg = readJson<CharacterData>('../../data/characters/260.json').shot;

  it('does not spend ammo while infinite', () => {
    const params = { ...firingParams(mg), infiniteAmmo: true };
    const state = initialShooter(mg, DEFAULT_WEAPON_MODEL, params);
    let fired = 0;
    for (let f = 0; f < 2_000; f++) if (stepShooter(state, mg, DEFAULT_WEAPON_MODEL, params)) fired += 1;
    expect(fired).toBeGreaterThan(300);
    expect(state.ammo).toBe(300);
    expect(state.phase).toBe('ready');
  });

  it('brings the base MG back fully reloaded: the spin-up carries over while firing, restarts after a reload (録画 44)', () => {
    const params = firingParams(mg);
    const state = initialShooter(mg, DEFAULT_WEAPON_MODEL, params);
    for (let f = 0; f < 200; f++) stepShooter(state, mg, DEFAULT_WEAPON_MODEL, params);
    const firing = { ...state };
    resumeShooter(firing, mg, DEFAULT_WEAPON_MODEL, params);
    // 連射中だった（FB 4: 149 → 224）: 残弾は最大まで、レートの蓄積はそのまま、20f 後から最高レートで撃つ
    expect(firing).toMatchObject({ phase: 'ready', ammo: 300, shotsInMagazine: state.shotsInMagazine, wait: 20 });
    const fired: number[] = [];
    for (let f = 0; f < 30; f++) if (stepShooter(firing, mg, DEFAULT_WEAPON_MODEL, params)) fired.push(f);
    expect(fired[0]).toBe(20);
    expect(fired.slice(1).map((f, k) => f - fired[k]!)).toEqual(fired.slice(1).map(() => 1));
    // リロード中だった（FB 1〜3: 000 → 224）: 込め終えたマガジンの 1 発目から、スピンアップも最初から
    const reloading = { ...state, phase: 'reloading' as const, ammo: 0, wait: 50 };
    resumeShooter(reloading, mg, DEFAULT_WEAPON_MODEL, params);
    expect(reloading).toMatchObject({ phase: 'ready', ammo: 300, shotsInMagazine: 0, acc: 0, wait: 20 });
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc (7.4): %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the instants, the skill hits and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    expect(sim.timeline.conditionSkips).toEqual(calc.timeline.conditionSkips);
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
    // モダニアはほぼ全部のグループが「実数」（スタックの最大装弾数▼が途切れない）
    const modernia = calc.slots[2]!.segments;
    const shotsCounted = modernia.filter((g) => g.triggerSource === 'shots').reduce((a, g) => a + g.seconds, 0);
    expect(shotsCounted / 180).toBeGreaterThan(0.9);
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
