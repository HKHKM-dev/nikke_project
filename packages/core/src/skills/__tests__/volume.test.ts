// ボリューム（431）: S2 のフルバーストの開始回数別の CT▼ と、自分のバースト使用回数別のクリティカルダメージ▲（どちらも下位効果のスタック適用）、
// バーストの味方全体のクリティカル確率▲の解決（V-0757）。S1 の敵を倒した時の攻撃力▲は前提の外
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed, type SkillLevels } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const volume = characterOf(431);
const def = parseSkillDefinition(rawDefinition(431));

describe('ボリューム（431）の定義', () => {
  it('has no effect in S1 (defeating an enemy is outside the assumptions)', () => {
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });

  it('resolves the S2 cooldown cuts at the 1st, 2nd and 3rd Full Burst onward for all allies', () => {
    const cuts = resolveInstant(def, volume, MAX_SKILL_LEVELS).filter((e) => e.kind === 'cooldownReduction');
    // 秒数はスキル Lv で変わらない
    expect(cuts.map((e) => [e.trigger, e.target, e.value])).toEqual([
      [{ count: 'fullBurstStart', atLeast: 1 }, 'allies', 2.34],
      [{ count: 'fullBurstStart', atLeast: 2 }, 'allies', 2.7],
      [{ count: 'fullBurstStart', atLeast: 3 }, 'allies', 3.17],
    ]);
  });

  it('resolves the S2 crit damage ups by her own Burst uses and the Burst crit rate up (5 s each)', () => {
    const at = (levels: SkillLevels) =>
      resolveTimed(def, volume, levels).map((e) => [
        e.source.skill,
        e.stat,
        e.trigger,
        e.target,
        e.value,
        e.durationFrames,
      ]);
    // 5 秒（ゲーム内の時計）= 294f
    const expected = (s2: number[], burst: number) => [
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 1 }, 'allies', expect.closeTo(s2[0]!, 12), 294],
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 2 }, 'allies', expect.closeTo(s2[1]!, 12), 294],
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 3 }, 'allies', expect.closeTo(s2[2]!, 12), 294],
      ['burst', 'critRate', 'burstUse', 'allies', expect.closeTo(burst, 12), 294],
    ];
    expect(at(MAX_SKILL_LEVELS)).toEqual(expected([0.1077, 0.1246, 0.1442], 0.319));
    expect(at({ skill1: 4, skill2: 7, burst: 7 })).toEqual(expected([0.0774, 0.0942, 0.1129], 0.2711));
  });
});
