// 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1〜2.6 節）: スノーホワイト：ヘビーアームズ（471）の S1（チャージ中の 0.2 秒ごとの
// オートファイア準備・受けるダメージ▲、フルチャージして攻撃した時のオートファイア）と、S2 のバーストに関わらない分（戦闘開始時の
// チャージ時間の固定・フルチャージした時の攻撃力▲）。きっかけ { chargeTick }・{ chargeFull }、状態 autoFireReady、perCount { state } の
// 1 つずつのヒット（録画 0774。V-0552）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { isInFullBurst } from '../../burst/schedule.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { framesToGameSeconds, gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { oneHitValue, perCountFrames, resolveDamageEffects } from '../burstDamage.ts';
import { applyResolvedEffect, ZERO_BUFFS } from '../buffs.ts';
import { runSimulation } from '../../sim/engine.ts';
import { stackItems } from '../stacks.ts';
import { itemsOf } from '../holders.ts';
import { triggerFrames } from '../timeline.ts';
import {
  MAX_SKILL_LEVELS,
  resolveMaxStacksUps,
  resolveStateContents,
  resolveStateGrants,
  skillValue,
} from '../resolve.ts';
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

// ---- 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7・3.3 節）: バーストのセブンスドワーフ・フルアクティブ（使用回数のある状態。中身の
// チャージ時間の固定と最大スタック数▲）と攻撃ダメージ▲、S1 の使用回数▼と解除、S2 のバースト 3 段階突入時の攻撃力▲とフルアクティブ状態の▲ ----

const LITER = 82;
const DELTA = 20;
const rawBurst = raw as unknown as {
  skills: Record<'skill1' | 'skill2' | 'burst', { effects: Record<string, unknown>[] }>;
};
const b = (ref: number) => skillValue(character.skills.burst, ref, MAX_SKILL_LEVELS.burst);

function teamSlot(id: number, def = definition): TeamSlotInput {
  if (id === SNOW_WHITE_HA) return { ...slot(), skills: { definition: def, levels: MAX_SKILL_LEVELS } };
  const c = readJson<CharacterData>(`../../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: parseSkillDefinition(readJson(`../../../data/skills/${id}.json`)), levels: MAX_SKILL_LEVELS },
  };
}
/** リター（I）・デルタ（II）・スノーホワイト：ヘビーアームズ（III・操作）。撮影 B（録画 0776・0777）の形（的のジャンプなし） */
const teamInput = (def = definition): TeamInput => ({
  slots: [teamSlot(LITER), teamSlot(DELTA), teamSlot(SNOW_WHITE_HA, def)],
  enemy: enemy(),
  durationSeconds: 60,
  burst: true,
  controlledSlot: 2,
});

describe('語彙の検証（PR 3）', () => {
  const withEffect = (s: 'skill1' | 'skill2' | 'burst', index: number, patch: Record<string, unknown>) => {
    const copy = structuredClone(rawBurst);
    copy.skills[s].effects[index] = { ...copy.skills[s].effects[index], ...patch };
    return () => parseSkillDefinition(copy);
  };
  const grant = rawBurst.skills.burst.effects.findIndex((e) => e.kind === 'state');
  const uses = rawBurst.skills.skill1.effects.findIndex((e) => e.kind === 'stackChange');
  const charge = rawBurst.skills.skill2.effects.findIndex((e) => e.stat === 'chargeDamage');

  it('opens a duration in shots to the selfState condition only', () => {
    expect(withEffect('skill2', charge, { condition: { inFullBurst: true } })).toThrow(
      /a duration in shots can only have the condition selfState/,
    );
    expect(
      withEffect('skill2', charge, { condition: { selfState: 'sevenDwarvesFullyActive', inFullBurst: true } }),
    ).toThrow(/only have the condition selfState/);
  });

  it('needs maxStacks for stacksPerFireRef and decrease for closesAtZero', () => {
    expect(withEffect('burst', grant, { maxStacksRef: undefined })).toThrow(/stacksPerFireRef needs maxStacks/);
    expect(withEffect('skill1', uses, { decrease: undefined })).toThrow(/closesAtZero needs decrease/);
    expect(withEffect('skill1', uses, { closesAtZero: 1 })).toThrow(/expected true/);
  });

  it('checks the maxStacksUp content (its state needs a stacking grant on self, not the own state)', () => {
    const contents = (up: Record<string, unknown>) => [{ stat: 'fixedChargeTime', ref: 1 }, { maxStacksUp: up }];
    expect(
      withEffect('burst', grant, { contents: contents({ state: 'sevenDwarvesFullyActive', amountRef: 2 }) }),
    ).toThrow(/cannot raise its own max stacks/);
    expect(withEffect('burst', grant, { contents: contents({ state: 'mattersSigma', amountRef: 2 }) })).toThrow();
    expect(withEffect('burst', grant, { contents: contents({ state: 'autoFireReady', ref: 2 }) })).toThrow(
      /unknown field/,
    );
    expect(withEffect('burst', grant, { target: 'allies' })).toThrow(/only allowed (in a grant on|with target) "self"/);
  });

  it('resolves the uses to 2 stacks per burst and the contents to 3.2 s and +10 loads', () => {
    const grantResolved = resolveStateGrants(definition, character, MAX_SKILL_LEVELS).find(
      (g) => g.state === 'sevenDwarvesFullyActive',
    )!;
    expect([grantResolved.maxStacks, grantResolved.stacksPerFire]).toEqual([b(5), b(5)]);
    expect(resolveMaxStacksUps(definition, character, MAX_SKILL_LEVELS)).toEqual([
      { whileState: 'sevenDwarvesFullyActive', state: 'autoFireReady', amount: b(2) },
    ]);
    const contents = resolveStateContents(definition, character, MAX_SKILL_LEVELS);
    expect(contents.map((c) => [c.stat, c.value, c.subIndex])).toEqual([['fixedChargeTime', b(1), 0]]);
  });
});

describe('stackItems（PR 3: 0 で閉じる減少と、始まりごとの上限）', () => {
  it('closes the last stack on a closing decrease, and later starts count from 1', () => {
    const items = stackItems([0, 0, 50], 1000, 1000, 2, 'all', [
      { frame: 10, amount: 1, closesAtZero: true },
      { frame: 20, amount: 1, closesAtZero: true },
    ]);
    expect(items.map((w) => [w.stack, w.start, w.end])).toEqual([
      [1, 0, 21],
      [2, 0, 11],
      [1, 50, 1000],
    ]);
    // closes の無い減少は最後の 1 段を残す（V-0437）
    expect(stackItems([0, 0], 1000, 1000, 2, 'all', [{ frame: 10, amount: 2 }]).map((w) => w.end)).toEqual([1000, 11]);
  });

  it('reads the cap at each start (raising it later lets the chain grow; lowering it does not cut)', () => {
    const cap = (f: number) => (f >= 30 && f < 60 ? 4 : 2);
    const items = stackItems([0, 10, 20, 30, 40, 50, 70], 1000, 1000, cap);
    expect(items.map((w) => w.stack)).toEqual([1, 2, 3, 4]);
    expect(items.map((w) => w.start)).toEqual([0, 10, 30, 40]);
  });
});

describe('チャージ時間の固定の兼ね合い（applyResolvedEffect）', () => {
  const timed = { stat: 'fixedChargeTime' as const, scaling: 'ratio' as const, value: 1.2 };
  const content = { ...timed, value: 3.2, whileState: 'sevenDwarvesFullyActive' as const };
  it('does not add fixed charge times; the state content wins in either order and for any number of stacks', () => {
    const apply = (...effects: (typeof timed | typeof content)[]) =>
      effects.reduce((t, e) => applyResolvedEffect(t, e, 0).totals, ZERO_BUFFS).fixedChargeTime;
    expect(apply(timed)).toBe(1.2);
    expect(apply(timed, content)).toBe(3.2);
    expect(apply(content, timed)).toBe(3.2);
    expect(apply(content, content, timed)).toBe(3.2);
  });
});

describe('スノーホワイト：ヘビーアームズが唯一の III の編成（リター・デルタ。撮影 B の形）', () => {
  const r = runSimulation(teamInput());
  const m = 2;
  const shots = r.shots[m]!.frames;
  const schedule = r.schedule!;
  const bursts = schedule.activations.filter((a) => a.slotIndex === m).map((a) => a.frame);
  const fa = itemsOf(r.history, { holder: m, kind: 'state', state: 'sevenDwarvesFullyActive' });
  const loads = itemsOf(r.history, { holder: m, kind: 'state', state: 'autoFireReady' });
  const loadsAt = (f: number) => Math.max(0, ...loads.filter((i) => i.start < f && f < i.end).map((i) => i.stack ?? 1));
  const buffsAt = (f: number) => r.timeline.segments.find((x) => x.start <= f && f < x.end)!.slots[m]!.buffs;
  const autoFire = r.skillHits.filter(
    (h) => h.slotIndex === m && h.effect.source.skill === 'skill1' && h.effect.effectIndex === 4,
  );
  /** 発 s の順番の攻撃（s の 44f 後から 0.2 秒ごと。perCountFrames） */
  const ownHits = (s: number, n: number) => {
    const at = new Set(perCountFrames(s, n, { seconds: 0.2, delay: 44 }, r.frames));
    return autoFire.filter((h) => at.has(h.frame));
  };
  /** バーストの後の最初の 3 発（フルアクティブの 2 発と、使い切った後の 1 発）と、その前の発 */
  const around = (burst: number) => {
    const k = shots.findIndex((s) => s > burst);
    return { prev: shots[k - 1]!, fa1: shots[k]!, fa2: shots[k + 1]!, after: shots[k + 2]! };
  };

  it('uses the burst in both Full Bursts of the minute (the only III)', () => {
    expect(bursts).toEqual([299, 2514]);
  });

  it('grants Fully Active with 2 uses on the burst, spends one per full-charge shot and closes it 2 f after the second shot', () => {
    for (const burst of bursts) {
      const { fa1, fa2 } = around(burst);
      const own = fa.filter((i) => i.start === burst);
      expect(own.map((i) => [i.stack, i.end])).toEqual([
        [1, fa2 + 2],
        [2, fa1 + 2],
      ]);
    }
  });

  it('fixes the charge to 3.2 s while held (also for the charge in progress), then back to 1.2 s (212 f, 212 f, 94 f)', () => {
    for (const burst of bursts) {
      const { prev, fa1, fa2, after } = around(burst);
      expect([fa1 - prev, fa2 - fa1, after - fa2]).toEqual([212, 212, 94]);
      expect(buffsAt(fa1).fixedChargeTime).toBe(b(1));
      expect(buffsAt(after).fixedChargeTime).toBe(s2(1));
    }
  });

  it('loads 15 Auto Fire Ready stacks (5 + 10; 16 ticks in a 3.2 s charge) for the Fully Active shots and 5 after', () => {
    for (const burst of bursts) {
      const { fa1, fa2, after } = around(burst);
      expect([loadsAt(fa1), loadsAt(fa2), loadsAt(after)]).toEqual([15, 15, 5]);
      expect(ownHits(fa1, 15)).toHaveLength(15);
      expect(ownHits(fa1, 15).map((h) => h.frame - fa1)).toEqual([
        44, 55, 67, 79, 91, 102, 114, 126, 138, 149, 161, 173, 185, 196, 208,
      ]);
    }
  });

  it('applies the charge damage increase to the Fully Active shots only', () => {
    for (const burst of bursts) {
      const { prev, fa1, fa2, after } = around(burst);
      expect([prev, fa1, fa2, after].map((s) => buffsAt(s).chargeDamage)).toEqual([0, s2(7) / 100, s2(7) / 100, 0]);
    }
  });

  it('applies the sequential attack damage increase to all 15 sequential hits of a Fully Active shot, not to the next shot', () => {
    const { fa1, fa2, after } = around(bursts[0]!);
    const up = (h: (typeof autoFire)[number]) => h.hit.sequentialAttackDamageMultiplier;
    // 順番攻撃ダメージ▲は攻撃ダメージ▲と同じ和に足す（(1 + 攻撃ダメージ▲ + 順番▲) ÷ (1 + 攻撃ダメージ▲)。順番の攻撃は発のフレームの
    // 攻撃ダメージ▲で出る。C-0761）
    const raised = (h: (typeof autoFire)[number]) => {
      const dmg = h.hit.attackDamageMultiplier;
      return Math.abs(up(h) - (dmg + s2(9) / 100) / dmg) < 1e-9;
    };
    const fa1Hits = ownHits(fa1, 15);
    expect(fa1Hits).toHaveLength(15);
    expect(fa1Hits.every(raised)).toBe(true);
    // 2 発目の順番の攻撃（208f 後まで）は、94f 後の次の発の順番の攻撃（▲なし）と重なる。▲の乗ったヒットは 2 発目の 15 ヒットちょうど
    const fa2Frames = perCountFrames(fa2, 15, { seconds: 0.2, delay: 44 }, r.frames);
    const raisedAfterFa2 = autoFire.filter((h) => h.frame > fa2 && h.frame <= fa2 + 208 && raised(h));
    expect(raisedAfterFa2.map((h) => h.frame)).toEqual(fa2Frames);
    // 発の後の窓（溜めが満ちたフレームから撃った発まで）は閉じていて、2 発目の順番の攻撃の後半もこの値で出る
    expect(buffsAt(fa2 + 100).sequentialAttackDamage).toBe(0);
    const afterHits = ownHits(after, 5).filter((h) => !raised(h));
    expect(afterHits.map(up)).toEqual([1, 1, 1, 1, 1]);
  });

  it('fixes the buffs and the Full Burst bonus of the sequential hits on the shot frame (C-0761)', () => {
    const { prev, fa1 } = around(bursts[0]!);
    // リターのバーストの攻撃力▲（5 秒）は 1 発目の順番の攻撃の途中で切れるが、15 ヒットとも発のフレームの値
    const fa1Hits = ownHits(fa1, 15);
    expect(buffsAt(fa1Hits.at(-1)!.frame).attackRatio).toBeLessThan(buffsAt(fa1).attackRatio);
    expect(new Set(fa1Hits.map((h) => h.hit.baseHit)).size).toBe(1);
    // バーストの前の発の順番の攻撃は、フルバーストの中に出ても、フルバースト補正もバーストの攻撃ダメージ▲も乗らない
    const prevHits = ownHits(prev, 5);
    expect(prevHits.some((h) => isInFullBurst(schedule, h.frame))).toBe(true);
    expect(prevHits.map((h) => [h.hit.boost.fullBurst, h.hit.attackDamageMultiplier])).toEqual(
      prevHits.map(() => [0, 1]),
    );
  });

  it('raises her own attack damage for 10 s from the burst and her attack on entering burst stage 3', () => {
    const { fa1 } = around(bursts[0]!);
    expect(buffsAt(fa1).attackDamage).toBeCloseTo(b(3) / 100, 9);
    const stage3 = itemsOf(r.history, { holder: m, kind: 'timed', stat: 'attack' }).filter(
      (i) => i.origin.kind === 'timed' && i.origin.effect.trigger === 'burstStage3Enter',
    );
    expect(stage3.map((i) => i.end - i.start)).toEqual([588, 588]);
  });

  it('removes Fully Active on a shot outside Full Burst (S1 line 6) when the uses are not spent', () => {
    // 使用回数▼（S1 の effects[5]）を外すと、フルバーストの窓の外の最初の発で外れる
    const copy = structuredClone(rawBurst);
    copy.skills.skill1.effects.splice(uses(copy), 1);
    const r2 = runSimulation(teamInput(parseSkillDefinition(copy)));
    const window = r2.schedule!.fullBurstWindows[0]!;
    const shots2 = r2.shots[m]!.frames;
    const outside = shots2.find((s) => s >= window.end)!;
    const own = itemsOf(r2.history, { holder: m, kind: 'state', state: 'sevenDwarvesFullyActive' }).filter(
      (i) => i.start === bursts[0],
    );
    // 射撃の回数のきっかけの解除は次のフレームに発火し、その次のフレームで閉じる（使用回数▼と同じ）
    expect(own.map((i) => i.end)).toEqual([outside + 2, outside + 2]);
    // 外れるまではチャージ時間 3.2 秒の固定、外れた後は S2 の 1.2 秒の固定
    const fixedAt = (f: number) =>
      r2.timeline.segments.find((x) => x.start <= f && f < x.end)!.slots[m]!.buffs.fixedChargeTime;
    expect([fixedAt(outside + 1), fixedAt(outside + 2)]).toEqual([b(1), s2(1)]);
  });
});

function uses(copy: { skills: { skill1: { effects: Record<string, unknown>[] } } }): number {
  return copy.skills.skill1.effects.findIndex((e) => e.kind === 'stackChange');
}

describe('オート射撃 OFF の時間（holdFire。V-0605 の撮影の形）', () => {
  const m = 2;
  // 1 回目のチェーン（I 243f・III 299f。フルバーストは 305〜893f）の I の後から、フルバーストの終わりの後まで撃たない
  const hold = { slotIndex: m, ranges: [{ start: 248, end: 908 }] };
  const run = (def = definition) => runSimulation({ ...teamInput(def), holdFire: [hold] });
  const r = run();
  const shots = r.shots[m]!.frames;
  const after = shots.filter((s) => s >= 908).slice(0, 3);
  const fa = itemsOf(r.history, { holder: m, kind: 'state', state: 'sevenDwarvesFullyActive' });

  it('keeps the slot from firing (without a partial-charge shot on entering) while the others fire and the burst is used', () => {
    expect(shots.filter((s) => s >= 248 && s < 908)).toEqual([]);
    expect(r.shots[m]!.partialShots ?? []).toEqual([]);
    expect(r.shots[0]!.frames.some((s) => s >= 248 && s < 908)).toBe(true);
    expect(r.schedule!.activations.filter((a) => a.slotIndex === m).map((a) => a.frame)[0]).toBe(299);
    expect(r.schedule!.fullBurstWindows[0]).toMatchObject({ start: 305, end: 893 });
  });

  it('keeps both uses through Full Burst, then removes Fully Active on the first shot outside it (S1 line 6)', () => {
    const own = fa.filter((i) => i.start === 299);
    expect(own.map((i) => i.end)).toEqual([after[0]! + 2, after[0]! + 2]);
    // ハイドの明けから構え 11f + 3.2 秒のチャージ 189f（C-0232 の形）。外れた後は 1.2 秒の溜め
    expect([after[0]! - 908, after[1]! - after[0]!, after[2]! - after[1]!]).toEqual([200, 94, 94]);
  });

  it('keeps Fully Active for the second shot when S1 line 6 is dropped (H0 of V-0605: 212 f)', () => {
    const copy = structuredClone(rawBurst);
    copy.skills.skill1.effects.splice(
      copy.skills.skill1.effects.findIndex((e) => e.kind === 'removeState' && e.state === 'sevenDwarvesFullyActive'),
      1,
    );
    const shots2 = run(parseSkillDefinition(copy))
      .shots[m]!.frames.filter((s) => s >= 908)
      .slice(0, 3);
    expect([shots2[1]! - shots2[0]!, shots2[2]! - shots2[1]!]).toEqual([212, 94]);
  });
});
