// ボリューム（431）: S2 のフルバーストの開始回数別の CT▼ と、自分のバースト使用回数別のクリティカルダメージ▲（どちらも下位効果のスタック適用）、
// バーストの味方全体のクリティカル確率▲の解決（V-0757）。S1 の敵を倒した時の攻撃力▲は前提の外
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed, type SkillLevels } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const volume = readJson<CharacterData>('../../../data/characters/431.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/431.json'));
const LEVELS_4_7_7: SkillLevels = { skill1: 4, skill2: 7, burst: 7 };

describe('ボリューム（431）の定義', () => {
  it('has no effect in S1 (defeating an enemy is outside the assumptions)', () => {
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });

  it('resolves the S2 cooldown cuts at the 1st, 2nd and 3rd Full Burst onward for all allies', () => {
    const cuts = resolveInstant(def, volume, MAX_SKILL_LEVELS).filter((e) => e.kind === 'cooldownReduction');
    expect(cuts.map((e) => [e.trigger, e.target])).toEqual([
      [{ count: 'fullBurstStart', atLeast: 1 }, 'allies'],
      [{ count: 'fullBurstStart', atLeast: 2 }, 'allies'],
      [{ count: 'fullBurstStart', atLeast: 3 }, 'allies'],
    ]);
    // 秒数はスキル Lv で変わらない
    expect(cuts.map((e) => e.value)).toEqual([2.34, 2.7, 3.17]);
  });

  it('resolves the S2 crit damage ups by her own Burst uses and the Burst crit rate up (5 s each)', () => {
    const at = (levels: SkillLevels) =>
      resolveTimed(def, volume, levels).map((e) => [e.source.skill, e.stat, e.trigger, e.target, e.value]);
    const timed = resolveTimed(def, volume, MAX_SKILL_LEVELS);
    expect(timed.every((e) => e.durationFrames === 294)).toBe(true); // 5 秒（ゲーム内の時計）
    const expected = (s2: number[], burst: number) => [
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 1 }, 'allies', s2[0]],
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 2 }, 'allies', s2[1]],
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 3 }, 'allies', s2[2]],
      ['burst', 'critRate', 'burstUse', 'allies', burst],
    ];
    const close = (actual: unknown[][], wanted: unknown[][]) => {
      expect(actual.map((r) => r.slice(0, 4))).toEqual(wanted.map((r) => r.slice(0, 4)));
      actual.forEach((r, i) => expect(r[4]).toBeCloseTo(wanted[i]![4] as number, 12));
    };
    close(at(MAX_SKILL_LEVELS), expected([0.1077, 0.1246, 0.1442], 0.319));
    close(at(LEVELS_4_7_7), expected([0.0774, 0.0942, 0.1129], 0.2711));
  });
});
