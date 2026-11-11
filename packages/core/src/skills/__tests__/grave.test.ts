// グレイブ編（plan/design-grave.md 2 節）: 状態の終わりのきっかけ（{ ended }）の残弾数減少・状態の付与、状態の付与のリロード完了での解除
// （durationUntil: "reloadEnd"）とほかの状態の終わりでの解除（{ stateEnd }）、自分の状態の間だけ数える回数（during: { state }）、
// リロード比率（reloadRatio）の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { firingParams, reloadChunkAmmo, ZERO_FIRING_BUFFS } from '../../frame/firing.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveStateContents, resolveStateGrants } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const GRAVE = 514;
const raw = rawDefinition<Raw>(GRAVE);
const character = characterOf(GRAVE);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const added = (slot: keyof Raw['skills'], effect: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects.push(effect);
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const AMMO = indexOf('skill1', (e) => e.kind === 'ammoDecrease');
const HEAT = indexOf('skill1', (e) => e.state === 'heatEmission');
const OVERHEAT1 = indexOf('skill2', (e) => e.state === 'overheatI');
const OVERHEAT2 = indexOf('skill2', (e) => e.state === 'overheatII');

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes { ended } on ammoDecrease and state grants for an own state only', () => {
    expect(patched('skill1', AMMO, { trigger: { ended: 'modeB' } })).toThrow(/needs a grant of the same state on self/);
    expect(patched('skill1', HEAT, { trigger: { ended: 'modeB' } })).toThrow(/needs a grant of the same state on self/);
    expect(patched('skill1', HEAT, { trigger: { ended: 'heatEmission' } })).toThrow(
      /cannot be triggered by its own state/,
    );
    expect(patched('skill1', AMMO, { trigger: { ended: 'prediction', count: 'normalHit' } })).toThrow(/unknown field/);
    expect(
      added('skill1', {
        kind: 'timed',
        trigger: { ended: 'prediction' },
        target: 'self',
        stat: 'attack',
        ref: 2,
        durationSeconds: 1,
      }),
    ).toThrow(/only allowed in counterChange, ammoDecrease and state grants/);
  });

  it('takes the reload end on a grant on self that does not stack', () => {
    expect(patched('skill2', OVERHEAT1, { target: 'allies' })).toThrow(
      /until the reload ends is only supported on "self"/,
    );
    expect(patched('skill2', OVERHEAT1, { maxStacks: 3 })).toThrow(/cannot stack/);
  });

  it('takes the end of another own state on a grant on self that does not stack', () => {
    expect(patched('skill2', OVERHEAT2, { target: 'allies' })).toThrow(/until another state ends is only on "self"/);
    expect(patched('skill2', OVERHEAT2, { maxStacks: 3 })).toThrow(/until another state ends cannot stack/);
    expect(patched('skill2', OVERHEAT2, { leadFrames: 2 })).toThrow(/cannot have delayFrames or leadFrames/);
    expect(patched('skill2', OVERHEAT2, { durationUntil: { stateEnd: 'overheatII' } })).toThrow(
      /cannot last until its own state ends/,
    );
    expect(patched('skill2', OVERHEAT2, { durationUntil: { stateEnd: 'modeB' } })).toThrow(
      /needs a grant of the same state on self/,
    );
  });

  it('takes a counting window of an own state only on state grants, without reset, with a plain selfState condition', () => {
    const during = { count: 'normalHit', everyRef: 3, during: { state: 'prediction' } };
    expect(patched('skill2', OVERHEAT2, { trigger: { ...during, reset: 'never' } })).toThrow(/write no reset/);
    expect(patched('skill2', OVERHEAT2, { trigger: { ...during, during: { state: 'modeB' } } })).toThrow(
      /needs a grant of the same state on self/,
    );
    expect(patched('skill2', OVERHEAT2, { condition: { selfState: { state: 'overheatI', stacks: 'full' } } })).toThrow(
      /can only have the condition selfState/,
    );
    expect(
      added('skill2', { kind: 'timed', trigger: during, target: 'self', stat: 'attack', ref: 2, durationSeconds: 1 }),
    ).toThrow(/only allowed in state grants/);
  });
});

describe('解決', () => {
  const definition = parseSkillDefinition(raw);
  const grants = resolveStateGrants(definition, character, MAX_SKILL_LEVELS);
  const grant = (state: string) => grants.find((g) => g.state === state)!;

  it('resolves the S1 ammo decrease and Heat Emission on the end of Prediction', () => {
    const ammo = resolveInstant(definition, character, MAX_SKILL_LEVELS).find((e) => e.kind === 'ammoDecrease');
    expect(ammo?.trigger).toEqual({ ended: 'prediction' });
    expect(ammo?.value).toBe(1);
    expect(grant('heatEmission').trigger).toEqual({ ended: 'prediction' });
    expect(grant('heatEmission').durationUntil).toBe('reloadEnd');
  });

  it('resolves Overheat II and III counted during Prediction, lasting until Prediction ends', () => {
    expect(grant('overheatI').durationUntil).toBe('reloadEnd');
    expect(grant('overheatII').trigger).toEqual({ count: 'normalHit', every: 30, during: { state: 'prediction' } });
    expect(grant('overheatIII').trigger).toEqual({ count: 'normalHit', every: 60, during: { state: 'prediction' } });
    expect(grant('overheatII').untilStateEnd).toBe('prediction');
    expect(grant('overheatIII').untilStateEnd).toBe('prediction');
  });

  it('halves the share of a split reload chunk with the reload ratio down 50%', () => {
    const heat = resolveStateContents(definition, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'reloadRatio');
    expect(heat?.value).toBe(-0.5);
    const shot = character.shot;
    expect(reloadChunkAmmo(60, firingParams(shot).reloadBullet)).toBe(30);
    const params = firingParams(shot, { ...ZERO_FIRING_BUFFS, reloadRatio: -0.5 });
    expect(reloadChunkAmmo(params.maxAmmo, params.reloadBullet)).toBe(15);
    // 分割リロードでない武器は変えない
    expect(firingParams({ ...shot, reloadBullet: 1 }, { ...ZERO_FIRING_BUFFS, reloadRatio: -0.5 }).reloadBullet).toBe(
      1,
    );
  });
});
