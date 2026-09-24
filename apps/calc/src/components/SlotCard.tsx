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
  type BuildInput,
  type BuildMasters,
  type SkillLevels,
  type TeamSlotResult,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { formatNumber, formatPercent } from '../format.ts';
import {
  SKILL_SLOT_LABEL,
  formatAppliedAmount,
  formatEffectSource,
  formatInstant,
  formatTimedExtras,
  formatTimedTrigger,
} from '../skillLabels.ts';
import { effectiveTreasurePhase, type SlotState, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';
import { BuildSection } from './BuildSection.tsx';
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
  /** Stage 12: スペック固定を反映した実際に計算へ渡す育成入力 */
  effectiveBuild: BuildInput;
  masters: BuildMasters | null;
  mastersError: string | null;
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
  effectiveBuild,
  masters,
  mastersError,
  skillsStatus,
  slotNames,
  slotResult,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;
  const condition = slot.condition;
  // 同じ効果の窓をまとめて「10 秒 × 9 回」と見せる（窓は発動ごとに 1 件ある）。
  // Stage 11 モダニア: スタックする効果は段 1 の窓だけを数える。命中率（状態だけの stat）の窓も並べる
  const timedSummary = (() => {
    const byKey = new Map<string, { effect: AppliedTimedEffect; count: number }>();
    for (const w of [...(slotResult?.windows ?? []), ...(slotResult?.stateWindows ?? [])]) {
      const key = `${w.sourceSlotIndex}:${w.effect.source.skill}:${w.effect.effectIndex}`;
      const found = byKey.get(key);
      if (found) {
        if ((w.stack ?? 1) === 1) found.count += 1;
        continue;
      }
      byKey.set(key, {
        // 区間に出ない窓（命中率）でも値が出るように、比率の効果は値そのものを仮に入れる（下で区間の値に置き換える）
        effect: {
          ...w.effect,
          sourceSlotIndex: w.sourceSlotIndex,
          appliedAmount: w.effect.scaling === 'casterAttack' ? 0 : w.effect.value,
        },
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
  /** Stage 11 モダニア: 条件を満たさずに発火しなかった回数（効果ごと） */
  const skipsOf = (effect: AppliedTimedEffect): number =>
    (slotResult?.conditionSkips ?? []).filter(
      (x) => x.effect.source.skill === effect.source.skill && x.effect.effectIndex === effect.effectIndex,
    ).length;
  /** Stage 11 モダニア: 射撃ごとの追加ダメージの合計（1 トリガーの値に畳み込んだ分） */
  const perShotDamage = (slotResult?.segments ?? []).reduce((sum, g) => sum + g.trigger.perShot * g.triggers, 0);

  // Stage 10: 受けた即時効果（CT 短縮・弾丸チャージ。Stage 11 で回復も）を効果ごとにまとめる
  const instantSummary = (() => {
    const byKey = new Map<
      string,
      { instant: NonNullable<typeof slotResult>['instants'][number]; count: number; total: number }
    >();
    for (const x of slotResult?.instants ?? []) {
      const key = `${x.sourceSlotIndex}:${x.effect.source.skill}:${x.effect.effectIndex}`;
      const found = byKey.get(key);
      if (found) {
        found.count += 1;
        found.total += x.amount;
        continue;
      }
      byKey.set(key, { instant: x, count: 1, total: x.amount });
    }
    return [...byKey.values()];
  })();

  // Stage 11 紅蓮BS: 循環の間隔の変更（「スキル 1 の段を毎回進める」）の窓を効果ごとにまとめる
  const cycleSummary = (() => {
    const byKey = new Map<string, { window: NonNullable<typeof slotResult>['cycleWindows'][number]; count: number }>();
    for (const w of slotResult?.cycleWindows ?? []) {
      const key = `${w.source.skill}:${w.effectIndex}`;
      const found = byKey.get(key);
      if (found) found.count += 1;
      else byKey.set(key, { window: w, count: 1 });
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
            {formatNumber((energyPerTrigger(character.shot, true) / BURST_GAUGE_MAX) * 100, 2)}%
            {character.shot.chargeTime > 0 &&
              `（AI ${formatNumber((energyPerTrigger(character.shot, false) / BURST_GAUGE_MAX) * 100, 2)}%）`}
          </p>
          <div className="growth-row">
            {growthField('level', 'レベル', 1, limits.levelMax)}
            {growthField('grade', '限界突破', 0, limits.gradeMax)}
            {growthField('core', 'コア強化', 0, limits.coreMax)}
          </div>
          <BuildSection
            slotIndex={slotIndex}
            character={character}
            build={slot.build}
            effectiveBuild={effectiveBuild}
            growth={effectiveGrowth}
            treasurePhase={effectiveTreasurePhase(slot, character)}
            masters={masters}
            mastersError={mastersError}
            disabled={fixedSpec}
            dispatch={dispatch}
          />
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
            treasurePhase={effectiveTreasurePhase(slot, character)}
            disabled={fixedSpec}
            status={skillsStatus}
            dispatch={dispatch}
          />
          {slotResult && (
            <div className="received">
              <span className="skills-title">受けているバフ</span>
              {slotResult.passiveEffects.length === 0 &&
              slotResult.windows.length === 0 &&
              slotResult.instants.length === 0 &&
              slotResult.cycleWindows.length === 0 ? (
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
                        {formatNumber(t.effect.durationFrames / 60, 0)} 秒 × {t.count} 回{formatTimedExtras(t.effect)}
                        {t.effect.condition && skipsOf(t.effect) > 0
                          ? `・状態でなく発動せず ${skipsOf(t.effect)} 回`
                          : ''}
                        {t.effect.assumes ? `・仮定: ${t.effect.assumes.ja}` : ''}
                      </small>
                    </li>
                  ))}
                  {instantSummary.map((x, i) => (
                    <li key={`instant-${i}`}>
                      <span className="amount">{formatInstant(x.instant.effect)}</span>
                      <small className="sub">
                        {formatTimedTrigger(x.instant.effect.trigger)} 枠 {x.instant.sourceSlotIndex + 1}{' '}
                        {slotNames[x.instant.sourceSlotIndex] ?? ''}・{x.count} 回
                        {x.instant.effect.kind === 'cooldownReduction'
                          ? `（実際に縮んだ計 ${formatNumber(x.total / 60, 2)} 秒）`
                          : x.instant.effect.kind === 'ammoRefill'
                            ? `（計 ${x.total} 発）`
                            : ''}
                        {x.instant.effect.assumes ? `・仮定: ${x.instant.effect.assumes.ja}` : ''}
                      </small>
                    </li>
                  ))}
                  {cycleSummary.map(({ window: w, count }) => (
                    <li key={`cycle-${w.source.skill}-${w.effectIndex}`}>
                      <span className="amount">
                        {SKILL_SLOT_LABEL[w.targetSkill]} の段を{w.every === 1 ? '毎回' : ` ${w.every} 回ごとに`}進める
                      </span>
                      <small className="sub">
                        {SKILL_SLOT_LABEL[w.source.skill]}・{formatNumber((w.end - w.start) / 60, 0)} 秒 × {count} 回
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
              <dd>
                {formatNumber(slotResult.normalDamage)}
                {perShotDamage > 0 && `（うち毎発の追加ダメージ ${formatNumber(perShotDamage)}）`}
              </dd>
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
