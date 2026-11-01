import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, SKILL_SLOTS, type SkillLevels, type SkillSlot } from '@nikke/core';
import type { Dispatch } from 'react';
import type { TeamAction } from '../team.ts';
import { IntInput } from './IntInput.tsx';

const SHORT_SKILL_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル1LV',
  skill2: 'スキル2LV',
  burst: 'バーストLV',
};

type InputProps = {
  slotIndex: number;
  /** 実際に計算へ渡す Lv（スペック固定なら全部 10） */
  levels: SkillLevels;
  disabled: boolean;
  dispatch: Dispatch<TeamAction>;
};

/** 枠の「育成」の中のスキル LV の入力（スキル 1・スキル 2・バースト） */
export function SkillSection({ slotIndex, levels, disabled, dispatch }: InputProps) {
  const setLevel = (slot: SkillSlot, level: number) =>
    dispatch({ type: 'setSkillLevels', index: slotIndex, skillLevels: { ...levels, [slot]: level } });

  return (
    <div className="growth-row">
      {SKILL_SLOTS.map((slot) => (
        <label key={slot} className="field">
          <span>{SHORT_SKILL_LABEL[slot]}</span>
          <IntInput
            value={levels[slot]}
            min={SKILL_LEVEL_MIN}
            max={SKILL_LEVEL_MAX}
            disabled={disabled}
            onCommit={(level) => setLevel(slot, level)}
          />
        </label>
      ))}
    </div>
  );
}
