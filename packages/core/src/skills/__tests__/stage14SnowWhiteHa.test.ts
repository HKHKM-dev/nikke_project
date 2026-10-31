// 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1〜2.6 節）: スノーホワイト：ヘビーアームズ（471）の S1（チャージ中の 0.2 秒ごとの
// オートファイア準備・受けるダメージ▲、フルチャージして攻撃した時のオートファイア）と、S2 のバーストに関わらない分（戦闘開始時の
// チャージ時間の固定・フルチャージした時の攻撃力▲）。きっかけ { chargeTick }・{ chargeFull }、状態 autoFireReady、perCount { state } の
// 1 つずつのヒット（録画 0774。V-0552）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { framesToGameSeconds, gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { oneHitValue, perCountFrames, resolveDamageEffects } from '../burstDamage.ts';
import { itemsOf } from '../holders.ts';
import { triggerFrames } from '../timeline.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const SNOW_WHITE_HA = 471;
const raw = readJson<{ skills: Record<'skill1' | 'skill2', { effects: Record<string, unknown>[] }> }>(
  `../../../data/skills/${SNOW_WHITE_HA}.json`,
);
const character = readJson<CharacterData>(`../../../data/characters/${SNOW_WHITE_HA}.json`);
const definition = parseSkillDefinition(raw);
const s1 = (ref: number) => skillValue(character.skills.skill1, ref, MAX_SKILL_LEVELS.skill1);
const s2 = (ref: number) => skillValue(character.skills.skill2, ref, MAX_SKILL_LEVELS.skill2);

function slot(): TeamSlotInput {
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition, levels: MAX_SKILL_LEVELS },
  };
}

const enemy = (events: EnemyInput['events'] = []): EnemyInput => ({
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events,
});
const input = (durationSeconds: number, events?: EnemyInput['events']): TeamInput => ({
  slots: [slot()],
  enemy: enemy(events),
  durationSeconds,
  controlledSlot: 0,
});

/** 溜めの k 回目（1 始まり）の周期の、溜め始めからのフレーム（0.2 秒を 0.017 秒のティックで、端数を持ち越す） */
const tick = (k: number) => gameSecondsToFrames(k * 0.2);
/** 1.2 秒チャージ（71f）+ 満ちてから撃つまで 1f。溜め始めは撃つ発の 72f 前 */
const CHARGE_TO_SHOT = 72;

describe('語彙の検証', () => {
  const withEffect = (s: 'skill1' | 'skill2', index: number, patch: Record<string, unknown>) => {
    const copy = structuredClone(raw);
    copy.skills[s].effects[index] = { ...copy.skills[s].effects[index], ...patch };
    return () => parseSkillDefinition(copy);
  };
  const grant = raw.skills.skill1.effects.findIndex((e) => e.kind === 'state');
  const sequential = raw.skills.skill1.effects.findIndex((e) => e.perCount !== undefined);
  const attack = raw.skills.skill2.effects.findIndex((e) => e.stat === 'attack');

  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('allows { chargeTick } and { chargeFull } only in timed and state grants, in their exact shapes', () => {
    expect(withEffect('skill1', sequential, { trigger: { chargeTick: { everySeconds: 0.2 } } })).toThrow(
      /only allowed in timed and state grants/,
    );
    expect(withEffect('skill1', grant, { trigger: { chargeTick: { everySeconds: 0 } } })).toThrow(
      /expected a positive finite number/,
    );
    expect(withEffect('skill1', grant, { trigger: { chargeTick: { every: 0.2 } } })).toThrow(/unknown field/);
    expect(withEffect('skill2', attack, { trigger: { chargeFull: 1 } })).toThrow(/expected true/);
  });

  it('opens perCount { state } split hits to fullChargeShot with delayFrames, and sequentialAttack needs split hits', () => {
    expect(withEffect('skill1', sequential, { perCountIntervalSeconds: undefined })).toThrow(
      /sequentialAttack needs perCountIntervalSeconds/,
    );
    expect(withEffect('skill1', sequential, { trigger: { count: 'normalShot' } })).toThrow(
      /perCount needs the trigger "burstUse", "fullBurstStart", \{ counterFull \} or \{ count: "fullChargeShot" \}/,
    );
    expect(
      withEffect('skill1', sequential, {
        perCount: { counter: 'stickyGrenade' },
        sequentialAttack: undefined,
      }),
    ).toThrow(/gaugePerHit with perCount needs perCount \{ state \}/);
  });

  it('marks only the effect 2 hits as sequential attacks and does not fold the Auto Fire into the shot', () => {
    const effects = resolveDamageEffects(definition, character, MAX_SKILL_LEVELS);
    expect(effects.map((e) => [e.multiplier, e.sequential === true, e.delayFrames])).toEqual([
      [s1(6) / 100, false, 6],
      [s1(7) / 100, true, 44],
    ]);
  });
});

describe('perCountFrames', () => {
  it('adds delayFrames to the second interval and carries the fraction (0・11・23・35・47 after 44)', () => {
    expect(perCountFrames(100, 5, { seconds: 0.2, delay: 44 }, 1000)).toEqual([144, 155, 167, 179, 191]);
    expect(perCountFrames(100, 5, { seconds: 0.2, delay: 44 }, 160)).toEqual([144, 155]);
    // 段 12・13 の形はそのまま（秒は遅れ 0、フレームは delay + k × 間隔）
    expect(perCountFrames(0, 3, { seconds: 0.2 }, 1000)).toEqual([0, 11, 23]);
    expect(perCountFrames(0, 3, { frames: 15, delay: 4 }, 1000)).toEqual([4, 19, 34]);
  });
});

describe('スノーホワイト：ヘビーアームズ単騎（灼熱の的・操作）', () => {
  const plan = planTeamRun(input(30));
  const log = plan.shots[0]!;
  const shots = log.frames;

  it('ticks every 0.2 s of each charge from the charge start (72 f before the shot), restarting after each shot and reload', () => {
    // 6 発のマガジン 2 つとリロードを含む。戦闘開始の溜め（構え 11f の後）も、リロードの後の溜めも、撃つ発の 72f 前が溜め始め
    expect(shots.slice(0, 8)).toEqual([82, 176, 270, 364, 458, 552, 764, 858]);
    const expected = shots.flatMap((s) => [1, 2, 3, 4, 5, 6].map((k) => s - CHARGE_TO_SHOT + tick(k)));
    const lastShot = shots.at(-1)!;
    const ticks = log.chargeTicks!.find((t) => t.everySeconds === 0.2)!.frames;
    // 最後の発の後の溜め（戦闘の終わりで切れる）の周期は除いて比べる
    expect(ticks.filter((f) => f < lastShot)).toEqual(expected);
    expect(ticks.slice(0, 6)).toEqual([21, 33, 45, 57, 68, 80]);
    // リロード中（552 の後、764 の溜めの前）は周期が無い
    expect(ticks.filter((f) => f > 552 && f < 764 - CHARGE_TO_SHOT)).toEqual([]);
  });

  it('fires { chargeFull } on the frame the charge fills, 1 f before each full-charge shot', () => {
    expect(log.chargeFullFrames).toEqual(shots.map((s) => s - 1));
  });

  it('replays the same charge triggers from the shot log as the first pass fired them', () => {
    const ticks = log.chargeTicks![0]!.frames;
    expect(triggerFrames({ chargeTick: { everySeconds: 0.2 } }, null, 0, plan.frames, plan.shots)).toEqual(ticks);
    expect(triggerFrames({ chargeFull: true }, null, 0, plan.frames, plan.shots)).toEqual(log.chargeFullFrames);
    // 1 パス目の件の始まり（受けるダメージ▲の付き直し）も同じフレーム
    const taken = plan.history.tracks.find((t) => t.origin.kind === 'timed' && t.origin.effect.stat === 'damageTaken')!;
    expect(taken.starts).toEqual(ticks);
  });

  it('loads five Auto Fire Ready stacks before each shot, and the shot removes them (removeState on normalShot)', () => {
    const items = itemsOf(plan.history, { holder: 0, kind: 'state', state: 'autoFireReady' });
    const levelAt = (f: number) =>
      Math.max(0, ...items.filter((i) => i.start < f && f < i.end).map((i) => i.stack ?? 1));
    // 射撃の回数のきっかけの解除は次のフレームに閉じる（件は撃った次のフレームまで。段 1）。次の溜めの最初の周期（撃った 33f 後）より前
    for (const s of shots) {
      expect(levelAt(s)).toBe(5);
      expect(levelAt(s + 2)).toBe(0);
      expect(levelAt(s + 22 + tick(1))).toBe(0);
    }
    // 1 回目の周期で 1、2 回目で 2 …（上限 5 で止まる。6 回目の周期では増えない）
    expect([1, 2, 3, 4, 5, 6].map((k) => levelAt(176 - CHARGE_TO_SHOT + tick(k) + 1))).toEqual([1, 2, 3, 4, 5, 5]);
  });

  it('fires the Auto Fire hits 6 f (effect 1) and 44・55・67・79・91 f (effect 2) after each full-charge shot', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === 0);
    for (const s of shots.slice(0, -1)) {
      const of = (index: number) =>
        hits.filter((h) => h.effect.effectIndex === index && h.frame >= s && h.frame < s + 94);
      expect(of(3).map((h) => h.frame - s)).toEqual([6]);
      expect(of(4).map((h) => h.frame - s)).toEqual([44, 55, 67, 79, 91]);
    }
    // 値の比は説明文の 105.59 / 41.9（同じバフ。コアに当たらない）
    const [all, seq] = [hits.find((h) => h.effect.effectIndex === 3)!, hits.find((h) => h.effect.effectIndex === 4)!];
    expect(oneHitValue(seq.hit, false, false, false) / oneHitValue(all.hit, false, false, false)).toBeCloseTo(
      s1(7) / s1(6),
      9,
    );
  });

  it('charges one shooter hit of gauge (target_burst_energy_pershot, no full-charge multiplier) for each Auto Fire hit (C-0426)', () => {
    const s = shots[0]!;
    const gauges = plan.shotGauges.filter((g) => g.shotFrame === s);
    expect(gauges.map((g) => [g.frame - s, g.energy])).toEqual([
      [0, character.shot.targetBurstEnergyPerShot * character.shot.fullChargeBurstEnergy],
      ...[6, 44, 55, 67, 79, 91].map((d) => [d, character.shot.targetBurstEnergyPerShot]),
    ]);
  });

  it('applies the attack increase on full charge and the damage taken increase to the very first full-charge shot', () => {
    const first = shots[0]!;
    const atk = itemsOf(plan.history, { holder: 0, kind: 'timed', stat: 'attack' });
    // 「フルチャージした時」は満ちたフレーム（撃つ 1f 前）から 5 秒。付き直しで延びる
    expect(atk[0]!.start).toBe(first - 1);
    expect(atk.some((i) => i.start <= first && first < i.end)).toBe(true);
    const taken = itemsOf(plan.history, { kind: 'timed', stat: 'damageTaken' });
    expect(taken[0]!.start).toBe(21);
    const buffs = plan.timeline.segments.find((x) => x.start <= first && first < x.end)!.slots[0]!.buffs;
    expect(buffs.attackRatio).toBeCloseTo(s2(3) / 100, 9);
    expect(buffs.damageTaken).toBeCloseTo(s1(2) / 100, 9);
    // 満ちる前の戦闘の始め（受けるダメージ▲だけ）
    const early = plan.timeline.segments.find((x) => x.start <= 40 && 40 < x.end)!.slots[0]!.buffs;
    expect([early.attackRatio, early.damageTaken]).toEqual([0, s1(2) / 100]);
  });

  it('stops ticking while the enemy cannot be targeted, and restarts from the next charge start', () => {
    // 270 の発の 50f 後（320f）から 2 秒の窓（溜めの途中で部分チャージの発を撃ってハイドする）
    const windowed = planTeamRun(input(15, [{ kind: 'untargetable', start: framesToGameSeconds(320), end: 7 }]));
    const wlog = windowed.shots[0]!;
    const start = 320;
    const end = Math.round(7 / 0.017);
    const ticks = wlog.chargeTicks![0]!.frames;
    expect(ticks.filter((f) => f >= start && f < end)).toEqual([]);
    const after = wlog.frames.find((f) => f >= end)!;
    expect(ticks.filter((f) => f >= end && f < after)).toEqual(
      [1, 2, 3, 4, 5, 6].map((k) => after - CHARGE_TO_SHOT + tick(k)),
    );
    // 部分チャージの発の溜めでも周期は出る（溜め始めの 292f から 11・23f 後。窓の始まりまで）
    expect(wlog.partialShots!.map((x) => x.frame)).toEqual([start]);
    expect(ticks.filter((f) => f > 270 && f <= start)).toEqual([270 + 22 + tick(1), 270 + 22 + tick(2)]);
    // 部分チャージの発はフルチャージの発ではないので、溜めが満ちた時もオートファイアも無い
    expect(wlog.chargeFullFrames!.includes(start - 1) || wlog.chargeFullFrames!.includes(start)).toBe(false);
    // （270 の発の順番の攻撃は 361f まで出る。窓の始まりで切れるか（V-0552 の的のジャンプの前の発）は扱っていない）
    expect(windowed.skillHits.filter((h) => h.frame > 270 + 91 && h.frame < end)).toEqual([]);
  });
});
