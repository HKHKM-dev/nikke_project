// オート射撃を手で ON に戻した明けの構えの短縮（C-1550・C-1564。WeaponModel.manualOnAimShorterFrames）は、使用武器の変更の間と、
// バーストの発動の止まりの中で ON にした枠には効かせない（どちらも確かめていないので窓の明けと同じ待ち。frame/firstPass/shooters.ts の
// stepBlock・stepPause）
import { describe, expect, it } from 'vitest';
import { windowEndFirstShotFrames } from '../frame/shooter.ts';
import { runSimulation } from '../sim/engine.ts';
import { resolveBurstUsePause } from '../skills/burstDamage.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { changedWeaponShot } from '../skills/resolve.ts';
import type { TeamInput } from '../team.ts';
import { characterOf, fixedTeam, rawDefinition, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const SLOT = 2;
/** 1 パス目を回し、枠 SLOT の最初のバーストの発動のフレームと、射撃の列 */
function run(input: TeamInput) {
  const sim = runSimulation(input);
  const activation = sim.schedule!.activations.find((a) => a.slotIndex === SLOT)!.frame;
  return { activation, log: sim.shots[SLOT]! };
}
const holdUntil = (end: number) => ({ holdFire: [{ slotIndex: SLOT, ranges: [{ start: 0, end }] }] });

// ネオン：ブルーオーシャン（14）のバーストの使用武器変更（毎分 90 発・スピンアップなし。リター + デルタと組む）
describe('使用武器の変更の間に ON にした枠', () => {
  const NEON_BO = 14;
  const team = (end: number) => fixedTeam([82, 20, NEON_BO], SLOT, holdUntil(end));
  // ON にするより前の 1 パス目は ON のフレームによらないので、長く隠れた回で発動を引く
  const { activation } = run(team(3000));
  const changed = changedWeaponShot(characterOf(NEON_BO).shot, 0.33, 90);

  it.each([100, 200])('fires the changed weapon a window-end wait after turning on (activation + %sf)', (after) => {
    const on = activation + after;
    const { activation: again, log } = run(team(on));
    expect(again).toBe(activation);
    const first = log.frames.find((f) => f >= on)!;
    expect(log.weaponChangeShotFrames).toContain(first);
    expect(first - on).toBe(windowEndFirstShotFrames(changed));
  });
});

// 宝物版のプリバティ（170）のバーストの発動の止まり（V-0661。リター + デルタと組む）
describe('バーストの発動の止まりの中で ON にした枠', () => {
  const PRIVATY = 170;
  const team = (end?: number): TeamInput => {
    const input = fixedTeam([82, 20, PRIVATY], SLOT, {
      enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' },
      ...(end === undefined ? {} : holdUntil(end)),
    });
    input.slots[SLOT]!.skills!.treasurePhase = 3;
    return input;
  };
  const def = parseSkillDefinition(rawDefinition(PRIVATY));
  const pause = resolveBurstUsePause({ ...def, skills: { ...def.skills, burst: def.treasureSkills!.burst! } });
  const { activation } = run(team(3000));
  /** 発動から、その後の最初の発まで */
  const firstAfterActivation = ({ activation: a, log }: ReturnType<typeof run>) => log.frames.find((f) => f > a)! - a;

  it.each([30, 70])(
    'fires on the same frame from the activation as with auto-fire left on (ON at activation + %sf)',
    (after) => {
      expect(after).toBeLessThan(pause);
      const held = run(team(activation + after));
      expect(held.activation).toBe(activation);
      // 止まりの明けに構え直す（windowEndFirstShotFrames。短縮しない）。オート射撃を ON のままにしていた枠と同じ
      expect(firstAfterActivation(held)).toBe(firstAfterActivation(run(team())));
      expect(firstAfterActivation(held)).toBe(pause + 1 + windowEndFirstShotFrames(characterOf(PRIVATY).shot));
    },
  );
});
