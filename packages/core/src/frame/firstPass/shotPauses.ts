// 1 パス目（../firstPass.ts の runFirstPassOnce）の射撃の止まり（plan/design-split-first-pass.md 3.4 節・9.3 節）: 射撃の回数で止まる
// 止まり（shotPause）・自分のバーストの発動の止まり・状態が付いた時の止まり。止めるフレーム数は射手（手順 1）が減らす。
import { resolveAppliedPauses, resolveBurstUsePause, resolveShotPauses } from '../../skills/burstDamage.ts';
import { advanceShotCount, shotCountWeight, type ShotCountEveryAt } from '../../skills/triggers.ts';
import type { ShotCountKind } from '../../skills/types.ts';
import type { FirstPassBase } from './base.ts';

/** 射撃の止まりを追う */
export function createShotPauses({ lists, logs, shotEvents, slots }: FirstPassBase) {
  // V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717・C-0718）: 射撃の止まり（shotPause）。射撃を数えて、発火した射撃の次のフレームから
  // 止めるフレーム数のあいだ射手を進めない（pauseLeft。手順 1 で減らす）。発火した射撃がマガジンの最後の弾丸なら framesOnLastShot
  // 回数の間隔の変更（cycleEvery の shotCounts）の窓の中は、通算の回数が窓の
  // 間隔の倍数に届いた発で止める（C-0727。plan/design-skill-stage12.md 2.4 節）。
  // 窓の件はこのフレームに付いたものも見るので、段の循環と同じく手順 3 の後に数える（countShotPauses）
  const shotPauseTrackers: {
    slotIndex: number;
    everyAt: ShotCountEveryAt | undefined;
    count: ShotCountKind;
    every: number;
    frames: number;
    framesOnLastShot: number;
    n: number;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const t of resolveShotPauses(slot.definition, slot.character, slot.levels)) {
      if (t.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      const { skill, ...rest } = t;
      shotPauseTrackers.push({ slotIndex: i, ...rest, everyAt: lists.shotCountEveryOf(i, skill), n: 0 });
    }
  });
  const pauseLeft = slots.map(() => 0);
  // 自分のバーストの発動の次のフレームから止めるフレーム数（手順 3 で立てる）
  // 立っている止まりの、明けで構え直すときに unhideShooter に渡す止めたフレーム数（0 は立っていない。
  // 射撃の回数の止まりと区別する。plan/design-privaty-burst-pause.md 2 節）
  const burstPauseAim = slots.map(() => 0);
  const burstUsePause = slots.map((slot) =>
    slot === null || slot.definition === null ? 0 : resolveBurstUsePause(slot.definition),
  );
  // 状態が付いた時の止まり（気絶。plan/design-maids.md 2.2 節）。手順 1 で、前のフレームに無かった状態が付いていれば立て、
  // 明けまでバーストの候補からも外す（論点 2）。明けは、バーストの発動の止まりと同じく構え直す
  const appliedPauses = slots.map((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveAppliedPauses(slot.definition).map((p) => ({ ...p, was: false })),
  );

  /**
   * V-0534: 射撃の止まり。このフレームの射撃で発火したら、次のフレームから止める。回数の間隔の変更の窓を
   * このフレームに付いたものも見るので、手順 3 の後に呼ぶ（止まりは次のフレームからなので、数える位置で射撃は変わらない）
   */
  const countShotPauses = (f: number): void => {
    for (const t of shotPauseTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.everyAt?.(f) ?? t.every);
      t.n = counted.count;
      if (counted.fired) pauseLeft[t.slotIndex] = shot.lastShot ? t.framesOnLastShot : t.frames;
    }
  };
  return { appliedPauses, burstPauseAim, burstUsePause, countShotPauses, pauseLeft };
}

export type ShotPauses = ReturnType<typeof createShotPauses>;
