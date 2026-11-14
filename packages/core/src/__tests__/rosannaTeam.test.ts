// ロザンナ編（V-0774）: ロザンナ（280）を含む編成で、S1 の命中 120 回ごとの隠れ身（10 秒）とクリティカル確率▲（3 秒）、S2 の戦闘開始時の
// 隠れ身（5 秒。同じ状態の維持の違う付与。plan/design-rosanna.md 2 節）、宝物版 S2 の命中 500 回ごとの狂気（10 スタック）、バーストの
// 隠れ身の時の追加ダメージ、宝物版バーストの水冷コードの敵への受けるダメージ▲が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { hitFramesOf } from '../burst/schedule.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { Element } from '../types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const ROSANNA = 280;
const ELEGG = 500;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy = (element: Element): EnemyInput => ({
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element,
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
});

const slotOf = (id: number, treasurePhase: TreasurePhase): TeamSlotInput => {
  const slot: TeamSlotInput = { ...fixedSlot(id), conditionMode: 'auto' };
  if (id === ROSANNA) slot.skills = { ...slot.skills!, treasurePhase };
  return slot;
};
const team = (ids: number[], controlledSlot: number, treasurePhase: TreasurePhase, element: Element): TeamInput => ({
  slots: ids.map((id) => slotOf(id, treasurePhase)),
  enemy: rangeEnemy(element),
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'ロザンナ単騎（水冷。撮影 E1 の編成）': team([ROSANNA], 0, 3, 'Water'),
  'ロザンナ単騎（灼熱）': team([ROSANNA], 0, 3, 'Fire'),
  'ロザンナ単騎（水冷・基礎版）': team([ROSANNA], 0, 0, 'Water'),
  'エレグ + ロザンナ（水冷。戦闘開始のゲージで命中 120 回目の前にバースト）': team([ELEGG, ROSANNA], 1, 3, 'Water'),
};

const SEC3 = gameSecondsToFrames(3);
const SEC5 = gameSecondsToFrames(5);
const SEC30 = gameSecondsToFrames(30);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const s = input.slots.findIndex((x) => x?.character.resourceId === ROSANNA);
  const treasure = input.slots[s]!.skills!.treasurePhase === 3;
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const concealment = items({ holder: s, kind: 'state', state: 'concealment' });
  const crit = items({ holder: s, kind: 'timed', skill: 'skill1', stat: 'critRate' });
  const concealedAt = (f: number) => concealment.some((w) => w.start <= f && f < w.end);
  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];

  it('grants Concealment at battle start for 5 s, and with the crit rate up from each 120th hit', () => {
    expect(crit.length).toBeGreaterThan(5);
    // 戦闘開始の 5 秒（S2）と、命中 120 回目からの 10 秒（S1）の和集合
    expect(concealment[0]!.start).toBe(0);
    const firstHit120 = crit[0]!.start;
    expect(concealedAt(firstHit120 - 1)).toBe(firstHit120 - 1 < SEC5);
    // S2 の付与の始まり（戦闘開始）は、S1 の付与（列の元。10 秒）と違う 5 秒の維持を持つ（plan/design-rosanna.md 2 節）
    const track = plan.history.tracks.find(
      (t) => t.holder === s && t.origin.kind === 'state' && t.origin.state === 'concealment',
    )!;
    expect(track.startDurations?.get(concealment[0]!.start)).toBe(SEC5);
    // どのクリティカル確率▲の窓の始まりからも隠れ身が 10 秒続き、▲の窓は 3 秒以上
    for (const w of crit) {
      expect(concealedAt(w.start)).toBe(true);
      expect(w.end - w.start).toBeGreaterThanOrEqual(SEC3);
    }
  });

  const additional = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'burst');
  it('deals the additional damage on every Burst used while concealed', () => {
    expect(bursts.length).toBeGreaterThan(3);
    const concealed = bursts.filter((b) => concealedAt(b.frame));
    expect(concealed.length).toBe(bursts.length);
    expect(additional.map((h) => h.frame)).toEqual(concealed.flatMap(hitFramesOf));
  });

  if (input.slots.length > 1) {
    it('uses the first Burst before the 120th hit, inside the battle-start Concealment (S2)', () => {
      expect(bursts[0]!.frame).toBeLessThan(crit[0]!.start);
      expect(bursts[0]!.frame).toBeLessThan(SEC5);
      expect(additional[0]!.frame).toBe(hitFramesOf(bursts[0]!)[0]);
    });
  }

  const frenzy = items({ holder: s, kind: 'state', state: 'frenzy' });
  it('stacks Frenzy every 500 hits up to 10 (treasure only)', () => {
    if (!treasure) {
      expect(frenzy).toEqual([]);
      return;
    }
    const top = Math.max(...frenzy.map((w) => w.stack ?? 1));
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThanOrEqual(10);
    // 段 1 は 120 回目より後（命中 500 回目）に付く
    expect(frenzy[0]!.start).toBeGreaterThan(crit[0]!.start);
  });

  it('gives Damage Taken up for 30 s from each Burst hit only against a Water Code enemy (treasure only)', () => {
    const taken = items({ kind: 'timed', skill: 'burst', stat: 'damageTaken' });
    if (!treasure || input.enemy.element !== 'Water') {
      expect(taken).toEqual([]);
      return;
    }
    expect(taken.length).toBe(bursts.length);
    // 窓はバーストのヒット（替わり目の 34f 後。C-1207）から始まり、そのフレームの通常攻撃にも乗る
    expect(taken.map((w) => w.start)).toEqual(bursts.flatMap(hitFramesOf));
    // 最後の回は戦闘の終わりで切れる
    taken.slice(0, -1).forEach((w) => expect(w.end - w.start).toBe(SEC30));
    expect(taken.at(-1)!.end - taken.at(-1)!.start).toBeLessThanOrEqual(SEC30);
  });
});

describeEveryShotInOneGroup(TEAMS);
