import { useDraggable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { CharacterVisual } from './CharacterVisual.tsx';
import { GrowthMarksView, type GrowthMarks } from './GrowthMarks.tsx';
import type { TrayShape } from '../../trayShape.ts';

type Props = {
  character: CharacterIndexEntry;
  /** いまの編成のどこかのスロットにいる（置けない。plan/design-ui-rebuild.md 5.2 節） */
  isTaken: boolean;
  /** ほかの編成で使用中（置ける） */
  inOtherParty: boolean;
  isUnsupported: boolean;
  /** 置くスロットのクリックを待っている */
  isPending: boolean;
  /** 右上に出す限界突破・コア強化（育成状況に無ければ null） */
  growthMarks: GrowthMarks | null;
  /** 立ち絵の形（四角・縦長） */
  shape: TrayShape;
  onClick: () => void;
};

export function CharacterTrayItem({
  character,
  isTaken,
  inOtherParty,
  isUnsupported,
  isPending,
  growthMarks,
  shape,
  onClick,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    },
    disabled: isTaken,
  });
  // いまの編成にいるニケは、実機の部隊編成と同じく水色の枠と ✓ を重ねて示す（文字の札は出さない）
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${isDragging ? 'char-tray-item-dragging' : ''} ${isPending ? 'char-tray-item-pending' : ''}`}
      // いまの編成にいるニケは、クリックでスロットから外す（ModernView）。ドラッグはできない（useDraggable の disabled）が、
      // クリックはできるので aria-disabled は付けない（attributes が付けるものを打ち消す）
      onClick={onClick}
      {...attributes}
      aria-disabled={undefined}
      {...listeners}
    >
      <span className="char-tray-item-visual">
        <CharacterVisual
          character={character}
          isUnsupported={isUnsupported}
          size={shape === 'tall' ? 'tall' : 'compact'}
          overlay={growthMarks && <GrowthMarksView {...growthMarks} className="char-tray-growth" />}
        />
        {isTaken && (
          <svg className="char-tray-item-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        )}
      </span>
      <span className="char-tray-item-name">{character.name.ja}</span>
      {inOtherParty && !isTaken && <span className="char-tray-item-other-badge">他の編成</span>}
    </button>
  );
}
