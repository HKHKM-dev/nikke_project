// 1 パス目（../firstPass.ts の runFirstPassOnce）の仕組みごとの作り手が共通に受けるもの（plan/design-split-first-pass.md 3.4 節）:
// 入力、常時の値、件の一覧、射撃の記録、時刻表の読み口、発の飛ぶ時間、このフレームの射撃。
import type { BurstActivation, FullBurstWindow } from '../../burst/schedule.ts';
import type { HolderLists } from '../../skills/holders.ts';
import type { resolvePassiveStates, TimelineSlot } from '../../skills/timeline.ts';
import type { ResolvedDamageEffect } from '../../skills/burstDamage.ts';
import type { ShotEvent } from '../../skills/triggers.ts';
import type { FirstPassOptions } from '../firstPass.ts';
import type { ShotLog } from '../shots.ts';

export type FirstPassBase = {
  slots: readonly TimelineSlot[];
  options: FirstPassOptions;
  frames: number;
  passive: ReturnType<typeof resolvePassiveStates>;
  lists: HolderLists;
  logs: (ShotLog | null)[];
  controlledSlot: number | null;
  flights: (NonNullable<FirstPassOptions['flights']>[number] | null)[];
  /** 枠 i のフレーム f の発の飛ぶ時間 */
  shotFlightAt: (i: number, f: number) => number;
  /** このフレームの射撃（手順 1 が書く） */
  shotEvents: (ShotEvent | null)[];
  activationsOf: () => readonly BurstActivation[];
  windowsOf: () => readonly FullBurstWindow[];
  /** 枠ごとの倍率ダメージ（枠ごとに 1 回だけ解く） */
  damageEffects: ResolvedDamageEffect[][];
};
