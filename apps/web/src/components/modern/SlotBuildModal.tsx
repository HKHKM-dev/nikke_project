import {
  AFFECTION_RANK_MIN,
  affectionRankMax,
  growthLimits,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type GrowthInput,
  type SkillLevels,
  type TreasurePhase,
} from '@nikke/core';
import { useEffect, type Dispatch } from 'react';
import type { SlotState, TeamAction } from '../../team.ts';
import { BuildSection } from '../BuildSection.tsx';
import { IntInput } from '../IntInput.tsx';
import { SkillSection } from '../SkillSection.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  character: CharacterData | undefined;
  fixedSpec: boolean;
  effectiveGrowth: GrowthInput;
  effectiveSkillLevels: SkillLevels;
  effectiveBuild: BuildInput;
  treasurePhase: TreasurePhase;
  masters: BuildMasters | null;
  mastersError: string | null;
  focused: boolean;
  dispatch: Dispatch<TeamAction>;
  onClose: () => void;
};

export function SlotBuildModal({
  slotIndex,
  slot,
  character,
  fixedSpec,
  effectiveGrowth,
  effectiveSkillLevels,
  effectiveBuild,
  treasurePhase,
  masters,
  mastersError,
  focused,
  dispatch,
  onClose,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!character) return null;

  const limits = growthLimits(character);

  const growthField = (key: keyof GrowthInput, name: string, min: number, max: number) => (
    <label className="field">
      <span>{name}</span>
      <IntInput
        value={effectiveGrowth[key]}
        min={min}
        max={max}
        disabled={fixedSpec}
        onCommit={(n) => dispatch({ type: 'setGrowth', index: slotIndex, growth: { ...slot.growth, [key]: n } })}
      />
    </label>
  );

  const toggles = [
    {
      label: 'フォーカス',
      pressed: focused,
      onToggle: () => dispatch({ type: 'setControlledSlot', controlledSlot: slotIndex }),
    },
    {
      label: '撃たない',
      pressed: slot.noFire,
      onToggle: () => dispatch({ type: 'setNoFire', index: slotIndex, noFire: !slot.noFire }),
    },
    {
      label: 'バーストしない',
      pressed: slot.noBurst,
      onToggle: () => dispatch({ type: 'setNoBurst', index: slotIndex, noBurst: !slot.noBurst }),
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-label={`スロット ${slotIndex + 1}（${character.name.ja}）の育成・設定`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            スロット {slotIndex + 1}: {character.name.ja}
          </h2>
          <button type="button" className="modal-close-button" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <fieldset className="popover-group">
            <legend>スロット詳細設定</legend>
            <div className="slot-toggles">
              {toggles.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="toggle-button"
                  aria-pressed={t.pressed}
                  onClick={t.onToggle}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="growth-row">
            <label className="field">
              <span>好感度</span>
              <IntInput
                value={effectiveBuild.affectionRank}
                min={AFFECTION_RANK_MIN}
                max={affectionRankMax(character)}
                disabled={fixedSpec}
                onCommit={(rank) =>
                  dispatch({ type: 'setBuild', index: slotIndex, build: { ...slot.build, affectionRank: rank } })
                }
              />
            </label>
            {growthField('grade', '限界突破', 0, limits.gradeMax)}
            {growthField('core', 'コア強化', 0, limits.coreMax)}
          </div>

          <SkillSection slotIndex={slotIndex} levels={effectiveSkillLevels} disabled={fixedSpec} dispatch={dispatch} />

          <BuildSection
            slotIndex={slotIndex}
            character={character}
            build={slot.build}
            effectiveBuild={effectiveBuild}
            growth={effectiveGrowth}
            treasurePhase={treasurePhase}
            masters={masters}
            mastersError={mastersError}
            disabled={fixedSpec}
            dispatch={dispatch}
          />
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
