// 1 パス目（../firstPass.ts の runFirstPassOnce）の召喚の攻撃（plan/design-split-first-pass.md 3.4 節。plan/design-ein-near-feather.md）:
// 発動で召喚を置き、攻撃のフレームとゲージを数える。
import { FRAMES_PER_GAME_SECOND, gameSecondsToFrames } from '../../time.ts';
import { type ResolvedDamageEffect } from '../../skills/burstDamage.ts';
import { effectFrameOf } from '../../burst/schedule.ts';
import { isSummonAttackTrigger, SKILL_SLOTS, type SummonAttackTrigger, type SummonEffect } from '../../skills/types.ts';
import type { SummonId } from '../../skills/summons.ts';
import { type FirstPassResult } from '../firstPass.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import type { GaugeEffects } from './gaugeEffects.ts';

/** 召喚の攻撃を追う */
export function createSummons({
  activationsOf,
  damageEffects,
  frames,
  hitGaugeEnergy,
  reserveTimerGauge,
  slots,
}: FirstPassBase & Gauge & GaugeEffects) {
  // 召喚の機数と攻撃の進み（plan/design-ein-near-feather.md 1.2・1.3 節）。展開（戦闘開始と、その枠のバーストの
  // 効果のフレーム）で組を置き換えて進みを 0 に戻し、フレームごとに、いまの機数の間隔の逆数を進みに積む。1 に届いたフレームに攻撃が
  // 発火し（余りは持ち越す）、gaugePerHit の効果はそのフレームのゲージに射手の 1 ヒットぶん × 倍数を足す
  const summonHits: FirstPassResult['summonHits'] = [];
  const summonTrackers: {
    slotIndex: number;
    summon: SummonId;
    onBurstUse: SummonEffect | undefined;
    /** 機数ごとの、1 フレームに積む進み（間隔の逆数） */
    ratePerFrame: Readonly<Record<number, number>>;
    delayFrames: number;
    /** ヒットごとのゲージの倍数（gaugePerHit の効果ごと） */
    gaugeScales: number[];
    /** 進みを積み始めるフレーム（展開 + 遅れ。この後のフレームから積む）。展開の前は null */
    activeFrom: number | null;
    /** いまの組の、1 機ずつの消えるフレーム（昇順。消えない機は入れない）と、消えない機の数 */
    expiries: number[];
    stays: number;
    progress: number;
    /** 次に見るバーストの発動（activationsOf() の添字） */
    nextActivation: number;
  }[] = [];
  const deploySummon = (t: (typeof summonTrackers)[number], at: number, effect: SummonEffect): void => {
    const finite = effect.lifetimesSeconds.filter((x): x is number => x !== null);
    t.activeFrom = at + t.delayFrames;
    t.expiries = finite.map((x) => at + gameSecondsToFrames(x)).sort((a, b) => a - b);
    t.stays = effect.lifetimesSeconds.length - finite.length;
    t.progress = 0;
  };
  damageEffects.forEach((effects, i) => {
    const byId = new Map<SummonId, ResolvedDamageEffect[]>();
    for (const e of effects) {
      if (isSummonAttackTrigger(e.trigger)) byId.set(e.trigger.summon, [...(byId.get(e.trigger.summon) ?? []), e]);
    }
    if (byId.size === 0) return;
    const deploys = SKILL_SLOTS.flatMap((s) => slots[i]!.definition!.skills[s].effects).filter(
      (e): e is SummonEffect => e.kind === 'summon',
    );
    for (const [summon, attacks] of byId) {
      const trigger = attacks[0]!.trigger as SummonAttackTrigger;
      const t: (typeof summonTrackers)[number] = {
        slotIndex: i,
        summon,
        onBurstUse: deploys.find((d) => d.summon === summon && d.trigger === 'burstUse'),
        ratePerFrame: Object.fromEntries(
          Object.entries(trigger.intervalSeconds).map(([n, sec]) => [Number(n), 1 / (sec * FRAMES_PER_GAME_SECOND)]),
        ),
        delayFrames: gameSecondsToFrames(trigger.startDelaySeconds),
        gaugeScales: attacks.flatMap((e) => (e.gaugePerHit === undefined ? [] : [e.gaugePerHit])),
        activeFrom: null,
        expiries: [],
        stays: 0,
        progress: 0,
        nextActivation: 0,
      };
      // 戦闘開始時の展開はフレーム 0（フレーム 0 の終わりに、次のフレームの進みから積む）
      const atStart = deploys.find((d) => d.summon === summon && d.trigger === 'battleStart');
      if (atStart !== undefined) deploySummon(t, 0, atStart);
      summonTrackers.push(t);
    }
  });
  /** フレーム f の終わりに、f のバーストの展開を入れ、次のフレームの攻撃の進みを積む（発火したら次のフレームのゲージに予約する） */
  const countSummons = (f: number): void => {
    const activations = activationsOf();
    const g = f + 1;
    for (const t of summonTrackers) {
      while (t.nextActivation < activations.length) {
        const a = activations[t.nextActivation]!;
        if (a.slotIndex === t.slotIndex) {
          const at = effectFrameOf(a);
          if (at > f) break;
          if (t.onBurstUse !== undefined) deploySummon(t, at, t.onBurstUse);
        }
        t.nextActivation += 1;
      }
      if (g >= frames || t.activeFrom === null || g <= t.activeFrom) continue;
      while (t.expiries.length > 0 && t.expiries[0]! <= g) t.expiries.shift();
      const n = t.expiries.length + t.stays;
      if (n === 0) continue;
      t.progress += t.ratePerFrame[n]!;
      if (t.progress < 1 - 1e-9) continue;
      t.progress -= 1;
      summonHits.push({ slotIndex: t.slotIndex, summon: t.summon, frame: g });
      for (const scale of t.gaugeScales) reserveTimerGauge(t.slotIndex, f, g, hitGaugeEnergy(t.slotIndex) * scale);
    }
  };
  return { countSummons, summonHits };
}

export type Summons = ReturnType<typeof createSummons>;
