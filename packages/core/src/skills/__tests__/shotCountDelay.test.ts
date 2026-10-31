// 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: 射撃の回数のきっかけの timed・heal・burstGaugeHit に
// delayFrames を書ける。timed の窓はきっかけの d 後から（startOfFire）、heal は d 後（healFrameOf。heals.test.ts）、
// ゲージは d 後に足す（frame/firstPass.ts）。定義はナガ S2（C-0593・C-0653）・ミサト S1（C-0652）・モラン S2（C-0480）。
// 第 2 段（6.6 節）は下の 2 つの describe
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveDamageEffects, resolveDotEffects, resolvePerShotDamage, resolveShotGauges } from '../burstDamage.ts';
import { resolveCycles } from '../cycles.ts';
import { startOfFire } from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const rawNaga = readJson<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(
  '../../../data/skills/450.json',
);
const naga = readJson<CharacterData>('../../../data/characters/450.json');
const misato = readJson<CharacterData>('../../../data/characters/833.json');
const moran = readJson<CharacterData>('../../../data/characters/281.json');

/** 450.json を写して、skill2 の effects[0] の欄を差し替えた定義を検証にかける */
function withNagaS2(fields: Record<string, unknown>): unknown {
  const copy = structuredClone(rawNaga);
  copy.skills.skill2!.effects[0] = { ...copy.skills.skill2!.effects[0], ...fields };
  return copy;
}

describe('delayFrames の検証（射撃の回数のきっかけ）', () => {
  it('takes a positive integer delayFrames on a timed effect with a shot count trigger', () => {
    const def = parseSkillDefinition(withNagaS2({ delayFrames: 6 }));
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'timed', delayFrames: 6 });
    for (const d of [0, -1, 1.5, '6']) {
      expect(() => parseSkillDefinition(withNagaS2({ delayFrames: d }))).toThrow(/delayFrames/);
    }
  });

  it('rejects delayFrames on a timed effect without a shot count trigger, or with a chance', () => {
    expect(() => parseSkillDefinition(withNagaS2({ trigger: 'burstUse', delayFrames: 6 }))).toThrow(
      /delayFrames needs a shot count trigger/,
    );
    expect(() =>
      parseSkillDefinition(withNagaS2({ trigger: { count: 'normalShot', chance: 0.5 }, delayFrames: 6 })),
    ).toThrow(/delayFrames needs a shot count trigger/);
  });
});

describe('定義の delayFrames', () => {
  it('starts the window of Naga S2 six frames after the fifth shot (C-0593・C-0653)', () => {
    const def = parseSkillDefinition(rawNaga);
    const s2 = resolveTimed(def, naga, MAX_SKILL_LEVELS).find((r) => r.source.skill === 'skill2')!;
    expect(s2.delayFrames).toBe(6);
    expect(startOfFire(s2.trigger, 169, s2.delayFrames)).toBe(175);
    // 書かない効果は次のフレームから（いままでの規則）
    expect(startOfFire(s2.trigger, 169)).toBe(170);
  });

  it('heals six frames after the 120th shot of Misato S1 (C-0652)', () => {
    const def = parseSkillDefinition(readJson('../../../data/skills/833.json'));
    const heal = resolveInstant(def, misato, MAX_SKILL_LEVELS).find((r) => r.kind === 'heal')!;
    expect(heal.delayFrames).toBe(6);
  });

  it('charges the taunt gauge of Moran S2 six frames after the last bullet (C-0480)', () => {
    const def = parseSkillDefinition(readJson('../../../data/skills/281.json'));
    expect(resolveShotGauges(def, moran, MAX_SKILL_LEVELS)).toEqual([{ count: 'lastShot', every: 1, delayFrames: 6 }]);
  });
});

// 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: damage の delayFrames を射撃の回数のきっかけにも、
// cycle の段にも書ける。dot は付けたときのゲージだけを gaugeOnApplyDelayFrames 後に足す。定義はプリバティ：UM S1（C-0659）・
// ドレイク S2（宝物版。C-0660）・紅蓮BS S1 の段（C-0651）・レイヴン S1（C-0181）。RL の射撃のフレームは撃ったフレーム（C-0661）
const rawPrivaty = readJson<{ skills: Record<string, { effects: Record<string, unknown>[]; sequential?: true }> }>(
  '../../../data/skills/313.json',
);
const privaty = readJson<CharacterData>('../../../data/characters/313.json');
const drake = readJson<CharacterData>('../../../data/characters/101.json');
const scarlet = readJson<CharacterData>('../../../data/characters/225.json');
const raven = readJson<CharacterData>('../../../data/characters/851.json');

const rawRaven = readJson<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(
  '../../../data/skills/851.json',
);

/** 851.json を写して、skill1 の effects[0]（S1 の持続ダメージ）の欄を差し替えた定義 */
function withShock(fields: Record<string, unknown>): unknown {
  const copy = structuredClone(rawRaven);
  copy.skills.skill1!.effects[0] = { ...copy.skills.skill1!.effects[0], ...fields };
  return copy;
}

/** 313.json を写して、skill1 の effects[0] の欄を差し替えた定義を検証にかける */
function withPrivatyS1(fields: Record<string, unknown>, sequential = false): unknown {
  const copy = structuredClone(rawPrivaty);
  copy.skills.skill1!.effects[0] = { ...copy.skills.skill1!.effects[0], ...fields };
  if (sequential) copy.skills.skill1!.sequential = true;
  return copy;
}

describe('damage の delayFrames（射撃の回数のきっかけ）', () => {
  it('takes a positive integer delayFrames on a shot count damage', () => {
    expect(parseSkillDefinition(rawPrivaty).skills.skill1.effects[0]).toMatchObject({ kind: 'damage', delayFrames: 6 });
    for (const d of [0, -1, 1.5, '6']) {
      expect(() => parseSkillDefinition(withPrivatyS1({ delayFrames: d }))).toThrow(/delayFrames/);
    }
  });

  it('rejects delayFrames with gaugeHits or in a sequential skill', () => {
    // 確率のきっかけは damage にそもそも書けない（timed だけ）
    expect(() => parseSkillDefinition(withPrivatyS1({ gaugeHits: [0] }))).toThrow(
      /delayFrames cannot be used with gaugeHits/,
    );
    expect(() => parseSkillDefinition(withPrivatyS1({}, true))).toThrow(/a sequential skill cannot have a delayed/);
  });

  it('does not fold a delayed per-shot damage (every 1) into the shot, and rejects it for SG', () => {
    // 遅れつきの射撃ごとの倍率ダメージは畳み込まない（別のヒット）。SG はペレットごとか 1 回の射撃ごとかが決まっていないので拒否する
    const def = parseSkillDefinition(withPrivatyS1({ trigger: { count: 'normalShot', every: 1 } }));
    expect(() => resolveDamageEffects(def, privaty, MAX_SKILL_LEVELS)).toThrow(/not supported for SG/);
    expect(resolvePerShotDamage(def, privaty, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill1')).toEqual([]);
  });

  it('delays Privaty S1 and the treasure Drake S2 by six frames (C-0659・C-0660)', () => {
    const s1 = resolveDamageEffects(parseSkillDefinition(rawPrivaty), privaty, MAX_SKILL_LEVELS);
    expect(s1.map((e) => e.delayFrames)).toEqual([6]);
    const def = parseSkillDefinition(readJson('../../../data/skills/101.json'));
    const treasure = applyTreasure(drake, def, 3);
    const s2 = resolveDamageEffects(treasure.definition!, treasure.character, MAX_SKILL_LEVELS).filter(
      (e) => e.source.skill === 'skill2',
    );
    expect(s2.map((e) => e.delayFrames)).toEqual([6, 6]);
    // 宝物なしの S2 は測っていない
    const plain = resolveDamageEffects(def, drake, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill2');
    expect(plain.map((e) => e.delayFrames)).toEqual([undefined]);
  });
});

describe('cycle の段と dot の付けたときのゲージの遅れ', () => {
  it('delays the tiers of Scarlet: Black Shadow S1 by 10, 9 and 9 frames (C-0651)', () => {
    const [cycle] = resolveCycles(
      parseSkillDefinition(readJson('../../../data/skills/225.json')),
      scarlet,
      MAX_SKILL_LEVELS,
    );
    expect(cycle!.steps.map((s) => s.delayFrames)).toEqual([10, 9, 9]);
    // ゲージも段のヒットと同じフレーム（C-0764。plan/design-shot-count-trigger-frame.md 6.7 節の論点 10）
    expect(cycle!.gaugeHits).toEqual([[10], [9, 23, 38], [9]]);
  });

  it('adds the apply gauge of Raven S1 six frames after the shot (C-0181)', () => {
    const [shock] = resolveDotEffects(
      parseSkillDefinition(readJson('../../../data/skills/851.json')),
      raven,
      MAX_SKILL_LEVELS,
    );
    expect(shock!.dot!.gaugeOnApplyDelayFrames).toBe(6);
    // tick の刻みは撃った 5f 後から（C-0765。6.7 節の論点 9）
    expect(shock!.dot!.tickDelayFrames).toBe(5);
  });

  it('needs gaugeOnApply and a shot count trigger without a chance for gaugeOnApplyDelayFrames', () => {
    expect(() => parseSkillDefinition(withShock({ gaugeOnApply: undefined }))).toThrow(/needs gaugeOnApply/);
    expect(() => parseSkillDefinition(withShock({ gaugeOnApplyDelayFrames: 0 }))).toThrow(/gaugeOnApplyDelayFrames/);
  });

  it('takes a positive integer tickDelayFrames only with a shot count trigger and without a state', () => {
    for (const d of [0, -1, 1.5, '5']) {
      expect(() => parseSkillDefinition(withShock({ tickDelayFrames: d }))).toThrow(/tickDelayFrames/);
    }
    expect(() =>
      parseSkillDefinition(
        withShock({ trigger: 'burstUse', gaugeOnApply: undefined, gaugeOnApplyDelayFrames: undefined }),
      ),
    ).toThrow(/tickDelayFrames/);
  });
});
