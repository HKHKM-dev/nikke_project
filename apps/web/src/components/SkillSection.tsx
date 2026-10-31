import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  applyTreasure,
  type CharacterData,
  type SkillLevels,
  type SkillSlot,
  type TreasurePhase,
} from '@nikke/core';
import { useState, type Dispatch } from 'react';
import { SUPPORT_BADGE } from '../skillLabels.ts';
import { clampSkillLevel, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

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

/** スキル定義の対応状況の印（枠の「育成」の見出しに出す）。定義なしは出さない */
export function skillSupportBadge(
  character: CharacterData,
  status: SlotSkillsStatus,
  treasurePhase: TreasurePhase,
): { label: string; className: string } {
  const shown = applyTreasure(character, status.kind === 'ready' ? status.definition : null, treasurePhase);
  const allUnsupported =
    status.kind === 'ready' &&
    SKILL_SLOTS.every((s) => {
      const sup = shown.definition?.skills[s]?.support;
      return sup === 'unsupported' || sup === 'noEffect';
    });
  const hasUnsupported =
    status.kind === 'ready' &&
    SKILL_SLOTS.some((s) => {
      const sup = shown.definition?.skills[s]?.support;
      return sup === 'unsupported' || sup === 'partial';
    });
  return status.kind === 'undefined'
    ? SUPPORT_BADGE.undefined
    : status.kind === 'loading'
      ? SUPPORT_BADGE.loading
      : status.kind === 'error'
        ? SUPPORT_BADGE.error
        : allUnsupported
          ? SUPPORT_BADGE.unsupported
          : hasUnsupported
            ? SUPPORT_BADGE.partial
            : SUPPORT_BADGE.supported;
}

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
