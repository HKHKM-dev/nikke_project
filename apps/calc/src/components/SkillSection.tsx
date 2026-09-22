import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  renderSkillDescription,
  type CharacterData,
  type SkillLevels,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { SKILL_SLOT_LABEL, SUPPORT_BADGE } from '../skillLabels.ts';
import { clampSkillLevel, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

type Props = {
  slotIndex: number;
  character: CharacterData;
  /** 実際に計算へ渡す Lv（スペック固定なら全部 10） */
  levels: SkillLevels;
  disabled: boolean;
  status: SlotSkillsStatus;
  dispatch: Dispatch<TeamAction>;
};

/** 枠のスキル Lv 入力と、定義の対応状況・説明文 */
export function SkillSection({ slotIndex, character, levels, disabled, status, dispatch }: Props) {
  const headline =
    status.kind === 'undefined'
      ? { badge: SUPPORT_BADGE.undefined, text: 'スキル定義なし（通常攻撃のみで計算。味方からのバフは受ける）' }
      : status.kind === 'loading'
        ? { badge: SUPPORT_BADGE.loading, text: 'スキル定義を読み込み中…' }
        : status.kind === 'error'
          ? { badge: SUPPORT_BADGE.error, text: `スキル定義を読み込めませんでした: ${status.message}` }
          : null;

  return (
    <div className="skills">
      <div className="skills-head">
        <span className="skills-title">スキル</span>
        {headline && (
          <span className={`note ${headline.badge.className}`}>
            <span className="badge">{headline.badge.label}</span> {headline.text}
          </span>
        )}
      </div>
      <div className="skill-row">
        {SKILL_SLOTS.map((slot) => {
          const skill = character.skills[slot];
          const entry = status.kind === 'ready' ? status.definition.skills[slot] : null;
          const badge = entry ? SUPPORT_BADGE[entry.support] : null;
          return (
            <details key={slot} className="skill">
              <summary>
                <span className="skill-name">
                  {SKILL_SLOT_LABEL[slot]}: {skill.name.ja}
                </span>
                {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
              </summary>
              <label className="field skill-level">
                <span>Lv</span>
                <input
                  type="number"
                  min={SKILL_LEVEL_MIN}
                  max={SKILL_LEVEL_MAX}
                  step={1}
                  value={levels[slot]}
                  disabled={disabled}
                  onChange={(e) =>
                    dispatch({
                      type: 'setSkillLevels',
                      index: slotIndex,
                      skillLevels: { ...levels, [slot]: clampSkillLevel(Number(e.target.value)) },
                    })
                  }
                />
              </label>
              <pre className="skill-desc">{renderSkillDescription(skill, levels[slot], 'ja')}</pre>
              {entry && entry.effects.some((e) => e.assumes) && (
                <ul className="notes">
                  {entry.effects
                    .filter((e) => e.assumes)
                    .map((e, i) => (
                      <li key={i} className="note approx">
                        <span className="badge">仮定</span> {e.assumes!.ja}
                      </li>
                    ))}
                </ul>
              )}
              {entry?.notes && entry.notes.length > 0 && (
                <ul className="notes">
                  {entry.notes.map((n, i) => (
                    <li key={i} className="note unsupported">
                      <span className="badge">未対応</span> {n.ja}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
