// 畳み込んだフルチャージの発ごとの項（plan/design-full-charge-fold.md）: きっかけが fullChargeShot の射撃ごとの倍率ダメージと
// 固定ダメージは、フルチャージでない発（部分チャージの発・チャージしない武器の発）に乗らず、ほかのきっかけの項は乗る
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage, partialChargeTriggerDamage, type EnemyInput } from '../damage.ts';
import type { ResolvedSkillDamage } from '../skills/burstDamage.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TargetProfile } from '../types.ts';
import { isChargeWeapon } from '../weapons.ts';
import {
  characterOf,
  fixedEnemy,
  fixedSlot,
  fixedTeam,
  RANGE_BIGARMS,
  rawDefinition,
  shootingRangeEnemy,
} from './teamHelpers.ts';

const A2 = 811;
const RAPUNZEL_SANCTUARY = 473;
const NAYUTA = 223;
const LITER = 82;
const ALICE = 191;
const CROWN = 330;
const enemyWith = (target: TargetProfile): EnemyInput => shootingRangeEnemy({ defence: 100, target });
const rangeEnemy = enemyWith(RANGE_BIGARMS);
// RL の飛ぶ時間を 400f 延ばした的（部分チャージの発が、撃った区間と別の区間に着く）
const slowProfile = structuredClone(RANGE_BIGARMS);
for (const row of Object.values(slowProfile.flightFrames!.shots!.RL!.byProjectile!))
  for (const key of Object.keys(row)) row[key]! += 400;
const slowEnemy = enemyWith(slowProfile);

const source = { resourceId: 1, skill: 'skill1', name: { ja: '-', en: '-' } } as const;
const fullChargeHit: ResolvedSkillDamage = { source, damageType: 'additional', multiplier: 1.5, fullChargeOnly: true };
const everyHit: ResolvedSkillDamage = { source, damageType: 'additional', multiplier: 0.25 };

describe('1 トリガーの値（plan/design-full-charge-fold.md 3.2 節）', () => {
  const input = {
    growth: { level: 400, grade: 0, core: 0 },
    attackOverride: 100000,
    enemy: fixedEnemy({ defence: 100 }),
    buffs: { ...ZERO_BUFFS, attackDamage: 0.3 },
    perShot: [fullChargeHit, everyHit],
    fixedShare: 0.5,
  };
  const condition = { coreHitRate: 0.5, distanceBonus: false, hitRate: 1 };
  const rl = computeTriggerDamage({ ...input, character: characterOf(A2), condition });

  it('gives a full charge shot every folded term', () => {
    expect(rl.perShotFullCharge).toBeGreaterThan(0);
    expect(rl.perShotFullCharge / rl.perShot).toBeCloseTo(1.5 / 1.75, 12);
    expect(rl.fixedShare).toBeCloseTo(rl.normal * 0.5, 6);
    expect(rl.perTrigger).toBeCloseTo(rl.normal + rl.perShot + rl.fixedShare, 6);
  });

  const onlyEveryHit = (t: typeof rl) => {
    expect(t.perShotFullCharge).toBe(0);
    expect(t.fixedShare).toBe(0);
    expect(t.perShot).toBeCloseTo(rl.perShot - rl.perShotFullCharge, 6);
    expect(t.perTrigger).toBeCloseTo(t.normal + t.perShot, 6);
  };

  it('drops the full charge terms from a partially charged shot', () => {
    const partial = partialChargeTriggerDamage(rl, 0.4);
    onlyEveryHit(partial);
    expect(partial.normal).toBeLessThan(rl.normal);
    // 満ちて撃った発（進み 1）はフルチャージの発のまま
    expect(partialChargeTriggerDamage(rl, 1)).toBe(rl);
  });

  it('drops them from a shot of a weapon that does not charge', () => {
    onlyEveryHit(computeTriggerDamage({ ...input, character: characterOf(NAYUTA), condition }));
    // チャージ武器の基礎の武器を、チャージしない武器に替えた区間（即着弾の使用武器の変更）
    const instant = { id: 'x', hits: 1, shot: { ...characterOf(A2).shot, chargeTime: 0 } };
    onlyEveryHit(
      computeTriggerDamage({
        ...input,
        buffs: { ...input.buffs, weapon: instant },
        character: characterOf(A2),
        condition,
      }),
    );
  });
});

describe.each([
  ['A2 単騎（飛ぶ時間なし）', [A2], rangeEnemy],
  ['ラプンツェル：サンクチュアリ単騎（射撃ごとの倍率ダメージを着弾で出す）', [RAPUNZEL_SANCTUARY], rangeEnemy],
  // 部分チャージの発が、バフの違う区間に着く（区間の合計の、着いた部分チャージの発の数の項）
  [
    'リター・クラウン・ラプンツェル：サンクチュアリ（飛ぶ時間を延ばした的）',
    [LITER, CROWN, RAPUNZEL_SANCTUARY],
    slowEnemy,
  ],
])('部分チャージの発: %s', (_name, ids, enemy) => {
  const index = ids.length - 1;
  const id = ids[index]!;
  const result = runSimulation({
    ...fixedTeam(ids, index),
    slots: ids.map((x) => fixedSlot(x, { conditionMode: 'auto' })),
    enemy,
    trace: true,
  });
  const slot = result.slots[index]!;
  const partial = result.shots[index]!.partialShots ?? [];
  const segmentAt = (f: number) => slot.segments.find((s) => s.start <= f && f < s.end)!;
  const shotEvents = new Map(
    result.events.flatMap((e) => (e.kind === 'trigger' && e.slot === index ? [[e.frame, e.damage] as const] : [])),
  );

  it('gives a partially charged shot no "on full charge hit" damage', () => {
    expect(partial.length).toBeGreaterThan(0);
    for (const { frame, progress } of partial) {
      const t = segmentAt(frame).trigger;
      // 畳み込む項はフルチャージの発ごとの追加ダメージだけ
      expect(t.perShotFullCharge).toBeGreaterThan(0);
      expect(t.perShotFullCharge).toBe(t.perShot);
      expect(shotEvents.get(frame)).toBeCloseTo(partialChargeTriggerDamage(t, progress).normal, 6);
      expect(shotEvents.get(frame)!).toBeLessThan(t.normal);
    }
  });

  it('sums the segments to the damage of every shot', () => {
    // ラプンツェル：サンクチュアリは、射撃ごとの倍率ダメージを着弾の区間で出し直す（区間の合計の式が別）
    expect(slot.segments.some((s) => s.landedShots !== undefined)).toBe(id === RAPUNZEL_SANCTUARY);
    const shots = [...shotEvents.values()].reduce((a, b) => a + b, 0);
    expect(slot.normalDamage / shots).toBeCloseTo(1, 12);
  });
});

describe('チャージ武器に替える使用武器変更の発（ナユタの記憶燃焼）', () => {
  // ナユタの S1 に、条件の無いフルチャージの発ごとの追加ダメージ（値 07）と、毎回の追加ダメージ（値 03）を足した定義
  const raw = rawDefinition(NAYUTA) as { skills: { skill1: { effects: unknown[] } } };
  const json = structuredClone(raw);
  json.skills.skill1.effects.push(
    { kind: 'damage', trigger: { count: 'fullChargeShot' }, damageType: 'additional', ref: 7 },
    { kind: 'damage', trigger: { count: 'normalShot' }, damageType: 'additional', ref: 3 },
  );
  const input = {
    ...fixedTeam([LITER, NAYUTA, ALICE], 1),
    slots: [fixedSlot(LITER), fixedSlot(NAYUTA, { definition: json }), fixedSlot(ALICE)],
  };
  const result = runSimulation(input);
  const log = result.shots[1]!;
  const segments = result.slots[1]!.segments;
  const segmentAt = (f: number) => segments.find((s) => s.start <= f && f < s.end)!;
  const uncharged = new Set(log.unchargedShotFrames ?? []);

  it('fires both SMG shots and charge shots', () => {
    expect(uncharged.size).toBeGreaterThan(0);
    expect(log.frames.length - uncharged.size).toBeGreaterThan(0);
  });

  it('decides the weapon of every shot by the weapon of its segment', () => {
    for (const f of log.frames) {
      const t = segmentAt(f).trigger;
      const shot = t.buffs.weapon?.shot ?? input.slots[1]!.character.shot;
      expect(isChargeWeapon(shot), `shot ${f}`).toBe(!uncharged.has(f));
    }
  });

  it('gives the full charge damage only to the charge shots, and the every-shot damage to all', () => {
    const value = (ref: number) => Number(input.slots[1]!.character.skills.skill1.values[ref - 1]![9]);
    for (const f of log.frames) {
      const t = segmentAt(f).trigger;
      const every = t.perShot - t.perShotFullCharge;
      expect(every, `shot ${f}`).toBeGreaterThan(0);
      if (uncharged.has(f)) expect(t.perShotFullCharge, `shot ${f}`).toBe(0);
      else expect(t.perShotFullCharge / every, `shot ${f}`).toBeCloseTo(value(7) / value(3), 9);
    }
  });
});
