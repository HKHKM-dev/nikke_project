// アニス：スパークリングサマー（15）を含む編成（V-0712）。撮影と同じ、ココア（I・灼熱）+ シン（II・電撃）+ アニス（III）の水冷の敵で:
// S1: フルバーストの開始から、電撃の味方（自分とシン）に発動者基準の攻撃力▲・リロード速度▲（10 秒）。
// S2: 最後の弾丸で攻撃した時の倍率ダメージ（最終弾の 74f 後）。バースト: 自分に最大装弾数▼（5 → 1）・リロード速度▲・有利コードの攻撃ダメージ▲（10 秒）。
// 最大装弾数 1 の窓の中は毎発が最後の弾丸なので、S2 が毎発出る。ココアの S1 のデバフ解除が窓の途中に来ると、最大装弾数▼だけが外れ（▲は残る）、
// 次に込めるマガジンから素の 5 発に戻る（C-1038。課題 2-64）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput } from '../team.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  rawDefinition,
  SHOOTING_RANGE_ENEMY,
  windowsFrom,
} from './teamHelpers.ts';

const ANIS = 15;
const COCOA = 311;
const SIN = 401;
const COCOA_SLOT = 0;
const SIN_SLOT = 1;
const ANIS_SLOT = 2;

const WATER = { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Water' as const } };
const RECORDED = fixedTeam([COCOA, SIN, ANIS], ANIS_SLOT, WATER);
const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ココア + シン + アニス：スパークリングサマー・水冷）': RECORDED,
  '単騎（灼熱）': fixedTeam([ANIS], 0, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } }),
  '実戦寄り（リター + シン + アニス：スパークリングサマー + クエンシー + ナガ・水冷）': fixedTeam(
    [82, SIN, ANIS, 402, 450],
    ANIS_SLOT,
    WATER,
  ),
};

// ココアの S1 のデバフ解除の効くフレーム（CT ごとの発動の delayFrames 後。C-0822）
const cocoaS1 = rawDefinition<{ skills: { skill1: { effects: { kind: string; delayFrames: number }[] } } }>(COCOA).skills
  .skill1.effects.find((e) => e.kind === 'removeDebuff')!;

// S2 のミサイルの着弾の遅れ（C-1032）
const missileDelay = rawDefinition<{ skills: { skill2: { effects: { delayFrames: number }[] } } }>(ANIS).skills.skill2
  .effects[0]!.delayFrames;

describe('ココア + シン + アニス：スパークリングサマー（水冷）', () => {
  const plan = planTeamRun(RECORDED);
  const uses = activationFramesOfSlot(plan.schedule!, ANIS_SLOT);
  const fullBursts = plan.schedule!.fullBurstWindows.map((w) => w.start);
  const windows = (slot: number, skill: string, stat: string) =>
    effectWindows(plan, slot, { resourceId: ANIS, skill, stat });
  const shots = plan.shots[ANIS_SLOT]!.frames;
  const lastShots = plan.shots[ANIS_SLOT]!.lastShotFrames!;
  const isLastShot = new Set(lastShots);
  const burstWindows = windowsFrom(uses, 10, plan.frames);
  const inBurst = (f: number) => burstWindows.some((w) => w.start <= f && f < w.end);
  const removals = timerFramesOf({ everySeconds: 15 }, plan.frames).map((f) => f + cocoaS1.delayFrames);
  /** バーストの窓ごとの、窓の中の最初のデバフ解除（無ければ undefined） */
  const removalIn = (w: { start: number; end: number }) => removals.find((r) => w.start <= r && r < w.end);

  it('gives Electric allies (herself and Sin) attack and reload speed from every Full Burst, not Cocoa (S1)', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    for (const stat of ['attack', 'reloadSpeed']) {
      for (const slot of [SIN_SLOT, ANIS_SLOT])
        expect(windows(slot, 'skill1', stat)).toEqual(windowsFrom(fullBursts, 10, plan.frames));
      expect(windows(COCOA_SLOT, 'skill1', stat)).toEqual([]);
    }
  });

  it('gives only herself max ammo down, reload speed and elemental advantage damage for 10 s per burst', () => {
    expect(uses.length).toBeGreaterThan(2);
    for (const stat of ['reloadSpeed', 'elementDamage']) {
      expect(windows(ANIS_SLOT, 'burst', stat)).toEqual(burstWindows);
      for (const slot of [COCOA_SLOT, SIN_SLOT]) expect(windows(slot, 'burst', stat)).toEqual([]);
    }
    for (const slot of [COCOA_SLOT, SIN_SLOT]) expect(windows(slot, 'burst', 'maxAmmo')).toEqual([]);
  });

  it("lets Cocoa's S1 debuff removal cut only the max ammo down, from the frame after it (C-1038)", () => {
    // 撮影の編成では 1 回目と 4 回目の窓に S1 が来る（録画 1032・1033 と同じ）
    const cut = burstWindows.map(removalIn);
    expect(cut.filter((r) => r !== undefined).length).toBe(2);
    expect(cut[0]).toBeDefined();
    expect(cut[1]).toBeUndefined();
    expect(windows(ANIS_SLOT, 'burst', 'maxAmmo')).toEqual(
      burstWindows.map((w, i) => (cut[i] === undefined ? w : { start: w.start, end: cut[i]! + 1 })),
    );
    // S1 の▲も外れない
    for (const stat of ['attack', 'reloadSpeed'])
      expect(windows(ANIS_SLOT, 'skill1', stat)).toEqual(windowsFrom(fullBursts, 10, plan.frames));
  });

  it('fires the S2 damage after every last bullet: every magazine outside the burst, every shot inside until a debuff removal (max ammo 1)', () => {
    expect(missileDelay).toBeGreaterThan(0);
    const hits = plan.skillHits.filter((h) => h.slotIndex === ANIS_SLOT && h.effect.source.skill === 'skill2');
    // 戦闘の終わりを越えるヒットは出ない
    expect(hits.map((h) => h.frame)).toEqual(lastShots.map((f) => f + missileDelay).filter((f) => f < plan.frames));
    const maxAmmo = characterOf(ANIS).shot.maxAmmo;
    for (const w of burstWindows) {
      // 使ったフレームの発は▼の前（件は次のフレームから効く）
      const inside = shots.filter((f) => w.start < f && f < w.end);
      const r = removalIn(w);
      // 解除の前（解除の無い窓は窓の終わりまで）は毎発が最終弾
      expect(inside.filter((f) => r === undefined || f <= r).every((f) => isLastShot.has(f))).toBe(true);
      if (r === undefined) continue;
      // 解除の後に込めたマガジンは素の最大装弾数（込め終わりが解除の前なら、その 1 発のマガジンの次から）
      const next = inside.filter((f) => f > r);
      const restored = next.findIndex((f) => !isLastShot.has(f));
      expect(restored).toBeGreaterThanOrEqual(0);
      expect(restored).toBeLessThanOrEqual(1);
      expect(next.slice(restored, restored + maxAmmo).map((f) => isLastShot.has(f))).toEqual([
        ...Array<boolean>(maxAmmo - 1).fill(false),
        true,
      ]);
    }
    // 窓にかからないマガジン（込めたリロードも窓の外）は、どれも素の最大装弾数の発
    const ends = lastShots.map((f) => shots.indexOf(f));
    const outside = ends
      .slice(1)
      .map((end, i) => ({ reloadFrom: shots[ends[i]!]!, mag: shots.slice(ends[i]! + 1, end + 1) }))
      .filter(
        ({ reloadFrom, mag }) =>
          !inBurst(reloadFrom) &&
          !mag.some(inBurst) &&
          !burstWindows.some((w) => mag[0]! < w.start && w.start <= mag.at(-1)!),
      )
      .map(({ mag }) => mag);
    expect(outside.length).toBeGreaterThan(10);
    expect(outside.filter((mag) => mag.length !== maxAmmo)).toEqual([]);
    expect(ends[0]).toBe(maxAmmo - 1);
  });

  it('reloads faster inside the first burst window than before it', () => {
    // 最終弾から次のマガジンの 1 発目まで（リロード）
    const reloads = shots
      .slice(1)
      .map((f, i) => ({ prev: shots[i]!, f }))
      .filter(({ prev }) => isLastShot.has(prev));
    const before = reloads.filter(({ f }) => f < uses[0]!).map(({ prev, f }) => f - prev);
    expect(before.length).toBeGreaterThan(0);
    const [first] = burstWindows;
    // 窓の中で始まったリロードだけを見る（使った時点で走っていたリロードは素の長さ）
    const inside = reloads
      .filter(({ prev, f }) => prev >= first!.start && f < first!.end)
      .map(({ prev, f }) => f - prev);
    expect(inside.length).toBeGreaterThan(5);
    expect(Math.max(...inside)).toBeLessThan(Math.min(...before) / 2);
  });
});

describe('味方の▼の定義の検証（課題 2-64）', () => {
  type Raw = { skills: { burst: { effects: Record<string, unknown>[] } } };
  const patched = (patch: Record<string, unknown>) => {
    const copy = structuredClone(rawDefinition<Raw>(ANIS));
    const down = copy.skills.burst.effects.findIndex((e) => e.stat === 'maxAmmo');
    copy.skills.burst.effects[down] = { ...copy.skills.burst.effects[down], ...patch };
    return () => parseSkillDefinition(copy);
  };

  it('rejects a chance trigger or perCount on an ally decrease (debuff removal cannot close those items)', () => {
    expect(patched({})).not.toThrow();
    expect(patched({ stat: 'attack', trigger: { count: 'normalHit', chanceRef: 1 } })).toThrow(/ally decrease/);
    expect(patched({ perCount: { state: 'drunken' } })).toThrow(/ally decrease/);
  });
});

describeEveryShotInOneGroup(TEAMS);
