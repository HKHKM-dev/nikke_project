// マクスウェル：オーディナリーメカニック編（plan/design-maxwell-om.md 2 節）: 使用武器の変更のチャージ時間を説明文の値で書く
// chargeTimeRef・使用武器の変更の条件の自分の状態のスタック数（上の端 stacksBelow）の語彙の検証と、Lv ごとの解決値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { stacksHold } from '../holders.ts';
import {
  MAX_SKILL_LEVELS,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  type SkillLevels,
} from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const MAXWELL = 105;
const raw = readJson<Raw>(`../../../data/skills/${MAXWELL}.json`);
const character = readJson<CharacterData>(`../../../data/characters/${MAXWELL}.json`);
const changes = raw.skills.burst.effects.flatMap((e, i) => (e.kind === 'weaponChange' ? [i] : []));

const edited = (edit: (copy: Raw) => void) => {
  const copy = structuredClone(raw);
  edit(copy);
  return copy;
};
/** 段階 k（0 始まり）の変更の欄を書き換えた定義 */
const withChange = (k: number, patch: Record<string, unknown>) =>
  edited((c) => {
    c.skills.burst.effects[changes[k]!] = { ...c.skills.burst.effects[changes[k]!], ...patch };
  });
const conditionOf = (k: number) =>
  (raw.skills.burst.effects[changes[k]!]!.condition as { selfState: Record<string, unknown> }).selfState;
const withStage = (k: number, selfState: Record<string, unknown>) => withChange(k, { condition: { selfState } });

describe('語彙の検証', () => {
  it('accepts the definition with five stage changes', () => {
    const def = parseSkillDefinition(raw);
    expect(changes).toHaveLength(5);
    expect(def.skills.burst.effects.filter((e) => e.kind === 'weaponChange')).toHaveLength(5);
    expect(def.skills.burst.support).toBe('supported');
  });

  it('takes chargeTimeRef or chargeTimeSeconds, not both, and chargeTimeFixed with either', () => {
    expect(() => parseSkillDefinition(withChange(0, { chargeTimeSeconds: 3 }))).toThrow(
      /at most one of chargeTimeSeconds and chargeTimeRef/,
    );
    expect(() => parseSkillDefinition(withChange(0, { chargeTimeRef: undefined }))).toThrow(
      /chargeTimeFixed needs chargeTimeSeconds or chargeTimeRef/,
    );
    expect(() => parseSkillDefinition(withChange(0, { instantFire: true, fullChargeDamage: undefined }))).toThrow(
      /instantFire cannot be combined with chargeTimeSeconds, chargeTimeRef/,
    );
  });

  it('takes only a stack count of a state as selfState of a weapon change', () => {
    expect(() => parseSkillDefinition(withStage(0, { state: 'overcurrent', present: true }))).toThrow(
      /a weapon change can only look at a stack count/,
    );
  });

  it('takes stacksBelow above stacks, not with "full", and not in while', () => {
    expect(() => parseSkillDefinition(withStage(1, { ...conditionOf(1), stacksBelow: 2 }))).toThrow(
      /stacksBelow must be greater than stacks/,
    );
    expect(() => parseSkillDefinition(withStage(4, { ...conditionOf(4), stacks: 'full', stacksBelow: 6 }))).toThrow(
      /stacksBelow cannot be combined with stacks: "full"/,
    );
    const inWhile = edited((c) =>
      c.skills.skill2.effects.push({
        kind: 'passive',
        target: 'self',
        stat: 'critRate',
        ref: 5,
        while: { selfState: { state: 'overcurrent', stacksBelow: 2 } },
      }),
    );
    expect(() => parseSkillDefinition(inWhile)).toThrow(/stacksBelow is not allowed in while/);
  });

  it('rejects overlapping stage ranges and stage changes without a stack count condition', () => {
    expect(() => parseSkillDefinition(withStage(1, { ...conditionOf(1), stacks: 1 }))).toThrow(
      /stack ranges of weapon changes overlap/,
    );
    expect(() => parseSkillDefinition(withChange(4, { condition: undefined }))).toThrow(
      /weapon changes with the same trigger need stack count conditions/,
    );
    expect(() => parseSkillDefinition(withStage(4, { ...conditionOf(4), stacks: undefined, stacksRef: 6 }))).toThrow(
      /weapon changes with the same trigger need stack count conditions/,
    );
  });

  it('rejects sameFiring on a weapon change (the stage-1 grant of the same frame is already counted)', () => {
    expect(() => parseSkillDefinition(withStage(1, { ...conditionOf(1), sameFiring: true }))).toThrow(
      /sameFiring is allowed only in a state grant/,
    );
  });
});

describe('解決値', () => {
  const weaponsAt = (levels: SkillLevels) =>
    resolveTimed(parseSkillDefinition(raw), character, levels).filter((t) => t.stat === 'weapon');

  it('makes five 1-round changes of 350% with 300% full charge and the stage charge times 3・2.5・2・1.5・0.4 s (Lv10)', () => {
    const weapons = weaponsAt(MAX_SKILL_LEVELS);
    expect(weapons.map((w) => w.weapon!.shot.chargeTime)).toEqual([3, 2.5, 2, 1.5, 0.4]);
    for (const w of weapons) {
      expect(w.weapon!.shot).toMatchObject({ maxAmmo: 1, fullChargeDamage: 3, damage: 35000 });
      expect(w.weapon!.fixedChargeTime).toBe(true);
      expect(w.weapon!.pierce).toBe(true);
      expect(w.durationUntil).toBe('ammoSpent');
    }
    expect(weapons.map((w) => w.condition?.selfState)).toEqual([
      { state: 'overcurrent', present: true, stacksBelow: 2 },
      { state: 'overcurrent', present: true, stacks: 2, stacksBelow: 3 },
      { state: 'overcurrent', present: true, stacks: 3, stacksBelow: 4 },
      { state: 'overcurrent', present: true, stacks: 4, stacksBelow: 5 },
      { state: 'overcurrent', present: true, stacks: 5 },
    ]);
  });

  it('resolves the damage by the burst level and the charge times by their values (Lv1)', () => {
    const weapons = weaponsAt({ skill1: 1, skill2: 1, burst: 1 });
    expect(weapons.map((w) => w.weapon!.shot.chargeTime)).toEqual([3, 2.5, 2, 1.5, 0.4]);
    expect(weapons[0]!.weapon!.shot.damage).toBe(17500);
  });

  it('resolves Overcurrent to 30% ATK per stage up to 5 stages (Lv10)', () => {
    const grant = resolveStateGrants(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).find(
      (g) => g.state === 'overcurrent',
    )!;
    expect(grant.maxStacks).toBe(5);
    const contents = resolveStateContents(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).filter(
      (c) => c.whileState === 'overcurrent',
    );
    expect(contents).toMatchObject([{ stat: 'attack', value: 0.3, maxStacks: 5 }]);
  });
});

describe('スタック数の条件の上の端（stacksHold）', () => {
  const origin = { kind: 'timed' } as never;
  const at = (stack: number) => [{ origin, items: [{ start: 0, end: 10, stack }] }];
  it('holds within [stacks, stacksBelow), and counts no state as stage 0', () => {
    expect(stacksHold({ stacksBelow: 2 }, false, [])).toBe(true);
    expect(stacksHold({ stacksBelow: 2 }, false, at(1))).toBe(true);
    expect(stacksHold({ stacksBelow: 2 }, false, at(2))).toBe(false);
    expect(stacksHold({ stacks: 2, stacksBelow: 3 }, false, at(2))).toBe(true);
    expect(stacksHold({ stacks: 2, stacksBelow: 3 }, false, at(3))).toBe(false);
    expect(stacksHold({ stacks: 5 }, false, at(5))).toBe(true);
  });
});
