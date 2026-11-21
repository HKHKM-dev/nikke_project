// バッジのスプライトと、それを <use> で出す部品（plan/design-badge-color.md）
import type { ReactNode } from 'react';
import { BADGE_SYMBOLS, badgeViewBox, type Badge } from './badges.ts';

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
 * バッジ（name は拡張子なしの名前）。label が無ければ読み上げない。大きさは className の CSS で決める。縦横の比は viewBox から
 * aspect-ratio に付けるので、CSS は幅か高さの片方だけ決めればよい。
 * 既定の色は、グループのクラス（badge-group-<名前の _ より前>）・名前のクラス（badge-<名前>）か、同じ絵を値ごとに塗り分けるなら
 * tone のクラス（badge-tone-<tone>）と variant のクラス（badge-variant-<variant>）に、styles.css が色の役の変数を決める。
 * children は絵の上に重ねる SVG の要素（座標は viewBox の値）。絵と一緒に描かれるので、絵の位置が画素の半端にあってもずれない
 */
export function BadgeIcon({
  name,
  label,
  tone,
  variant,
  className,
  children,
}: {
  name: string;
  label?: string;
  tone?: Badge['tone'];
  variant?: Badge['variant'];
  className?: string;
  children?: ReactNode;
}) {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  const viewBox = badgeViewBox(name);
  const [, , width, height] = viewBox.split(' ');
  return (
    <svg
      className={[`badge-group-${name.slice(0, name.indexOf('_'))}`, `badge-${name}`, tone && `badge-tone-${tone}`, variant && `badge-variant-${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      viewBox={viewBox}
      style={{ aspectRatio: `${width} / ${height}` }}
      {...a11y}
    >
      <use href={`#badge-${name}`} />
      {children}
    </svg>
  );
}
