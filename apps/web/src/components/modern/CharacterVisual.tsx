import type { CharacterIndexEntry } from '@nikke/core';
import { useReducer, type ReactNode } from 'react';
import { COMPACT_BADGE_KINDS, ELEMENT_BADGE_KIND, VISUAL_BADGE_KINDS, type Badge } from './badges.ts';

type Props = {
  character: CharacterIndexEntry;
  isUnsupported?: boolean;
  /** normal・compact は顔のアイコン（正方形）、portrait は縦長の絵（スロットのカード） */
  size?: 'normal' | 'compact' | 'portrait';
  /** バッジの列の最後に足すバッジ（スロットのコレクション） */
  extraBadge?: Badge | null;
  /** 絵の上に重ねるもの（ニケ一覧の右上の限界突破・コア強化） */
  overlay?: ReactNode;
};

const BASE_URL = import.meta.env.BASE_URL;

/**
 * 読めなかった画像（画像の無い配信。アーティファクトなど）。同じ絵を出し直すたびに読みに行くと、読めないと分かるまでの数フレームは
 * 画像も名前の札も無い枠だけになる（スロットを入れ替えた瞬間に、枠だけが一瞬見える）ので、覚えておいてすぐ名前の札を出す
 */
const failedImages = new Set<string>();

function BadgeImg({ badge, className = 'char-badge' }: { badge: Badge; className?: string }) {
  return <img className={className} src={badge.src} alt={badge.label} title={badge.label} draggable={false} />;
}

export function CharacterVisual({
  character,
  isUnsupported = false,
  size = 'normal',
  extraBadge = null,
  overlay = null,
}: Props) {
  const imageSrc = `${BASE_URL}characters/${size === 'portrait' ? 'portraits' : 'images'}/${character.resourceId}.webp`;
  // 画像が読めなかったキャラ（画像の無い配信・CDN に無いキャラ）だけ、名前の札を出す。
  // 読めた画像の上には名前を重ねない（npm run fetch-images。plan/design-modern-ui.md）
  const failed = failedImages.has(imageSrc);
  // 読めなかったときに描き直す（読めたかどうかは failedImages が持つ）
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // ニケ一覧の正方形の絵は、左上に武器種・バースト段階、右下に属性。ほかは左上に属性・武器種・バースト段階（2.5 節）
  const compact = size === 'compact';
  const columnKinds = compact ? COMPACT_BADGE_KINDS : VISUAL_BADGE_KINDS;
  const elementBadge = compact ? ELEMENT_BADGE_KIND.badges[character.element] : undefined;

  return (
    <div className={`char-visual ${size === 'normal' ? '' : `char-visual-${size}`}`} data-rarity={character.rarity}>
      {failed ? (
        <span className="char-visual-fallback" aria-hidden="true">
          {character.name.ja}
        </span>
      ) : (
        <img
          src={imageSrc}
          alt=""
          className="char-visual-img"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            failedImages.add(imageSrc);
            rerender();
          }}
        />
      )}
      <div className="char-visual-badges">
        {columnKinds.map(({ key, badges }) => {
          const badge = badges[character[key]];
          return badge && <BadgeImg key={key} badge={badge} />;
        })}
        {extraBadge && <BadgeImg badge={extraBadge} />}
      </div>
      {elementBadge && <BadgeImg badge={elementBadge} className="char-badge char-visual-corner-badge" />}
      {overlay}
      {isUnsupported && <span className="char-unsupported-tag">未</span>}
    </div>
  );
}
