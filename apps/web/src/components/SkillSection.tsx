import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, SKILL_SLOTS, type SkillLevels, type SkillSlot } from '@nikke/core';
import { useState, type Dispatch } from 'react';
import { clampSkillLevel, type TeamAction } from '../team.ts';

const SHORT_SKILL_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル1LV',
  skill2: 'スキル2LV',
  burst: 'バーストLV',
};

type LevelInputProps = {
  value: number;
  disabled: boolean;
  onCommit: (level: number) => void;
};

/**
 * スキル Lv の入力欄。入力途中の空欄や範囲外はそのまま表示しておき、
 * 1..10 の整数になった時点で反映、フォーカスが外れたら clamp して確定する（"10" を打ち直せるように）。
 */
function SkillLevelInput({ value, disabled, onCommit }: LevelInputProps) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setText(String(value));
  }

  const commit = (raw: string, clamp: boolean) => {
    const n = Number(raw);
    const valid = raw.trim() !== '' && Number.isInteger(n) && n >= SKILL_LEVEL_MIN && n <= SKILL_LEVEL_MAX;
    if (valid) {
      if (n !== value) onCommit(n);
    } else if (clamp) {
      const level = clampSkillLevel(n);
      setText(String(level));
      if (level !== value) onCommit(level);
    }
  };

  return (
    <input
      type="number"
      min={SKILL_LEVEL_MIN}
      max={SKILL_LEVEL_MAX}
      step={1}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value, false);
      }}
      onBlur={(e) => commit(e.target.value, true)}
    />
  );
}

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
          <SkillLevelInput value={levels[slot]} disabled={disabled} onCommit={(level) => setLevel(slot, level)} />
        </label>
      ))}
    </div>
  );
}
