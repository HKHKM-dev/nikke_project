import type { CharacterIndexEntry } from '@nikke/core';
import { useState, type ReactNode } from 'react';
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
  const [failedId, setFailedId] = useState<number | null>(null);
  const failed = failedId === character.resourceId;
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
          // スロットの縦長の絵（5 枚）はすぐ読み、描けるまで待って描く（入れ替えで隠しを外した瞬間に、画像が空で枠だけ見えないように）。
          // ニケ一覧の絵は数が多いので、見えてから読み、描くのは後回しにしてよい
          loading={size === 'portrait' ? 'eager' : 'lazy'}
          decoding={size === 'portrait' ? 'sync' : 'async'}
          draggable={false}
          onError={() => setFailedId(character.resourceId)}
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
