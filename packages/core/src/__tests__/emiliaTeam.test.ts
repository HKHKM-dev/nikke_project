// エミリア編（plan/design-emilia.md）: エミリア（821）を含む編成で、S1 のチャージ速度▲と最終最大装弾数 1 発ごとのチャージダメージ▲
// （次の 1 発）、S2 の与えたダメージ量の X% の固定ダメージ（撃った区間の通常攻撃の値の X%）とフルバーストの最大装弾数▲、バーストの
// 氷結の魔女（次の 1 発のチャージ速度 300%▼・チャージダメージ▲）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { effectiveMaxAmmo } from '../frame/firing.ts';
import { runSimulation } from '../sim/engine.ts';
import { applyChargeBuffs } from '../skills/buffs.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, readJson, skillValueOf } from './teamHelpers.ts';

const EMILIA = 821;
const LITER = 82;
const DELTA = 20;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(autoSlot),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'リター + デルタ + エミリア（操作。撮影の編成）': team([LITER, DELTA, EMILIA], 2),
  '実戦寄り（リター + クラウン + エミリア + アリス + デルタ）': team([LITER, 330, EMILIA, 191, DELTA], 2),
};

const CHARGE_SPEED = skillValueOf(EMILIA, 'skill1', 1) / 100;
const PER_AMMO = skillValueOf(EMILIA, 'skill1', 3) / 100;
const SHARE = skillValueOf(EMILIA, 'skill2', 1) / 100;
const MAX_AMMO_UP = skillValueOf(EMILIA, 'skill2', 2);
const WITCH_DAMAGE = skillValueOf(EMILIA, 'burst', 3) / 100;
const shot = characterOf(EMILIA).shot;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const e = input.slots.findIndex((x) => x?.character.resourceId === EMILIA);
  const result = runSimulation(input);
  const schedule = result.schedule!;
  const shots = result.shots[e]!.frames;
  const segments = result.slots[e]!.segments;
  const segmentAt = (f: number) => segments.find((s) => s.start <= f && f < s.end)!;
  const uses = schedule.activations.filter((a) => a.slotIndex === e).map((a) => a.frame);
  // 部分チャージの発（的が狙えなくなる前に溜めきれない発）はフルチャージでないので、S1・S2 を起こさず、氷結の魔女の発にもならない
  const partial = new Set((result.shots[e]!.partialShots ?? []).map((p) => p.frame));
  const witchShots = uses.map((u) => shots.find((f) => f >= u)!).filter((f) => !partial.has(f));

  it('gives S1 to every shot but the first: charge speed up and charge damage up per final max ammo', () => {
    expect(shots.length).toBeGreaterThan(50);
    const first = segmentAt(shots[0]!).trigger.buffs;
    expect(first.chargeSpeed).toBe(0);
    expect(first.chargeDamagePerMaxAmmo).toBe(0);
    expect(partial.size).toBeGreaterThan(0);
    for (const [i, f] of shots.entries()) {
      if (i === 0 || partial.has(f) || partial.has(shots[i - 1]!)) continue;
      const t = segmentAt(f).trigger;
      expect(t.buffs.chargeDamagePerMaxAmmo, `shot ${f}`).toBeCloseTo(PER_AMMO, 12);
      expect(t.buffs.chargeSpeed, `shot ${f}`).toBeCloseTo(
        witchShots.includes(f) ? CHARGE_SPEED - 3 : CHARGE_SPEED,
        12,
      );
      // ▲は、その発の時点の最終最大装弾数（リターのバーストの最大装弾数▲・S2 の +3 で変わる）を掛ける
      const ammo = effectiveMaxAmmo(shot.maxAmmo, t.buffs);
      const without = applyChargeBuffs(shot.fullChargeDamage, true, { ...t.buffs, chargeDamagePerMaxAmmo: 0 });
      expect(t.chargeMultiplier - without, `shot ${f}`).toBeCloseTo(ammo * PER_AMMO, 12);
    }
    const ammos = new Set(shots.slice(1).map((f) => effectiveMaxAmmo(shot.maxAmmo, segmentAt(f).trigger.buffs)));
    expect(ammos.size).toBeGreaterThan(1);
  });

  it('adds the S2 fixed damage as X% of the normal attack of the segment the shot was fired in', () => {
    for (const f of shots) {
      const t = segmentAt(f).trigger;
      expect(t.fixedShare, `shot ${f}`).toBeCloseTo(t.normal * SHARE, 6);
      expect(t.perTrigger).toBeCloseTo(t.normal + t.perShot + t.fixedShare, 6);
    }
  });

  it('gives +3 max ammo for 10 s from each Full Burst start', () => {
    const windows = schedule.fullBurstWindows;
    expect(windows.length).toBeGreaterThan(3);
    for (const w of windows) {
      const inside = segmentAt(w.start + 1).trigger.buffs.maxAmmoFlat;
      expect(inside).toBe(MAX_AMMO_UP);
      const after = segments.find(
        (s) => s.start <= w.start + gameSecondsToFrames(10) && w.start + gameSecondsToFrames(10) < s.end,
      );
      if (after) expect(after.trigger.buffs.maxAmmoFlat).toBe(0);
    }
  });

  it('gives Freezing Witch to the first shot after her Burst only (a long charge)', () => {
    expect(uses.length).toBeGreaterThan(3);
    for (const [i, f] of witchShots.entries()) {
      const t = segmentAt(f).trigger;
      // 味方のチャージダメージ▲（実戦寄りの編成）も同じ和に入るので、次の発との差で見る
      const next = shots[shots.indexOf(f) + 1];
      if (next !== undefined)
        expect(t.buffs.chargeDamage - segmentAt(next).trigger.buffs.chargeDamage, `use ${i}`).toBeGreaterThan(
          WITCH_DAMAGE - 0.1,
        );
      expect(t.buffs.chargeDamage, `use ${i}`).toBeGreaterThanOrEqual(WITCH_DAMAGE - 1e-9);
      // チャージ時間は 1 秒 × (1 + 3 − S1)。溜めの途中で付くと溜めたフレームは残るが、ふだんの間隔（75f）の 2 倍を超える
      const before = shots[shots.indexOf(f) - 1]!;
      expect(f - before, `use ${i}`).toBeGreaterThan(150);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
