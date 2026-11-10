// アニス：スパークリングサマー（15）を含む編成（V-0712）。撮影と同じ、ココア（I・灼熱）+ シン（II・電撃）+ アニス（III）の水冷の敵で:
// S1: フルバーストの開始から、電撃の味方（自分とシン）に発動者基準の攻撃力▲・リロード速度▲（10 秒）。
// S2: 最後の弾丸で攻撃した時の倍率ダメージ（最終弾の 74f 後）。バースト: 自分に最大装弾数▼（5 → 1）・リロード速度▲・有利コードの攻撃ダメージ▲（10 秒）。
// 最大装弾数 1 の窓の中は毎発が最後の弾丸なので、S2 が毎発出る。モデルはココアの S1 のデバフ解除で最大装弾数▼を外さない（C-1038。未反映）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  SHOOTING_RANGE_ENEMY,
  windowsFrom,
} from './teamHelpers.ts';

const ANIS = 15;
const COCOA = 311;
const SIN = 401;
const COCOA_SLOT = 0;
const SIN_SLOT = 1;
const ANIS_SLOT = 2;

const RECORDED = fixedTeam([COCOA, SIN, ANIS], ANIS_SLOT, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Water' } });
const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ココア + シン + アニス：スパークリングサマー・水冷）': RECORDED,
  '単騎（灼熱）': fixedTeam([ANIS], 0, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } }),
  '実戦寄り（リター + シン + アニス：スパークリングサマー + クエンシー + ナガ・水冷）': fixedTeam(
    [82, SIN, ANIS, 402, 450],
    ANIS_SLOT,
    { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Water' } },
  ),
};

describe('ココア + シン + アニス：スパークリングサマー（水冷）', () => {
  const plan = planTeamRun(RECORDED);
  const uses = activationFramesOfSlot(plan.schedule!, ANIS_SLOT);
  const fullBursts = plan.schedule!.fullBurstWindows.map((w) => w.start);
  const windows = (slot: number, skill: string, stat: string) =>
    effectWindows(plan, slot, { resourceId: ANIS, skill, stat });
  const shots = plan.shots[ANIS_SLOT]!.frames;
  const lastShots = plan.shots[ANIS_SLOT]!.lastShotFrames!;
  const burstWindows = windowsFrom(uses, 10, plan.frames);
  const inBurst = (f: number) => burstWindows.some((w) => w.start <= f && f < w.end);

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
    for (const stat of ['maxAmmo', 'reloadSpeed', 'elementDamage']) {
      expect(windows(ANIS_SLOT, 'burst', stat)).toEqual(burstWindows);
      for (const slot of [COCOA_SLOT, SIN_SLOT]) expect(windows(slot, 'burst', stat)).toEqual([]);
    }
  });

  it('fires the S2 damage 74f after every last bullet: every 5th shot outside the burst, every shot inside (max ammo 1)', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === ANIS_SLOT && h.effect.source.skill === 'skill2');
    // ミサイルの着弾（C-1032）。戦闘の終わりを越えるヒットは出ない
    expect(hits.map((h) => h.frame)).toEqual(lastShots.map((f) => f + 74).filter((f) => f < plan.frames));
    const inside = shots.filter(inBurst);
    expect(inside.length).toBeGreaterThan(10);
    expect(inside.every((f) => lastShots.includes(f))).toBe(true);
    // 窓の外は 5 発ごと（最初のマガジン）
    expect(lastShots[0]).toBe(shots[4]);
  });

  it('reloads faster inside the first burst window than before it', () => {
    const gaps = shots.slice(1).map((f, i) => ({ f, gap: f - shots[i]! }));
    const before = Math.max(...gaps.filter(({ f }) => f < uses[0]!).map(({ gap }) => gap));
    const [first] = burstWindows;
    // 窓の始まりのマガジンの残り（使った時点でリロード中かもしれない）を外し、窓の中で始まったリロードだけを見る
    const inside = gaps.filter(({ f, gap }) => f - gap > first!.start + 60 && f < first!.end).map(({ gap }) => gap);
    expect(inside.length).toBeGreaterThan(5);
    expect(Math.max(...inside)).toBeLessThan(before / 2);
  });
});

describeEveryShotInOneGroup(TEAMS);
