// エレグ：ブーム・アンド・ショック（502）を含む編成（plan/design-elegg-bs.md。V-0789）。語彙は skills/__tests__/eleggBs.test.ts。
// ここでは味方と組んだ時に: 憑依が戦闘開始時と 6 秒ごとに付き、その間の味方全体の命中が 100 に届いた発で幽霊キャプチャー数が 1 増えて
// 憑依が外れる（憑依 1 回にキャプチャーは最大 1 回）。キャプチャー数 1 以上で水冷コードの味方に攻撃力▲、4 以上で有利コードの攻撃ダメージ▲。
// 13 のままのキャプチャーで S2 のダメージ。バーストは 13 でなければ 6 ヒットで 6 減らし（最低 1）、13 なら 13 ヒットで 9 減らす。
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { counterEffectiveFrom } from '../skills/holders/types.ts';
import { gameSecondsToFrames } from '../time.ts';
import { slotPieces } from './historyHelpers.ts';
import { fixedSlot, fixedTeam, rawDefinition } from './teamHelpers.ts';

const ELEGG_BS = 502;
const POSSESSION_FRAMES = gameSecondsToFrames(6);

const TEAMS = {
  'I-DOLL・フラワー + ノア + エレグ：BS + ソルジャーE.G.（V-0789 の編成）': fixedTeam([304, 232, ELEGG_BS, 300], 2),
  '実戦寄り（リター + ノア + エレグ：BS + 鈴原サクラ + ソルジャーE.G.）': fixedTeam([82, 232, ELEGG_BS, 836, 300], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const e = input.slots.findIndex((s) => s?.character.resourceId === ELEGG_BS);
  const plan = planTeamRun(input);
  const possessions = itemsOf(plan.history, { holder: e, state: 'ghostPossession' }).sort((x, y) => x.start - y.start);
  const records = plan.history.counters.filter((c) => c.slotIndex === e && c.counter === 'ghostCapture');
  /** フレーム f の判定が見るキャプチャー数（前のフレームの終わりの値） */
  const countAt = (f: number) => {
    let v = 0;
    for (const r of records) if (counterEffectiveFrom(r) <= f) v = r.value;
    return v;
  };
  const mine = plan.schedule!.activations.filter((x) => x.slotIndex === e);
  // バースト使用時の効果は遅れの表の発火のフレーム（III のタイマーの 00.00 の 1f 後。C-1315）
  const burstFrames = new Set(mine.map((x) => effectFrameOf(x)));
  // キャプチャー（値が 1 増えた記録。バーストのフレームの記録は除く）
  const captures = records.filter(
    (r, i) => r.value === (i === 0 ? 0 : records[i - 1]!.value) + 1 && !burstFrames.has(r.frame),
  );

  it('applies Possession at battle start and every 6 s, each lasting 6 s or until the capture', () => {
    expect(possessions.length).toBeGreaterThan(20);
    for (const [k, p] of possessions.entries()) {
      expect(p.end - p.start).toBeLessThanOrEqual(POSSESSION_FRAMES);
      if (k > 0) expect(p.start).toBeGreaterThanOrEqual(possessions[k - 1]!.end);
    }
    // 窓は戦闘開始から 6 秒ごとに始まる（キャプチャーの有無によらない）
    const starts = possessions.map((p) => p.start);
    for (let k = 2; k < starts.length; k++) expect(Math.abs(starts[k]! - starts[k - 1]! - 353)).toBeLessThanOrEqual(1);
  });

  it('adds a ghost on the shot reaching 100 hits of all allies in a Possession, and ends that Possession', () => {
    expect(captures.length).toBeGreaterThan(13);
    for (const c of captures) {
      const p = possessions.find((x) => x.start <= c.frame && c.frame < x.end);
      expect(p).toBeDefined();
      // 解除は射撃の回数のきっかけなので発の次のフレームに効き、その次のフレームで閉じる
      expect(p!.end).toBe(c.frame + 2);
    }
    // 憑依 1 回にキャプチャーは最大 1 回
    const per = possessions.map((p) => captures.filter((c) => p.start <= c.frame && c.frame < p.end).length);
    expect(Math.max(...per)).toBe(1);
    // 味方の命中も数える: エレグ：BS 自身の発が窓の中で 100 に届かなくても、キャプチャーが起きた窓がある
    const ownShots = plan.shots[e]!.frames;
    const helped = captures.filter((c) => {
      const p = possessions.find((x) => x.start <= c.frame && c.frame < x.end)!;
      return ownShots.filter((f) => p.start <= f && f <= c.frame).length < 100;
    });
    expect(helped.length).toBeGreaterThan(0);
  });

  it('gives Water allies the ATK up from 1 ghost and the elemental damage up from 4 ghosts', () => {
    for (const [h, slot] of input.slots.entries()) {
      if (slot === null) continue;
      const water = slot.character.element === 'Water';
      const pieces = (stat: string) =>
        slotPieces(plan, h).filter(
          (p) =>
            p.effect.source.resourceId === ELEGG_BS && p.effect.source.skill === 'skill1' && p.effect.stat === stat,
        );
      const attack = pieces('attack');
      const element = pieces('elementDamage');
      expect(attack.length > 0).toBe(water);
      expect(element.length > 0).toBe(water);
      for (const p of attack) expect(countAt(p.start)).toBeGreaterThanOrEqual(1);
      for (const p of element) expect(countAt(p.start)).toBeGreaterThanOrEqual(4);
    }
  });

  it('deals the S2 damage only on captures at 13 ghosts', () => {
    const s2 = plan.skillHits
      .filter((h) => h.slotIndex === e && h.effect.source.skill === 'skill2')
      .map((h) => h.frame);
    expect(s2).toEqual(captures.filter((c) => countAt(c.frame) === 13).map((c) => c.frame));
  });

  it('attacks 6 times and drops 6 ghosts (at least 1) below 13, and 13 times and 9 ghosts at 13', () => {
    expect(mine.length).toBeGreaterThan(0);
    const hits = plan.skillHits.filter((h) => h.slotIndex === e && h.effect.source.skill === 'burst');
    for (const [k, a] of mine.entries()) {
      const at = effectFrameOf(a);
      // 戦闘の終わりの後に出るヒットは数えない（13 ヒットの最後まで）
      const sequence = hits[0]!.effect;
      if (at + (sequence.delayFrames ?? 0) + (sequence.hitIntervalFrames ?? 0) * 12 >= plan.frames) continue;
      const before = countAt(at);
      const next = mine[k + 1]?.frame ?? plan.frames;
      const n = hits.filter((h) => at <= h.frame && h.frame < next).length;
      expect(n).toBe(before === 13 ? 13 : 6);
      const after = records.find((r) => r.frame === at)?.value ?? before;
      // 同じフレームにキャプチャーが重なれば、増減の和（+1）を足してから下限で止める
      const drop = before === 13 ? 9 : 6;
      const floor = before === 13 ? 0 : Math.min(1, before);
      expect([Math.max(floor, before - drop), Math.max(floor, before - drop + 1)]).toContain(after);
    }
  });
});

describe('バーストのキャプチャー数の▼（下限 1）', () => {
  // 憑依を 30 秒ごとだけにした定義（戦闘開始時の憑依を外す）で、1 回目のバースト（ゲージが満ちた時）をキャプチャーの前（0）にし、
  // 2 回目をキャプチャーの後（13 でない時）にする
  const raw = rawDefinition<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(ELEGG_BS);
  raw.skills.skill1.effects.shift();
  raw.skills.skill1.effects[0]!.trigger = { everySeconds: 30, carry: true };
  const input = fixedTeam([304, 232, ELEGG_BS, 300], 2, { noBurstSlots: [3] });
  input.slots[2] = fixedSlot(ELEGG_BS, { definition: raw });
  const plan = planTeamRun(input);
  const records = plan.history.counters.filter((c) => c.slotIndex === 2 && c.counter === 'ghostCapture');
  const valueAt = (f: number, after: boolean) =>
    records.filter((r) => (after ? r.frame <= f : r.frame < f)).at(-1)?.value ?? 0;
  const bursts = plan.schedule!.activations.filter((x) => x.slotIndex === 2).map((a) => effectFrameOf(a));

  it('keeps 0 when the burst comes before any capture, and stops at 1 when 6 would go below it', () => {
    const zero = bursts.filter((f) => valueAt(f, false) === 0);
    const low = bursts.filter((f) => valueAt(f, false) > 0 && valueAt(f, false) < 13);
    expect(zero.length).toBeGreaterThan(0);
    expect(low.length).toBeGreaterThan(0);
    for (const f of zero) expect(valueAt(f, true)).toBe(0);
    for (const f of low) expect(valueAt(f, true)).toBe(Math.max(1, valueAt(f, false) - 6));
  });
});
