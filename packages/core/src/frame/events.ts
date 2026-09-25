// Stage 16-B: 敵の出来事を共通のフレームループの入力（フレームの窓）にする（plan/design-stage16.md 9.2・9.3 節）。
// 数値に効かせるのは untargetable（狙えない）だけ。invulnerable・barrier は表示と注記だけ。
import type { EnemyEvent, ModelNote } from '../damage.ts';
import { IMPLEMENTED_ENEMY_EVENT_KINDS } from '../enemies.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { FPS } from '../weapons.ts';

/** 秒 → フレーム（出来事の境目。四捨五入） */
function frameOf(seconds: number): number {
  return Math.round(seconds * FPS);
}

/**
 * 狙えない窓（フレーム。昇順・重なりは和集合・[0, frames) で切る）。出来事が無ければ空。
 * この窓の間は、AUTO の射撃とオートバーストが止まる（2026-09-26 ユーザー確認: 敵が画面外へジャンプし、移動を終えるまで）
 */
export function untargetableRanges(events: readonly EnemyEvent[] | undefined, frames: number): FrameRange[] {
  const ranges = (events ?? [])
    .filter((e) => e.kind === 'untargetable')
    .map((e) => ({ start: Math.max(0, frameOf(e.start)), end: Math.min(frames, frameOf(e.end)) }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => a.start - b.start);
  const merged: FrameRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** 敵の出来事の注記（未実装の種類・近似）。出来事が無ければ空 */
export function enemyEventNotes(events: readonly EnemyEvent[] | undefined): ModelNote[] {
  const list = events ?? [];
  const notes: ModelNote[] = [];
  if (list.some((e) => e.kind === 'untargetable')) {
    notes.push({
      level: 'approx',
      code: 'enemy-untargetable',
      message: {
        ja: '狙えない区間（敵のジャンプ）は代表値の時刻で置いた。実機では位相が録画ごとに変わり、1 回分（約 1〜2%）ずれうる。着地後の距離の変化（距離ボーナス）は扱わない',
        en: 'Untargetable windows (enemy jumps) use representative times; the phase varies between runs (about one jump, 1-2%). Distance changes after landing are not modeled',
      },
    });
  }
  const unimplemented = [...new Set(list.map((e) => e.kind))].filter((k) => !IMPLEMENTED_ENEMY_EVENT_KINDS.includes(k));
  for (const kind of unimplemented) {
    notes.push({
      level: 'unsupported',
      code: `enemy-${kind}`,
      message: {
        ja: `敵の出来事「${kind === 'invulnerable' ? '無敵' : 'バリア'}」は表示だけで、数値には反映していない`,
        en: `Enemy event "${kind}" is shown only; it does not affect the numbers`,
      },
    });
  }
  return notes;
}
