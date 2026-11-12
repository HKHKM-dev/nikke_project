// グレイブ編（plan/design-grave.md。V-0735）: グレイブ（514）を含む編成で、完全計算（バーストの 10 秒）の間に過熱II・III が命中の数で付き、
// 完全計算の終わりに残弾が 0 になって放熱（リロード比率▼）の込めに入り、込め終わりで放熱と過熱I が外れるか
import { describe, expect, it } from 'vitest';
import { computeFixedSpecDefence } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const slot = (id: number): TeamSlotInput => ({
  ...fixedSlot(id),
  defenceOverride: computeFixedSpecDefence(characterOf(id)),
  condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
});

const GRAVE = 514;
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(slot),
  enemy: SHOOTING_RANGE_ENEMY,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'プロダクト08 + グレイブ + アリス（V-0735 の編成）': team([302, GRAVE, 191], 2),
  '実戦寄り（リター + グレイブ + アリス + 紅蓮：神殺 + クラウン）': team([82, GRAVE, 191, 472, 330], 2),
};

/** グレイブの武器（60 発・1 段 1 秒・1 段 30 発）は、放熱のリロード比率 50%▼ で 1 段 15 発・4 段 */
const HEAT_CHUNKS = 4;

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const grave = input.slots.findIndex((s) => s?.character.resourceId === GRAVE);
  const plan = planTeamRun(input);
  const windows = (state: string) =>
    itemsOf(plan.history, { holder: grave, state: state as never }).map(({ start, end }) => ({ start, end }));
  const prediction = windows('prediction');
  const heat = windows('heatEmission');
  const shots = plan.shots[grave]!.frames;
  const shotsIn = (from: number, to: number) => shots.filter((f) => from <= f && f < to);

  it('applies Prediction for 10 seconds on each burst use', () => {
    expect(prediction.length).toBeGreaterThan(1);
    // 戦闘の終わりで切れた窓は比べない
    for (const w of prediction.filter((p) => p.end < plan.frames))
      expect(w.end - w.start).toBe(prediction[0]!.end - prediction[0]!.start);
  });

  it('empties the ammo and applies Heat Emission when Prediction ends, until the reload completes', () => {
    const drains = plan.instants.filter((i) => i.slotIndex === grave && i.effect.kind === 'ammoDecrease');
    for (const w of prediction.filter((p) => p.end < plan.frames)) {
      expect(drains.some((d) => d.frame === w.end && d.amount < 0)).toBe(true);
      expect(heat.some((h) => h.start === w.end)).toBe(true);
    }
    // 込めの間は撃たず（終わりのフレームの発は、残弾数減少の前に撃った発）、込め終わり（放熱の終わり）の後に撃ち直す
    for (const h of heat.filter((x) => x.end < plan.frames)) {
      expect(shotsIn(h.start + 1, h.end)).toEqual([]);
      expect(shots.some((f) => f >= h.end)).toBe(true);
    }
  });

  // 実戦寄りの編成はリロード速度▲（クラウンのバースト）が重なるので、V-0735 の編成だけで見る
  it.runIf(name.includes('V-0735'))(
    'reloads 15 rounds per chunk in Heat Emission, taking two more chunks than a normal reload',
    () => {
      const reloads = (plan.shots[grave]!.reloadEnds ?? []).map((end) => {
        const last = shots.filter((f) => f < end).at(-1)!;
        return end - last;
      });
      const heatReload = heat.find((h) => h.end < plan.frames)!;
      const normal = Math.min(...reloads);
      const lastBefore = shots.filter((f) => f < heatReload.start).at(-1)!;
      // 込めない 1 段 + 2 段が 4 段に（段は 1 秒）
      expect(heatReload.end - lastBefore - normal).toBeGreaterThan((HEAT_CHUNKS - 2) * 58);
    },
  );

  it('applies Overheat II after 30 hits and Overheat III after 60 more hits in Prediction, until Prediction ends', () => {
    const o2 = windows('overheatII');
    const o3 = windows('overheatIII');
    for (const w of o2) {
      const p = prediction.find((x) => x.start <= w.start && w.start < x.end)!;
      expect(w.end).toBe(p.end);
      // 過熱I の付いた発から数える（弾丸命中率 1 の的。数えた 30 発目の次のフレームから付く）
      expect(shotsIn(p.start, w.start).length).toBeGreaterThanOrEqual(30);
    }
    for (const w of o3) {
      const two = o2.find((x) => x.start <= w.start && w.start < x.end)!;
      expect(w.end).toBe(two.end);
      expect(shotsIn(two.start - 1, w.start)).toHaveLength(60);
    }
    expect(o3.length).toBeGreaterThan(0);
  });

  it('removes Overheat I when a reload to max ammo completes', () => {
    const ends = new Set(plan.shots[grave]!.reloadEnds ?? []);
    for (const w of windows('overheatI').filter((x) => x.end < plan.frames)) expect(ends.has(w.end)).toBe(true);
  });
});

describeEveryShotInOneGroup(TEAMS);
