// 2 段目の段 3 の PR 3（plan/design-skill-stage3.md 1.4・1.5・2.3 節）: ソーダ：トゥインクルバニー（314）のバースト。ゴールデンチップの
// スタック量別の効果（20 スタック以上で自分に命中率▲、30 スタック以上で攻撃力▲）と、効果の後の 17 個▼。編成は撮影計画と同じ
// ラム + デルタ + ソーダ：TB（操作）と、実戦寄りの編成。damage の条件のスタック数（frame/plan.ts）と、sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import { METRICS } from '../records/observations.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { itemsOf, valuePiecesOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const SODA = 314;
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };
const rawDefinition = (id: number) => readJson<RawDefinition>(`../../data/skills/${id}.json`);

function fixedSlot(id: number, definition?: unknown): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const raw = definition ?? (DEFINED.has(id) ? rawDefinition(id) : undefined);
  if (raw !== undefined) slot.skills = { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS };
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const team = (slots: TeamSlotInput[], controlledSlot: number): TeamInput => ({
  slots,
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

/** 撮影計画の編成（ラム I・デルタ II・ソーダ：TB III（操作）） */
const recordingTeam = (soda?: unknown) => team([fixedSlot(822), fixedSlot(20), fixedSlot(SODA, soda)], 2);
const S = 2;

/** 枠 S のフレーム frame のゴールデンチップのスタック数（効いている件の段の最大） */
function chipsAt(plan: ReturnType<typeof planTeamRun>, frame: number): number {
  const items = itemsOf(plan.history, { holder: S, state: 'goldenChip' });
  return Math.max(0, ...items.filter((i) => i.start <= frame && frame < i.end).map((i) => i.stack ?? 1));
}
const sodaBursts = (plan: ReturnType<typeof planTeamRun>) =>
  plan.schedule!.activations.filter((a) => a.slotIndex === S).map((a) => a.frame);

describe('ソーダ：トゥインクルバニーのバースト（ラム + デルタ + ソーダ：TB）', () => {
  const plan = planTeamRun(recordingTeam());
  const bursts = sodaBursts(plan);

  it('decreases Golden Chip by 17 on the frame after each burst, keeping the last stack', () => {
    expect(bursts.length).toBe(5);
    for (const a of bursts) {
      expect(chipsAt(plan, a)).toBe(chipsAt(plan, a - 1));
      expect(chipsAt(plan, a + 1)).toBe(Math.max(1, chipsAt(plan, a) - 17));
    }
    // 17 個以下の時の減少（1 個残る。V-0437）も通る
    expect(bursts.some((a) => chipsAt(plan, a) < 17)).toBe(true);
  });

  it('applies Hit Rate at 20 stacks or more and ATK at 30 or more, judged before the decrease', () => {
    const pieces = valuePiecesOf(plan.history).filter((p) => p.slotIndex === S && p.effect.source.skill === 'burst');
    const appliedAt = (stat: string) => bursts.map((a) => pieces.some((p) => p.effect.stat === stat && p.start === a));
    expect(appliedAt('hitRate')).toEqual(bursts.map((a) => chipsAt(plan, a) >= 20));
    expect(appliedAt('attack')).toEqual(bursts.map((a) => chipsAt(plan, a) >= 30));
    // どちらも付く回・命中率▲だけの回・どちらも付かない回がある（減少の後に判定すると 2 回目は攻撃力▲が付かない）
    expect(appliedAt('hitRate')).toEqual([true, true, true, false, false]);
    expect(appliedAt('attack')).toEqual([true, true, false, false, false]);
    const attack = pieces.find((p) => p.effect.stat === 'attack')!;
    expect(attack.effect.value).toBeCloseTo(0.6525, 12);
    expect(attack.end - attack.start).toBe(882);
  });

  it('adds a stack on every 3rd normal attack of the battle that lands inside a Full Burst (V-0443)', () => {
    const shots = plan.shots[S]!.frames;
    const windows = plan.schedule!.fullBurstWindows;
    // 通し番号が 3 の倍数の発のうち、窓の中のもの（窓の外の回は発火せずに過ぎる）
    const third = shots.filter((_, i) => (i + 1) % 3 === 0);
    for (const w of windows) {
      const fires = third.filter((f) => w.start <= f && f < w.end).length;
      expect(chipsAt(plan, w.end) - chipsAt(plan, w.start)).toBe(fires);
    }
    // 窓の外で 3 の倍数に届く回があり、フルバーストごとに数え直す読みとは数が変わる回がある
    expect(third.some((f) => !windows.some((w) => w.start <= f && f < w.end))).toBe(true);
    expect(
      windows.some((w) => {
        const inside = shots.filter((f) => w.start <= f && f < w.end).length;
        return chipsAt(plan, w.end) - chipsAt(plan, w.start) !== Math.floor(inside / 3);
      }),
    ).toBe(true);
  });

  it('deals the burst skill damage on every burst', () => {
    const sim = runSimulation(recordingTeam());
    expect(sim.slots[S]!.burst.hits.length).toBe(bursts.length);
  });

  // V-0444（plan/design-burst-landing.md 10 節の案 1）: ヒットは III のタイマーの 00.00 から 96f（C-0581）で、同じ発動で付いた
  // 攻撃力▲が乗る（C-0582。▲込みの攻撃力は整数に切り捨て）。▲の付かない 3 回目以降は素の攻撃力
  it('hits 96 frames after the Full Burst timer and carries the same burst ATK▲ (sim and calc)', () => {
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === S);
    for (const a of activations) expect(hitFrameOf(a) - hexagonFrameOf(a)).toBe(96);
    const attack = computeFixedSpecAttack(character(SODA)).attack;
    const expected = [1, 1, 0, 0, 0].map(
      (up) => (up ? Math.floor(attack * 1.6525) : attack) - FIXED_SPEC_ENEMY_DEFENCE,
    );
    const sim = runSimulation(recordingTeam()).slots[S]!.burst.hits.map((h) => h.baseHit);
    const calc = runTeam(recordingTeam()).slots[S]!.burst.activations.map((a) => a.hit.baseHit);
    for (const values of [sim, calc]) {
      expect(values.length).toBe(expected.length);
      values.forEach((v, i) => expect(v).toBe(expected[i]));
    }
  });
});

describe('damage の条件のスタック数（frame/plan.ts）', () => {
  /** skill2 に、バースト使用時の追加ダメージ（スタック数の条件つき）を足したソーダ：TB */
  const withDamage = (stacks: number | 'full') => {
    const raw = structuredClone(rawDefinition(SODA));
    raw.skills.skill2!.effects.push({
      kind: 'damage',
      trigger: 'burstUse',
      ref: 6,
      damageType: 'additional',
      condition: { selfState: { state: 'goldenChip', stacks } },
    });
    return raw;
  };
  const hitFrames = (plan: ReturnType<typeof planTeamRun>) =>
    plan.skillHits.filter((h) => h.slotIndex === S && h.effect.source.skill === 'skill2').map((h) => h.frame);

  it('fires at bursts whose stacks of that frame reach N (before the decrease)', () => {
    const plan = planTeamRun(recordingTeam(withDamage(30)));
    const expected = sodaBursts(plan).filter((a) => chipsAt(plan, a) >= 30);
    expect(expected.length).toBeGreaterThan(0);
    expect(hitFrames(plan)).toEqual(expected);
  });

  it('fires only at the full stack', () => {
    const plan = planTeamRun(recordingTeam(withDamage('full')));
    expect(hitFrames(plan)).toEqual([sodaBursts(plan)[0]]);
  });
});

describe('スタックの指標（records/observations.ts。V-0437 の比べ）', () => {
  const input = recordingTeam();
  const sim = runSimulation(input);
  const plan = planTeamRun(input);
  const metric = (name: string, args: Record<string, unknown>, result = sim, team = input) =>
    METRICS[name]!.sim(result, { args, input: team } as Parameters<(typeof METRICS)[string]['sim']>[1]);

  it('marks the bursts at which the conditional effects were applied', () => {
    expect(metric('burstBuffApplied', { slot: 3, skill: 'burst', stat: 'attack' })).toEqual([1, 1, 0, 0, 0]);
    expect(metric('burstBuffApplied', { slot: 3, skill: 'burst', stat: 'hitRate', count: 3 })).toEqual([1, 1, 1]);
  });

  it('measures each decrease as the change of the top stack across its frame', () => {
    const expected = sodaBursts(plan).map((a) => Math.max(1, chipsAt(plan, a) - 17) - chipsAt(plan, a));
    expect(metric('stateStackDrops', { slot: 3, state: 'goldenChip' })).toEqual(expected);
    expect(expected.slice(0, 3)).toEqual([-17, -17, -17]);
  });

  it('gives zero gain residues when the count restarts at each Full Burst, and not when it counts the whole battle', () => {
    const args = { slot: 3, state: 'goldenChip', every: 3 };
    // いまの定義（戦闘中ずっと数える。V-0443）は、窓の外の発の分だけ余りが出る回がある
    expect((metric('fullBurstStackGainResidues', args) as number[]).some((r) => r !== 0)).toBe(true);
    // フルバーストごとに数え直す読み（V-0437 の H1。V-0443 で棄却）なら余りは 0 だけ
    const raw = structuredClone(rawDefinition(SODA));
    const grant = raw.skills.skill1!.effects[1]!;
    const { firesDuring: _, ...rest } = grant.trigger as Record<string, unknown>;
    raw.skills.skill1!.effects[1] = { ...grant, trigger: { ...rest, during: 'fullBurst', reset: 'fullBurstStart' } };
    const restarted = recordingTeam(raw);
    const residues = metric('fullBurstStackGainResidues', args, runSimulation(restarted), restarted) as number[];
    expect(residues).toEqual([0, 0, 0, 0, 0]);
  });
});

const TEAMS: Record<string, TeamInput> = {
  'ラム + デルタ + ソーダ：TB（撮影計画の編成）': recordingTeam(),
  '実戦寄り（リター + クラウン + ソーダ：TB + アリス + アドミ）': team(
    [fixedSlot(82), fixedSlot(330), fixedSlot(SODA), fixedSlot(191), fixedSlot(172)],
    2,
  ),
};

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, input) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('agree exactly on the schedule, the instants, the skill hits and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.damage).toBe(c.skillHits.totalDamage);
      expect(s.burst.damage).toBe(c.burst.totalDamage);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
