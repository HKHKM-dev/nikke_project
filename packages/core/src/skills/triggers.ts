// Stage 10: トリガーの判定を 1 か所にする（plan/design-stage10.md 1.2 節）。
// フレームごとの出来事（射撃・バーストの発動・フルバーストの開始 / 終了・ゲージ満タン）を 1 つずつ受け取り、
// そのフレームにトリガーが発火したかを返す。回数トリガーの数え上げもここに持つ。
//   - 1 パス目のフレームループ（frame/firstPass.ts）は、出来事が起きるたびに流す（射撃に効く効果だけ）。
//   - バッチの triggerFrames（skills/timeline.ts）は、確定した射撃の列と時刻表を同じ出来事の列に直して流し直す。
// どちらも同じコードを通るので、ループの中で見た発火と、あとで planBuffTimeline が作る窓が食い違わない。
// Stage 11: 出来事に「回復を受けた」（healed）と、フルバーストを開いたチェーンの枠（burstUsers。発火の文脈）を足した
// （plan/design-stage11.md 3 節）。
import type { BurstActivation, BurstSchedule, BurstScheduleModel, BurstStepKey } from '../burst/schedule.ts';
import type { ShotLog } from '../frame/shots.ts';
import { isResolvedEventCount, isResolvedShotCount, type ResolvedTrigger } from './resolve.ts';
import type { FireContext } from './targets.ts';

/** 1 枠の 1 回の射撃 */
export type ShotEvent = {
  /** この射撃で残弾が 0 になったか（「最後の弾丸」） */
  lastShot: boolean;
  /** チャージ武器の射撃か（常にフルチャージのモデルなので fullChargeShot になる） */
  fullCharge: boolean;
};

/** 1 フレームの出来事 */
export type FrameEvents = {
  frame: number;
  /** 枠ごとの射撃。撃たなかった枠・空枠は null */
  shots: readonly (ShotEvent | null)[];
  /** このフレームのバーストの発動（時刻表の順） */
  activations: readonly BurstActivation[];
  fullBurstStart: boolean;
  /** フルバーストが終わった（戦闘時間で切られた最後の窓の end = frames は来ない） */
  fullBurstEnd: boolean;
  gaugeFull: boolean;
  /** Stage 11: 始まった / 終わったフルバーストを開いたチェーンの枠（FullBurstWindow.burstUsers）。無ければ空 */
  fullBurstStartUsers: readonly number[];
  fullBurstEndUsers: readonly number[];
  /** Stage 11: 枠ごとに、このフレームに回復を受けたか（heal 効果の対象になった） */
  healed: readonly boolean[];
};

/** 回復の記録（Stage 11）。frame に slotIndex の枠が sourceSlotIndex の heal 効果で回復を受けた */
export type HealRecord = {
  frame: number;
  sourceSlotIndex: number;
  slotIndex: number;
};

const STAGE_OF: Record<'burstStage1Enter' | 'burstStage2Enter' | 'burstStage3Enter', BurstStepKey> = {
  burstStage1Enter: 'Step1',
  burstStage2Enter: 'Step2',
  burstStage3Enter: 'Step3',
};

/** 1 つのトリガーの発火判定。フレームの昇順に呼ぶ（出来事の無いフレームは飛ばしてよい）。このフレームに発火したら true */
export type TriggerTracker = (ev: FrameEvents) => boolean;

/**
 * 1 つのトリガー（ある枠の 1 つの効果）の発火を追う。回数トリガーの数は閉包の中に持つ。
 * scheduleModel は「バースト 1 段階突入時」の意味だけに使う（固定サイクルはフルバースト開始、動的サイクルはゲージ満タン）
 */
export function createTriggerTracker(
  trigger: ResolvedTrigger,
  slotIndex: number,
  scheduleModel: BurstScheduleModel | null,
): TriggerTracker {
  let count = 0;
  const t = trigger;
  if (isResolvedShotCount(t)) {
    return (ev) => {
      const shot = ev.shots[slotIndex];
      if (!shot) return false;
      if (t.count === 'fullChargeShot' && !shot.fullCharge) return false;
      if (t.count === 'lastShot' && !shot.lastShot) return false;
      count += 1;
      return count % t.every === 0;
    };
  }
  if (isResolvedEventCount(t)) {
    return (ev) => {
      const happened =
        t.count === 'burstUse' ? ev.activations.some((a) => a.slotIndex === slotIndex) : ev.fullBurstStart;
      if (!happened) return false;
      // 回数は戦闘中ずっと数える。atLeast 回目以降の発動のたびに発火する（下位効果のスタック適用）
      count += 1;
      return count >= t.atLeast;
    };
  }
  switch (t) {
    case 'battleStart':
      return (ev) => ev.frame === 0;
    case 'burstUse':
      return (ev) => ev.activations.some((a) => a.slotIndex === slotIndex);
    case 'fullBurstStart':
      return (ev) => ev.fullBurstStart;
    case 'fullBurstEnd':
      return (ev) => ev.fullBurstEnd;
    case 'healed':
      return (ev) => ev.healed[slotIndex] === true;
    case 'burstStage1Enter':
    case 'burstStage2Enter':
    case 'burstStage3Enter': {
      const step = STAGE_OF[t];
      return (ev) => {
        if (ev.activations.some((a) => a.enteredStep === step)) return true;
        if (step !== 'Step1') return false;
        return scheduleModel === 'fixed' ? ev.fullBurstStart : ev.gaugeFull;
      };
    }
  }
}

/** Stage 11: 発火したトリガーの文脈（対象 burstUsers の判定に使う）。フルバーストの開始・終了だけが枠の列を持つ */
export function fireContextOf(trigger: ResolvedTrigger, ev: FrameEvents): FireContext {
  if (trigger === 'fullBurstStart') return { burstUsers: ev.fullBurstStartUsers };
  if (trigger === 'fullBurstEnd') return { burstUsers: ev.fullBurstEndUsers };
  return null;
}

/**
 * 確定した射撃の列と時刻表を、出来事のあるフレームだけの FrameEvents の列（昇順）に直す。
 * 戦闘時間 frames の外（f ≥ frames）の出来事は含めない。フレーム 0 は常に含める（戦闘開始）。
 * Stage 11: heals（skills/heals.ts の planHeals）の回復を healed として書き込む。省略時は回復なし
 */
export function replayEvents(
  schedule: BurstSchedule | null,
  shots: readonly (ShotLog | null)[],
  frames: number,
  heals: readonly HealRecord[] = [],
): FrameEvents[] {
  if (frames <= 0) return [];
  const slotCount = shots.length;
  // 出来事のあるフレームは射撃ごとにできるので、空の列は共有し、回復が起きたフレームだけ配列を作る
  const noUsers: readonly number[] = [];
  const noHeal: readonly boolean[] = Array.from({ length: slotCount }, () => false);
  const byFrame = new Map<number, FrameEvents>();
  const at = (frame: number): FrameEvents => {
    let ev = byFrame.get(frame);
    if (ev === undefined) {
      ev = {
        frame,
        shots: Array.from({ length: slotCount }, () => null),
        activations: [],
        fullBurstStart: false,
        fullBurstEnd: false,
        gaugeFull: false,
        fullBurstStartUsers: noUsers,
        fullBurstEndUsers: noUsers,
        healed: noHeal,
      };
      byFrame.set(frame, ev);
    }
    return ev;
  };
  at(0);
  shots.forEach((log, slotIndex) => {
    if (!log) return;
    const last = new Set(log.lastShotFrames ?? []);
    for (const f of log.frames) {
      if (f >= frames) break;
      (at(f).shots as (ShotEvent | null)[])[slotIndex] = { lastShot: last.has(f), fullCharge: log.fullCharge };
    }
  });
  if (schedule !== null) {
    for (const a of schedule.activations) if (a.frame < frames) (at(a.frame).activations as BurstActivation[]).push(a);
    for (const w of schedule.fullBurstWindows) {
      if (w.start < frames) {
        const ev = at(w.start);
        ev.fullBurstStart = true;
        ev.fullBurstStartUsers = w.burstUsers;
      }
      if (w.end < frames) {
        const ev = at(w.end);
        ev.fullBurstEnd = true;
        ev.fullBurstEndUsers = w.burstUsers;
      }
    }
    for (const f of schedule.gaugeFullFrames) if (f < frames) at(f).gaugeFull = true;
  }
  for (const h of heals) {
    if (h.frame < 0 || h.frame >= frames || h.slotIndex >= slotCount) continue;
    const ev = at(h.frame);
    if (ev.healed === noHeal) ev.healed = [...noHeal];
    (ev.healed as boolean[])[h.slotIndex] = true;
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

/** Stage 11: トリガーの発火（フレームと文脈） */
export type TriggerFire = { frame: number; context: FireContext };

/** トリガーが起きたフレームと文脈の列（昇順）。出来事の列を TriggerTracker に流し直す */
export function trackTriggerFires(
  trigger: ResolvedTrigger,
  slotIndex: number,
  schedule: BurstSchedule | null,
  events: readonly FrameEvents[],
): TriggerFire[] {
  const fires = createTriggerTracker(trigger, slotIndex, schedule?.model ?? null);
  const fired: TriggerFire[] = [];
  for (const ev of events) if (fires(ev)) fired.push({ frame: ev.frame, context: fireContextOf(trigger, ev) });
  return fired;
}

/** トリガーが起きたフレーム列（昇順）。出来事の列を TriggerTracker に流し直す */
export function trackTriggerFrames(
  trigger: ResolvedTrigger,
  slotIndex: number,
  schedule: BurstSchedule | null,
  events: readonly FrameEvents[],
): number[] {
  return trackTriggerFires(trigger, slotIndex, schedule, events).map((f) => f.frame);
}
