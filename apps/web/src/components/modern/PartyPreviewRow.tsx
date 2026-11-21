// モダン UI の、選んでいない編成の行（スロット 5 枚。四角の絵）。✕・⚙ はない。ニケは持ち上げて、ほかのスロット（どの行でも）・一覧へ移せ、
// 一覧のニケ・ほかの行のニケを落とせる（どれも選んでいる編成は変えない。useSlotDrag）。行を押すと、その編成を選ぶ（ModernView の selectParty）
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import type { ReactNode } from 'react';
import type { Party } from '../../parties.ts';
import { partyLabel, partyNumber } from '../../parties.ts';
import { CharacterVisual } from './CharacterVisual.tsx';
import { trayGrowthMarks } from './GrowthMarks.tsx';
import type { ActiveDragData, OverDragData } from './dropIntent.ts';
import { EmptySlotFace, SlotCharName } from './ModernSlotCard.tsx';

type Props = {
  partyIndex: number;
  party: Party | null;
  indexMap: ReadonlyMap<number, CharacterIndexEntry>;
  roster: BuildSnapshot | null;
  fixedSpec: boolean;
  onSelect: () => void;
};

/** 編成のスロットの数（parties.ts の Party の slots と同じ 5） */
const SLOT_COUNT = 5;

export function PartyPreviewRow({ partyIndex, party, indexMap, roster, fixedSpec, onSelect }: Props) {
  return (
    <button
      type="button"
      className="modern-slots-grid modern-party-preview"
      aria-label={`${partyLabel(partyIndex)}を選ぶ`}
      onClick={onSelect}
    >
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const resourceId = party?.slots[i]?.resourceId ?? null;
        const entry = resourceId === null ? undefined : indexMap.get(resourceId);
        return (
          <PreviewCard key={i} partyIndex={partyIndex} slotIndex={i} character={entry}>
            {entry ? (
              <>
                <CharacterVisual character={entry} size="portrait" />
                <SlotCharName name={entry.name.ja} marks={trayGrowthMarks(entry, roster, fixedSpec)} />
              </>
            ) : (
              <EmptySlotFace />
            )}
          </PreviewCard>
        );
      })}
    </button>
  );
}

/**
 * 選んでいない編成のスロット 1 枚。ニケを落とせ（useSlotDrag の place-party・exchange）、ニケのいるスロットは持ち上げられる。
 * 行（button）の中なので、ドラッグの部品の役割（attributes の role="button" など）は付けない
 */
function PreviewCard({
  partyIndex,
  slotIndex,
  character,
  children,
}: {
  partyIndex: number;
  slotIndex: number;
  character: CharacterIndexEntry | undefined;
  children: ReactNode;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `party-${partyIndex}-slot-${slotIndex}`,
    data: { type: 'party-slot', partyIndex, slotIndex } satisfies OverDragData,
  });
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `party-${partyIndex}-drag-${slotIndex}`,
    disabled: !character,
    data: character && ({ type: 'party-character', partyIndex, slotIndex, character } satisfies ActiveDragData),
  });
  const setCardRef = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };
  return (
    <div
      ref={setCardRef}
      className={`modern-slot-card modern-party-preview-card ${isOver ? 'modern-slot-over' : ''} ${isDragging ? 'modern-slot-dragging' : ''}`}
      {...listeners}
    >
      <div className="modern-slot-body">
        <div className="modern-slot-char-area">{children}</div>
      </div>
    </div>
  );
}

/** 行の左の、編成の番号（押すとその編成を選ぶ）。PartyTabs の 1 つ分と同じ見た目。編成ごとのダメージは出さない（オーナーのコメント） */
export function PartyRowLabel({
  partyIndex,
  active,
  onSelect,
}: {
  partyIndex: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="party-tab-cell modern-party-row-label">
      <button
        type="button"
        className="toggle-button party-tab"
        aria-pressed={active}
        aria-label={partyLabel(partyIndex)}
        onClick={onSelect}
      >
        {partyNumber(partyIndex)}
      </button>
    </div>
  );
}
