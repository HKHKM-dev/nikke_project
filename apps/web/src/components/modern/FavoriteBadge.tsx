// お気に入りのバッジ（main_○○。白黒のバッジ）。押したバッジは、図柄（差し色）をバッジごとの色で塗る（styles.css の .favorite-badge）
import { FAVORITE_LABEL, FAVORITE_MARKS, type FavoriteMark } from '../../favorites.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { FAVORITE_BADGES } from './badges.ts';

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
