// MG の立ち上がりの進み（frame/shooter.ts の ShooterState.spunShots・spunBeforeLastShot と、cadence.ts の rateAfterShots・reloadStartOffset）を、
// マガジンの途中で立ち上げ速度が替わる境目で見る。射手は発ごとにその発の立ち上げ速度 (1 + Σ)（FiringParams.spinUpScale）を積み、次の発までの
// レートはその進みで決まる（C-1269。plan/design-asuka-wille.md 決めたこと）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { ACC_EPSILON, fullReloadFrames, rateAfterShots, reloadStartOffset, simulateShotFrames } from '../../cadence.ts';
import { computeFixedSpecAttack, computeFixedSpecHp } from '../../fixedSpec.ts';
import { changedWeaponShot, MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import { parseSkillDefinition } from '../../skills/parse/definition.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { DEFAULT_WEAPON_MODEL, hasSpinUp, MAX_RPM } from '../../weapons.ts';
import { firingParams, ZERO_FIRING_BUFFS, type FiringParams } from '../firing.ts';
import { initialShooter, spunBeforeLastShot, stepShooter, weaponChangeShooter, type ShooterState } from '../shooter.ts';
import { fixedEnemy } from '../../__tests__/teamHelpers.ts';

const model = DEFAULT_WEAPON_MODEL;
// マガジンの終わりでも最高レート（1 フレーム 1 発）に届かない MG（全弾リロードの始まりのずれが 0 にならない）
const shot = makeCharacter(
  { maxAmmo: 12, rateOfFire: 600, endRateOfFire: 3000, rateOfFireChangePerShot: 100 },
  { weaponType: 'MG' },
).shot;
const at = (spinUpSpeed: number): FiringParams => firingParams(shot, { ...ZERO_FIRING_BUFFS, spinUpSpeed });
const FAST = at(0.5);
const BASE = at(0);

type Shot = { frame: number; scale: number; spunAfter: number };

/** 1 マガジンを撃ち切るまでに見るフレームの上限（超えたら撃ち切らない形として落とす） */
const MAX_FRAMES = 10_000;

/** 戦闘開始から 1 マガジンを撃ち切る。paramsOf(f) はフレーム f の実効値。after は最終弾の後に進めるフレーム数 */
function fireMagazine(paramsOf: (f: number) => FiringParams, after = 0) {
  const state = initialShooter(shot, model, paramsOf(0));
  const shots: Shot[] = [];
  let lastShot: { frame: number; wait: number; acc: number; spunShots: number } | null = null;
  let f = 0;
  for (; lastShot === null; f++) {
    if (f > MAX_FRAMES) throw new Error(`no last shot within ${MAX_FRAMES} frames`);
    const params = paramsOf(f);
    if (!stepShooter(state, shot, model, params)) continue;
    shots.push({ frame: f, scale: params.spinUpScale, spunAfter: state.spunShots });
    if (state.lastShot) lastShot = { frame: f, wait: state.wait, acc: state.acc, spunShots: state.spunShots };
  }
  let next: number | null = null;
  for (const end = f + after; f < end && next === null; f++) if (stepShooter(state, shot, model, paramsOf(f))) next = f;
  return { state, shots, last: lastShot, next };
}

/**
 * 発ごとの進みの定義どおりの射撃の列（1 発目 = 0）: 前の発の翌フレームから rateAfterShots(進み) ÷ MAX_RPM を積み、1 発分たまったフレームで
 * 撃ち、その発のフレームの立ち上げ速度を進みに足す
 */
function framesBySpun(scaleAt: (t: number) => number): number[] {
  const frames = [0];
  let spun = scaleAt(0);
  let acc = 0;
  for (let t = 1; frames.length < shot.maxAmmo; t++) {
    acc += rateAfterShots(shot, spun) / MAX_RPM;
    if (acc < 1 - ACC_EPSILON) continue;
    acc -= 1;
    frames.push(t);
    spun += scaleAt(t);
  }
  return frames;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('立ち上げ速度がマガジンの途中で替わる', () => {
  it('uses a spin-up MG whose magazine ends below the top rate', () => {
    expect(hasSpinUp(shot)).toBe(true);
    expect([FAST.spinUpScale, BASE.spinUpScale]).toEqual([1.5, 1]);
    expect(rateAfterShots(shot, (shot.maxAmmo - 1) * FAST.spinUpScale)).toBeLessThan(MAX_RPM);
  });

  it.each([
    ['1.5 → 1', FAST, BASE],
    ['1 → 1.5', BASE, FAST],
  ])('stacks the scale of each shot and keeps the progress across the switch (%s)', (_, before, after) => {
    // 6 発目の後に替える（替える前の立ち上げ速度の列の 6 発目の翌フレームから）
    const first = fireMagazine(() => before).shots;
    const switchAt = first[5]!.frame + 1;
    const paramsOf = (f: number) => (f < switchAt ? before : after);
    const { shots } = fireMagazine(paramsOf);
    // 進みは発ごとのその発の立ち上げ速度の和（替わった後も、前の発の分を持ち越す）
    shots.forEach((s, n) => expect(s.spunAfter).toBeCloseTo(sum(shots.slice(0, n + 1).map((x) => x.scale)), 12));
    expect(shots.slice(0, 6).every((s) => s.scale === before.spinUpScale)).toBe(true);
    expect(shots.slice(6).every((s) => s.scale === after.spinUpScale)).toBe(true);
    // 発の列は、発ごとの進みでレートを決めた列と同じ。替わる前は、替える前の立ち上げ速度が一定の列と同じ
    const origin = shots[0]!.frame;
    const relative = shots.map((s) => s.frame - origin);
    expect(relative).toEqual(framesBySpun((t) => (t + origin < switchAt ? before : after).spinUpScale));
    expect(relative.slice(0, 7)).toEqual(simulateShotFrames(shot, model, before).slice(0, 7));
    // 替わった後の列は、どちらの立ち上げ速度が一定の列とも違う
    expect(relative).not.toEqual(simulateShotFrames(shot, model, before));
    expect(relative).not.toEqual(simulateShotFrames(shot, model, after));
    // 7 発目の後のレートは、6 発ぶんの替える前の進み + 1 発ぶんの替えた後の進みから
    const spun7 = 6 * before.spinUpScale + after.spinUpScale;
    expect(shots[6]!.spunAfter).toBeCloseTo(spun7, 12);
    expect(rateAfterShots(shot, spun7)).not.toBeCloseTo(rateAfterShots(shot, 7 * after.spinUpScale), 6);
  });
});

describe('全弾リロードの始まりのずれ', () => {
  /** 最終弾のフレームの params での、最終弾の後のリロードの 1 回分の待ち（shooter.ts の fire と同じ式） */
  const expectedWait = (params: FiringParams, acc: number, spunBeforeLast: number) =>
    fullReloadFrames(shot, model, params, reloadStartOffset(shot, model, params, acc, spunBeforeLast)) - 1;

  it('takes the progress before the last shot from the scales of the earlier shots', () => {
    const first = fireMagazine(() => FAST).shots;
    const switchAt = first[5]!.frame + 1;
    const { shots, last } = fireMagazine((f) => (f < switchAt ? FAST : BASE));
    const before = sum(shots.slice(0, -1).map((s) => s.scale));
    expect(before).toBeCloseTo(6 * 1.5 + 5, 12);
    const offset = reloadStartOffset(shot, model, BASE, last!.acc, before);
    expect(offset).toBeLessThan(0);
    // 最終弾の前までの進みを 11 発 × 1 とすると、違うずれになる
    expect(offset).not.toBeCloseTo(reloadStartOffset(shot, model, BASE, last!.acc, 11 * BASE.spinUpScale), 6);
    expect(last!.wait).toBe(expectedWait(BASE, last!.acc, before));
  });

  it('subtracts the scale of the last shot when the scale switches on the last shot frame', () => {
    // 1.5 倍の列の最終弾のフレームから 1 倍。最終弾は 1 倍の分を積み、その前までの進みは 11 発 × 1.5
    const lastFast = fireMagazine(() => FAST).last!.frame;
    const { shots, last, state } = fireMagazine((f) => (f < lastFast ? FAST : BASE));
    expect(last!.frame).toBe(lastFast);
    expect(shots.at(-1)!.scale).toBe(1);
    expect(spunBeforeLastShot(state, BASE)).toBeCloseTo(11 * 1.5, 12);
    expect(last!.wait).toBe(expectedWait(BASE, last!.acc, 11 * 1.5));
  });

  it('decides the reload start at the last shot frame, so a switch right after the last shot does not move it', () => {
    // spunBeforeLastShot は呼んだ時の params の spinUpScale を引く。呼び手（shooter.ts の fire と、firstPass/shooters.ts の使用武器変更の
    // 終わり）は最終弾のフレームの params で呼ぶので、最終弾の後に立ち上げ速度が替わっても、リロードの始まりのずれとリロードの長さは
    // 変わらない。替わった後の params で呼ぶと、最終弾の前までの進みに、最終弾の分と替わった後の立ち上げ速度の差（ここでは 1.5 − 1）が
    // 残る値になる（下の 2 つ目の値。いまの呼び手はこの値を使わない）
    const lastFast = fireMagazine(() => FAST).last!.frame;
    const steady = fireMagazine(() => FAST, 200);
    const switched = fireMagazine((f) => (f <= lastFast ? FAST : BASE), 200);
    expect(switched.last).toEqual(steady.last);
    expect(switched.next).not.toBeNull();
    expect(switched.next).toBe(steady.next);
    const state = { spunShots: steady.last!.spunShots } as ShooterState;
    expect(spunBeforeLastShot(state, FAST)).toBeCloseTo(11 * 1.5, 12);
    expect(spunBeforeLastShot(state, BASE)).toBeCloseTo(11 * 1.5 + 0.5, 12);
  });
});

describe('使用武器変更の終わりのずれ', () => {
  // 変更後の武器はスピンアップを持たない（changedWeaponShot が rateOfFire と endRateOfFire をそろえ、上がり幅を 0 にする）ので、
  // 立ち上げ速度▲が付いていても spinUpScale は 1 で、進みは撃った数のまま
  const changed = changedWeaponShot(shot, 1, 1500, 1, { maxAmmo: 10 });
  const weapon = { id: 'test.skill1.0', hits: 1, shot: changed };
  const paramsWith = (spinUpSpeed: number) => firingParams(shot, { ...ZERO_FIRING_BUFFS, spinUpSpeed, weapon });

  /** 変更後の武器を撃ち切り、最終弾のフレームで firstPass/shooters.ts と同じ式で終わりのずれを出す */
  function endOffset(paramsOf: (f: number) => FiringParams) {
    const state = weaponChangeShooter(changed, model, paramsOf(0));
    const frames: number[] = [];
    for (let f = 0; ; f++) {
      const params = paramsOf(f);
      if (!stepShooter(state, changed, model, params)) continue;
      frames.push(f);
      if (!state.lastShot) continue;
      return {
        frames,
        state,
        offset: reloadStartOffset(changed, model, params, state.acc, spunBeforeLastShot(state, params)),
      };
    }
  }

  it('counts the shots as the progress and ignores spin-up speed', () => {
    expect(hasSpinUp(changed)).toBe(false);
    expect(paramsWith(0.5).spinUpScale).toBe(1);
    const plain = endOffset(() => paramsWith(0));
    const switched = endOffset((f) => paramsWith(f < 10 ? 0.5 : 0));
    expect(switched.frames).toEqual(plain.frames);
    expect(switched.state.spunShots).toBe(switched.state.shotsInMagazine);
    expect(switched.offset).toBe(plain.offset);
    expect(plain.offset).toBe(
      reloadStartOffset(changed, model, paramsWith(0), plain.state.acc, plain.state.shotsInMagazine - 1),
    );
    expect(plain.offset).toBeLessThan(0);
  });

  describe('1 パス目（ラプラス：アルティメットヒーロー）', () => {
    // V-0695: 変更の終わりの残弾数減少は、変更後の武器の最終弾の本当の発の時刻（終わりのずれ。firstPass/shooters.ts の
    // weaponChangeEndOffset）からリロードを始める
    const LAPLACE = 103;
    const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
    const c = read<CharacterData>(`../../../data/characters/${LAPLACE}.json`);
    type Raw = { skills: { skill1: { effects: Record<string, unknown>[] } } };
    const raw = read<Raw>(`../../../data/skills/${LAPLACE}.json`);
    const change = raw.skills.skill1.effects.findIndex((e) => e.kind === 'weaponChange');
    /** 変更後の武器のレートを rateOfFire にし、spinUp なら立ち上げ速度▲を戦闘の始めから終わりまで付けた定義 */
    const definitionOf = (rateOfFire: number, spinUp: boolean) => {
      const copy = structuredClone(raw);
      copy.skills.skill1.effects[change] = { ...copy.skills.skill1.effects[change], rateOfFire };
      if (spinUp)
        copy.skills.skill1.effects.push({
          kind: 'timed',
          trigger: 'battleStart',
          target: 'self',
          stat: 'spinUpSpeed',
          ref: 2,
          durationUntil: 'battleEnd',
        });
      return copy;
    };
    const fixed = computeFixedSpecAttack(c);
    const inputOf = (definition: unknown): TeamInput => ({
      slots: [
        {
          character: c,
          growth: fixed.growth,
          attackOverride: fixed.attack,
          hpOverride: computeFixedSpecHp(c),
          condition: { coreHitRate: 1, distanceBonus: false },
          skills: { definition: parseSkillDefinition(definition), levels: MAX_SKILL_LEVELS },
        },
      ],
      enemy: fixedEnemy({ element: 'Fire' }),
      durationSeconds: 180,
      burst: false,
      controlledSlot: 0,
    });
    const logs = new Map<string, ReturnType<typeof runSimulation>['shots'][number]>();
    const logOf = (rateOfFire: number, spinUp = false) => {
      const key = `${rateOfFire}:${spinUp}`;
      if (!logs.has(key)) logs.set(key, runSimulation(inputOf(definitionOf(rateOfFire, spinUp))).shots[0]!);
      return logs.get(key)!;
    };
    /** 最初の変更の最終弾から、次の基礎の武器の発までのフレーム */
    const gapAfterChange = (log: ReturnType<typeof logOf>) => {
      const changed = new Set(log.weaponChangeShotFrames);
      const last = log.frames.find((f, k) => changed.has(f) && !changed.has(log.frames[k + 1]!))!;
      return log.frames.find((f) => f > last && !changed.has(f))! - last;
    };

    it('starts the reload at the true time of the last changed shot', () => {
      // 1440rpm の 120 発目の本当の発の時刻はフレームの 0.33f 前、1660rpm は 0.988f 前。リロードの込め終わりを切り上げると、1660rpm だけ
      // 1f 早く込め終わる（ずれを入れないと、どちらも同じ長さ）
      expect(gapAfterChange(logOf(1440))).toBe(230);
      expect(gapAfterChange(logOf(1660))).toBe(229);
    });

    it.each([1440, 1660])('gives the same shots with a spin-up speed buff (%i rpm)', (rateOfFire) => {
      const plain = logOf(rateOfFire);
      const buffed = logOf(rateOfFire, true);
      expect(plain.weaponChangeEnds!.length).toBeGreaterThan(0);
      expect(buffed.weaponChangeEnds).toEqual(plain.weaponChangeEnds);
      expect(buffed.frames).toEqual(plain.frames);
    });
  });
});
