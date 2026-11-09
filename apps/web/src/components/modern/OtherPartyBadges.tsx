/** ほかの編成にいないニケの編成の番号（毎回新しい配列を作らない） */
export const NO_PARTIES: readonly number[] = [];

/**
 * ほかの編成で使用中のニケの、そのニケを選んでいる編成の番号（P1・P2…）の札。水色の背景に白い文字。
 * ニケ一覧の絵の右上と、スロットのカードの上の段に出す。並べ方（縦・横）と置き場所は className で決める
 */
export function OtherPartyBadges({ parties, className }: { parties: readonly number[]; className: string }) {
  if (parties.length === 0) return null;
  return (
    <span className={className} aria-label={`ほかの編成で使用中: ${parties.map((n) => `P${n}`).join('・')}`}>
      {parties.map((n) => (
        <span key={n} className="party-number-badge">
          P{n}
        </span>
      ))}
    </span>
  );
}
