// モダン UI の、選んでいない編成の行（スロット 5 枚。四角の絵）。✕・⚙ はない。ニケは持ち上げて、ほかのスロット（どの行でも）・一覧へ移せ、
// 一覧のニケ・ほかの行のニケを落とせる（どれも選んでいる編成は変えない。useSlotDrag）。行を押すと、その編成を選ぶ（ModernView の selectParty）
import { TEAM_SIZE, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { memo, type ReactNode } from 'react';
import type { Party } from '../../parties.ts';
import { partyLabel } from '../../parties.ts';
import { PartyTabButton } from '../PartyTabs.tsx';
import { CharacterVisual } from './CharacterVisual.tsx';
import { trayGrowthMarks } from './GrowthMarks.tsx';
import { EmptySlotFace, SlotCharName } from './ModernSlotCard.tsx';
import { useDropAndDrag } from './useDropAndDrag.ts';
import { usePressSelect } from './usePressSelect.ts';

type Props = {
  partyIndex: number;
  party: Party | null;
  indexMap: ReadonlyMap<number, CharacterIndexEntry>;
  roster: BuildSnapshot | null;
  fixedSpec: boolean;
  onSelect: () => void;
};

export function PartyPreviewRow({ partyIndex, party, indexMap, roster, fixedSpec, onSelect }: Props) {
  const press = usePressSelect(onSelect);
  return (
    <button
      type="button"
      className="modern-slots-grid modern-party-preview"
      aria-label={`${partyLabel(partyIndex)}を選ぶ`}
      {...press}
    >
      {Array.from({ length: TEAM_SIZE }, (_, i) => {
        const resourceId = party?.slots[i]?.resourceId ?? null;
        const entry = resourceId === null ? undefined : indexMap.get(resourceId);
        return (
          <PreviewCard key={i} partyIndex={partyIndex} slotIndex={i} character={entry}>
            <PreviewFace entry={entry} roster={roster} fixedSpec={fixedSpec} />
          </PreviewCard>
        );
      })}
    </button>
  );
}

/**
 * スロットの中身（絵と名前、空の枠）。持ち上げている間は、ドラッグの状態（useDroppable・useDraggable）が動くたびに PreviewCard が
 * 描き直されるので、memo で中身まで描き直さないようにする（持ち上がるまでの時間を縮める）
 */
const PreviewFace = memo(function PreviewFace({
  entry,
  roster,
  fixedSpec,
}: {
  entry: CharacterIndexEntry | undefined;
  roster: BuildSnapshot | null;
  fixedSpec: boolean;
}) {
  if (!entry) return <EmptySlotFace />;
  return (
    <>
      <CharacterVisual character={entry} size="portrait" />
      <SlotCharName name={entry.name.ja} marks={trayGrowthMarks(entry, roster, fixedSpec)} />
      {/* 持ち上げている間・戻る間と、ニケが動いてくる間は、絵の代わりに空のスロットの枠を出す（選んでいる編成のスロットと同じ） */}
      <div className="modern-slot-arrival-face" aria-hidden="true">
        <EmptySlotFace />
      </div>
    </>
  );
});

/**
 * 選んでいない編成のスロット 1 枚。ニケを落とせ（useSlotDrag の place-party・exchange）、持ち上げられる（空のスロットも）。
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
  const { setNodeRef, isOver, isDragging, listeners } = useDropAndDrag(
    { id: `party-${partyIndex}-slot-${slotIndex}`, data: { type: 'party-slot', partyIndex, slotIndex } },
    {
      id: `party-${partyIndex}-drag-${slotIndex}`,
      data: { type: 'party-character', partyIndex, slotIndex, character },
    },
    // 落とす先の青枠は、スロットに関係のないもの（部隊番号）を乗せたときは出さない。操作の印（コントローラーのアイコン）は、
    // いまの編成のスロットにだけ置けるので、選んでいない編成の行のスロットには出さない
    (type) => type !== 'party-label' && type !== 'controller',
  );
  return (
    <div
      ref={setNodeRef}
      className={`modern-slot-card modern-party-preview-card ${isOver ? 'modern-slot-over' : ''} ${isDragging ? 'modern-slot-dragging' : ''}`}
      {...listeners}
    >
      <div className="modern-slot-body">
        <div className="modern-slot-char-area">{children}</div>
      </div>
    </div>
  );
}

/**
 * 行の左の、編成の番号（押すとその編成を選ぶ）。PartyTabs の 1 つ分と同じ見た目。編成ごとのダメージは出さない（オーナーのコメント）。
 * ドラッグして別の番号に落とすと、2 つの編成の中身を入れ替える（useSlotDrag の swap-parties）
 */
export function PartyRowLabel({
  partyIndex,
  active,
  onSelect,
}: {
  partyIndex: number;
  active: boolean;
  onSelect: () => void;
}) {
  const press = usePressSelect(onSelect);
  const { setNodeRef, isOver, isDragging, listeners } = useDropAndDrag(
    { id: `party-label-drop-${partyIndex}`, data: { type: 'party-label', partyIndex } },
    { id: `party-label-drag-${partyIndex}`, data: { type: 'party-label', partyIndex } },
    // 部隊番号の落とす先の青枠は、部隊番号を持ち上げているときだけ出す（コントローラーのアイコンやキャラの立ち絵では出さない）
    (type) => type === 'party-label',
  );
  return (
    <div
      ref={setNodeRef}
      className={`party-tab-cell modern-party-row-label ${isOver ? 'party-label-over' : ''} ${isDragging ? 'party-label-dragging' : ''}`}
      {...listeners}
    >
      <PartyTabButton partyIndex={partyIndex} active={active} {...press} />
    </div>
  );
}
