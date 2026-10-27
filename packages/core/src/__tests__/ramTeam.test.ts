// ラム（822）を含む編成: ダメージに効く効果は S1 の「フルバースト終了時、同じ部隊の味方がいれば自分のバーストスキルクールタイム▼」
// だけ（plan/design-ram-s1.md）。同じ部隊の味方がいない編成では起きない（C-0080。V-0026）。同じ部隊はゲーム内の部隊（C-0235。仮説）。
// 射撃の列のグループ分け。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { gameSecondsToFrames } from '../time.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const RAM = 822;
const REM = 820;
const EMILIA = 821;
// 録画 0047 の編成（ラム + デルタ + 紅蓮BS）と、ラムが唯一の I で III が 2 体の編成（S1 の CT 短縮を入れると周期が変わる編成）は、
// 同じ部隊の味方がいない。レム・エミリア（ラムと同じ部隊 CE003）を入れた編成では、フルバースト終了のたびにラムの CT が縮む
const TEAMS: Record<string, { input: TeamInput; ram: number; sameSquad: boolean }> = {
  '録画 0047 の編成（ラム + デルタ + 紅蓮BS）': {
    input: team([fixedSlot(RAM), fixedSlot(20), fixedSlot(225)], 2),
    ram: 0,
    sameSquad: false,
  },
  '実戦寄り（ラム + アドミ + クイーン（真）+ 紅蓮BS + ユニ）': {
    input: team([fixedSlot(RAM), fixedSlot(172), fixedSlot(870), fixedSlot(225), fixedSlot(160)], 3),
    ram: 0,
    sameSquad: false,
  },
  '同じ部隊（ラム + レム + 紅蓮BS）': {
    input: team([fixedSlot(RAM), fixedSlot(REM), fixedSlot(225)], 2),
    ram: 0,
    sameSquad: true,
  },
  '同じ部隊（レム + エミリア + デルタ + ラム）': {
    input: team([fixedSlot(REM), fixedSlot(EMILIA), fixedSlot(20), fixedSlot(RAM)], 1),
    ram: 3,
    sameSquad: true,
  },
};

describe('ラムの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${RAM}.json`));

  it('defines the burst cooldown cut of S1, conditioned on an ally from the same squad, and the barrier of the burst', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      {
        kind: 'cooldownReduction',
        trigger: 'fullBurstEnd',
        target: 'self',
        ref: 4,
        squad: { present: true },
        claims: ['C-0080', 'C-0235'],
      },
    ]);
    // 同じ部隊の読みは仮説（C-0235）なので、画面に「仮定」として出す
    expect(def.skills.skill1.effects[0]!.assumes?.ja).toContain('仮説');
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.effects).toEqual([]);
    // 2 段目の段 5（plan/design-skill-stage5.md 2.1 節）: バーストの味方全体のバリアは、中身の無いバリアの付与（読む側はアスカ S2 など）
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      {
        kind: 'state',
        state: 'barrier',
        trigger: 'burstUse',
        target: 'allies',
        durationRef: 2,
        claims: ['C-0253', 'C-0557'],
      },
    ]);
    expect(def.skills.burst.effects[0]).not.toHaveProperty('contents');
  });

  it('puts Rem and Emilia in the same squad as Ram', () => {
    expect(character(RAM).squad).toBe('CE003');
    expect(character(REM).squad).toBe('CE003');
    expect(character(EMILIA).squad).toBe('CE003');
    expect(character(20).squad).not.toBe('CE003');
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, ram, sameSquad }) => {
  const sim = runSimulation(input);
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it.runIf(!sameSquad)('does not cut the burst cooldown of Ram without an ally from the same squad (C-0080)', () => {
    expect(plan.instants.filter((e) => e.sourceSlotIndex === ram)).toEqual([]);
    expect(sim.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === ram)).toEqual([]);
  });

  it.runIf(sameSquad)('cuts the burst cooldown of Ram by 20.16 s at the end of every full burst (C-0235)', () => {
    const fromRam = plan.instants.filter((e) => e.sourceSlotIndex === ram);
    const ends = sim.schedule!.fullBurstWindows.map((w) => w.end).filter((end) => end < plan.frames);
    expect(fromRam.map((e) => e.frame)).toEqual(ends);
    expect(fromRam.every((e) => e.effect.kind === 'cooldownReduction')).toBe(true);
    const cuts = sim.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === ram);
    expect(cuts.map((r) => r.frame)).toEqual(ends);
    expect(cuts.every((r) => r.slotIndex === ram && r.frames === gameSecondsToFrames(20.16))).toBe(true);
    expect(cuts.some((r) => r.applied > 0)).toBe(true);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
