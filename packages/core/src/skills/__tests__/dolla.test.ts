// ドラー（202）: S2 のフルバーストの開始回数別の CT▼ と、自分のバースト使用回数別の攻撃力▲・クリティカル確率▲・クリティカルダメージ▲
// （どちらも下位効果のスタック適用）、バーストのバーストスキルダメージの解決（V-0771）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed, type SkillLevels } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

const dolla = characterOf(202);
const def = parseSkillDefinition(rawDefinition(202));

describe('ドラー（202）の定義', () => {
  it('resolves the S2 cooldown cuts at the 1st, 2nd and 3rd Full Burst onward for all allies', () => {
    const cuts = resolveInstant(def, dolla, MAX_SKILL_LEVELS).filter((e) => e.kind === 'cooldownReduction');
    // 秒数はスキル Lv で変わらない
    expect(cuts.map((e) => [e.trigger, e.target, e.value])).toEqual([
      [{ count: 'fullBurstStart', atLeast: 1 }, 'allies', 1.82],
      [{ count: 'fullBurstStart', atLeast: 2 }, 'allies', 2.2],
      [{ count: 'fullBurstStart', atLeast: 3 }, 'allies', 2.6],
    ]);
  });

  it('resolves the S2 ATK, crit rate and crit damage ups by her own Burst uses (5 s each)', () => {
    const at = (levels: SkillLevels) =>
      resolveTimed(def, dolla, levels).map((e) => [
        e.source.skill,
        e.stat,
        e.trigger,
        e.target,
        e.value,
        e.durationFrames,
      ]);
    // 5 秒（ゲーム内の時計）= 294f
    const expected = (v: number[]) => [
      ['skill2', 'attack', { count: 'burstUse', atLeast: 1 }, 'allies', expect.closeTo(v[0]!, 12), 294],
      ['skill2', 'critRate', { count: 'burstUse', atLeast: 2 }, 'allies', expect.closeTo(v[1]!, 12), 294],
      ['skill2', 'critDamage', { count: 'burstUse', atLeast: 3 }, 'allies', expect.closeTo(v[2]!, 12), 294],
    ];
    expect(at(MAX_SKILL_LEVELS)).toEqual(expected([0.0772, 0.0421, 0.1322]));
    expect(at({ skill1: 1, skill2: 4, burst: 1 })).toEqual(expected([0.0336, 0.021, 0.0698]));
  });

  it('leaves the S1 ATK up unmodeled until its interval is read', () => {
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['unimplemented']);
  });
});
