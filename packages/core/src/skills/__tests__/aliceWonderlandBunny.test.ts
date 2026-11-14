// アリス：ワンダーランドバニー（195）の定義（V-0766）: S1 の 60 発ごとの回復とニンジンパーティー、S2 のフルバーストの開始・終わりの
// 効果、バーストの再突入と回復。スタック量▲（S1 の 2 行目）は未対応の notes。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveStateGrants, resolveTimed, type SkillLevels } from '../resolve.ts';
import { burstReentryStepOf, parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const alice = readJson<CharacterData>('../../../data/characters/195.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/195.json'));
/** オーナーの育成（S1 Lv7・S2 Lv7・バースト Lv4） */
const OWNER: SkillLevels = { skill1: 7, skill2: 7, burst: 4 };

describe('アリス：ワンダーランドバニー（195）の定義', () => {
  it('has the slot supports from the effects and notes', () => {
    // S1 はスタック量▲が未対応、S2 は全部、バーストは間接の notes だけが残る
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'unimplemented']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['indirect']);
  });

  it('heals all allies every 60 normal attacks and on the burst use', () => {
    for (const [levels, values] of [
      [MAX_SKILL_LEVELS, [0.074, 0.27]],
      [OWNER, [0.06, 0.1731]],
    ] as const) {
      const heals = resolveInstant(def, alice, levels).filter((e) => e.kind === 'heal');
      expect(heals.map((h) => [h.source.skill, h.trigger, h.target])).toEqual([
        ['skill1', { count: 'normalShot', every: 60 }, 'allies'],
        ['burst', 'burstUse', 'allies'],
      ]);
      heals.forEach((h, i) => expect(h.value).toBeCloseTo(values[i]!, 10));
    }
  });

  it('grants Carrot Party (5 stacks, 5 s on the game clock) to all allies on the same shots as the heal, without contents', () => {
    const grants = resolveStateGrants(def, alice, MAX_SKILL_LEVELS);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      state: 'carrotParty',
      target: 'allies',
      trigger: { count: 'normalShot', every: 60 },
      maxStacks: 5,
      durationFrames: 294,
    });
    expect(grants[0]).not.toHaveProperty('contents');
  });

  it('gives all allies max ammo up and an ammo refill at Full Burst start, and gauge speed up at its end', () => {
    for (const [levels, ratio] of [
      [MAX_SKILL_LEVELS, { gauge: 0.1, ammo: 0.4 }],
      [OWNER, { gauge: 0.0824, ammo: 0.3019 }],
    ] as const) {
      const timed = resolveTimed(def, alice, levels);
      expect(timed.map((e) => [e.stat, e.trigger, e.target, e.durationFrames])).toEqual([
        ['burstGaugeSpeed', 'fullBurstEnd', 'allies', 294],
        ['maxAmmo', 'fullBurstStart', 'allies', 882],
      ]);
      expect(timed[0]!.value).toBeCloseTo(ratio.gauge, 10);
      expect(timed[1]!.value).toBeCloseTo(ratio.ammo, 10);
      const refill = resolveInstant(def, alice, levels).filter((e) => e.kind === 'ammoRefill');
      expect(refill).toHaveLength(1);
      expect(refill[0]).toMatchObject({ trigger: 'fullBurstStart', target: 'allies' });
      expect(refill[0]!.value).toBeCloseTo(ratio.ammo, 10);
    }
  });

  it('re-enters Burst stage 1 (same as the CDN next stage)', () => {
    expect(burstReentryStepOf(def)).toBe('Step1');
    expect(alice.burstSkill.nextStep).toBe('Step1');
  });
});
