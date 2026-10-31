// ベスティー：タクティカル・アップ（94）を含む編成（2 段目の段 16 の PR 2。plan/design-skill-stage16.md 2.2 節。V-0586）。
// S1: ミサイルガイドはフルチャージの発で（ミサイルガイドでないときに）付き、次の発から 3 発にチャージ速度▲・チャージダメージ▲（C-0804）。
// S2: フルチャージの発ごとの防御力無視ダメージ（C-0805）と、戦場コントロール・徹甲炸裂弾の間の▲（C-0809）。バースト: 防御力無視の
// バーストスキルダメージと、そのヒットに乗る同じ発動の防御力無視ダメージ▲（C-0807・C-0808）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { hitFrameOf } from '../burst/schedule.ts';
import { computeTriggerDamage } from '../damage.ts';
import { slotBurstHit } from '../skills/burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { burstHitBuffs, planTeamRun, sameActivationPiecesOf } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { slotPieces, stateItemsOf } from './historyHelpers.ts';
import {
  effectWindows,
  expectEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rawDefinition,
  SHOOTING_RANGE_ENEMY as enemy,
} from './teamHelpers.ts';

const BESTIE = 94;
const raw = () => rawDefinition<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(BESTIE);
const bestieSlot = (json: unknown = raw()) => fixedSlot(BESTIE, json);

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
  const input: TeamInput = { slots: [bestieSlot()], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
  const plan = planTeamRun(input);
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
// またぐ場面を作る（V-0589 の撮影計画と同じ編成）。最初のマガジンは戦闘開始時に込めた 8 発
const YUNI = 160;
const withYuni = fixedTeam([BESTIE, YUNI], 0);

describe('ベスティー：タクティカル・アップ + ユニ（最大装弾数 9 発）', () => {
  function run(withRemoval: boolean) {
    const json = raw();
    if (!withRemoval) json.skills.skill1.effects.splice(1, 1);
    const input: TeamInput = { ...withYuni, slots: [bestieSlot(json), fixedSlot(YUNI)] };
    const plan = planTeamRun(input);
    const guide = slotPieces(plan, 0).filter(
      (p) => p.effect.source.skill === 'skill1' && p.effect.stat === 'chargeDamage',
    );
    const pattern = plan.shots[0]!.frames.map((f) => (guide.some((p) => p.start <= f && f < p.end) ? 'G' : 'N'));
    return { plan, guide, pattern: pattern.join('') };
  }

  it('writes the reload ends for the removal alone, and removes the guide on each reload end', () => {
    const { plan, guide } = run(true);
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

  it('starts every 9-shot magazine with a charged shot (the guide from the last shot is removed on the reload)', () => {
    const { pattern } = run(true);
    // 1 本目は 8 発（溜める・ガイド 3 の 2 組）、2 本目から 9 発（2 組の後に溜める 1 発）
    expect(pattern.slice(0, 8 + 9 * 3)).toBe('NGGGNGGG' + 'NGGGNGGGN'.repeat(3));
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
  const windows = (stat: string) =>
    effectWindows(
      plan,
      BESTIE_SLOT,
      (p) => p.effect.source.resourceId === BESTIE && p.effect.source.skill === 'skill2' && p.effect.stat === stat,
    );

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
    const activations = plan.schedule!.activations.filter(
      (a) => a.slotIndex === BESTIE_SLOT && hitFrameOf(a) < plan.frames,
    );
    const hits = runSimulation(tacticalUp).slots[BESTIE_SLOT]!.burst.hits;
    expect(activations.length).toBeGreaterThan(1);
    expect(hits).toHaveLength(activations.length);
    activations.forEach((a, k) => {
      const atUse = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), BESTIE_SLOT, true);
      const buffs = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), BESTIE_SLOT, true, same);
      // バーストの防御力無視ダメージ▲（Lv10 の 60%。C-0808）
      expect(buffs.trueDamage).toBeCloseTo(atUse.trueDamage + 0.6, 12);
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

const TEAMS: Record<string, TeamInput> = {
  '単騎（バーストなし）': fixedTeam([BESTIE], 0, { burst: false }),
  'ベスティー：タクティカル・アップ + ユニ': withYuni,
  'エマ：タクティカル・アップ + ウンファ：タクティカル・アップ + ベスティー：タクティカル・アップ': tacticalUp,
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    expectEveryShotInOneGroup(input, planTeamRun(input));
  });
});
