// 編成の番号を押して、選んでいる編成を切り替えたときのアニメーション。選んだ行は縦長の立ち絵に、それまで選んでいた行は四角の立ち絵に
// 入れ替わり、行の高さが変わって、番号と下の行が動く。切り替える前に、2 つの行の立ち絵の枠の写しと行の位置を取っておき、
// 切り替えた後の描き直しで、写しを新しい枠の位置へ動かしながら消し、新しい枠を現し、行を元の位置から動かす
import { TEAM_SIZE } from '@nikke/core';
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

/** 切り替えが起きなかったときに、取っておいた写しを消すまでの時間（ms） */
const STALE_MS = 1000;

type Pending = {
  /** 切り替える先の編成（0 から） */
  to: number;
  /** 切り替える前の、各行（編成の番号の順）の上端と、行の左の番号の枠の上端 */
  tops: { row: number; label: number | null }[];
  snapshots: { party: number; index: number; snapshot: ContentSnapshot }[];
  timer: ReturnType<typeof setTimeout>;
};

const rowsOf = () => [...document.querySelectorAll<HTMLElement>('.modern-party-row')];
const labelOf = (row: HTMLElement) => row.querySelector<HTMLElement>('.modern-party-row-label');
const contentAt = (party: number, index: number) =>
  partyCardAt(party, index)?.querySelector('.modern-slot-char-area') ?? null;

/** 切り替える前の行の位置と、2 つの行（from・to）の立ち絵の枠の写しを取る */
function capture(from: number, to: number): Pending {
  const snapshots: Pending['snapshots'] = [];
  for (const party of [from, to]) {
    for (let index = 0; index < TEAM_SIZE; index++) {
      const content = contentAt(party, index);
      if (content) snapshots.push({ party, index, snapshot: snapshotContent(content) });
    }
  }
  const timer = setTimeout(() => snapshots.forEach(({ snapshot }) => dropSnapshot(snapshot)), STALE_MS);
  return {
    to,
    tops: rowsOf().map((row) => ({
      row: row.getBoundingClientRect().top,
      label: labelOf(row)?.getBoundingClientRect().top ?? null,
    })),
    snapshots,
    timer,
  };
}

/**
 * 立ち絵の枠が四角と縦長で入れ替わるときの、写し（元の枠）の動く量 ghostY と、新しい枠が本来の位置からずれて動き出す量 newFromY。
 * 枠の中心が下がるとき: 上端をそろえた位置から始め、下端をそろえた位置で終わる（新しい枠は元の上端から、写しは新しい下端まで）。
 * 上がるとき: 下端をそろえた位置から始め、上端をそろえた位置で終わる（新しい枠は元の下端から、写しは新しい上端まで）
 */
function alignedMotion(from: DOMRect, to: DOMRect): { ghostY: number; newFromY: number } {
  const shift = to.top + to.bottom - (from.top + from.bottom);
  if (shift > 1) return { ghostY: to.bottom - from.bottom, newFromY: from.top - to.top };
  if (shift < -1) return { ghostY: to.top - from.top, newFromY: from.bottom - to.bottom };
  return { ghostY: 0, newFromY: 0 };
}

/** 切り替えた後の描き直しで、行を元の位置から動かし、写しを新しい枠へ動かして消し、新しい枠を現す */
function play({ tops, snapshots }: Pending): void {
  const timing = { duration: FLIGHT.duration, easing: FLIGHT.easing };
  // 位置は、動きを付ける前にすべて測る（動きを付けると、動き始めの位置が測った値に入る）
  const rows = rowsOf().map((row, i) => {
    const before = tops[i];
    const label = labelOf(row);
    return {
      row,
      label,
      rowDelta: before ? before.row - row.getBoundingClientRect().top : 0,
      labelTop: label?.getBoundingClientRect().top,
      beforeLabel: before?.label ?? null,
    };
  });
  const targets = snapshots.map(({ party, index }) => {
    const content = contentAt(party, index);
    return { content, rect: content?.getBoundingClientRect() };
  });
  for (const { row, label, rowDelta, labelTop, beforeLabel } of rows) {
    if (Math.abs(rowDelta) >= 0.5)
      row.animate([{ transform: `translateY(${rowDelta}px)` }, { transform: 'none' }], timing);
    // 左の番号は、行の高さが変わると行の中の位置も変わる（行の中で縦の中央）。番号は行の動きに乗って動くので、行の動きの分を引いて、
    // 番号が切り替える前にあった場所から動き出すようにする
    if (!label || labelTop === undefined || beforeLabel === null) continue;
    const labelDelta = beforeLabel - labelTop - rowDelta;
    if (Math.abs(labelDelta) >= 0.5)
      label.animate([{ transform: `translateY(${labelDelta}px)` }, { transform: 'none' }], timing);
  }
  snapshots.forEach(({ party, snapshot }, i) => {
    const { content, rect } = targets[i]!;
    if (!content || !rect) {
      dissolveSnapshot(snapshot, 0, 0);
      return;
    }
    const { ghostY, newFromY } = alignedMotion(snapshot.rect, rect);
    dissolveSnapshot(snapshot, rect.left - snapshot.rect.left, ghostY);
    // 新しい枠は行の動き（rowDelta）に乗るので、その分を引いて、動き出しの位置を合わせる
    fadeInContent(content, newFromY - (rows[party]?.rowDelta ?? 0));
  });
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
