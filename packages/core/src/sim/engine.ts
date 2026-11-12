// 計算の入口 runSimulation（ヘッドレス・純関数）。画面・CLI・records 層は simTeamResult(input, runSimulation(input)) を使う
// （plan/design-unify-sim-calc.md 5.2 節）。
// 1 パス目（frame/plan.ts の planTeamRun）の結果を、2 パス目（ここ）で集計する:
//   - 通常攻撃: 区間ごとに 1 トリガーの値（computeTriggerDamage の期待値。乱数なし）を先に出し、射撃の列から二分探索で引いた区間の
//     発数（countShotsInRanges）を掛ける。条件が自動の枠は、区間の着地点の条件で 1 トリガーの値を出す（plan/design-stage18.md 12.3 節）。
//   - バーストスキル（computeBurstHit）と倍率ダメージ（damage）は、1 パス目の発動の列のとおりに足す。
//   - 1 秒ごとのダメージ（タイムラインの表示用）は、射撃の列・バーストのヒット・倍率ダメージの列から直接足す。
// 敵の出来事（狙えない窓など）は 1 パス目で効く（plan/design-stage16.md 9 節）。フレームループは trace（出来事の列）のときだけ回し、
// 値は作らない（__tests__/calcShots.test.ts で一致を固定）。
import { hitFramesOf, type BurstActivation, type BurstSchedule, type BurstStepKey } from '../burst/schedule.ts';
import {
  baseAttackOf,
  computeTriggerDamage,
  modelNotes,
  partialChargeTriggerDamage,
  type ModelNote,
  type TriggerDamage,
} from '../damage.ts';
import {
  autoAttackCoreRowNotes,
  autoConditionSummary,
  flightFramesAt,
  slotFlightsOf,
  hitRateNSpansOf,
  slotConditionNotes,
  type AutoConditionSummary,
  type LandingFrameSpan,
} from '../frame/landing.ts';
import { MAX_SKILL_LEVELS, type AppliedEffect, type AppliedTimedEffect, type ItemEffect } from '../skills/resolve.ts';
import { valuePiecesOf, type RemoveDebuffGuessRecord } from '../skills/holders.ts';
import { isStateStat, type InstantKind } from '../skills/types.ts';
import { combineBurstHitParts, slotBurstHit, withSkillHitValue, type BurstHitResult } from '../skills/burstDamage.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import type { BuffTotals } from '../skills/buffs.ts';
import type { BuildEffect } from '../buildEffects.ts';
import { EMPTY_BUFF_STATE, type BuffTimeline } from '../skills/timeline.ts';
import {
  BURST_HIT_USES_PRE_ACTIVATION_BUFFS,
  burstHitBuffs,
  perShotDamageOf,
  planTeamRun,
  slotTriggerDamage,
  sameActivationPiecesOf,
  type SkillHitEvent,
  type TeamPlan,
} from '../frame/plan.ts';
import { validateTeamSlots, type DamagePerSecond, type PartialChargeTotals, type TeamInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { framesToGameSeconds } from '../time.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import type { FrameRange } from '../skills/timeline.ts';
import type { InstantApplication } from '../frame/firstPass.ts';
import { countShotsInRanges, lowerBound, partialShotsInRanges, type ShotLog } from '../frame/shots.ts';

export type SimInput = TeamInput & {
  /** true なら全イベントを events に残す（テスト・デバッグ用。既定 false） */
  trace?: boolean;
};

export type SimEvent =
  | { frame: number; kind: 'trigger'; slot: number; fullBurst: boolean; damage: number }
  | { frame: number; kind: 'burst'; slot: number; step: BurstStepKey; damage: number }
  | { frame: number; kind: 'fullBurstStart' | 'fullBurstEnd' | 'gaugeFull' | 'chainTimeout' }
  | { frame: number; kind: 'buffStart' | 'buffEnd'; slot: number; effect: ItemEffect }
  | { frame: number; kind: 'skillHit'; slot: number; effect: SkillHitEvent['effect']; damage: number }
  | {
      frame: number;
      kind: InstantKind;
      slot: number;
      source: number;
      amount: number;
    };

/** 1 区間ぶんの結果。区間は timeline.segments と 1:1 */
export type SimSlotSegment = {
  start: number;
  end: number;
  seconds: number;
  fullBurst: boolean;
  buffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  timedEffects: AppliedTimedEffect[];
  trigger: TriggerDamage;
  /** この区間に実際に撃った数（整数。1 パス目の射撃の列から数えた発数） */
  triggers: number;
  damage: number;
  /** triggers・damage のうち部分チャージの発。無ければキーごと無い */
  partialCharge?: PartialChargeTotals;
  /**
   * 射撃ごとの倍率ダメージを着弾のフレームで出す枠（飛ぶ時間のある枠。plan/design-anis-star-unimplemented.md 3 節。C-0992）: この区間に
   * 着いた発の数。damage の射撃ごとの倍率ダメージは triggers ではなくこの数で数える。ほかの枠はキーごと無い
   */
  landedShots?: number;
};

export type SimSlotResult = {
  index: number;
  character: CharacterData;
  baseAttack: number;
  notes: ModelNote[];
  /** 常時パッシブだけ（表示用） */
  passiveBuffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  /** 育成入力の効果層（OL・キューブ・コレクション）。passiveBuffs に含まれている */
  buildEffects: readonly BuildEffect[];
  segments: SimSlotSegment[];
  /** Σ segments.damage */
  normalDamage: number;
  /** バーストスキル。activations は発動フレーム。hit は定義がない・unsupported なら null */
  burst: {
    activations: number[];
    hit: BurstHitResult | null;
    damage: number;
    /** 発動ごとの内訳（activations と同じ順） */ hits: BurstHitResult[];
  };
  /** 倍率ダメージ（damage）の発動フレームと合計 */
  skillHits: { frames: number[]; damage: number };
  totalDamage: number;
  /** 条件が自動の枠で使った条件の平均（発数の重み）。手入力の枠は null */
  autoCondition: AutoConditionSummary | null;
};

export type SimResult = {
  /** 回したフレーム数 = battleSecondsToFrames(durationSeconds)（切り上げ。180 秒は 10,589f。V-0086） */
  frames: number;
  schedule: BurstSchedule | null;
  timeline: BuffTimeline;
  /** 各枠の射撃の列（1 パス目）。2 パス目の射撃はこの列どおり */
  shots: (ShotLog | null)[];
  /** 即時効果（CT 短縮・弾丸チャージ）を当てた記録（1 パス目） */
  instants: InstantApplication[];
  /** 倍率ダメージの発動（1 パス目） */
  skillHits: SkillHitEvent[];
  slots: (SimSlotResult | null)[];
  totalDamage: number;
  /** 敵を狙えない窓（1 パス目。出来事が無ければ空） */
  untargetable: FrameRange[];
  /** 着地点の区間（条件が自動の枠が無い、または的の表の無い敵では空） */
  landings: LandingFrameSpan[];
  /** 1 秒ごとのダメージ（通常攻撃・バーストスキル・倍率ダメージの合計） */
  damagePerSecond: DamagePerSecond;
  /** 発のゲージ（着弾のフレーム。1 パス目の記録。照合用） */
  shotGauges: TeamPlan['shotGauges'];
  /** 周期のゲージ（1 パス目の記録（V-0483）。照合用） */
  timerGauges: TeamPlan['timerGauges'];
  /** 1 パス目の件の一覧の履歴（観測値の指標が読む。plan/design-holder-effects.md 段 D の 5） */
  history: TeamPlan['history'];
  /** trace: false なら空 */
  events: SimEvent[];
};

type Runner = {
  index: number;
  /** 射撃の列 */
  shots: readonly number[];
  /** 部分チャージの発のフレーム → チャージの進み */
  partial: ReadonlyMap<number, number>;
  /** 射撃ごとの倍率ダメージを着弾で出す枠の、発のフレーム → 着弾のフレーム（ほかの枠は null） */
  landAt: ((frame: number) => number) | null;
  result: SimSlotResult;
};

export function runSimulation(simInput: SimInput): SimResult {
  // 宝物版への差し替えの前に確かめる
  validateTeamSlots(simInput.slots);
  // 宝物版への差し替えは最上位で 1 回だけ（planTeamRun の外でもバーストの定義と character を読むため）
  const input = applyCompositionToTeam(applyTreasureToTeam(simInput));
  const { slots, enemy } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  const trace = input.trace ?? false;

  // 1 パス目: 射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動。2 パス目はこの下の区間ごとの集計
  const {
    frames,
    shots,
    schedule,
    timeline,
    skillHits: plannedHits,
    instants,
    untargetable,
    landing,
    shotGauges,
    timerGauges,
    history,
  } = planTeamRun({
    ...input,
    model,
  });
  // 1 秒ごとのダメージ（タイムラインの表示用）
  // 最後のフレーム（180 秒の戦闘では 179.996 秒）が入る秒までの列（V-0086）
  const seconds = frames > 0 ? Math.floor(framesToGameSeconds(frames - 1)) + 1 : 0;
  const perSecond: DamagePerSecond = {
    total: new Array<number>(seconds).fill(0),
    slots: slots.map((slot) => (slot === null ? null : new Array<number>(seconds).fill(0))),
  };
  // 2 パス目の結果の倍率ダメージの列（1 パス目の列は書き換えない。蓄積して爆発するダメージの値は下で置き換える）
  const skillHits: SkillHitEvent[] = [...plannedHits];
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.2 節）: 爆発の窓が読む、2 パス目のヒットの記録（使う編成だけ）
  const damageLog: DamageLogEntry[] | null = plannedHits.some((h) => h.accumulate?.source === 'team') ? [] : null;
  // 蓄積爆破（同 2.3 節）: 爆発の窓が読む、発動者の発の値と、値 × 蓄積割合▲ の累計（使う枠だけ。発のフレーム順）
  const ownShots = slots.map((_, i): OwnShotLog | null =>
    plannedHits.some((h) => h.slotIndex === i && h.accumulate?.source === 'self')
      ? { frames: [], value: [0], ratioValue: [0] }
      : null,
  );
  const addPerSecond = (slotIndex: number, frame: number, damage: number): void => {
    damageLog?.push({ slotIndex, frame, damage });
    const k = Math.floor(framesToGameSeconds(frame));
    perSecond.total[k]! += damage;
    perSecond.slots[slotIndex]![k]! += damage;
  };

  // plan/design-anis-star-unimplemented.md 3 節（C-0992）: 飛ぶ時間のある枠の射撃ごとの倍率ダメージ（S1 の追加ダメージ）は、着弾のフレームに
  // 出し、バフも着弾のフレームの区間で引く（本体は発射のフレームのまま）
  const flights = slotFlightsOf(slots, enemy, frames);
  const segmentEnds = timeline.segments.map((s) => s.end);
  const runners: (Runner | null)[] = slots.map((slot, index) => {
    if (slot === null) return null;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
      attackRounding: input.attackRounding,
    };
    const passive = timeline.passive[index] ?? EMPTY_BUFF_STATE;
    const perShot = perShotDamageOf(slot);
    const shotFrames = shots[index]?.frames ?? [];
    const flight = flights[index]?.shot ?? null;
    const landAt = flight === null || perShot.length === 0 ? null : (f: number) => f + flightFramesAt(flight, f);
    // 戦闘の終わりの後に着く発の射撃ごとの倍率ダメージは出さない
    const landings =
      landAt === null
        ? []
        : shotFrames
            .map(landAt)
            .filter((f) => f < frames)
            .sort((a, b) => a - b);
    // 区間ごとの 1 トリガー値と発数。発数は射撃の列から二分探索で引く（区間は [0, frames) を隙間なく覆う）
    const segments: SimSlotSegment[] = timeline.segments.map((segment) => {
      const state = segment.slots[index] ?? EMPTY_BUFF_STATE;
      const trigger = slotTriggerDamage(
        slot,
        index,
        enemy,
        landing,
        segment.landing,
        state.buffs,
        segment.fullBurst,
        perShot,
        input.attackRounding,
      );
      const range = [{ start: segment.start, end: segment.end }];
      const triggers = countShotsInRanges(shotFrames, range);
      // 部分チャージの発（C-1001。値は C-0855）は、その発のチャージの進みで値を出し直す
      const partial = partialShotsInRanges(shots[index]?.partialShots, range);
      const partialDamage = partial.reduce((sum, p) => sum + partialChargeTriggerDamage(trigger, p).perTrigger, 0);
      const landed = landAt === null ? undefined : countShotsInRanges(landings, range);
      // 着弾で出す枠は、射撃ごとの倍率ダメージを撃った数から着いた数に置き換える
      const damage =
        trigger.perTrigger * (triggers - partial.length) +
        partialDamage +
        (landed === undefined ? 0 : trigger.perShot * (landed - triggers));
      return {
        start: segment.start,
        end: segment.end,
        seconds: segment.seconds,
        fullBurst: segment.fullBurst,
        buffs: state.buffs,
        passiveEffects: state.passiveEffects,
        timedEffects: state.timedEffects,
        trigger,
        triggers,
        damage,
        ...(partial.length > 0 ? { partialCharge: { triggers: partial.length, damage: partialDamage } } : {}),
        ...(landed === undefined ? {} : { landedShots: landed }),
      };
    });
    const autoCondition = autoConditionSummary(landing, slot, index, shotFrames, hitRateNSpansOf(timeline, index));
    return {
      index,
      shots: shotFrames,
      partial: new Map((shots[index]?.partialShots ?? []).map((p) => [p.frame, p.progress])),
      landAt,
      result: {
        index,
        character: slot.character,
        baseAttack: baseAttackOf(slot),
        notes: [
          ...modelNotes(slot.character),
          ...slotConditionNotes(landing, slot, index, enemy, autoCondition),
          ...autoAttackCoreRowNotes(slot, enemy),
          ...removeDebuffNotes(history, index),
        ],
        passiveBuffs: passive.buffs,
        passiveEffects: passive.passiveEffects,
        buildEffects: passive.buildEffects,
        segments,
        normalDamage: 0,
        // 代表値（1 発動の内訳）は割当に関係なく出す。発動があれば 1 回目のスナップショットで上書きする
        burst: {
          activations: [],
          hit: slotBurstHit(
            slot.skills?.definition,
            slot.skills?.levels ?? MAX_SKILL_LEVELS,
            slot.character,
            enemy,
            computeTriggerDamage({ ...base, buffs: passive.buffs, condition: { ...slot.condition, fullBurst: false } }),
            passive.buffs,
          ),
          damage: 0,
          hits: [],
        },
        skillHits: { frames: [], damage: 0 },
        totalDamage: 0,
        autoCondition,
      },
    };
  });

  // バーストの倍率ダメージはヒットのフレーム（発動 + 遅れ）に出す。遅れの無いキャラは発動のフレーム（時刻表の順のまま）。
  // 分かれたヒットはヒットごとに、倍率の share ぶんを出す（plan/design-burst-split-hits.md 4 節）
  const burstHits = (schedule?.activations ?? [])
    .flatMap((activation) => {
      const hitFrames = hitFramesOf(activation);
      return hitFrames.map((frame) => ({ activation, frame, share: 1 / hitFrames.length }));
    })
    .filter((h) => h.frame < frames)
    .sort((a, b) => a.frame - b.frame);
  // 発動ごとの、当たったヒットの部分（結果の burst.hits は発動ごとに 1 つで、値はその和）
  const burstParts = new Map<BurstActivation, { index: number; parts: { hit: BurstHitResult; share: number }[] }>();
  // バーストのヒット（ヒットのフレーム順。同じフレームなら時刻表の順 = I → II → III）。値は burstHits と同じ並び（出さないヒットは null）
  const burstHitDamages = burstHits.map(({ activation, frame: f, share }): number | null => {
    const index = activation.slotIndex;
    const runner = runners[index];
    if (!runner) return null;
    const slot = slots[index]!;
    const buffs = burstHitBuffs(
      timeline,
      activation.frame,
      f,
      index,
      BURST_HIT_USES_PRE_ACTIVATION_BUFFS,
      sameActivationPiecesOf(history, slot.character),
      enemy.burstHitEnemyDebuffs,
    );
    const trigger = computeTriggerDamage({
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
      attackRounding: input.attackRounding,
      buffs,
      condition: { ...slot.condition, fullBurst: false },
    });
    const hit = slotBurstHit(
      slot.skills?.definition,
      slot.skills?.levels ?? MAX_SKILL_LEVELS,
      slot.character,
      enemy,
      trigger,
      buffs,
    );
    if (hit === null) return null;
    const result = runner.result.burst;
    let entry = burstParts.get(activation);
    if (entry === undefined) {
      entry = { index: result.activations.length, parts: [] };
      burstParts.set(activation, entry);
      result.activations.push(f);
    }
    entry.parts.push({ hit, share });
    const combined = combineBurstHitParts(entry.parts);
    result.hits[entry.index] = combined;
    if (entry.index === 0) result.hit = combined;
    const damage = hit.perActivation * share;
    addPerSecond(index, f, damage);
    return damage;
  });
  const addSkillHit = (h: SkillHitEvent): void => {
    if (h.frame >= frames) return;
    const runner = runners[h.slotIndex];
    if (!runner) return;
    runner.result.skillHits.frames.push(h.frame);
    runner.result.skillHits.damage += h.hit.perActivation;
    addPerSecond(h.slotIndex, h.frame, h.hit.perActivation);
  };
  // 倍率ダメージ（damage）。値は 1 パス目で計算済み（フレーム順）。蓄積して爆発するダメージは、ほかのヒットの後に決める
  for (const h of skillHits) if (h.accumulate === undefined) addSkillHit(h);
  // 通常射撃。区間の発数とダメージは上で引いた。1 秒ごとのダメージは射撃の列を 1 回なめて足す（O(発数)）
  for (const runner of runners) {
    if (runner === null) continue;
    let segIndex = 0;
    for (const f of runner.shots) {
      if (f >= frames) break;
      while (segIndex + 1 < timeline.segments.length && timeline.segments[segIndex]!.end <= f) segIndex += 1;
      const segment = runner.result.segments[segIndex]!;
      const damage = shotDamage(runner, segment, f);
      const late = lateShotDamage(runner, segmentEnds, f, frames);
      addPerSecond(runner.index, f, damage - (late === null ? 0 : segment.trigger.perShot));
      if (late !== null && late.frame < frames) addPerSecond(runner.index, late.frame, late.damage);
      const own = ownShots[runner.index];
      if (own) {
        own.frames.push(f);
        const value = late === null ? damage : damage - segment.trigger.perShot + late.damage;
        own.value.push(own.value.at(-1)! + value);
        own.ratioValue.push(own.ratioValue.at(-1)! + value * segment.buffs.accumulateRatio);
      }
    }
  }
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.2 節）: 爆発のヒットの値を、窓の中に的が受けたダメージの和
  // （最大量で切る）にする。爆発のフレーム順に決め、前の爆発の値も後の窓に入れる
  if (damageLog !== null || ownShots.some((x) => x !== null))
    settleAccumulates(skillHits, damageLog ?? [], ownShots, addSkillHit);

  const events = trace
    ? traceEvents(frames, schedule, timeline, history, burstHits, burstHitDamages, skillHits, instants, runners)
    : [];

  // 枠 0 から順に加算する
  let totalDamage = 0;
  const results = runners.map((runner) => {
    if (runner === null) return null;
    const r = runner.result;
    for (const segment of r.segments) r.normalDamage += segment.damage;
    // バーストの合計は発動ごとの値（当たったヒットの和）を順に足す
    for (const hit of r.burst.hits) r.burst.damage += hit.perActivation;
    r.totalDamage = r.normalDamage + r.burst.damage + r.skillHits.damage;
    totalDamage += r.totalDamage;
    return r;
  });

  return {
    frames,
    schedule,
    timeline,
    shots,
    instants,
    skillHits,
    slots: results,
    totalDamage,
    untargetable,
    landings: landing?.spans ?? [],
    damagePerSecond: perSecond,
    shotGauges,
    timerGauges,
    history,
    events,
  };
}

type BurstHitAt = { activation: BurstActivation; frame: number; share: number };

/** 2 パス目のヒットの記録の 1 件（蓄積して爆発するダメージの窓が読む） */
type DamageLogEntry = { slotIndex: number; frame: number; damage: number };

/** 蓄積爆破の窓が読む、枠の発の記録（value・ratioValue は、frames の前から k 発の値と、値 × 蓄積割合▲ の和。先頭は 0） */
type OwnShotLog = { frames: number[]; value: number[]; ratioValue: number[] };

/**
 * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.2・2.3 節）: skillHits の爆発のヒット（accumulate のあるもの）の値を、
 * 窓 [start, end) の累計を最大量で切ったものにする（式の補正は掛けない。C-0901・C-0903）。累計は、team なら的が受けた味方全員のダメージ
 * （log。通常攻撃・バーストのヒット・ほかの倍率ダメージと持続ダメージ）と前の爆発の和、self なら発動者の発の値 × (割合 + 蓄積割合▲) の和
 * （ownShots）。skillHits の要素を置き換え、値の決まった爆発を add に渡す
 */
function settleAccumulates(
  skillHits: SkillHitEvent[],
  log: DamageLogEntry[],
  ownShots: readonly (OwnShotLog | null)[],
  add: (h: SkillHitEvent) => void,
): void {
  log.sort((x, y) => x.frame - y.frame);
  const logFrames = log.map((x) => x.frame);
  const prefix = [0];
  for (const x of log) prefix.push(prefix[prefix.length - 1]! + x.damage);
  const released: { frame: number; damage: number }[] = [];
  skillHits.forEach((h, i) => {
    const acc = h.accumulate;
    if (acc === undefined) return;
    let sum: number;
    if (acc.source === 'self') {
      const own = ownShots[h.slotIndex]!;
      const from = lowerBound(own.frames, acc.start);
      const to = lowerBound(own.frames, acc.end);
      sum = acc.ratio * (own.value[to]! - own.value[from]!) + (own.ratioValue[to]! - own.ratioValue[from]!);
    } else {
      sum = prefix[lowerBound(logFrames, acc.end)]! - prefix[lowerBound(logFrames, acc.start)]!;
      for (const r of released) if (r.frame >= acc.start && r.frame < acc.end) sum += r.damage;
    }
    const value = Math.min(acc.cap, sum);
    skillHits[i] = { ...h, hit: withSkillHitValue(h.hit, value) };
    released.push({ frame: h.frame, damage: value });
    add(skillHits[i]!);
  });
}

/**
 * 射撃ごとの倍率ダメージを着弾で出す枠の、その発の射撃ごとの倍率ダメージ（着弾のフレームと、その区間の値。戦闘の終わりの後に着く発は 0）。
 * ほかの枠は null
 */
function lateShotDamage(
  runner: Runner,
  segmentEnds: readonly number[],
  frame: number,
  frames: number,
): { frame: number; damage: number } | null {
  if (runner.landAt === null) return null;
  const at = runner.landAt(frame);
  if (at >= frames) return { frame: at, damage: 0 };
  const k = lowerBound(segmentEnds, at + 1);
  return { frame: at, damage: runner.result.segments[k]!.trigger.perShot };
}

/** 1 発のダメージ（区間の 1 トリガー値。部分チャージの発は、その発のチャージの進みで出し直す） */
function shotDamage(runner: Runner, segment: SimSlotSegment, frame: number): number {
  const progress = runner.partial.get(frame);
  return progress === undefined
    ? segment.trigger.perTrigger
    : partialChargeTriggerDamage(segment.trigger, progress).perTrigger;
}

/**
 * この枠のデバフ解除が、選び方を確かめていない決め打ちで対象を選んだ注記（効果と決め打ちの
 * 種類ごとに 1 つ。plan/design-debuff-removal.md 2.2 節）。今の使い手では起きない
 */
function removeDebuffNotes(history: TeamPlan['history'], slotIndex: number): ModelNote[] {
  const groups = new Map<string, { record: RemoveDebuffGuessRecord; times: number }>();
  for (const record of history.removeDebuffGuesses) {
    if (record.sourceSlotIndex !== slotIndex) continue;
    const key = `${record.effect.source.skill}:${record.effect.effectIndex}:${record.guess}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { record, times: 1 });
    else group.times++;
  }
  return [...groups.values()].map(({ record: { effect, guess, limit }, times }) => {
    const { ja: nameJa, en: nameEn } = effect.source.name;
    return {
      level: 'approx',
      code: `remove-debuff-${guess}`,
      message:
        guess === 'targets'
          ? {
              ja: `デバフ解除（${nameJa}）で、デバフのかかった味方が ${limit} 機より多い時が ${times} 回あった。実機ではランダムで、選び方を確かめていないので、枠の若い順に ${limit} 機を選んだ`,
              en: `Debuff removal (${nameEn}) found more than ${limit} debuffed allies ${times} time(s). The game picks at random and the rule is unverified; the model picks the first ${limit} slots`,
            }
          : {
              ja: `デバフ解除（${nameJa}）で、デバフ（状態と▼）が ${limit} 個より多く付いた味方がいた時が ${times} 回あった。選び方を確かめていないので、付いたのが早い順に ${limit} 個を外した`,
              en: `Debuff removal (${nameEn}) found an ally with more than ${limit} debuffs ${times} time(s). The rule is unverified; the model removes the ${limit} earliest`,
            },
    };
  });
}

/**
 * trace のときだけ回すフレームループ。出来事の列を作るだけで、値（区間の発数・ダメージ・1 秒ごとのダメージ）は
 * runSimulation の集計が作る。同じフレームの中の順は、状態の出来事 → バーストのヒット（時刻表の順 = I → II → III）→ 倍率ダメージ →
 * 即時効果 → 通常射撃（枠順）
 */
function traceEvents(
  frames: number,
  schedule: BurstSchedule | null,
  timeline: BuffTimeline,
  history: TeamPlan['history'],
  burstHits: readonly BurstHitAt[],
  burstHitDamages: readonly (number | null)[],
  skillHits: readonly SkillHitEvent[],
  instants: readonly InstantApplication[],
  runners: readonly (Runner | null)[],
): SimEvent[] {
  const events: SimEvent[] = [];
  const segmentEnds = timeline.segments.map((s) => s.end);
  const fullBurstWindows = schedule?.fullBurstWindows ?? [];
  const gaugeFull = new Set(schedule?.gaugeFullFrames ?? []);
  const chainTimeouts = new Set(schedule?.chainTimeouts ?? []);
  // 記録の出来事は、区間に足す値の小片の始まりと終わり
  // （状態だけの stat は区間の効果に入らないので出さない。plan/design-holder-effects.md 段 D の 4）
  const pieces = valuePiecesOf(history).filter((p) => !isStateStat(p.effect.stat));
  const nextShot = runners.map(() => 0);
  let nextBurstHit = 0;
  let nextSkillHit = 0;
  let nextInstant = 0;
  let windowIndex = 0;
  let inFullBurst = false;
  let segIndex = 0;

  for (let f = 0; f < frames; f++) {
    while (segIndex + 1 < timeline.segments.length && timeline.segments[segIndex]!.end <= f) segIndex += 1;
    while (windowIndex < fullBurstWindows.length && fullBurstWindows[windowIndex]!.end <= f) windowIndex += 1;
    const window = fullBurstWindows[windowIndex];
    const fb = window !== undefined && window.start <= f;
    if (inFullBurst && !fb) events.push({ frame: f, kind: 'fullBurstEnd' });
    if (gaugeFull.has(f)) events.push({ frame: f, kind: 'gaugeFull' });
    if (chainTimeouts.has(f)) events.push({ frame: f, kind: 'chainTimeout' });
    for (const w of pieces) {
      if (w.start === f) events.push({ frame: f, kind: 'buffStart', slot: w.slotIndex, effect: w.effect });
      if (w.end === f) events.push({ frame: f, kind: 'buffEnd', slot: w.slotIndex, effect: w.effect });
    }
    if (fb && !inFullBurst) events.push({ frame: f, kind: 'fullBurstStart' });
    while (burstHits[nextBurstHit]?.frame === f) {
      const { activation } = burstHits[nextBurstHit]!;
      const damage = burstHitDamages[nextBurstHit] ?? null;
      nextBurstHit += 1;
      if (damage === null) continue;
      events.push({ frame: f, kind: 'burst', slot: activation.slotIndex, step: activation.step, damage });
    }
    while (skillHits[nextSkillHit]?.frame === f) {
      const h = skillHits[nextSkillHit]!;
      nextSkillHit += 1;
      if (!runners[h.slotIndex]) continue;
      events.push({ frame: f, kind: 'skillHit', slot: h.slotIndex, effect: h.effect, damage: h.hit.perActivation });
    }
    while (instants[nextInstant]?.frame === f) {
      const x = instants[nextInstant]!;
      nextInstant += 1;
      events.push({ frame: f, kind: x.effect.kind, slot: x.slotIndex, source: x.sourceSlotIndex, amount: x.amount });
    }
    inFullBurst = fb;
    // 通常射撃（枠順）。射撃は 1 パス目の射撃の列どおり
    for (const runner of runners) {
      if (runner === null) continue;
      const next = nextShot[runner.index]!;
      if (runner.shots[next] !== f) continue;
      nextShot[runner.index] = next + 1;
      const segment = runner.result.segments[segIndex]!;
      const late = lateShotDamage(runner, segmentEnds, f, frames);
      const damage = shotDamage(runner, segment, f) - (late === null ? 0 : segment.trigger.perShot - late.damage);
      events.push({ frame: f, kind: 'trigger', slot: runner.index, fullBurst: fb, damage });
    }
  }
  return events;
}

export type SimIntervalTotals = { triggers: number; damage: number };

/** 区間を「通常区間 / フルバースト区間」の 2 つに集計する（テスト・CLI 用） */
export function simIntervalTotals(slot: SimSlotResult): {
  nonFullBurst: SimIntervalTotals;
  fullBurst: SimIntervalTotals;
} {
  const totals = { nonFullBurst: { triggers: 0, damage: 0 }, fullBurst: { triggers: 0, damage: 0 } };
  for (const segment of slot.segments) {
    const bucket = segment.fullBurst ? totals.fullBurst : totals.nonFullBurst;
    bucket.triggers += segment.triggers;
    bucket.damage += segment.damage;
  }
  return totals;
}
