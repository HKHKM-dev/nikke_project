// ベロータ：パンプキンウィッチ（63。V-0859）を含む編成で、右隣の味方 1 機（targetAdjacent: "right"。plan/design-belorta-pw.md 2.1 節）に
// だけ付く S1・バーストの攻撃力▲と S2・バーストの持続ダメージ▲、おばけの仮装の間のフルチャージで敵に付くおばけのイタズラが意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const BELORTA_PW = 63;
const KURUMI = 862;
const RAVEN = 851;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('ベロータ：パンプキンウィッチの定義', () => {
  const def = parseSkillDefinition(rawDefinition(BELORTA_PW));

  it('defines every slot, with the right-ally buffs on targetAdjacent "right"', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'state', state: 'ghostCostume', trigger: 'fullBurstStart', target: 'self' },
      { kind: 'timed', trigger: 'fullBurstStart', targetAdjacent: 'right', stat: 'attack', scaling: 'casterAttack' },
    ]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'indirect']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'state', state: 'ghostlyPrank', condition: { selfState: { state: 'ghostCostume' } } },
      { kind: 'timed', trigger: { count: 'fullChargeShot' }, targetAdjacent: 'right', stat: 'sustainedDamage' },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', targetAdjacent: 'right', stat: 'attack', scaling: 'casterAttack' },
      { kind: 'timed', trigger: 'burstUse', targetAdjacent: 'right', stat: 'sustainedDamage' },
    ]);
  });
});

/** 編成と、ベロータ：パンプキンウィッチの枠と、右隣の枠（いなければ undefined） */
const CASES: Record<string, { input: TeamInput; belorta: number; right: number | undefined }> = {
  '撮影 A（クルミ + ベロータ：パンプキンウィッチ + レイヴン（操作）。V-0859）': {
    input: fixedTeam([autoSlot(KURUMI), autoSlot(BELORTA_PW), autoSlot(RAVEN)], 2, { enemy: rangeEnemy }),
    belorta: 1,
    right: 2,
  },
  '撮影 B（クルミ + レイヴン + ベロータ：パンプキンウィッチ（操作。右端）。V-0859）': {
    input: fixedTeam([autoSlot(KURUMI), autoSlot(RAVEN), autoSlot(BELORTA_PW)], 2, { enemy: rangeEnemy }),
    belorta: 2,
    right: undefined,
  },
  '実戦寄り（リター + ベロータ：パンプキンウィッチ + レイヴン + アリス + クルミ）': {
    input: fixedTeam([82, BELORTA_PW, RAVEN, 191, KURUMI], 2),
    belorta: 1,
    right: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, belorta, right }) => {
  const sim = runSimulation(input);
  const windows = sim.schedule!.fullBurstWindows;
  const fromBelorta = (skill: 'skill1' | 'skill2' | 'burst', stat: 'attack' | 'sustainedDamage') =>
    itemsOf(sim.history, { sourceSlotIndex: belorta, kind: 'timed', skill, stat });

  it('gives the S1 and Burst ATK up and the S2 and Burst Sustained Damage up only to the right ally', () => {
    expect(windows.length).toBeGreaterThan(2);
    for (const [skill, stat] of [
      ['skill1', 'attack'],
      ['skill2', 'sustainedDamage'],
      ['burst', 'attack'],
      ['burst', 'sustainedDamage'],
    ] as const) {
      const items = fromBelorta(skill, stat);
      if (right === undefined) expect(items).toEqual([]);
      else {
        expect(items.length).toBeGreaterThan(0);
        for (const w of items) expect(w.holder).toBe(right);
      }
    }
  });

  it('starts the S1 ATK up with each full burst, for 10 s', () => {
    if (right === undefined) return;
    const items = fromBelorta('skill1', 'attack');
    expect(items.map((w) => w.start)).toEqual(windows.map((w) => w.start).filter((f) => f < sim.frames));
    for (const w of items) if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });

  it('puts Ghostly Prank on the enemy only from Full Charge shots during Ghost Costume', () => {
    const costume = itemsOf(sim.history, { holder: belorta, state: 'ghostCostume' });
    const prank = itemsOf(sim.history, { state: 'ghostlyPrank' });
    expect(costume.map((w) => w.start)).toEqual(windows.map((w) => w.start).filter((f) => f < sim.frames));
    expect(prank.length).toBeGreaterThan(0);
    // 付いた（付け直した）フレームの前のフレームに仮装がある（その発は仮装の間）
    for (const p of prank) expect(costume.some((c) => c.start < p.start && p.start <= c.end)).toBe(true);
  });
});
