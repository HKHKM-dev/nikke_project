// モダン UI で、一覧のニケをスロットに置く・スロットから外す操作と、そのときに絵を飛ばすアニメーション（flight.ts）
import { useLayoutEffect, useRef, type Dispatch } from 'react';
import { placeCharacterAction, type TeamAction, type TeamState } from '../../team.ts';
import { slotCardAt, slotContentAt } from './partyRows.ts';
import { flyIntoSlot, flyToTray, stopArrival } from './flight.ts';

/** 一覧のそのニケの絵（一覧に出ていなければ null） */
export const trayVisualAt = (resourceId: number) =>
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
  /**
   * スロット fromIndex と toIndex を入れ替える（持ち上げて落とした）。持ち上げたものは dragged（離した位置の絵）から toIndex へ、
   * toIndex にいたもの（ニケ）は、その元の位置から fromIndex へ動かす
   */
  swapSlots: (fromIndex: number, toIndex: number, dragged?: DOMRect) => void;
  /**
   * card（描き直しの後に引く。選んでいない編成の行のスロットも）へ、from から絵を動かす（次の描画で、そのカードに絵が入ってから動かし始める）。
   * key が同じ前の待ちは捨てる
   */
  queueArrivalAt: (key: string, card: () => Element | null, from: DOMRect | undefined) => void;
};

export function useSlotPlacement(team: TeamState, dispatch: Dispatch<TeamAction>): SlotPlacement {
  // 置いたニケがスロットへ動き始める位置。置いた後の描画（スロットに絵が入った後）で動かし始める
  // スロットにまだ絵が入っていない描画（置く操作と別の描画が先に来たとき）では動かさず、次の描画を待つ（ARRIVAL_WAIT_MS まで）
  const arrivalsRef = useRef<{ key: string; card: () => Element | null; from: DOMRect; until: number }[]>([]);
  useLayoutEffect(() => {
    arrivalsRef.current = arrivalsRef.current.filter(({ card: cardOf, from, until }) => {
      const card = cardOf();
      if (card?.querySelector('.modern-slot-char-area .char-visual')) {
        flyIntoSlot(from, card);
        return false;
      }
      return performance.now() < until;
    });
  });

  /** card へ、from から絵を動かす（置いた後の描画で動かし始める。前に動いていた写しは消す） */
  const queueArrivalAt = (key: string, card: () => Element | null, from: DOMRect | undefined) => {
    stopArrival(card());
    // 同じスロットへ前に積んだ待ちは捨てる（後から来たものだけが着く）
    arrivalsRef.current = arrivalsRef.current.filter((a) => a.key !== key);
    if (from) arrivalsRef.current.push({ key, card, from, until: arrivalDeadline() });
  };
  /** 選んでいる編成のスロット index へ、from から絵を動かす */
  const queueArrival = (index: number, from: DOMRect | undefined) =>
    queueArrivalAt(`slot-${index}`, () => slotCardAt(index), from);

  /**
   * スロット index のニケを外す直前に、その立ち絵を一覧のそのニケの絵へ動かす。content は動かす絵（無ければスロットの立ち絵の枠。
   * 持ち上げて一覧へ落としたときは、持ち上げた絵）
   */
  const sendToTray = (index: number, content = slotContentAt(index)) => {
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
    queueArrival(index, from);
    dispatch(action);
    return true;
  };

  const swapSlots = (fromIndex: number, toIndex: number, dragged?: DOMRect) => {
    // スロットの位置は入れ替えても変わらないので、落とした先の立ち絵の枠の位置が、入れ替わるものの元の位置。
    // 動かすのはニケだけ（空のスロットの枠は動かさず、その場で入れ替わる）
    const isEmpty = (index: number) => (team.slots[index]?.resourceId ?? null) === null;
    queueArrival(fromIndex, isEmpty(toIndex) ? undefined : slotContentAt(toIndex)?.getBoundingClientRect());
    queueArrival(toIndex, isEmpty(fromIndex) ? undefined : dragged);
    dispatch({ type: 'swapSlots', fromIndex, toIndex });
  };

  return { clearSlot, placeFromTray, swapSlots, queueArrivalAt };
}
