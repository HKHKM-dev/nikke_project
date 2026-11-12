// モダン UI で、一覧のニケをスロットに置く・スロットから外す操作と、そのときに絵を飛ばすアニメーション（flight.ts）
import { useLayoutEffect, useRef, type Dispatch } from 'react';
import { placeCharacterAction, type TeamAction, type TeamState } from '../../team.ts';
import { slotCardAt } from './dropAnimation.ts';
import { flyIntoSlot, flyToTray, stopArrival } from './flight.ts';

/** 一覧のそのニケの絵（一覧に出ていなければ null） */
const trayVisualAt = (resourceId: number) =>
  document.querySelector(`.char-tray-item[data-resource-id="${resourceId}"] .char-tray-item-visual`);

/** 置いたニケのスロットに絵が入るのを待つ長さ（ms） */
const ARRIVAL_WAIT_MS = 1000;
const arrivalDeadline = () => performance.now() + ARRIVAL_WAIT_MS;

export type SlotPlacement = {
  /** スロット index を空にし、外したニケの立ち絵を一覧へ動かす（content は動かす絵。無ければスロットの立ち絵の枠） */
  clearSlot: (index: number, content?: Element | null) => void;
  /**
   * 一覧のニケをスロット index に置く。いたニケは一覧へ、置いたニケは from（無ければ一覧のそのニケの絵）からスロットへ動かす。
   * 置けない（どこかのスロットにいる）ときは何もしない。置いたかを返す
   */
  placeFromTray: (resourceId: number, index: number, from?: DOMRect) => boolean;
};

export function useSlotPlacement(team: TeamState, dispatch: Dispatch<TeamAction>): SlotPlacement {
  // 置いたニケがスロットへ動き始める位置。置いた後の描画（スロットに絵が入った後）で動かし始める
  // スロットにまだ絵が入っていない描画（置く操作と別の描画が先に来たとき）では動かさず、次の描画を待つ（ARRIVAL_WAIT_MS まで）
  const arrivalsRef = useRef<{ index: number; from: DOMRect; until: number }[]>([]);
  useLayoutEffect(() => {
    arrivalsRef.current = arrivalsRef.current.filter(({ index, from, until }) => {
      const card = slotCardAt(index);
      if (card?.querySelector('.modern-slot-char-area .char-visual')) {
        flyIntoSlot(from, card);
        return false;
      }
      return performance.now() < until;
    });
  });

  /**
   * スロット index のニケを外す直前に、その立ち絵を一覧のそのニケの絵へ動かす。content は動かす絵（無ければスロットの立ち絵の枠。
   * 持ち上げて一覧へ落としたときは、持ち上げた絵）
   */
  const sendToTray = (index: number, content = slotCardAt(index)?.querySelector('.modern-slot-char-area') ?? null) => {
    const id = team.slots[index]?.resourceId;
    if (id === null || id === undefined || !content) return;
    flyToTray(content, trayVisualAt(id)?.getBoundingClientRect() ?? null);
  };

  const clearSlot = (index: number, content?: Element | null) => {
    sendToTray(index, content ?? undefined);
    stopArrival(slotCardAt(index));
    dispatch({ type: 'clearSlot', index });
  };

  const placeFromTray = (
    resourceId: number,
    index: number,
    from = trayVisualAt(resourceId)?.getBoundingClientRect(),
  ): boolean => {
    const action = placeCharacterAction(team, resourceId, index);
    if (!action) return false;
    sendToTray(index);
    if (from) arrivalsRef.current.push({ index, from, until: arrivalDeadline() });
    dispatch(action);
    return true;
  };

  return { clearSlot, placeFromTray };
}
