// ノベル（212）の S1 の防御力▼（C-1448）が、S1 のクールタイムを縮める効果のある編成でも、S1 のヒットの次のフレームから付くか。
// 定義済みのキャラに、ノベルの S1 を縮める効果は無い（センチの即時の▼も魔術師のカードも、持ち主の S2 だけ）ので、ノベルの S2 に
// 仮の即時の▼（skillCooldownReduction。値は仕組みを見るための仮のもので、実測ではない）を足して回す
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { fixedSlot, fixedTeam } from './teamHelpers.ts';

const NOVEL = 212;
const PERIOD = 589;

const cut = {
  kind: 'skillCooldownReduction',
  trigger: { count: 'normalShot', every: 20 },
  target: 'self',
  slot: 'skill1',
  percentRef: 2,
};

describe('S1 のクールタイムを縮める仮の効果のあるノベル単騎', () => {
  const input = fixedTeam([], 0, {
    slots: [
      fixedSlot(NOVEL, {
        edit: (raw) => {
          (raw.skills.skill2 as { effects: unknown[] }).effects.push(cut);
        },
      }),
    ],
  });
  const plan = planTeamRun(input);
  const s1Hits = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill1');
  const down = itemsOf(plan.history, { sourceSlotIndex: 0, kind: 'timed', skill: 'skill1', stat: 'enemyDefenseDown' });

  it('hits with S1 earlier than the plain period', () => {
    expect(s1Hits.length).toBeGreaterThan(Math.floor(plan.frames / PERIOD));
  });

  it('gives the DEF down from the frame after every S1 hit', () => {
    expect(down.map((w) => w.start)).toEqual(s1Hits.map((h) => h.frame + 1));
  });
});
