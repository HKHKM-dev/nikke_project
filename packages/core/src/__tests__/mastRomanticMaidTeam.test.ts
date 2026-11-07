// マスト：ロマンチックメイド（354）を含む編成: S1 のほろ酔い（バースト 1 段階突入のたびに 1 スタック・最大 3・持続）と、その間の味方全体の
// ▲、S2 とバーストの「X% × ほろ酔いのスタック数」（timed の perCount）、フルスタックのフルバーストの終わりの解除と二日酔い（気絶 10 秒。
// shotPause の { applied }。気絶の間はバーストの候補にもならない）（plan/design-maids.md、V-0668）。
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { piecesOf, stateItemsOf, statePiecesOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedTeam, readJson, skillValueOf, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const MAST = 354;
const MAST_SLOT = 1;
const STUN_FRAMES = 600;

function team(ids: readonly number[]): TeamInput {
  return fixedTeam(ids, MAST_SLOT, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } });
}

// 撮影 B の編成（リター + マスト：RM + サン。V-0668）と、マスト：RM が II の実戦寄りの 5 人
const TEAMS: Record<string, TeamInput> = {
  '撮影 B の編成（リター + マスト：RM + サン）': team([82, MAST, 308]),
  '実戦寄り（リター + マスト：RM + アリス + ドレイク + クラウン）': team([82, MAST, 191, 101, 330]),
};

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const drunken = stateItemsOf(plan).filter((s) => s.state === 'drunken' && s.slotIndex === MAST_SLOT);
  const hangover = stateItemsOf(plan).filter((s) => s.state === 'hangover' && s.slotIndex === MAST_SLOT);
  const levelAt = (f: number) =>
    Math.max(0, ...drunken.filter((s) => s.start < f && f < s.end).map((s) => s.stack ?? 1));

  it('stacks Drunken up to 3 on her only', () => {
    expect(drunken.length).toBeGreaterThan(0);
    expect(Math.max(...drunken.map((s) => s.stack ?? 1))).toBe(3);
  });

  it('gives all allies the S1 buffs only while she is Drunken', () => {
    const s1 = [...piecesOf(plan), ...statePiecesOf(plan)].filter(
      (p) => p.sourceSlotIndex === MAST_SLOT && p.effect.source.skill === 'skill1',
    );
    expect(new Set(s1.map((p) => p.effect.stat))).toEqual(new Set(['hitRate', 'critRate', 'attack']));
    const allies = s1.filter((p) => p.effect.stat !== 'hitRate');
    expect(new Set(allies.map((p) => p.slotIndex))).toEqual(new Set(input.slots.map((_, i) => i)));
    for (const p of allies) expect(levelAt(p.start + 1)).toBeGreaterThan(0);
    // 命中率▼は自分にだけ（ほろ酔いの中身）
    expect(s1.filter((p) => p.effect.stat === 'hitRate').every((p) => p.slotIndex === MAST_SLOT)).toBe(true);
  });

  it('multiplies the S2 and burst values by the Drunken stacks at the trigger', () => {
    const reload = skillValueOf(MAST, 'skill2', 3) / 100;
    const attack = skillValueOf(MAST, 'burst', 5) / 100;
    const s2 = piecesOf(plan).filter(
      (p) => p.sourceSlotIndex === MAST_SLOT && p.effect.source.skill === 'skill2' && p.effect.stat === 'reloadSpeed',
    );
    const burst = piecesOf(plan).filter(
      (p) =>
        p.sourceSlotIndex === MAST_SLOT &&
        p.effect.source.skill === 'burst' &&
        p.effect.stat === 'attack' &&
        p.effect.scaling === 'casterAttack',
    );
    for (const [pieces, unit] of [
      [s2, reload],
      [burst, attack],
    ] as const) {
      expect(pieces.length).toBeGreaterThan(0);
      for (const p of pieces) expect(close(p.effect.value, unit * levelAt(p.start))).toBe(true);
    }
    // 1 スタックの回と 3 スタックの回がある
    const stacks = new Set(s2.map((p) => Math.round(p.effect.value / reload)));
    expect(stacks.has(1) && stacks.has(3)).toBe(true);
    expect([...stacks].every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it('removes Drunken and stuns her for 10 s when Full Burst ends at full stacks', () => {
    expect(hangover.length).toBeGreaterThan(0);
    const shots = plan.shots[MAST_SLOT]!.frames;
    const mine = plan.schedule!.activations.filter((a) => a.slotIndex === MAST_SLOT);
    for (const h of hangover) {
      expect(levelAt(h.start)).toBe(3);
      expect(levelAt(h.start + 2)).toBe(0);
      expect(shots.some((f) => f > h.start && f <= h.start + STUN_FRAMES)).toBe(false);
      expect(mine.some((a) => a.frame > h.start && a.frame <= h.start + STUN_FRAMES)).toBe(false);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);

// plan/design-maids.md 8 節（C-0974・C-0975）: 条件が自動の枠で射撃場の的なら、ほろ酔いの区間のコア命中率・弾丸命中率は的の▼の表の値
describe('ほろ酔いの命中率▼（的の▼の表）', () => {
  const master = parseEnemyPresets(readJson<unknown>('../../data/enemies.json'));
  const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
  const base = team([304, MAST]);
  const input: TeamInput = {
    ...base,
    slots: base.slots.map((s) => (s === null ? null : { ...s, conditionMode: 'auto' as const })),
    enemy: {
      ...base.enemy,
      events: enemyEventsOf(master, ['range-3min-jump'], 180),
      target: profile,
      landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
    },
  };
  const result = runSimulation(input);
  const slot = result.slots[MAST_SLOT]!;
  const table = profile.hitRateDown!.MG!;

  it('uses the landing base × the stack ratio for the core hit rate, and the table rows for the bullet hit rate', () => {
    const seen = new Set<number>();
    for (const s of slot.segments) {
      const n = s.buffs.hitRate;
      const band = result.landings.find((l) => l.start <= s.start && s.start < l.end)?.band;
      if (n >= 0 || s.trigger.hitRate === 0 || band == null) continue;
      const key = Object.keys(table.core!.ratio).find((k) => close(Number(k), n))!;
      seen.add(Math.round(-n / 0.2));
      const core = s.trigger.boost.core / (slot.character.shot.coreDamageRate - 1 + s.buffs.coreDamage);
      expect(core).toBeCloseTo(table.core!.base[band]! * table.core!.ratio[key]!, 9);
      const bullet = table.bullet![key]?.[band];
      if (bullet !== undefined) expect(s.trigger.hitRate).toBeCloseTo(bullet, 9);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

// 課題 2-59（plan/design-debuff-removal.md 2 節。C-0976・C-0978〜C-0980）: ココアのデバフ解除（バーストと S1）はほろ酔いをスタックごと外す
describe('ココアのデバフ解除（removeDebuff）', () => {
  const COCOA = 311;
  const input = team([COCOA, MAST]);
  const plan = planTeamRun(input);
  const drunken = stateItemsOf(plan).filter((s) => s.state === 'drunken' && s.slotIndex === MAST_SLOT);
  const cocoaBursts = plan.schedule!.activations.filter((a) => a.slotIndex === 0);

  it('closes Drunken on the frame after the burst effect (20f after the I mark) when she has it', () => {
    let closed = 0;
    for (const a of cocoaBursts) {
      const at = effectFrameOf(a);
      expect(at - a.frame).toBeGreaterThanOrEqual(20);
      const active = drunken.filter((s) => s.start <= at && at < s.end);
      for (const s of active) expect(s.end).toBe(at + 1);
      closed += active.length;
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('never stacks Drunken above 1 (every Burst stage 1 entry is followed by her burst or S1)', () => {
    expect(Math.max(...drunken.map((s) => s.stack ?? 1))).toBe(1);
  });

  it('keeps Drunken stacking up to 3 without a debuff remover (I-DOLL Flower)', () => {
    const other = stateItemsOf(planTeamRun(team([304, MAST]))).filter(
      (s) => s.state === 'drunken' && s.slotIndex === MAST_SLOT,
    );
    expect(Math.max(...other.map((s) => s.stack ?? 1))).toBe(3);
  });
});
