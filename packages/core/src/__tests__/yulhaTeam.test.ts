// ユルハ（171。V-0823）を含む編成で、S2 の 30 秒ごとの味方全体の攻撃力▲（CT ごとのアクティブ）と、
// バーストのバーストスキルダメージが意図どおりに出るか。S1 の平常心とバーストの追加ダメージは被弾が要るので前提の外
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf, hitShareOf } from '../burst/schedule.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { characterOf, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const YULHA = 171;

describe('ユルハの定義', () => {
  const def = parseSkillDefinition(rawDefinition(YULHA));

  it('defines the S2 ATK up and the Burst Skill damage, and keeps Calm and its additional damage out of scope', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（ユルハ単騎）': fixedTeam([YULHA], 0),
  '撮影 B の編成（I-DOLL・フラワー + デルタ + ユルハ）': fixedTeam([304, 20, YULHA], 2),
  '実戦寄り（リター + クラウン + ユルハ + アリス + ユニ）': fixedTeam([82, 330, YULHA, 191, 160], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const yulha = input.slots.findIndex((s) => s?.character.resourceId === YULHA);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === yulha);

  it('gives every ally the S2 ATK up for 5 s every 30 s from 30 s (not at the start of combat)', () => {
    // 周期は ceil(30 ÷ 0.017) = 1,765 ティックで、1 回目も 1 周期後（C-0502・C-1436）
    const starts = timerFramesOf({ everySeconds: 30 }, sim.frames);
    expect(starts.slice(0, 2)).toEqual([1765, 3530]);
    for (let holder = 0; holder < input.slots.length; holder++) {
      const windows = effectWindows(sim, holder, { resourceId: YULHA, skill: 'skill2', stat: 'attack' });
      expect(windows).toHaveLength(starts.length);
      expect(windows).toEqual(
        windowsFrom(
          windows.map((w) => w.start),
          5,
          sim.frames,
        ),
      );
      // クールタイムの印のある周期は、解決で自分のスロットの { skillFired } になり、窓は周期のフレームか 1f 後から始まる
      windows.forEach((w, k) => expect([0, 1]).toContain(w.start - starts[k]!));
    }
  });

  if (input.slots.length === 1) {
    it('never uses her Burst (a lone Burst III)', () => {
      expect(uses).toEqual([]);
      expect(sim.slots[yulha]!.burst.hits).toEqual([]);
    });
    return;
  }

  it('deals the Burst Skill damage in two even hits, 116 f and 123 f after the III timer hits 00.00 (C-1437)', () => {
    expect(burstDelaysOf(characterOf(YULHA))).toEqual({ hitFrames: 116, effectFrames: 0, hitOffsets: [0, 7] });
    expect(uses.length).toBeGreaterThan(2);
    expect(sim.slots[yulha]!.burst.hits).toHaveLength(uses.length);
    for (const a of uses) {
      expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 116, hexagonFrameOf(a) + 123]);
      expect(hitShareOf(a)).toBe(0.5);
    }
  });
});
