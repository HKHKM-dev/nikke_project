// 編成の番号を押して、選んでいる編成を切り替えたときのアニメーション。選んだ行は縦長の立ち絵に、それまで選んでいた行は四角の立ち絵に
// 入れ替わり、行の高さが変わって、番号と下の行が動く。切り替える前に、2 つの行の立ち絵の枠の写しと行の位置を取っておき、
// 切り替えた後の描き直しで、写しを新しい枠の位置へ動かしながら消し、新しい枠を現し、行を元の位置から動かす
import { useLayoutEffect, useRef } from 'react';
import { partyCardAt } from './dropAnimation.ts';
import {
  dissolveSnapshot,
  dropSnapshot,
  FLIGHT,
  fadeInContent,
  snapshotContent,
  type ContentSnapshot,
} from './flight.ts';

/** 編成のスロットの数（parties.ts の Party の slots と同じ 5） */
const SLOT_COUNT = 5;
/** 切り替えが起きなかったときに、取っておいた写しを消すまでの時間（ms） */
const STALE_MS = 1000;

type Pending = {
  /** 切り替える先の編成（0 から） */
  to: number;
  /** 切り替える前の、各行（編成の番号の順）の上端 */
  tops: number[];
  snapshots: { party: number; index: number; snapshot: ContentSnapshot }[];
  timer: ReturnType<typeof setTimeout>;
};

const rowsOf = () => [...document.querySelectorAll<HTMLElement>('.modern-party-row')];
const contentAt = (party: number, index: number) =>
  partyCardAt(party, index)?.querySelector('.modern-slot-char-area') ?? null;

/** 切り替える前の行の位置と、2 つの行（from・to）の立ち絵の枠の写しを取る */
function capture(from: number, to: number): Pending {
  const snapshots: Pending['snapshots'] = [];
  for (const party of [from, to]) {
    for (let index = 0; index < SLOT_COUNT; index++) {
      const content = contentAt(party, index);
      if (content) snapshots.push({ party, index, snapshot: snapshotContent(content) });
    }
  }
  const timer = setTimeout(() => snapshots.forEach(({ snapshot }) => dropSnapshot(snapshot)), STALE_MS);
  return { to, tops: rowsOf().map((row) => row.getBoundingClientRect().top), snapshots, timer };
}

/** 切り替えた後の描き直しで、行を元の位置から動かし、写しを新しい枠へ動かして消し、新しい枠を現す */
function play({ tops, snapshots }: Pending): void {
  rowsOf().forEach((row, i) => {
    const delta = (tops[i] ?? 0) - row.getBoundingClientRect().top;
    if (Math.abs(delta) < 0.5) return;
    row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
      duration: FLIGHT.duration,
      easing: FLIGHT.easing,
    });
  });
  for (const { party, index, snapshot } of snapshots) {
    const content = contentAt(party, index);
    dissolveSnapshot(snapshot, content?.getBoundingClientRect() ?? null);
    if (content) fadeInContent(content);
  }
}

/**
 * 編成を切り替える関数（select）に、切り替えのアニメーションを付けたもの。active はいま選んでいる編成（0 から）。
 * 切り替える前に写しを取り、active が切り替え先になった描き直しで動かす
 */
export function usePartySwitchAnimation(active: number, select: (to: number) => void): (to: number) => void {
  const pending = useRef<Pending | null>(null);
  const discard = () => {
    const stale = pending.current;
    if (!stale) return;
    clearTimeout(stale.timer);
    stale.snapshots.forEach(({ snapshot }) => dropSnapshot(snapshot));
    pending.current = null;
  };
  useLayoutEffect(() => {
    const current = pending.current;
    if (!current || current.to !== active) return;
    pending.current = null;
    clearTimeout(current.timer);
    play(current);
  }, [active]);
  return (to) => {
    discard();
    if (to !== active) pending.current = capture(active, to);
    select(to);
  };
}
