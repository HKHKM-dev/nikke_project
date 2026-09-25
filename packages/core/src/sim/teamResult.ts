// Stage 16（plan/design-stage16.md 3 節 16-A）: sim の結果を calc と同じ形（TeamResult）にする。画面は同じ内訳の表で出す。
// 通常攻撃は calc と同じグループ（同じバフ状態）に集計し、トリガー数は sim が実際に撃った数（triggerSource: 'shots'）。
// バーストスキルと倍率ダメージは sim の発動列をそのまま使う（calc と同じ 1 パス目の値）。
import { summarizeSchedule } from '../burst/schedule.ts';
import { enemyEventNotes } from '../frame/events.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import { groupTimeline, mergeAdjacentRanges } from '../skills/timeline.ts';
import {
  skillSupportOf,
  treasureOf,
  type SlotSegmentResult,
  type SlotSkillHitsResult,
  type TeamInput,
  type TeamResult,
  type TeamSlotResult,
} from '../team.ts';
import { FPS } from '../weapons.ts';
import type { SimResult } from './engine.ts';

/** teamInput は runSimulation に渡したものと同じ（宝物の適用前）。dps と宝物の段階の表示に使う */
export function simTeamResult(teamInput: TeamInput, sim: SimResult): TeamResult {
  const input = applyTreasureToTeam(teamInput);
  const { durationSeconds } = input;
  const segmentIndex = new Map(sim.timeline.segments.map((segment, i) => [segment, i]));

  const computed = sim.slots.map((slot): Omit<TeamSlotResult, 'share'> | null => {
    if (slot === null) return null;
    const index = slot.index;
    const slotInput = input.slots[index]!;

    const segments: SlotSegmentResult[] = [];
    for (const group of groupTimeline(sim.timeline, index)) {
      const simSegments = group.segments.map((s) => slot.segments[segmentIndex.get(s)!]!);
      const first = simSegments[0]!;
      segments.push({
        ranges: mergeAdjacentRanges(group.segments.map((s) => ({ start: s.start, end: s.end }))),
        seconds: group.seconds,
        fullBurst: group.fullBurst,
        buffs: group.state.buffs,
        passiveEffects: group.state.passiveEffects,
        timedEffects: group.state.timedEffects,
        trigger: first.trigger,
        triggers: simSegments.reduce((sum, s) => sum + s.triggers, 0),
        triggerSource: 'shots',
        damage: simSegments.reduce((sum, s) => sum + s.damage, 0),
      });
    }

    const skillHitActivations: SlotSkillHitsResult['activations'] = sim.skillHits
      .filter((h) => h.slotIndex === index)
      .map((h) => ({ seconds: h.frame / FPS, effect: h.effect, hit: h.hit }));

    return {
      index,
      character: slot.character,
      baseAttack: slot.baseAttack,
      cadence: slot.cadence,
      notes: slot.notes,
      passiveBuffs: slot.passiveBuffs,
      passiveEffects: slot.passiveEffects,
      buildEffects: slot.buildEffects,
      windows: slot.windows,
      stateWindows: sim.timeline.stateWindows.filter((w) => w.slotIndex === index),
      conditionSkips: sim.timeline.conditionSkips.filter((x) => x.sourceSlotIndex === index),
      cycleWindows: sim.timeline.cycleWindows.filter((w) => w.slotIndex === index),
      segments,
      normalDamage: slot.normalDamage,
      burst: {
        activations: slot.burst.activations.map((frame, k) => ({ seconds: frame / FPS, hit: slot.burst.hits[k]! })),
        hit: slot.burst.hit,
        totalDamage: slot.burst.damage,
      },
      skillHits: { activations: skillHitActivations, totalDamage: slot.skillHits.damage },
      instants: sim.instants.filter((x) => x.slotIndex === index),
      totalDamage: slot.totalDamage,
      dps: durationSeconds > 0 ? slot.totalDamage / durationSeconds : 0,
      skillSupport: skillSupportOf(slotInput),
      ...treasureOf(teamInput.slots[index] ?? null),
    };
  });

  // 枠 0 から順に加算する（calc と同じ流儀）
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
    schedule: sim.schedule,
    burstSummary: sim.schedule === null ? null : summarizeSchedule(sim.schedule, sim.frames),
    timeline: sim.timeline,
    enemyEvents: [...(input.enemy.events ?? [])],
    enemyNotes: enemyEventNotes(input.enemy.events),
    damagePerSecond: sim.damagePerSecond,
  };
}
