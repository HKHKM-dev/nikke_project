// メイデン：アイスローズ編（plan/design-maiden-ice-rose.md）: メイデン（183）を含む編成で、MP の増減（1 段階突入の回復・フルバーストの
// チャージ・バーストで全部消える）、MP の数だけのバーストの連続攻撃、MP チャージ時の電撃の味方（自分を除く）への▲と、MP 使用後の自分への▲が
// 意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { effectFrameOf, hexagonFrameOf, hitFramesOf, hitShareOf } from '../burst/schedule.ts';
import { itemsOf } from '../skills/holders.ts';
import { counterEffectiveFrom } from '../skills/holders/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MAIDEN = 183;
const SOLDIER_EG = 300;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

/** 撮影の編成。メイデンは 3 枠目（操作） */
function rangeTeam(ids: readonly number[], extra: Partial<TeamInput> = {}): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemy, ...extra });
}

/**
 * 撮影 B の手動操作の形: 1〜3 回目のチェーンはソルジャーE.G. の CT が明けてから（左の枠が選ばれる）、4 回目はその CT 中（メイデンが選ばれる）、
 * 5 回目はソルジャーE.G. の CT が明けてから、6 回目はすぐ
 */
const MANUAL = [0, 2800, 5200, 5201, 7700, 7701];

type Case = { input: TeamInput; maiden: number; burstHits?: number[] };
const CASES: Record<string, Case> = {
  '撮影 A（ココア + ソルジャーF.A. + メイデン）': { input: rangeTeam([311, 301, MAIDEN]), maiden: 2 },
  '撮影 B・オート（ココア + ソルジャーE.G. + メイデン + ソルジャーF.A.）': {
    input: rangeTeam([311, SOLDIER_EG, MAIDEN, 301]),
    maiden: 2,
  },
  '撮影 B・手動': {
    input: rangeTeam([311, SOLDIER_EG, MAIDEN, 301], { manualBursts: MANUAL }),
    maiden: 2,
    burstHits: [4, 2],
  },
  '実戦寄り（リター + クラウン + メイデン + 紅蓮 + ソルジャーE.G.）': {
    input: fixedTeam([82, 330, MAIDEN, 222, SOLDIER_EG], 2),
    maiden: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, maiden: M, burstHits }) => {
  const plan = planTeamRun(input);
  const records = plan.history.counters.filter((r) => r.slotIndex === M && r.counter === 'mp');
  /** フレーム f の前のフレームの終わりの MP（条件 selfCounter・perCount と同じ見え方） */
  const mpBefore = (f: number) => records.filter((r) => counterEffectiveFrom(r) <= f).at(-1)?.value ?? 0;
  const schedule = plan.schedule!;
  const mine = schedule.activations.filter((a) => a.slotIndex === M);
  const uses = mine.map(effectFrameOf);
  const fullBurstStarts = schedule.activations.filter((a) => a.startsFullBurst).map((a) => a.fullBurstStart!);

  it('keeps MP between 0 and 12 and clears it on every Burst use', () => {
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect(r.value >= 0 && r.value <= 12).toBe(true);
    for (const f of uses) expect(records.filter((r) => r.frame <= f).at(-1)?.value).toBe(0);
  });

  it('charges MP only at Full Burst starts with MP of 1 or more', () => {
    const charged = records.filter((r, i) => r.value > (i === 0 ? 0 : records[i - 1]!.value) && r.value > 1);
    for (const r of charged) {
      expect(fullBurstStarts).toContain(r.frame);
      expect(mpBefore(r.frame)).toBeGreaterThanOrEqual(1);
    }
  });

  it('attacks as many times as the MP held at each Burst use', () => {
    expect(uses.length).toBeGreaterThan(0);
    const counts = mine.map((a) => hitFramesOf(a).length);
    expect(counts).toEqual(uses.map(mpBefore));
    for (const n of counts) expect(n).toBeGreaterThanOrEqual(1);
    if (burstHits !== undefined) expect(counts.slice(0, burstHits.length)).toEqual(burstHits);
    // 各ヒットは説明文の値（等分しない）で、遅れの表の行の先頭から MP の数だけ
    const { hitFrames, hitOffsets } = burstDelaysOf(input.slots[M]!.character);
    for (const a of mine) {
      expect(hitShareOf(a)).toBe(1);
      const n = hitFramesOf(a).length;
      expect(hitFramesOf(a)).toEqual(hitOffsets!.slice(0, n).map((o) => hexagonFrameOf(a) + hitFrames + o));
    }
  });

  it('buffs electric allies other than herself at the Full Burst starts where MP is charged', () => {
    const allyBuffs = itemsOf(plan.history, {
      sourceSlotIndex: M,
      kind: 'timed',
      skill: 'skill2',
      stat: 'elementDamage',
    }).filter((w) => w.holder !== M);
    const electric = input.slots.flatMap((s, i) => (s?.character.element === 'Electronic' && i !== M ? [i] : []));
    for (const w of allyBuffs) expect(electric).toContain(w.holder);
    const expected = electric.length === 0 ? [] : fullBurstStarts.filter((f) => mpBefore(f) >= 1);
    expect([...new Set(allyBuffs.map((w) => w.start))].sort((a, b) => a - b)).toEqual(expected);
  });

  it('buffs herself after using MP (at every Burst use)', () => {
    const own = itemsOf(plan.history, {
      sourceSlotIndex: M,
      holder: M,
      kind: 'timed',
      skill: 'skill2',
      stat: 'attack',
    });
    expect([...new Set(own.map((w) => w.start))].length).toBe(uses.length);
  });
});
