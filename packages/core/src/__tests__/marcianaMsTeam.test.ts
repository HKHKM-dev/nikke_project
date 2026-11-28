// マルチャーナ：マリンスタディ（322）を含む編成（V-0787）。S2 のホイッスルが戦闘開始から上限の 5 スタックで戦闘の終わりまで続き、
// 有利コードの攻撃ダメージ▲も戦闘開始から続くこと（C-1291）、S1 のフルバースト発動時の追加ダメージが自分のバーストで開いたフルバーストにだけ
// 出ること（C-1292）、20 回命中ごとの追加ダメージが高リスク対象の窓の中の自分の発にだけ出ること（C-1293）、バーストの▲が使用から付き、
// 高リスク対象が電撃コードの敵にだけ付くこと（C-1294）を見る
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { ENEMY } from '../skills/holders/types.ts';
import type { TeamInput } from '../team.ts';
import { effectWindows, fixedTeam, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const MARCIANA_MS = 322;
const FLOWER = 304;
const DELTA = 20;
const LITER = 82;
const CINDERELLA_CW = 515;
const DIESEL = 72;
const RAPI = 10;

const electric = { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Electronic' as const } };
const fire = { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' as const } };

const TEAMS: Record<string, TeamInput> = {
  'I-DOLL・フラワー + デルタ + マルチャーナ：MS（V-0787 の編成・電撃）': fixedTeam(
    [FLOWER, DELTA, MARCIANA_MS],
    2,
    electric,
  ),
  'I-DOLL・フラワー + デルタ + マルチャーナ：MS（V-0787 の編成・灼熱）': fixedTeam(
    [FLOWER, DELTA, MARCIANA_MS],
    2,
    fire,
  ),
  // III の 2 体がかわるがわる撃つ（チェーンの間隔が CT より短い）。自分の使ったフルバーストの次は、ラピの使ったフルバースト
  '実戦寄り（リター + ディーゼル + マルチャーナ：MS + ラピ・電撃）': fixedTeam(
    [LITER, DIESEL, MARCIANA_MS, RAPI],
    2,
    electric,
  ),
  // 左の III（シンデレラ：CW）が毎回撃ち、マルチャーナ：MS はバーストを使わない
  'III がほかのキャラだけ（リター + デルタ + シンデレラ：クリスタルウェーブ + マルチャーナ：MS・電撃）': fixedTeam(
    [LITER, DELTA, CINDERELLA_CW, MARCIANA_MS],
    2,
    electric,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const m = input.slots.findIndex((s) => s?.character.resourceId === MARCIANA_MS);
  const isElectric = input.enemy.element === 'Electronic';
  const plan = planTeamRun(input);
  const sim = runSimulation(input);
  const activations = plan.schedule!.activations.filter((x) => x.slotIndex === m).map((x) => x.frame);
  const highRisk = itemsOf(plan.history, { holder: ENEMY, state: 'highRiskTarget' });
  const hitsOf = (trigger: 'fullBurstStart' | 'shotCount') =>
    sim.skillHits.filter(
      (h) =>
        h.slotIndex === m &&
        h.effect.source.skill === 'skill1' &&
        (trigger === 'fullBurstStart' ? h.effect.trigger === 'fullBurstStart' : h.effect.trigger !== 'fullBurstStart'),
    );

  it('keeps Whistle at 5 stacks and the S2 Elemental Advantage Attack Damage from the start to the end of battle', () => {
    const whistle = itemsOf(plan.history, { holder: m, state: 'whistle' });
    const stacksAt = (f: number) =>
      Math.max(0, ...whistle.filter((it) => it.start <= f && f < it.end).map((it) => it.stack ?? 1));
    for (const f of [1, Math.floor(plan.frames / 2), plan.frames - 1]) expect(stacksAt(f)).toBe(5);
    const s2 = effectWindows(plan, m, { resourceId: MARCIANA_MS, skill: 'skill2', stat: 'elementDamage' });
    expect(s2).toHaveLength(1);
    expect(s2[0]!.start).toBeLessThanOrEqual(1);
    expect(s2[0]!.end).toBe(plan.frames);
  });

  it('fires the Flagged Target damage only at the Full Bursts opened by its own burst', () => {
    const windows = (plan.schedule?.fullBurstWindows ?? []).filter((w) => w.start < plan.frames);
    const own = windows.filter((w) => w.burstUsers.includes(m)).map((w) => w.start);
    expect(windows.length).toBeGreaterThan(2);
    expect(hitsOf('fullBurstStart').map((h) => h.frame)).toEqual(own);
    // バーストを使わない編成では、フルバーストがあっても出ない
    expect(own.length > 0).toBe(activations.length > 0);
    // III が 2 体の編成では、自分が前に使ったことがあっても、ほかの III が開いたフルバーストには出ない
    if (input.slots.length === 4) expect(windows.some((w) => !w.burstUsers.includes(m))).toBe(true);
  });

  it('puts the burst Attack Damage and Elemental Advantage Attack Damage on itself from each burst use', () => {
    for (const stat of ['attackDamage', 'elementDamage']) {
      const w = effectWindows(plan, m, { resourceId: MARCIANA_MS, skill: 'burst', stat });
      expect(w.length).toBe(activations.length);
      w.forEach((x, i) => expect(x.start - activations[i]!).toBeGreaterThanOrEqual(0));
      w.forEach((x, i) => expect(x.start - activations[i]!).toBeLessThanOrEqual(1));
    }
  });

  it('applies High-Risk Target only to an Electric enemy and fires the 20-hit damage only on own shots inside it', () => {
    const hits = hitsOf('shotCount');
    if (!isElectric) {
      expect(highRisk).toEqual([]);
      expect(hits).toEqual([]);
      return;
    }
    expect(highRisk.length).toBe(activations.length);
    if (activations.length === 0) expect(hits).toEqual([]);
    else expect(hits.length).toBeGreaterThan(10);
    const shots = new Set(plan.shots[m]!.frames);
    for (const h of hits) {
      expect(shots.has(h.frame)).toBe(true);
      expect(highRisk.some((it) => it.start <= h.frame && h.frame < it.end)).toBe(true);
    }
  });
});
