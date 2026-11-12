import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, SKILL_SLOTS, type SkillLevels, type SkillSlot } from '@nikke/core';
import { IntInput } from './IntInput.tsx';

const SHORT_SKILL_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル1LV',
  skill2: 'スキル2LV',
  burst: 'バーストLV',
};

type InputProps = {
  /** 欄に出す Lv（スロットは計算へ渡す値。スペック固定なら全部 10） */
  levels: SkillLevels;
  disabled: boolean;
  onChange: (levels: SkillLevels) => void;
};

/** 育成の欄のスキル LV の入力（スキル 1・スキル 2・バースト） */
export function SkillSection({ levels, disabled, onChange }: InputProps) {
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
            onCommit={(level) => onChange({ ...levels, [slot]: level })}
          />
        </label>
      ))}
    </div>
  );
}
