import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import checkIcon from '../../assets/badges/ui_check.svg';
import { maskIconStyle } from '../maskIcon.ts';
import type { CharacterIndexEntry } from '@nikke/core';
import type { Badge } from './badges.ts';
import { CharacterVisual } from './CharacterVisual.tsx';
import { GrowthMarksView, type GrowthMarks } from './GrowthMarks.tsx';
import type { TrayShape } from '../../trayShape.ts';
import { SlotCharName } from './ModernSlotCard.tsx';

type Props = {
  character: CharacterIndexEntry;
  /** いまの編成のどこかのスロットにいる（置けない。plan/design-ui-rebuild.md 5.2 節） */
  isTaken: boolean;
  /** ほかの編成で使用中（置ける） */
  inOtherParty: boolean;
  isUnsupported: boolean;
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
  isUnsupported,
  growthMarks,
  collectionBadge,
  shape,
}: {
  character: CharacterIndexEntry;
  isUnsupported: boolean;
  growthMarks: GrowthMarks | null;
  collectionBadge: Badge | null;
  shape: TrayShape;
}) {
  if (shape === 'tall') {
    return (
      <div className="modern-slot-char-area char-tray-tall-area">
        <CharacterVisual character={character} isUnsupported={isUnsupported} size="tall" extraBadge={collectionBadge} />
        <SlotCharName name={character.name.ja} marks={growthMarks} />
      </div>
    );
  }
  return (
    <CharacterVisual
      character={character}
      isUnsupported={isUnsupported}
      size="compact"
      overlay={growthMarks && <GrowthMarksView {...growthMarks} className="char-tray-growth" />}
    />
  );
}

/**
 * ニケ一覧の項目の見た目（絵の枠と、四角のときは絵の下の名前）。一覧の項目と、一覧から持ち上げた絵（ModernView）が使う。
 * overlay は絵の上に重ねるもの（配置中の ✓）
 */
export function TrayItemFace({
  character,
  isUnsupported,
  growthMarks,
  collectionBadge,
  shape,
  overlay,
}: {
  character: CharacterIndexEntry;
  isUnsupported: boolean;
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
          isUnsupported={isUnsupported}
          growthMarks={growthMarks}
          collectionBadge={collectionBadge}
          shape={shape}
        />
        {overlay}
      </span>
      {/* 縦長は名前を絵に重ねるので、下には出さない */}
      {shape === 'square' && <span className="char-tray-item-name">{character.name.ja}</span>}
    </>
  );
}

export function CharacterTrayItem({
  character,
  isTaken,
  inOtherParty,
  isUnsupported,
  isPending,
  growthMarks,
  collectionBadge,
  shape,
  onClick,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${character.resourceId}`,
    data: {
      type: 'tray-character',
      character,
    },
    disabled: isTaken,
  });
  // いまの編成にいるニケは、実機の部隊編成と同じく水色の枠と ✓ を重ねて示す（文字の札は出さない）
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''} ${isDragging ? 'char-tray-item-dragging' : ''} ${isPending ? 'char-tray-item-pending' : ''}`}
      // いまの編成にいるニケは、クリックでスロットから外す（ModernView）。ドラッグはできない（useDraggable の disabled）が、
      // クリックはできるので aria-disabled は付けない（attributes が付けるものを打ち消す）
      // スロットとの間を動くアニメーションが、このニケの絵を探す（ModernView の trayVisualAt）
      data-resource-id={character.resourceId}
      onClick={onClick}
      {...attributes}
      aria-disabled={undefined}
      {...listeners}
    >
      <TrayItemFace
        character={character}
        isUnsupported={isUnsupported}
        growthMarks={growthMarks}
        collectionBadge={collectionBadge}
        shape={shape}
        overlay={
          isTaken && (
            // ✓ はバッジの絵（ui_check.svg）を型に、水色で塗る（白い縁取りは外側の箱に付ける。型で切ると縁取りも切れるので）
            <span className="char-tray-item-check" aria-hidden="true">
              <span className="mask-icon" style={maskIconStyle(checkIcon)} />
            </span>
          )
        }
      />
      {inOtherParty && !isTaken && <span className="char-tray-item-other-badge">他の編成</span>}
    </button>
  );
}
