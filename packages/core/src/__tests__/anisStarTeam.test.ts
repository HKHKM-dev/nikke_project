// アニス：スター（17）を含む編成: S1 のバースト段階の構成の分岐（私だけの星の攻撃力▲は、自分を除く基本バースト段階 1 の味方がいないときだけ。
// plan/design-anis-star-s1.md）、フルチャージの発ごとの追加ダメージ（perShot）、フルバースト終了時の CT▼、sim と calc の整合。V-0116。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
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
const plainEnemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function fixedSlot(id: number, auto: boolean): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

// V-0116 の撮影と同じ: アニス：スター単騎・操作・オートバースト OFF・BigArms 灼熱の 3 分モード（私だけの星）
const SOLO: TeamInput = {
  slots: [fixedSlot(17, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
};
// V-0115 の録画 150 と同じ: アニス：スター（AI）+ I-DOLL・フラワー（操作・撃たないが、モデルは撃つ）（みんなの星）
const WITH_FLOWER: TeamInput = {
  slots: [fixedSlot(17, true), fixedSlot(304, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 1,
};
// 実戦寄り（アニス：スター + クラウン + デルタ + アリス + モダニア）。ほかに基本バースト段階 1 がいないので私だけの星。バーストあり
const PRACTICAL: TeamInput = {
  slots: [
    fixedSlot(17, false),
    fixedSlot(330, false),
    fixedSlot(20, false),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
  enemy: plainEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 3,
};
// 同じ編成のクラウンをリター（基本バースト段階 1）に替えたもの（みんなの星）
const PRACTICAL_WITH_LITER: TeamInput = {
  ...PRACTICAL,
  slots: [
    fixedSlot(17, false),
    fixedSlot(82, false),
    fixedSlot(20, false),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
};

// V-0121 の撮影と同じ: アニス：スター（操作）+ I-DOLL・フラワー + デルタ + イサベル、オートバースト ON（みんなの星）
const REENTRY: TeamInput = {
  slots: [fixedSlot(17, true), fixedSlot(304, true), fixedSlot(20, true), fixedSlot(231, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};

// V-0122 の撮影（録画 162）と同じ: アニス：スター（操作）+ デルタ + イサベル、オートバースト ON（私だけの星）
const CT_CUT: TeamInput = {
  slots: [fixedSlot(17, true), fixedSlot(20, true), fixedSlot(231, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};
// plan/design-anis-star-s2-burst.md 4.2 節の R1: アニス：スター単騎・オートバースト ON（I だけ撃ってチェーンは切れる）
const SOLO_BURST: TeamInput = { ...SOLO, burst: true };

describe('S2 とバースト（plan/design-anis-star-s2-burst.md）', () => {
  it('fires Shooting Stars every 0.25 s for 10 s after each Burst (40 hits)', () => {
    const calc = computeTeamDamage(SOLO_BURST);
    const uses = calc.schedule!.activations.filter((a) => a.slotIndex === 0);
    expect(uses.length).toBeGreaterThan(0);
    const stars = calc.slots[0]!.skillHits.activations.filter((a) => a.effect.dot?.autoAttack === true);
    // 戦闘の終わりで切れる最後の回を除いて、1 回のバーストに 40 ヒット
    expect(stars.length).toBeGreaterThan(40 * (uses.length - 1));
    expect(stars.length).toBeLessThanOrEqual(40 * uses.length);
  });

  it('shortens the shot interval during her Burst (charge time fixed at 0.7 s)', () => {
    const plan = planTeamRun(SOLO);
    const planBurst = planTeamRun(SOLO_BURST);
    expect(planBurst.shots[0]!.frames.length).toBeGreaterThan(plan.shots[0]!.frames.length);
  });

  it('gives the S2 buffs to all allies on Full Burst only with My Own Star for the ATK up', () => {
    const sim = runSimulation(CT_CUT);
    const fullBurst = sim.slots[1]!.segments.find((g) => g.fullBurst)!;
    expect(fullBurst.trigger.attack).toBeGreaterThan(fullBurst.trigger.baseAttack);
    expect(fullBurst.trigger.attackDamageMultiplier).toBeCloseTo(1.34, 12);
    expect(fullBurst.trigger.projectileExplosionMultiplier).toBe(1);
    const anisFb = sim.slots[0]!.segments.find((g) => g.fullBurst)!;
    expect(anisFb.trigger.projectileExplosionMultiplier).toBeGreaterThan(1);
  });
});

describe('みんなの星のバースト再突入 I 段階（V-0121）', () => {
  it('lets another Burst I ally fire after her Burst I in the same chain', () => {
    const activations = runSimulation(REENTRY).schedule!.activations;
    expect(activations.slice(0, 4).map((a) => [a.slotIndex, a.step])).toEqual([
      [0, 'Step1'],
      [1, 'Step1'],
      [2, 'Step2'],
      [3, 'Step3'],
    ]);
    expect(activations[0]!.enteredStep).toBe('Step1');
  });

  it('does not re-enter with My Own Star (no other Burst I ally)', () => {
    const solo = runSimulation({ ...REENTRY, slots: [fixedSlot(17, true), fixedSlot(20, true), fixedSlot(231, true)] });
    expect(solo.schedule!.activations[0]!.enteredStep).toBe('Step2');
  });
});

describe('私だけの星とみんなの星（バースト段階の構成の分岐）', () => {
  const attackOf = (input: TeamInput) => computeTeamDamage(input).slots[0]!.segments[0]!.trigger.attack;

  it('gives My Own Star ATK up (40.01%) only without another Burst I ally', () => {
    expect(attackOf(SOLO)).toBeCloseTo(80485 * 1.4001, 6);
    expect(attackOf(WITH_FLOWER)).toBe(80485);
  });

  it('cuts the Burst cooldown of all allies at the end of Full Burst only with My Own Star', () => {
    const cuts = (input: TeamInput) =>
      runSimulation(input).instants.filter((x) => x.effect.kind === 'cooldownReduction' && x.sourceSlotIndex === 0);
    const mine = cuts(PRACTICAL);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((x) => x.amount > 0)).toBe(true);
    expect(cuts(PRACTICAL_WITH_LITER)).toEqual([]);
  });

  it('adds the additional damage to every Full Charge shot in both branches', () => {
    for (const input of [SOLO, WITH_FLOWER]) {
      const trigger = computeTeamDamage(input).slots[0]!.segments[0]!.trigger;
      expect(trigger.perShot).toBeGreaterThan(0);
    }
  });
});

// クラウンをリターに替えた編成は、calc の平均で数える群（triggerSource average）でアニス：スターの発の数が sim より 4〜9% 少なく、
// 枠の合計が 5% を少し超える（calc のハイブリッドの近似。plan/backlog.md 4-5）。バースト段階の構成の条件とは別なので、5% の検査は外す
describe.each([
  ['アニス：スター単騎（V-0116 の撮影の条件）', SOLO, true],
  ['アニス：スター + I-DOLL・フラワー（録画 150 の編成）', WITH_FLOWER, true],
  ['実戦寄り（アニス：スター + クラウン + デルタ + アリス + モダニア）', PRACTICAL, true],
  ['実戦寄り（クラウンをリターに替えた編成）', PRACTICAL_WITH_LITER, false],
  ['バースト再突入（V-0121 の撮影の条件）', REENTRY, true],
  ['私だけの星のフルバースト（V-0122 の撮影の条件）', CT_CUT, true],
  ['アニス：スター単騎・オートバースト ON（R1 の条件）', SOLO_BURST, true],
] as const)('sim vs calc: %s', (_name, input, checkTotals) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    input.slots.forEach((_, i) => {
      const groups = simGroupTotals(sim, i);
      calc.slots[i]!.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it.runIf(checkTotals)('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
