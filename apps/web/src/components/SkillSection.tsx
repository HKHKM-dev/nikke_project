import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  TREASURE_PHASE_MAX,
  applyTreasure,
  type CharacterData,
  type SkillLevels,
  type SkillEffect,
  type SkillSlot,
  type TreasurePhase,
} from '@nikke/core';
import { useState, type Dispatch } from 'react';
import { SKILL_SLOT_LABEL, SUPPORT_BADGE, treasurePhaseLabel } from '../skillLabels.ts';
import { clampSkillLevel, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

const SHORT_SKILL_LABEL: Record<SkillSlot, string> = {
  skill1: 'S1',
  skill2: 'S2',
  burst: 'バースト',
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

/** 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 効果の自分の HP の割合の条件（無ければ undefined） */
function selfHpOf(e: SkillEffect): { atLeastRef: number } | undefined {
  return 'condition' in e ? e.condition?.selfHp : undefined;
}

/** 自分のスキル定義に HP の割合の条件（selfHp）が含まれるか */
export function hasSelfHpCondition(
  character: CharacterData,
  status: SlotSkillsStatus,
  treasurePhase: TreasurePhase,
): boolean {
  if (status.kind !== 'ready') return false;
  const shown = applyTreasure(character, status.definition, treasurePhase);
  return SKILL_SLOTS.some((slot) =>
    (shown.definition?.skills[slot]?.effects ?? []).some((e) => selfHpOf(e) !== undefined),
  );
}

type HpRatioInputProps = { value: number; onCommit: (ratio: number) => void };

/**
 * 2 段目の段 6: HP の割合の想定の入力欄（%。1〜100 の整数）。入力途中の空欄や範囲外はそのまま表示しておき、範囲の整数になった時点で
 * 反映、フォーカスが外れたら範囲に収めて確定する（SkillLevelInput と同じ）
 */
export function HpRatioInput({ value, onCommit }: HpRatioInputProps) {
  const percent = Math.round(value * 100);
  const [text, setText] = useState(String(percent));
  const [lastValue, setLastValue] = useState(percent);
  if (lastValue !== percent) {
    setLastValue(percent);
    setText(String(percent));
  }
  const commit = (raw: string, clamp: boolean) => {
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 100) {
      if (n !== percent) onCommit(n / 100);
    } else if (clamp) {
      const fixed = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : percent;
      setText(String(fixed));
      if (fixed !== percent) onCommit(fixed / 100);
    }
  };
  return (
    <input
      type="number"
      min={1}
      max={100}
      step={1}
      value={text}
      aria-label="HP の割合の想定（%）"
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
  character: CharacterData;
  /** 実際に計算へ渡す Lv（スペック固定なら全部 10） */
  levels: SkillLevels;
  /** Stage 9: 実際に計算へ渡す宝物の段階（宝物のないキャラは 0）。スペック固定でも変えられる */
  treasurePhase: TreasurePhase;
  disabled: boolean;
  status: SlotSkillsStatus;
  dispatch: Dispatch<TeamAction>;
};

/** 枠カード内のスキル Lv 入力と宝物の段階（スキル名・説明文は「ニケごとの詳細」に出す） */
export function SkillSection({ slotIndex, character, levels, treasurePhase, disabled, status, dispatch }: InputProps) {
  const treasure = character.treasure;
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
  const overallBadge =
    status.kind === 'undefined'
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

  const setLevel = (slot: SkillSlot, level: number) =>
    dispatch({ type: 'setSkillLevels', index: slotIndex, skillLevels: { ...levels, [slot]: level } });

  return (
    <div className="skills">
      <div className="skills-head">
        <span className="skills-title">スキル Lv</span>
        {overallBadge && <span className={`badge ${overallBadge.className}`}>{overallBadge.label}</span>}
        {treasure && (
          <label className="treasure-phase" title={treasure.name.ja}>
            <span>宝物</span>
            <select
              value={treasurePhase}
              onChange={(e) =>
                dispatch({
                  type: 'setTreasurePhase',
                  index: slotIndex,
                  treasurePhase: Number(e.target.value) as TreasurePhase,
                })
              }
            >
              {Array.from({ length: TREASURE_PHASE_MAX + 1 }, (_, phase) => (
                <option key={phase} value={phase}>
                  {treasurePhaseLabel(treasure.unlockOrder, phase)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="growth-row skill-levels-row">
        {SKILL_SLOTS.map((slot) => (
          <label
            key={slot}
            className="field"
            title={`${SKILL_SLOT_LABEL[slot]}: ${shown.character.skills[slot].name.ja}`}
          >
            <span>{SHORT_SKILL_LABEL[slot]}</span>
            <SkillLevelInput value={levels[slot]} disabled={disabled} onCommit={(level) => setLevel(slot, level)} />
          </label>
        ))}
      </div>
    </div>
  );
}
