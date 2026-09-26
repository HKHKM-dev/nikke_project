// Stage 3: 5 人編成の合算。Stage 4 で常時発動パッシブ（自分・味方全体）を枠間で配ってから computeDamage に渡すようにした。
// Stage 5: 固定 20 秒サイクルのバースト（burst: true）を「通常区間 / フルバースト区間」の 2 区間の期待値と、
// サイクルごとのバーストスキルダメージで足す。
// Stage 6: 持続バフ（timed）を skills/timeline.ts の区間分割に載せた。calc は「同じバフ状態の区間」をまとめた
// グループ単位で computeDamage を呼ぶ。timed 効果がなければグループは 2 つに退化し、Stage 5 と同じ計算になる。
// Stage 7: burst の時刻表を動的サイクル（ゲージ蓄積・CT・チェーン。burst/dynamic.ts）にした。固定 20 秒サイクルは burstModel: 'fixed'。
// sim（sim/engine.ts）とは時刻表・区間・式をすべて共有し、違いは「発射をフレームで数えるか、平均レートで置くか」だけ。
// Stage 8: 1 パス目（射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動）を planTeamRun にまとめ、sim と calc が同じものを使う。
// 射撃の回数トリガーの窓と倍率ダメージ（damage）の発動は sim と厳密一致し、calc が期待値で置くのは通常攻撃のトリガー数だけ。
// Stage 9: 宝物の段階（skills.treasurePhase）を、最上位で applyTreasureToTeam により基礎版 → 宝物版に差し替えてから計算する。
// Stage 10: 射撃に効くバフと CT 短縮で射撃の列と時刻表が循環するので、1 パス目の射撃の列と時刻表は frame/firstPass.ts の
// フレームループで作る。バフの区間と倍率ダメージは Stage 8 のまま、確定した射撃の列と時刻表から作る。
// Stage 16（plan/design-stage16.md 2 節）: calc モデルを team.ts から calc/model.ts に分けた。1 パス目は frame/plan.ts。
// Stage 16-B（同 9 節）: 敵を狙えない窓（敵の出来事）があるときは、全グループで射撃の列を数える（sim と一致する）。
// Stage 18-C（plan/design-stage18.md 12.3 節）: 条件が自動の枠は、グループ（鍵に着地点が入る）の着地点の条件で 1 トリガーの値を出す
// （中遠のような配分は Σ w_k × T_k。frame/landing.ts）。手入力の枠は今と同じ。
import { activationFramesOfSlot, summarizeSchedule } from '../burst/schedule.ts';
import { computeCadence } from '../cadence.ts';
import { baseAttackOf, computeDamage, computeTriggerDamage, modelNotes } from '../damage.ts';
import { enemyEventNotes } from '../frame/events.ts';
import { autoConditionSummary, landingPartsOf, landingTriggerDamage, slotConditionNotes } from '../frame/landing.ts';
import { firingParams } from '../frame/firing.ts';
import {
  BURST_HIT_USES_PRE_ACTIVATION_BUFFS,
  burstSnapshotState,
  perShotDamageOf,
  planTeamRun,
} from '../frame/plan.ts';
import { slotBurstHit, type BurstHitResult } from '../skills/burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { EMPTY_BUFF_STATE, groupTimeline, mergeAdjacentRanges } from '../skills/timeline.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import { isFiringStat } from '../skills/types.ts';
import {
  skillSupportOf,
  treasureOf,
  validateTeamSlots,
  type SlotSegmentResult,
  type SlotSkillHitsResult,
  type TeamInput,
  type TeamResult,
} from '../team.ts';
import { FPS } from '../weapons.ts';

/**
 * Stage 10: 射撃の列 frames（昇順）のうち、区間の列 ranges（[start, end)、昇順・重なりなし）に入る発数。
 * 区間は planBuffTimeline の [0, frames) を隙間・重なりなく覆う区間から作るので、どの射撃もちょうど 1 つの区間に入る
 */
export function countShotsInRanges(
  frames: readonly number[],
  ranges: readonly { start: number; end: number }[],
): number {
  let count = 0;
  for (const r of ranges) count += lowerBound(frames, r.end) - lowerBound(frames, r.start);
  return count;
}

/** frames の中で value 以上の最初の添字 */
function lowerBound(frames: readonly number[], value: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function computeTeamDamage(teamInput: TeamInput): TeamResult {
  validateTeamSlots(teamInput.slots);
  // Stage 9: 宝物版への差し替えは最上位で 1 回だけ（planTeamRun の外でも definition と character を読むため）
  const input = applyTreasureToTeam(teamInput);
  const { slots, enemy, durationSeconds, model } = input;
  if (durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const { frames, shots, schedule, timeline, skillHits, instants, untargetable, landing } = planTeamRun(input);
  // Stage 16-B: 狙えない窓があると平均レートでは置けない（撃てない時間・撃ち直し・ハイド中のリロード）ので、全グループで射撃の列を数える
  const countAllShots = untargetable.length > 0;

  const computed = slots.map((slot, index) => {
    if (slot === null) return null;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      model,
      attackOverride: slot.attackOverride,
    };
    const passive = timeline.passive[index] ?? EMPTY_BUFF_STATE;
    const perShot = perShotDamageOf(slot);

    const segments: SlotSegmentResult[] = [];
    let normalDamage = 0;
    const shotFrames = shots[index]?.frames ?? [];
    for (const group of groupTimeline(timeline, index)) {
      const state = group.state;
      const parts = landingPartsOf(landing, slot, index, group.landing);
      const ranges = mergeAdjacentRanges(group.segments.map((s) => ({ start: s.start, end: s.end })));
      const common = {
        ranges,
        seconds: group.seconds,
        fullBurst: group.fullBurst,
        buffs: state.buffs,
        passiveEffects: state.passiveEffects,
        timedEffects: state.timedEffects,
      };
      // Stage 10: 持続の射撃バフが掛かっているグループは、射撃の列の発数を数える（plan/design-stage10.md 5 節）
      if (countAllShots || state.timedEffects.some((e) => isFiringStat(e.stat))) {
        const trigger = landingTriggerDamage({ ...base, buffs: state.buffs, perShot }, parts, group.fullBurst);
        const triggers = countShotsInRanges(shotFrames, ranges);
        const damage = trigger.perTrigger * triggers;
        segments.push({ ...common, trigger, triggers, triggerSource: 'shots', damage });
        normalDamage += damage;
        continue;
      }
      const result = computeDamage({
        ...base,
        buffs: state.buffs,
        perShot,
        firing: firingParams(slot.character.shot, state.buffs),
        condition: { ...parts[0]!.condition, fullBurst: group.fullBurst, durationSeconds: group.seconds },
      });
      const triggers = result.cadence.triggersPerSecond * group.seconds;
      // Stage 18-C: 配分の区間は、1 トリガーの値だけ配分の重みで足し合わせる（発射サイクルは条件に依らない）
      const trigger =
        parts.length === 1
          ? result
          : landingTriggerDamage({ ...base, buffs: state.buffs, perShot }, parts, group.fullBurst);
      const damage = parts.length === 1 ? result.totalDamage : trigger.perTrigger * triggers;
      segments.push({ ...common, trigger, triggers, triggerSource: 'average', damage });
      normalDamage += damage;
    }

    // バーストスキルは発動ごとに（その時点のバフで）計算する。撃つのは時刻表でこの枠が発動したフレームだけ
    const activations: { seconds: number; hit: BurstHitResult }[] = [];
    let burstDamage = 0;
    if (schedule !== null) {
      for (const frame of activationFramesOfSlot(schedule, index)) {
        const state = burstSnapshotState(timeline, frame, index, BURST_HIT_USES_PRE_ACTIVATION_BUFFS);
        const trigger = computeTriggerDamage({
          ...base,
          buffs: state.buffs,
          condition: { ...slot.condition, fullBurst: false },
        });
        const hit = slotBurstHit(
          slot.skills?.definition,
          slot.skills?.levels ?? MAX_SKILL_LEVELS,
          slot.character,
          enemy,
          trigger,
          state.buffs,
        );
        if (hit === null) break;
        activations.push({ seconds: frame / FPS, hit });
        burstDamage += hit.perActivation;
      }
    }
    // 代表値（1 発動の内訳）は割当に関係なく出す。UI で「1 発動 X × 0 回」と見せられるようにする
    const representative =
      activations[0]?.hit ??
      slotBurstHit(
        slot.skills?.definition,
        slot.skills?.levels ?? MAX_SKILL_LEVELS,
        slot.character,
        enemy,
        computeTriggerDamage({ ...base, buffs: passive.buffs, condition: { ...slot.condition, fullBurst: false } }),
        passive.buffs,
      );

    // Stage 8: 倍率ダメージは 1 パス目の発動列をそのまま足す（sim と同じ値）
    const skillHitActivations: SlotSkillHitsResult['activations'] = [];
    let skillHitDamage = 0;
    for (const h of skillHits) {
      if (h.slotIndex !== index) continue;
      skillHitActivations.push({ seconds: h.frame / FPS, effect: h.effect, hit: h.hit });
      skillHitDamage += h.hit.perActivation;
    }

    const totalDamage = normalDamage + burstDamage + skillHitDamage;
    const autoCondition = autoConditionSummary(landing, slot, index, shotFrames);
    return {
      index,
      character: slot.character,
      baseAttack: baseAttackOf(slot),
      cadence: computeCadence(slot.character.shot, model, firingParams(slot.character.shot, passive.buffs)),
      notes: [...modelNotes(slot.character.shot), ...slotConditionNotes(landing, slot, index, enemy, autoCondition)],
      passiveBuffs: passive.buffs,
      passiveEffects: passive.passiveEffects,
      buildEffects: passive.buildEffects,
      windows: timeline.windows.filter((w) => w.slotIndex === index),
      stateWindows: timeline.stateWindows.filter((w) => w.slotIndex === index),
      conditionSkips: timeline.conditionSkips.filter((x) => x.sourceSlotIndex === index),
      cycleWindows: timeline.cycleWindows.filter((w) => w.slotIndex === index),
      segments,
      normalDamage,
      burst: { activations, hit: representative, totalDamage: burstDamage },
      skillHits: { activations: skillHitActivations, totalDamage: skillHitDamage },
      instants: instants.filter((x) => x.slotIndex === index),
      totalDamage,
      autoCondition,
      dps: durationSeconds > 0 ? totalDamage / durationSeconds : 0,
      skillSupport: skillSupportOf(slot),
      ...treasureOf(teamInput.slots[index] ?? null),
    };
  });

  // 枠 0 から順に加算する（加算順を固定し、個別計算の和と一致させる）
  let totalDps = 0;
  let totalDamage = 0;
  let filledCount = 0;
  for (const c of computed) {
    if (c === null) continue;
    totalDps += c.dps;
    totalDamage += c.totalDamage;
    filledCount += 1;
  }

  return {
    slots: computed.map((c) =>
      c === null ? null : { ...c, share: totalDamage > 0 ? c.totalDamage / totalDamage : 0 },
    ),
    filledCount,
    totalDps,
    totalDamage,
    schedule,
    burstSummary: schedule === null ? null : summarizeSchedule(schedule, frames),
    timeline,
    enemyEvents: [...(enemy.events ?? [])],
    enemyNotes: enemyEventNotes(enemy.events, landing !== null),
    landings: landing?.spans ?? [],
    damagePerSecond: null,
  };
}
