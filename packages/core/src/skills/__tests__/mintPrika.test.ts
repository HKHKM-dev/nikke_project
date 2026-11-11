// ミント・プリカ編（plan/design-mint-prika.md 2 節）: 足した語彙（自分の状態の消去・切り替えの組・{ applied } の条件・対象 appliedCaster・
// 状態の維持の延長・CT▲・回復の条件）の読み込みの検証と、Lv ごとの解決値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveRemoveStates, resolveStateExtends } from '../resolve.ts';
import { namedStateGroup } from '../states.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const mintRaw = readJson<Raw>('../../../data/skills/600.json');
const prikaRaw = readJson<Raw>('../../../data/skills/601.json');
const mint = readJson<CharacterData>('../../../data/characters/600.json');
const prika = readJson<CharacterData>('../../../data/characters/601.json');

const patched = (raw: Raw, slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  const effect = { ...copy.skills[slot].effects[index], ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete effect[k];
  copy.skills[slot].effects[index] = effect;
  return () => parseSkillDefinition(copy);
};

describe('読み込み', () => {
  it('accepts both definitions', () => {
    expect(() => parseSkillDefinition(mintRaw)).not.toThrow();
    expect(() => parseSkillDefinition(prikaRaw)).not.toThrow();
  });

  it('puts the two Assigned Parts in one switching group', () => {
    expect(namedStateGroup('assignedPartSinging')).toBe('assignedPart');
    expect(namedStateGroup('assignedPartDancing')).toBe('assignedPart');
    expect(namedStateGroup('singAlong')).toBeUndefined();
  });

  it('cancels an ally state only on self, with removeState-like conditions', () => {
    expect(patched(mintRaw, 'skill2', 0, { target: 'allies', condition: undefined })).toThrow(
      /expected "enemy" or "self"/,
    );
    expect(patched(mintRaw, 'skill2', 0, { condition: { enemyState: 'hacked' } })).toThrow(/enemyState/);
  });

  it('allows only selfState on an applied trigger, and appliedCaster only with it', () => {
    expect(patched(prikaRaw, 'skill2', 3, { condition: { inFullBurst: true } })).toThrow(/inFullBurst/);
    expect(patched(prikaRaw, 'skill2', 1, { trigger: 'burstUse' })).toThrow(/appliedCaster is only allowed with/);
    expect(patched(mintRaw, 'burst', 2, { target: 'appliedCaster' })).toThrow(/appliedCaster is only allowed with/);
  });

  it('checks the state extension', () => {
    expect(patched(prikaRaw, 'skill2', 2, { target: 'enemy' })).toThrow(/target/);
    expect(patched(prikaRaw, 'skill2', 2, { trigger: { applied: 'performance' } })).toThrow(/its own state/);
    expect(patched(prikaRaw, 'skill2', 2, { secondsRef: undefined })).toThrow(/secondsRef/);
    expect(patched(prikaRaw, 'skill2', 2, { condition: { usedBurst: true } })).toThrow(/usedBurst/);
  });

  it('takes the cooldown increase, and an applied trigger only on self', () => {
    expect(patched(prikaRaw, 'skill2', 4, { increase: 1 })).toThrow(/must be true/);
    expect(patched(prikaRaw, 'skill2', 4, { target: 'allies' })).toThrow(/must target "self"/);
    const refill = { kind: 'ammoRefill', trigger: { applied: 'singAlong' }, target: 'self', ref: 1 };
    expect(patched(prikaRaw, 'skill2', 4, { ...refill, increase: undefined, condition: undefined })).toThrow(
      /only allowed in damage, timed and state grants/,
    );
  });

  it('takes a selfState condition on heal only', () => {
    expect(patched(mintRaw, 'skill1', 2, { condition: { inFullBurst: true } })).toThrow(/inFullBurst/);
    const refill = {
      kind: 'ammoRefill',
      trigger: 'burstUse',
      target: 'self',
      ref: 1,
      condition: { selfState: 'singAlong' },
    };
    expect(patched(mintRaw, 'burst', 2, refill)).toThrow(/unknown field/);
  });
});

describe('Lv ごとの解決値', () => {
  const levels = MAX_SKILL_LEVELS;
  it('resolves the cancels, the extension and the cooldown increase', () => {
    const mintDef = parseSkillDefinition(mintRaw);
    const prikaDef = parseSkillDefinition(prikaRaw);
    expect(resolveRemoveStates(mintDef, mint, levels).map((r) => [r.state, r.cancel])).toEqual([
      ['assignedPartSinging', true],
      ['assignedPartDancing', true],
    ]);
    expect(resolveStateExtends(prikaDef, prika, levels)).toMatchObject([
      { state: 'performance', target: 'allies', frames: gameSecondsToFrames(21) },
    ]);
    const up = resolveInstant(prikaDef, prika, levels).find((e) => e.kind === 'cooldownReduction')!;
    expect(up).toMatchObject({ increase: true, value: 21, target: 'self' });
    const heal = resolveInstant(mintDef, mint, levels).find((e) => e.kind === 'heal')!;
    expect(heal.condition).toEqual({ selfState: { state: 'assignedPartDancing', present: true } });
  });
});
