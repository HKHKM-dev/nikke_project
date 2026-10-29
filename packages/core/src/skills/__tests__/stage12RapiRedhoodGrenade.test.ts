// 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2〜2.4 節）: ラピ：レッドフード（16）の S2 の粘着榴弾（付着・溜めて
// フルバーストの始まりに起爆・フルバーストの中はすぐ起爆）、S2 の常時の発射体付着・爆発ダメージ▲と電撃コードへの有利コード、
// バースト III の付着▲・回数条件▼（録画 0116・0117・0733・0734。V-0537）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isInFullBurst } from '../../burst/schedule.ts';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { GAME_SECONDS_PER_FRAME } from '../../time.ts';
import type { CharacterData, Element } from '../../types.ts';
import { oneHitValue } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const RAPI_RH = 16;
const LITER = 82;
const DELTA = 20;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`));
const rapi = character(RAPI_RH);
const s2 = (ref: number) => skillValue(rapi.skills.skill2, ref, MAX_SKILL_LEVELS.skill2) / 100;
const burstValue = (ref: number) => skillValue(rapi.skills.burst, ref, MAX_SKILL_LEVELS.burst);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
  };
}

const enemyOf = (element: Element): EnemyInput => ({ defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true });

describe('語彙の検証', () => {
  type Raw = { skills: Record<'skill2' | 'burst', { effects: Record<string, unknown>[] }> };
  const def = readJson<Raw>(`../../../data/skills/${RAPI_RH}.json`);
  const withEffect = (slot: 'skill2' | 'burst', index: number, patch: Record<string, unknown>) => {
    const copy = structuredClone(def);
    copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
    return () => parseSkillDefinition(copy);
  };
  const detonation = def.skills.skill2.effects.findIndex((e) => e.trigger === 'fullBurstStart' && e.kind === 'damage');
  const counter = def.skills.skill2.effects.findIndex((e) => e.kind === 'counterChange');
  const advantage = def.skills.skill2.effects.findIndex((e) => e.stat === 'elementAdvantage');
  const countDown = def.skills.burst.effects.findIndex((e) => e.kind === 'cycleEvery');

  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(def)).not.toThrow();
  });

  it('needs perCount { counter } for perCountIntervalSeconds and a positive number', () => {
    expect(withEffect('skill2', detonation, { perCount: undefined })).toThrow(/perCountIntervalSeconds needs perCount/);
    expect(withEffect('skill2', detonation, { perCountIntervalSeconds: 0 })).toThrow(/expected a positive number/);
  });

  it('allows inFullBurst: false only in counterChange', () => {
    expect(withEffect('skill2', detonation, { condition: { inFullBurst: false } })).toThrow(/expected true/);
    expect(withEffect('skill2', counter, { condition: { inFullBurst: 'no' } })).toThrow(/expected a boolean/);
  });

  it('keeps elementAdvantage a value-less flag on self', () => {
    expect(withEffect('skill2', advantage, { ref: 1 })).toThrow(/elementAdvantage has no value/);
    expect(withEffect('skill2', advantage, { target: 'allies' })).toThrow(/only allowed with target "self"/);
  });

  it('needs decreaseRef (not every) for a slot without a cycle, and exactly one of them', () => {
    expect(withEffect('burst', countDown, { decreaseRef: undefined, every: 60 })).toThrow(/has no cycle/);
    expect(withEffect('burst', countDown, { every: 60 })).toThrow(/exactly one of every and decreaseRef/);
    expect(withEffect('burst', countDown, { slot: 'skill1' })).toThrow(/neither a cycle nor a shot count trigger/);
  });
});

describe('粘着榴弾とバースト III の付着▲・回数条件▼（灼熱の的・リター（I）・デルタ（II）と組む）', () => {
  const m = 2;
  const input: TeamInput = {
    slots: [slotOf(LITER), slotOf(DELTA), slotOf(RAPI_RH)],
    enemy: enemyOf('Fire'),
    durationSeconds: 180,
    burst: true,
  };
  const r = runSimulation(input);
  const schedule = r.schedule!;
  const windows = schedule.fullBurstWindows;
  const hits = r.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'skill2');
  const attaches = hits.filter((h) => h.effect.projectileStick === true);
  const inside = hits.filter((h) => h.effect.projectileExplosion === true && h.effect.trigger !== 'fullBurstStart');
  const detonations = hits.filter((h) => h.effect.trigger === 'fullBurstStart');
  const shots = r.shots[m]!.frames;

  it('detonates at each Full Burst start the grenades fired outside Full Burst since the last one, 0.2 s apart', () => {
    expect(windows.length).toBeGreaterThanOrEqual(3);
    windows.forEach((w, k) => {
      const from = k === 0 ? 0 : windows[k - 1]!.end;
      const fired = attaches.filter((h) => h.frame - 5 >= from && h.frame - 5 < w.start).length;
      const here = detonations.filter((h) => w.start <= h.frame && h.frame < w.end).map((h) => h.frame - w.start);
      expect(here).toEqual(
        Array.from({ length: fired }, (_, i) => Math.floor((i * 0.2) / GAME_SECONDS_PER_FRAME + 1e-9)),
      );
    });
  });

  it('detonates the grenades fired during Full Burst on the frame they attach', () => {
    const during = attaches.filter((h) => isInFullBurst(schedule, h.frame - 5));
    expect(during.length).toBeGreaterThan(0);
    expect(inside.map((h) => h.frame)).toEqual(during.map((h) => h.frame));
  });

  it('fires a grenade every 60 shots of the running count inside the burst III window (not restarting the count)', () => {
    const length = Math.ceil(burstValue(9) / GAME_SECONDS_PER_FRAME);
    const uses = schedule.activations.filter((a) => a.slotIndex === m).map((a) => a.frame);
    const inWindow = (f: number) => uses.some((u) => u <= f && f < u + length);
    const fired = attaches.map((h) => h.frame - 5);
    for (const f of fired) {
      const count = shots.filter((s) => s <= f).length;
      expect(count % (inWindow(f) ? 120 - burstValue(8) : 120)).toBe(0);
    }
    expect(fired.some((f) => inWindow(f) && shots.filter((s) => s <= f).length % 120 !== 0)).toBe(true);
  });

  it('pauses her firing on every grenade, also every 60 shots inside the window', () => {
    for (const h of attaches) {
      const f = h.frame - 5;
      // 撃った発の次のフレームは撃たない（C-0717）
      expect(shots.includes(f)).toBe(true);
      expect(shots.includes(f + 1)).toBe(false);
    }
  });

  it('values an attach as a core hit with the permanent and burst increases in one sum', () => {
    const first = attaches[0]!;
    expect(isInFullBurst(schedule, first.frame)).toBe(false);
    expect(oneHitValue(first.hit, false, true)).toBeCloseTo(first.hit.baseHit * s2(2) * (1 + s2(5)) * 2, 6);
    // フルバーストの中で窓の付着▲が乗ると、(1 + S2 の▲ + バーストの▲)（別の乗数ではない）。コア 1 + フルバースト補正 0.5
    const windowed = attaches.find((h) => isInFullBurst(schedule, h.frame))!;
    expect(oneHitValue(windowed.hit, false, true)).toBeCloseTo(
      windowed.hit.baseHit * s2(2) * (1 + s2(5) + burstValue(6) / 100) * 2.5,
      6,
    );
  });

  it('values an explosion with the explosion increase, no core and the Full Burst bonus', () => {
    const d = detonations[0]!;
    expect(d.hit.boost.coreDamage).toBe(0);
    expect(d.hit.boost.fullBurst).toBe(0.5);
    expect(oneHitValue(d.hit, false)).toBeCloseTo(d.hit.baseHit * s2(3) * (1 + s2(6)) * 1.5, 6);
  });
});

describe('電撃コードの敵への有利コード（単騎・オートバースト OFF）', () => {
  const solo = (element: Element) =>
    runSimulation({ slots: [slotOf(RAPI_RH)], enemy: enemyOf(element), durationSeconds: 60 });
  const electric = solo('Electronic');
  const fire = solo('Fire');

  it('raises the normal attack and the attach by the advantage multiplier, only against Electric', () => {
    const perTrigger = (r: ReturnType<typeof solo>) => r.slots[0]!.segments[0]!.trigger.perTrigger;
    expect(perTrigger(electric) / perTrigger(fire)).toBeCloseTo(1.1, 9);
    const attach = (r: ReturnType<typeof solo>) => oneHitValue(r.skillHits[0]!.hit, false, true);
    expect(attach(electric) / attach(fire)).toBeCloseTo(1.1, 9);
  });

  it('never detonates without Full Burst', () => {
    expect(electric.skillHits.every((h) => h.effect.projectileStick === true)).toBe(true);
  });
});
