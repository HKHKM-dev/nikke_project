// 1 パス目（../firstPass.ts の runFirstPassOnce）のフレームの出来事（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// 発動・効果の発火・ヒット・段階・フルバーストの窓・ゲージの満タン・回復・フルスタック・撃ち切り・リロード・溜め・遮蔽物の
// 出来事を集め（手順 3 の頭）、回復と遮蔽物 HP 回復を件の登録の前に当てる。
import {
  effectFrameOf,
  hitFrameOf,
  stageEnterFrameOf,
  type BurstActivation,
  type BurstStepKey,
} from '../../burst/schedule.ts';
import { type ResolvedInstantEffect } from '../../skills/resolve.ts';
import { healFrameOf } from '../../skills/heals.ts';
import { fireContextOf, type FrameEvents } from '../../skills/triggers.ts';
import type { FirstPassBase } from './base.ts';
import { type FirstPassOptions, type InstantApplication } from '../firstPass.ts';
import type { InstantSources } from './instants.ts';
import type { BurstScheduleLayer } from './burst.ts';
import type { ShotPauses } from './shotPauses.ts';

/** フレームの出来事を集める手順と、回復を当てる手順を作る */
export function createFrameEvents({
  activationsOf,
  burstModel,
  burstPauseAim,
  burstUsePause,
  coverHeals,
  frames,
  gaugeFullOf,
  heals,
  instants,
  lists,
  logs,
  pauseLeft,
  shotEvents,
  slots,
  targetsAt,
  windowsOf,
}: FirstPassBase &
  InstantSources &
  BurstScheduleLayer &
  Pick<ShotPauses, 'burstUsePause' | 'burstPauseAim' | 'pauseLeft'> & {
    burstModel: NonNullable<FirstPassOptions['burstModel']>;
  } & { instants: InstantApplication[] }) {
  /** 先のフレームに効果が発火するバーストの発動（フレーム → 発動） */
  const pendingBurstEffects = new Map<number, BurstActivation[]>();
  /** 先のフレームのバーストのヒット（トリガー burstHit。plan/design-elegg.md 8.9 節） */
  const pendingBurstHits = new Map<number, BurstActivation[]>();
  /** 先のフレームの段階のきっかけ（stageEnterFrameOf。段階 3 は替わり目） */
  const pendingStageEntries = new Map<number, BurstStepKey[]>();
  let nextActivation = 0;
  let nextWindowStart = 0;
  let nextWindowEnd = 0;
  let gaugeFullSeen = 0;
  /** 次のフレーム以降に起きる回復（射撃の回数起点）。フレーム → 受ける枠 */
  const pendingHeals = new Map<
    number,
    { sourceSlotIndex: number; slotIndex: number; effect: ResolvedInstantEffect }[]
  >();
  /** このフレームに回復を受けた枠（FrameEvents.healed）。毎フレーム作らずに使い回す */
  const healed: boolean[] = slots.map(() => false);
  let healedDirty = false;
  /** 次のフレーム以降に遮蔽物 HP 回復を受ける枠（射撃の回数起点で、撃った枠と同じか前の枠）。フレーム → 受ける枠 */
  const pendingCoverHeals = new Map<number, number[]>();
  /** このフレームに遮蔽物 HP 回復を受けた枠（FrameEvents.coverHealed）。healed と同じく使い回す */
  const coverHealed: boolean[] = slots.map(() => false);
  let coverHealedDirty = false;
  /** このフレームの出来事を集める */
  const collectFrameEvents = (f: number): FrameEvents => {
    const activations = activationsOf();
    const now: BurstActivation[] = [];
    while (nextActivation < activations.length && activations[nextActivation]!.frame <= f) {
      if (activations[nextActivation]!.frame === f) now.push(activations[nextActivation]!);
      nextActivation += 1;
    }
    // 効果の発火は発動 + 遅れのフレーム。先のフレームなら積んでおく（遅れの無いキャラはこのフレーム）
    const burstEffects: BurstActivation[] = pendingBurstEffects.get(f) ?? [];
    if (burstEffects.length > 0) pendingBurstEffects.delete(f);
    for (const a of now) {
      const pause = burstUsePause[a.slotIndex]!;
      if (pause > 0) {
        pauseLeft[a.slotIndex] = Math.max(pauseLeft[a.slotIndex]!, pause);
        burstPauseAim[a.slotIndex] = pause;
      }
      const at = effectFrameOf(a);
      if (at === f) burstEffects.push(a);
      else if (at < frames) pendingBurstEffects.set(at, [...(pendingBurstEffects.get(at) ?? []), a]);
    }
    // ヒットのフレームも同じに積む（遅れの無いキャラは本当の発動か、III なら 00.00。hitFrameOf）
    for (const a of now) {
      const at = hitFrameOf(a);
      if (at < frames) pendingBurstHits.set(at, [...(pendingBurstHits.get(at) ?? []), a]);
    }
    const burstHits = pendingBurstHits.get(f);
    if (burstHits !== undefined) pendingBurstHits.delete(f);
    for (const a of now) {
      if (a.enteredStep === null) continue;
      const at = stageEnterFrameOf(a, burstModel);
      if (at < frames) pendingStageEntries.set(at, [...(pendingStageEntries.get(at) ?? []), a.enteredStep]);
    }
    const stageEntries = pendingStageEntries.get(f);
    if (stageEntries !== undefined) pendingStageEntries.delete(f);
    const windows = windowsOf();
    let fullBurstStart = false;
    let fullBurstStartUsers: readonly number[] = [];
    while (nextWindowStart < windows.length && windows[nextWindowStart]!.start <= f) {
      if (windows[nextWindowStart]!.start === f) {
        fullBurstStart = true;
        fullBurstStartUsers = windows[nextWindowStart]!.burstUsers;
      }
      nextWindowStart += 1;
    }
    let fullBurstEnd = false;
    let fullBurstEndUsers: readonly number[] = [];
    while (nextWindowEnd < windows.length && windows[nextWindowEnd]!.end <= f) {
      if (windows[nextWindowEnd]!.end === f) {
        fullBurstEnd = true;
        fullBurstEndUsers = windows[nextWindowEnd]!.burstUsers;
      }
      nextWindowEnd += 1;
    }
    const gaugeFulls = gaugeFullOf();
    let gaugeFull = false;
    while (gaugeFullSeen < gaugeFulls.length) {
      if (gaugeFulls[gaugeFullSeen] === f) gaugeFull = true;
      gaugeFullSeen += 1;
    }
    // 前のフレームの射撃で起きた回復（射撃の回数起点）はこのフレームの healed になる。
    // 出来事はこのフレームの判定にしか使わないので、配列は使い回す（立てたフレームの次に戻す）
    if (healedDirty) {
      healed.fill(false);
      healedDirty = false;
    }
    const due = pendingHeals.size > 0 ? pendingHeals.get(f) : undefined;
    for (const h of due ?? []) {
      healed[h.slotIndex] = true;
      healedDirty = true;
      instants.push({
        frame: f,
        sourceSlotIndex: h.sourceSlotIndex,
        slotIndex: h.slotIndex,
        effect: h.effect,
        amount: 0,
      });
    }
    if (due !== undefined) pendingHeals.delete(f);
    // このフレームにフルスタックになった状態を消費する（回復のきっかけ { fullStack }。plan/design-skill-stage3.md 1.3 節）。
    // フルスタックになる件は、射撃の回数のきっかけの付与なので前のフレームまでに登録済み
    const fullStacks = lists.consumeFullStacks(f);
    // このフレームに使用武器の変更（撃ち切り）が終わった枠（plan/design-skill-stage11.md 2.2.1 節）
    const weaponChangeEnds = logs.flatMap((log, i) => (log?.weaponChangeEnds?.at(-1) === f ? [i] : []));
    // このフレームがリロードの込め終わりの次のフレームの枠（plan/design-skill-stage16.md 2.2 節）
    const reloadEnds = logs.flatMap((log, i) => (log?.reloadEnds?.at(-1) === f ? [i] : []));
    // このフレームの溜めの周期と満ちた時（手順 1 の射手が射撃の記録に書いた）
    const chargeTicks = logs.flatMap(
      (log, i) =>
        log?.chargeTicks?.flatMap((t) =>
          t.frames.at(-1) === f ? [{ slotIndex: i, everySeconds: t.everySeconds }] : [],
        ) ?? [],
    );
    const chargeFulls = logs.flatMap((log, i) => (log?.chargeFullFrames?.at(-1) === f ? [i] : []));
    // このフレームに遮蔽物 HP 回復を受けた枠（前のフレームの射撃で起きたものから。このフレームの分は下で足す）
    if (coverHealedDirty) {
      coverHealed.fill(false);
      coverHealedDirty = false;
    }
    const dueCover = pendingCoverHeals.size > 0 ? pendingCoverHeals.get(f) : undefined;
    if (dueCover !== undefined) {
      for (const i of dueCover) coverHealed[i] = true;
      coverHealedDirty = true;
      pendingCoverHeals.delete(f);
    }
    const ev: FrameEvents = {
      frame: f,
      shots: shotEvents,
      activations: now,
      burstEffects,
      ...(burstHits !== undefined ? { burstHits } : {}),
      fullBurstStart,
      fullBurstEnd,
      gaugeFull,
      fullBurstStartUsers,
      fullBurstEndUsers,
      healed,
      ...(fullStacks.length > 0 ? { fullStacks } : {}),
      ...(weaponChangeEnds.length > 0 ? { weaponChangeEnds } : {}),
      ...(reloadEnds.length > 0 ? { reloadEnds } : {}),
      ...(coverHeals.length > 0 ? { coverHealed } : {}),
      ...(chargeTicks.length > 0 ? { chargeTicks } : {}),
      ...(chargeFulls.length > 0 ? { chargeFulls } : {}),
      ...(stageEntries !== undefined ? { stageEntries } : {}),
    };
    return ev;
  };
  /** 回復と遮蔽物 HP 回復を、件の登録の前に当てる */
  const applyHeals = (ev: FrameEvents, f: number): void => {
    // 回復を先に当てる。射撃の回数起点は、撃った枠より後ろの枠にはこのフレーム、ほかの枠には次のフレームに送り（V-0490）、
    // それ以外はこのフレームの healed に立てる。対象の順位（topAttack）は、このフレームの件を登録する前に出す（回復を受けた時の
    // 攻撃力▲を含め、このフレームに付く窓は入れない。plan/design-heal-top-attack.md 2 節の A）
    for (const src of heals) {
      if (!src.fires(ev)) continue;
      // 発火の条件（自分の状態。plan/design-mint-prika.md 2.7 節）。回復は件の登録の前に当てる（healed のきっかけが読む）ので、
      // このフレームの件の登録より前に見る（同じフレームに付いた状態は見えない。ミントのダンスはバーストで付き、条件を読むフルチャージは後の発）
      if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, f)) continue;
      const context = lists.rankContext(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
        const at = healFrameOf(src.effect, f, src.sourceSlotIndex, target);
        if (at < frames && !lists.applyHeal(src.effect, src.sourceSlotIndex, target, at)) continue;
        if (at === f) {
          healed[target] = true;
          healedDirty = true;
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: 0,
          });
        } else if (at < frames) {
          const list = pendingHeals.get(at) ?? [];
          list.push({ sourceSlotIndex: src.sourceSlotIndex, slotIndex: target, effect: src.effect });
          pendingHeals.set(at, list);
        }
      }
    }
    // 遮蔽物 HP 回復も回復と同じく件の登録の前に当てる（同じフレームの { coverHealed } の timed が読む）
    for (const src of coverHeals) {
      if (!src.fires(ev)) continue;
      for (const target of src.targets) {
        const at = healFrameOf(src.effect, f, src.sourceSlotIndex, target);
        if (at === f) {
          coverHealed[target] = true;
          coverHealedDirty = true;
        } else if (at < frames) {
          const list = pendingCoverHeals.get(at) ?? [];
          if (!list.includes(target)) list.push(target);
          pendingCoverHeals.set(at, list);
        }
      }
    }
  };
  return { applyHeals, collectFrameEvents };
}

export type FrameEventsLayer = ReturnType<typeof createFrameEvents>;
