// ジャッカル編（plan/design-jackal.md）: ジャッカル（111）を含む編成で、バーストの「『〜敵1機に』で終わるバーストスキルダメージ▲」
// （oneEnemyBurstDamage。味方全体に 15 秒）が、バーストを使ったフレームから味方全員に付き、説明文の対象の句が「敵1機に」で
// 終わる burstDamage（エレグ・ヘルム・I-DOLL・フラワー）にだけ乗り、「敵全体に」（紅蓮）には乗らないか。射撃場の 3 分モード
// （条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { runTeam } from './runTeam.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson, skillValueOf, windowsFrom } from './teamHelpers.ts';

const JACKAL = 111;
const ELEGG = 500;
const SCARLET = 222;
const IDOLL_FLOWER = 304;
const HELM = 352;
const ONE_ENEMY = new Set([ELEGG, IDOLL_FLOWER, HELM]);

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
  'ジャッカル + 紅蓮 + エレグ（操作。撮影の編成）': team([JACKAL, SCARLET, ELEGG], 2),
  '実戦寄り（ジャッカル + I-DOLL・フラワー + エレグ + ヘルム + 紅蓮）': team(
    [JACKAL, IDOLL_FLOWER, ELEGG, HELM, SCARLET],
    2,
  ),
};

const UP = skillValueOf(JACKAL, 'burst', 1) / 100;

describe('ジャッカル（111）の定義', () => {
  const def = parseSkillDefinition(readJson<unknown>('../../data/skills/111.json'));

  it('writes the burst as a timed oneEnemyBurstDamage for all allies, and S1・S2 as notes only', () => {
    expect(def.skills.burst.effects).toEqual([
      {
        kind: 'timed',
        trigger: 'burstUse',
        target: 'allies',
        stat: 'oneEnemyBurstDamage',
        ref: 1,
        durationRef: 2,
        claims: ['C-1229', 'C-1230'],
      },
    ]);
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill2.effects).toEqual([]);
    expect(UP).toBeCloseTo(0.3891, 12);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const j = input.slots.findIndex((x) => x?.character.resourceId === JACKAL);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const result = runTeam(input);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === j).map((a) => a.frame);
  const seconds = skillValueOf(JACKAL, 'burst', 2);

  it('gives every ally the up for 15 s from each Jackal burst use (the burstUse window)', () => {
    expect(uses.length).toBeGreaterThan(3);
    const expected = windowsFrom(uses, seconds, plan.frames);
    for (let holder = 0; holder < input.slots.length; holder++) {
      const windows = itemsOf(plan.history, { sourceSlotIndex: j, holder, kind: 'timed', skill: 'burst' });
      expect(
        windows.map(({ start, end }) => ({ start, end })),
        `holder ${holder}`,
      ).toEqual(expected);
    }
  });

  it('puts the up on the 敵1機に burst damage only, inside the window, in the attack damage sum', () => {
    const inWindow = (f: number) => uses.some((u) => u <= f && f < u + gameSecondsToFrames(seconds));
    let marked = 0;
    for (const slot of result.slots) {
      if (slot === null) continue;
      const id = input.slots[slot.index]!.character.resourceId;
      const activations = plan.schedule!.activations.filter((a) => a.slotIndex === slot.index);
      for (const [i, a] of slot.burst.activations.entries()) {
        const oneEnemy = a.hit.perEffect.filter((p) => p.effect.oneEnemy === true);
        if (!ONE_ENEMY.has(id)) {
          expect(oneEnemy, `slot ${slot.index}`).toEqual([]);
          continue;
        }
        expect(oneEnemy).toHaveLength(1);
        // 倍率ダメージは発動の直前のバフで出る（C-0689）
        const used = activations[i]!.frame;
        const expected = inWindow(used) ? (a.hit.attackDamageMultiplier + UP) / a.hit.attackDamageMultiplier : 1;
        expect(a.hit.oneEnemyBurstDamageMultiplier, `slot ${slot.index} use ${i}`).toBeCloseTo(expected, 12);
        if (expected > 1) marked++;
      }
    }
    // エレグ（II）はジャッカル（I）の直後に使うので、どの回にも乗る
    expect(marked).toBeGreaterThan(3);
  });
});

describeEveryShotInOneGroup(TEAMS);
