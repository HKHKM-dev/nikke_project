import { useDraggable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { useContext } from 'react';
import { combatPowerNote } from '../../listOrder.ts';
import { ListOrderContext } from '../../useListOrder.ts';
import { CharacterVisual } from './CharacterVisual.tsx';

type Props = {
  character: CharacterIndexEntry;
  /** いまの編成のどこかのスロットにいる（置けない。plan/design-ui-rebuild.md 5.2 節） */
  isTaken: boolean;
  /** ほかの編成で使用中（置ける） */
  inOtherParty: boolean;
  isUnsupported: boolean;
  onClick: () => void;
};

export function CharacterTrayItem({ character, isTaken, inOtherParty, isUnsupported, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    },
    disabled: isTaken,
  });
  // 戦闘力順のときは、マウスを重ねたときの文に戦闘力を添える（plan/design-combat-power-sort.md 6 節の論点 4）
  const { order, powers } = useContext(ListOrderContext);
  const power = combatPowerNote(order, powers, character.resourceId) ?? '';
  const mark = isTaken
    ? { badge: '配置中', title: '（配置中）' }
    : inOtherParty
      ? { badge: '他の編成', title: '（ほかの編成で使用中）' }
      : null;

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${isDragging ? 'char-tray-item-dragging' : ''}`}
      onClick={onClick}
      disabled={isTaken}
      title={`${character.name.ja}${power}${mark?.title ?? ''}`}
      {...attributes}
      {...listeners}
    >
      <CharacterVisual character={character} isUnsupported={isUnsupported} size="compact" />
      <span className="char-tray-item-name">{character.name.ja}</span>
      {mark && <span className="char-tray-item-taken-badge">{mark.badge}</span>}
    </button>
  );
}
