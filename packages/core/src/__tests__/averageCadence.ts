// 枠の平均レート（cadence.ts の閉じた式）。射撃の列（frame/shooter.ts）から数えた発数と比べるテストが、基準に使う。
// 常時分の射撃バフまでを畳み込み、持続の射撃バフは含まない
import { computeCadence, type CadenceResult } from '../cadence.ts';
import { firingParams } from '../frame/firing.ts';
import type { TeamSlotResult } from '../team.ts';

/** 枠の常時分の平均レート（既定の武器モデル） */
export function averageCadence(slot: Pick<TeamSlotResult, 'character' | 'passiveBuffs'>): CadenceResult {
  const { shot } = slot.character;
  return computeCadence(shot, undefined, firingParams(shot, slot.passiveBuffs));
}
