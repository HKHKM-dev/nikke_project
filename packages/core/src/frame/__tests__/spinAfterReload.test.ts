// MG のリロード明けのレート（frame/shooter.ts の restartSpin。C-1546。V-0864）: 最終弾から構えの前までの間、レートは
// (endRateOfFire − rateOfFire) ÷ rateOfFireResetTime 毎秒で最終弾の後のレートから下がり、次のマガジンはそこから上がる。
// 実測（録画 1381・1387・1388 のクラウンとマスト：ロマンチックメイド）は、止まり 31f で 11f、40f 前後で 14f、62f 前後で 35f、
// 84f 以上で最初からの立ち上がり（82f）（1381-17・1387-15・1387-16・1388-10・1388-11）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
import { firingParams, ZERO_FIRING_BUFFS } from '../firing.ts';
import { initialShooter, refillAmmo, stepShooter } from '../shooter.ts';

const model = DEFAULT_WEAPON_MODEL;
// クラウンと同じ CDN の値（毎分 60 → 4,200 発・1 発ごとに +100・リセット 1 秒・リロード 2.5 秒）。マガジンは短くして最高レートに届かせる
const shot = makeCharacter(
  {
    maxAmmo: 60,
    rateOfFire: 60,
    endRateOfFire: 4200,
    rateOfFireChangePerShot: 100,
    rateOfFireResetTime: 1,
    reloadTime: 2.5,
  },
  { weaponType: 'MG' },
).shot;
const MAGAZINE = 60;

/** リロード速度▲ reloadSpeed で 2 マガジン目の 1 発目まで撃ち、最終弾 → 1 発目のフレームと、1 発目から 11 発目までのフレームを返す */
function restart(reloadSpeed: number) {
  const params = firingParams(shot, { ...ZERO_FIRING_BUFFS, reloadSpeed });
  const state = initialShooter(shot, model, params);
  const frames: number[] = [];
  for (let f = 0; frames.length < MAGAZINE + 11; f++) if (stepShooter(state, shot, model, params)) frames.push(f);
  return { pause: frames[MAGAZINE]! - frames[MAGAZINE - 1]!, span: frames[MAGAZINE + 10]! - frames[MAGAZINE]! };
}

/** 戦闘開始からの立ち上がりの、1 発目から 11 発目までのフレーム */
function freshSpan(): number {
  const params = firingParams(shot);
  const state = initialShooter(shot, model, params);
  const frames: number[] = [];
  for (let f = 0; frames.length < 11; f++) if (stepShooter(state, shot, model, params)) frames.push(f);
  return frames[10]! - frames[0]!;
}

describe('MG のリロード明けのレート', () => {
  it.each([
    // [リロード速度▲, 止まりの範囲, 実測の 11 発目までの長さ, 許す差]。62f 前後の段は立ち上がりの 5〜6 発目に当たり、レートが 0.5 発分
    // ずれると 2f 動く（止まりの読みの 1f ぶん）
    [0.95, [30, 33], 11, 1],
    [0.9, [38, 43], 14, 1],
    [0.74, [60, 65], 35, 2],
  ] as const)('リロード速度▲ %s: 止まりが短いほどレートが残る', (reloadSpeed, [low, high], measured, tolerance) => {
    const { pause, span } = restart(reloadSpeed);
    expect(pause).toBeGreaterThanOrEqual(low);
    expect(pause).toBeLessThanOrEqual(high);
    expect(Math.abs(span - measured)).toBeLessThanOrEqual(tolerance);
  });

  it('止まりが 84f 以上なら最初からの立ち上がりと同じ', () => {
    for (const reloadSpeed of [0.6, 0.45, 0]) {
      const { pause, span } = restart(reloadSpeed);
      expect(pause).toBeGreaterThanOrEqual(83);
      expect(span).toBe(freshSpan());
    }
  });

  it('弾丸チャージで満タンになった回は最初から（確かめていないので戻す）', () => {
    const params = firingParams(shot, { ...ZERO_FIRING_BUFFS, reloadSpeed: 0.95 });
    const state = initialShooter(shot, model, params);
    const frames: number[] = [];
    let refilled = false;
    for (let f = 0; frames.length < MAGAZINE + 11; f++) {
      if (!refilled && state.phase === 'reloading') {
        refillAmmo(state, MAGAZINE, shot, model, params);
        refilled = true;
      }
      if (stepShooter(state, shot, model, params)) frames.push(f);
    }
    expect(frames[MAGAZINE + 10]! - frames[MAGAZINE]!).toBe(freshSpan());
  });
});
