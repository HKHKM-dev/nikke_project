// 1 パス目（../firstPass.ts の runFirstPassOnce）のゲージの量（plan/design-split-first-pass.md 3.4 節）: 枠ごとのゲージ速度（時間で変わる
// 速度の枠はフレームごとに出し直す）・発のゲージ・命中と会心・ペレット・障害物のゲージ。
import { SG_PELLET_GAUGE_HIT_RATE, energyPerTrigger, fullChargeGaugeOf } from '../../burst/dynamic.ts';
import { pelletsPerShot } from '../../skills/buffs.ts';
import { muzzleHitsOf } from '../../weapons.ts';
import { type LandingHitRateSpan } from '../landing.ts';
import type { FirstPassBase } from './base.ts';

/** 枠ごとのゲージの量（速度・発・命中・ペレット・障害物）を作る */
export function createGauge({ controlledSlot, lists, options, passive, slots }: FirstPassBase) {
  // ---- バースト ----
  const gaugeSpeed = passive.map((s) => s?.buffs.burstGaugeSpeed ?? 0);
  // 時間で変わるゲージ速度（timed・状態の中身）の件を持ちうる枠は、フレームの頭で
  // (1 + 常時の速度 + 効いている件の速度) を読み（f − 1 までに付いた件。射手と同じ見え方。
  // plan/design-skill-stage1.md 1.6 節）、そのフレームに溜めるゲージに掛ける。
  // 持たない枠は常時の値だけで、今までと同じ値（下の energies などを前もって作る）
  const timedGauge = slots.map((_, i) => lists.hasGaugeSpeedTracks(i));
  const timedGaugeSlots = slots.flatMap((_, i) => (timedGauge[i] ? [i] : []));
  const gaugeScale = slots.map((_, i) => 1 + gaugeSpeed[i]!);
  const targetEnergies = slots.map((slot) => slot?.character.shot.targetBurstEnergyPerShot ?? 0);
  /** 枠 i の、射手の 1 ヒットぶんのゲージ（targetBurstEnergyPerShot）のこのフレームの量。前もって作った値 fixed は速度が変わらない枠の分 */
  const targetEnergyNow = (i: number, fixed: number): number =>
    timedGauge[i] ? targetEnergies[i]! * gaugeScale[i]! : fixed;
  // 弾丸命中率が着地点で変わる枠は、1 発のゲージを命中率 1 で持ち、撃ったフレームの区間の命中率を掛ける。
  // SG はペレットの割合も 1 で持ち、区間の弾丸命中率が的の表の値ならそのまま（当たったペレットの割合。C-0150）、
  // 手入力の値なら置き値 SG_PELLET_GAUGE_HIT_RATE を掛ける（plan/design-sg-hit-rate.md 3 節）
  const hitRateSpans = slots.map((_, i) => options.hitRates?.[i] ?? null);
  const hitRateAt = slots.map(() => 0);
  // 二丁持ち（muzzleHitsOf）は 1 発 2 ヒットで、2 ヒットともゲージを溜める（plan/design-quency-eq.md 2 節の論点 1。SMG は C-1023、RL は C-1019）
  const muzzleHits = slots.map((slot) =>
    slot === null ? 1 : muzzleHitsOf(slot.character.weaponType, slot.character.shot),
  );
  const baseEnergies = slots.map((slot, i) =>
    slot === null
      ? 0
      : hitRateSpans[i]
        ? energyPerTrigger(slot.character.shot, i === controlledSlot, 1, 1, muzzleHits[i])
        : energyPerTrigger(
            slot.character.shot,
            i === controlledSlot,
            slot.hitRate ?? 1,
            SG_PELLET_GAUGE_HIT_RATE,
            muzzleHits[i],
          ),
  );
  const energies = baseEnergies.map((e, i) => e * (1 + gaugeSpeed[i]!));
  const pellets = slots.map((slot) => slot !== null && slot.character.shot.shotCount > 1);
  /** 枠 i のフレーム f の弾丸命中率の区間（自動でない枠は undefined。f は単調に増える） */
  const spanAt = (i: number, f: number): LandingHitRateSpan | undefined => {
    const spans = hitRateSpans[i];
    if (!spans) return undefined;
    while (hitRateAt[i]! + 1 < spans.length && spans[hitRateAt[i]!]!.end <= f) hitRateAt[i]! += 1;
    return spans[hitRateAt[i]!];
  };
  /** 枠 i がフレーム f の区間の値（持続の命中率▲が効いていれば出し直した値。▲は件の一覧の当たりの件。スタックは段の数だけ） */
  const spanValueAt = (
    i: number,
    f: number,
  ): LandingHitRateSpan | { hitRate: number; coreHits: number } | undefined => {
    const span = spanAt(i, f);
    if (span === undefined || options.hitRateWith === undefined || !lists.hasHitTracks) return span;
    return options.hitRateWith(i, span, lists.hitRateAt(i, f));
  };
  /**
   * 枠 i のフレーム f の発の、基礎のペレットの数に対する実効のペレットの数の比（固定なら 1 ÷ 基礎、▲なら (基礎 + Σ) ÷ 基礎。
   * plan/design-dorothy-serendipity.md 2.1・2.2 節）。ゲージとペレットの命中の量は、当たったペレットの数に比例する（C-0150・C-1075）。
   * ペレットの数の件の無い枠は 1。同じ発のゲージとペレットの命中の量が同じフレームで読むので、枠ごとに最後の値を覚える
   */
  const pelletTracked = slots.map((_, i) => pellets[i]! && lists.hasPelletTracks(i));
  const lastPelletRatio = slots.map(() => ({ frame: -1, ratio: 1 }));
  const pelletRatioAt = (i: number, f: number): number => {
    if (!pelletTracked[i]) return 1;
    const last = lastPelletRatio[i]!;
    if (last.frame !== f) {
      const count = slots[i]!.character.shot.shotCount;
      last.frame = f;
      last.ratio = pelletsPerShot(count, lists.pelletsAt(i, f)) / count;
    }
    return last.ratio;
  };
  /** 枠 i がフレーム f に撃った 1 発のゲージ */
  const energyAt = (i: number, f: number): number => {
    const energy = (timedGauge[i] ? baseEnergies[i]! * gaugeScale[i]! : energies[i]!) * pelletRatioAt(i, f);
    if (!hitRateSpans[i]) return energy;
    const span = spanAt(i, f);
    const pelletRate = pellets[i] && span?.measured !== true ? SG_PELLET_GAUGE_HIT_RATE : 1;
    return energy * (spanValueAt(i, f)?.hitRate ?? 1) * pelletRate;
  };
  /** 枠 i の 1 発のゲージに乗るフルチャージ倍率（C-0007。操作キャラのチャージ武器だけ。energyPerTrigger が掛ける値） */
  const chargeGaugeOf = (i: number): number => fullChargeGaugeOf(slots[i]!.character.shot, i === controlledSlot);
  /**
   * 枠 i の 1 発のゲージ（energyAt の値）が、ゲージ何回ぶんか（弾のヒットの期待値。SG は当たった
   * ペレットの数）。1 回のゲージ（targetBurstEnergyPerShot × フルチャージ倍率 × いまのゲージ速度）で割る
   */
  const gaugeHitsOf = (i: number, shotEnergy: number): number => {
    const unit = targetEnergies[i]! * chargeGaugeOf(i) * (timedGauge[i] ? gaugeScale[i]! : 1 + gaugeSpeed[i]!);
    return unit > 0 ? shotEnergy / unit : 0;
  };
  // 同 2 節（C-0177・C-0243）: 枠ごとの「発の番号 → 壊した障害物の数」と、物 1 個のゲージ
  const obstacles = slots.map(() => new Map<number, number>());
  for (const b of options.obstacleBreaks ?? []) obstacles[b.slotIndex]?.set(b.shot, b.count);
  const obstacleBases = slots.map((slot, i) =>
    slot === null ? 0 : slot.character.shot.burstEnergyPerShot * chargeGaugeOf(i),
  );
  const obstacleEnergies = obstacleBases.map((e, i) => e * (1 + gaugeSpeed[i]!));
  const obstacleEnergyAt = (i: number): number =>
    timedGauge[i] ? obstacleBases[i]! * gaugeScale[i]! : obstacleEnergies[i]!;
  const shotCounts = slots.map(() => 0);
  // 発ごとの命中・コアの命中の期待値（plan/design-ludmilla-wo.md 2.2・2.3 節）。
  // 区間はゲージと同じ値（常時の命中率▲ + 効いている持続の▲）。SG の命中は 1 トリガーを 1 回（ペレットのどれかが当たる）
  const enemyHasCore = options.enemyHasCore ?? true;
  const hitsAt = (i: number, f: number): { hits: number; coreHits: number } => {
    const slot = slots[i]!;
    const span = spanValueAt(i, f);
    const hitRate = span?.hitRate ?? slot.hitRate ?? 1;
    const coreHits = span !== undefined ? span.coreHits : (slot.hitRate ?? 1) * (slot.coreHitRate ?? 0);
    // 二丁持ちは 1 発 2 ヒット（命中・コアの命中の期待値もヒットごと）
    const m = muzzleHits[i]!;
    return { hits: pellets[i] ? 1 : hitRate * m, coreHits: enemyHasCore ? coreHits * m : 0 };
  };
  // 発ごとに的に当たったペレットの数（plan/design-pellet-hit.md 2・3 節）。録画で数えた入力があればその数、
  // 無ければ期待値（SG は shotCount × 当たったペレットの割合。割合はゲージと同じ: 的の表の区間はその値、手入力は
  // 弾丸命中率 × SG_PELLET_GAUGE_HIT_RATE。C-0150。SG 以外は命中の期待値と同じ）
  const pelletInputs = slots.map(() => new Map<number, number>());
  for (const p of options.pelletHits ?? []) p.counts.forEach((n, k) => pelletInputs[p.slotIndex]?.set(k, n));
  const pelletsAt = (i: number, f: number, k: number, hits: number): number => {
    const input = pelletInputs[i]!.get(k);
    if (input !== undefined) return input;
    if (!pellets[i]) return hits;
    const slot = slots[i]!;
    const span = spanAt(i, f);
    const rate =
      span === undefined
        ? (slot.hitRate ?? 1) * SG_PELLET_GAUGE_HIT_RATE
        : (spanValueAt(i, f)?.hitRate ?? 1) * (span.measured === true ? 1 : SG_PELLET_GAUGE_HIT_RATE);
    return slot.character.shot.shotCount * pelletRatioAt(i, f) * rate;
  };
  /** 時間で変わるゲージ速度の枠の、このフレームの (1 + 速度)（f − 1 までに付いた件） */
  const updateTimedGaugeSpeed = (f: number): void => {
    for (const i of timedGaugeSlots) gaugeScale[i] = 1 + gaugeSpeed[i]! + lists.gaugeSpeedAt(i, f);
  };
  return {
    chargeGaugeOf,
    energyAt,
    gaugeHitsOf,
    gaugeScale,
    gaugeSpeed,
    hitsAt,
    obstacleEnergyAt,
    obstacles,
    pelletsAt,
    shotCounts,
    targetEnergies,
    targetEnergyNow,
    timedGauge,
    updateTimedGaugeSpeed,
  };
}

export type Gauge = ReturnType<typeof createGauge>;
