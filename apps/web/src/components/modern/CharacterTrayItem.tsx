import { useDraggable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { CharacterVisual } from './CharacterVisual.tsx';

type Props = {
  character: CharacterIndexEntry;
  isTaken: boolean;
  isUnsupported: boolean;
  onClick: () => void;
};

export function CharacterTrayItem({ character, isTaken, isUnsupported, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${isDragging ? 'char-tray-item-dragging' : ''}`}
      onClick={onClick}
      title={`${character.name.ja}${isTaken ? ' (他スロットに配置中)' : ''}`}
      {...attributes}
      {...listeners}
    >
      <CharacterVisual character={character} isUnsupported={isUnsupported} size="compact" />
      <span className="char-tray-item-name">{character.name.ja}</span>
      {isTaken && <span className="char-tray-item-taken-badge">配置中</span>}
    </button>
  );
}
