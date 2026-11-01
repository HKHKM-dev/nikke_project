// ベスティー：タクティカル・アップ（94）を含む編成（2 段目の段 16 の PR 2。plan/design-skill-stage16.md 2.2 節。V-0586）。
// S1: ミサイルガイドはフルチャージの発で（ミサイルガイドでないときに）付き、次の発から 3 発にチャージ速度▲・チャージダメージ▲（C-0804）。
// 最大弾数のリロードの完了で外れるのはミサイルガイド（チャージ速度▲）だけで、チャージダメージ▲は残る（C-0818。V-0589）。
// S2: フルチャージの発ごとの防御力無視ダメージ（C-0805）と、戦場コントロール・徹甲炸裂弾の間の▲（C-0809）。バースト: 防御力無視の
// バーストスキルダメージと、そのヒットに乗る同じ発動の防御力無視ダメージ▲（C-0807・C-0808）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { burstHitsOfSlot } from '../burst/schedule.ts';
import { computeTriggerDamage } from '../damage.ts';
import { slotBurstHit } from '../skills/burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { burstHitBuffs, planTeamRun, sameActivationPiecesOf } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { slotPieces, stateItemsOf } from './historyHelpers.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedSlot,
  fixedTeam,
  rawDefinition,
  SHOOTING_RANGE_ENEMY as enemy,
  skillValueOf,
} from './teamHelpers.ts';

const BESTIE = 94;
const raw = () => rawDefinition<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(BESTIE);

describe('ベスティー：タクティカル・アップの定義', () => {
  const def = parseSkillDefinition(raw());

  it('writes the guide removal on a full reload and the true damage of S2 and the burst', () => {
    expect(def.skills.skill1.effects[1]).toMatchObject({
      kind: 'removeState',
      state: 'missileGuide',
      trigger: { reloadEnd: true },
    });
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'damage', damageType: 'true' });
    expect(def.skills.burst.effects[1]).toMatchObject({ kind: 'burstDamage', damageType: 'true' });
  });

  it('allows a reload end trigger only in removeState', () => {
    const json = raw();
    json.skills.skill1.effects[0]!.trigger = { reloadEnd: true };
    expect(() => parseSkillDefinition(json)).toThrow(/only allowed in removeState/);
  });

  it('allows a grant to look at its own state only as "not in the state"', () => {
    const json = raw();
    json.skills.skill1.effects[0]!.condition = { selfState: { state: 'missileGuide', present: true } };
    expect(() => parseSkillDefinition(json)).toThrow(/cannot look at its own state/);
  });
});

describe('ベスティー：タクティカル・アップ単騎（バーストなし）', () => {
  const plan = planTeamRun(fixedTeam([BESTIE], 0, { burst: false }));
  const frames = plan.shots[0]!.frames;
  const guide = slotPieces(plan, 0).filter(
    (p) => p.effect.source.skill === 'skill1' && p.effect.stat === 'chargeDamage',
  );
  const guided = (f: number) => guide.some((p) => p.start <= f && f < p.end);

  it('guides the 3 shots after each charged shot, so a magazine of 8 is charged-guided×3 twice', () => {
    expect(
      frames
        .slice(0, 16)
        .map((f) => (guided(f) ? 'G' : 'N'))
        .join(''),
    ).toBe('NGGGNGGGNGGGNGGG');
  });

  it('fires the S2 true damage on every full charge shot, guided shots included', () => {
    const s2 = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2');
    expect(s2.map((h) => h.frame)).toEqual(frames);
  });
});

// S1 の「最大弾数のリロードが完了した時、ミサイルガイド解除」（removeState・きっかけ { reloadEnd }）。最大装弾数 8 発ではガイドがマガジンの
// 中で使い切られるので、ユニ（160）の S2 の最大装弾数▲（C-0390）で 9 発にし、マガジンの最後の溜める発で付いたガイドの 3 発がリロードを
// またぐ場面を作る（V-0589 の撮影と同じ編成）。最初のマガジンは戦闘開始時に込めた 8 発。解除で外れるのはミサイルガイド（状態の中身の
// チャージ速度▲）だけで、チャージダメージ▲（skill1 の effects[2]）は残りの発数を持ったまま残る（C-0818）
const YUNI = 160;
const withYuni = fixedTeam([BESTIE, YUNI], 0);

describe('ベスティー：タクティカル・アップ + ユニ（最大装弾数 9 発）', () => {
  function run(withRemoval: boolean) {
    const json = raw();
    if (!withRemoval) json.skills.skill1.effects.splice(1, 1);
    const input: TeamInput = { ...withYuni, slots: [fixedSlot(BESTIE, json), fixedSlot(YUNI)] };
    const plan = planTeamRun(input);
    const pieces = slotPieces(plan, 0).filter((p) => p.effect.source.skill === 'skill1');
    const guide = pieces.filter((p) => p.effect.stat === 'chargeSpeed');
    const damage = pieces.filter((p) => p.effect.stat === 'chargeDamage');
    const patternOf = (ps: typeof pieces) =>
      plan.shots[0]!.frames.map((f) => (ps.some((p) => p.start <= f && f < p.end) ? 'G' : 'N')).join('');
    return { plan, guide, pattern: patternOf(guide), damagePattern: patternOf(damage) };
  }

  const withRemoval = run(true);

  it('writes the reload ends for the removal alone, and removes the guide (charge speed) on each reload end', () => {
    const { plan, guide } = withRemoval;
    const log = plan.shots[0]!;
    // 定義に durationUntil: reloadEnd は無く、込め終わりのフレームを書くのは解除（hasReloadEndEffect の removeState）のため
    expect(log.reloadEnds?.length).toBeGreaterThan(1);
    // マガジンの最後の溜める発で付いたガイドは、次の発を待たずに込め終わり（の次のフレーム）で外れる
    const crossing = log.reloadEnds!.map((end) => guide.find((p) => p.start < end && end <= p.end));
    expect(crossing.filter((p) => p !== undefined).length).toBeGreaterThan(0);
    log.reloadEnds!.forEach((end, k) => {
      const p = crossing[k];
      if (p === undefined) return;
      expect(p.end - end).toBeGreaterThanOrEqual(0);
      expect(p.end - end).toBeLessThanOrEqual(1);
      expect(log.frames.some((f) => p.start <= f && f < p.end)).toBe(false);
    });
  });

  it('starts every 9-shot magazine with a charged shot that still carries the charge damage of the last guide', () => {
    const { pattern, damagePattern } = withRemoval;
    // 1 本目は 8 発（溜める・ガイド 3 の 2 組）、2 本目から 9 発（2 組の後に溜める 1 発）。リロードの後の 1 発目はチャージ速度▲の外
    expect(pattern.slice(0, 8 + 9 * 3)).toBe('NGGGNGGG' + 'NGGGNGGGN'.repeat(3));
    // チャージダメージ▲は残り、その 1 発目に乗る。1 発目で付き直すので、続くガイドの 3 発にも乗る（▲の乗った発が 4 発。録画 0839・0840）
    expect(damagePattern.slice(0, 8 + 9 * 3)).toBe('NGGGNGGG' + 'NGGGNGGGN' + 'GGGGNGGGN'.repeat(2));
    // 解除が無ければ、最後の発で付いたガイドの 3 発が次のマガジンの頭に残る
    expect(run(false).pattern.slice(0, 8 + 9 + 3)).toBe('NGGGNGGG' + 'NGGGNGGGN' + 'GGG');
  });
});

// S2 の条件付きの▲（C-0809）は、エマ：タクティカル・アップ（I。バーストで味方全体に戦場コントロール）とウンファ：タクティカル・アップ（II。
// バーストの使用武器変更の発で敵に徹甲炸裂弾）と組んで見る。バーストのヒットは III のタイマーの 00.00 から 17f（C-0807）
const BESTIE_SLOT = 2;
const tacticalUp = fixedTeam([93, 95, BESTIE], BESTIE_SLOT);

describe('エマ：タクティカル・アップ + ウンファ：タクティカル・アップ + ベスティー：タクティカル・アップ', () => {
  const plan = planTeamRun(tacticalUp);
  const shots = plan.shots[BESTIE_SLOT]!.frames;
  const states = stateItemsOf(plan);
  /** ベスティーの S2 の stat の窓 */
  const windows = (stat: string) => effectWindows(plan, BESTIE_SLOT, { resourceId: BESTIE, skill: 'skill2', stat });

  it.each([
    ['attack', 'battlefieldFormation', BESTIE_SLOT],
    ['projectileExplosionDamage', 'explosiveRound', -1],
  ])('gives the S2 %s only from full charge shots while %s is on', (stat, state, holder) => {
    const held = states.filter((x) => x.state === state && x.slotIndex === holder);
    const during = (f: number) => held.some((x) => x.start <= f && f < x.end);
    expect(held.length).toBeGreaterThan(1);
    const w = windows(stat);
    expect(w.length).toBeGreaterThan(1);
    // どの窓も、状態の間に撃った発の次のフレームから始まる
    for (const { start } of w) {
      expect(shots).toContain(start - 1);
      expect(during(start - 1)).toBe(true);
    }
    // 状態の外の発（1 回目のバーストの前の発など）からは付かない
    const outside = shots.filter((f) => !during(f));
    expect(outside.length).toBeGreaterThan(0);
    for (const f of outside) expect(w.some((x) => x.start === f + 1)).toBe(false);
  });

  it("puts the same activation's true damage increase on the burst hit (sameActivationBuffsOnHit of the landing table)", () => {
    const bestie = tacticalUp.slots[BESTIE_SLOT]!;
    const same = sameActivationPiecesOf(plan.history, bestie.character);
    expect(same).toBeDefined();
    const landed = burstHitsOfSlot(plan.schedule!, BESTIE_SLOT, plan.frames);
    const hits = runSimulation(tacticalUp).slots[BESTIE_SLOT]!.burst.hits;
    expect(landed.length).toBeGreaterThan(1);
    expect(hits).toHaveLength(landed.length);
    landed.forEach((h, k) => {
      const atUse = burstHitBuffs(plan.timeline, h.activationFrame, h.frame, BESTIE_SLOT, true);
      const buffs = burstHitBuffs(plan.timeline, h.activationFrame, h.frame, BESTIE_SLOT, true, same);
      // バーストの防御力無視ダメージ▲（値 03。C-0808）
      expect(buffs.trueDamage).toBeCloseTo(atUse.trueDamage + skillValueOf(BESTIE, 'burst', 3) / 100, 12);
      const trigger = computeTriggerDamage({
        ...bestie,
        enemy,
        buffs,
        condition: { ...bestie.condition, fullBurst: false },
      });
      const expected = slotBurstHit(
        bestie.skills!.definition,
        MAX_SKILL_LEVELS,
        bestie.character,
        enemy,
        trigger,
        buffs,
      )!;
      expect(hits[k]!.perActivation).toBe(expected.perActivation);
    });
  });
});

const TEAMS = {
  '単騎（バーストなし）': fixedTeam([BESTIE], 0, { burst: false }),
  'ベスティー：タクティカル・アップ + ユニ': withYuni,
  'エマ：タクティカル・アップ + ウンファ：タクティカル・アップ + ベスティー：タクティカル・アップ': tacticalUp,
};

describeEveryShotInOneGroup(TEAMS);
