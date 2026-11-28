// ダメージに効く効果のほとんどない 5 体（メアリー 130・ラプンツェル 221・ベイ 550・パスカル 812・ソラ 532。V-0897）の定義と、
// 回復を受けた時の効果を持つアスカ（830）・デバフを持つマスト：ロマンチックメイド（354）と組む編成で、回復・デバフ解除が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { stateItemsOf } from './historyHelpers.ts';
import { describeRuns, fixedTeam } from './teamHelpers.ts';

const MARY = 130;
const RAPUNZEL = 221;
const BAY = 550;
const PASCAL = 812;
const SORA = 532;
const ASUKA = 830;
const MAST_RM = 354;

describe('定義のスロットの対応状況', () => {
  const support = (id: number, treasure = false) => {
    const def = parseSkillDefinition(rawDefinition(id));
    const skills = treasure ? def.treasureSkills! : def.skills;
    return [skills.skill1?.support, skills.skill2?.support, skills.burst?.support];
  };

  it('defines the heals of Mary, Rapunzel and Sora, Sora’s Outgoing Healing up and debuff removal, and notes only for Bay and Pascal', () => {
    expect(support(MARY)).toEqual(['supported', 'noEffect', 'supported']);
    expect(support(RAPUNZEL)).toEqual(['supported', 'noEffect', 'supported']);
    expect(support(SORA)).toEqual(['supported', 'noEffect', 'supported']);
    expect(support(BAY)).toEqual(['noEffect', 'noEffect', 'noEffect']);
    // 宝物版 S1 の「自分を除く味方全体」の回復は語彙が無く未対応
    expect(support(BAY, true)).toEqual(['unsupported', 'noEffect', 'noEffect']);
    // 回復の対象（最終防御力の順位・HP の値の順位）の語彙が無く未対応
    expect(support(PASCAL)).toEqual(['unsupported', 'noEffect', 'unsupported']);
  });
});

// ラプンツェル（I）・ベイ（II）・アスカ（III・操作）・メアリー（I）・パスカル（I）。HP はみな満タンなので、
// 「残りの HP の割合が最も低い味方」は枠の若い順（C-0567）
const HEALERS: TeamInput = fixedTeam([RAPUNZEL, BAY, ASUKA, MARY, PASCAL], 2);
// ソラ（I）・マスト：ロマンチックメイド（II。バースト 1 段階突入のたびに自分にほろ酔い）・アスカ（III・操作）
const SORA_MAST: TeamInput = fixedTeam([SORA, MAST_RM, ASUKA], 2);

describe('ラプンツェル + ベイ + アスカ + メアリー + パスカル', () => {
  const plan = planTeamRun(HEALERS);
  const healsFrom = (source: number) => plan.history.heals.filter((h) => h.sourceSlotIndex === source);
  const usesOf = (slot: number) => plan.schedule!.activations.filter((a) => a.slotIndex === slot);

  it('heals the three leftmost allies on every Rapunzel shot (fully charged)', () => {
    const shots = plan.shots[0]!.frames;
    expect(shots.length).toBeGreaterThan(10);
    const s1 = healsFrom(0).filter((h) => !usesOf(0).some((a) => a.frame === h.frame));
    expect(new Set(s1.map((h) => h.slotIndex))).toEqual(new Set([0, 1, 2]));
    // 射撃の回数のきっかけは、自分の枠には次のフレーム、後ろの枠には同じフレームに付く（C-0628）
    for (const slot of [0, 1, 2]) {
      const frames = s1.filter((h) => h.slotIndex === slot).map((h) => h.frame);
      expect(frames).toEqual(shots.map((f) => (slot === 0 ? f + 1 : f)).filter((f) => f < plan.frames));
    }
  });

  it('heals the leftmost ally (slot 1) on each last bullet of Mary', () => {
    const lastShots = plan.shots[3]!.lastShotFrames ?? [];
    expect(lastShots.length).toBeGreaterThan(2);
    const s1 = healsFrom(3).filter((h) => !usesOf(3).some((a) => a.frame === h.frame));
    expect(new Set(s1.map((h) => h.slotIndex))).toEqual(new Set([0]));
    // 前の枠（1 枠目）には次のフレーム（C-0628）
    expect(s1.map((h) => h.frame)).toEqual(lastShots.map((f) => f + 1).filter((f) => f < plan.frames));
  });

  it('heals all allies at each burst of Rapunzel and Mary, and Pascal heals nobody', () => {
    for (const slot of [0, 3]) {
      const uses = usesOf(slot);
      for (const a of uses) {
        const at = healsFrom(slot).filter((h) => h.frame === a.frame);
        expect(new Set(at.map((h) => h.slotIndex))).toEqual(new Set([0, 1, 2, 3, 4]));
      }
    }
    expect(usesOf(0).length + usesOf(3).length).toBeGreaterThan(1);
    expect(healsFrom(4)).toEqual([]);
    expect(healsFrom(1)).toEqual([]);
  });
});

describe('ソラ + マスト：ロマンチックメイド + アスカ', () => {
  const plan = planTeamRun(SORA_MAST);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 0);
  const drunken = stateItemsOf(plan).filter((s) => s.state === 'drunken' && s.slotIndex === 1);

  it('heals all allies at each burst of Sora', () => {
    expect(uses.length).toBeGreaterThan(1);
    for (const a of uses) {
      const at = plan.history.heals.filter((h) => h.sourceSlotIndex === 0 && h.frame === a.frame);
      expect(new Set(at.map((h) => h.slotIndex))).toEqual(new Set([0, 1, 2]));
    }
  });

  it('removes Drunken from Mast at Sora’s burst, so it never stacks above 1', () => {
    let closed = 0;
    for (const a of uses) {
      const active = drunken.filter((s) => s.start <= a.frame && a.frame < s.end);
      for (const s of active) expect(s.end).toBe(a.frame + 1);
      closed += active.length;
    }
    expect(closed).toBeGreaterThan(0);
    expect(Math.max(...drunken.map((s) => s.stack ?? 1))).toBe(1);
  });
});

describeRuns({ HEALERS, SORA_MAST });
