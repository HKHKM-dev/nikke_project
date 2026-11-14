import { useDraggable } from '@dnd-kit/core';
import { memo, type ReactNode } from 'react';
import checkIcon from '../../assets/badges/ui_check.svg';
import { maskIconStyle } from '../maskIcon.ts';
import type { CharacterIndexEntry } from '@nikke/core';
import type { Badge } from './badges.ts';
import { CharacterVisual } from './CharacterVisual.tsx';
import { GrowthMarksView, type GrowthMarks } from './GrowthMarks.tsx';
import type { TrayShape } from '../../trayShape.ts';
import { SlotCharName } from './ModernSlotCard.tsx';
import { useScrollingName } from './useScrollingName.tsx';
import type { ActiveDragData } from './dropIntent.ts';
import { PartyNumberBadges } from './PartyNumberBadges.tsx';

type Props = {
  character: CharacterIndexEntry;
  /** いまの編成のどこかのスロットにいる（置けない。plan/design-ui-rebuild.md 5.2 節） */
  isTaken: boolean;
  /** このニケを選んでいるほかの編成の番号（1 から。置けない） */
  otherParties: readonly number[];
  /** 右上（限界突破・コア強化の下）に P1・P2 と出す編成の番号（1 から。いまの編成にいればいまの編成、ほかは otherParties） */
  partyNumbers: readonly number[];
  unsupportedNote: string | null;
  /** 置くスロットのクリックを待っている */
  isPending: boolean;
  /** 右上に出す限界突破・コア強化（育成状況に無ければ null） */
  growthMarks: GrowthMarks | null;
  /** 縦長の絵のバッジの列の最後に出すコレクション（trayCollectionBadge。無ければ null） */
  collectionBadge: Badge | null;
  /** 立ち絵の形（四角・縦長） */
  shape: TrayShape;
  onClick: () => void;
};

/**
 * ニケ一覧の絵（一覧の項目と、一覧から持ち上げた絵）。四角は顔の絵に、右上の限界突破・コア強化。縦長はスロットと同じ見た目
 * （左上に属性・武器種・バースト段階のバッジを縦に、下部に名前と限界突破・コア強化を重ねる）を一覧の幅に縮めたもの
 */
function TrayVisual({
  character,
  unsupportedNote,
  growthMarks,
  collectionBadge,
  shape,
}: {
  character: CharacterIndexEntry;
  unsupportedNote: string | null;
  growthMarks: GrowthMarks | null;
  collectionBadge: Badge | null;
  shape: TrayShape;
}) {
  if (shape === 'tall') {
    return (
      <div className="modern-slot-char-area char-tray-tall-area">
        <CharacterVisual
          character={character}
          unsupportedNote={unsupportedNote}
          size="tall"
          extraBadge={collectionBadge}
        />
        <SlotCharName name={character.name.ja} marks={growthMarks} />
      </div>
    );
  }
  return (
    <CharacterVisual
      character={character}
      unsupportedNote={unsupportedNote}
      size="compact"
      overlay={growthMarks && <GrowthMarksView {...growthMarks} className="char-tray-growth" />}
    />
  );
}

/** 四角の絵の下の名前。収まらない名前はスロットの名前と同じく流す */
function TrayItemName({ name }: { name: string }) {
  const { boxRef, scrollClass, style, track } = useScrollingName<HTMLSpanElement>(name);
  return (
    <span ref={boxRef} className={`char-tray-item-name ${scrollClass}`} style={style}>
      {track}
    </span>
  );
}

/**
 * ニケ一覧の項目の見た目（絵の枠と、四角のときは絵の下の名前）。一覧の項目と、一覧から持ち上げた絵（ModernView）が使う。
 * overlay は絵の上に重ねるもの（配置中の ✓）
 */
export function TrayItemFace({
  character,
  unsupportedNote,
  growthMarks,
  collectionBadge,
  shape,
  overlay,
}: {
  character: CharacterIndexEntry;
  unsupportedNote: string | null;
  growthMarks: GrowthMarks | null;
  collectionBadge: Badge | null;
  shape: TrayShape;
  overlay?: ReactNode;
}) {
  return (
    <>
      <span className="char-tray-item-visual">
        <TrayVisual
          character={character}
          unsupportedNote={unsupportedNote}
          growthMarks={growthMarks}
          collectionBadge={collectionBadge}
          shape={shape}
        />
        {overlay}
      </span>
      {/* 縦長は名前を絵に重ねるので、下には出さない */}
      {shape === 'square' && <TrayItemName name={character.name.ja} />}
    </>
  );
}

export function CharacterTrayItem({
  character,
  isTaken,
  otherParties,
  partyNumbers,
  unsupportedNote,
  isPending,
  growthMarks,
  collectionBadge,
  shape,
  onClick,
}: Props) {
  const inOtherParty = otherParties.length > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    } satisfies ActiveDragData,
    // いまの編成にいるニケと、ほかの編成で使っているニケは持ち上げられない
    disabled: isTaken || inOtherParty,
  });
  // いまの編成にいるニケは、実機の部隊編成と同じく水色の枠と ✓ を重ねて示す（右上にいまの編成の P○ のバッジも出す）
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${inOtherParty ? 'char-tray-item-other-party' : ''} ${isDragging ? 'char-tray-item-dragging' : ''} ${isPending ? 'char-tray-item-pending' : ''}`}
      // いまの編成にいるニケは、クリックでスロットから外す（ModernView）。ドラッグはできない（useDraggable の disabled）が、
      // クリックはできるので aria-disabled は付けない（attributes が付けるものを打ち消す）。ほかの編成で使っているニケは、クリックしても
      // 何もしない（ModernView）ので aria-disabled を付ける
      // スロットとの間を動くアニメーションが、このニケの絵を探す（ModernView の trayVisualAt）
      data-resource-id={character.resourceId}
      onClick={onClick}
      {...attributes}
      aria-disabled={inOtherParty || undefined}
      {...listeners}
    >
      <TrayItemContent
        character={character}
        isTaken={isTaken}
        partyNumbers={partyNumbers}
        unsupportedNote={unsupportedNote}
        growthMarks={growthMarks}
        collectionBadge={collectionBadge}
        shape={shape}
      />
    </button>
  );
}

/**
 * 一覧の項目の中身（絵と、配置中の ✓ と、編成の P○ のバッジ）。持ち上げている間は、ドラッグの状態（useDraggable）が動くたびに
 * どの項目も描き直されるので、memo で中身まで描き直さないようにする
 */
const TrayItemContent = memo(function TrayItemContent({
  character,
  isTaken,
  partyNumbers,
  unsupportedNote,
  growthMarks,
  collectionBadge,
  shape,
}: Omit<Props, 'isPending' | 'onClick' | 'otherParties'>) {
  return (
    <TrayItemFace
      character={character}
      unsupportedNote={unsupportedNote}
      growthMarks={growthMarks}
      collectionBadge={collectionBadge}
      shape={shape}
      overlay={
        <>
          {isTaken && (
            // ✓ はバッジの絵（ui_check.svg）を型に、水色で塗る（白い縁取りは外側の箱に付ける。型で切ると縁取りも切れるので）
            <span className="char-tray-item-check" aria-hidden="true">
              <span className="mask-icon" style={maskIconStyle(checkIcon)} />
            </span>
          )}
          {/* 四角の絵で限界突破・コア強化を出すときは、その下に置く */}
          <PartyNumberBadges
            parties={partyNumbers}
            className={`char-tray-item-parties ${shape === 'square' && growthMarks ? 'char-tray-item-parties-below-growth' : ''}`}
          />
        </>
      }
    />
  );
});
