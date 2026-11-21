import type { UnsupportedNote } from '../../useSkillDefinitions.ts';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { SlotResultView } from '../../calcView.ts';
import { formatDamage } from '../../format.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { BUILD_BADGE, CONTROLLER_BADGE, DELETE_BADGE, type Badge } from './badges.ts';
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
      title="操作"
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
  character: CharacterData | undefined;
  characterEntry: CharacterIndexEntry | undefined;
  unsupportedNote: UnsupportedNote | null;
  error: string | undefined;
  slotResult: SlotResultView | null;
  /** 名前の上に出す限界突破とコア強化の段階（ニケがいないときは null） */
  growthMarks: GrowthMarks | null;
  /** 絵のバッジの列の最後に出すコレクション（宝物）のバッジ */
  collectionBadge: Badge | null;
  /** 育成を変えたか（育成・設定のボタンの歯車を青にする。slotGrowthEdited） */
  growthEdited: boolean;
  /** 一覧でクリックしたニケが、置くスロットのクリックを待っているときだけ渡す（このスロットに置く） */
  onPlacePending?: () => void;
  onOpenBuildModal: () => void;
  onClear: () => void;
  partyTotalDamage: number | null;
};

export function ModernSlotCard({
  slotIndex,
  controlled,
  character,
  characterEntry,
  unsupportedNote,
  error,
  slotResult,
  collectionBadge,
  growthMarks,
  growthEdited,
  onPlacePending,
  onOpenBuildModal,
  onClear,
  partyTotalDamage,
}: Props) {
  const awaitingPlacement = onPlacePending !== undefined;
  const currentDamage = character && slotResult ? slotResult.result.totalDamage : null;
  const damagePercent =
    partyTotalDamage && currentDamage && partyTotalDamage > 0
      ? Math.min(100, Math.round((currentDamage / partyTotalDamage) * 100))
      : 0;

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
        {/* 置き先待ちのクリックは立ち絵の枠でだけ受ける（カードの上下の段・ダメージの欄では置かない） */}
        <div className="modern-slot-char-area" onClick={onPlacePending}>
          {characterEntry ? (
            <>
              <CharacterVisual
                character={characterEntry}
                unsupportedNote={unsupportedNote}
                size="portrait"
                extraBadge={collectionBadge}
              />
              <SlotCharName name={characterEntry.name.ja} marks={growthMarks} />
              {/* 置いたニケが動いてくる間（flight.ts の modern-slot-arriving）と、ドラッグで持ち上げている間・戻る間は、立ち絵の代わりに空のスロットの枠を出す */}
              <div className="modern-slot-arrival-face" aria-hidden="true">
                <EmptySlotFace slotIndex={slotIndex} />
              </div>
              <button
                type="button"
                className="modern-slot-icon-button modern-slot-clear-button"
                aria-label="スロットを空にする"
                onClick={(e) => {
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
            <EmptySlotFace slotIndex={slotIndex} />
          )}
        </div>
      </div>

      {error && <p className="modern-slot-error">{error}</p>}

      <div className="modern-slot-damage-section">
        <div className="modern-slot-damage-row">
          <span className="modern-slot-damage-value">{formatDamage(currentDamage)}</span>
        </div>
        <div className="modern-slot-damage-bar-track">
          <div
            className="modern-slot-damage-bar-fill"
            style={{
              width: `${damagePercent}%`,
              backgroundSize: damagePercent > 0 ? `${10000 / damagePercent}% 100%` : undefined,
            }}
          />
        </div>
      </div>
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

/** 空のスロットの枠（＋・番号・FRONT か REAR・EMPTY SLOT・5 つのうちの位置）。持ち上げたときの絵（ModernView の DragOverlay）にも使う */
export function EmptySlotFace({ slotIndex }: { slotIndex: number }) {
  return (
    <div className="modern-slot-empty-area">
      <span className="modern-slot-empty-plus">＋</span>
      <span className="modern-slot-empty-number">{String(slotIndex + 1).padStart(2, '0')}</span>
      <span className="modern-slot-empty-row">{slotIndex % 2 === 0 ? 'FRONT' : 'REAR'}</span>
      <span className="modern-slot-empty-label">EMPTY SLOT</span>
      <span className="modern-slot-empty-position" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (i === slotIndex ? '●' : '○')).join('')}
      </span>
    </div>
  );
}
