// アルカナ（581）を含む編成（V-0713）: バーストの運命の輪のカード（電撃コードの味方だけ・10 秒）と、フルバースト終了時のカード。
// フルバースト終了のフレームにアルカナに運命の輪のカードが残っていれば、直前にバーストを使った III の電撃コードの味方に攻撃ダメージ▲と
// 力のカード（15 秒）、味方全体に死神のカード（5 秒）が付く。無条件の S1 の攻撃力▲・S2 の攻撃ダメージ▲（10 秒）は味方全体。
// フルバーストタイムが 5 秒の III（イサベル）ではカードが残り、10 秒の III（ネオン：ビジョン・アイ）では残らない。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { gameSecondsToFirstFrame } from '../time.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const ARCANA = 581;
const LITER = 82;
const ISABEL = 231;
const NEON_VE = 18;

const TEAMS = {
  'リター + アルカナ + イサベル（撮影 A）': fixedTeam([LITER, ARCANA, ISABEL], 2),
  'リター + アルカナ + ネオン：ビジョン・アイ（撮影 B）': fixedTeam([LITER, ARCANA, NEON_VE], 2),
  '実戦寄り（リター + アルカナ + イサベル + ネオン：ビジョン・アイ + クラウン）': fixedTeam(
    [LITER, ARCANA, ISABEL, NEON_VE, 330],
    2,
  ),
};

type Plan = ReturnType<typeof planTeamRun>;
/** 編成ごとに 1 回だけ回す（describe.each と個別の describe が同じ plan を読む） */
const PLANS = new Map(Object.values(TEAMS).map((input) => [input, planTeamRun(input)] as const));
const planOf = (input: (typeof TEAMS)[keyof typeof TEAMS]): Plan => PLANS.get(input)!;
const windows = (plan: Plan, slot: number, skill: string, stat: string) =>
  effectWindows(plan, slot, { resourceId: ARCANA, skill, stat });
const fullBurstEnds = (plan: Plan) =>
  plan.schedule!.fullBurstWindows.filter((w) => w.end < plan.frames).map((w) => w.end);
/** 枠 slot の S2 の倍率ダメージの発動のフレーム（ヒットの遅れ 45f を引く。イサベルの S2） */
const s2Fires = (plan: Plan, slot: number) =>
  plan.skillHits
    .filter((h) => h.slotIndex === slot && h.effect.source.skill === 'skill2')
    .map((h) => h.frame - (h.effect.delayFrames ?? 0));
/** イサベルの S2 の周期（15 秒）と、魔術師のカードで縮めた周期（25%） */
const LONG = gameSecondsToFirstFrame(15);
const SHORT = gameSecondsToFirstFrame(15 * 0.25);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planOf(input);
  const arcana = input.slots.findIndex((s) => s?.character.resourceId === ARCANA);

  it('gives Wheel of Fortune only to the Electric allies, for 10 s from her burst', () => {
    const uses = activationFramesOfSlot(plan.schedule!, arcana);
    expect(uses.length).toBeGreaterThan(1);
    input.slots.forEach((s, slot) =>
      expect(windows(plan, slot, 'burst', 'attackDamage')).toEqual(
        s?.character.element === 'Electronic' ? windowsFrom(uses, 10, plan.frames) : [],
      ),
    );
  });

  it('gives the unconditional S1 ATK up and S2 Attack Damage up to every ally for 10 s from every Full Burst end', () => {
    const tenSeconds = windowsFrom(fullBurstEnds(plan), 10, plan.frames);
    expect(tenSeconds.length).toBeGreaterThan(1);
    input.slots.forEach((_, slot) => {
      expect(windows(plan, slot, 'skill1', 'attack')).toEqual(tenSeconds);
      expect(windows(plan, slot, 'skill2', 'attackDamage')).toEqual(tenSeconds);
    });
  });
});

describe('リター + アルカナ + イサベル（フルバーストタイム 5 秒）', () => {
  const plan = planOf(TEAMS['リター + アルカナ + イサベル（撮影 A）']);
  const ends = fullBurstEnds(plan);

  it('keeps Wheel of Fortune at every Full Burst end, so the conditional cards fire every time', () => {
    expect(ends.length).toBeGreaterThan(2);
    // III（イサベル）にだけ攻撃ダメージ▲（15 秒）。イサベルの S2 の攻撃力▲は、死神のカード（5 秒）に力のカード（15 秒）が重なる
    expect(windows(plan, 2, 'skill1', 'attackDamage')).toEqual(windowsFrom(ends, 15, plan.frames));
    expect(windows(plan, 2, 'skill2', 'attack')).toEqual(windowsFrom(ends, 15, plan.frames));
    // リターとアルカナには攻撃ダメージ▲が付かず、S2 の攻撃力▲は死神のカード（5 秒。全員に付く）だけ
    for (const slot of [0, 1]) {
      expect(windows(plan, slot, 'skill1', 'attackDamage')).toEqual([]);
      expect(windows(plan, slot, 'skill2', 'attack')).toEqual(windowsFrom(ends, 5, plan.frames));
    }
  });
});

describe('魔術師のカード（plan/design-arcana-magician.md。C-1055）', () => {
  const plan = planOf(TEAMS['リター + アルカナ + イサベル（撮影 A）']);
  const ends = fullBurstEnds(plan);
  const fires = s2Fires(plan, 2);

  it('fires Isabel’s S2 every shortened period from each Full Burst end, then the 15 s period from the last one', () => {
    expect(ends.length).toBeGreaterThan(2);
    for (const end of ends.filter((e) => e + 4 * SHORT + 45 < plan.frames)) {
      // カードの付く前の予定がどの回も縮めた周期より遅い（この編成。短い方を取る形と置き直す形は分かれない）
      const after = fires.filter((f) => f > end);
      expect(after.slice(0, 4)).toEqual([1, 2, 3, 4].map((k) => end + k * SHORT));
      // 4 回目は窓（15 秒）の終わりの後で、窓の中の 3 回目から縮めた周期で来る。次は元の周期
      expect(after[3]).toBeGreaterThanOrEqual(windowsFrom([end], 15, plan.frames)[0]!.end);
      const next = after[4];
      if (next !== undefined && !ends.some((e) => e > end && e < next)) expect(next).toBe(after[3]! + LONG);
    }
    // ゲージの予約（burstGaugeHit）も同じ発動から
    const gaugeFires = plan.timerGauges.filter((g) => g.slotIndex === 2).map((g) => g.fireFrame);
    expect(gaugeFires).toEqual(fires);
  });

  it('keeps the 15 s period before the first Full Burst end', () => {
    expect(fires.filter((f) => f <= ends[0]!)).toEqual(
      Array.from({ length: Math.floor(ends[0]! / LONG) }, (_, k) => (k + 1) * LONG),
    );
  });
});

describe('リター + アルカナ + ネオン：ビジョン・アイ（フルバーストタイム 10 秒）', () => {
  const plan = planOf(TEAMS['リター + アルカナ + ネオン：ビジョン・アイ（撮影 B）']);

  it('loses Wheel of Fortune before the Full Burst ends, so no conditional card fires', () => {
    expect(fullBurstEnds(plan).length).toBeGreaterThan(1);
    for (const slot of [0, 1, 2]) {
      expect(windows(plan, slot, 'skill1', 'attackDamage')).toEqual([]);
      expect(windows(plan, slot, 'skill2', 'attack')).toEqual([]);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
