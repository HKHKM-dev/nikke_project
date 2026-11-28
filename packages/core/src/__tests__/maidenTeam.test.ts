// メイデン（181。V-0841）を含む編成で、S2 の 30 秒ごとの自分のクリティカルダメージ▲（CT ごとのアクティブ）と、
// バーストのバーストスキルダメージが意図どおりに出るか。S1 の復讐とバーストの追加ダメージは被弾が要るので前提の外
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf, hitShareOf } from '../burst/schedule.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { characterOf, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const MAIDEN = 181;

describe('メイデンの定義', () => {
  const def = parseSkillDefinition(rawDefinition(MAIDEN));

  it('defines the S2 crit damage up with its taunt gauge and the Burst Skill damage, and keeps Revenge and its additional damage out of scope', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual(['timed', 'burstGaugeHit']);
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（メイデン単騎）': fixedTeam([MAIDEN], 0),
  '撮影 B の編成（I-DOLL・フラワー + デルタ + メイデン）': fixedTeam([304, 20, MAIDEN], 2),
  '実戦寄り（リター + クラウン + メイデン + アリス + ユニ）': fixedTeam([82, 330, MAIDEN, 191, 160], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const maiden = input.slots.findIndex((s) => s?.character.resourceId === MAIDEN);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === maiden);

  it('gives only herself the S2 crit damage up for 10 s every 30 s from 30 s (not at the start of combat)', () => {
    // 周期は ceil(30 ÷ 0.017) = 1,765 ティックで、1 回目も 1 周期後（C-0506・C-1484）
    const starts = timerFramesOf({ everySeconds: 30 }, sim.frames);
    expect(starts.slice(0, 2)).toEqual([1765, 3530]);
    for (let holder = 0; holder < input.slots.length; holder++) {
      const windows = effectWindows(sim, holder, { resourceId: MAIDEN, skill: 'skill2', stat: 'critDamage' });
      if (holder !== maiden) {
        expect(windows).toEqual([]);
        continue;
      }
      expect(windows).toHaveLength(starts.length);
      expect(windows).toEqual(
        windowsFrom(
          windows.map((w) => w.start),
          10,
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
      expect(sim.slots[maiden]!.burst.hits).toEqual([]);
    });
    return;
  }

  it('deals the Burst Skill damage in one hit, 20 f after the III timer hits 00.00 (C-1485)', () => {
    expect(burstDelaysOf(characterOf(MAIDEN))).toEqual({ hitFrames: 20, effectFrames: 0 });
    expect(uses.length).toBeGreaterThan(2);
    expect(sim.slots[maiden]!.burst.hits).toHaveLength(uses.length);
    for (const a of uses) {
      expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 20]);
      expect(hitShareOf(a)).toBe(1);
    }
  });
});
