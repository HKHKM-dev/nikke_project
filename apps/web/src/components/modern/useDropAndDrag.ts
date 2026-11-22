// 1 つの要素（スロットのカード・編成の番号）を、落とす先（drop）と持ち上げるもの（drag）の両方にする
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback } from 'react';
import { activeDragData, type ActiveDragData, type OverDragData } from './dropIntent.ts';

/**
 * drop・drag の両方を 1 つの要素に付ける（setNodeRef をその要素の ref にする）。isOver は、持ち上げているものの種類が showsOver を
 * 満たすときだけ立つ（落とす先の青枠を出すか）
 */
export function useDropAndDrag(
  drop: { id: string; data: OverDragData },
  drag: { id: string; data: ActiveDragData },
  showsOver: (type: ActiveDragData['type'] | undefined) => boolean,
) {
  const { isOver, active, setNodeRef: setDropRef } = useDroppable(drop);
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable(drag);
  // 描き直しのたびに ref が変わると、付け直しのたびに落とす先の大きさの見張りもやり直すので、同じ関数を保つ
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );
  return {
    setNodeRef,
    isOver: isOver && showsOver(activeDragData(active?.data.current)?.type),
    isDragging,
    attributes,
    listeners,
  };
}
