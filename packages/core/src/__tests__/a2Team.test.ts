// A2 の B モード編（plan/design-hp-down-interval.md。V-0729）: A2（811）を含む編成で、バーストの B モード（攻撃力▲・チャージ速度▲）が付いた
// フレームから 1 秒ごとに現在の HP▼ が起き、HP が 40% 以下と読めたフレームの次で解除され、2 回目以降のバースト（HP 40% 以下）では付かないか
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { computeFixedSpecDefence } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const slot = (id: number): TeamSlotInput => ({
  ...fixedSlot(id),
  defenceOverride: computeFixedSpecDefence(characterOf(id)),
  condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
});

const A2 = 811;
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(slot),
  enemy: SHOOTING_RANGE_ENEMY,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'リター + デルタ + A2（V-0729 の編成）': team([82, 20, A2], 2),
  '実戦寄り（リター + デルタ + A2 + アリス + クラウン）': team([82, 20, A2, 191, 330], 2),
};

// スキル Lv10: 現在の HP 3.99%▼ を n 回で 0.9601^n。40% 以下は 23 回目（0.9601^22 ≒ 40.8%・0.9601^23 ≒ 39.2%）
const DOWNS_TO_40 = 23;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const a2 = input.slots.findIndex((s) => s?.character.resourceId === A2);
  const plan = planTeamRun(input);
  const uses = activationFramesOfSlot(plan.schedule!, a2);
  const modeB = itemsOf(plan.history, { holder: a2, state: 'modeB' }).map(({ start, end }) => ({ start, end }));
  const hpDowns = plan.instants
    .filter((i) => i.slotIndex === a2 && i.effect.kind === 'currentHpDown')
    .map((i) => i.frame);
  const second = timerFramesOf({ everySeconds: 1 }, plan.frames)[0]!;

  it('applies Mode B on the first burst use, lowering the current HP from that frame every second', () => {
    expect(uses.length).toBeGreaterThan(1);
    const first = uses[0]!;
    expect(hpDowns).toHaveLength(DOWNS_TO_40);
    expect(hpDowns).toEqual(Array.from({ length: DOWNS_TO_40 }, (_, k) => first + k * second));
  });

  it('ends Mode B the frame after the HP down that drops HP to 40% or lower is read', () => {
    expect(modeB).toEqual([{ start: uses[0]!, end: hpDowns[DOWNS_TO_40 - 1]! + 2 }]);
  });

  it('does not apply Mode B on later burst uses (HP is already 40% or lower)', () => {
    for (const a of uses.slice(1)) expect(modeB.some((w) => w.start === a)).toBe(false);
  });

  // チャージ速度▲（1 パス目で窓を追う stat）は、解除の後の発の間隔に残らない
  it('shortens the A2 shot interval only within Mode B', () => {
    const shots = plan.shots[a2]!.frames;
    const gaps = (from: number, to: number) =>
      shots.flatMap((f, i) => (i > 0 && shots[i - 1]! >= from && f < to ? [f - shots[i - 1]!] : []));
    const before = Math.min(...gaps(0, uses[0]!));
    const window = modeB[0]!;
    expect(Math.min(...gaps(window.start, window.end))).toBeLessThan(before);
    expect(Math.min(...gaps(window.end, uses[1]!))).toBe(before);
  });
});

describeEveryShotInOneGroup(TEAMS);
