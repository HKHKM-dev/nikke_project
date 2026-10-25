// 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: 射撃の回数のきっかけの timed・heal・burstGaugeHit に
// delayFrames を書ける。timed の窓はきっかけの d 後から（startOfFire）、heal は d 後（healFrameOf。heals.test.ts）、
// ゲージは d 後に足す（frame/firstPass.ts）。定義はナガ S2（C-0593・C-0653）・ミサト S1（C-0652）・モラン S2（C-0480）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveShotGauges } from '../burstDamage.ts';
import { startOfFire } from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
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
