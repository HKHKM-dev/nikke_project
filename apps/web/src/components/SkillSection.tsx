import {
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  TREASURE_PHASE_MAX,
  applyTreasure,
  framesToGameSeconds,
  measuredBurstDelayRow,
  burstStepMixAllows,
  renderSkillDescription,
  squadAllows,
  treasureSlots,
  type CharacterData,
  type SkillLevels,
  type BurstStepMixCondition,
  type SkillEffect,
  type SkillSlot,
  type SquadCondition,
  type TreasurePhase,
} from '@nikke/core';
import { useState, type Dispatch } from 'react';
import { SKILL_SLOT_LABEL, SUPPORT_BADGE, treasurePhaseLabel } from '../skillLabels.ts';
import { clampSkillLevel, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

/**
 * バーストの着弾編（plan/design-burst-landing.md 6 節の 3）: 実測値の表に載ったキャラだけ、発動からヒットと効果の発火までの
 * 遅れを出す（表に無いキャラは未測定だが、何も出さない）
 */
function BurstDelayNote({ character }: { character: CharacterData }) {
  // 分かれたヒット編: 宝物の印のある行は、burst が宝物版のときだけ（plan/design-burst-split-hits.md 4.5 節）
  const row = measuredBurstDelayRow(character);
  if (row === null) return null;
  const sec = (frames: number) => framesToGameSeconds(frames).toFixed(2);
  const { hitFrames, effectFrames, hitOffsets = [0] } = row.delays;
  // 分かれたヒット編: 等分した複数のヒットに分かれるときは、各ヒットの時刻を並べる
  const hits =
    hitOffsets.length > 1
      ? `${hitOffsets.length} 回に等分して発動の ${hitOffsets.map((o) => sec(hitFrames + o)).join('・')} 秒後`
      : `発動の ${sec(hitFrames)} 秒後`;
  return (
    <ul className="notes">
      <li className="note approx">
        <span className="badge">実測</span>{' '}
        {`バーストスキルダメージは${hits}、バーストスキル使用時の効果は ${sec(effectFrames)} 秒後に出る（${row.claim}）`}
      </li>
    </ul>
  );
}

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
  // 外から値が変わったとき（スペック固定・復元など）は表示を合わせる（レンダー中に前回値と比べて更新する）
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

const MIX_STEP_LABEL: Record<BurstStepMixCondition['otherBurstStep'], string> = {
  Step1: 'I',
  Step2: 'II',
  Step3: 'III',
};

/** 編成の条件の注記。今の編成でその効果が効くか */
function CompositionNote({ badge, condition, applies }: { badge: string; condition: string; applies: boolean }) {
  return (
    <li className={`note ${applies ? 'approx' : 'unsupported'}`}>
      <span className="badge">{badge}</span> {condition}とき。
      {applies ? 'この編成では効く' : 'この編成では効かない（計算に入れない）'}
    </li>
  );
}

/** アニス：スター編: バースト段階の構成の条件 */
function burstStepMixText(mix: BurstStepMixCondition): string {
  return `自分を除くバースト ${MIX_STEP_LABEL[mix.otherBurstStep]} の味方が${mix.present ? 'いる' : 'いない'}`;
}

/** ラム編: 同じ部隊の味方の条件 */
function squadText(squad: SquadCondition, character: CharacterData): string {
  return `同じ部隊（${character.squadName.ja}）の味方が${squad.present ? 'いる' : 'いない'}`;
}

function hasComposition(e: SkillEffect): boolean {
  return ('burstStepMix' in e && e.burstStepMix !== undefined) || ('squad' in e && e.squad !== undefined);
}

type Props = {
  slotIndex: number;
  character: CharacterData;
  /** 実際に計算へ渡す Lv（スペック固定なら全部 10） */
  levels: SkillLevels;
  /** Stage 9: 実際に計算へ渡す宝物の段階（宝物のないキャラは 0）。スペック固定でも変えられる */
  treasurePhase: TreasurePhase;
  disabled: boolean;
  status: SlotSkillsStatus;
  /** 枠番号 → キャラ（編成の条件が今の編成で効くかの表示用）。空枠・読み込み中は null */
  teamCharacters: readonly (CharacterData | null)[];
  dispatch: Dispatch<TeamAction>;
};

/** 枠のスキル Lv 入力と、宝物の段階、定義の対応状況・説明文 */
export function SkillSection({
  slotIndex,
  character,
  levels,
  treasurePhase,
  disabled,
  status,
  teamCharacters,
  dispatch,
}: Props) {
  // Stage 9: 宝物版に差し替えた説明文と定義を出す（計算と同じ applyTreasure を通す）
  const shown = applyTreasure(character, status.kind === 'ready' ? status.definition : null, treasurePhase);
  const treasureShown = new Set(treasureSlots(character, treasurePhase));
  const treasure = character.treasure;
  // 編成の条件の判定用。自分の枠は表示中のキャラで埋める（読み込み中で null でも同じ部隊の判定に自分の部隊が要る）
  const compositionCharacters = teamCharacters.map((c, i) => (i === slotIndex ? character : c));
  const headline =
    status.kind === 'undefined'
      ? { badge: SUPPORT_BADGE.undefined, text: 'スキル定義なし（通常攻撃のみで計算。味方からのバフは受ける）' }
      : status.kind === 'loading'
        ? { badge: SUPPORT_BADGE.loading, text: 'スキル定義を読み込み中…' }
        : status.kind === 'error'
          ? { badge: SUPPORT_BADGE.error, text: `スキル定義を読み込めませんでした: ${status.message}` }
          : null;

  const setLevel = (slot: SkillSlot, level: number) =>
    dispatch({ type: 'setSkillLevels', index: slotIndex, skillLevels: { ...levels, [slot]: level } });

  return (
    <div className="skills">
      <div className="skills-head">
        <span className="skills-title">スキル</span>
        {headline && (
          <span className={`note ${headline.badge.className}`}>
            <span className="badge">{headline.badge.label}</span> {headline.text}
          </span>
        )}
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
      <div className="skill-row">
        {SKILL_SLOTS.map((slot) => {
          const skill = shown.character.skills[slot];
          const entry = shown.definition?.skills[slot] ?? null;
          const badge = entry ? SUPPORT_BADGE[entry.support] : null;
          return (
            <details key={slot} className="skill">
              <summary>
                <span className="skill-name">
                  {SKILL_SLOT_LABEL[slot]}: {skill.name.ja}
                </span>
                {treasureShown.has(slot) && <span className="badge treasure">宝物版</span>}
                {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
              </summary>
              <label className="field skill-level">
                <span>Lv</span>
                <SkillLevelInput value={levels[slot]} disabled={disabled} onCommit={(level) => setLevel(slot, level)} />
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
              {entry && entry.effects.some(hasComposition) && (
                <ul className="notes">
                  {entry.effects.flatMap((e, i) => [
                    'burstStepMix' in e && e.burstStepMix ? (
                      <CompositionNote
                        key={`${i}-mix`}
                        badge="段階構成"
                        condition={burstStepMixText(e.burstStepMix)}
                        applies={burstStepMixAllows(e.burstStepMix, compositionCharacters, slotIndex)}
                      />
                    ) : null,
                    'squad' in e && e.squad ? (
                      <CompositionNote
                        key={`${i}-squad`}
                        badge="部隊"
                        condition={squadText(e.squad, character)}
                        applies={squadAllows(e.squad, compositionCharacters, slotIndex)}
                      />
                    ) : null,
                  ])}
                </ul>
              )}
              {slot === 'burst' && <BurstDelayNote character={shown.character} />}
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
