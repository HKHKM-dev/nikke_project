// 1 パス目のゲージを溜める効果（../gaugeEffects.ts の createGaugeEffects）のうち、発のゲージを着弾のフレームに入れる口と、味方のゲージ
// （allyGaugeAdd）。
import { resolveAllyGaugeAdd } from '../../../skills/burstDamage.ts';
import type { FirstPassResult } from '../../firstPass.ts';
import type { FirstPassBase } from '../base.ts';
import type { GaugeReserve } from './reserve.ts';

/** 発のゲージを着弾のフレームに入れ（味方のゲージの回数も数える）、味方のゲージを足す */
export function createLandingGauge({ frames, lists, pendingGauge, slots }: FirstPassBase & GaugeReserve) {
  const shotGauges: FirstPassResult['shotGauges'] = [];
  const allyGauges: FirstPassResult['allyGauges'] = [];
  // allyGaugeAdd を持つ枠（plan/design-anis-star-ally-gauge.md 3 節）は、ほかの枠のゲージ 1 回（弾のヒット・射撃ごとの倍率ダメージの
  // ゲージのヒット）ごとに、自分の 1 発のゲージ × 割合を足す。1 発のゲージは自分の最初の発の着弾のフレームから
  // targetBurstEnergyPerShot、その前は burstEnergyPerShot（C-0246・C-0620）。回数は着くフレームに数え、そのフレームの射撃の後に、
  // そのフレームの量で足す（着弾と同じフレームの回は切り替わった後の量。境のフレームは確かめていない）。持つ枠が 2 つ以上なら、
  // 持つ枠ごとの量を足し合わせる（C-1186）。while の状態があれば、持つ枠にその状態が付いているフレーム（selfStateAt。
  // そのフレームより前に付いた件）に着いた回にだけ足す（plan/design-grave-heat-gauge.md 2.1・2.2 節）
  const allyAdders = slots.flatMap((slot, i) => {
    if (slot === null || slot.definition === null) return [];
    const add = resolveAllyGaugeAdd(slot.definition, slot.character, slot.levels);
    if (add === null || add.ratio === 0) return [];
    const shot = slot.character.shot;
    return [
      {
        slotIndex: i,
        before: shot.burstEnergyPerShot * add.ratio,
        after: shot.targetBurstEnergyPerShot * add.ratio,
        whileState: add.whileState,
        /** 持つ枠の最初の発の着弾のフレーム（まだ撃っていなければ null） */
        landing: null as number | null,
      },
    ];
  });
  /** 枠ごとに、自分のほかに持つ枠があるか（無ければその枠の回は足す先が無いので数えない） */
  const receives = slots.map((_, i) => allyAdders.some((a) => a.slotIndex !== i));
  /** フレーム → 枠ごとの、そのフレームに着くゲージの回数（期待値） */
  const pendingAllyHits = new Map<number, number[]>();
  const reserveAllyHits = (i: number, at: number, hits: number): void => {
    if (allyAdders.length === 0) return;
    for (const a of allyAdders) if (a.slotIndex === i && (a.landing === null || at < a.landing)) a.landing = at;
    if (hits <= 0 || at >= frames || !receives[i]) return;
    let row = pendingAllyHits.get(at);
    if (row === undefined) pendingAllyHits.set(at, (row = slots.map(() => 0)));
    row[i]! += hits;
  };
  /** 枠 i の発のゲージを、着弾のフレーム（f + 飛ぶ時間）に入れる。f のフレームならこのフレームのゲージに返す。hits はその回数（期待値） */
  const landingGauge = (i: number, at: number, f: number, energy: number, hits: number): number => {
    reserveAllyHits(i, at, hits);
    if (energy > 0 && at < frames) shotGauges.push({ slotIndex: i, shotFrame: f, frame: at, energy });
    if (at === f) return energy;
    if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
    return 0;
  };
  const addAllyGauge = (gauge: number, f: number): number => {
    // 味方のゲージ（allyGaugeAdd）: このフレームに着いたほかの枠のゲージの回数に、持つ枠ごとのこのフレームの量を足す
    const row = pendingAllyHits.get(f);
    if (row === undefined) return gauge;
    pendingAllyHits.delete(f);
    for (const a of allyAdders) {
      if (row.every((hits, i) => i === a.slotIndex || hits === 0)) continue;
      if (a.whileState !== null && !lists.selfStateAt(a.slotIndex, a.whileState, f)) continue;
      const amount = a.landing !== null && f >= a.landing ? a.after : a.before;
      for (const [i, hits] of row.entries()) {
        if (i === a.slotIndex || hits === 0) continue;
        const energy = hits * amount;
        gauge += energy;
        allyGauges.push({ slotIndex: i, holderIndex: a.slotIndex, frame: f, energy });
      }
    }
    return gauge;
  };
  return { addAllyGauge, allyGauges, landingGauge, shotGauges };
}

export type LandingGauge = ReturnType<typeof createLandingGauge>;
