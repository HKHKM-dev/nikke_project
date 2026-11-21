import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CharacterIndexEntry } from '@nikke/core';
import { BadgeIcon } from './BadgeIcon.tsx';
import { BUILD_BADGE, CONTROLLER_BADGE, DELETE_BADGE } from './badges.ts';
import selectionCircle from '../../assets/badges/ui_selection_circle.svg';
import selectionTriangle from '../../assets/badges/ui_selection_triangle.svg';
import { CharacterVisual } from './CharacterVisual.tsx';
import { GrowthMarksView, type GrowthMarks } from './GrowthMarks.tsx';
import type { ActiveDragData, OverDragData } from './dropIntent.ts';
import { useScrollingName } from './useScrollingName.tsx';

/** 操作キャラの印（バッジ ui_controller）。ModernSlotCard の上の段と、ドラッグ中の重ねる絵（SlotDragOverlay）が使う */
export function ControllerIcon() {
  return <BadgeIcon className="modern-slot-focus-icon" name={CONTROLLER_BADGE} label="操作" />;
}

/**
 * 操作キャラのスロットの印。ドラッグして別のスロットに離すと、そのスロットを操作キャラにする（ModernView の handleDragEnd）。
 * カードの中にあるが、印の上で押したときは印のドラッグになる（dnd-kit は内側のドラッグを先に取る）
 */
function DraggableControllerIcon({ slotIndex }: { slotIndex: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'controller',
    data: { type: 'controller', slotIndex } satisfies ActiveDragData,
  });
  return (
    <span
      ref={setNodeRef}
      className={`modern-slot-focus-handle ${isDragging ? 'modern-slot-focus-dragging' : ''}`}
      {...attributes}
      aria-label="操作キャラ（ドラッグして別のスロットへ移す）"
      {...listeners}
    >
      <ControllerIcon />
    </span>
  );
}

type Props = {
  slotIndex: number;
  /** 操作キャラのスロット（操作の印を付ける） */
  controlled: boolean;
  characterEntry: CharacterIndexEntry | undefined;
  error: string | undefined;
  /** 名前の上に出す限界突破とコア強化の段階（ニケがいないときは null） */
  growthMarks: GrowthMarks | null;
  /** 育成を変えたか（育成・設定のボタンの歯車を青にする。slotGrowthEdited） */
  growthEdited: boolean;
  /** 一覧でクリックしたニケが、置くスロットのクリックを待っているときだけ渡す（このスロットに置く） */
  onPlacePending?: () => void;
  onOpenBuildModal: () => void;
  onClear: () => void;
};

export function ModernSlotCard({
  slotIndex,
  controlled,
  characterEntry,
  error,
  growthMarks,
  growthEdited,
  onPlacePending,
  onOpenBuildModal,
  onClear,
}: Props) {
  const awaitingPlacement = onPlacePending !== undefined;

  // ドロップ受け入れ（トレイからの配置、または他スロットからのスワップ）
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `slot-drop-${slotIndex}`,
    data: { type: 'slot', slotIndex } satisfies OverDragData,
  });

  // スロット間の入れ替えのドラッグ（空のスロットも持ち上げて入れ替えられる）
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
    } satisfies ActiveDragData,
  });

  const setCardRef = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <div
      ref={setCardRef}
      className={`modern-slot-card ${awaitingPlacement ? 'modern-slot-awaiting' : ''} ${isOver ? 'modern-slot-over' : ''} ${isDragging ? 'modern-slot-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="modern-slot-header">{controlled && <DraggableControllerIcon slotIndex={slotIndex} />}</div>

      <div className="modern-slot-body">
        {awaitingPlacement && (
          <>
            <img className="modern-slot-target" src={selectionCircle} alt="" aria-hidden="true" />
            <img className="modern-slot-target-arrow" src={selectionTriangle} alt="" aria-hidden="true" />
          </>
        )}
        {/* 置き先待ちのクリックは立ち絵の枠でだけ受ける（カードの上の段では置かない） */}
        <div className="modern-slot-char-area" onClick={onPlacePending}>
          {characterEntry ? (
            <>
              <CharacterVisual character={characterEntry} size="portrait" tallImage />
              <SlotCharName name={characterEntry.name.ja} marks={growthMarks} />
              {/* 置いたニケが動いてくる間（flight.ts の modern-slot-arriving）と、ドラッグで持ち上げている間・戻る間は、立ち絵の代わりに空のスロットの枠を出す */}
              <div className="modern-slot-arrival-face" aria-hidden="true">
                <EmptySlotFace tall />
              </div>
              <button
                type="button"
                className="modern-slot-icon-button modern-slot-clear-button"
                aria-label="スロットを空にする"
                onClick={(e) => {
                  // 置き先待ちの間は、押しても立ち絵の枠のクリック（置く）にする（クリックを止めずに枠へ渡す）
                  if (awaitingPlacement) return;
                  e.stopPropagation();
                  onClear();
                }}
                // ボタンの上で押してもカードのドラッグを始めない（センサーは mousedown・touchstart で始まる）
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <BadgeIcon className="modern-slot-icon" name={DELETE_BADGE} />
              </button>
              <button
                type="button"
                className={`modern-slot-icon-button modern-slot-build-button ${growthEdited ? 'modern-slot-build-edited' : ''}`}
                aria-label="育成・設定"
                onClick={(e) => {
                  // 置き先待ちの間は、押しても立ち絵の枠のクリック（置く）にする（クリックを止めずに枠へ渡す）
                  if (awaitingPlacement) return;
                  e.stopPropagation();
                  onOpenBuildModal();
                }}
                // ボタンの上で押してもカードのドラッグを始めない（センサーは mousedown・touchstart で始まる）
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <BadgeIcon className="modern-slot-icon" name={BUILD_BADGE} />
              </button>
            </>
          ) : (
            // ニケがいるときの絵と同じ大きさにして、選んでもカードの大きさが変わらないようにする
            <EmptySlotFace tall />
          )}
        </div>
      </div>

      {error && <p className="modern-slot-error">{error}</p>}
    </div>
  );
}

/**
 * 立ち絵の下部に右詰めで重ねる名前。枠に収まらないときは、右から左へ一定の速さで流し続ける
 * （名前を 2 つ並べ、1 つ分と間だけ動かしてループをつなぐ）
 */
export function SlotCharName({ name, marks }: { name: string; marks: GrowthMarks | null }) {
  const { boxRef, scrollClass, style, track } = useScrollingName<HTMLDivElement>(name);
  return (
    <div ref={boxRef} className={`modern-slot-char-name ${scrollClass}`} style={style}>
      {marks && <GrowthMarksView {...marks} className="modern-slot-growth" />}
      {track}
    </div>
  );
}

/**
 * 空のスロットの枠（真ん中の ＋ だけ）。持ち上げたときの絵（SlotDragOverlay）・選んでいない編成の行（PartyPreviewRow）にも使う。
 * tall は選んでいる編成のスロット（縦長の絵と同じ 1:2 の枠）
 */
export function EmptySlotFace({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`modern-slot-empty-area ${tall ? 'modern-slot-empty-tall' : ''}`}>
      <span className="modern-slot-empty-plus">＋</span>
    </div>
  );
}
