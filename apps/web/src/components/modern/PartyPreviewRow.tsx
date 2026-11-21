// モダン UI の、選んでいない編成の行（スロット 5 枚を、選んでいる編成と同じ大きさで並べる）。見るだけで、✕・⚙・配置・ドラッグはできない。
// 行を押すと、その編成を選ぶ（ModernView の selectParty）
import type { BuildSnapshot, CharacterIndexEntry } from '@nikke/core';
import type { Party } from '../../parties.ts';
import { partyLabel, partyNumber } from '../../parties.ts';
import { formatDamage } from '../../format.ts';
import type { PartyTotal } from '../../partyTotals.ts';
import { CharacterVisual } from './CharacterVisual.tsx';
import { trayGrowthMarks } from './GrowthMarks.tsx';
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
          <div className="modern-slot-card modern-party-preview-card" key={i}>
            <div className="modern-slot-body">
              <div className="modern-slot-char-area">
                {entry ? (
                  <>
                    <CharacterVisual character={entry} size="portrait" />
                    <SlotCharName name={entry.name.ja} marks={trayGrowthMarks(entry, roster, fixedSpec)} />
                  </>
                ) : (
                  <EmptySlotFace />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </button>
  );
}

/** 行の左の、編成の番号（押すとその編成を選ぶ）とダメージ。PartyTabs の 1 つ分と同じ見た目 */
export function PartyRowLabel({
  partyIndex,
  active,
  total,
  onSelect,
}: {
  partyIndex: number;
  active: boolean;
  total: PartyTotal | undefined;
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
      {/* 値の欄（出せない値は「—」）。エラーの文は読み上げにだけ渡す */}
      <span
        className="party-tab-total"
        data-computing={total?.computing ?? false}
        role={total?.error === undefined ? undefined : 'img'}
        aria-label={total?.error === undefined ? undefined : `計算できない: ${total.error}`}
      >
        {formatDamage(total?.total ?? null)}
      </span>
    </div>
  );
}
