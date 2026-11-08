import { useDraggable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useCombatPowerNote } from '../../useListOrder.ts';
import { CharacterVisual } from './CharacterVisual.tsx';

type Props = {
  character: CharacterIndexEntry;
  /** いまの編成のどこかのスロットにいる（置けない。plan/design-ui-rebuild.md 5.2 節） */
  isTaken: boolean;
  /** ほかの編成で使用中（置ける） */
  inOtherParty: boolean;
  isUnsupported: boolean;
  /** 置くスロットのクリックを待っている */
  isPending: boolean;
  onClick: () => void;
};

export function CharacterTrayItem({ character, isTaken, inOtherParty, isUnsupported, isPending, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    },
    disabled: isTaken,
  });
  // 戦闘力順のときは、マウスを重ねたときの文に戦闘力を添える（plan/design-combat-power-sort.md 6 節の論点 4）
  const power = useCombatPowerNote(character.resourceId);
  // いまの編成にいるニケは、実機の部隊編成と同じく水色の枠と ✓ を重ねて示す（文字の札は出さない）
  const title = isTaken ? '（配置中）' : inOtherParty ? '（ほかの編成で使用中）' : '';

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${isDragging ? 'char-tray-item-dragging' : ''} ${isPending ? 'char-tray-item-pending' : ''}`}
      onClick={onClick}
      disabled={isTaken}
      title={`${character.name.ja}${power}${title}`}
      {...attributes}
      {...listeners}
    >
      <span className="char-tray-item-visual">
        <CharacterVisual character={character} isUnsupported={isUnsupported} size="compact" />
        {isTaken && (
          <svg className="char-tray-item-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        )}
      </span>
      <span className="char-tray-item-name">{character.name.ja}</span>
      {inOtherParty && !isTaken && <span className="char-tray-item-taken-badge">他の編成</span>}
    </button>
  );
}
