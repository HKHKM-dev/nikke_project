// ラプラス編（plan/design-laplace.md）: ラプラス（100）を含む編成で、S1 のヒーロービジョン（フルチャージごとのスタック）、
// 宝物版 S2 のフルチャージごとの追加ダメージ、バーストの使用武器変更の初回ダメージ（firstShotDamageRef）と、フルスタックの間の発だけの
// 防御力無視（trueDamageWhile）・発ごとの防御力無視ダメージが意図どおりに出るか。
// バーストの変更後の武器のレートは録画で読むまで定義に無い（data/skills/100.json の burst の notes）ので、ここではテストの即値の
// レートを足した定義で語彙の振る舞いを見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, rawDefinition, readJson } from './teamHelpers.ts';

const LAPLACE = 100;
/** テストの即値の変更後の武器のレート（rpm。録画で読むまでの仮の値で、語彙の振る舞いだけを見る。装弾数無限も録画で読む） */
const TEST_RATE_OF_FIRE = 600;

type Entry = { effects: Record<string, unknown>[]; notes?: Record<string, unknown>[] };
type Slots = { skill1: Entry; skill2: Entry; burst: Entry };
type Raw = { skills: Slots; treasureSkills: Slots };

const FULL = { selfState: { state: 'heroVision', stacks: 'full' } };
/** バーストに使用武器変更と防御力無視ダメージを足した定義（宝物版は trueDamageWhile も）。edit で S1 などを書き換える */
function definition(edit: (raw: Raw) => void = () => {}): Raw {
  const raw = structuredClone(rawDefinition<Raw>(LAPLACE));
  for (const treasure of [false, true]) {
    const burst = (treasure ? raw.treasureSkills : raw.skills).burst;
    burst.effects = [
      {
        kind: 'weaponChange',
        trigger: 'burstUse',
        damageRef: 2,
        firstShotDamageRef: 1,
        durationRef: 3,
        pierce: true,
        instantFire: true,
        infiniteAmmo: true,
        rateOfFire: TEST_RATE_OF_FIRE,
        ...(treasure ? { trueDamageWhile: FULL } : {}),
      },
      {
        kind: 'damage',
        trigger: { count: 'weaponChangeShot' },
        damageType: 'true',
        ref: 4,
        condition: FULL,
      },
    ];
    burst.notes = burst.notes!.filter((n) => n.kind === 'noDamage');
  }
  edit(raw);
  return raw;
}

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

/** 撮影の編成（ココア + ソルジャーF.A. + ラプラス（操作））。ラプラスは 3 枠目 */
function team(raw: Raw, treasurePhase: TreasurePhase): TeamInput {
  const slots = [311, 301].map((id): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' }));
  const laplace: TeamSlotInput = { ...fixedSlot(LAPLACE, raw), conditionMode: 'auto' };
  laplace.skills!.treasurePhase = treasurePhase;
  return { slots: [...slots, laplace], enemy: rangeEnemy, durationSeconds: 180, burst: true, controlledSlot: 2 };
}

const CASES: Record<string, { input: TeamInput; treasure: boolean }> = {
  '宝物版（段階 3）': { input: team(definition(), 3), treasure: true },
  基礎版: { input: team(definition(), 0), treasure: false },
  // ヒーロービジョンを 3 秒にして、バーストの途中で切れる回を作る
  '宝物版・ヒーロービジョンが途中で切れる': {
    input: team(
      definition((raw) => {
        const grant = raw.treasureSkills.skill1.effects[0]!;
        delete grant.durationRef;
        grant.durationSeconds = 3;
      }),
      3,
    ),
    treasure: true,
  },
};
const L = 2;

describe.each(Object.entries(CASES))('編成: %s', (name, { input, treasure }) => {
  const plan = planTeamRun(input);
  const log = plan.shots[L]!;
  const changed = log.weaponChangeShotFrames ?? [];
  const weapon = itemsOf(plan.history, {
    sourceSlotIndex: L,
    holder: L,
    kind: 'timed',
    skill: 'burst',
    stat: 'weapon',
  });
  const vision = itemsOf(plan.history, { holder: L, kind: 'state', state: 'heroVision' });
  // 倍率ダメージの条件 selfState と同じ見え方（frame より前に付いて frame に続いている件）
  const fullAt = (f: number) => vision.some((w) => w.stack === 5 && w.start < f && f < w.end);
  const inWindow = (f: number) => weapon.some((w) => w.start <= f && f < w.end);

  it('stacks Hero Vision up to 5 on fully charged shots', () => {
    expect(Math.max(...vision.map((w) => w.stack ?? 1))).toBe(5);
  });

  it('fires the changed weapon in each Burst and marks only its first shot as the first damage', () => {
    expect(weapon.length).toBeGreaterThanOrEqual(3);
    const first = log.weaponChangeFirstShotFrames ?? [];
    expect(first).toEqual(weapon.map((w) => changed.find((f) => f >= w.start)!));
    expect(changed.every(inWindow)).toBe(true);
  });

  it('makes the normal-damage shots true damage only while Hero Vision is at max stacks (judged per shot)', () => {
    const first = new Set(log.weaponChangeFirstShotFrames ?? []);
    const expected = treasure ? changed.filter((f) => !first.has(f) && fullAt(f)) : [];
    expect(log.trueDamageShotFrames ?? []).toEqual(expected);
    if (name.includes('途中で切れる')) {
      // 切れる前の発は防御力無視、切れた後の発は通常のダメージ
      expect(expected.length).toBeGreaterThan(0);
      expect(changed.some((f) => !first.has(f) && !fullAt(f))).toBe(true);
    }
  });

  it('deals the true damage on each changed-weapon shot while at max stacks', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === L && h.effect.source.skill === 'burst');
    expect(hits.map((h) => h.frame)).toEqual(changed.filter(fullAt));
  });

  it('deals the S2 additional damage only on fully charged shots, not on the changed-weapon shots', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === L && h.effect.source.skill === 'skill2');
    const changedSet = new Set(changed);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => changedSet.has(h.frame))).toBe(false);
  });

  it('values the first shot with the first damage and the true-damage shots without the defence (second pass)', () => {
    const sim = runSimulation(input);
    const segments = sim.slots[L]!.segments;
    const firsts = segments.flatMap((s) => (s.weaponShots?.first ? [s.weaponShots.first] : []));
    expect(firsts.reduce((n, v) => n + v.triggers, 0)).toBe(weapon.length);
    const trues = segments.flatMap((s) => (s.weaponShots?.trueDamage ? [{ s, v: s.weaponShots.trueDamage }] : []));
    expect(trues.reduce((n, { v }) => n + v.triggers, 0)).toBe((log.trueDamageShotFrames ?? []).length);
    for (const { s, v } of trues) expect(v.trigger.perTrigger).toBeGreaterThan(s.trigger.perTrigger);
    // 初回ダメージ（最終攻撃力の X%）は通常ダメージの発より大きい
    for (const s of segments.filter((g) => g.weaponShots?.first !== undefined))
      expect(s.weaponShots!.first!.trigger.perTrigger).toBeGreaterThan(30 * s.trigger.perTrigger);
    // 1 秒ごとのダメージの和が、区間ごとの集計と合う（発ごとの値の出し直しが両方にある）
    const normal = sim.slots[L]!.normalDamage;
    const perShotSum = segments.reduce((sum, s) => sum + s.damage, 0);
    expect(perShotSum).toBeCloseTo(normal, 3);
    const perSecond = (sim.damagePerSecond.slots[L] ?? []).reduce((sum, d) => sum + d, 0);
    expect(perSecond).toBeCloseTo(sim.slots[L]!.totalDamage, 0);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
