// K の編（plan/design-k.md 2.2・2.4 節）: 当たったペレットのクリティカルの回数 critPelletHit（1 発で何回も発火する）と、二丁持ちでも
// マガジンに 1 回の最後の弾丸 lastShotOnce の読み込みと数え方、的の表の変更後の武器の行を 1 パス目の数えにも使うこと（2.5 節）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from '../../__tests__/teamHelpers.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { createFireCounter, shotCountWeight, type FrameEvents, type ShotEvent } from '../triggers.ts';

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-21',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
const damage = (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: 'damage',
  trigger,
  damageType: 'additional',
  ref: 1,
  ...extra,
});
const ev = (frame: number, shot: ShotEvent | null): FrameEvents => ({
  frame,
  shots: [shot],
  activations: [],
  burstEffects: [],
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [false],
});
const shot = (extra: Partial<ShotEvent>): ShotEvent => ({
  lastShot: false,
  fullCharge: false,
  hits: 2,
  coreHits: 0,
  ...extra,
});

describe('critPelletHit の読み込み', () => {
  it('reads it in damage with every or everyRef', () => {
    expect(parse([damage({ count: 'critPelletHit', every: 4 })]).skills.skill1.effects[0]).toMatchObject({
      trigger: { count: 'critPelletHit', every: 4 },
    });
  });

  it('rejects it outside damage, without every, with a window or a chance, and with gauge hits', () => {
    const timed = { kind: 'timed', target: 'self', stat: 'attack', ref: 1, durationSeconds: 1 };
    expect(() => parse([{ ...timed, trigger: { count: 'critPelletHit', every: 4 } }])).toThrow(
      /only allowed in damage/,
    );
    expect(() => parse([damage({ count: 'critPelletHit' })])).toThrow(/needs every or everyRef/);
    expect(() => parse([damage({ count: 'critPelletHit', every: 4, firesDuring: 'fullBurst' })])).toThrow(
      /firesDuring cannot be used with critPelletHit/,
    );
    expect(() => parse([damage({ count: 'critPelletHit', every: 4, chance: 50 })])).toThrow(/chance cannot be used/);
    expect(() => parse([damage({ count: 'critPelletHit', every: 4 }, { gaugeHits: [0] })])).toThrow(
      /gaugeHits cannot be used with a critPelletHit count/,
    );
  });
});

describe('critPelletHit の数え方', () => {
  it('fires as many times as the multiples of N the count crosses on one shot', () => {
    const count = createFireCounter({ count: 'critPelletHit', every: 4 }, 0, null);
    // 6 → 4 を 1 回、12 → 8・12 を 2 回、13 → またがない、20 → 16・20 を 2 回
    const fires = [6, 6, 1, 7].map((w, f) => count(ev(f, shot({ critPellets: w }))));
    expect(fires).toEqual([1, 2, 0, 2]);
    expect(count(ev(4, null))).toBe(0);
  });

  it('weighs a shot by its critical pellets', () => {
    expect(shotCountWeight('critPelletHit', shot({ critHits: 1.2, critPellets: 6 }))).toBe(6);
    expect(shotCountWeight('critPelletHit', shot({}))).toBe(0);
  });
});

describe('lastShotOnce', () => {
  it('counts only the last shot of a magazine, not each muzzle of a dual-wield weapon', () => {
    const muzzle = shot({ lastShot: false, lastBullet: true });
    const last = shot({ lastShot: true, lastBullet: true });
    expect([shotCountWeight('lastShot', muzzle), shotCountWeight('lastShot', last)]).toEqual([1, 1]);
    expect([shotCountWeight('lastShotOnce', muzzle), shotCountWeight('lastShotOnce', last)]).toEqual([0, 1]);
  });

  it('rejects it with a firing window, like lastShot', () => {
    const timed = { kind: 'timed', target: 'self', stat: 'attack', ref: 1, durationSeconds: 1 };
    expect(() => parse([{ ...timed, trigger: { count: 'lastShotOnce', firesDuring: 'fullBurst' } }])).toThrow(
      /cannot be used with lastShotOnce/,
    );
  });
});

// 的の表の変更後の武器の行（41:burst）を、1 パス目の発の命中・コアの命中の期待値も引く（plan/design-k.md 2.5 節）
describe('変更後の武器の発の命中の期待値（1 パス目）', () => {
  const auto = { conditionMode: 'auto' } as const;
  const team = (enemy: EnemyInput) =>
    fixedTeam([fixedSlot(304, auto), fixedSlot(20, auto), fixedSlot(41, auto)], 2, { enemy });
  const withRow = rangeEnemyWithEvents();
  const target = withRow.target!;
  const dropRow = <T extends { weaponChanges?: Readonly<Record<string, unknown>> }>(table: T): T => {
    const { '41:burst': _, ...rest } = table.weaponChanges ?? {};
    return { ...table, weaponChanges: rest };
  };
  const withoutRow = rangeEnemyWithEvents({
    target: { ...target, coreHitRate: dropRow(target.coreHitRate), bulletHitRate: dropRow(target.bulletHitRate) },
  });
  const on = planTeamRun(team(withRow));
  const off = planTeamRun(team(withoutRow));
  const k = on.shots[2]!;
  const kOff = off.shots[2]!;
  const changed = new Set(k.weaponChangeShotFrames);

  it('takes the hits and core hits of the changed weapon from the row, and leaves the base weapon as it was', () => {
    expect(k.frames).toEqual(kOff.frames);
    expect(changed.size).toBeGreaterThan(0);
    const changedAt = k.frames.flatMap((f, i) => (changed.has(f) ? [i] : []));
    const baseAt = k.frames.flatMap((f, i) => (changed.has(f) ? [] : [i]));
    // 中近の 1 回目のフルバースト: 行の 0.75・0.01（二丁持ちで 2 ヒット）
    const first = changedAt[0]!;
    expect(k.hits![first]).toBeCloseTo(0.75 * 2, 12);
    expect(k.coreHits![first]).toBeCloseTo(0.75 * 0.01 * 2, 12);
    expect(kOff.hits![first]).toBeGreaterThan(k.hits![first]!);
    // 当たったペレットのクリティカルは shotCount（10）× 弾丸命中率 × 会心率
    expect(k.critPellets![first] / kOff.critPellets![first]!).toBeCloseTo(k.hits![first]! / kOff.hits![first]!, 12);
    for (const i of baseAt) expect(k.hits![i]).toBe(kOff.hits![i]);
  });
});
