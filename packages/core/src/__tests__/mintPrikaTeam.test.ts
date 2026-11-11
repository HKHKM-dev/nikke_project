// ミント・プリカ編（plan/design-mint-prika.md）: ミント（600）とプリカ（601）を含む編成で、ステージパートの切り替え（ミントのバーストのたびに
// ダンス → ボーカル → …）・ほかの II のチェーンの 3 段階突入時の消去・アンコール（ミントにボーカル・パフォーマンスの延長・プリカの CT▲）が
// 意図どおりに出るか。V-0736 の撮影 B・C・D の編成（射撃場の 3 分モード・風圧・条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const MINT = 600;
const PRIKA = 601;
const NOAH = 232;
const IDOLL_FLOWER = 304;
const IDOLL_SUN = 308;
const MIHARA = 161;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Wind',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });
const team = (ids: number[]): TeamInput => ({
  slots: ids.map(autoSlot),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
});

const TEAMS: Record<string, TeamInput> = {
  'II はミントだけ（撮影 B）': team([IDOLL_FLOWER, IDOLL_SUN, MINT, MIHARA]),
  'ノアとミント（撮影 C）': team([IDOLL_FLOWER, NOAH, MINT, IDOLL_SUN, MIHARA]),
  'プリカとミント（撮影 D）': team([IDOLL_FLOWER, PRIKA, MINT, IDOLL_SUN, MIHARA]),
};

/** 件の窓（始まりと終わり）だけ */
const spans = (items: readonly { start: number; end: number }[]) => items.map(({ start, end }) => ({ start, end }));

const run = (input: TeamInput) => {
  const plan = planTeamRun(input);
  const mint = input.slots.findIndex((s) => s?.character.resourceId === MINT);
  const prika = input.slots.findIndex((s) => s?.character.resourceId === PRIKA);
  const parts = (state: 'assignedPartSinging' | 'assignedPartDancing') =>
    spans(itemsOf(plan.history, { holder: mint, kind: 'state', state }));
  const iiActivations = plan.schedule!.activations.filter((a) => a.step === 'Step2');
  return { plan, mint, prika, parts, iiActivations };
};

describe('II はミントだけ（撮影 B）: ステージパートの切り替え', () => {
  const { plan, mint, parts, iiActivations } = run(TEAMS['II はミントだけ（撮影 B）']!);

  it('switches Dancing and Singing at every Burst of Mint (Dancing first), and never removes both', () => {
    expect(iiActivations.every((a) => a.slotIndex === mint)).toBe(true);
    const dancing = parts('assignedPartDancing');
    const singing = parts('assignedPartSinging');
    // バーストのたびに付く。奇数回目はダンス、偶数回目はボーカルで、片方が付いた次のフレームでもう片方が外れる
    iiActivations.forEach((a, k) => {
      const on = (k % 2 === 0 ? dancing : singing).find((w) => w.start === a.frame);
      expect(on, `burst ${k}`).toBeDefined();
      const next = iiActivations[k + 1]?.frame ?? plan.frames;
      expect(on!.end).toBe(next === plan.frames ? plan.frames : next + 1);
    });
  });

  it('gives the Singing Effect only while Mint is Singing', () => {
    const singing = parts('assignedPartSinging');
    const effects = itemsOf(plan.history, { sourceSlotIndex: mint, holder: 0, kind: 'state', state: 'singingEffect' });
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) expect(singing.some((w) => w.start < e.start && e.start <= w.end)).toBe(true);
  });
});

describe('ノアとミント（撮影 C）: ほかの II のチェーンの消去', () => {
  const { mint, parts, iiActivations } = run(TEAMS['ノアとミント（撮影 C）']!);

  it('cancels the parts when another II enters Burst Stage 3, so Mint never reaches Singing', () => {
    expect(iiActivations.map((a) => a.slotIndex === mint)).toEqual(Array.from({ length: 9 }, (_, k) => k % 2 === 1));
    expect(parts('assignedPartSinging')).toEqual([]);
    // ミントのバーストのたびにダンスが付き、次のノアのチェーンの 3 段階突入時（の次のフレーム）で外れる
    expect(parts('assignedPartDancing').length).toBe(4);
  });
});

describe('プリカとミント（撮影 D）: アンコール', () => {
  const { plan, mint, prika, parts, iiActivations } = run(TEAMS['プリカとミント（撮影 D）']!);

  it('lets Prika burst once; Encore keeps extending her Burst cooldown so Mint takes every later chain', () => {
    expect(iiActivations.map((a) => a.slotIndex)).toEqual([prika, ...Array<number>(8).fill(mint)]);
    const ups = plan.schedule!.cooldownReductions.filter((r) => r.slotIndex === prika);
    expect(ups.length).toBe(8);
    for (const r of ups) expect(r.applied).toBe(-gameSecondsToFrames(21));
  });

  it('keeps Mint Singing from her first Burst (Encore wins over the Dancing of the same frame)', () => {
    const first = iiActivations[1]!.frame;
    expect(parts('assignedPartSinging')).toEqual([{ start: first, end: plan.frames }]);
    // 同じフレームに付いたダンスは、そのフレームだけで外れる
    expect(parts('assignedPartDancing').every((w) => w.end === w.start + 1)).toBe(true);
  });

  it('extends Performance with every Encore, up to the end of the battle', () => {
    for (const holder of [0, prika, mint]) {
      const performance = itemsOf(plan.history, {
        sourceSlotIndex: prika,
        holder,
        kind: 'state',
        state: 'performance',
      });
      expect(spans(performance), `slot ${holder}`).toEqual([{ start: iiActivations[0]!.frame, end: plan.frames }]);
    }
    // プリカの S1 の貫通特化（パフォーマンスの間）も延びた窓に従う
    const pierce = itemsOf(plan.history, { holder: prika, kind: 'while', stat: 'pierce' });
    expect(spans(pierce)).toEqual([{ start: iiActivations[0]!.frame, end: plan.frames }]);
  });
});

describeEveryShotInOneGroup(TEAMS);
