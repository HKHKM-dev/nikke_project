// バッジのスプライトと、それを <use> で出す部品（plan/design-badge-color.md）
import { BADGE_SYMBOLS, badgeViewBox } from './badges.ts';

const HIDDEN = { position: 'absolute', width: 0, height: 0, overflow: 'hidden' } as const;

/**
 * 読んだバッジを <symbol> に並べたスプライト。バッジを出す画面に 1 度だけ置く。display: none にはしない（その中の
 * グラデーションとマスクが描けなくなる）
 */
export function BadgeSprite() {
  return (
    <svg aria-hidden="true" focusable="false" style={HIDDEN} dangerouslySetInnerHTML={{ __html: BADGE_SYMBOLS }} />
  );
}

/** バッジ（name は拡張子なしの名前）。label が無ければ読み上げない。大きさは className の CSS で決める */
export function BadgeIcon({ name, label, className }: { name: string; label?: string; className?: string }) {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  return (
    <svg className={className} viewBox={badgeViewBox(name)} {...a11y}>
      <use href={`#badge-${name}`} />
    </svg>
  );
}
