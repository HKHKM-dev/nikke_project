// 2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2・3.4 節。V-0601、C-0823〜C-0825）: ジル（841）。リロード完了時の付与（{ reloadEnd } の
// timed・状態の付与）、硫酸弾（状態 acidRound と、付くフレームの条件 selfState を持つ持続ダメージ）、バースト使用時の残弾数減少。1 回分が 0 フレームの
// リロード（リロード速度 99.96%▲）も、最終弾の発の中で込め終えた込め終わりとして書く
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const JILL = 841;
const LITER = 82;
const DELTA = 20;

function slotOf(rid: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../../data/characters/${rid}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../../data/skills/${rid}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase: 0,
    },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const plan = (rids: number[]) => {
  const input: TeamInput = {
    slots: rids.map(slotOf),
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: rids.length - 1,
  };
  return planTeamRun(input);
};

describe('ジル単騎（バーストなし）', () => {
  const p = plan([JILL]);
  const log = p.shots[0]!;
  const magnum = itemsOf(p.history, { holder: 0, kind: 'timed', stat: 'normalAttackDamage' });

  it('reapplies Magnum Round on the frame after every reload completes, covering the 9 rounds of each magazine', () => {
    expect(log.reloadEnds!.length).toBeGreaterThan(10);
    expect(magnum.map((i) => i.start)).toEqual([0, ...log.reloadEnds!]);
    for (const item of magnum.slice(0, -1)) {
      expect(log.frames.filter((f) => item.start <= f && f < item.end)).toHaveLength(9);
    }
  });

  it('applies the acid damage over time once and ticks every second from one interval after the first shot (C-0129・C-0130)', () => {
    const ticks = p.skillHits.filter((h) => h.slotIndex === 0 && h.effect.dot !== undefined).map((h) => h.frame);
    expect(ticks[0]! - log.frames[0]!).toBeGreaterThanOrEqual(58);
    expect(ticks[0]! - log.frames[0]!).toBeLessThanOrEqual(60);
    for (let k = 1; k < ticks.length; k++) expect(ticks[k]! - ticks[k - 1]!).toBeGreaterThanOrEqual(58);
    // 付き直しで重ならない（1 秒に 1 tick）
    expect(ticks.length).toBeLessThanOrEqual(180);
    // 硫酸弾の状態は、付けた発の次のフレームに外れ、込め終わりで付き直す
    const acid = itemsOf(p.history, { holder: 0, kind: 'state', state: 'acidRound' });
    const shots = new Set(log.frames);
    const starts = new Set([0, ...log.reloadEnds!]);
    for (const item of acid.filter((i) => i.end < p.frames)) {
      expect(starts.has(item.start)).toBe(true);
      // 射撃の回数のきっかけの解除で、付けた発の 2 フレーム後に閉じる（発のフレームでは状態を見る）
      expect(shots.has(item.end - 2)).toBe(true);
    }
  });
});

describe('リター（I）・デルタ（II）・ジル（III）のバースト', () => {
  const p = plan([LITER, DELTA, JILL]);
  const log = p.shots[2]!;
  const burst = p.schedule!.activations.find((a) => a.slotIndex === 2)!;

  it('drains the ammo on burst use and reloads in the window at the firing interval', () => {
    const drain = p.instants.find((x) => x.sourceSlotIndex === 2 && x.effect.kind === 'ammoDecrease')!;
    expect(drain.frame).toBeGreaterThanOrEqual(burst.frame);
    const inWindow = log.lastShotFrames!.filter((f) => f > drain.frame && f < drain.frame + 588);
    expect(inWindow.length).toBeGreaterThan(0);
    for (const last of inWindow) {
      const next = log.frames.find((f) => f > last)!;
      expect(next - last).toBeLessThanOrEqual(25);
    }
  });

  it('writes the reload end of a zero-frame reload and reapplies Magnum Round in the window', () => {
    const drain = p.instants.find((x) => x.sourceSlotIndex === 2 && x.effect.kind === 'ammoDecrease')!;
    const lastInWindow = log.lastShotFrames!.find((f) => f > drain.frame && f < drain.frame + 588)!;
    expect(log.reloadEnds).toContain(lastInWindow + 1);
    const starts = itemsOf(p.history, { holder: 2, kind: 'timed', stat: 'normalAttackDamage' }).map((i) => i.start);
    expect(starts).toContain(lastInWindow + 1);
  });
});

describe('読み込み', () => {
  const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  const def = (effects: unknown[]) => ({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-01',
    skills: { skill1: { effects }, skill2: none, burst: none },
  });

  it('accepts { reloadEnd } in timed and state grants, and burstUse in ammoDecrease', () => {
    expect(() =>
      parseSkillDefinition(
        def([{ kind: 'timed', trigger: { reloadEnd: true }, target: 'self', stat: 'attack', ref: 1, durationRef: 2 }]),
      ),
    ).not.toThrow();
    expect(() =>
      parseSkillDefinition(
        def([
          {
            kind: 'state',
            state: 'acidRound',
            trigger: { reloadEnd: true },
            target: 'self',
            durationUntil: 'battleEnd',
          },
        ]),
      ),
    ).not.toThrow();
    expect(() =>
      parseSkillDefinition(def([{ kind: 'ammoDecrease', trigger: 'burstUse', target: 'self', ref: 1 }])),
    ).not.toThrow();
    expect(() =>
      parseSkillDefinition(def([{ kind: 'ammoDecrease', trigger: 'battleStart', target: 'self', ref: 1 }])),
    ).toThrow(/weaponChangeEnd: true \} or "burstUse"/);
  });

  it('allows only selfState as a dot condition, and not with a gauge', () => {
    const dot = { kind: 'dot', trigger: { count: 'normalShot' }, ref: 1, intervalSeconds: 1, durationRef: 2 };
    const cond = { selfState: { state: 'acidRound', present: true } };
    expect(() => parseSkillDefinition(def([{ ...dot, condition: cond }]))).not.toThrow();
    expect(() => parseSkillDefinition(def([{ ...dot, condition: { inFullBurst: true } }]))).toThrow();
    expect(() => parseSkillDefinition(def([{ ...dot, condition: cond, gaugeOnTick: true }]))).toThrow(
      /cannot charge the gauge/,
    );
  });
});
