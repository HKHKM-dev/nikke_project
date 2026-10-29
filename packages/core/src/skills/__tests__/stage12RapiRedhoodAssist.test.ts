// 2 段目の段 12 の PR 3（plan/design-skill-stage12.md 2.5・3.3 節）: バースト段階の変更 burstStepChange と、cooldownReduction の
// 直書きの秒数 seconds。ラピ：レッドフード（16）の戦闘補助の側（録画 0731・0732。V-0541）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { burstStepOf, burstUnitOf } from '../../burst/dynamic.ts';
import { slotsByStep } from '../../burst/schedule.ts';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { buildTeamInput, validateObservations, type Observation } from '../../records/observations.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { applyComposition, burstStepInTeam, countsAsBurstStep } from '../composition.ts';
import { MAX_SKILL_LEVELS, resolveInstant } from '../resolve.ts';
import { burstStepChangeOf, parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const RAPI_RH = 16;
const DELTA = 20;
const SUN = 308;
const LITER = 82;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const raw = readJson<{ skills: Record<'skill1' | 'burst', { effects: Record<string, unknown>[] }> }>(
  `../../../data/skills/${RAPI_RH}.json`,
);
const def = parseSkillDefinition(raw);
const rapi = character(RAPI_RH);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

describe('語彙の検証', () => {
  const withEffects = (slot: 'skill1' | 'burst', ...effects: Record<string, unknown>[]) => {
    const copy = structuredClone(raw);
    copy.skills[slot].effects.push(...effects);
    return () => parseSkillDefinition(copy);
  };

  it('allows at most one burstStepChange per definition', () => {
    expect(withEffects('burst', { kind: 'burstStepChange', step: 'Step2' })).toThrow(
      /at most one burstStepChange effect per definition/,
    );
    expect(withEffects('burst', { kind: 'burstStepChange', step: 'StepFull' })).toThrow(/step/);
  });

  it('takes exactly one of ref and seconds on cooldownReduction', () => {
    const cut = { kind: 'cooldownReduction', trigger: 'burstUse', target: 'self' };
    expect(withEffects('burst', { ...cut, seconds: 20, ref: 1 })).toThrow(/exactly one of ref and seconds/);
    expect(withEffects('burst', { ...cut, seconds: 0 })).toThrow(/seconds: expected a positive finite number/);
    expect(withEffects('burst', cut)).toThrow(/ref: expected a positive integer/);
    // seconds は cooldownReduction だけ
    expect(withEffects('burst', { kind: 'ammoRefill', trigger: 'burstUse', target: 'self', seconds: 1 })).toThrow(
      /seconds: unknown field/,
    );
  });

  it('marks the effects on each side of the named step change', () => {
    const side = (slot: 'skill1' | 'burst') => def.skills[slot].effects.map((e) => e.burstStepMode?.changed);
    // S1: 戦闘補助でない時の攻撃力▲・段の変更自身（印なし）・戦闘補助の時の 2 つ
    expect(side('skill1')).toEqual([false, undefined, true, true]);
    // バースト: III の 3 つ（戦闘補助でない時）・I の 2 つ（戦闘補助）
    expect(side('burst')).toEqual([false, false, false, true, true]);
    expect(def.skills.burst.effects[3]!.burstStepMode?.name.ja).toBe('戦闘補助');
  });
});

describe('バースト段階の変更（戦闘補助）', () => {
  const assist = [character(DELTA), character(SUN), rapi];
  const withI = [character(LITER), character(DELTA), rapi];

  it('changes her burst stage to I only without an ally of base burst stage I', () => {
    const composed = applyComposition(def, assist, 2);
    expect(burstStepChangeOf(composed)).toBe('Step1');
    expect(burstStepOf(rapi, composed)).toBe('Step1');
    // I の後は段の順のまま II（基本の III の StepFull ではない）
    expect(burstUnitOf(rapi, composed)).toMatchObject({ burstStep: 'Step1', nextStep: 'NextStep' });
    expect(burstStepInTeam(rapi, def, assist, 2)).toBe('Step1');

    const normal = applyComposition(def, withI, 2);
    expect(burstStepChangeOf(normal)).toBeNull();
    expect(burstUnitOf(rapi, normal)).toMatchObject({ burstStep: 'Step3', nextStep: 'StepFull' });
    expect(burstStepInTeam(rapi, def, withI, 2)).toBe('Step3');
    // 「基本バースト段階」は差し替える前の段のまま
    expect(countsAsBurstStep(rapi, 'Step3')).toBe(true);
  });

  it('resolves the burst I cooldown reduction from the written seconds', () => {
    const cuts = resolveInstant(applyComposition(def, assist, 2), rapi, MAX_SKILL_LEVELS).filter(
      (e) => e.kind === 'cooldownReduction',
    );
    expect(cuts.map((e) => [e.trigger, e.target, e.value])).toEqual([
      ['fullBurstStart', 'allies', 7.48],
      ['burstUse', 'self', 20],
    ]);
  });

  it('chains I → II → III with her I, and shortens her own cooldown by 20 s on the same frame', () => {
    const input: TeamInput = {
      slots: [slotOf(DELTA), slotOf(SUN), slotOf(RAPI_RH)],
      enemy,
      durationSeconds: 180,
      burst: true,
    };
    const schedule = runSimulation(input).schedule!;
    expect(slotsByStep(schedule)).toEqual({ Step1: [2], Step2: [0], Step3: [1] });
    const first = schedule.activations[0]!;
    expect(first).toMatchObject({ slotIndex: 2, step: 'Step1' });
    expect(
      schedule.cooldownReductions.find((c) => c.frame === first.frame && c.slotIndex === 2 && c.sourceSlotIndex === 2),
    ).toMatchObject({ frames: gameSecondsToFrames(20), applied: gameSecondsToFrames(20) });
  });
});

describe('比べる設定の noFireSlots（撃たなかった枠）', () => {
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const data = loadRecordsData(file);
  const setup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true };

  it('sets the bullet hit rate of the slot to 0, so it deals no damage', () => {
    const input = buildTeamInput(recordings.get('0731')!, { ...setup, noFireSlots: [3] }, data);
    expect(input.slots[2]!.condition?.hitRate).toBe(0);
    expect(input.slots[0]!.condition?.hitRate).toBe(1);
    expect(runSimulation(input).slots[2]!.normalDamage).toBe(0);
  });

  it('rejects a slot outside the team and the auto condition', () => {
    const observation = (extra: Record<string, unknown>): Observation =>
      ({
        id: '0731-99',
        recording: '0731',
        kind: 'count',
        use: 'compare',
        value: 0,
        description: 'test',
        source: 'V-0541',
        readAt: '2026-10-29',
        compare: {
          model: 'sim',
          metric: 'fullBurstCount',
          args: {},
          tolerance: { abs: 0 },
          setup: { ...setup, ...extra },
        },
      }) as Observation;
    const errorsOf = (extra: Record<string, unknown>) =>
      validateObservations([observation(extra)], recordings, data.enemies).filter((e) => e.includes('noFireSlots'));
    expect(errorsOf({ noFireSlots: [4] })).toEqual([expect.stringMatching(/noFireSlots の枠 4 が編成の外/)]);
    expect(errorsOf({ noFireSlots: [3], condition: 'auto' })).toEqual([
      expect.stringMatching(/noFireSlots は condition が auto のときには書かない/),
    ]);
    expect(errorsOf({ noFireSlots: [3] })).toEqual([]);
  });
});
