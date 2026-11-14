// 1 パス目（../firstPass.ts の runFirstPassOnce）のバースト（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// バーストの状態機械（件の一覧がフルバーストの窓を読むので、効果の準備の前に作る）と、フレームごとに状態機械を進める手順・狙えない窓・発動の延長。
import { planFixedCycle } from '../../burst/fixedCycle.ts';
import { gameSecondsToFrames } from '../../time.ts';
import {
  DEFAULT_BURST_TIMING,
  initialBurstController,
  shortenCooldown,
  stepBurstController,
  type BurstControllerState,
} from '../../burst/controller.ts';
import { burstCandidateOf, burstUnitOf } from '../../burst/dynamic.ts';
import type { BurstActivation, BurstSchedule, BurstScheduleModel } from '../../burst/schedule.ts';
import type { TimelineSlot } from '../../skills/timeline.ts';
import type { FirstPassBase } from './base.ts';
import type { FirstPassOptions, InstantApplication } from '../firstPass.ts';
import type { InstantSources } from './instants.ts';

/** バーストの状態機械（動的）か固定サイクルの時刻表を作り、発動・窓・ゲージの満タンの読み口を返す */
export function createBurstSchedule({
  burstModel,
  frames,
  options,
  slots,
}: {
  slots: readonly TimelineSlot[];
  options: FirstPassOptions;
  frames: number;
  burstModel: BurstScheduleModel;
}) {
  // ---- バーストの状態機械（件の一覧がフルバーストの窓を読むので、効果の準備の前に作る） ----
  let controller: BurstControllerState | null = null;
  let fixed: BurstSchedule | null = null;
  if (options.manualBursts !== undefined && !options.burst) throw new RangeError('manualBursts needs burst');
  if (options.noBurstSlots !== undefined && !options.burst) throw new RangeError('noBurstSlots needs burst');
  if (options.burst) {
    if (burstModel === 'fixed') {
      if (options.manualBursts !== undefined) throw new RangeError('manualBursts needs the dynamic burst model');
      if (options.noBurstSlots !== undefined) throw new RangeError('noBurstSlots needs the dynamic burst model');
      fixed = planFixedCycle(
        slots.map((s) => (s === null ? null : burstCandidateOf(s.character, s.definition))),
        frames,
      );
    } else {
      controller = initialBurstController(
        slots.map((s, i) =>
          s === null || options.noBurstSlots?.includes(i) === true ? null : burstUnitOf(s.character, s.definition),
        ),
        options.timing ?? DEFAULT_BURST_TIMING,
        options.manualBursts ?? null,
      );
    }
  }
  const activationsOf = (): readonly BurstActivation[] => controller?.activations ?? fixed?.activations ?? [];
  const windowsOf = () => controller?.windows ?? fixed?.fullBurstWindows ?? [];
  const gaugeFullOf = (): readonly number[] => controller?.gaugeFullFrames ?? [];
  return { activationsOf, controller, fixed, gaugeFullOf, windowsOf };
}

export type BurstScheduleLayer = ReturnType<typeof createBurstSchedule>;

/** フレームごとにバーストの状態機械を進める手順と、狙えない窓・発動の延長を作る */
export function createBurstStep({
  activationExtensions,
  controller,
  instants,
  lists,
  passive,
  untargetable,
}: FirstPassBase & InstantSources & BurstScheduleLayer) {
  // T4 の▼ の件を持ちうる枠の、最後の発動（発動の後に付いた▼ の縮めた長さを足す先）
  const lastActivationOf = new Map<number, BurstActivation>();
  // まだ窓に足していない延長（予約）の記録。窓を作ったら残し、窓を作らずにチェーンが切れたら（状態機械が予約を捨てる）か
  // 戦闘の終わりまで残ったら、即時効果の記録から外す（効かなかった延長を画面と trace に出さない）
  let pendingExtensions: InstantApplication[] = [];
  const discardedExtensions = new Set<InstantApplication>();
  const reserveExtension = (x: InstantApplication): void => {
    instants.push(x);
    pendingExtensions.push(x);
  };
  // バースト使用時の延長は、発動のたびに状態機械が聞く（条件は発動のフレームの件で見る。窓を作る発動ならその窓に、
  // 作らない発動なら次の窓に足す）
  if (controller !== null && activationExtensions.length > 0) {
    controller.extensionAtActivation = (slotIndex, frame) => {
      let seconds = 0;
      for (const src of activationExtensions) {
        if (src.sourceSlotIndex !== slotIndex) continue;
        if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, frame)) continue;
        seconds += src.effect.value;
        reserveExtension({
          frame,
          sourceSlotIndex: slotIndex,
          slotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
      }
      return seconds;
    };
  }
  /** いま見ている（または次に来る）狙えない窓の添字 */
  let nextBlock = 0;
  /** フレーム f が狙えない窓の中か */
  const blockedAt = (f: number): boolean => {
    while (nextBlock < untargetable.length && untargetable[nextBlock]!.end < f) nextBlock += 1;
    const block = untargetable[nextBlock];
    return block !== undefined && block.start <= f && f < block.end;
  };
  /** このフレームのゲージを足して、状態機械を 1 フレーム進める（手順 2） */
  const stepBurst = (gauge: number, f: number, blocked: boolean): void => {
    if (controller !== null) {
      const before = controller.activations.length;
      const windowsBefore = controller.windows.length;
      const timeoutsBefore = controller.chainTimeouts.length;
      stepBurstController(controller, f, gauge, blocked);
      // 予約した延長は、窓を作ったら足され、窓を作らずにチェーンが切れたら捨てられる（burst/controller.ts の resetChain）
      if (pendingExtensions.length > 0) {
        const timedOut = controller.chainTimeouts.length > timeoutsBefore;
        if (timedOut) for (const x of pendingExtensions) discardedExtensions.add(x);
        if (timedOut || controller.windows.length > windowsBefore) pendingExtensions = [];
      }
      // バーストスキルのクールタイム▼ の維持の付いた形（T4。
      // 「その間スキル自体のクールタイムを変える」。plan/design-skill-stage11.md 3.3 節。V-0530）。
      // このフレームに発動した枠に効いている秒（f − 1 までに付いた件）だけ、その発動の
      // CT を短くする（明けるのは発動のフレームより前にしない）。常時（戦闘開始から持続の静的な状態の中身も）と時間で変わる件の和。
      // 即時の CT▼（reduceCooldown）とは別で、cooldownReductions に残さず、縮めた長さは発動の cooldownShortenedFrames に残す
      // 時間で変わる件は、発動の前のフレームに効いていた件だけ
      // （発動のフレームより後に付いた件は、下の「発動の後に付いた▼」が縮める。同じ件を 2 回数えない。plan/design-skill-stage15.md 2.2 節。V-0566）
      const shorten = (a: BurstActivation, seconds: number) => {
        const applied = shortenCooldown(controller!, a.slotIndex, gameSecondsToFrames(seconds), f);
        if (applied > 0) a.cooldownShortenedFrames = (a.cooldownShortenedFrames ?? 0) + applied;
      };
      for (let i = before; i < controller.activations.length; i++) {
        const a = controller.activations[i]!;
        const seconds = (passive[a.slotIndex]?.buffs.burstCooldown ?? 0) + lists.burstCooldownAt(a.slotIndex, f - 1);
        if (seconds > 0) shorten(a, seconds);
        if (lists.hasBurstCooldownTracks(a.slotIndex)) lastActivationOf.set(a.slotIndex, a);
      }
      // 発動の後に付いた T4 の▼（ティアの S1 のように、同じ発動から付いたものも）は、走っている CT をその場で
      // 縮める（V-0566。単騎のティアの発動の間隔が 40 秒より短い）。前のフレームに始まった件を、そのフレームより前に発動した CT に当てる
      // （このフレームに発動した枠は、上の発動の前のフレームの件で数えた）
      for (const last of lastActivationOf.values()) {
        if (last.frame >= f || controller.cooldownEnd[last.slotIndex]! <= f) continue;
        const seconds = lists.burstCooldownStartedAt(last.slotIndex, f - 1);
        if (seconds > 0) shorten(last, seconds);
      }
    }
  };
  /** 戦闘の終わりまでに窓が開かなかった発動の延長を、捨てた延長に入れる */
  const discardPendingExtensions = (): void => {
    for (const x of pendingExtensions) discardedExtensions.add(x);
  };
  return { blockedAt, discardedExtensions, discardPendingExtensions, reserveExtension, stepBurst };
}

export type BurstStep = ReturnType<typeof createBurstStep>;
