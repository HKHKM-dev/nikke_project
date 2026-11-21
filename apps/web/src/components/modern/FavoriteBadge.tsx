// お気に入りのバッジ（main_○○。白黒のバッジ）。押したバッジは、図柄（差し色）をバッジごとの色で塗る（styles.css の .favorite-badge）
import { useContext } from 'react';
import {
  FAVORITE_LABEL,
  FAVORITE_MARKS,
  favoriteMarksOf,
  FavoritesContext,
  type FavoriteMark,
} from '../../favorites.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { FAVORITE_BADGES, FAVORITE_COUNT_BADGE } from './badges.ts';

/** on なら図柄に色を付ける */
export function FavoriteBadge({ mark, on }: { mark: FavoriteMark; on: boolean }) {
  return (
    <BadgeIcon
      name={FAVORITE_BADGES[mark]}
      className={`favorite-badge favorite-badge-${mark}${on ? ' favorite-badge-on' : ''}`}
    />
  );
}

/**
 * お気に入りのバッジ 5 個のボタン（押したバッジは aria-pressed）。図柄は押したものだけ色を付けるか、colorAll なら全部に付ける
 * （育成・設定の窓は押したものだけ、ニケ一覧の絞り込みは全部。絞り込みは押していないものを薄くする）
 */
export function FavoriteButtons({
  marks,
  onToggle,
  buttonClassName,
  colorAll = false,
}: {
  marks: readonly FavoriteMark[];
  onToggle: (mark: FavoriteMark) => void;
  buttonClassName: string;
  colorAll?: boolean;
}) {
  return FAVORITE_MARKS.map((mark) => {
    const pressed = marks.includes(mark);
    return (
      <button
        key={mark}
        type="button"
        className={buttonClassName}
        aria-pressed={pressed}
        aria-label={`お気に入り（${FAVORITE_LABEL[mark]}）`}
        onClick={() => onToggle(mark)}
      >
        <FavoriteBadge mark={mark} on={colorAll || pressed} />
      </button>
    );
  });
}

/**
 * 立ち絵に出す、そのニケの押したバッジ（無ければ何も出さない）。ニケ一覧の四角の絵（corner）は右の列（P○ と属性のバッジの間）に 1 つだけ出し、
 * 2 つ以上なら無地の ui_blank_main に数を重ねる。ほかの絵は上端の中央に、押したバッジを並べて下げる
 */
export function FavoriteRibbons({ resourceId, corner = false }: { resourceId: number; corner?: boolean }) {
  const marks = favoriteMarksOf(useContext(FavoritesContext), resourceId);
  if (marks.length === 0) return null;
  if (corner) {
    return (
      <span className="char-visual-favorite-corner" aria-hidden="true">
        {marks.length === 1 ? (
          <FavoriteBadge mark={marks[0]!} on />
        ) : (
          <>
            <BadgeIcon name={FAVORITE_COUNT_BADGE} className="favorite-badge" />
            <span className="char-visual-favorite-count">{marks.length}</span>
          </>
        )}
      </span>
    );
  }
  return (
    <span className="char-visual-favorites" aria-hidden="true">
      {marks.map((mark) => (
        <FavoriteBadge key={mark} mark={mark} on />
      ))}
    </span>
  );
}
