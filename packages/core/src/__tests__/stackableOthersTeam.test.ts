// ほかの味方のスタック可能バフへのスタック量▲（V-0850）: アリス：ワンダーランドバニー（195）の S1・ギルティ（400）の S2・ディーゼル（72）の
// 宝物版 S1 が、センチ（80）の宝物版 S2 の攻撃力▲（味方全体・10 段・8 秒）のうち、対象の枠に付いた件にだけ段を足すか
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam } from './teamHelpers.ts';

const ALICE_WB = 195;
const GUILTY = 400;
const DIESEL = 72;
const CENTI = 80;
const FLOWER = 304;

function treasureSlot(id: number): TeamSlotInput {
  const slot = fixedSlot(id);
  slot.skills!.treasurePhase = 3;
  return slot;
}

/** 撮影の編成（センチの宝物版を最後の枠に置く） */
function rangeTeam(ids: readonly number[], controlled: number): TeamInput {
  const slots = ids.map((id) => (id === CENTI || id === DIESEL ? treasureSlot(id) : fixedSlot(id)));
  return fixedTeam(slots, controlled);
}

/** センチの宝物版 S2 の攻撃力▲の、holder に付いた件 */
function centiAttack(team: TeamInput, holder: number) {
  const centi = team.slots.findIndex((s) => s?.character.resourceId === CENTI);
  return itemsOf(planTeamRun(team).history, { sourceSlotIndex: centi, holder, kind: 'timed', stat: 'attack' });
}

const firstFull = (items: readonly { start: number; stack?: number }[]) =>
  items.find((w) => w.stack === 10)?.start ?? Infinity;
const stackAt = (items: readonly { start: number; end: number; stack?: number }[], f: number) =>
  Math.max(0, ...items.filter((w) => w.start <= f && f < w.end).map((w) => w.stack ?? 1));

describe('アリス：ワンダーランドバニー + センチ', () => {
  const team = rangeTeam([ALICE_WB, CENTI], 0);
  const onAlice = centiAttack(team, 0);
  const onCenti = centiAttack(team, 1);

  it('adds a stack only to the copy on Alice (Water), so it reaches 10 stacks first', () => {
    expect(firstFull(onAlice)).toBeLessThan(firstFull(onCenti));
    const f = onCenti.find((w) => w.stack === 2)!.start;
    expect(stackAt(onAlice, f)).toBeGreaterThan(2);
  });
});

describe('ギルティ + センチ', () => {
  const team = rangeTeam([GUILTY, CENTI], 0);
  const onGuilty = centiAttack(team, 0);
  const onCenti = centiAttack(team, 1);

  it('adds a stack only to the copy on Guilty (Wind), so it reaches 10 stacks first', () => {
    expect(firstFull(onGuilty)).toBeLessThan(firstFull(onCenti));
  });
});

describe('I-DOLL・フラワー + ディーゼル（宝物版）+ センチ', () => {
  const team = rangeTeam([FLOWER, DIESEL, CENTI], 1);
  const onDiesel = centiAttack(team, 1);
  const onCenti = centiAttack(team, 2);
  const attract = itemsOf(planTeamRun(team).history, { holder: 1, kind: 'state', state: 'attract' });

  it('adds a stack only to the copy on Diesel (self), and only in Attract', () => {
    expect(attract.length).toBeGreaterThan(0);
    const ahead = onDiesel.filter((w) => w.stack !== undefined && w.stack > stackAt(onCenti, w.start));
    expect(ahead.length).toBeGreaterThan(0);
    // 段が先に進むのは、ヘイトの間の 150 回目（付く件の始まりがヘイトの窓の中）
    const firstAhead = ahead[0]!.start;
    expect(attract.some((w) => w.start <= firstAhead && firstAhead <= w.end)).toBe(true);
    expect(stackAt(onDiesel, attract[0]!.start)).toBe(stackAt(onCenti, attract[0]!.start));
  });
});

describeEveryShotInOneGroup({
  'アリス：ワンダーランドバニー + センチ': rangeTeam([ALICE_WB, CENTI], 0),
  'ギルティ + センチ': rangeTeam([GUILTY, CENTI], 0),
  'I-DOLL・フラワー + ディーゼル + センチ': rangeTeam([FLOWER, DIESEL, CENTI], 1),
});
