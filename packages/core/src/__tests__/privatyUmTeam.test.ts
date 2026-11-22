// プリバティ：アンカインド・メイド（313）を含む編成: S1 のペレット 30 個ごとの倍率ダメージ（回数トリガー pelletHit。
// plan/design-pellet-hit.md、C-0408）。S1 の発火が当たったペレットの期待値の累計で決まること。S2 のリロード速度▲（1 発の当たった
// ペレットの数のしきい値 minPellets。plan/design-privaty-um-s2.md、C-1549）が、撃っている間ずっと付いてリロードの始まりに効くこと。
// S2 のフルバースト中の弾丸チャージと攻撃力▲（発火の窓 firesDuring。plan/design-privaty-um-s2-full-burst.md、C-1561・C-1560）。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const enemy: EnemyInput = fixedEnemy();

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return fixedTeam(slots, controlledSlot, { enemy });
}

const PRIVATY_UM = 313;
// 撮影の編成（単騎。V-0374）と、プリバティ：アンカインド・メイドが III の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; privaty: number }> = {
  '撮影の編成（プリバティ：アンカインド・メイド単騎）': { input: team([fixedSlot(PRIVATY_UM)], 0), privaty: 0 },
  '実戦寄り（リター + クラウン + プリバティ：アンカインド・メイド + アリス + ドレイク）': {
    input: team([fixedSlot(82), fixedSlot(330), fixedSlot(PRIVATY_UM), fixedSlot(191), fixedSlot(101)], 2),
    privaty: 2,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, privaty }) => {
  const plan = planTeamRun(input);

  it('fires S1 on the shots where the expected pellet hits reach a multiple of 30 (C-0408)', () => {
    const log = plan.shots[privaty]!;
    const s1 = plan.skillHits.filter((h) => h.slotIndex === privaty && h.effect.source.skill === 'skill1');
    let total = 0;
    const expected: number[] = [];
    log.frames.forEach((f, k) => {
      const next = total + log.pelletHits![k]!;
      // ヒットは発の 6f 後（C-0659。delayFrames）
      if (Math.floor(next / 30 + 1e-9) > Math.floor(total / 30 + 1e-9) && f + 6 < plan.frames) expected.push(f + 6);
      total = next;
    });
    expect(s1.length).toBeGreaterThan(10);
    expect(s1.map((h) => h.frame)).toEqual(expected);
    // SG の 1 発は 10 ペレット × 当たった割合（手入力の弾丸命中率 1 × 置き値 0.75）
    expect(new Set(log.pelletHits)).toEqual(new Set([7.5]));
  });

  it('keeps the S2 reload speed on Privaty: Unkind Maid at every last shot of a magazine (C-1549)', () => {
    const shots = plan.shots[privaty]!.frames;
    const windows = itemsOf(plan.history, { holder: privaty, skill: 'skill2', stat: 'reloadSpeed' });
    // 1 発の期待値 7.5 個 ≥ 5 なので、どの発でも付き直す
    const lastShots = shots.filter((f, i) => i + 1 < shots.length && shots[i + 1]! - f > 60);
    expect(lastShots.length).toBeGreaterThan(3);
    for (const f of lastShots) expect(windows.some((w) => w.start <= f && f < w.end)).toBe(true);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([name, { input }]) => [name, input])));

// S2 の 2 つめは、撮影の編成（鈴原サクラ + デルタ + プリバティ：アンカインド・メイド。V-0875）で見る
describe('S2 のフルバースト中のペレット 30 回ごとの弾丸チャージと攻撃力▲', () => {
  const privaty = 2;
  const plan = planTeamRun(team([fixedSlot(836), fixedSlot(20), fixedSlot(PRIVATY_UM)], privaty));
  const windows = plan.schedule!.fullBurstWindows;
  const inFullBurst = (f: number) => windows.some((w) => w.start <= f && f < w.end);
  const refills = plan.instants
    .filter((i) => i.sourceSlotIndex === privaty && i.effect.kind === 'ammoRefill')
    .map((i) => i.frame);
  // S1 のヒットは発の 6f 後（C-0659）。その発のフレーム
  const s1Shots = plan.skillHits
    .filter((h) => h.slotIndex === privaty && h.effect.source.skill === 'skill1')
    .map((h) => h.frame - 6);

  it('adds a round only inside full bursts, on the shots that fire S1 (C-1561)', () => {
    expect(windows.length).toBeGreaterThan(3);
    expect(refills.length).toBeGreaterThan(windows.length);
    expect(refills.every(inFullBurst)).toBe(true);
    // 戦闘の始めから S1 と同じ量で数えるので、窓の中の S1 の発と弾丸チャージの発は同じ（窓の外の S1 の発では付かない）
    expect(refills).toEqual(s1Shots.filter(inFullBurst));
    expect(s1Shots.some((f) => !inFullBurst(f))).toBe(true);
  });

  it('stacks the attack increase on the same shots (C-1560)', () => {
    const attack = itemsOf(plan.history, { holder: privaty, skill: 'skill2', stat: 'attack' });
    const starts = [...new Set(attack.map((w) => w.start))].sort((a, b) => a - b);
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) expect(refills.some((f) => s - f >= 0 && s - f <= 1)).toBe(true);
    for (const f of refills) expect(starts.some((s) => s - f >= 0 && s - f <= 1)).toBe(true);
  });
});
