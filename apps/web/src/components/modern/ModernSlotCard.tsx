import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { SlotResultView } from '../../calcView.ts';
import { formatDamage } from '../../format.ts';
import { DEFAULT_CONTROLLED_SLOT, type SlotState } from '../../team.ts';
import { CharacterVisual } from './CharacterVisual.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  character: CharacterData | undefined;
  characterEntry: CharacterIndexEntry | undefined;
  isUnsupported: boolean;
  error: string | undefined;
  slotResult: SlotResultView | null;
  /** このスロットのニケがほかの編成でも使われている */
  inOtherParty: boolean;
  /** 一覧でクリックしたニケが、置くスロットのクリックを待っているときだけ渡す（このスロットに置く） */
  onPlacePending?: () => void;
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
  inOtherParty,
  onPlacePending,
  onOpenBuildModal,
  onClear,
  partyTotalDamage,
}: Props) {
  /** 操作キャラのスロット（「操作」の印を付ける） */
  const focused = slotIndex === DEFAULT_CONTROLLED_SLOT;
  const awaitingPlacement = onPlacePending !== undefined;
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
      className={`modern-slot-card ${awaitingPlacement ? 'modern-slot-awaiting' : ''} ${focused ? 'modern-slot-focused' : ''} ${isOver ? 'modern-slot-over' : ''} ${isDragging ? 'modern-slot-dragging' : ''}`}
      onClick={onPlacePending}
      {...(characterEntry ? attributes : {})}
      {...(characterEntry ? listeners : {})}
    >
      <div className="modern-slot-header">
        <span className="modern-slot-label">スロット {slotIndex + 1}</span>
        {focused && <span className="modern-slot-focus-badge">操作</span>}
        {inOtherParty && (
          <span className="modern-slot-other-party-badge" title="ほかの編成で使用中">
            他の編成
          </span>
        )}
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
        {awaitingPlacement && (
          <svg className="modern-slot-target" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="modern-slot-target-outer" cx="50" cy="50" r="40" />
            <circle className="modern-slot-target-inner" cx="50" cy="50" r="22" />
          </svg>
        )}
        {characterEntry ? (
          <div className="modern-slot-char-area">
            <CharacterVisual character={characterEntry} isUnsupported={isUnsupported} size="portrait" />
            <SlotCharName name={characterEntry.name.ja} />
          </div>
        ) : (
          // ニケがいるときの絵と同じ大きさにして、選んでもカードの大きさが変わらないようにする
          <div className="modern-slot-char-area">
            <div className="modern-slot-empty-area">
              <span className="modern-slot-empty-plus">＋</span>
            </div>
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
        {characterEntry && (
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
        )}
      </div>
    </div>
  );
}

/** 立ち絵の下部に右詰めで重ねる名前。枠に収まらないときは、左右に往復して流す（はみ出す幅を --name-overflow に置く） */
function SlotCharName({ name }: { name: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const measure = () => setOverflow(Math.max(0, Math.ceil(text.scrollWidth - box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [name]);
  return (
    <div
      ref={boxRef}
      className={`modern-slot-char-name ${overflow > 0 ? 'modern-slot-char-name-scroll' : ''}`}
      style={{ '--name-overflow': `${overflow}px` } as CSSProperties}
    >
      <span ref={textRef}>{name}</span>
    </div>
  );
}
