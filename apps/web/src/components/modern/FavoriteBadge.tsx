// お気に入りのバッジ（ui_main_○○.svg）。押したバッジは、絵を型にしてバッジごとの色で塗る（styles.css の .favorite-badge）
import { useContext } from 'react';
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

/** 立ち絵の上端の中央に下げる、そのニケの押したバッジ（無ければ何も出さない） */
export function FavoriteRibbons({ resourceId }: { resourceId: number }) {
  const marks = favoriteMarksOf(useContext(FavoritesContext), resourceId);
  if (marks.length === 0) return null;
  return (
    <span className="char-visual-favorites" aria-hidden="true">
      {marks.map((mark) => (
        <FavoriteBadge key={mark} mark={mark} on />
      ))}
    </span>
  );
}
