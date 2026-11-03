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

  return (
    <div
      className={`modern-slot-card ${isSelected ? 'modern-slot-selected' : ''} ${focused ? 'modern-slot-focused' : ''}`}
      onClick={onSelectSlot}
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
          >
            ✕
          </button>
        )}
      </div>

      <div className="modern-slot-body">
        {characterEntry ? (
          <div className="modern-slot-char-area">
            <CharacterVisual character={characterEntry} isUnsupported={isUnsupported} />
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
