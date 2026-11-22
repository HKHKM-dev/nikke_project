// 確率のきっかけの持続ダメージ（ハラン 230 の S1）と倍率ダメージ（ソルジャーO.W. 306 の S1）を含む編成（plan/design-chance-dot-damage.md）。
// dot は起点ごとの tick に出る確率の重みを掛け（frame/dot.ts の chanceDotTicks）、damage は射撃ごとの倍率ダメージ（perShot）に確率を掛けて畳み込む。
// 確率 100% なら確率の無い効果と同じになること（退化）と、射撃の列のグループ分け
import { describe, expect, it } from 'vitest';
import { chanceDotTicks } from '../frame/dot.ts';
import { planTeamRun } from '../frame/plan.ts';
import { oneHitValue } from '../skills/burstDamage.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { runTeam } from './runTeam.ts';
import { describeEveryShotInOneGroup, fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const HARAN = 230;
const SOLDIER_OW = 306;
type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }> };

function team(slots: TeamSlotInput[]): TeamInput {
  return fixedTeam(slots, 0, { enemy: fixedEnemy() });
}

/** 定義の skill1 の効果 [0] のきっかけを差し替えた枠 */
function slotWithTrigger(id: number, trigger: Record<string, unknown>): TeamSlotInput {
  const raw = structuredClone(rawDefinition<Raw>(id));
  raw.skills.skill1!.effects[0]!.trigger = trigger;
  const base = fixedSlot(id);
  return { ...base, skills: { ...base.skills!, definition: parseSkillDefinition(raw) } };
}

describe('定義', () => {
  it('defines Haran: S1 a chance dot, S2 pierce and crit rate for 1 round after a Full Charge shot, the burst burstDamage', () => {
    const def = parseSkillDefinition(rawDefinition(HARAN));
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'dot',
      trigger: { count: 'normalShot', chanceRef: 7 },
      intervalSeconds: 1,
      restartOnReapply: true,
    });
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'timed', trigger: { count: 'fullChargeShot' }, stat: 'pierce', durationShotsRef: 2 },
      { kind: 'timed', trigger: { count: 'fullChargeShot' }, stat: 'critRate', durationShotsRef: 2 },
    ]);
    expect(def.skills.burst.effects[0]).toMatchObject({ kind: 'burstDamage', damageType: 'skill' });
  });

  it('defines Soldier OW: S1 a chance additional damage, S2 an indirect note, the burst Max Ammo up for Fire allies', () => {
    const def = parseSkillDefinition(rawDefinition(SOLDIER_OW));
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'damage',
      trigger: { count: 'normalShot', chanceRef: 1 },
      damageType: 'additional',
    });
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.burst.effects[0]).toMatchObject({ stat: 'maxAmmo', target: 'allies', targetElement: 'Fire' });
  });

  it('rejects the fields undecided for a chance dot and damage', () => {
    const withS1 = (id: number, patch: Record<string, unknown>) => () => {
      const raw = structuredClone(rawDefinition<Raw>(id));
      Object.assign(raw.skills.skill1!.effects[0]!, patch);
      return parseSkillDefinition(raw);
    };
    expect(withS1(HARAN, { maxStacksRef: 2, firstTick: 'afterInterval' })).toThrow(
      /a dot on a chance trigger cannot have maxStacksRef/,
    );
    expect(withS1(HARAN, { gaugeOnTick: true })).toThrow(/a dot on a chance trigger cannot have gaugeOnTick/);
    expect(
      withS1(HARAN, { firstTick: 'halfAfterLatest', durationUntil: 'battleEnd', durationRef: undefined }),
    ).toThrow();
    expect(withS1(HARAN, { trigger: { count: 'normalShot' }, state: 'hacked' })).toThrow(
      /a dot with restartOnReapply cannot have state/,
    );
    expect(withS1(HARAN, { trigger: { count: 'normalShot' }, restartOnReapply: false })).toThrow(/expected true/);
    expect(withS1(HARAN, { state: 'hacked' })).toThrow(/a dot on a chance trigger cannot have state/);
    expect(withS1(SOLDIER_OW, { delayFrames: 2 })).toThrow(/not allowed with a chance trigger/);
    expect(withS1(SOLDIER_OW, { damageType: 'true' })).toThrow(/cannot be used with the damageType "true"/);
  });
});

describe('ハラン単騎: 確率の持続ダメージ', () => {
  const input = team([fixedSlot(HARAN)]);
  const plan = planTeamRun(input);
  const ticks = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.dot !== undefined);

  it('weights the ticks of every application, restarting the grid on reapplication, by the probability that they occur (25% per shot)', () => {
    const fires = plan.shots[0]!.frames.map((frame) => ({ frame, q: 0.25 }));
    const expected = chanceDotTicks(fires, 1, 5, plan.frames, 'atApplication', true);
    expect(ticks.map((h) => ({ frame: h.frame, weight: h.hit.chance }))).toEqual(expected);
    expect(ticks.length).toBeGreaterThan(plan.shots[0]!.frames.length);
  });

  it('reads one tick back without the weight (oneHitValue)', () => {
    for (const h of ticks.slice(0, 50)) {
      const unweighted = { ...h.hit, perActivation: h.hit.perActivation / h.hit.chance!, chance: undefined };
      expect(oneHitValue(h.hit, false)).toBeCloseTo(oneHitValue(unweighted, false), 6);
      expect(oneHitValue(h.hit, true)).toBeCloseTo(oneHitValue(unweighted, true), 6);
    }
  });

  it('gives the ticks of the dot without a chance when the chance is 100%', () => {
    const plain = planTeamRun(team([slotWithTrigger(HARAN, { count: 'normalShot' })])).skillHits.filter(
      (h) => h.effect.dot !== undefined,
    );
    const full = planTeamRun(team([slotWithTrigger(HARAN, { count: 'normalShot', chance: 100 })])).skillHits.filter(
      (h) => h.effect.dot !== undefined,
    );
    expect(full.map((h) => h.frame)).toEqual(plain.map((h) => h.frame));
    full.forEach((h, i) => {
      expect(h.hit.chance).toBe(1);
      expect(h.hit.perActivation).toBeCloseTo(plain[i]!.hit.perActivation, 6);
    });
  });
});

describe('ソルジャーO.W. 単騎: 確率の追加ダメージ', () => {
  it('folds the additional damage into the per-shot value with the chance (10% of the 100% value)', () => {
    const chance = runTeam(team([fixedSlot(SOLDIER_OW)])).slots[0]!.segments;
    const full = runTeam(team([slotWithTrigger(SOLDIER_OW, { count: 'normalShot', chance: 100 })])).slots[0]!.segments;
    expect(chance.length).toBe(full.length);
    chance.forEach((s, i) => {
      expect(s.trigger.perShot).toBeGreaterThan(0);
      expect(s.trigger.perShot).toBeCloseTo(full[i]!.trigger.perShot * 0.1, 6);
      expect(s.trigger.normal).toBeCloseTo(full[i]!.trigger.normal, 6);
    });
  });
});

describeEveryShotInOneGroup({
  ハラン単騎: team([fixedSlot(HARAN)]),
  'ソルジャーO.W. 単騎': team([fixedSlot(SOLDIER_OW)]),
});
