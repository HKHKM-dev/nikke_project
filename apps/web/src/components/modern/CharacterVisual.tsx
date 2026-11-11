import type { CharacterIndexEntry } from '@nikke/core';
import { useReducer, type ReactNode } from 'react';
import informationIcon from '../../assets/badges/ui_information.svg';
import { maskIconStyle } from '../maskIcon.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { COMPACT_BADGE_KINDS, ELEMENT_BADGE_KIND, VISUAL_BADGE_KINDS, type Badge } from './badges.ts';

type Props = {
  character: CharacterIndexEntry;
  /** 未対応の印（ⓘ）にマウスを載せたときの知らせ（useSkillDefinitions の unsupportedNoteOf）。null なら印を出さない */
  unsupportedNote?: string | null;
  /**
   * normal・compact は顔のアイコン（正方形）、portrait は縦長の絵（スロットのカード）、
   * tall は縦長の絵をニケ一覧の幅に縮めたもの（ニケ一覧の縦長の表示。バッジの置き方は portrait と同じ）
   */
  size?: 'normal' | 'compact' | 'portrait' | 'tall';
  /** バッジの列の最後に足すバッジ（スロットのコレクション） */
  extraBadge?: Badge | null;
  /** 絵の上に重ねるもの（ニケ一覧の右上の限界突破・コア強化） */
  overlay?: ReactNode;
};

const BASE_URL = import.meta.env.BASE_URL;

/**
 * 読めなかった画像（画像の無い配信。アーティファクトなど）。同じ絵を出し直すたびに読みに行くと、読めないと分かるまでの数フレームは
 * 壊れた画像の枠になる（スロットを入れ替えた瞬間に、枠が一瞬見える）ので、覚えておいて 2 回目からは読みに行かない
 */
const failedImages = new Set<string>();

function CharBadge({ badge, className = 'char-badge' }: { badge: Badge; className?: string }) {
  return <BadgeIcon className={className} name={badge.name} label={badge.label} tone={badge.tone} />;
}

export function CharacterVisual({
  character,
  unsupportedNote = null,
  size = 'normal',
  extraBadge = null,
  overlay = null,
}: Props) {
  const imageDir = size === 'portrait' || size === 'tall' ? 'portraits' : 'images';
  const imageSrc = `${BASE_URL}characters/${imageDir}/${character.resourceId}.webp`;
  // 画像が読めなかったキャラ（画像の無い配信・CDN に無いキャラ）は、絵の枠とバッジだけを出す。名前は絵の外（ニケ一覧の四角は絵の下、
  // 縦長は下部に重ねる名前）にあるので、絵の中には出さない（オーナーの指示）
  const failed = failedImages.has(imageSrc);
  // 読めなかったときに描き直す（読めたかどうかは failedImages が持つ）
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // ニケ一覧の正方形の絵は、左上に武器種・バースト段階、右下に属性。ほかは左上に属性・武器種・バースト段階（2.5 節）
  const compact = size === 'compact';
  const columnKinds = compact ? COMPACT_BADGE_KINDS : VISUAL_BADGE_KINDS;
  const elementBadge = compact ? ELEMENT_BADGE_KIND.badges[character.element] : undefined;

  return (
    <div className={`char-visual ${size === 'normal' ? '' : `char-visual-${size}`}`}>
      {!failed && (
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
          return badge && <CharBadge key={key} badge={badge} />;
        })}
        {extraBadge && <CharBadge badge={extraBadge} />}
      </div>
      {elementBadge && <CharBadge badge={elementBadge} className="char-badge char-visual-corner-badge" />}
      {overlay}
      {unsupportedNote !== null && (
        // 印はバッジの絵 ui_information.svg を型にして塗る（.mask-icon）。知らせはマウスを載せると出る
        <span className="char-unsupported-tag" role="img" aria-label={unsupportedNote} title={unsupportedNote}>
          <span className="mask-icon" style={maskIconStyle(informationIcon)} />
        </span>
      )}
    </div>
  );
}
