// 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1・3.1 節）: 遮蔽物 HP 回復を受けた出来事（FrameEvents.coverHealed）と、
// ナガ（450）の S1 の味方全体の遮蔽物 HP 回復。ティア（451）の S1 の { coverHealed } は、自分の枠が受けた遮蔽物 HP 回復で発火する。
// 射撃の回数起点の回復は、撃った枠より後ろの枠には同じフレーム、自分と前の枠には次のフレーム（skills/heals.ts の healFrameOf。C-0628 の形）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TIA = 451;
const NAGA = 450;
const characterOf = (rid: number) => readJson<CharacterData>(`../../../data/characters/${rid}.json`);
const definitionOf = (rid: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${rid}.json`));

function slotOf(rid: number, definition: SkillDefinition = definitionOf(rid)): TeamSlotInput {
  const character = characterOf(rid);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
    skills: { definition, levels: MAX_SKILL_LEVELS, treasurePhase: 0 },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const plan = (slots: TeamSlotInput[]) => {
  const input: TeamInput = { slots, enemy, durationSeconds: 180, burst: true, controlledSlot: 1 };
  return planTeamRun(input);
};

/** ナガの S1 の遮蔽物 HP 回復を外した定義 */
function withoutCoverHeal(): SkillDefinition {
  const d = definitionOf(NAGA);
  const s1 = d.skills.skill1;
  return {
    ...d,
    skills: { ...d.skills, skill1: { ...s1, effects: s1.effects.filter((e) => e.kind !== 'coverHeal') } },
  };
}

describe('ナガの S1 の遮蔽物 HP 回復とティアの S1（ティア（1 枠目）・ナガ（2 枠目））', () => {
  const p = plan([slotOf(TIA), slotOf(NAGA)]);
  const nagaShots = p.shots[1]!.frames;
  // 通常攻撃 12 回ごと（値 01）
  const every = Number(characterOf(NAGA).skills.skill1.values[0]![9]);
  const healShots = nagaShots.filter((_, k) => (k + 1) % every === 0);
  const tiaAttackDamage = itemsOf(p.history, { holder: 0, sourceSlotIndex: 0, kind: 'timed', stat: 'attackDamage' });
  const tiaBursts = p.schedule!.activations.filter((a) => a.slotIndex === 0);

  it('starts Tia S1 attack damage up on the frame after every 12th Naga shot (Tia is an earlier slot)', () => {
    expect(healShots.length).toBeGreaterThan(5);
    const starts = new Set(
      p.history.tracks.filter((t) => t.holder === 0 && t.sourceSlotIndex === 0).flatMap((t) => t.starts),
    );
    for (const f of healShots) expect(starts.has(f + 1)).toBe(true);
    // ▲（10 秒）は約 12 発ごとに付き直すので、最初の回復から戦闘の終わりまで途切れない
    expect(tiaAttackDamage.length).toBeGreaterThan(0);
    const first = healShots[0]! + 1;
    expect(tiaAttackDamage[0]!.start).toBeLessThanOrEqual(first);
    expect(tiaAttackDamage.at(-1)!.end).toBe(p.frames);
  });

  it('gives Naga herself the attack damage up on the frame after her own 12th shot (self is next frame)', () => {
    const onNaga = itemsOf(p.history, { holder: 1, sourceSlotIndex: 0, kind: 'timed', stat: 'attackDamage' });
    expect(onNaga.map((i) => i.start)).toEqual(tiaAttackDamage.map((i) => i.start));
  });

  it('does not start the window from Naga without her cover heal (only from Tia own burst)', () => {
    const q = plan([slotOf(TIA), slotOf(NAGA, withoutCoverHeal())]);
    const items = itemsOf(q.history, { holder: 0, sourceSlotIndex: 0, kind: 'timed', stat: 'attackDamage' });
    const bursts = q.schedule!.activations.filter((a) => a.slotIndex === 0);
    expect(items.length).toBe(bursts.length);
    expect(tiaBursts.length).toBeGreaterThanOrEqual(bursts.length);
  });

  it('lands on the same frame for a later slot (Naga in front of Tia)', () => {
    const q = plan([slotOf(NAGA), slotOf(TIA)]);
    const shots = q.shots[0]!.frames.filter((_, k) => (k + 1) % every === 0);
    const starts = new Set(
      q.history.tracks.filter((t) => t.holder === 1 && t.sourceSlotIndex === 1).flatMap((t) => t.starts),
    );
    for (const f of shots) expect(starts.has(f)).toBe(true);
  });
});

// 2 段目の段 17 の PR 2（plan/design-skill-stage17.md 2.1・3.2 節。V-0599、C-0821）: リター（82）の S2 は 15 秒ごとの CT ごとのアクティブで、
// 発動の 28f 後に遮蔽物 HP 回復が届く。対象「遮蔽物 HP が最も低い味方 2 機」は、編成が 2 体以下なら全員、3 体以上なら未実装で誰も選ばない
describe('リターの S2 の遮蔽物 HP 回復とティアの S1', () => {
  const LITER = 82;
  const DELTA = 20;
  const PERIOD = 883; // ceil(15 ÷ 0.017)
  const DELAY = 28;
  const startsOf = (p: ReturnType<typeof plan>, holder: number) =>
    itemsOf(p.history, { holder, sourceSlotIndex: holder, kind: 'timed', stat: 'attackDamage' }).map((i) => i.start);

  it('starts Tia S1 attack damage up 28 f after every 15 s activation in a 2-unit team (Tia never bursts first)', () => {
    const p = plan([slotOf(LITER), slotOf(TIA)]);
    const starts = startsOf(p, 1);
    const fromLiter = Array.from(
      { length: Math.floor((p.frames - 1 - DELAY) / PERIOD) },
      (_, k) => (k + 1) * PERIOD + DELAY,
    );
    for (const f of fromLiter) expect(starts).toContain(f);
  });

  it('does not choose anyone in a team of 3 or more (not modeled)', () => {
    const p = plan([slotOf(LITER), slotOf(DELTA), slotOf(TIA)]);
    const starts = startsOf(p, 2);
    expect(starts.filter((f) => (f - DELAY) % PERIOD === 0 && f > DELAY)).toEqual([]);
  });

  it('accepts delayFrames only with a timer trigger and needs a target count for lowestCoverHp', () => {
    const base = { kind: 'coverHeal', target: 'lowestCoverHp', targetCountRef: 1, ref: 2 };
    const def = (e: Record<string, unknown>) => ({
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-11-01',
      skills: {
        skill1: { effects: [e] },
        skill2: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
        burst: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
      },
    });
    expect(() => parseSkillDefinition(def({ ...base, trigger: { everySeconds: 15 }, delayFrames: 28 }))).not.toThrow();
    expect(() => parseSkillDefinition(def({ ...base, trigger: 'burstUse', delayFrames: 28 }))).toThrow(/timer trigger/);
    expect(() =>
      parseSkillDefinition(def({ kind: 'coverHeal', target: 'lowestCoverHp', ref: 2, trigger: { everySeconds: 15 } })),
    ).toThrow(/exactly one of targetCount/);
    expect(() =>
      parseSkillDefinition(def({ kind: 'coverHeal', target: 'allies', targetCount: 2, ref: 2, trigger: 'burstUse' })),
    ).toThrow(/only allowed with target .*"lowestCoverHp"/);
  });
});
