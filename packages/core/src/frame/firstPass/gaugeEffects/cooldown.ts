// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、クールタイムの印のある周期の発火と、そのゲージ。
import { gameSecondsToFirstFrame } from '../../../time.ts';
import { resolveSkillCooldownDowns, resolveSkillCooldownReductions } from '../../../skills/resolve.ts';
import { cooldownTimer } from '../../../skills/timeline.ts';
import { advanceShotCount, type FrameEvents, shotCountWeight } from '../../../skills/triggers.ts';
import { isTimerTrigger, SKILL_SLOTS, type ShotCountKind } from '../../../skills/types.ts';
import type { SkillSlot } from '../../../types.ts';
import type { NamedStateId } from '../../../skills/states.ts';
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';
import type { Gauge } from '../gauge.ts';
import type { GaugeReserve } from './reserve.ts';

/** 自分のスロットの発動の出来事（FrameEvents.skillFired の 1 件） */
type SkillFiredEvent = NonNullable<FrameEvents['skillFired']>[number];
const NO_FIRES: readonly SkillFiredEvent[] = Object.freeze([]);

/** クールタイムの印のある周期の発火をフレームの順に追い、その枠の印のある burstGaugeHit のゲージを予約する */
export function createCooldownTimers({
  frames,
  hitGaugeEnergy,
  lists,
  reserveTimerGauge,
  shotEvents,
  slots,
}: FirstPassBase & Gauge & GaugeReserve) {
  // クールタイムの印のある周期は、枠 × スロットごとに発火をフレームの順に追う
  // （cooldownTimer。plan/design-arcana-magician.md 2.1 節）。縮めるのは、
  // 編成のどれかの定義の状態の中身の「スキル N クールタイム X%▼」で、そのフレームまでに登録した状態の件で決める。
  // 縮める状態が無ければ静的な周期と同じ列になる。2 パス目とゲージはこの記録だけを読む。
  // 自分の定義の即時の「スキル N のクールタイム X%▼」（skillCooldownReduction）は、きっかけの射撃を数え、そのフレームの発動の後に
  // 残りを (1 − X / 100) 倍にする（plan/design-centi.md 2.1 節。C-1219）
  const cooldownDowns = slots.flatMap((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveSkillCooldownDowns(slot.definition, slot.character, slot.levels),
  );
  const cooldownTimerFires: FirstPassResult['cooldownTimerFires'] = [];
  // 枠ごとの、クールタイムの印のある周期の発動を待たせる終わり（このフレームより前は発動しない）。撃ち切りで終わる使用武器の変更の
  // 最後の弾丸で、射手（firstPass/shooters.ts）が書く（WeaponChangeEffect.returnCooldownFrames。plan/design-snow-white.md 8.3 節の論点 7）
  const cooldownHoldUntil: number[] = slots.map(() => 0);
  const cooldownTrackers: {
    slotIndex: number;
    skill: SkillSlot;
    /** そのスロットを縮める状態と、その縮めた周期（フレーム） */
    downs: { state: NamedStateId; short: number }[];
    tick: ReturnType<typeof cooldownTimer>;
    /** 同じスロットの印のある burstGaugeHit の遅れ（ループの前の予約の代わりに、発火で予約する） */
    gaugeDelays: number[];
    /** そのスロットを即時に縮める効果（きっかけの射撃の数え・残りに掛ける割合） */
    cuts: { count: ShotCountKind; every: number; n: number; keep: number }[];
    /** 発火のフレーム（cooldownTimerFires の記録の frames と同じ配列） */
    fires: number[];
  }[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    const reductions = resolveSkillCooldownReductions(slot.definition, slot.character, slot.levels);
    for (const skill of SKILL_SLOTS) {
      const marked = slot.definition.skills[skill].effects.filter(
        (e) => 'trigger' in e && isTimerTrigger(e.trigger) && e.trigger.cooldown === true,
      );
      const first = marked[0];
      if (first === undefined || !('trigger' in first) || !isTimerTrigger(first.trigger)) continue;
      const { everySeconds } = first.trigger;
      const fires: number[] = [];
      cooldownTimerFires.push({ slotIndex, skill, frames: fires });
      cooldownTrackers.push({
        slotIndex,
        skill,
        downs: cooldownDowns
          .filter((d) => d.slot === skill)
          .map((d) => ({ state: d.state, short: gameSecondsToFirstFrame(everySeconds * (1 - d.percent / 100)) })),
        tick: cooldownTimer(gameSecondsToFirstFrame(everySeconds)),
        gaugeDelays: marked.flatMap((e) => (e.kind === 'burstGaugeHit' ? [e.delayFrames!] : [])),
        cuts: reductions
          .filter((c) => c.slot === skill)
          .map((c) => ({
            count: c.trigger.count,
            every: c.trigger.every,
            n: 0,
            keep: 1 - c.percent / 100,
          })),
        fires,
      });
    }
  });
  /** このフレームの射撃で、そのスロットを即時に縮める効果が残りに掛ける割合の積（無ければ undefined） */
  const cutAt = (t: (typeof cooldownTrackers)[number]): number | undefined => {
    const shot = shotEvents[t.slotIndex];
    if (t.cuts.length === 0 || shot === null || shot === undefined) return undefined;
    let keep: number | undefined;
    for (const c of t.cuts) {
      const counted = advanceShotCount(c.n, shotCountWeight(c.count, shot), c.every);
      c.n = counted.count;
      if (counted.fired) keep = (keep ?? 1) * c.keep;
    }
    return keep;
  };
  /** 前のフレームに発動した印のある周期（きっかけ { skillFired } の出来事。frameEvents が次のフレームの出来事に出す） */
  let firedBefore: readonly SkillFiredEvent[] = NO_FIRES;
  const skillFiredBefore = (): readonly SkillFiredEvent[] => firedBefore;
  /**
   * フレーム f の終わりに、印のある周期の発火を決める（f に付いた縮める状態の件と、f の射撃の即時の▼も見る）。発火したら記録し、その枠の
   * 印のある burstGaugeHit のゲージを遅れの後のフレームに予約する（ループの前の予約と同じ量）
   */
  const countCooldownTimers = (f: number): void => {
    let fired: SkillFiredEvent[] | undefined;
    for (const t of cooldownTrackers) {
      const i = t.slotIndex;
      const started = t.downs.find((d) => lists.stateStartedAt(i, d.state, f))?.short;
      const held = (): number | undefined => {
        const on = t.downs.filter((d) => lists.stateHeldAt(i, d.state, f));
        // 同じスロットを縮める状態が 2 つ同時に効く時の重ね方は確かめていない（使い手がいない。設計書 2.1 節）
        if (on.length > 1)
          throw new RangeError(`two or more states shorten the cooldown of ${t.skill} at once (not implemented)`);
        return on[0]?.short;
      };
      if (!t.tick(f, started, held, cutAt(t), f < cooldownHoldUntil[i]!)) continue;
      t.fires.push(f);
      if (t.skill !== 'burst') (fired ??= []).push({ slotIndex: i, skill: t.skill });
      const energy = hitGaugeEnergy(i);
      for (const d of t.gaugeDelays) if (f + d < frames) reserveTimerGauge(i, f, f + d, energy);
    }
    firedBefore = fired ?? NO_FIRES;
  };
  return { cooldownHoldUntil, cooldownTimerFires, countCooldownTimers, skillFiredBefore };
}
