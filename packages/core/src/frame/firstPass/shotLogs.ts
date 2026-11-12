// 1 パス目（../firstPass.ts の runFirstPassOnce）の射撃の記録（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// 枠ごとの射撃の記録（件の一覧が読むので、件の一覧の前に作る）と、チャージの溜めの周期と満ちた時の見張り。
import { gameSecondsToFrames } from '../../time.ts';
import { firesChargeShots } from '../../skills/resolve.ts';
import { type TimelineSlot } from '../../skills/timeline.ts';
import { chargeTriggersOf, hasReloadEndEffect } from '../../skills/types.ts';
import type { ShotLog } from '../shots.ts';

/** 撃ち切りで終わる使用武器の変更を、最後の発から何フレーム後に終えるか（ShotLog.weaponChangeEnds） */
export const WEAPON_CHANGE_END_DELAY = 1;

/** 枠ごとの射撃の記録と、チャージの見張りを作る */
export function createShotLogs({ slots }: { slots: readonly TimelineSlot[] }) {
  const logs: (ShotLog | null)[] = slots.map((slot) =>
    slot === null
      ? null
      : {
          frames: [],
          fullCharge: firesChargeShots(slot.definition, slot.character),
          lastShotFrames: [],
          hits: [],
          coreHits: [],
          critHits: [],
          pelletHits: [],
        },
  );
  // リロードの込め終わりは、それで終わる効果（durationUntil: reloadEnd。対象は自分）か、それで発火する解除
  // （{ reloadEnd }）を持つ枠だけが書く
  const writesReloadEnds = slots.map((slot) => slot?.definition != null && hasReloadEndEffect(slot.definition));
  // 溜めのきっかけ（{ chargeTick }・{ chargeFull }）を持つ枠だけ、溜めを追い、
  // 周期と満ちたフレームを射撃の記録に書く（流し直しも、このフレームの出来事も同じ列を読む。
  // plan/design-skill-stage14.md 2.1・2.6 節）。ticks の k はいまの溜めで発火した周期の数、
  // nextAt は k + 1 回目の周期の溜めの進み、fullDone はいまの溜めで満ちた時が発火したか（{ chargeFull } を持つ枠だけ chargeFullFrames を書く）
  const chargeWatches = slots.map((slot, i) => {
    if (slot?.definition == null) return null;
    const { tickSeconds, full } = chargeTriggersOf(slot.definition);
    if (tickSeconds.length === 0 && !full) return null;
    const log = logs[i]!;
    const ticks = tickSeconds.map((everySeconds) => {
      const entry = { everySeconds, frames: [] as number[] };
      (log.chargeTicks ??= []).push(entry);
      return { entry, k: 0, nextAt: gameSecondsToFrames(everySeconds) };
    });
    if (full) log.chargeFullFrames = [];
    return { ticks, fullDone: false };
  });
  /** 溜めを数え直す（撃った・溜めていないフレーム） */
  const restartCharge = (w: NonNullable<(typeof chargeWatches)[number]>): void => {
    for (const t of w.ticks) {
      if (t.k === 0) continue;
      t.k = 0;
      t.nextAt = gameSecondsToFrames(t.entry.everySeconds);
    }
    w.fullDone = false;
  };
  /**
   * 枠 i のフレーム f の溜め。progress は撃つ前の溜めの進み（chargeProgressFrames。溜めていなければ null）、shot は
   * このフレームに撃ったか（fullShot はフルチャージの発か）。撃ったフレームは周期を出さずに数え直し、満ちた時がまだならフルチャージの発の
   * フレームに出す（チャージ時間が縮んで満ちたフレームを飛ばした発も、その発に乗る）
   */
  const watchCharge = (
    i: number,
    f: number,
    progress: number | null,
    shot: boolean,
    fullShot: boolean,
    chargeFrames: number,
  ): void => {
    const w = chargeWatches[i]!;
    const log = logs[i]!;
    const charging = !shot && progress !== null && progress > 0;
    if (charging) {
      for (const t of w.ticks) {
        if (progress < t.nextAt) continue;
        // k + 1 回目の周期は溜め始めの floor((k + 1) × 間隔 ÷ 0.017) フレーム後（端数を持ち越す）。溜めが跳んでも 1 フレームに 1 回
        do {
          t.k += 1;
          t.nextAt = gameSecondsToFrames((t.k + 1) * t.entry.everySeconds);
        } while (progress >= t.nextAt);
        t.entry.frames.push(f);
      }
    }
    const full = shot ? fullShot : charging && progress >= chargeFrames;
    if (full && !w.fullDone && log.chargeFullFrames !== undefined) {
      w.fullDone = true;
      log.chargeFullFrames.push(f);
    }
    if (!charging) restartCharge(w);
  };
  return { chargeWatches, logs, watchCharge, writesReloadEnds };
}

export type ShotLogs = ReturnType<typeof createShotLogs>;
