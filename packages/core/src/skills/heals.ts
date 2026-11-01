// Stage 11: 回復（heal 効果）のフレームの規則（plan/design-stage11.md 3.3 節）。
// 回復はダメージに関係しないが、「回復効果が適用された時」（トリガー healed）のきっかけになる。回復は 1 パス目のループが当て
// （frame/firstPass.ts）、記録は持ち主ごとの一覧の履歴（skills/holders.ts の heals）に残る。
// V-0024: 維持時間のある heal（吸収回復）は、同じ効果の窓が付いている対象への付き直しでは記録を作らず、窓を延ばすだけ
// （plan/design-heal-window.md 1.1 節、C-0082。件は効果ごと・対象の枠ごと。skills/holders.ts の applyHeal）。
import { isResolvedShotCount, type ResolvedInstantEffect } from './resolve.ts';

/**
 * 回復の起きるフレーム。射撃の回数起点は、受ける枠が撃った枠より後ろならトリガーと同じフレーム（同じフレームの後ろの枠の発に
 * 間に合う）、ほかの枠（自分と前の枠）にはトリガーの次のフレーム（窓の開始と同じ規則）。V-0490: マナ（撃つ枠）の 10 発目と同じ
 * フレームのアスカの発は、アスカが後ろの枠なら回復で付いた S1 あり、前の枠なら S1 なし（操作の別によらない）。
 * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: delayFrames を書いた回復は、どの枠にもトリガーの delayFrames 後
 * （そのフレームの始めに当てるので、そのフレームのどの枠の発にも間に合う）。ミサト S1 は前の枠のアスカの 5f 後の発に乗らない（C-0652）
 */
export function healFrameOf(
  effect: { trigger: ResolvedInstantEffect['trigger']; delayFrames?: number },
  fireFrame: number,
  sourceSlotIndex: number,
  targetSlotIndex: number,
): number {
  if (!isResolvedShotCount(effect.trigger)) return fireFrame;
  if (effect.delayFrames !== undefined) return fireFrame + effect.delayFrames;
  return targetSlotIndex > sourceSlotIndex ? fireFrame : fireFrame + 1;
}
