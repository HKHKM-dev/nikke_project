// バッジのスプライトと、それを <use> で出す部品（plan/design-badge-color.md）
import { BADGE_SYMBOLS, badgeViewBox } from './badges.ts';

const HIDDEN = { position: 'absolute', width: 0, height: 0, overflow: 'hidden' } as const;
const SPRITE_HTML = { __html: BADGE_SYMBOLS };

/**
 * 読んだバッジを <symbol> に並べたスプライト。バッジを出す画面に 1 度だけ置く。display: none にはしない（その中の
 * グラデーションとマスクが描けなくなる）
 */
export function BadgeSprite() {
  return <svg aria-hidden="true" focusable="false" style={HIDDEN} dangerouslySetInnerHTML={SPRITE_HTML} />;
}

/**
 * バッジ（name は拡張子なしの名前）。label が無ければ読み上げない。大きさは className の CSS で決める。
 * 値ごとの色は、名前のクラス（badge-<名前>）に styles.css が色の役の変数を決める
 */
export function BadgeIcon({ name, label, className }: { name: string; label?: string; className?: string }) {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  return (
    <svg className={`badge-${name}${className ? ` ${className}` : ''}`} viewBox={badgeViewBox(name)} {...a11y}>
      <use href={`#badge-${name}`} />
    </svg>
  );
}
