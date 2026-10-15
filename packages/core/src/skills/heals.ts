// Stage 11: 回復（heal 効果）のフレームの規則（plan/design-stage11.md 3.3 節）。
// 回復はダメージに関係しないが、「回復効果が適用された時」（トリガー healed）のきっかけになる。回復は 1 パス目のループが当て
// （frame/firstPass.ts）、記録は持ち主ごとの一覧の履歴（skills/holders.ts の heals）に残る。
// V-0024: 維持時間のある heal（吸収回復）は、同じ効果の窓が付いている対象への付き直しでは記録を作らず、窓を延ばすだけ
// （plan/design-heal-window.md 1.1 節、C-0082。件は効果ごと・対象の枠ごと。skills/holders.ts の applyHeal）。
import { isResolvedShotCount, type ResolvedInstantEffect } from './resolve.ts';

/** 回復の起きるフレーム。射撃の回数起点ならトリガーの次のフレーム（窓の開始と同じ規則） */
export function healFrameOf(effect: Pick<ResolvedInstantEffect, 'trigger'>, fireFrame: number): number {
  return isResolvedShotCount(effect.trigger) ? fireFrame + 1 : fireFrame;
}
