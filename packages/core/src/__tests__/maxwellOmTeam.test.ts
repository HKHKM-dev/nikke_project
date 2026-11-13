// マクスウェル：オーディナリーメカニック編（plan/design-maxwell-om.md）: マクスウェル（105）を含む編成で、バーストの使用武器の変更
// （過電流の段階でチャージ時間の決まる 1 発。同じバーストの過電流を数える H1）、S2 の過電流・最終最大HP 基準の攻撃力▲・フルチャージごとの
// バーストゲージ、S1 の最大HP▲（30 スタック）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, readJson, skillValueOf } from './teamHelpers.ts';

const MAXWELL = 105;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Electronic',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};
const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });

/** 編成とマクスウェルの枠 */
const CASES: Record<string, { input: TeamInput; maxwell: number }> = {
  '撮影の編成（I-DOLL・フラワー + ソルジャーE.G. + マクスウェル（操作））': {
    input: {
      slots: [304, 300, MAXWELL].map(autoSlot),
      enemy: rangeEnemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    maxwell: 2,
  },
  '実戦寄り（リター + マクスウェル + ドレイク + アリス + クラウン）': {
    input: fixedTeam([82, MAXWELL, 101, 191, 330], 1),
    maxwell: 1,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

/** 段階ごとのチャージ時間（Lv10。1 段階以下・2・3・4・5 段階以上の description_value） */
const CHARGE_SECONDS = [9, 1, 2, 3, 4].map((ref) => skillValueOf(MAXWELL, 'burst', ref));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, maxwell }) => {
  const plan = planTeamRun(input);
  const shots = plan.shots[maxwell]!.frames;
  const windows = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, filter);
  const weapon = windows({ sourceSlotIndex: maxwell, holder: maxwell, kind: 'timed', skill: 'burst', stat: 'weapon' });
  const effectIndexOf = (w: (typeof weapon)[number]) => (w.origin.kind === 'timed' ? w.origin.effect.effectIndex : -1);

  it('fires exactly one changed-weapon shot per Burst and returns to the SR', () => {
    expect(weapon.length).toBeGreaterThanOrEqual(5);
    for (const w of weapon) expect(shots.filter((f) => f >= w.start && f < w.end)).toHaveLength(1);
  });

  it('picks the change of the Overcurrent stage counted with the same Burst (H1: stage n at the n-th Burst, up to 5)', () => {
    expect(weapon.map(effectIndexOf)).toEqual(weapon.map((_, n) => Math.min(n, 4)));
  });

  it('shortens the wait to the changed shot by the stage charge times', () => {
    // 的のジャンプ（撃てない窓）にかかる回は除く
    const jumps = (input.enemy.events ?? []).filter((e) => e.kind === 'untargetable');
    const delayOf = (w: (typeof weapon)[number]) => shots.find((f) => f >= w.start)! - w.start;
    const clear = weapon.filter(
      (w) => !jumps.some((e) => gameSecondsToFrames(e.start) <= w.end && w.start < gameSecondsToFrames(e.end)),
    );
    expect(clear.length).toBeGreaterThanOrEqual(2);
    const charge = (w: (typeof weapon)[number]) => gameSecondsToFrames(CHARGE_SECONDS[effectIndexOf(w)]!);
    // 待ちからチャージ時間を引いた残りが、どの回も同じ
    expect(new Set(clear.map((w) => delayOf(w) - charge(w))).size).toBe(1);
  });

  it('adds one Overcurrent stack per Burst up to 5 and keeps it to the end', () => {
    const items = windows({ sourceSlotIndex: maxwell, holder: maxwell, kind: 'state', state: 'overcurrent' });
    const stacks = items.map((w) => w.stack ?? 1);
    expect(Math.max(...stacks)).toBe(5);
    // 段 n の件は n 回目のバーストのフレームに付く（変更の窓はその次のフレームから）
    for (let n = 1; n <= 5; n++) {
      const first = items.find((w) => (w.stack ?? 1) === n)!;
      expect(first.start + 1).toBe(weapon[n - 1]!.start);
    }
    expect(items.filter((w) => w.stack === 5).every((w) => w.end === plan.frames)).toBe(true);
  });

  it('gives every ally the S2 ATK up from each Burst, and the S1 Max HP up up to 30 stacks', () => {
    for (const holder of input.slots.keys()) {
      const atk = windows({ sourceSlotIndex: maxwell, holder, kind: 'timed', skill: 'skill2', stat: 'attack' });
      // バーストのフレームから 15 秒（続けて付けば 1 つの窓にまとまる）
      for (const w of weapon) expect(atk.some((a) => a.start <= w.start - 1 && w.start - 1 < a.end)).toBe(true);
      const hp = windows({ sourceSlotIndex: maxwell, holder, kind: 'timed', skill: 'skill1', stat: 'maxHp' });
      expect(Math.max(...hp.map((w) => w.stack ?? 1))).toBe(skillValueOf(MAXWELL, 'skill1', 2));
    }
  });

  it('charges the burst gauge on every fully charged shot of Maxwell', () => {
    const gauge = plan.instants.filter((a) => a.sourceSlotIndex === maxwell && a.effect.kind === 'burstGauge');
    const partial = new Set((plan.shots[maxwell]!.partialShots ?? []).map((p) => p.frame));
    expect(gauge.length).toBe(shots.filter((f) => !partial.has(f)).length);
  });
});

describeEveryShotInOneGroup(TEAMS);
