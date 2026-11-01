// V-0602: 時間の周期のきっかけ（{ everySeconds }）の timed に delayFrames を書ける。窓は周期の発火の delayFrames 後から
// （skills/holders.ts の startOfFire）。定義はエーテル（291）の S2 の防御力▼（S2 のヒットの次のフレームから。C-0832・C-0453）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { startOfFire } from '../holders.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const rawEther = readJson<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(
  '../../../data/skills/291.json',
);
const ether = readJson<CharacterData>('../../../data/characters/291.json');

/** 291.json を写して、skill2 の防御力▼（effects[2]）の欄を差し替えた定義を検証にかける */
function withDefDown(fields: Record<string, unknown>): unknown {
  const copy = structuredClone(rawEther);
  copy.skills.skill2!.effects[2] = { ...copy.skills.skill2!.effects[2], ...fields };
  return copy;
}

describe('時間の周期のきっかけの timed の delayFrames', () => {
  it('starts the DEF down of Ether S2 the frame after the S2 hit (C-0832・C-0453)', () => {
    const def = parseSkillDefinition(rawEther);
    const down = resolveTimed(def, ether, MAX_SKILL_LEVELS).find((r) => r.stat === 'enemyDefenseDown')!;
    expect(down.value).toBeCloseTo(0.0938, 10);
    expect(down.delayFrames).toBe(53);
    // S2 の発火のフレームの 53f 後（倍率ダメージのヒットは 52f 後）
    expect(startOfFire(down.trigger, 765, down.delayFrames)).toBe(818);
    // 書かなければ発火のフレームから（いままでの規則）
    expect(startOfFire(down.trigger, 765)).toBe(765);
  });

  it('takes only a positive integer', () => {
    for (const d of [0, -1, 1.5, '53']) {
      expect(() => parseSkillDefinition(withDefDown({ delayFrames: d }))).toThrow(/delayFrames/);
    }
  });

  it('rejects it for a stat whose window the first pass tracks', () => {
    expect(() => parseSkillDefinition(withDefDown({ stat: 'attack' }))).toThrow(
      /delayFrames on a timer trigger is not supported for "attack"/,
    );
  });
});
