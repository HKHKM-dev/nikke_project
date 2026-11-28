// レイ（仮称）（834）を含む編成（plan/design-rei-tentative.md。V-0788）。語彙は skills/__tests__/reiTentative.test.ts。ここでは味方と組んだ時に:
// レイ（仮称）がバーストを使った回は攻撃態勢が 10 秒付き、その間だけ 7 回命中の追加ダメージが出る。アスカ：WILLE がバーストを使った回は、
// アンチA.T.フィールドが付いている間だけ 18 回命中の追加ダメージが出てスタックが 10 増え（上限 30）、殲滅態勢の味方への攻撃力▲は
// アスカ：WILLE だけに、立ち上げ速度▲は直前にバーストを使った MG の味方（アスカ：WILLE）だけに付く。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { ENEMY } from '../skills/holders/types.ts';
import { gameSecondsToFrames } from '../time.ts';
import { fixedTeam, skillValueOf } from './teamHelpers.ts';

const REI = 834;
const ASUKA = 835;

const TEAMS = {
  'I-DOLL・フラワー + デルタ + レイ（仮称）（V-0788 の編成 A）': fixedTeam([304, 20, REI], 2),
  'I-DOLL・フラワー + デルタ + アスカ：WILLE + レイ（仮称）（V-0788 の編成 B）': fixedTeam([304, 20, ASUKA, REI], 2),
  '実戦寄り（リター + クラウン + アスカ：WILLE + レイ（仮称）+ アリス）': fixedTeam([82, 330, ASUKA, REI, 191], 2),
};

const ATTACK_STATE_FRAMES = gameSecondsToFrames(skillValueOf(REI, 'burst', 2));
const FIELD_MAX = skillValueOf(ASUKA, 'skill1', 8);
const STACK_UP = skillValueOf(REI, 'skill1', 3);
/** skill1 の効果の番号（data/skills/834.json） */
const HIT18 = 0;
const HIT7 = 2;
const ANNIHILATION_ATTACK = 3;

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const r = input.slots.findIndex((s) => s?.character.resourceId === REI);
  const a = input.slots.findIndex((s) => s?.character.resourceId === ASUKA);
  const plan = planTeamRun(input);
  const hits = plan.skillHits.filter((h) => h.slotIndex === r && h.effect.source.skill === 'skill1');
  const attackStates = itemsOf(plan.history, { holder: r, state: 'attackState' });
  const fields = itemsOf(plan.history, { holder: ENEMY, state: 'antiATField' });
  const covers = (items: readonly { start: number; end: number }[], f: number) =>
    items.some((w) => w.start <= f && f < w.end);
  const reiBursts = plan.schedule!.activations.filter((x) => x.slotIndex === r);

  it('applies Attack State for 10 s on each of her bursts, and the 7-hit damage only in it', () => {
    expect(attackStates.length).toBe(reiBursts.length);
    for (const w of attackStates) if (w.end < plan.frames) expect(w.end - w.start).toBe(ATTACK_STATE_FRAMES);
    const seven = hits.filter((h) => h.effect.effectIndex === HIT7);
    expect(seven.length > 0).toBe(reiBursts.length > 0);
    for (const h of seven) expect(covers(attackStates, h.frame)).toBe(true);
  });

  it('fires the 18-hit damage only while Anti A.T. Field is on the enemy', () => {
    const eighteen = hits.filter((h) => h.effect.effectIndex === HIT18);
    expect(eighteen.length > 0).toBe(a >= 0);
    for (const h of eighteen) expect(covers(fields, h.frame)).toBe(true);
  });

  it.runIf(name.includes('編成 B'))('adds 10 Anti A.T. Field stacks up to the cap of 30', () => {
    expect(Math.max(...fields.map((f) => f.stack ?? 1))).toBe(FIELD_MAX);
    // 段は 1 段ずつの件。同じフレームに 10 段付く始まりがある（アスカ：WILLE の付与は 1 段ずつ）
    const perStart = new Map<number, number>();
    for (const f of fields) perStart.set(f.start, (perStart.get(f.start) ?? 0) + 1);
    expect([...perStart.values()].some((n) => n >= STACK_UP)).toBe(true);
  });

  it('gives the Annihilation State ATK up only to allies in Annihilation State', () => {
    const buffs = input.slots.flatMap((_, holder) =>
      itemsOf(plan.history, { holder, sourceSlotIndex: r, skill: 'skill1', effectIndex: ANNIHILATION_ATTACK }).map(
        (it) => ({ holder, start: it.start }),
      ),
    );
    if (a < 0) {
      expect(buffs).toEqual([]);
      return;
    }
    const states = itemsOf(plan.history, { holder: a, state: 'annihilationState' });
    expect(buffs.length).toBeGreaterThan(0);
    for (const b of buffs) {
      expect(b.holder).toBe(a);
      expect(covers(states, b.start)).toBe(true);
    }
  });

  it('gives the ramp-up speed up only to the MG ally who just used Burst', () => {
    const holders = input.slots.flatMap((_, holder) =>
      itemsOf(plan.history, { holder, sourceSlotIndex: r, skill: 'skill2', stat: 'spinUpSpeed' }).length > 0
        ? [holder]
        : [],
    );
    // 実戦寄りの編成はクラウン（MG）も直前にバーストを使う
    const users = new Set(plan.schedule!.fullBurstWindows.flatMap((w) => w.burstUsers));
    const mgUsers = input.slots.flatMap((s, i) => (s?.character.weaponType === 'MG' && users.has(i) ? [i] : []));
    expect(holders).toEqual(mgUsers);
    expect(holders.includes(a)).toBe(a >= 0);
  });
});
