// 2 段目の段 4 の PR 1（plan/design-skill-stage4.md 1.1・1.2・2.1 節）: { applied } を timed・状態の付与に開く、維持 0 秒の付与（名前の
// 付いた即時効果の付いた記録）、トーブ（192）の宝物版 S1（代用弾丸が適用される時、味方全体に応急改造とクリティカルダメージ▲）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { hasOwnShotCountItem, itemsOf, valuePiecesOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { appliedFrames } from '../skills/timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TORB = 192;
const RAPI = 10;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function slotOf(id: number, definition?: SkillDefinition, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const def =
    definition ??
    (DEFINED.has(id) ? parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)) : undefined);
  if (def !== undefined) slot.skills = { definition: def, levels: MAX_SKILL_LEVELS, treasurePhase };
  return slot;
}

function teamOf(slots: TeamSlotInput[], burst: boolean, controlledSlot = 0, durationSeconds = 60): TeamInput {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Wind', hasCore: true };
  return { slots, enemy, durationSeconds, burst, controlledSlot };
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
/** 試しの定義（skill1 だけに効果。値の ref は、そのキャラの S1 の説明文の値） */
const defOf = (resourceId: number, effects: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-10-16',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
    ...extra,
  });

/** 自分の通常攻撃 every 回ごとに付く、維持 0 秒のカモフラージュ（付いた記録だけ） */
const marker = (every: number) => ({
  kind: 'state',
  state: 'camouflage',
  trigger: { count: 'normalShot', every },
  target: 'self',
  durationSeconds: 0,
});
const onApplied = (stat: string, durationSeconds: number, target = 'self') => ({
  kind: 'timed',
  trigger: { applied: 'camouflage' },
  target,
  stat,
  ref: 1,
  durationSeconds,
});

describe('{ applied } を timed・付与に開く読み込み', () => {
  const grant = {
    kind: 'state',
    state: 'batonPass',
    trigger: { applied: 'camouflage' },
    target: 'allies',
    durationSeconds: 1,
  };

  it('reads it in timed effects and state grants', () => {
    const def = defOf(TORB, [marker(5), onApplied('attack', 1), grant]);
    expect(def.skills.skill1.effects[1]).toMatchObject({ trigger: { applied: 'camouflage' } });
    expect(def.skills.skill1.effects[2]).toMatchObject({ trigger: { applied: 'camouflage' } });
  });

  it('rejects a condition, a ranked target, an amplifier and a grant on its own state', () => {
    expect(() => defOf(TORB, [{ ...onApplied('attack', 1), condition: { inFullBurst: true } }])).toThrow(
      /cannot have a condition/,
    );
    expect(() => defOf(TORB, [{ ...onApplied('attack', 1), target: 'topAttack' }])).toThrow(
      /cannot target "topAttack"/,
    );
    const { ref: _, ...noRef } = onApplied('attack', 1);
    expect(() => defOf(TORB, [{ ...noRef, amplifies: { skill: 'skill2', percent: 100 } }])).toThrow(/cannot amplify/);
    expect(() => defOf(TORB, [{ ...grant, trigger: { applied: 'batonPass' } }])).toThrow(/its own state/);
  });

  it('does not chain inside a definition (timed and grants), but damage may look at a state granted on it', () => {
    const chained = { kind: 'timed', trigger: { applied: 'batonPass' }, target: 'self', stat: 'attack', ref: 1 };
    expect(() => defOf(TORB, [grant, { ...chained, durationSeconds: 1 }])).toThrow(/do not chain/);
    expect(() => defOf(TORB, [grant, { ...grant, state: 'followUp', trigger: { applied: 'batonPass' } }])).toThrow(
      /do not chain/,
    );
    const damage = { kind: 'damage', trigger: { applied: 'batonPass' }, ref: 1, damageType: 'additional' };
    expect(defOf(TORB, [grant, damage]).skills.skill1.effects[1]).toMatchObject({ kind: 'damage' });
  });

  it('keeps rejecting it outside damage, timed and grants', () => {
    const refill = { kind: 'ammoRefill', trigger: { applied: 'camouflage' }, target: 'self', ref: 2 };
    expect(() => defOf(TORB, [refill])).toThrow(/only allowed in damage, timed and state grants/);
  });

  it('lets a grant lasting 0 seconds hold nothing', () => {
    expect(defOf(TORB, [marker(5)]).skills.skill1.effects[0]).toMatchObject({ durationSeconds: 0 });
    const content = [{ stat: 'attack', ref: 1 }];
    expect(() => defOf(TORB, [{ ...marker(5), contents: content }])).toThrow(/holds nothing/);
    expect(() => defOf(TORB, [{ ...marker(5), maxStacks: 3 }])).toThrow(/holds nothing/);
    expect(() => defOf(TORB, [{ ...marker(5), undispellable: true }])).toThrow(/holds nothing/);
  });
});

describe('{ applied } の発火（timed・付与）', () => {
  it('fires on each record of the state on self, from the record frame (the frame after the shot)', () => {
    const plan = planTeamRun(teamOf([slotOf(TORB, defOf(TORB, [marker(5), onApplied('attack', 0.05)]))], false));
    const shots = plan.shots[0]!.frames;
    const records = shots.filter((_, k) => (k + 1) % 5 === 0).map((f) => f + 1);
    expect(appliedFrames(plan.history, 'camouflage', 0)).toEqual(records.filter((f) => f < plan.history.frames));
    // 維持 0 秒の付与は件を作らない
    expect(itemsOf(plan.history, { holder: 0, state: 'camouflage' })).toEqual([]);
    // 0.05 秒の窓は次の記録まで続かないので、件の始まりがそのまま発火のフレーム
    const items = itemsOf(plan.history, { holder: 0, kind: 'timed', stat: 'attack' });
    expect(items.map((i) => i.start)).toEqual(appliedFrames(plan.history, 'camouflage', 0));
  });

  it('fires once when two sources put the state on the same frame', () => {
    const atStart = {
      kind: 'state',
      state: 'camouflage',
      trigger: 'battleStart',
      target: 'allies',
      durationSeconds: 1,
    };
    const stack = {
      kind: 'state',
      state: 'batonPass',
      trigger: { applied: 'camouflage' },
      target: 'self',
      maxStacks: 5,
      durationUntil: 'battleEnd',
    };
    const plan = planTeamRun(
      teamOf([slotOf(TORB, defOf(TORB, [atStart, stack])), slotOf(RAPI, defOf(RAPI, [atStart]))], false),
    );
    expect(plan.history.applications.filter((a) => a.state === 'camouflage' && a.slotIndex === 0)).toHaveLength(2);
    expect(itemsOf(plan.history, { holder: 0, state: 'batonPass' }).map((i) => i.stack)).toEqual([1]);
  });

  it('fires at frame 0 on a static state', () => {
    const persona = {
      kind: 'state',
      state: 'persona',
      trigger: 'battleStart',
      target: 'self',
      durationUntil: 'battleEnd',
    };
    const onPersona = { ...onApplied('attack', 1), trigger: { applied: 'persona' } };
    const plan = planTeamRun(teamOf([slotOf(TORB, defOf(TORB, [persona, onPersona]))], false));
    expect(itemsOf(plan.history, { holder: 0, kind: 'timed', stat: 'attack' }).map((i) => i.start)).toEqual([0]);
  });

  it('does not chain across definitions, while damage still fires on the chained record', () => {
    const atStart = { kind: 'state', state: 'camouflage', trigger: 'battleStart', target: 'self', durationSeconds: 1 };
    const pass = {
      kind: 'state',
      state: 'batonPass',
      trigger: { applied: 'camouflage' },
      target: 'allies',
      durationSeconds: 1,
    };
    const onPass = { ...onApplied('attack', 1), trigger: { applied: 'batonPass' } };
    const plan = planTeamRun(
      teamOf([slotOf(TORB, defOf(TORB, [atStart, pass])), slotOf(RAPI, defOf(RAPI, [onPass]))], false),
    );
    expect(appliedFrames(plan.history, 'batonPass', 1)).toEqual([0]);
    expect(itemsOf(plan.history, { holder: 1, sourceSlotIndex: 1, kind: 'timed' })).toEqual([]);
  });

  it('puts the effect on the stage of the grants of the state (stage 1 is seen by a same-frame condition)', () => {
    const atStart = { kind: 'state', state: 'camouflage', trigger: 'battleStart', target: 'self', durationSeconds: 1 };
    const conditional = {
      kind: 'timed',
      trigger: 'battleStart',
      target: 'self',
      stat: 'critRate',
      ref: 1,
      durationSeconds: 1,
      condition: { selfBuffed: 'attack' },
    };
    const plan = planTeamRun(
      teamOf([slotOf(TORB, defOf(TORB, [atStart, onApplied('attack', 1), conditional]))], false),
    );
    const attack = plan.history.tracks.find((t) => t.origin.kind === 'timed' && t.origin.effect.stat === 'attack')!;
    expect(attack.stage).toBe(1);
    expect(itemsOf(plan.history, { holder: 0, kind: 'timed', stat: 'critRate' }).map((i) => i.start)).toEqual([0]);
    expect(plan.history.conditionSkips).toEqual([]);
    // 見る状態の付与が条件つき（段 1.5）なら、{ applied } の効果も段 1.5
    const late = { ...atStart, condition: { selfBuffed: 'critRate' } };
    const plan2 = planTeamRun(teamOf([slotOf(TORB, defOf(TORB, [late, onApplied('attack', 1)]))], false));
    const attack2 = plan2.history.tracks.find((t) => t.origin.kind === 'timed' && t.origin.effect.stat === 'attack')!;
    expect(attack2.stage).toBe(1.5);
  });

  it('counts the shots of the slot in calc only when the record came from its own shot count', () => {
    const byShots = planTeamRun(teamOf([slotOf(TORB, defOf(TORB, [marker(5), onApplied('attack', 1)]))], false));
    expect(hasOwnShotCountItem(byShots.history, 0)).toBe(true);
    const atStart = { ...marker(5), trigger: 'battleStart' };
    const once = planTeamRun(teamOf([slotOf(TORB, defOf(TORB, [atStart, onApplied('attack', 1)]))], false));
    expect(hasOwnShotCountItem(once.history, 0)).toBe(false);
  });
});

describe('トーブの宝物版 S1（代用弾丸・応急改造）', () => {
  const run = () => planTeamRun(teamOf([slotOf(TORB, undefined, 3), slotOf(330), slotOf(314)], true));

  it('refills ammo on every 10th normal shot and records Emergency-Crafted Bullets on the next frame, with no window', () => {
    const plan = run();
    const tenth = plan.shots[0]!.frames.filter((_, k) => (k + 1) % 10 === 0);
    const refills = plan.instants.filter((e) => e.slotIndex === 0 && e.effect.kind === 'ammoRefill');
    expect(refills.map((e) => e.frame)).toEqual(tenth);
    const records = tenth.map((f) => f + 1).filter((f) => f < plan.history.frames);
    expect(appliedFrames(plan.history, 'emergencyCraftedBullets', 0)).toEqual(records);
    expect(itemsOf(plan.history, { state: 'emergencyCraftedBullets' })).toEqual([]);
  });

  it('gives Temporary Modification (up to 3 stacks of max ammo +2) and critical damage up to all allies from the records', () => {
    const plan = run();
    const records = appliedFrames(plan.history, 'emergencyCraftedBullets', 0);
    for (const holder of [0, 1, 2]) {
      expect(appliedFrames(plan.history, 'temporaryModification', holder)).toEqual(records);
      const stacks = itemsOf(plan.history, { holder, state: 'temporaryModification' });
      expect(Math.max(...stacks.map((i) => i.stack!))).toBe(3);
      expect(stacks.every((i) => records.includes(i.start))).toBe(true);
      expect(stacks.find((i) => i.stack === 1)!.start).toBe(records[0]);
      const crit = itemsOf(plan.history, { holder, kind: 'timed', stat: 'critDamage' });
      expect(crit[0]!.start).toBe(records[0]);
      expect(crit.every((i) => records.includes(i.start))).toBe(true);
    }
    // 3 スタックが揃ったフレームの最大装弾数▲は 2 × 3 発
    const full = itemsOf(plan.history, { holder: 0, state: 'temporaryModification' }).find((i) => i.stack === 3)!;
    const ammo = valuePiecesOf(plan.history).filter(
      (p) => p.slotIndex === 0 && p.effect.stat === 'maxAmmo' && p.start <= full.start && full.start < p.end,
    );
    expect(ammo.reduce((sum, p) => sum + p.effect.value, 0)).toBe(6);
  });

  it('counts the shots of Torb in calc (the windows open on its own shot count)', () => {
    expect(hasOwnShotCountItem(run().history, 0)).toBe(true);
  });

  it('rounds each refill with the max ammo raised by the same shot (V-0435: 3, 3, 4, … and magazines of 94 and 110)', () => {
    // C-0558・C-0561: 30 発目の代用弾丸の 3 スタック目（f + 1 から）を入れた 66 × 5.31% = 3.50 → 4。発のフレームの 64 なら 3
    const plan = planTeamRun(teamOf([slotOf(TORB, undefined, 3)], false));
    const refills = plan.instants.filter((e) => e.slotIndex === 0 && e.effect.kind === 'ammoRefill');
    expect(refills.slice(0, 8).map((e) => e.amount)).toEqual([3, 3, 4, 4, 4, 4, 4, 4]);
    const log = plan.shots[0]!;
    const ends = log.lastShotFrames!.slice(0, 2).map((f) => log.frames.indexOf(f) + 1);
    expect([ends[0], ends[1]! - ends[0]!]).toEqual([94, 110]);
  });
});

const TEAMS: Record<string, TeamInput> = {
  'トーブ単騎（宝物の段階 3）': teamOf([slotOf(TORB, undefined, 3)], false, 0, 180),
  'トーブ（宝物の段階 3）+ クラウン + ソーダ：トゥインクルバニー': teamOf(
    [slotOf(TORB, undefined, 3), slotOf(330), slotOf(314)],
    true,
    0,
    180,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
