// エマ：TU（93）の S1 の環境コントロール（敵全体の受けるダメージ▲。戦闘開始時と、そこから 30 秒ごと。C-0305）と、
// S2 のフォーメーションAS の再発動周期 20 秒▼（編成にウンファ：TU がいれば 10 秒ごと。C-0306）。窓の時刻と、射撃の列のグループ分け。
// F5（plan/design-heal-vocabulary.md 3.1・3.3 節）: S1 の持続回復は、付いた時に 1 回だけ回復を起こす（C-0578。仮説）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrame, gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

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

function team(slots: TeamSlotInput[], controlledSlot: number, burst = true): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

const EMMA = 93;
const EUNHWA = 95;
const ASUKA = 830;

/** エマの環境コントロールの受けるダメージ▲の窓（枠 0 に付いた分） */
function environmentWindows(input: TeamInput) {
  return piecesOf(planTeamRun(input)).filter(
    (w) => w.slotIndex === 0 && w.effect.source.resourceId === EMMA && w.effect.stat === 'damageTaken',
  );
}

describe('環境コントロールの窓', () => {
  it('opens at battle start and every 30 s after, for 10 s each, without Eunhwa: TU (録画 0226 の編成。C-0305)', () => {
    const windows = environmentWindows(team([fixedSlot(EMMA)], 0, false));
    expect(windows.map((w) => w.start)).toEqual(
      // 30 秒ごとの周期は発動のたびに数え直す（k × ceil(30 ÷ 0.017)。C-0502）
      [0, 1, 2, 3, 4, 5].map((k) => k * gameSecondsToFirstFrame(30)),
    );
    for (const w of windows) {
      expect(w.end - w.start).toBe(gameSecondsToFrame(10));
      expect(w.effect.value).toBeCloseTo(0.039, 10);
    }
  });

  it('opens every 10 s with Eunhwa: TU, so it covers the whole battle but for rounding gaps of 1 frame (録画 0227 の編成。C-0306)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(EUNHWA)], 0, false);
    const windows = environmentWindows(input);
    expect(windows[0]!.start).toBe(0);
    expect(windows.at(-1)!.end).toBeGreaterThanOrEqual(planTeamRun(input).frames - 1);
    for (let i = 1; i < windows.length; i++) expect(windows[i]!.start - windows[i - 1]!.end).toBeLessThanOrEqual(1);
  });
});

describe('環境コントロールの持続回復（C-0578）', () => {
  const period = gameSecondsToFirstFrame(30);

  it('heals every ally once per application, at battle start and every 30 s after, not on each 1-second tick', () => {
    const plan = planTeamRun(team([fixedSlot(EMMA), fixedSlot(ASUKA)], 1, false));
    const expected = [0, 1, 2, 3, 4, 5].map((k) => k * period);
    for (const slot of [0, 1]) {
      const heals = plan.history.heals.filter((h) => h.slotIndex === slot);
      expect(heals.map((h) => h.frame)).toEqual(expected);
      expect(heals.every((h) => h.sourceSlotIndex === 0)).toBe(true);
    }
  });

  it('heals every 10 s with Eunhwa: TU', () => {
    const plan = planTeamRun(team([fixedSlot(EMMA), fixedSlot(EUNHWA)], 0, false));
    const frames = plan.history.heals.filter((h) => h.slotIndex === 0).map((h) => h.frame);
    expect(frames.slice(0, 3)).toEqual([0, 1, 2].map((k) => k * gameSecondsToFirstFrame(10)));
  });

  it("opens Asuka's S1 on each heal for 25 s, leaving a gap before the next application (F5 の D-a)", () => {
    const plan = planTeamRun(team([fixedSlot(EMMA), fixedSlot(ASUKA)], 1, false));
    const s1 = piecesOf(plan).filter(
      (w) => w.slotIndex === 1 && w.effect.source.resourceId === ASUKA && w.effect.source.skill === 'skill1',
    );
    expect(s1.map((w) => w.start)).toEqual([0, 1, 2, 3, 4, 5].map((k) => k * period));
    for (const w of s1.slice(0, -1)) expect(w.end - w.start).toBe(gameSecondsToFrames(25));
  });
});

const TEAMS: Record<string, TeamInput> = {
  '録画 0226 の編成（エマ：TU 単騎・バーストなし）': team([fixedSlot(EMMA)], 0, false),
  '録画 0227 の編成（エマ：TU + ウンファ：TU・バーストなし）': team([fixedSlot(EMMA), fixedSlot(EUNHWA)], 0, false),
  'F5 の編成（エマ：TU + アスカ・バーストなし）': team([fixedSlot(EMMA), fixedSlot(ASUKA)], 1, false),
  '実戦寄り（エマ：TU + ウンファ：TU + クラウン + アリス + リター）': team(
    [fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(330), fixedSlot(191), fixedSlot(82)],
    3,
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
