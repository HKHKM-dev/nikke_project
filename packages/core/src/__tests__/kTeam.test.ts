// K（41。V-0848）を含む編成で、S1 の傾く天秤（最後の弾丸ごと・1 マガジンに 1 回）と当たったペレットのクリティカルの追加ダメージ、
// S2 の正義の実現（味方全体・最後の弾丸ごとに付き直す）、フルバーストの終わりの解除、バーストの使用武器変更が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { effectiveMaxAmmo } from '../frame/firing.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const K = 41;

describe('K の定義', () => {
  const def = parseSkillDefinition(rawDefinition(K));

  it('defines every line of S1, S2 and the Burst', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['state', 'stackChange', 'damage', 'removeState']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual(['state', 'removeState']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['weaponChange', 'timed', 'timed']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（K 単騎）': fixedTeam([K], 0),
  '撮影 B の編成（I-DOLL・フラワー + デルタ + K）': fixedTeam([304, 20, K], 2),
  '実戦寄り（リター + クラウン + K + アリス + ユニ）': fixedTeam([82, 330, K, 191, 160], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const k = input.slots.findIndex((s) => s?.character.resourceId === K);
  const sim = runSimulation(input);
  const shots = sim.shots[k]!;
  const lastShots = shots.lastShotFrames ?? [];
  const fullBursts = sim.schedule?.fullBurstWindows ?? [];
  /** フレーム f の K の区間のバフ */
  const buffsAt = (f: number) => sim.slots[k]!.segments.find((s) => s.start <= f && f < s.end)!.trigger.buffs;
  /** フレーム f の K のクリティカル確率▲（傾く天秤の中身）の和 */
  const critUpAt = (f: number): number => buffsAt(f).critRate;

  it('stacks Tilted Scale by 30 once per magazine (not per muzzle), up to 100 (C-1498)', () => {
    expect(lastShots.length).toBeGreaterThan(3);
    // 1 本目のマガジンの最後の弾丸の前は 0、次のマガジンは 30 スタック（0.75% × 30）
    const first = lastShots[0]!;
    expect(critUpAt(first - 1)).toBe(0);
    expect(critUpAt(first + 2)).toBeCloseTo(0.225, 6);
    // バーストを使わない単騎では、2 本目の後は 60 スタック
    if (fullBursts.length === 0) expect(critUpAt(lastShots[1]! + 2)).toBeCloseTo(0.45, 6);
    for (let f = 0; f < sim.frames; f += 300) expect(critUpAt(f)).toBeLessThanOrEqual(0.75 + 1e-9);
  });

  it('gives Fulfillment of Righteousness to every ally at each last bullet, cutting K to 59 rounds (C-1497)', () => {
    for (let holder = 0; holder < input.slots.length; holder++) {
      const items = itemsOf(sim.history, { holder, state: 'fulfillmentOfRighteousness' });
      expect(items.length).toBeGreaterThan(0);
      // 付き直しで 10 秒を数え直すので、件の始まりは K の最後の弾丸のフレームの次
      for (const it of items) expect(lastShots).toContain(it.start - 1);
    }
    // ほかの味方の最大装弾数▲（リターの S1 など）が無い撮影の編成では、120 発の 51.13%▼ の四捨五入で 59 発
    const onlyK = input.slots.every((s) => s === null || [K, 304, 20].includes(s.character.resourceId));
    const maxAmmo = effectiveMaxAmmo(input.slots[k]!.character.shot.maxAmmo, buffsAt(lastShots[0]! + 2));
    if (onlyK) expect(maxAmmo).toBe(59);
    else expect(maxAmmo).toBeLessThan(120);
  });

  if (fullBursts.length === 0) {
    it('never uses the Burst (a lone Burst III), so Tilted Scale stays at 100 stacks', () => {
      expect(sim.schedule?.activations.filter((a) => a.slotIndex === k) ?? []).toEqual([]);
      expect(critUpAt(sim.frames - 1)).toBeCloseTo(0.75, 6);
    });
    return;
  }

  it('removes Tilted Scale and Fulfillment of Righteousness from every ally at the end of Full Burst (C-1502)', () => {
    for (const w of fullBursts) {
      if (w.end + 1 >= sim.frames) continue;
      for (let holder = 0; holder < input.slots.length; holder++) {
        for (const state of ['tiltedScale', 'fulfillmentOfRighteousness'] as const) {
          const held = itemsOf(sim.history, { holder, state }).some((it) => it.start <= w.end && w.end + 1 < it.end);
          // 同じフレームに付き直した件のほかは、終わりの次のフレームまでに閉じる
          if (held) expect(lastShots).toContain(w.end);
        }
      }
    }
  });

  it('deals several S1 additional damages on one weapon change shot, counting 10 pellets (C-1501)', () => {
    const changed = new Set(shots.weaponChangeShotFrames ?? []);
    const perFrame = new Map<number, number>();
    for (const h of sim.skillHits) {
      if (h.slotIndex !== k || h.effect.source.skill !== 'skill1') continue;
      perFrame.set(h.frame, (perFrame.get(h.frame) ?? 0) + 1);
    }
    // 変更後の武器の発の当たったペレットのクリティカルは、10 ペレット × 命中 × 会心率（二丁持ちの 2 を掛けない）
    shots.frames.forEach((f, i) => {
      if (!changed.has(f)) return;
      expect(shots.critPellets![i]).toBeCloseTo((shots.critHits![i]! / 2) * 10, 6);
    });
    expect(Math.max(...[...perFrame].filter(([f]) => changed.has(f)).map(([, n]) => n))).toBeGreaterThan(1);
    // 基礎の武器の発は 1 発に 1 回まで（2 ヒット × 会心率 は 4 より小さい）
    for (const [f, n] of perFrame) if (!changed.has(f)) expect(n).toBe(1);
  });
});

describeEveryShotInOneGroup(TEAMS);
