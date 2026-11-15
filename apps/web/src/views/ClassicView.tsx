import { ClassicBurstFilter, ClassicFilter, useClassicFilter } from '../components/ClassicFilter.tsx';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { ListOrderSettings } from '../components/ListOrderSettings.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { Popover } from '../components/Popover.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { SlotCard } from '../components/SlotCard.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import { LIST_DIRECTION_MARK, LIST_ORDER_LABEL, listOrderLabel } from '../listOrder.ts';
import { commonGrowthOf, rosterGrowthOf } from '../roster.ts';
import { takenResourceIds } from '../team.ts';
import type { ViewProps } from './ViewProps.ts';

export function ClassicView({
  team,
  dispatch,
  index,
  characterCache,
  fullySupported,
  masters,
  mastersError,
  calc,
  shown,
  slotResults,
  parties,
  otherPartyIds,
  selectParty,
  totals,
  totalsPending,
  summarySlots,
  roster,
  listOrder,
}: ViewProps) {
  const { visibleIds, ...filter } = useClassicFilter(index);
  return (
    <>
      <TeamSettingsForm
        element={team.enemy.element}
        fixedSpec={team.fixedSpec}
        consoleInput={team.console}
        synchroLevel={team.synchroLevel}
        durationSeconds={team.durationSeconds}
        rangeJump={team.rangeJump}
        rosterCommon={roster && commonGrowthOf(roster)}
        dispatch={dispatch}
      />
      {/* 全編成の合計は、編成のタブの上（どの編成を開いていても見える） */}
      <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
      <PartyTabs active={parties.active} onSelect={selectParty} totals={totals.parties} />
      {/* キャラの選択肢のバースト段階の絞り込み（ClassicBurstFilter）・絞り込み（ClassicFilter）・並べ替え（ボタンで開くポップアップに「一覧の並び」を出す）。この順でスロットの上の中央に置く */}
      <div className="classic-list-order">
        <ClassicBurstFilter {...filter} />
        <ClassicFilter {...filter} />
        <Popover
          button={
            <>
              並べ替え: {LIST_ORDER_LABEL[listOrder.order]} {LIST_DIRECTION_MARK[listOrder.direction]}
            </>
          }
          buttonClassName="classic-list-order-button"
          label={listOrderLabel(listOrder.order, listOrder.direction)}
          align="left"
        >
          <ListOrderSettings {...listOrder} />
        </Popover>
      </div>
      <section className="slots" aria-label="編成">
        {team.slots.map((slot, i) => {
          const shown = calc.slots[i]!;
          return (
            <SlotCard
              key={i}
              slotIndex={i}
              slot={slot}
              controlled={team.controlledSlot === i}
              index={index}
              excludeIds={takenResourceIds(team, i)}
              visibleIds={visibleIds}
              otherPartyIds={otherPartyIds}
              fullySupported={fullySupported}
              character={shown.character}
              error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
              fixedSpec={team.fixedSpec}
              shown={shown}
              masters={masters}
              mastersError={mastersError}
              slotResult={slotResults[i] ?? null}
              usesHpRatio={shown.usesHpRatio}
              rosterGrowth={rosterGrowthOf(roster, slot.resourceId)}
              dispatch={dispatch}
            />
          );
        })}
      </section>
      <ErrorBoundary
        resetKeys={[shown]}
        fallback={(e) => <p className="error">計算の結果を表示できませんでした: {e.message}</p>}
      >
        {shown?.computed.ok === false && <p className="error">{shown.computed.error}</p>}
        <NotesSummary slots={summarySlots} enemyNotes={shown?.computed.ok ? shown.computed.result.enemyNotes : []} />
      </ErrorBoundary>
    </>
  );
}
