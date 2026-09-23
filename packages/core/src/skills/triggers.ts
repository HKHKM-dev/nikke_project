// Stage 10: トリガーの判定を 1 か所にする（plan/design-stage10.md 1.2 節）。
// フレームごとの出来事（射撃・バーストの発動・フルバーストの開始 / 終了・ゲージ満タン）を 1 つずつ受け取り、
// そのフレームにトリガーが発火したかを返す。回数トリガーの数え上げもここに持つ。
//   - 1 パス目のフレームループ（sim/firstPass.ts）は、出来事が起きるたびに流す（射撃に効く効果だけ）。
//   - バッチの triggerFrames（skills/timeline.ts）は、確定した射撃の列と時刻表を同じ出来事の列に直して流し直す。
// どちらも同じコードを通るので、ループの中で見た発火と、あとで planBuffTimeline が作る窓が食い違わない。
import type { BurstActivation, BurstSchedule, BurstScheduleModel, BurstStepKey } from '../burst/schedule.ts';
import type { ShotLog } from '../sim/shots.ts';
import { isResolvedEventCount, isResolvedShotCount, type ResolvedTrigger } from './resolve.ts';

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

/**
 * 確定した射撃の列と時刻表を、出来事のあるフレームだけの FrameEvents の列（昇順）に直す。
 * 戦闘時間 frames の外（f ≥ frames）の出来事は含めない。フレーム 0 は常に含める（戦闘開始）
 */
export function replayEvents(
  schedule: BurstSchedule | null,
  shots: readonly (ShotLog | null)[],
  frames: number,
): FrameEvents[] {
  if (frames <= 0) return [];
  const slotCount = shots.length;
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
      if (w.start < frames) at(w.start).fullBurstStart = true;
      if (w.end < frames) at(w.end).fullBurstEnd = true;
    }
    for (const f of schedule.gaugeFullFrames) if (f < frames) at(f).gaugeFull = true;
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

/** トリガーが起きたフレーム列（昇順）。出来事の列を TriggerTracker に流し直す */
export function trackTriggerFrames(
  trigger: ResolvedTrigger,
  slotIndex: number,
  schedule: BurstSchedule | null,
  events: readonly FrameEvents[],
): number[] {
  const fires = createTriggerTracker(trigger, slotIndex, schedule?.model ?? null);
  const fired: number[] = [];
  for (const ev of events) if (fires(ev)) fired.push(ev.frame);
  return fired;
}
