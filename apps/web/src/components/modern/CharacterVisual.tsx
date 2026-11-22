import { characterImageFile, type CharacterIndexEntry } from '@nikke/core';
import { useReducer, type ReactNode } from 'react';
import { BadgeIcon } from './BadgeIcon.tsx';
import { VISUAL_BADGE_KINDS, type Badge } from './badges.ts';

type Props = {
  character: CharacterIndexEntry;
  /**
   * normal・compact は顔のアイコン（正方形）、portrait はスロットのカードの顔の絵（正方形。大きさは --slot-portrait-h で、狭い画面では縮む）、
   * portrait-tall は portrait の大きさの縦長の絵（portraits。1:2 の枠。選んでいる編成のスロット。オーナーのコメント）、
   * tall は縦長の絵をニケ一覧の幅に縮めたもの（ニケ一覧の縦長の表示）
   */
  size?: 'normal' | 'compact' | 'portrait' | 'portrait-tall' | 'tall';
  /** バッジの列の最後に足すバッジ（スロットのコレクション） */
  extraBadge?: Badge | null;
  /** 絵の上に重ねるもの（ニケ一覧の右上の限界突破・コア強化） */
  overlay?: ReactNode;
  /** 絵の上のバッジ（属性・武器種・バースト段階）を出すか。既定は出す。小さい絵（育成状況の編集の一覧の行）では出さない */
  badges?: boolean;
};

const BASE_URL = import.meta.env.BASE_URL;

/** 大きさごとの class（portrait-tall は portrait の大きさに、縦長の絵の枠の class を足す。styles.css） */
const SIZE_CLASS = {
  normal: '',
  compact: 'char-visual-compact',
  portrait: 'char-visual-portrait',
  'portrait-tall': 'char-visual-portrait char-visual-tall-image',
  tall: 'char-visual-tall',
} satisfies Record<NonNullable<Props['size']>, string>;

/**
 * 読めなかった画像（画像の無い配信。アーティファクトなど）。同じ絵を出し直すたびに読みに行くと、読めないと分かるまでの数フレームは
 * 壊れた画像の枠になる（スロットを入れ替えた瞬間に、枠が一瞬見える）ので、覚えておいて 2 回目からは読みに行かない
 */
const failedImages = new Set<string>();

/** ニケの絵の URL（縦長の絵は portraits、四角の絵は images） */
const characterImageSrc = (resourceId: number, tall: boolean) =>
  `${BASE_URL}characters/${tall ? 'portraits' : 'images'}/${characterImageFile(resourceId)}`;

/** 前もって読み込み・デコードした絵（持っておき、表示するときにすぐ描けるようにする） */
const preloadedImages = new Map<string, HTMLImageElement>();

/**
 * ids のニケの縦長と四角の絵を、表示する前に読み込み・デコードしておく。編成の番号を入れ替えると、選んでいる行へ移ったニケは縦長の絵、
 * ほかの行へ移ったニケは四角の絵で描き直す。まだ読んでいない絵は、読み終えるまで空の枠で描かれ、入れ替えの動きの途中で絵が
 * 出たり消えたりして見えた（オーナーのコメント）。画像の無い配信では、読めないと分かるまで壊れた画像の枠が出た。すべての編成のニケについて、
 * 両方の絵を先に読んでおく
 */
export function preloadCharacterImages(ids: Iterable<number>): void {
  for (const id of ids) {
    for (const tall of [true, false]) {
      const src = characterImageSrc(id, tall);
      if (preloadedImages.has(src) || failedImages.has(src)) continue;
      const img = new Image();
      // 読めない絵（画像の無い配信。アーティファクトなど）は、表示する前に読めないと覚えておき、壊れた画像の枠を一瞬も出さない
      img.onerror = () => failedImages.add(src);
      img.src = src;
      img.decode().catch(() => undefined);
      preloadedImages.set(src, img);
    }
  }
}

function CharBadge({ badge, className = 'char-badge' }: { badge: Badge; className?: string }) {
  return (
    <BadgeIcon className={className} name={badge.name} label={badge.label} tone={badge.tone} variant={badge.variant} />
  );
}

export function CharacterVisual({
  character,
  size = 'normal',
  extraBadge = null,
  overlay = null,
  badges = true,
}: Props) {
  const imageSrc = characterImageSrc(character.resourceId, size === 'tall' || size === 'portrait-tall');
  // 画像が読めなかったキャラ（画像の無い配信・CDN に無いキャラ）は、絵の枠とバッジだけを出す。名前は絵の外（ニケ一覧の四角は絵の下、
  // 縦長は下部に重ねる名前）にあるので、絵の中には出さない（オーナーの指示）
  const failed = failedImages.has(imageSrc);
  // 読めなかったときに描き直す（読めたかどうかは failedImages が持つ）
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  return (
    <div className={`char-visual ${SIZE_CLASS[size]}`}>
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
          {VISUAL_BADGE_KINDS.map(({ key, badges: kindBadges }) => {
            const badge = kindBadges[character[key]];
            return badge && <CharBadge key={key} badge={badge} />;
          })}
          {extraBadge && <CharBadge badge={extraBadge} />}
        </div>
      )}
      {overlay}
    </div>
  );
}
