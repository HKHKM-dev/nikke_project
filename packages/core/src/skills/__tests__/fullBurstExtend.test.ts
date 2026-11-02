// 2 段目の段 21 の PR 1（plan/design-skill-stage21.md 2.1・2.2 節）: フルバーストタイムの延長（fullBurstExtend）。窓の外の発火は次の窓に
// 予約し、窓を作る時に burst_duration の秒に足す。使い手はソーダ：トゥインクルバニー（314）の S2 の時間延長 I・II（C-0877）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const SODA = 314;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const rawOf = (id: number) => readJson<Record<string, unknown>>(`../../../data/skills/${id}.json`);

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
function withSkill2(...effects: unknown[]): unknown {
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-01',
    skills: { skill1: none, skill2: { effects }, burst: none },
  };
}
const extend = { kind: 'fullBurstExtend', trigger: 'burstStage3Enter', target: 'allies', ref: 2 };

describe('fullBurstExtend の検証', () => {
  it('きっかけはバースト 3 段階突入時かバースト使用時だけ、対象は味方全体だけ、条件は selfState だけ', () => {
    expect(() => parseSkillDefinition(withSkill2(extend))).not.toThrow();
    expect(() => parseSkillDefinition(withSkill2({ ...extend, trigger: 'burstUse' }))).not.toThrow();
    expect(() => parseSkillDefinition(withSkill2({ ...extend, trigger: 'fullBurstStart' }))).toThrow(
      /fullBurstExtend needs the trigger/,
    );
    expect(() => parseSkillDefinition(withSkill2({ ...extend, target: 'self' }))).toThrow(
      /fullBurstExtend must target "allies"/,
    );
    expect(() =>
      parseSkillDefinition(withSkill2({ ...extend, condition: { selfState: { state: 'goldenChip', stacksRef: 1 } } })),
    ).not.toThrow();
    expect(() => parseSkillDefinition(withSkill2({ ...extend, condition: { inFullBurst: true } }))).toThrow();
  });

  it('延長の秒は % にせず秒のまま解く', () => {
    const def = parseSkillDefinition(rawOf(SODA));
    const extensions = resolveInstant(def, character(SODA), MAX_SKILL_LEVELS).filter(
      (e) => e.kind === 'fullBurstExtend',
    );
    expect(extensions.map((e) => e.value)).toEqual([2, 3]);
  });
});

describe('ソーダ：トゥインクルバニーの時間延長（ラム + デルタ + ソーダ：TB）', () => {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  function slot(id: number, raw?: unknown, c = character(id)): TeamSlotInput {
    const fixed = computeFixedSpecAttack(c);
    return {
      character: c,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
      skills: { definition: parseSkillDefinition(raw ?? rawOf(id)), levels: MAX_SKILL_LEVELS },
    };
  }
  const team = (soda?: unknown): TeamInput => ({
    slots: [slot(822), slot(20), slot(SODA, soda)],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  });
  const lengths = (input: TeamInput) => planTeamRun(input).schedule!.fullBurstWindows.map((w) => w.end - w.start);

  it('ゴールデンチップの段で窓が延び（I と II は 2 + 3 秒、I は 2 秒）、延長の無い定義ではどの窓も 10 秒', () => {
    const extended = lengths(team()).slice(0, 5);
    expect(extended).toEqual([15, 15, 15, 12, 10].map(gameSecondsToFrames));
    const raw = structuredClone(rawOf(SODA)) as { skills: { skill2: { effects: { kind: string }[] } } };
    raw.skills.skill2.effects = raw.skills.skill2.effects.filter((e) => e.kind !== 'fullBurstExtend');
    expect(lengths(team(raw)).slice(0, 5)).toEqual(Array(5).fill(gameSecondsToFrames(10)));
  });

  // 3 段階に入ってもソーダの CT が明けずにチェーンが切れると、状態機械は予約を捨てる（burst/controller.ts の resetChain）。捨てた延長は
  // 即時効果の記録（画面と trace）に残さない
  it('窓を作らずにチェーンが切れて捨てた延長は、即時効果の記録に残さない', () => {
    const slow = character(SODA);
    slow.burstSkill = { ...slow.burstSkill!, cooldownSeconds: 100 };
    const input: TeamInput = { ...team(), slots: [slot(822), slot(20), slot(SODA, undefined, slow)] };
    const plan = planTeamRun(input);
    const { activations, chainTimeouts, fullBurstWindows } = plan.schedule!;
    // 3 段階に入った（II を撃った）チェーンが、窓を作らずに切れている
    const stage3Entries = activations.filter((a) => a.enteredStep === 'Step3').map((a) => a.frame);
    const discarded = stage3Entries.filter((f) => {
      const timeout = chainTimeouts.find((t) => t > f);
      const window = fullBurstWindows.find((w) => w.start > f);
      return timeout !== undefined && (window === undefined || timeout < window.start);
    });
    expect(discarded.length).toBeGreaterThan(0);
    // 残った延長はどれも窓に足され、窓の長さは足した秒と合う
    const extensions = plan.instants.filter((x) => x.effect.kind === 'fullBurstExtend');
    expect(extensions.length).toBeGreaterThan(0);
    for (const w of fullBurstWindows) {
      const previous = fullBurstWindows.filter((v) => v.start < w.start).at(-1)?.start ?? -1;
      const seconds = extensions
        .filter((x) => x.frame > previous && x.frame <= w.start)
        .reduce((sum, x) => sum + x.amount, 0);
      if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10 + seconds));
    }
    for (const x of extensions) {
      const window = fullBurstWindows.find((w) => w.start >= x.frame);
      const timeout = chainTimeouts.find((t) => t >= x.frame);
      expect(window).toBeDefined();
      expect(timeout === undefined || window!.start < timeout).toBe(true);
    }
  });
});
