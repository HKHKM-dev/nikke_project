// 1 パス目（../firstPass.ts の runFirstPassOnce）の仕組みごとの作り手が共通に受けるもの（plan/design-split-first-pass.md 3.4 節）:
// 入力と入力を整えた値、常時の値、件の一覧、射撃の記録、時刻表の読み口、発の飛ぶ時間、このフレームの射撃、当てた即時効果の記録。
import type { BurstActivation, BurstScheduleModel, FullBurstWindow } from '../../burst/schedule.ts';
import type { WeaponModel } from '../../weapons.ts';
import type { HolderLists } from '../../skills/holders.ts';
import type { FrameRange, resolvePassiveStates, TimelineSlot } from '../../skills/timeline.ts';
import type { ShotEvent } from '../../skills/triggers.ts';
import type { FirstPassOptions, InstantApplication } from '../firstPass.ts';
import type { ShotLog } from '../shots.ts';

export type FirstPassBase = {
  slots: readonly TimelineSlot[];
  options: FirstPassOptions;
  frames: number;
  passive: ReturnType<typeof resolvePassiveStates>;
  lists: HolderLists;
  logs: (ShotLog | null)[];
  controlledSlot: number | null;
  model: WeaponModel;
  untargetable: readonly FrameRange[];
  burstModel: BurstScheduleModel;
  /** 当てた即時効果の記録（チャージ・回復・ほか。発動の延長も入れ、窓が開かなかった延長は最後に捨てる） */
  instants: InstantApplication[];
  flights: (NonNullable<FirstPassOptions['flights']>[number] | null)[];
  /** 枠 i のフレーム f の発の飛ぶ時間 */
  shotFlightAt: (i: number, f: number) => number;
  /** このフレームの射撃（手順 1 が書く） */
  shotEvents: (ShotEvent | null)[];
  activationsOf: () => readonly BurstActivation[];
  windowsOf: () => readonly FullBurstWindow[];
};
