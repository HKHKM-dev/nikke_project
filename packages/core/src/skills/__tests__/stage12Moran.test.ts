// 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6・3.4 節）: cooldownReduction の発火の条件 condition（鍵は selfState だけ）。
// 使い手はモラン（281）の宝物版の S2「フルバーストタイムが発動した時、自分が熱血状態なら、味方全体にバーストスキルクールタイム X 秒▼」
// （V-0540。撮影 C: デルタ・I-DOLL・サン・モラン）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const withSkill2 = (...effects: unknown[]): unknown => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-29',
  skills: { skill1: none, skill2: { effects }, burst: none },
});
const cut = (fields: Record<string, unknown>) => ({
  kind: 'cooldownReduction',
  trigger: 'fullBurstStart',
  target: 'allies',
  ref: 10,
  ...fields,
});

describe('cooldownReduction の condition（定義の読み）', () => {
  it('takes { selfState } only', () => {
    const def = parseSkillDefinition(withSkill2(cut({ condition: { selfState: 'fervor' } })));
    expect(def.skills.skill2.effects[0]).toMatchObject({
      condition: { selfState: { state: 'fervor', present: true } },
    });
    expect(() => parseSkillDefinition(withSkill2(cut({ condition: { inFullBurst: true } })))).toThrow(
      /unknown field \(allowed: selfState\)/,
    );
  });

  it('is not open to the other instant effects', () => {
    const refill = { kind: 'ammoRefill', trigger: 'fullBurstStart', target: 'allies', ref: 1 };
    expect(() => parseSkillDefinition(withSkill2({ ...refill, condition: { selfState: 'fervor' } }))).toThrow(
      /condition: unknown field/,
    );
  });
});

describe('モランの宝物版の S2（熱血状態のフルバースト発動時のクールタイム▼。V-0540）', () => {
  const ids = [20, 308, 281] as const;
  const characters = ids.map((id) => readJson<CharacterData>(`../../../data/characters/${id}.json`));
  const definitions = ids.map((id) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`)));
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const run = (moran: SkillDefinition) => {
    const slots = characters.map((character, i): TeamSlotInput => {
      const fixed = computeFixedSpecAttack(character);
      return {
        character,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        hpOverride: computeFixedSpecHp(character),
        condition: { coreHitRate: 0.5, distanceBonus: true, fullCharge: true, hitRate: 1 },
        skills: {
          definition: i === 2 ? moran : definitions[i]!,
          levels: MAX_SKILL_LEVELS,
          treasurePhase: i === 2 ? 3 : 0,
        },
      };
    });
    const input: TeamInput = { slots, enemy, durationSeconds: 180, burst: true, controlledSlot: 2 };
    return runSimulation(input);
  };

  it('cuts the cooldown of every ally (self included) by 7.48 s at each Full Burst start while in Fervor', () => {
    const result = run(definitions[2]!);
    const windows = result.schedule!.fullBurstWindows;
    expect(windows.length).toBeGreaterThan(1);
    for (const w of windows) {
      const atStart = result.schedule!.cooldownReductions.filter((r) => r.frame === w.start);
      expect(atStart.map((r) => r.slotIndex).sort()).toEqual([0, 1, 2]);
      // 発動の直後なので、どの枠も CT は 7.48 秒より長く残っていて、まるごと縮む
      for (const r of atStart) expect(r.applied).toBe(gameSecondsToFrames(7.48));
    }
  });

  it('is dropped with the team when nobody can grant Fervor', () => {
    // 熱血の付与（宝物版の S1）を外すと、編成の段（skills/composition.ts の resolveSelfState）で効果ごと落ちる
    const noFervor = structuredClone(definitions[2]!);
    noFervor.treasureSkills!.skill1.effects = noFervor.treasureSkills!.skill1.effects.filter((e) => e.kind !== 'state');
    const result = run(noFervor);
    expect(result.schedule!.fullBurstWindows.length).toBeGreaterThan(0);
    expect(result.instants.filter((x) => x.effect.kind === 'cooldownReduction')).toEqual([]);
  });

  it('looks at the state at the firing frame, and records the skipped firing', () => {
    // 熱血を 1 回目のフルバーストの終わりから付ける（時間で変わる状態）。1 回目の始まりは条件を満たさず、2 回目からは縮む
    const late = structuredClone(definitions[2]!);
    for (const e of late.treasureSkills!.skill1.effects) if (e.kind === 'state') e.trigger = 'fullBurstEnd';
    const result = run(late);
    const starts = result.schedule!.fullBurstWindows.map((w) => w.start);
    const cutFrames = new Set(result.instants.filter((x) => x.effect.kind === 'cooldownReduction').map((x) => x.frame));
    expect([...cutFrames]).toEqual(starts.slice(1));
    const skipped = result.history.conditionSkips.filter(
      (s) => s.sourceSlotIndex === 2 && s.effect.source.skill === 'skill2',
    );
    expect(skipped.map((s) => s.frame)).toEqual(starts.slice(0, 1));
  });
});
