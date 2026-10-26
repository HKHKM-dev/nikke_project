// 2 段目の段 10 の PR 3（plan/design-skill-stage10.md 3.3 節）: トーブ（192・宝物の段階 3）のバースト（その場しのぎの奇跡）。
// 自分の状態のスタック数を付与のスタック数にする stacksFrom: { state }（応急改造スタックコピー）。録画 0676〜0678（V-0523）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TOOB = 192;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number, definition: SkillDefinition, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition, levels: MAX_SKILL_LEVELS, treasurePhase },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

/** 録画 0676・0677 と同じ編成（1 枠目トーブ・2 枠目ソルジャーF.A.（SG）・3 枠目 I-DOLL・サン（操作）） */
function run(toob: SkillDefinition = definitionOf(TOOB)) {
  const input: TeamInput = {
    slots: [fixedSlot(TOOB, toob, 3), fixedSlot(301, definitionOf(301)), fixedSlot(308, definitionOf(308))],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  };
  const plan = planTeamRun(input);
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === 0).map(effectFrameOf);
  return { plan, bursts };
}

const stacksAt = (items: { start: number; end: number; stack?: number }[], frame: number) =>
  Math.max(0, ...items.filter((i) => i.start <= frame && frame < i.end).map((i) => i.stack ?? 1));

describe('トーブ（宝物版）のバースト（その場しのぎの奇跡）', () => {
  it('grants all allies (and the SG ally twice) the Temporary Modification stack count for 15 s from the Burst', () => {
    const { plan, bursts } = run();
    expect(bursts.length).toBeGreaterThanOrEqual(8);
    const length = gameSecondsToFrames(15);
    for (const holder of [0, 1, 2]) {
      const items = itemsOf(plan.history, { holder, state: 'miracleOfMakeshifts' });
      for (const b of bursts.slice(0, 8)) {
        expect(stacksAt(items, b)).toBe(3);
        expect(stacksAt(items, b + length - 1)).toBe(3);
        expect(stacksAt(items, b + length)).toBe(0);
      }
      // ショットガンの味方（ソルジャーF.A.）にだけ、2 つ目の効果が重なる
      const sg = itemsOf(plan.history, { holder, state: 'miracleOfMakeshiftsShotgun' });
      expect(sg.length > 0).toBe(holder === 1);
    }
  });

  it('keeps the copied count after Temporary Modification ends, and grants nothing at 0 stacks', () => {
    // 応急改造を戦闘開始時に 3 スタック・12 秒だけ付ける形にする（1 回目のバーストの窓の途中で切れ、2 回目は 0 スタック）
    const def = readJson<{ treasureSkills: Record<string, { effects: Record<string, unknown>[] }> }>(
      '../../data/skills/192.json',
    );
    const copy = structuredClone(def);
    copy.treasureSkills.skill1!.effects = [
      {
        kind: 'state',
        state: 'temporaryModification',
        trigger: 'battleStart',
        target: 'self',
        maxStacks: 3,
        durationSeconds: 12,
        contents: [{ stat: 'maxAmmo', scaling: 'flat', ref: 3 }],
      },
      { kind: 'stackChange', state: 'temporaryModification', trigger: 'battleStart', target: 'self', amount: 2 },
    ];
    const { plan, bursts } = run(parseSkillDefinition(copy));
    const tm = itemsOf(plan.history, { holder: 0, state: 'temporaryModification' });
    const end = gameSecondsToFrames(12);
    expect(stacksAt(tm, end - 1)).toBe(3);
    expect(stacksAt(tm, end)).toBe(0);
    const [first, second] = bursts as [number, number];
    expect(first).toBeLessThan(end);
    const length = gameSecondsToFrames(15);
    expect(first + length).toBeGreaterThan(end);
    const items = itemsOf(plan.history, { holder: 2, state: 'miracleOfMakeshifts' });
    expect(stacksAt(items, end + 10)).toBe(3);
    expect(stacksAt(items, second + 10)).toBe(0);
  });

  it('rejects malformed stacksFrom', () => {
    const def = readJson<{ treasureSkills: Record<string, { effects: Record<string, unknown>[] }> }>(
      '../../data/skills/192.json',
    );
    const withEffect = (patch: Record<string, unknown>) => {
      const copy = structuredClone(def);
      copy.treasureSkills.burst!.effects[0] = { ...copy.treasureSkills.burst!.effects[0], ...patch };
      return () => parseSkillDefinition(copy);
    };
    expect(withEffect({})).not.toThrow();
    expect(withEffect({ maxStacks: undefined })).toThrow(/stacksFrom \{ state \} needs maxStacks/);
    expect(withEffect({ stacksFrom: { state: 'miracleOfMakeshifts' } })).toThrow(/cannot count its own stacks/);
    expect(withEffect({ stacksFrom: { state: 'temporaryModification', counter: 'firepowerGauge' } })).toThrow(
      /expected \{ counter \} or \{ state \}/,
    );
    expect(withEffect({ stacksFrom: { state: 'hacked' } })).toThrow(/state/);
  });
});
