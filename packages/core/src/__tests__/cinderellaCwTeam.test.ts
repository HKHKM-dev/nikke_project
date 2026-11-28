// シンデレラ：クリスタルウェーブ編（plan/design-cinderella-cw.md）: シンデレラ：クリスタルウェーブ（515）を含む編成で、S1 の「味方が消費した弾の
// 合計が 200 発ごとに、味方全体にバーストゲージのチャージ」（burstGauge の { count: "teamAmmo" }。C-1250）が編成の全員の発の 200 の倍数に
// 届いた発で出ること、S2 のフルバーストの開始の効果（damage の usedBurst。C-1252）が自分のバーストで開いたフルバーストにだけ出ること、
// バーストスキルダメージに同じ発動の▲が乗ること（C-1251）を、射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { runTeam } from './runTeam.ts';
import { fixedSlot, fixedTeam, rawDefinition, rangeEnemyWithEvents, skillValueOf } from './teamHelpers.ts';

const CINDERELLA_CW = 515;
const LUDMILLA = 190;
const DELTA = 20;
const LAPLACE = 103;
const CROWN = 330;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  'シンデレラ：クリスタルウェーブ単騎（撮影 A）': team([CINDERELLA_CW], 0),
  'ルドミラ + デルタ + シンデレラ：クリスタルウェーブ（操作。撮影 B）': team([LUDMILLA, DELTA, CINDERELLA_CW], 2),
  // II の CT が 20 秒で、CT 40 秒の III 2 体が交互にフルバーストを開く
  'III が 2 体（ルドミラ + クラウン + シンデレラ：クリスタルウェーブ + ラプラス：アルティメットヒーロー）': team(
    [LUDMILLA, CROWN, CINDERELLA_CW, LAPLACE],
    2,
  ),
};

const EVERY = Number(skillValueOf(CINDERELLA_CW, 'skill1', 8));
const CHARGE = skillValueOf(CINDERELLA_CW, 'skill1', 9) / 100;

describe('シンデレラ：クリスタルウェーブ（515）の定義', () => {
  const def = parseSkillDefinition(rawDefinition(515));

  it('writes the ammo trigger as a teamAmmo burstGauge and the Full Burst damage with usedBurst', () => {
    expect(def.skills.skill1.effects[2]).toMatchObject({
      kind: 'burstGauge',
      trigger: { count: 'teamAmmo', everyRef: 8 },
      target: 'allies',
      ref: 9,
    });
    expect(def.skills.skill2.effects[2]).toMatchObject({
      kind: 'damage',
      trigger: 'fullBurstStart',
      condition: { usedBurst: true },
      coreHit: true,
    });
    expect(def.skills.skill1.effects.some((e) => e.kind === 'weaponChange')).toBe(false);
    expect(EVERY).toBe(200);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const c = input.slots.findIndex((x) => x?.character.resourceId === CINDERELLA_CW);
  const sim = runSimulation(input);

  it('charges the gauge on the shot where the shots of the whole team reach each multiple of 200', () => {
    // フレームごとの全員の発の数（どの枠も装弾数無限を持たない）
    const perFrame = new Map<number, number>();
    for (const log of sim.shots) for (const f of log?.frames ?? []) perFrame.set(f, (perFrame.get(f) ?? 0) + 1);
    const expected: number[] = [];
    let total = 0;
    for (const f of [...perFrame.keys()].sort((a, b) => a - b)) {
      const next = total + perFrame.get(f)!;
      if (Math.floor(next / EVERY) > Math.floor(total / EVERY)) expected.push(f);
      total = next;
    }
    const charges = sim.instants.filter((x) => x.sourceSlotIndex === c && x.effect.kind === 'burstGauge');
    expect(charges.length).toBeGreaterThan(10);
    expect(charges.map((x) => x.frame)).toEqual(expected);
    for (const x of charges) expect(x.effect.value).toBeCloseTo(CHARGE, 12);
  });

  it('fires the Full Burst core strike damage only at the Full Bursts opened by its own burst', () => {
    const own = (sim.schedule?.fullBurstWindows ?? [])
      .filter((w) => w.burstUsers.includes(c) && w.start < sim.frames)
      .map((w) => w.start);
    const hits = sim.skillHits.filter((h) => h.slotIndex === c && h.effect.source.skill === 'skill2');
    expect(hits.map((h) => h.frame)).toEqual(own);
    if (input.slots.length === 1) expect(hits).toEqual([]);
    else expect(hits.length).toBeGreaterThan(2);
    // III が 2 体の編成では、もう 1 体のバーストで開いたフルバーストがあり、そこには出ない
    if (input.slots.length === 4) {
      expect((sim.schedule?.fullBurstWindows ?? []).some((w) => !w.burstUsers.includes(c))).toBe(true);
    }
  });

  it('puts the same-activation attack damage up on its burst skill damage hit', () => {
    const slot = runTeam(input).slots[c]!;
    if (input.slots.length === 1) {
      expect(slot.burst.activations).toEqual([]);
      return;
    }
    const up = skillValueOf(CINDERELLA_CW, 'burst', 1) / 100;
    expect(slot.burst.activations.length).toBeGreaterThan(2);
    // 戦闘開始時の S1 の攻撃ダメージ▲と、同じ発動のバーストの▲が乗る
    for (const a of slot.burst.activations) expect(a.hit.attackDamageMultiplier).toBeGreaterThanOrEqual(1 + up);
  });
});
