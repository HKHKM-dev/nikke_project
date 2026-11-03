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
import { itemsOf } from '../holders.ts';
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

  // 3 段階に入って延長を予約した後、ソーダが III を撃つ前に戦闘が終わると、予約は窓に足されないまま残る。その延長も即時効果の記録
  // （画面と trace）に残さない（frame/firstPass.ts の戦闘の終わりの pendingExtensions）
  it('戦闘の終わりまで窓に足されずに残った延長は、即時効果の記録に残さない', () => {
    const full = planTeamRun(team());
    const reserved = full.instants.find((x) => x.effect.kind === 'fullBurstExtend')!.frame;
    const firstWindow = full.schedule!.fullBurstWindows[0]!.start;
    // 予約（3 段階突入）と最初の窓の間で終わる戦闘
    const short = planTeamRun({ ...team(), durationSeconds: 6.6 });
    expect(reserved).toBeLessThan(short.frames);
    expect(short.frames).toBeLessThan(firstWindow);
    expect(short.schedule!.activations.map((a) => a.enteredStep)).toEqual(['Step2', 'Step3']);
    expect(short.schedule!.fullBurstWindows).toEqual([]);
    expect(short.instants.filter((x) => x.effect.kind === 'fullBurstExtend')).toEqual([]);
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

  // 2 段目の段 21（C-0886）: D（40）のバースト使用時の延長。条件（自分が気絶免疫）は発動のフレームで見て（1 パス目の
  // extensionAtActivation）、その発動が作る窓に足す。リター I・デルタ II・D III（操作）
  describe('D のバースト使用時の延長（リター + デルタ + D）', () => {
    const D = 40;
    const plan = planTeamRun({ ...team(), slots: [slot(82), slot(20), slot(D)] });
    const schedule = plan.schedule!;
    const extension = resolveInstant(parseSkillDefinition(rawOf(D)), character(D), MAX_SKILL_LEVELS).find(
      (e) => e.kind === 'fullBurstExtend',
    )!.value;
    const immunity = itemsOf(plan.history, { holder: 2, state: 'stunImmunity' });
    const activations = schedule.activations.filter((a) => a.slotIndex === 2).map((a) => a.frame);

    it('extends only the windows of the activations in Stun Immunity', () => {
      // 気絶免疫は戦闘開始時に付く 1 件。1 回目の発動はその中、2 回目からは切れた後
      expect(immunity).toHaveLength(1);
      const inImmunity = activations.map((f) => immunity[0]!.start <= f && f < immunity[0]!.end);
      expect(inImmunity.slice(0, 4)).toEqual([true, false, false, false]);
      // 窓はどれも D の発動が作る。戦闘の終わりで切れる最後の窓のほかは、条件が立った発動の窓だけ 10 + 延長の秒
      const windows = schedule.fullBurstWindows.slice(0, -1);
      expect(windows.length).toBeGreaterThanOrEqual(4);
      expect(windows.map((w) => w.end - w.start)).toEqual(
        windows.map((_, k) => gameSecondsToFrames(10 + (inImmunity[k]! ? extension : 0))),
      );
    });

    it('records the extension as an instant on the activation frame only while the condition holds', () => {
      const instants = plan.instants.filter((x) => x.effect.kind === 'fullBurstExtend');
      expect(instants.map((x) => [x.frame, x.amount])).toEqual([[activations[0], extension]]);
    });
  });
});
