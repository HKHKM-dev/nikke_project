import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { SlotResultView } from '../../calcView.ts';
import { formatDamage } from '../../format.ts';
import type { SlotState } from '../../team.ts';
import { CharacterVisual } from './CharacterVisual.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  character: CharacterData | undefined;
  characterEntry: CharacterIndexEntry | undefined;
  isUnsupported: boolean;
  error: string | undefined;
  slotResult: SlotResultView | null;
  focused: boolean;
  isSelected: boolean;
  onSelectSlot: () => void;
  onOpenBuildModal: () => void;
  onClear: () => void;
  partyTotalDamage: number | null;
};

export function ModernSlotCard({
  slotIndex,
  slot,
  character,
  characterEntry,
  isUnsupported,
  error,
  slotResult,
  focused,
  isSelected,
  onSelectSlot,
  onOpenBuildModal,
  onClear,
  partyTotalDamage,
}: Props) {
  const currentDamage = character && slotResult ? slotResult.result.totalDamage : null;
  const formattedDamage = formatDamage(currentDamage);
  const damagePercent =
    partyTotalDamage && currentDamage && partyTotalDamage > 0
      ? Math.min(100, Math.round((currentDamage / partyTotalDamage) * 100))
      : 0;

  // ドロップ受け入れ（トレイからの配置、または他スロットからのスワップ）
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `slot-drop-${slotIndex}`,
    data: { slotIndex },
  });

  // キャラが配置されている場合、スロット間スワップ用のドラッグ
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `slot-drag-${slotIndex}`,
    data: {
      type: 'slot-character',
      slotIndex,
      character: characterEntry,
    },
    disabled: !characterEntry,
  });

  const setCardRef = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <div
      ref={setCardRef}
      data-element={characterEntry?.element}
      className={`modern-slot-card ${isSelected ? 'modern-slot-selected' : ''} ${focused ? 'modern-slot-focused' : ''} ${isOver ? 'modern-slot-over' : ''} ${isDragging ? 'modern-slot-dragging' : ''}`}
      onClick={onSelectSlot}
      {...(characterEntry ? attributes : {})}
      {...(characterEntry ? listeners : {})}
    >
      <div className="modern-slot-header">
        <span className="modern-slot-label">スロット {slotIndex + 1}</span>
        {focused && <span className="modern-slot-focus-badge">操作</span>}
        {slot.resourceId !== null && (
          <button
            type="button"
            className="modern-slot-clear-button"
            title="スロットを空にする"
            aria-label="スロットを空にする"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        )}
      </div>

      <div className="modern-slot-body">
        {characterEntry ? (
          <div className="modern-slot-char-area">
            <CharacterVisual character={characterEntry} isUnsupported={isUnsupported} size="portrait" />
            <div className="modern-slot-char-name">{characterEntry.name.ja}</div>
          </div>
        ) : (
          <div className="modern-slot-empty-area">
            <span className="modern-slot-empty-plus">＋</span>
            <span className="modern-slot-empty-text">ニケを選択</span>
          </div>
        )}
      </div>

      {error && <p className="modern-slot-error">{error}</p>}

      <div className="modern-slot-damage-section">
        <div className="modern-slot-damage-row">
          <span className="modern-slot-damage-value" title={formattedDamage.title}>
            {formattedDamage.text}
          </span>
          {damagePercent > 0 && <span className="modern-slot-damage-percent">{damagePercent}%</span>}
        </div>
        <div className="modern-slot-damage-bar-track">
          <div className="modern-slot-damage-bar-fill" style={{ width: `${damagePercent}%` }} />
        </div>
      </div>

      <div className="modern-slot-footer">
        {characterEntry ? (
          <button
            type="button"
            className="modern-slot-action-button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBuildModal();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ⚙️ 育成・設定
          </button>
        ) : (
          <span className="modern-slot-placeholder-footer">未配置</span>
        )}
      </div>
    </div>
  );
}
