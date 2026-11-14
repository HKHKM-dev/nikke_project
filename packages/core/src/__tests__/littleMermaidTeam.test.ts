// リトルマーメイド編（plan/design-little-mermaid.md）: リトルマーメイド（513）を含む編成で、S1 の「味方が消費した弾の合計が 400 発ごとに、
// 味方全体にバーストゲージのチャージ」（burstGauge の { count: "teamAmmo" }）と S2 の「500 発ごとに、バブルバラージ 10 回順番に攻撃」
// （damage の { count: "teamAmmo" } と hitsRef）が、編成の全員の発（装弾数無限の発を除く）の倍数に届いた発で出ること、S2 のフルバーストの
// 間の 1 秒ごとの 4 ヒットがフルバーストの窓の中にだけ出ること、S2 のバブル（敵の受けるダメージ▲）が戦闘の始めから終わりまで付くことを、
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson, skillValueOf } from './teamHelpers.ts';

const LITTLE_MERMAID = 513;
const DELTA = 20;
const I_DOLL_SUN = 308;
const LAPLACE = 100;

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
  'リトルマーメイド単騎（撮影 A）': team([LITTLE_MERMAID], 0),
  'リトルマーメイド（操作）+ デルタ + I-DOLL・サン（撮影 B）': team([LITTLE_MERMAID, DELTA, I_DOLL_SUN], 0),
  // ラプラスのバーストの使用武器変更（装弾数無限）の発は、味方が消費した弾の合計に数えない
  'リトルマーメイド + デルタ + ラプラス（装弾数無限の発がある）': team([LITTLE_MERMAID, DELTA, LAPLACE], 2),
};

const GAUGE_EVERY = skillValueOf(LITTLE_MERMAID, 'skill1', 4);
const GAUGE_CHARGE = skillValueOf(LITTLE_MERMAID, 'skill1', 5) / 100;
const BARRAGE_EVERY = skillValueOf(LITTLE_MERMAID, 'skill2', 7);
const BARRAGE_HITS = skillValueOf(LITTLE_MERMAID, 'skill2', 9);
const FB_HITS = skillValueOf(LITTLE_MERMAID, 'skill2', 6);

describe('リトルマーメイド（513）の定義', () => {
  const def = parseSkillDefinition(readJson<unknown>('../../data/skills/513.json'));

  it('writes the ammo triggers as teamAmmo and the Full Burst attack as a 1 s period inside Full Burst', () => {
    expect(def.skills.skill1.effects).toContainEqual(
      expect.objectContaining({ kind: 'burstGauge', trigger: { count: 'teamAmmo', everyRef: 4 }, target: 'allies' }),
    );
    expect(def.skills.skill2.effects).toContainEqual(
      expect.objectContaining({ kind: 'damage', trigger: { count: 'teamAmmo', everyRef: 7 }, hitsRef: 9 }),
    );
    expect(def.skills.skill2.effects).toContainEqual(
      expect.objectContaining({
        kind: 'damage',
        trigger: { everySeconds: 1, carry: true },
        condition: { inFullBurst: true },
      }),
    );
    expect([GAUGE_EVERY, BARRAGE_EVERY, BARRAGE_HITS, FB_HITS]).toEqual([400, 500, 10, 4]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const c = input.slots.findIndex((x) => x?.character.resourceId === LITTLE_MERMAID);
  const sim = runSimulation(input);

  /** 全員の発（装弾数無限の発を除く）の合計が every の倍数に届いたフレーム */
  const teamAmmoFires = (every: number): number[] => {
    const perFrame = new Map<number, number>();
    for (const log of sim.shots) {
      const infinite = new Set(log?.infiniteAmmoShotFrames ?? []);
      for (const f of log?.frames ?? []) if (!infinite.has(f)) perFrame.set(f, (perFrame.get(f) ?? 0) + 1);
    }
    const fires: number[] = [];
    let total = 0;
    for (const f of [...perFrame.keys()].sort((a, b) => a - b)) {
      const next = total + perFrame.get(f)!;
      if (Math.floor(next / every) > Math.floor(total / every)) fires.push(f);
      total = next;
    }
    return fires;
  };

  it('charges the gauge on the shot where the shots of the whole team reach each multiple of 400', () => {
    const charges = sim.instants.filter((x) => x.sourceSlotIndex === c && x.effect.kind === 'burstGauge');
    expect(charges.length).toBeGreaterThan(5);
    expect(charges.map((x) => x.frame)).toEqual(teamAmmoFires(GAUGE_EVERY));
    for (const x of charges) expect(x.effect.value).toBeCloseTo(GAUGE_CHARGE, 12);
  });

  it('fires Bubble Barrage (10 hits 12 f apart, 6 f after the shot) at each multiple of 500 of the team shots', () => {
    const hits = sim.skillHits.filter((h) => h.slotIndex === c && h.effect.hits === BARRAGE_HITS);
    const fires = teamAmmoFires(BARRAGE_EVERY);
    expect(fires.length).toBeGreaterThan(4);
    const expected = fires.flatMap((f) =>
      Array.from({ length: BARRAGE_HITS }, (_, k) => f + 6 + 12 * k).filter((x) => x < sim.frames),
    );
    expect(hits.map((h) => h.frame)).toEqual(expected);
  });

  it('puts the 1 s Full Burst attack (4 hits) only inside Full Burst windows', () => {
    const hits = sim.skillHits.filter((h) => h.slotIndex === c && h.effect.hits === FB_HITS);
    const windows = sim.schedule?.fullBurstWindows ?? [];
    if (input.slots.length === 1) {
      expect(windows).toEqual([]);
      expect(hits).toEqual([]);
      return;
    }
    expect(hits.length).toBeGreaterThan(30);
    expect(hits.length % FB_HITS).toBe(0);
    // 発火（1 ヒット目の 6f 前）がフルバーストの窓 [start, end) の中
    for (let k = 0; k < hits.length; k += FB_HITS) {
      const fire = hits[k]!.frame - 6;
      expect(windows.some((w) => w.start <= fire && fire < w.end)).toBe(true);
    }
  });

  it('records the infinite-ammo shots only for a weapon change with infinite ammo', () => {
    const infinite = sim.shots.map((log) => log?.infiniteAmmoShotFrames?.length ?? 0);
    const laplace = input.slots.findIndex((x) => x?.character.resourceId === LAPLACE);
    infinite.forEach((n, i) => (i === laplace ? expect(n).toBeGreaterThan(0) : expect(n).toBe(0)));
  });
});

describeEveryShotInOneGroup(TEAMS);
