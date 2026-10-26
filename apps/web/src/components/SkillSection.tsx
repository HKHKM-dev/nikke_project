import {
  ELEMENT_LABEL,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  TREASURE_PHASE_MAX,
  applyTreasure,
  FULL_BURST_AFTER_ACTIVATION_FRAMES,
  HEXAGON_AFTER_ACTIVATION_FRAMES,
  framesToGameSeconds,
  measuredBurstDelayRow,
  burstStepMixAllows,
  enemyElementAllows,
  isTimerTrigger,
  renderSkillDescription,
  skillValue,
  squadAllows,
  treasureSlots,
  withCharacterAllows,
  type CharacterData,
  type DamageEffect,
  type Element,
  type SkillLevels,
  type BurstStepMixCondition,
  type SkillEffect,
  type SkillSlot,
  type SquadCondition,
  type TreasurePhase,
  type WithCharacterCondition,
} from '@nikke/core';
import { useState, type Dispatch } from 'react';
import { formatPercent } from '../format.ts';
import {
  NOTE_KIND_BADGE,
  noteBadgeLabel,
  SKILL_SLOT_LABEL,
  SUPPORT_BADGE,
  formatRemoveState,
  formatCounterChange,
  formatStackChange,
  formatStateGrant,
  treasurePhaseLabel,
} from '../skillLabels.ts';
import { clampSkillLevel, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

const SHORT_SKILL_LABEL: Record<SkillSlot, string> = {
  skill1: 'S1',
  skill2: 'S2',
  burst: 'バースト',
};

/**
 * バーストの着弾編（plan/design-burst-landing.md 6 節の 3）: 実測値の表に載ったキャラだけ、発動からヒットと効果の発火までの
 * 遅れを出す（表に無いキャラは未測定だが、何も出さない）
 */
function BurstDelayNote({ character }: { character: CharacterData }) {
  const row = measuredBurstDelayRow(character);
  if (row === null) return null;
  const step3 = character.burstStep === 'Step3';
  const origin =
    character.burstStep === 'Step1' || character.burstStep === 'Step2'
      ? HEXAGON_AFTER_ACTIVATION_FRAMES
      : step3
        ? FULL_BURST_AFTER_ACTIVATION_FRAMES
        : 0;
  const sec = (frames: number, atOriginWhenZero = false) =>
    framesToGameSeconds(frames > 0 || atOriginWhenZero ? origin + frames : 0).toFixed(2);
  const { hitFrames, effectFrames, hitOffsets = [0] } = row.delays;
  const hits =
    hitOffsets.length > 1
      ? `${hitOffsets.length} 回に等分して発動の ${hitOffsets.map((o) => sec(hitFrames + o, step3)).join('・')} 秒後`
      : `発動の ${sec(hitFrames, step3)} 秒後`;
  return (
    <ul className="notes">
      <li className="note approx">
        <span className="badge">実測</span>{' '}
        {`バーストスキルダメージは${hits}、バーストスキル使用時の効果は ${sec(effectFrames)} 秒後に出る（${row.claim}）`}
      </li>
      {row.sameActivationBuffsOnHit === true && (
        <li className="note approx">
          <span className="badge">実測</span> バーストスキルダメージには、同じ発動で自分に付いた効果が乗る
        </li>
      )}
    </ul>
  );
}

/** 遅れて出る倍率ダメージ編（plan/design-delayed-skill-hit.md）: delayFrames のある damage の時刻とバフの扱い */
function DelayedHitNotes({ effects }: { effects: readonly SkillEffect[] }) {
  const delayed = effects.filter(
    (e): e is SkillEffect & DamageEffect & { delayFrames: number } =>
      e.kind === 'damage' && e.delayFrames !== undefined,
  );
  if (delayed.length === 0) return null;
  return (
    <ul className="notes">
      {delayed.map((e, i) => (
        <li key={i} className="note approx">
          <span className="badge">実測</span>{' '}
          {`倍率ダメージは${isTimerTrigger(e.trigger) ? '発動' : 'バーストスキル使用'}の ${framesToGameSeconds(e.delayFrames).toFixed(2)} 秒後に、そのときのバフ（同じ発動で付いた効果を含む）で出る${e.claims ? `（${e.claims.join('・')}）` : ''}`}
        </li>
      ))}
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

/** 防御力無視ダメージ編: 編成に特定のキャラがいる条件（名前は読み込んだ編成のキャラから引く。いなければ番号） */
function withCharacterText(condition: WithCharacterCondition, characters: readonly (CharacterData | null)[]): string {
  const name = characters.find((c) => c?.resourceId === condition.rid)?.name.ja ?? `キャラ ${condition.rid}`;
  return `${name}が編成に${condition.present ? 'いる' : 'いない'}`;
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

/**
 * 2 段目の段 6（plan/design-skill-stage6.md 1.4 節・論点 5）: 自分の HP の割合の条件。想定の HP の割合で効くかと、想定の入力欄。
 */
function HpConditionNote({
  threshold,
  hpRatio,
  onCommit,
}: {
  threshold: number;
  hpRatio: number;
  onCommit: (ratio: number) => void;
}) {
  const applies = hpRatio >= threshold;
  return (
    <li className={`note ${applies ? 'approx' : 'unsupported'}`}>
      <span className="badge">HP</span> 自分の HP が {formatPercent(threshold, 2)} 以上のとき。
      <label className="hp-ratio">
        想定の HP の割合 <HpRatioInput value={hpRatio} onCommit={onCommit} /> %
      </label>
      {applies ? ' では効く' : ' では効かない（計算に入れない）'}
      。被弾の時刻は計算に入れず、戦闘中はこの割合のまま（既定は満タン）
    </li>
  );
}

function hasComposition(e: SkillEffect): boolean {
  return (
    ('burstStepMix' in e && e.burstStepMix !== undefined) ||
    ('squad' in e && e.squad !== undefined) ||
    ('withCharacter' in e && e.withCharacter !== undefined) ||
    ('enemyElement' in e && e.enemyElement !== undefined)
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

type DetailsProps = {
  slotIndex: number;
  character: CharacterData;
  levels: SkillLevels;
  treasurePhase: TreasurePhase;
  status: SlotSkillsStatus;
  teamCharacters: readonly (CharacterData | null)[];
  enemyElement: Element | null;
  hpRatio: number;
  dispatch: Dispatch<TeamAction>;
};

/** ニケごとの詳細に出すスキル名・対応状況・説明文・条件（開発・検証用の注記はさらに折りたたむ） */
export function SkillDetailsSection({
  slotIndex,
  character,
  levels,
  treasurePhase,
  status,
  teamCharacters,
  enemyElement,
  hpRatio,
  dispatch,
}: DetailsProps) {
  const shown = applyTreasure(character, status.kind === 'ready' ? status.definition : null, treasurePhase);
  const treasureShown = new Set(treasureSlots(character, treasurePhase));
  const compositionCharacters = teamCharacters.map((c, i) => (i === slotIndex ? character : c));

  return (
    <details className="segments skill-details-panel">
      <summary>スキルの説明・対応状況</summary>
      {status.kind === 'undefined' && (
        <p className="hint">スキル定義なし（通常攻撃のみで計算。味方からのバフは受ける）</p>
      )}
      {status.kind === 'loading' && <p className="hint">スキル定義を読み込み中…</p>}
      {status.kind === 'error' && <p className="error">スキル定義を読み込めませんでした: {status.message}</p>}
      <div className="skill-row">
        {SKILL_SLOTS.map((slot) => {
          const skill = shown.character.skills[slot];
          const entry = shown.definition?.skills[slot] ?? null;
          const badge = entry ? SUPPORT_BADGE[entry.support] : null;
          const userNotes = (entry?.notes ?? []).filter((n) => n.kind === 'unimplemented' || n.kind === 'outOfScope');
          const devNotes = (entry?.notes ?? []).filter((n) => n.kind !== 'unimplemented' && n.kind !== 'outOfScope');
          const hasStateEffects =
            entry !== null &&
            entry.effects.some(
              (e) =>
                e.kind === 'state' ||
                e.kind === 'removeState' ||
                e.kind === 'stackChange' ||
                e.kind === 'counterChange',
            );
          const hasAssumes = entry !== null && entry.effects.some((e) => e.assumes);
          const hasBurstDelay = slot === 'burst' && measuredBurstDelayRow(shown.character) !== null;
          const hasDelayedHits =
            entry !== null && entry.effects.some((e) => e.kind === 'damage' && e.delayFrames !== undefined);
          const hasDevInfo = hasStateEffects || hasAssumes || hasBurstDelay || hasDelayedHits || devNotes.length > 0;

          return (
            <div key={slot} className="skill-detail-item">
              <div className="skill-detail-header">
                <span className="skill-name">
                  <strong>
                    {SKILL_SLOT_LABEL[slot]}（Lv{levels[slot]}）: {skill.name.ja}
                  </strong>
                </span>
                {treasureShown.has(slot) && <span className="badge treasure">宝物版</span>}
                {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
              </div>
              <pre className="skill-desc">{renderSkillDescription(skill, levels[slot], 'ja')}</pre>
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
                    'withCharacter' in e && e.withCharacter ? (
                      <CompositionNote
                        key={`${i}-with`}
                        badge="編成"
                        condition={withCharacterText(e.withCharacter, compositionCharacters)}
                        applies={withCharacterAllows(e.withCharacter, compositionCharacters, slotIndex)}
                      />
                    ) : null,
                    'enemyElement' in e && e.enemyElement ? (
                      <CompositionNote
                        key={`${i}-enemy`}
                        badge="敵の属性"
                        condition={`敵が${ELEMENT_LABEL[e.enemyElement]}コードの`}
                        applies={enemyElementAllows(e.enemyElement, enemyElement)}
                      />
                    ) : null,
                  ])}
                </ul>
              )}
              {entry && entry.effects.some((e) => selfHpOf(e) !== undefined) && (
                <ul className="notes">
                  {entry.effects.flatMap((e, i) => {
                    const hp = selfHpOf(e);
                    if (hp === undefined) return [];
                    return [
                      <HpConditionNote
                        key={`${i}-hp`}
                        threshold={skillValue(skill, hp.atLeastRef, levels[slot]) / 100}
                        hpRatio={hpRatio}
                        onCommit={(ratio) => dispatch({ type: 'setHpRatio', index: slotIndex, hpRatio: ratio })}
                      />,
                    ];
                  })}
                </ul>
              )}
              {userNotes.length > 0 && (
                <ul className="notes">
                  {userNotes.map((n, i) => (
                    <li key={i} className={`note ${NOTE_KIND_BADGE[n.kind].className}`}>
                      <span className="badge">{noteBadgeLabel(n)}</span> {n.ja}
                    </li>
                  ))}
                </ul>
              )}
              {hasDevInfo && (
                <details className="dev-notes-details">
                  <summary>検証・内部モデルの注記</summary>
                  {entry && hasAssumes && (
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
                  {entry && hasStateEffects && (
                    <ul className="notes">
                      {entry.effects.flatMap((e, i) =>
                        e.kind === 'state'
                          ? [
                              <li key={i} className="note modeling">
                                <span className="badge">状態</span> {formatStateGrant(e, shown.definition ?? null)}
                              </li>,
                            ]
                          : e.kind === 'removeState'
                            ? [
                                <li key={i} className="note modeling">
                                  <span className="badge">解除</span> {formatRemoveState(e)}
                                </li>,
                              ]
                            : e.kind === 'stackChange'
                              ? [
                                  <li key={i} className="note modeling">
                                    <span className="badge">スタック</span>{' '}
                                    {formatStackChange(
                                      e,
                                      e.amount ?? Math.round(skillValue(skill, e.amountRef!, levels[slot])),
                                      (ref) => Math.round(skillValue(skill, ref, levels[slot])),
                                    )}
                                  </li>,
                                ]
                              : e.kind === 'counterChange'
                                ? [
                                    <li key={i} className="note modeling">
                                      <span className="badge">カウンタ</span>{' '}
                                      {formatCounterChange(
                                        e,
                                        e.amount ?? Math.round(skillValue(skill, e.amountRef!, levels[slot])),
                                      )}
                                    </li>,
                                  ]
                                : [],
                      )}
                    </ul>
                  )}
                  {slot === 'burst' && <BurstDelayNote character={shown.character} />}
                  {entry && <DelayedHitNotes effects={entry.effects} />}
                  {devNotes.length > 0 && (
                    <ul className="notes">
                      {devNotes.map((n, i) => (
                        <li key={i} className={`note ${NOTE_KIND_BADGE[n.kind].className}`}>
                          <span className="badge">{noteBadgeLabel(n)}</span> {n.ja}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
