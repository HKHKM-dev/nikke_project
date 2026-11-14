/** どの編成にもいないニケの編成の番号（毎回新しい配列を作らない） */
export const NO_PARTIES: readonly number[] = [];

/**
 * ニケを選んでいる編成の番号（P1・P2…）のバッジ。水色の背景に白い文字。ニケ一覧の絵の右上に出す。
 * 並べ方（縦・横）と置き場所は className で決める
 */
export function PartyNumberBadges({ parties, className }: { parties: readonly number[]; className: string }) {
  if (parties.length === 0) return null;
  return (
    <span className={className} aria-label={`使用中の編成: ${parties.map((n) => `P${n}`).join('・')}`}>
      {parties.map((n) => (
        <span key={n} className="party-number-badge">
          P{n}
        </span>
      ))}
    </span>
  );
}
