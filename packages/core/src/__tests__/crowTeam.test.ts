// クロウ編（plan/design-crow.md）: クロウ（110）を含む編成で、S2 の最後の弾丸の追加ダメージと、バーストの倍率ダメージが
// 意図どおりに出るか。S1 の敵の攻撃力▼は計算に無関係、S2 の自分の防御力▲は間接（V-0816）
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { burstHitsOfSlot } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { shotCountWeight } from '../skills/triggers.ts';
import { lastBulletShotsOf } from '../weapons.ts';
import { rawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const CROW = 110;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

/** 撮影 B の編成（ココア + ソルジャーF.A. + クロウ（操作））。クロウは 3 枠目 */
function rangeTeam(): TeamInput {
  const slots = [311, 301, CROW].map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemy });
}

describe('クロウの定義', () => {
  const def = parseSkillDefinition(rawDefinition(CROW));

  it('defines the S2 additional damage and the Burst Skill damage, and keeps S1 and the S2 DEF up as notes', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind === 'damage' && e.damageType)).toEqual(['additional']);
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['indirect']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
  });
});

describe('二丁持ちの最後の弾丸（C-1400）', () => {
  it('is the last muzzle-count shots of a magazine for dual-wield weapons and the last shot otherwise', () => {
    expect(lastBulletShotsOf('SMG', characterOf(CROW).shot)).toBe(2);
    expect(lastBulletShotsOf('SMG', { muzzleCount: 1 })).toBe(1);
    expect(lastBulletShotsOf('AR', { muzzleCount: 2 })).toBe(1);
  });

  it('counts lastShot on the shots marked as a last bullet, falling back to the magazine end', () => {
    const shot = { lastShot: false, fullCharge: false, hits: 1, coreHits: 0 };
    expect(shotCountWeight('lastShot', { ...shot, lastBullet: true })).toBe(1);
    expect(shotCountWeight('lastShot', { ...shot, lastShot: true, lastBullet: false })).toBe(0);
    expect(shotCountWeight('lastShot', { ...shot, lastShot: true })).toBe(1);
  });
});

const CASES: Record<string, { input: TeamInput; slot: number }> = {
  撮影の編成: { input: rangeTeam(), slot: 2 },
  '実戦寄り（リター + クラウン + クロウ + アリス + ユニ）': {
    input: fixedTeam([82, 330, CROW, 191, 160], 2),
    slot: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, slot }) => {
  const plan = planTeamRun(input);
  const ends = plan.shots[slot]!.lastShotFrames!;
  const s2Hits = plan.skillHits.filter((h) => h.slotIndex === slot && h.effect.source.skill === 'skill2');

  it('deals one S2 additional damage on each of the last two shots of a magazine, on the same frame (C-1400)', () => {
    expect(ends.length).toBeGreaterThan(20);
    const shots = plan.shots[slot]!.frames;
    // 二丁持ちの銃口ごとの最後の弾丸: 最後の発と、その前の発
    const expected = ends.flatMap((f) => [shots[shots.indexOf(f) - 1]!, f]);
    expect(s2Hits.map((h) => h.frame)).toEqual(expected);
    expect(plan.shots[slot]!.lastBulletFrames).toEqual(expected);
  });

  it('deals the Burst Skill damage once per activation, 5f after the III timer hits 00.00, and nothing else from the Burst', () => {
    expect(burstDelaysOf(characterOf(CROW))).toEqual({ hitFrames: 5, effectFrames: 0 });
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === slot);
    expect(activations.length).toBeGreaterThan(0);
    const landed = burstHitsOfSlot(plan.schedule!, slot, plan.frames);
    expect(new Set(landed.map((h) => h.activationFrame)).size).toBe(activations.length);
    expect(plan.skillHits.filter((h) => h.slotIndex === slot && h.effect.source.skill !== 'skill2')).toEqual([]);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
