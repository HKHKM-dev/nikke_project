// ミルク：ブルーミングバニー（143）を含む編成（V-0783）: S1 はフルチャージの発の後に自分へ貫通特化（6 秒）、バーストは何見てんだよお前ら！！と
// 攻撃力▲・貫通ダメージ▲（10 秒）、S2 は何見てんだよお前ら！！の間だけ、戦闘開始から 2 秒ごとの周期で分配ダメージ。羞恥心（フルチャージの維持）は
// 前提の外の notes で、起きない
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { GAME_SECONDS_PER_FRAME } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  rawDefinition,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const MILK_BB = 143;

const TEAMS = {
  'I-DOLL・フラワー + ノア + ミルク：BB（V-0783 の編成）': fixedTeam([304, 232, MILK_BB], 2),
  '実戦寄り（リター + クラウン + ミルク：BB + グレイブ）': fixedTeam([82, 330, MILK_BB, 514], 2),
};

type Plan = ReturnType<typeof planTeamRun>;
const s2 = rawDefinition<{
  skills: { skill2: { effects: { trigger: { everySeconds: number }; delayFrames: number }[] } };
}>(MILK_BB).skills.skill2.effects[0]!;
const PERIOD_FRAMES = s2.trigger.everySeconds / GAME_SECONDS_PER_FRAME;

describe.each(Object.entries(TEAMS))('%s', (_name, input) => {
  const m = 2;
  const plan = planTeamRun(input);
  const shots = plan.shots[m]!.frames;
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === m).map((a) => a.frame);
  const stateWindows = itemsOf(plan.history, { holder: m, state: 'overconfidentHuh' }).map(({ start, end }) => ({
    start,
    end,
  }));
  const s2Hits = plan.skillHits.filter(
    (h) => h.slotIndex === m && h.effect.source.resourceId === MILK_BB && h.effect.source.skill === 'skill2',
  );

  it('gives herself Pierce from the frame after each full charge shot, covering every shot after the first', () => {
    const pierce = effectWindows(plan, m, { resourceId: MILK_BB, skill: 'skill1', stat: 'pierce' });
    expect(pierce[0]!.start).toBe(shots[0]! + 1);
    for (const f of shots.slice(1)) expect(pierce.some((w) => w.start <= f && f < w.end)).toBe(true);
    expect(skillValueOf(MILK_BB, 'skill1', 1)).toBe(6);
  });

  it('applies Overconfident, Huh?! with the ATK up and pierce damage up for 10 s from each of her bursts', () => {
    expect(bursts.length).toBeGreaterThan(2);
    const expected = windowsFrom(bursts, 10, plan.frames);
    expect(stateWindows).toEqual(expected);
    for (const stat of ['attack', 'pierceDamage'])
      expect(effectWindows(plan, m, { resourceId: MILK_BB, skill: 'burst', stat })).toEqual(expected);
  });

  it('deals the S2 distributed damage only while Overconfident, Huh?! is on, on the 2 s grid from the battle start', () => {
    expect(s2Hits.length).toBeGreaterThan(0);
    for (const h of s2Hits) {
      expect(h.effect.damageType).toBe('distributed');
      // 端数を持ち越すので、k 回目は k × 2 秒に達した最初のフレーム。ヒットはその delayFrames 後
      const tick = h.frame - s2.delayFrames;
      expect(stateWindows.some((w) => w.start < tick && tick < w.end)).toBe(true);
      const k = Math.round(tick / PERIOD_FRAMES);
      expect(Math.ceil(k * PERIOD_FRAMES - 1e-9)).toBe(tick);
    }
    // 窓（10 秒）ごとに 5 回（戦闘の終わりで切れた窓は数えない）
    for (const w of stateWindows.filter((x) => x.end < plan.frames))
      expect(s2Hits.filter((h) => w.start < h.frame - s2.delayFrames && h.frame - s2.delayFrames < w.end)).toHaveLength(
        5,
      );
  });

  // V-0783 の編成には攻撃ダメージ▲が無いので、乗数が 1 なら貫通ダメージ▲（窓の中は 117.64%）が足されていない
  it.runIf(_name.includes('V-0783'))('does not add the pierce damage up to the S2 hits (C-1243)', () => {
    for (const h of s2Hits) expect(h.hit.attackDamageMultiplier).toBe(1);
  });

  it('never applies Embarrassment (holding full charge is out of scope)', () => {
    expect(plan.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'skill1')).toEqual([]);
    expect(plan.instants.filter((x) => x.slotIndex === m && x.effect.kind === 'ammoDecrease')).toEqual([]);
  });
});

describeEveryShotInOneGroup(TEAMS);
