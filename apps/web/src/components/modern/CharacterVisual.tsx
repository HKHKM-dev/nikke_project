import type { UnsupportedNote } from '../../useSkillDefinitions.ts';
import { characterImageFile, type CharacterIndexEntry } from '@nikke/core';
import { useReducer, type ReactNode } from 'react';
import { BadgeIcon } from './BadgeIcon.tsx';
import { FavoriteRibbons } from './FavoriteBadge.tsx';
import { UNSUPPORTED_BADGE, VISUAL_BADGE_KINDS, type Badge } from './badges.ts';

type Props = {
  character: CharacterIndexEntry;
  /** 未対応の印（ⓘ）の知らせと定義の状況（useSkillDefinitions の unsupportedNoteOf）。null なら印を出さない */
  unsupportedNote?: UnsupportedNote | null;
  /**
   * normal・compact は顔のアイコン（正方形）、portrait は縦長の絵（スロットのカード）、
   * tall は縦長の絵をニケ一覧の幅に縮めたもの（ニケ一覧の縦長の表示。バッジの置き方は portrait と同じ）
   */
  size?: 'normal' | 'compact' | 'portrait' | 'tall';
  /** バッジの列の最後に足すバッジ（スロットのコレクション） */
  extraBadge?: Badge | null;
  /** 絵の上に重ねるもの（ニケ一覧の右上の限界突破・コア強化） */
  overlay?: ReactNode;
  /** 絵の上のバッジ（属性・武器種・バースト段階）を出すか。既定は出す。小さい絵（育成状況の編集の一覧の行）では出さない */
  badges?: boolean;
};

const BASE_URL = import.meta.env.BASE_URL;

/**
 * 読めなかった画像（画像の無い配信。アーティファクトなど）。同じ絵を出し直すたびに読みに行くと、読めないと分かるまでの数フレームは
 * 壊れた画像の枠になる（スロットを入れ替えた瞬間に、枠が一瞬見える）ので、覚えておいて 2 回目からは読みに行かない
 */
const failedImages = new Set<string>();

function CharBadge({ badge, className = 'char-badge' }: { badge: Badge; className?: string }) {
  return (
    <BadgeIcon className={className} name={badge.name} label={badge.label} tone={badge.tone} variant={badge.variant} />
  );
}

export function CharacterVisual({
  character,
  unsupportedNote = null,
  size = 'normal',
  extraBadge = null,
  overlay = null,
  badges = true,
}: Props) {
  const imageDir = size === 'portrait' || size === 'tall' ? 'portraits' : 'images';
  const imageSrc = `${BASE_URL}characters/${imageDir}/${characterImageFile(character.resourceId)}`;
  // 画像が読めなかったキャラ（画像の無い配信・CDN に無いキャラ）は、絵の枠とバッジだけを出す。名前は絵の外（ニケ一覧の四角は絵の下、
  // 縦長は下部に重ねる名前）にあるので、絵の中には出さない（オーナーの指示）
  const failed = failedImages.has(imageSrc);
  // 読めなかったときに描き直す（読めたかどうかは failedImages が持つ）
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // バッジは、どの絵でも左上に属性・武器種・バースト段階の順に縦に並べる（2.5 節）
  const columnKinds = VISUAL_BADGE_KINDS;

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
      {badges && (
        <div className="char-visual-badges">
          {columnKinds.map(({ key, badges: kindBadges }) => {
            const badge = kindBadges[character[key]];
            return badge && <CharBadge key={key} badge={badge} />;
          })}
          {extraBadge && <CharBadge badge={extraBadge} />}
        </div>
      )}
      {badges && <FavoriteRibbons resourceId={character.resourceId} />}
      {overlay}
      {unsupportedNote !== null && (
        // 印はバッジ ui_information。色は定義の状況で変える（未定義は赤・未対応ありは橙・仮定だけは黄）。知らせはマウスを載せると出る
        <span
          className={`char-unsupported-tag char-unsupported-${unsupportedNote.level}`}
          role="img"
          aria-label={unsupportedNote.text}
          title={unsupportedNote.text}
        >
          <BadgeIcon name={UNSUPPORTED_BADGE} />
        </span>
      )}
    </div>
  );
}
