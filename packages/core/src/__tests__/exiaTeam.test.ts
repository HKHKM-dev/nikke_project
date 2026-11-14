// エクシア編（V-0765）: エクシア（210）を含む編成で、S2 のハッキングコード収集（基礎版は最後の弾丸ごと・宝物版はフルチャージの発ごとに
// 5 スタック）、S1 のハッキングコード収集状態の時の最後の弾丸の防御力▼、宝物版 S2 の電撃コードの味方への攻撃力▲（発動者基準）、
// バーストの防御力▼とフルスタックの時の追加ダメージ・受けるダメージ▲、宝物版 S1 のフルバーストの時のリロード速度▲が意図どおりに出るか。
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { hitFramesOf } from '../burst/schedule.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const EXIA = 210;
const DELTA = 20;
const SOLINE = 71;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const slotOf = (id: number, treasurePhase: TreasurePhase): TeamSlotInput => {
  const slot: TeamSlotInput = { ...fixedSlot(id), conditionMode: 'auto' };
  if (id === EXIA) slot.skills = { ...slot.skills!, treasurePhase };
  return slot;
};
const team = (ids: number[], controlledSlot: number, treasurePhase: TreasurePhase = 3): TeamInput => ({
  slots: ids.map((id) => slotOf(id, treasurePhase)),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'エクシア単騎（撮影 E1 の編成）': team([EXIA], 0),
  'デルタ + ソリン + エクシア（撮影 E2 の編成）': team([DELTA, SOLINE, EXIA], 2),
  'エクシア単騎（基礎版）': team([EXIA], 0, 0),
  'デルタ + ソリン + エクシア（基礎版）': team([DELTA, SOLINE, EXIA], 2, 0),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const s = input.slots.findIndex((x) => x?.character.resourceId === EXIA);
  const treasure = input.slots[s]!.skills!.treasurePhase === 3;
  const log = plan.shots[s]!;
  const lastShots = log.lastShotFrames ?? [];
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const hacking = items({ holder: s, kind: 'state', state: 'collectHackingCode' });
  /** フレーム f に効いている（f までに付いた）ハッキングコード収集の段 */
  const stackAt = (f: number) =>
    Math.max(0, ...hacking.filter((w) => w.start <= f && f < w.end).map((w) => w.stack ?? 1));

  it('grants Collect Hacking Code (5 stacks) from the frame after each full charge shot (treasure) or last bullet (base)', () => {
    const triggers = treasure ? log.frames : lastShots;
    expect(lastShots.length).toBeGreaterThan(10);
    expect(hacking.length).toBeGreaterThan(0);
    // 段ごとの件の始まりは、きっかけの発の次のフレーム。5 段で止まる
    expect(Math.max(...hacking.map((w) => w.stack ?? 1))).toBe(5);
    for (const w of hacking.filter((x) => (x.stack ?? 1) === 1)) expect(triggers).toContain(w.start - 1);
    // 最初の 5 回のきっかけで 1〜5 段になる
    triggers.slice(0, 5).forEach((f, k) => expect(stackAt(f + 1)).toBe(k + 1));
  });

  it('gives the S1 DEF down from the frame after each last bullet only while Collect Hacking Code is on', () => {
    const down = items({ kind: 'timed', skill: 'skill1', stat: 'enemyDefenseDown' });
    expect(down.length).toBeGreaterThan(0);
    const fired = lastShots.filter((f) => stackAt(f) > 0);
    for (const w of down) expect(fired).toContain(w.start - 1);
    // 基礎版の最初の最後の弾丸は、同じ発で付くハッキングコード収集を見ない（付くのは次のフレームから）
    if (!treasure) expect(down[0]!.start).toBeGreaterThan(lastShots[0]! + 1);
  });

  it('gives the treasure S2 ATK up (caster based, 5 stacks) to Electric Code allies only, on the last bullet', () => {
    for (const holder of input.slots.keys()) {
      const up = items({ holder, kind: 'timed', skill: 'skill2', stat: 'attack' });
      if (!treasure || input.slots[holder]?.character.element !== 'Electronic') {
        expect(up).toEqual([]);
        continue;
      }
      expect(Math.max(...up.map((w) => w.stack ?? 1))).toBe(5);
      for (const w of up.filter((x) => (x.stack ?? 1) === 1)) expect(lastShots).toContain(w.start - 1);
    }
  });

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  const additional = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'burst');
  const fullStack = bursts.filter((b) => stackAt(b.frame) === 5);
  it('deals the additional damage on the Burst hit only at full stacks', () => {
    expect(bursts.length).toBeGreaterThan(3);
    expect(fullStack.length).toBeGreaterThan(0);
    expect(additional.map((h) => h.frame)).toEqual(fullStack.flatMap(hitFramesOf));
  });

  it('gives the Burst DEF down on every Burst, and Damage Taken up (treasure) on full stacks', () => {
    const down = items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' });
    expect(down.length).toBe(bursts.length);
    const taken = items({ kind: 'timed', skill: 'burst', stat: 'damageTaken' });
    if (!treasure) expect(taken).toEqual([]);
    else {
      expect(taken.length).toBe(fullStack.length);
      for (const w of taken) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });

  const reload = items({ holder: s, kind: 'timed', skill: 'skill1', stat: 'reloadSpeed' });
  const fullBursts = plan.schedule?.fullBurstWindows ?? [];
  if (input.slots.length === 1) {
    it('never enters Full Burst alone, so the treasure S1 reload speed up never applies', () => {
      expect(fullBursts).toEqual([]);
      expect(reload).toEqual([]);
    });
  } else if (treasure) {
    it('gives the treasure S1 reload speed up for 10 s from each Full Burst start', () => {
      expect(fullBursts.length).toBeGreaterThan(3);
      expect(reload.length).toBe(fullBursts.length);
      reload.forEach((w, k) => {
        expect(w.start).toBe(fullBursts[k]!.start);
        expect(w.end - w.start).toBe(gameSecondsToFrames(10));
      });
    });
  } else {
    it('has no reload speed up in the base version', () => {
      expect(fullBursts.length).toBeGreaterThan(3);
      expect(reload).toEqual([]);
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
