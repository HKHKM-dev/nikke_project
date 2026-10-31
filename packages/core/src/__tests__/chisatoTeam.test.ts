// 千束（860）を含む編成（2 段目の段 16 の PR 1。plan/design-skill-stage16.md 2.1 節。V-0584）。
// S1: 超感覚（カウンタ）は戦闘開始時に 100、2 秒ごとに 1 減り、バースト使用時に 100 に戻る。攻撃力▲（70 以上）・防御力無視ダメージ▲
// （55 以上）・命中率▲（25 以上）は、閾値ごとに別々に付く（C-0797・C-0800）。
// S2: バースト使用から 10 秒の通常攻撃の変更（C-0799）と、通常攻撃 48 回命中ごとの防御力無視ダメージ（C-0798）。
// バースト: 超感覚 100 チャージと攻撃力▲（10 秒。C-0799）。射撃の列のグループ分け。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const CHISATO = 860;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = { character: c, growth: fixed.growth, attackOverride: fixed.attack, condition: MANUAL };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number, burst: boolean): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

/** 枠が受ける、千束のスロットと stat で絞った効果の窓（[始まり, 終わり) のフレーム。続いた小片は 1 つにまとめる） */
function windows(plan: ReturnType<typeof planTeamRun>, slot: number, skill: string, stat: string) {
  const pieces = slotPieces(plan, slot)
    .filter((p) => p.effect.source.resourceId === CHISATO && p.effect.source.skill === skill && p.effect.stat === stat)
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const p of pieces) {
    const last = out.at(-1);
    if (last !== undefined && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else out.push({ start: p.start, end: p.end });
  }
  return out;
}

describe('千束の定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${CHISATO}.json`));

  it('defines every damage-relevant line of S1, S2 and the burst', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.skill1.effects[1]).toMatchObject({
      kind: 'counterChange',
      counter: 'extrasensory',
      trigger: { everySeconds: 2, carry: true },
      decrease: true,
    });
    expect(def.skills.skill2.effects[1]).toMatchObject({ kind: 'damage', damageType: 'true', ref: 3 });
  });
});

describe('千束単騎（バーストなし）', () => {
  const plan = planTeamRun(team([fixedSlot(CHISATO)], 0, false));

  // 超感覚は 100 から 2 秒ごとに 1 減る。31 回目（62 秒）で 70 未満、46 回目（92 秒）で 55 未満
  it.each([
    ['attack', 62],
    ['trueDamage', 92],
  ])('keeps the S1 %s from the start until about %i s', (stat, seconds) => {
    const w = windows(plan, 0, 'skill1', stat);
    expect(w).toHaveLength(1);
    expect(w[0]!.start).toBe(0);
    expect(Math.abs(w[0]!.end * 0.017 - seconds)).toBeLessThan(0.05);
  });
});

describe('リター + デルタ + 千束', () => {
  const plan = planTeamRun(team([fixedSlot(82), fixedSlot(20), fixedSlot(CHISATO)], 2, true));
  const activations = (plan.schedule?.activations ?? []).filter((a) => a.slotIndex === 2);

  it('keeps the S1 ATK and true damage up for the whole battle (the burst charges Extrasensory back to 100)', () => {
    expect(activations.length).toBeGreaterThan(2);
    for (const stat of ['attack', 'trueDamage']) {
      const w = windows(plan, 2, 'skill1', stat);
      expect(w).toHaveLength(1);
      expect(w[0]!.end).toBeGreaterThanOrEqual(10_589);
    }
  });

  it('converts normal attacks and adds the burst ATK for 10 s from every burst use', () => {
    const conversion = windows(plan, 2, 'skill2', 'trueDamageConversion');
    const attack = windows(plan, 2, 'burst', 'attack');
    expect(conversion).toHaveLength(activations.length);
    expect(attack).toEqual(conversion);
    // 最後の窓は戦闘の終わり（10,589）で切れることがある
    for (const w of conversion) expect(w.end === 10_589 || w.end - w.start === 588).toBe(true);
  });
});

const TEAMS: Record<string, TeamInput> = {
  単騎: team([fixedSlot(CHISATO)], 0, false),
  'リター + デルタ + 千束': team([fixedSlot(82), fixedSlot(20), fixedSlot(CHISATO)], 2, true),
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
