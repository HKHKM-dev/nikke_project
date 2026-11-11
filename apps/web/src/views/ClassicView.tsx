import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { ListOrderSettings } from '../components/ListOrderSettings.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { Popover } from '../components/Popover.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { SlotCard } from '../components/SlotCard.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import { LIST_DIRECTION_LABEL, LIST_DIRECTION_MARK, LIST_ORDER_LABEL } from '../listOrder.ts';
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
  listOrder,
}: ViewProps) {
  return (
    <>
      <TeamSettingsForm
        element={team.enemy.element}
        fixedSpec={team.fixedSpec}
        consoleInput={team.console}
        synchroLevel={team.synchroLevel}
        durationSeconds={team.durationSeconds}
        rangeJump={team.rangeJump}
        dispatch={dispatch}
      />
      {/* 全編成の合計は、編成のタブの上（どの編成を開いていても見える） */}
      <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
      <PartyTabs active={parties.active} onSelect={selectParty} totals={totals.parties} />
      {/* キャラの選択肢の並べ替え（ボタンで開くポップアップに「一覧の並び」を出す）。スロットの上に置く */}
      <div className="classic-list-order">
        <Popover
          button={
            <>
              並べ替え: {LIST_ORDER_LABEL[listOrder.order]} {LIST_DIRECTION_MARK[listOrder.direction]}
            </>
          }
          buttonClassName="classic-list-order-button"
          label={`並べ替え: ${LIST_ORDER_LABEL[listOrder.order]}（${LIST_DIRECTION_LABEL[listOrder.direction]}）`}
          align="left"
        >
          <ListOrderSettings {...listOrder} />
        </Popover>
      </div>
      <section className="slots" aria-label="編成">
        {team.slots.map((slot, i) => {
          const { character, growth, build, skillLevels, treasurePhase, usesHpRatio } = calc.slots[i]!;
          return (
            <SlotCard
              key={i}
              slotIndex={i}
              slot={slot}
              controlled={team.controlledSlot === i}
              index={index}
              excludeIds={takenResourceIds(team, i)}
              otherPartyIds={otherPartyIds}
              fullySupported={fullySupported}
              character={character}
              error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
              fixedSpec={team.fixedSpec}
              effectiveGrowth={growth}
              effectiveBuild={build}
              treasurePhase={treasurePhase}
              masters={masters}
              mastersError={mastersError}
              effectiveSkillLevels={skillLevels}
              slotResult={slotResults[i] ?? null}
              usesHpRatio={usesHpRatio}
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
