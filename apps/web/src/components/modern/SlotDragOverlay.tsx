// モダン UI の持ち上げた絵（DragOverlay）。操作の印・スロットから持ち上げた立ち絵・一覧から持ち上げた絵のどれか
import { DragOverlay } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { TrayShape } from '../../trayShape.ts';
import { TrayItemFace } from './CharacterTrayItem.tsx';
import { CharacterVisual } from './CharacterVisual.tsx';
import { DROP_ANIMATION } from './dropAnimation.ts';
import { ControllerIcon, EmptySlotFace, SlotCharName } from './ModernSlotCard.tsx';
import type { DragOverlayState } from './useSlotDrag.ts';

export function SlotDragOverlay({
  overlay: {
    draggingController,
    draggedCharacter,
    draggedEmptyIndex,
    draggedPortrait,
    draggedMarks,
    draggedCollection,
  },
  trayShape,
}: {
  overlay: DragOverlayState;
  /** 一覧の立ち絵の形（一覧から持ち上げた絵の大きさを一覧とそろえる） */
  trayShape: TrayShape;
}) {
  return (
    <DragOverlay dropAnimation={DROP_ANIMATION}>
      {draggingController ? (
        <span className="controller-drag-overlay">
          <ControllerIcon />
        </span>
      ) : (draggedCharacter || draggedEmptyIndex !== null) && draggedPortrait ? (
        // 離したときのアニメーションは、この外側の箱をドラッグ元（カード）の位置へ戻す。外側をカードと同じ大きさにし、
        // 立ち絵をカードの中と同じ位置に置くと、立ち絵が元あった場所へ戻る
        <div
          className="slot-drag-overlay"
          style={
            {
              width: draggedPortrait.cardWidth,
              height: draggedPortrait.cardHeight,
              ...draggedPortrait.sizeVars,
            } as CSSProperties
          }
        >
          <div
            className="slot-drag-overlay-portrait"
            style={{
              width: draggedPortrait.width,
              height: draggedPortrait.height,
              left: draggedPortrait.left,
              top: draggedPortrait.top,
            }}
          >
            {draggedCharacter ? (
              // スロットと同じく、名前と限界突破・コア強化も一緒に持ち上げる
              <div className="modern-slot-char-area">
                <CharacterVisual character={draggedCharacter} size="portrait" extraBadge={draggedCollection} />
                <SlotCharName name={draggedCharacter.name.ja} marks={draggedMarks} />
              </div>
            ) : (
              <EmptySlotFace slotIndex={draggedEmptyIndex!} />
            )}
          </div>
        </div>
      ) : draggedCharacter ? (
        <div className="char-drag-overlay">
          {/* 一覧の項目と同じ入れ物で包み、絵の大きさを一覧とそろえる */}
          <TrayItemFace
            character={draggedCharacter}
            unsupportedNote={null}
            growthMarks={draggedMarks}
            collectionBadge={draggedCollection}
            shape={trayShape}
          />
        </div>
      ) : null}
    </DragOverlay>
  );
}
