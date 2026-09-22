import {
  BURST_GAUGE_MAX,
  ELEMENT_LABEL,
  WEAPON_LABEL,
  energyPerTrigger,
  growthLimits,
  isChargeWeapon,
  type BurstStep,
  type CharacterData,
  type CharacterIndexEntry,
  type GrowthInput,
  type NikkeClass,
  type AppliedTimedEffect,
  type SkillLevels,
  type TeamSlotResult,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { formatNumber, formatPercent } from '../format.ts';
import { formatAppliedAmount, formatEffectSource, formatTimedTrigger } from '../skillLabels.ts';
import type { SlotState, TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';
import { CharacterPicker } from './CharacterPicker.tsx';
import { SkillSection } from './SkillSection.tsx';

const CLASS_LABEL: Record<NikkeClass, string> = { Attacker: '火力型', Defender: '防御型', Supporter: '支援型' };
const BURST_LABEL: Record<BurstStep, string> = { Step1: 'I', Step2: 'II', Step3: 'III', AllStep: 'I〜III' };

type Props = {
  slotIndex: number;
  slot: SlotState;
  index: readonly CharacterIndexEntry[];
  excludeIds: ReadonlySet<number>;
  character: CharacterData | undefined;
  loading: boolean;
  error: string | undefined;
  fixedSpec: boolean;
  /** clamp・スペック固定を反映した実際に計算へ渡す育成値 */
  effectiveGrowth: GrowthInput;
  /** スペック固定を反映した実際に計算へ渡すスキル Lv */
  effectiveSkillLevels: SkillLevels;
  skillsStatus: SlotSkillsStatus;
  /** 枠番号 → ニケ名（バフの発動元表示用）。未選択・読み込み中は undefined */
  slotNames: readonly (string | undefined)[];
  slotResult: TeamSlotResult | null;
  dispatch: Dispatch<TeamAction>;
};

export function SlotCard({
  slotIndex,
  slot,
  index,
  excludeIds,
  character,
  loading,
  error,
  fixedSpec,
  effectiveGrowth,
  effectiveSkillLevels,
  skillsStatus,
  slotNames,
  slotResult,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;
  const condition = slot.condition;
  // 同じ効果の窓をまとめて「10 秒 × 9 回」と見せる（窓は発動ごとに 1 件ある）
  const timedSummary = (() => {
    const byKey = new Map<string, { effect: AppliedTimedEffect; count: number }>();
    for (const w of slotResult?.windows ?? []) {
      const key = `${w.sourceSlotIndex}:${w.effect.source.skill}:${w.effect.effectIndex}`;
      const found = byKey.get(key);
      if (found) {
        found.count += 1;
        continue;
      }
      byKey.set(key, {
        effect: { ...w.effect, sourceSlotIndex: w.sourceSlotIndex, appliedAmount: 0 },
        count: 1,
      });
    }
    // appliedAmount は区間依存なので、代表区間（最初の区間）に出ていればそれを使う
    for (const entry of byKey.values()) {
      const applied = slotResult?.segments
        .flatMap((seg) => seg.timedEffects)
        .find(
          (e) =>
            e.sourceSlotIndex === entry.effect.sourceSlotIndex &&
            e.source.skill === entry.effect.source.skill &&
            e.effectIndex === entry.effect.effectIndex,
        );
      if (applied) entry.effect = applied;
    }
    return [...byKey.values()];
  })();

  const growthField = (key: keyof GrowthInput, name: string, min: number, max: number) => (
    <label className="field">
      <span>{name}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={effectiveGrowth[key]}
        disabled={fixedSpec}
        onChange={(e) =>
          dispatch({ type: 'setGrowth', index: slotIndex, growth: { ...slot.growth, [key]: Number(e.target.value) } })
        }
      />
      <small>
        {min}〜{max}
      </small>
    </label>
  );

  return (
    <fieldset className="panel slot">
      <legend>枠 {slotIndex + 1}</legend>
      <CharacterPicker
        index={index}
        excludeIds={excludeIds}
        value={slot.resourceId}
        onSelect={(resourceId) => dispatch({ type: 'selectCharacter', index: slotIndex, resourceId })}
        onClear={() => dispatch({ type: 'clearSlot', index: slotIndex })}
      />
      {error && <p className="error">読み込みに失敗しました: {error}</p>}
      {loading && <p className="hint">キャラデータを読み込み中…</p>}
      {character && limits && (
        <>
          <p className="meta">
            {WEAPON_LABEL[character.weaponType].ja} / {ELEMENT_LABEL[character.element].ja} /{' '}
            {CLASS_LABEL[character.class]} / バースト {BURST_LABEL[character.burstStep]} / 装弾数{' '}
            {character.shot.maxAmmo} / リロード {character.shot.reloadTime}s / 武器倍率 {character.shot.damage / 100}%
            <br />
            バースト CT {character.burstSkill.cooldownSeconds}s / ゲージ 1 トリガー{' '}
            {formatNumber((energyPerTrigger(character.shot) / BURST_GAUGE_MAX) * 100, 2)}%（仮）
          </p>
          <div className="growth-row">
            {growthField('level', 'レベル', 1, limits.levelMax)}
            {growthField('grade', '限界突破', 0, limits.gradeMax)}
            {growthField('core', 'コア強化', 0, limits.coreMax)}
          </div>
          <label className="field">
            <span>コア命中率</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={condition.coreHitRate}
              onChange={(e) =>
                dispatch({
                  type: 'setSlotCondition',
                  index: slotIndex,
                  condition: { ...condition, coreHitRate: Number(e.target.value) },
                })
              }
            />
            <small>0〜1。敵にコアが無いときは無視</small>
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={condition.distanceBonus && character.bonusRange !== null}
              disabled={character.bonusRange === null}
              onChange={(e) =>
                dispatch({
                  type: 'setSlotCondition',
                  index: slotIndex,
                  condition: { ...condition, distanceBonus: e.target.checked },
                })
              }
            />
            <span>距離ボーナス{character.bonusRange === null ? '（この武器には無い）' : ''}</span>
          </label>
          {isChargeWeapon(character.shot) && (
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={condition.fullCharge}
                onChange={(e) =>
                  dispatch({
                    type: 'setSlotCondition',
                    index: slotIndex,
                    condition: { ...condition, fullCharge: e.target.checked },
                  })
                }
              />
              <span>フルチャージで撃つ</span>
            </label>
          )}
          <SkillSection
            slotIndex={slotIndex}
            character={character}
            levels={effectiveSkillLevels}
            disabled={fixedSpec}
            status={skillsStatus}
            dispatch={dispatch}
          />
          {slotResult && (
            <div className="received">
              <span className="skills-title">受けているバフ</span>
              {slotResult.passiveEffects.length === 0 && slotResult.windows.length === 0 ? (
                <p className="hint">なし</p>
              ) : (
                <ul className="received-list">
                  {slotResult.passiveEffects.map((e, i) => (
                    <li key={i}>
                      <span className="amount">{formatAppliedAmount(e)}</span>
                      <small className="sub">
                        {formatEffectSource(e, slotNames[e.sourceSlotIndex])}
                        {e.assumes ? `・仮定: ${e.assumes.ja}` : ''}
                      </small>
                    </li>
                  ))}
                  {timedSummary.map((t, i) => (
                    <li key={`timed-${i}`}>
                      <span className="amount">{formatAppliedAmount(t.effect)}</span>
                      <small className="sub">
                        {formatTimedTrigger(t.effect.trigger)}{' '}
                        {formatEffectSource(t.effect, slotNames[t.effect.sourceSlotIndex])}・
                        {formatNumber(t.effect.durationFrames / 60, 0)} 秒 × {t.count} 回
                        {t.effect.assumes ? `・仮定: ${t.effect.assumes.ja}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {slotResult && slotResult.notes.length > 0 && (
            <ul className="notes">
              {slotResult.notes.map((note) => (
                <li key={note.code} className={`note ${note.level}`}>
                  <span className="badge">{note.level === 'unsupported' ? '未対応' : '近似'}</span> {note.message.ja}
                </li>
              ))}
            </ul>
          )}
          {slotResult && (
            <dl className="mini">
              <dt>攻撃力（バフ後）</dt>
              <dd>{formatNumber(slotResult.segments[0]?.trigger.attack ?? slotResult.baseAttack)}</dd>
              <dt>通常攻撃</dt>
              <dd>{formatNumber(slotResult.normalDamage)}</dd>
              <dt>バーストスキル</dt>
              <dd>
                {slotResult.burst.hit
                  ? `${formatNumber(slotResult.burst.totalDamage)}（${slotResult.burst.activations.length} 回 × ${formatNumber(
                      slotResult.burst.hit.perActivation,
                    )}）`
                  : '—'}
              </dd>
              <dt>DPS</dt>
              <dd>{formatNumber(slotResult.dps)}</dd>
              <dt>総ダメージ</dt>
              <dd className="total">{formatNumber(slotResult.totalDamage)}</dd>
              <dt>寄与率</dt>
              <dd>{formatPercent(slotResult.share, 1)}</dd>
            </dl>
          )}
        </>
      )}
    </fieldset>
  );
}
