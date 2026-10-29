import {
  BURST_GAUGE_MAX,
  capCritRate,
  energyPerTrigger,
  framesToGameSeconds,
  isStateContent,
  isTimedItem,
  type AppliedTimedEffect,
  type CharacterData,
  type Element,
  type ItemEffect,
  type SkillLevels,
  type TeamSlotResult,
  type TreasurePhase,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { formatNumber, formatPercent } from '../format.ts';
import {
  BURST_DAMAGE_TYPE_LABEL,
  SKILL_DAMAGE_TYPE_LABEL,
  SKILL_SLOT_LABEL,
  formatAppliedAmount,
  formatBuildEffect,
  formatBuildEffectSource,
  formatDamageCondition,
  formatEffectSource,
  formatBurstStepMode,
  formatInstant,
  formatConditionSuffix,
  formatInstantTarget,
  formatItemDuration,
  formatItemTrigger,
  formatTimedExtras,
  formatTimedTrigger,
  formatTrigger,
  stateLabel,
} from '../skillLabels.ts';
import type { TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';
import { SkillDetailsSection } from './SkillSection.tsx';

type Props = {
  slotIndex: number;
  character: CharacterData;
  slot: TeamSlotResult;
  attackLabel?: string;
  slotNames: readonly (string | undefined)[];
  teamCharacters: readonly (CharacterData | null)[];
  enemyElement: Element | null;
  effectiveSkillLevels: SkillLevels;
  treasurePhase: TreasurePhase;
  skillsStatus: SlotSkillsStatus;
  hpRatio: number;
  dispatch: Dispatch<TeamAction>;
};

type SkillHitGroup = {
  label: string;
  trigger: string;
  multiplier: number;
  assumes: string | null;
  count: number;
  total: number;
  /** 発動ごとに値が違うか（持続バフの有無で変わる） */
  varies: boolean;
  min: number;
  max: number;
  /** レイヴン編: スタックする持続ダメージなら、tick のスタックの数の範囲 */
  stacks: { min: number; max: number } | null;
};

/** レイヴン編: 持続ダメージのトリガーの説明（スタックとゲージ。plan/design-raven-s1.md） */
function dotTriggerText(e: NonNullable<TeamSlotResult['skillHits']['activations'][number]['effect']>): string {
  const d = e.dot!;
  const stacks =
    d.maxStacks > 1 ? `（1 回で 1 スタック・最大 ${d.maxStacks}。付け直すと全スタックの時間が付け直される）` : '';
  const gauge = [d.gaugeOnApply ? '付けたとき' : null, d.gaugeOnTick ? 'tick ごと' : null].filter((x) => x !== null);
  const gaugeText = gauge.length > 0 ? `。${gauge.join('と ')}に射手の 1 ヒットぶんのゲージ` : '';
  if (d.autoAttack) {
    const hitGauge = d.gaugeOnTick ? '。ヒットごとに射手の 1 ヒットぶんのゲージ' : '';
    return `${formatTrigger(e.trigger)}から ${d.durationSeconds} 秒間、${d.intervalSeconds} 秒ごとに自動攻撃。回数はヒットの数${hitGauge}`;
  }
  return `${formatTrigger(e.trigger)}に付き${stacks}、${d.intervalSeconds} 秒ごとに ${d.durationSeconds} 秒間。回数は tick の数${gaugeText}`;
}

/** Stage 8: 倍率ダメージ（damage）を効果ごとにまとめる */
function groupSkillHits(slot: TeamSlotResult): SkillHitGroup[] {
  const groups = new Map<string, SkillHitGroup>();
  for (const a of slot.skillHits.activations) {
    const e = a.effect;
    const key = `${e.source.skill}.${e.effectIndex}.${e.cycle?.step ?? ''}`;
    const value = a.hit.perActivation;
    const g = groups.get(key);
    if (g) {
      if (g.stacks && a.stacks !== undefined) {
        g.stacks.min = Math.min(g.stacks.min, a.stacks);
        g.stacks.max = Math.max(g.stacks.max, a.stacks);
      }
      g.count += 1;
      g.total += value;
      g.min = Math.min(g.min, value);
      g.max = Math.max(g.max, value);
      g.varies = g.min !== g.max;
      continue;
    }
    groups.set(key, {
      label: `${SKILL_SLOT_LABEL[e.source.skill]} ${e.dot ? (e.dot.autoAttack ? '自動攻撃' : '持続ダメージ') : SKILL_DAMAGE_TYPE_LABEL[e.damageType]}${
        e.cycle ? `（段 ${String.fromCharCode(65 + e.cycle.step)}）` : ''
      }`,
      trigger: e.cycle
        ? `${formatTrigger(e.trigger)}に ${e.cycle.steps} 段を循環（${e.cycle.step + 1} 段目。窓の中は間隔の変更に従う）`
        : e.dot
          ? dotTriggerText(e)
          : `${formatTrigger(e.trigger)}${formatDamageCondition(e.condition)}`,
      multiplier: e.multiplier,
      assumes: e.assumes?.ja ?? null,
      count: 1,
      total: value,
      varies: false,
      min: value,
      max: value,
      stacks: a.stacks === undefined ? null : { min: a.stacks, max: a.stacks },
    });
  }
  return [...groups.values()];
}

/** [0.0–15.0s, 20.0–35.0s] */
function formatRanges(ranges: readonly { start: number; end: number }[]): string {
  return ranges
    .map((r) => `${formatNumber(framesToGameSeconds(r.start), 1)}–${formatNumber(framesToGameSeconds(r.end), 1)}s`)
    .join(', ');
}

export function ResultPanel({
  slotIndex,
  character,
  slot,
  attackLabel = '攻撃力（素）',
  slotNames,
  teamCharacters,
  enemyElement,
  effectiveSkillLevels,
  treasurePhase,
  skillsStatus,
  hpRatio,
  dispatch,
}: Props) {
  const { cadence, segments, burst, notes, autoCondition } = slot;
  const skillHitGroups = groupSkillHits(slot);
  const rep = segments[0];
  const buffs = rep?.buffs;
  const hasAttackBuff = buffs !== undefined && (buffs.attackRatio !== 0 || buffs.attackFlat !== 0);
  const hasCritBuff = buffs !== undefined && (buffs.critRate !== 0 || buffs.critDamage !== 0);
  const repIsTimed = (rep?.timedEffects.length ?? 0) > 0 && segments.length > 1;
  const activationsVary =
    burst.activations.length > 1 &&
    burst.activations.some((a) => a.hit.perActivation !== burst.activations[0]!.hit.perActivation);

  const subIndexOf = (e: ItemEffect) => (isStateContent(e) ? e.subIndex : '');
  const timedSummary = slot.effects.map((summary) => {
    let effect: AppliedTimedEffect = {
      ...summary.effect,
      sourceSlotIndex: summary.sourceSlotIndex,
      appliedAmount:
        summary.effect.scaling === 'casterAttack' || summary.effect.scaling === 'casterFinalMaxHp'
          ? 0
          : summary.effect.value,
    };
    const applied = slot.segments
      .flatMap((seg) => seg.timedEffects)
      .find(
        (e) =>
          e.sourceSlotIndex === effect.sourceSlotIndex &&
          e.source.skill === effect.source.skill &&
          e.effectIndex === effect.effectIndex &&
          subIndexOf(e) === subIndexOf(effect),
      );
    if (applied) effect = applied;
    return { effect, count: summary.count, skips: summary.skips };
  });

  const perShotDamage = slot.segments.reduce((sum, g) => sum + g.trigger.perShot * g.triggers, 0);

  const instantSummary = (() => {
    const byKey = new Map<string, { instant: TeamSlotResult['instants'][number]; count: number; total: number }>();
    for (const x of slot.instants) {
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

  const cycleSummary = slot.cycleChanges;
  const hasNoReceivedBuffs =
    slot.passiveEffects.length === 0 &&
    slot.buildEffects.length === 0 &&
    slot.effects.every((e) => e.stateOnly) &&
    slot.instants.length === 0 &&
    slot.cycleChanges.length === 0 &&
    slot.states.length === 0;

  if (rep === undefined || buffs === undefined) return null;

  return (
    <section className="panel result">
      <p className="meta">
        装弾数 {character.shot.maxAmmo} / リロード {character.shot.reloadTime}s / 武器倍率 {character.shot.damage / 100}
        % / バースト CT {character.burstSkill.cooldownSeconds}s / ゲージ 1 トリガー{' '}
        {formatNumber((energyPerTrigger(character.shot, true) / BURST_GAUGE_MAX) * 100, 2)}%
        {character.shot.chargeTime > 0 &&
          `（AI ${formatNumber((energyPerTrigger(character.shot, false) / BURST_GAUGE_MAX) * 100, 2)}%）`}
        {autoCondition && (
          <>
            <br />
            自動条件: コア命中率 {formatPercent(autoCondition.coreHitRate, 1)}・距離ボーナス{' '}
            {character.bonusRange === null ? 'なし' : `${formatPercent(autoCondition.distanceBonus, 1)}`}・弾丸命中率{' '}
            {formatPercent(autoCondition.hitRate, 1)}
          </>
        )}
      </p>

      <dl className="summary">
        <dt>通常攻撃</dt>
        <dd>
          {formatNumber(slot.normalDamage)}
          {perShotDamage > 0 && `（うち毎発の追加ダメージ ${formatNumber(perShotDamage)}）`}
        </dd>
        <dt>バーストスキル</dt>
        <dd>
          {burst.hit
            ? `${formatNumber(burst.totalDamage)}（${burst.activations.length} 回 × ${formatNumber(burst.hit.perActivation)}）`
            : '—'}
        </dd>
        {skillHitGroups.length > 0 && (
          <>
            <dt>スキルダメージ</dt>
            <dd>{`${formatNumber(slot.skillHits.totalDamage)}（${slot.skillHits.activations.length} 回）`}</dd>
          </>
        )}
        <dt>DPS</dt>
        <dd>{formatNumber(slot.dps)}</dd>
        <dt>総ダメージ</dt>
        <dd className="total">{formatNumber(slot.totalDamage)}</dd>
      </dl>

      <div className="received">
        <span className="skills-title">受けているバフ</span>
        {hasNoReceivedBuffs ? (
          <p className="hint">なし</p>
        ) : (
          <ul className="received-list">
            {slot.passiveEffects.map((e, i) => (
              <li key={i}>
                <span className="amount">{formatAppliedAmount(e)}</span>
                <small className="sub">{formatEffectSource(e, slotNames[e.sourceSlotIndex])}</small>
              </li>
            ))}
            {slot.buildEffects.map((e, i) => (
              <li key={`build-${i}`}>
                <span className="amount">{formatBuildEffect(e)}</span>
                <small className="sub">育成 {formatBuildEffectSource(e.source)}</small>
              </li>
            ))}
            {timedSummary.map((t, i) => (
              <li key={`timed-${i}`}>
                <span className="amount">{formatAppliedAmount(t.effect)}</span>
                <small className="sub">
                  {formatItemTrigger(t.effect)} {formatEffectSource(t.effect, slotNames[t.effect.sourceSlotIndex])}
                  {formatItemDuration(t.effect)}{' '}
                  {isTimedItem(t.effect) && typeof t.effect.trigger === 'object' && 'chance' in t.effect.trigger
                    ? '（期待値）'
                    : `× ${t.count} 回`}
                  {formatTimedExtras(t.effect)}
                  {t.skips > 0 ? `・不発 ${t.skips} 回` : ''}
                </small>
              </li>
            ))}
            {instantSummary.map((x, i) => (
              <li key={`instant-${i}`}>
                <span className="amount">{formatInstant(x.instant.effect)}</span>
                <small className="sub">
                  {formatTimedTrigger(x.instant.effect.trigger)} 枠 {x.instant.sourceSlotIndex + 1}{' '}
                  {slotNames[x.instant.sourceSlotIndex] ?? ''}
                  {formatInstantTarget(x.instant.effect)}
                  {formatConditionSuffix(x.instant.effect.condition)}
                  {formatBurstStepMode(x.instant.effect.burstStepMode)}・{x.count} 回
                  {x.instant.effect.kind === 'cooldownReduction'
                    ? `（計 ${formatNumber(framesToGameSeconds(x.total), 2)} 秒）`
                    : x.instant.effect.kind === 'ammoRefill'
                      ? `（計 ${x.total} 発）`
                      : ''}
                </small>
              </li>
            ))}
            {slot.states.map((x) => (
              <li key={`state-${x.sourceSlotIndex}-${x.state}`}>
                <span className="amount">状態: {stateLabel(x.state)}</span>
                <small className="sub">
                  枠 {x.sourceSlotIndex + 1} {slotNames[x.sourceSlotIndex] ?? ''}・
                  {x.isStatic ? '常時' : `${x.count} 回`}
                  {x.undispellable ? '・解除不可' : ''}
                </small>
              </li>
            ))}
            {cycleSummary.map(({ count, ...w }) => (
              <li key={`cycle-${w.source.skill}-${w.effectIndex}`}>
                <span className="amount">
                  {w.target === 'shotCounts'
                    ? `${SKILL_SLOT_LABEL[w.targetSkill]} の回数のきっかけを ${w.every} 回ごとにする`
                    : `${SKILL_SLOT_LABEL[w.targetSkill]} の段を${w.every === 1 ? '毎回' : ` ${w.every} 回ごとに`}進める`}
                </span>
                <small className="sub">
                  {SKILL_SLOT_LABEL[w.source.skill]}・{formatNumber(framesToGameSeconds(w.end - w.start), 0)} 秒 ×{' '}
                  {count} 回
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SkillDetailsSection
        slotIndex={slotIndex}
        character={character}
        levels={effectiveSkillLevels}
        treasurePhase={treasurePhase}
        status={skillsStatus}
        teamCharacters={teamCharacters}
        enemyElement={enemyElement}
        hpRatio={hpRatio}
        dispatch={dispatch}
      />

      <details className="segments">
        <summary>ダメージ計算式の内訳・区間（{segments.length} 通り）</summary>
        <h3>
          通常攻撃の内訳
          <small className="sub">
            （代表: {formatRanges(rep.ranges)}
            {rep.fullBurst ? '・フルバースト中' : ''}
            {repIsTimed ? '・持続バフ中' : ''}）
          </small>
        </h3>
        <table className="breakdown">
          <tbody>
            <tr>
              <th>{attackLabel}</th>
              <td>{formatNumber(slot.baseAttack)}</td>
            </tr>
            {hasAttackBuff && (
              <>
                <tr>
                  <th>攻撃力バフ</th>
                  <td>
                    {`${buffs.attackRatio !== 0 ? `×(1 + ${formatPercent(buffs.attackRatio, 2)})` : ''}${
                      buffs.attackRatio !== 0 && buffs.attackFlat !== 0 ? ' ' : ''
                    }${buffs.attackFlat !== 0 ? `+${formatNumber(buffs.attackFlat)}` : ''}`}
                  </td>
                </tr>
                <tr>
                  <th>攻撃力（バフ後）</th>
                  <td>{formatNumber(rep.trigger.attack)}</td>
                </tr>
              </>
            )}
            <tr>
              <th>攻撃力 − 防御力</th>
              <td>{formatNumber(rep.trigger.baseHit)}</td>
            </tr>
            <tr>
              <th>武器倍率</th>
              <td>
                {`${formatPercent(rep.trigger.weaponMultiplier, 2)}${
                  character.shot.shotCount > 1 ? `（${character.shot.shotCount} ペレット合計）` : ''
                }`}
              </td>
            </tr>
            {rep.trigger.normalAttackMultiplier !== 1 && (
              <tr>
                <th>通常攻撃ダメージ倍率</th>
                <td>×{formatNumber(rep.trigger.normalAttackMultiplier, 4)}</td>
              </tr>
            )}
            {rep.trigger.chargeMultiplier !== 1 && (
              <tr>
                <th>チャージ倍率</th>
                <td>
                  {`×${formatNumber(rep.trigger.chargeMultiplier, 4)}${
                    buffs.chargeDamage !== 0 || buffs.chargeDamageMultiplier !== 0
                      ? `（${character.shot.fullChargeDamage}${
                          buffs.chargeDamageMultiplier !== 0
                            ? ` × (1 + ${formatPercent(buffs.chargeDamageMultiplier, 2)}) を丸め`
                            : ''
                        }${buffs.chargeDamage !== 0 ? ` + ${formatPercent(buffs.chargeDamage, 2)}` : ''}）`
                      : ''
                  }`}
                </td>
              </tr>
            )}
            <tr>
              <th>コア（期待値）</th>
              <td>
                +{formatNumber(rep.trigger.boost.core, 3)}
                {buffs.coreDamage !== 0 && `（コアダメージ +${formatPercent(buffs.coreDamage, 2)} 込み）`}
              </td>
            </tr>
            <tr>
              <th>会心（期待値）</th>
              <td>
                {`+${formatNumber(rep.trigger.boost.crit, 3)}${
                  hasCritBuff
                    ? `（確率 ${formatPercent(capCritRate(character.crit.rate + buffs.critRate), 2)} × ダメージ +${formatPercent(
                        character.crit.damage - 1 + buffs.critDamage,
                        2,
                      )}）`
                    : ''
                }`}
              </td>
            </tr>
            <tr>
              <th>距離ボーナス</th>
              <td>+{formatNumber(rep.trigger.boost.distance, 1)}</td>
            </tr>
            <tr>
              <th>フルバースト</th>
              <td>{rep.trigger.boost.fullBurst !== 0 ? `+${formatNumber(rep.trigger.boost.fullBurst, 1)}` : '—'}</td>
            </tr>
            <tr>
              <th>倍率グループ合計</th>
              <td>×{formatNumber(rep.trigger.boost.total, 3)}</td>
            </tr>
            {buffs.attackDamage !== 0 && (
              <tr>
                <th>攻撃ダメージ（バフ）</th>
                <td>×{formatNumber(rep.trigger.attackDamageMultiplier, 4)}</td>
              </tr>
            )}
            <tr>
              <th>属性有利</th>
              <td>
                ×{formatNumber(rep.trigger.elementMultiplier, 4)}
                {rep.trigger.elementMultiplier !== 1 &&
                  buffs.elementDamage !== 0 &&
                  `（1.1 + 有利コード ${formatPercent(buffs.elementDamage, 2)}）`}
              </td>
            </tr>
            <tr>
              <th>1 トリガー期待ダメージ</th>
              <td>{formatNumber(rep.trigger.perTrigger)}</td>
            </tr>
            <tr>
              <th>マガジン</th>
              <td>{`${cadence.triggersPerCycle} 発 / ${formatNumber(framesToGameSeconds(cadence.magazineFrames), 2)} 秒`}</td>
            </tr>
            <tr>
              <th>リロード</th>
              <td>
                {`${formatNumber(framesToGameSeconds(cadence.reloadFrames), 2)} 秒${
                  cadence.reloadChunks > 1 ? `（${cadence.reloadChunks} 回）` : ''
                }`}
              </td>
            </tr>
            <tr>
              <th>1 周期</th>
              <td>{formatNumber(cadence.cycleSeconds, 2)} 秒</td>
            </tr>
            <tr>
              <th>秒間トリガー数</th>
              <td>{formatNumber(cadence.triggersPerSecond, 3)}</td>
            </tr>
          </tbody>
        </table>

        <h3>区間（{segments.length} 通りのバフ状態）</h3>
        <div className="table-scroll">
          <table className="breakdown">
            <thead>
              <tr>
                <th>時間帯</th>
                <th>FB</th>
                <th>攻撃力</th>
                <th>倍率グループ</th>
                <th>攻撃ダメージ</th>
                <th>1 トリガー</th>
                {/* 一本化の段 A-2: 全区間が射撃の列の発数になったので、2026-10-27 までの「（実数）」の印は消した */}
                <th title="1 パス目の射撃の列から数えた発数">トリガー数</th>
                <th>ダメージ</th>
                <th>持続バフ</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={i}>
                  <td>
                    {formatRanges(seg.ranges)}
                    <small className="sub"> 計 {formatNumber(seg.seconds, 1)}s</small>
                  </td>
                  <td>{seg.fullBurst ? '○' : '—'}</td>
                  <td>{formatNumber(seg.trigger.attack)}</td>
                  <td>×{formatNumber(seg.trigger.boost.total, 3)}</td>
                  <td>×{formatNumber(seg.trigger.attackDamageMultiplier, 4)}</td>
                  <td>{formatNumber(seg.trigger.perTrigger)}</td>
                  <td>
                    {formatNumber(seg.triggers)}
                    {seg.partialCharge && (
                      <small
                        className="sub"
                        title="攻撃できる的がいなくなった瞬間に、チャージの途中で撃った発（C-0109）。値はチャージの進みに比例すると仮定（チャージのバフがある場合とゲージは未確認）"
                      >
                        {' '}
                        うち部分チャージ {formatNumber(seg.partialCharge.triggers)} 発
                      </small>
                    )}
                  </td>
                  <td>{formatNumber(seg.damage)}</td>
                  <td>
                    {seg.timedEffects.length === 0
                      ? '—'
                      : seg.timedEffects.map((e, j) => (
                          <small key={j} className="sub">
                            {formatItemTrigger(e)} {formatAppliedAmount(e)}
                            {j < seg.timedEffects.length - 1 ? ' / ' : ''}
                          </small>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {burst.hit && (
          <>
            <h3>バーストスキルの内訳</h3>
            <table className="breakdown">
              <tbody>
                <tr>
                  <th>攻撃力（バフ後） − 防御力</th>
                  <td>{formatNumber(burst.hit.baseHit)}</td>
                </tr>
                {burst.hit.perEffect.map((p, i) => (
                  <tr key={i}>
                    <th>{BURST_DAMAGE_TYPE_LABEL[p.effect.damageType]}</th>
                    <td>
                      ×{formatNumber(p.effect.multiplier, 4)}
                      {p.effect.damageType === 'distributed' ? '（近似: 単体ボスでは全額）' : ''}
                      {p.effect.assumes ? `・仮定: ${p.effect.assumes.ja}` : ''}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th>会心（期待値）</th>
                  <td>+{formatNumber(burst.hit.boost.crit, 3)}</td>
                </tr>
                <tr>
                  <th>フルバースト</th>
                  <td>
                    {burst.hit.boost.fullBurst !== 0
                      ? `+${formatNumber(burst.hit.boost.fullBurst, 1)}`
                      : '乗せない（仮定）'}
                  </td>
                </tr>
                <tr>
                  <th>倍率グループ合計</th>
                  <td>×{formatNumber(burst.hit.boost.total, 3)}</td>
                </tr>
                {burst.hit.attackDamageMultiplier !== 1 && (
                  <tr>
                    <th>攻撃ダメージ（バフ）</th>
                    <td>×{formatNumber(burst.hit.attackDamageMultiplier, 4)}</td>
                  </tr>
                )}
                {burst.hit.distributedDamageMultiplier !== 1 && (
                  <tr>
                    <th>分配ダメージ（バフ）</th>
                    <td>×{formatNumber(burst.hit.distributedDamageMultiplier, 4)}</td>
                  </tr>
                )}
                <tr>
                  <th>属性有利</th>
                  <td>×{formatNumber(burst.hit.elementMultiplier, 4)}</td>
                </tr>
                <tr>
                  <th>1 発動</th>
                  <td>
                    {formatNumber(burst.hit.perActivation)}
                    {activationsVary ? <small className="sub">（発動ごとに異なる）</small> : ''}
                  </td>
                </tr>
                <tr>
                  <th>発動</th>
                  <td>
                    {burst.activations.length} 回
                    {burst.activations.length > 0
                      ? `（${burst.activations
                          .map(
                            (a) =>
                              `${formatNumber(a.seconds, 0)}s${activationsVary ? `: ${formatNumber(a.hit.perActivation)}` : ''}`,
                          )
                          .join(', ')}）`
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>合計</th>
                  <td>{formatNumber(burst.totalDamage)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {skillHitGroups.length > 0 && (
          <>
            <h3>スキルの倍率ダメージの内訳</h3>
            <table className="breakdown">
              <tbody>
                {skillHitGroups.map((g, i) => (
                  <tr key={i}>
                    <th>
                      {g.label}
                      <small className="sub">（{g.trigger}）</small>
                    </th>
                    <td>
                      ×{formatNumber(g.multiplier, 4)}
                      {g.stacks
                        ? ` × スタック（${g.stacks.min === g.stacks.max ? g.stacks.min : `${g.stacks.min}〜${g.stacks.max}`}）`
                        : ''}{' '}
                      → 1 回 {g.varies ? `${formatNumber(g.min)}〜${formatNumber(g.max)}` : formatNumber(g.min)} ×{' '}
                      {g.count} 回 = {formatNumber(g.total)}
                      {g.assumes ? <small className="sub">・仮定: {g.assumes}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </details>

      {notes.length > 0 && (
        <details className="segments">
          <summary>近似・未対応の注記（{notes.length} 件）</summary>
          <ul className="notes">
            {notes.map((note) => (
              <li key={note.code} className={`note ${note.level}`}>
                <span className="badge">{note.level === 'unsupported' ? '未対応' : '近似'}</span> {note.message.ja}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
