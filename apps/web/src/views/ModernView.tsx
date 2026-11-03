import { useMemo, useState } from 'react';
import { DamageTotalPanel } from '../components/DamageTotalPanel.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { NotesSummary } from '../components/NotesSummary.tsx';
import { PartyTabs } from '../components/PartyTabs.tsx';
import { TeamSettingsForm } from '../components/TeamSettingsForm.tsx';
import type { ViewProps } from './ViewProps.ts';
import { CharacterTray } from '../components/modern/CharacterTray.tsx';
import { ModernSlotCard } from '../components/modern/ModernSlotCard.tsx';
import { SlotBuildModal } from '../components/modern/SlotBuildModal.tsx';

export function ModernView({
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
  selectParty,
  totals,
  totalsPending,
  summarySlots,
}: ViewProps) {
  // キャラクターインデックスを ID で引けるマップを作成
  const indexMap = useMemo(() => new Map(index.map((c) => [c.resourceId, c])), [index]);

  // 現在トレイからキャラを配置する対象のスロット（0〜4）
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  // 育成モーダルを開いているスロット（null なら閉じた状態）
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  // トレイでキャラが選択されたときのハンドラ
  const handleSelectCharacter = (resourceId: number) => {
    dispatch({ type: 'selectCharacter', index: activeSlotIndex, resourceId });
    // 次の空きスロットがあれば自動的にアクティブスロットを進める
    const nextEmptyIndex = team.slots.findIndex((s, i) => i > activeSlotIndex && s.resourceId === null);
    if (nextEmptyIndex !== -1) {
      setActiveSlotIndex(nextEmptyIndex);
    }
  };

  // 全スロットで配置済みのキャラ ID セット（他スロット配置中判定用）
  const allTakenIds = useMemo(
    () => new Set(team.slots.map((s) => s.resourceId).filter((id): id is number => id !== null)),
    [team.slots],
  );

  const editingCalcSlot = editingSlotIndex !== null ? calc.slots[editingSlotIndex] : null;

  return (
    <div className="modern-view-container">
      <TeamSettingsForm
        element={team.enemy.element}
        defence={team.enemy.defence}
        fixedSpec={team.fixedSpec}
        consoleInput={team.console}
        synchroLevel={team.synchroLevel}
        durationSeconds={team.durationSeconds}
        rangeJump={team.rangeJump}
        dispatch={dispatch}
      />

      <DamageTotalPanel title="合計ダメージ" value={totals.total} computing={totalsPending} />
      <PartyTabs active={parties.active} onSelect={selectParty} totals={totals.parties} />

      <section className="modern-slots-grid" aria-label="編成スロット一覧">
        {team.slots.map((slot, i) => {
          const { character } = calc.slots[i]!;
          const characterEntry = slot.resourceId !== null ? indexMap.get(slot.resourceId) : undefined;
          const isUnsupported =
            slot.resourceId !== null && fullySupported !== null && !fullySupported.has(slot.resourceId);

          return (
            <ModernSlotCard
              key={i}
              slotIndex={i}
              slot={slot}
              character={character}
              characterEntry={characterEntry}
              isUnsupported={isUnsupported}
              error={slot.resourceId === null ? undefined : characterCache.errors.get(slot.resourceId)}
              slotResult={slotResults[i] ?? null}
              focused={team.controlledSlot === i}
              isSelected={activeSlotIndex === i}
              onSelectSlot={() => setActiveSlotIndex(i)}
              onOpenBuildModal={() => setEditingSlotIndex(i)}
              onClear={() => dispatch({ type: 'clearSlot', index: i })}
              partyTotalDamage={totals.parties[parties.active]?.total ?? null}
            />
          );
        })}
      </section>

      <CharacterTray
        index={index}
        takenIds={allTakenIds}
        fullySupported={fullySupported}
        onSelectCharacter={handleSelectCharacter}
        activeSlotIndex={activeSlotIndex}
      />

      {editingSlotIndex !== null && editingCalcSlot && (
        <SlotBuildModal
          slotIndex={editingSlotIndex}
          slot={team.slots[editingSlotIndex]!}
          character={editingCalcSlot.character}
          fixedSpec={team.fixedSpec}
          effectiveGrowth={editingCalcSlot.growth}
          effectiveSkillLevels={editingCalcSlot.skillLevels}
          effectiveBuild={editingCalcSlot.build}
          treasurePhase={editingCalcSlot.treasurePhase}
          masters={masters}
          mastersError={mastersError}
          focused={team.controlledSlot === editingSlotIndex}
          dispatch={dispatch}
          onClose={() => setEditingSlotIndex(null)}
        />
      )}

      <ErrorBoundary
        resetKeys={[shown]}
        fallback={(e) => <p className="error">計算の結果を表示できませんでした: {e.message}</p>}
      >
        {shown?.computed.ok === false && <p className="error">{shown.computed.error}</p>}
        <NotesSummary slots={summarySlots} enemyNotes={shown?.computed.ok ? shown.computed.result.enemyNotes : []} />
      </ErrorBoundary>
    </div>
  );
}
