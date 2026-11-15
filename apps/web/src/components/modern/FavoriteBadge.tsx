// お気に入りのバッジ（ui_main_○○.svg）。押したバッジは、絵を型にしてバッジごとの色で塗る（styles.css の .favorite-badge）
import { useContext } from 'react';
import mainPlain from '../../assets/badges/ui_main.svg';
import mainClub from '../../assets/badges/ui_main_club.svg';
import mainDiamond from '../../assets/badges/ui_main_diamond.svg';
import mainHeart from '../../assets/badges/ui_main_heart.svg';
import mainSpade from '../../assets/badges/ui_main_spade.svg';
import mainStar from '../../assets/badges/ui_main_star.svg';
import { favoriteMarksOf, FavoritesContext, type FavoriteMark } from '../../favorites.ts';
import { maskIconStyle } from '../maskIcon.ts';

const MAIN_BADGE_SRC: Record<FavoriteMark, string> = {
  star: mainStar,
  spade: mainSpade,
  heart: mainHeart,
  diamond: mainDiamond,
  club: mainClub,
};

/** on なら色を付けた絵、off なら元の絵 */
export function FavoriteBadge({ mark, on }: { mark: FavoriteMark; on: boolean }) {
  return on ? (
    <span className="favorite-badge favorite-badge-on" data-mark={mark} style={maskIconStyle(MAIN_BADGE_SRC[mark])} />
  ) : (
    <img className="favorite-badge" src={MAIN_BADGE_SRC[mark]} alt="" />
  );
}

/**
 * 立ち絵に出す、そのニケの押したバッジ（無ければ何も出さない）。ニケ一覧の四角の絵（corner）は右の列（P○ と属性のバッジの間）に 1 つだけ出し、
 * 2 つ以上なら無地の ui_main に数を重ねる。ほかの絵は上端の中央に、押したバッジを並べて下げる
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
            <img className="favorite-badge" src={mainPlain} alt="" />
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
