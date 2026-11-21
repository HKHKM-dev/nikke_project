// スノーホワイト編（plan/design-snow-white.md）: スノーホワイト（220）を含む編成で、S1 の命中 30 回ごとの追加ダメージと攻撃力▲、
// S2 の 15 秒ごとの倍率ダメージとフルバーストの中の発動での会心率▲、バーストのチャージ 5 秒・1 発の武器（撃ち切りで戻った後の待ち）が
// 意図どおりに出るか。撃ち切りで戻った後の待ち（returnFirstShotFrames）の検証もここで見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { isInFullBurst } from '../burst/schedule.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const SNOW_WHITE = 220;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
/** S2 の周期（15 秒）と、発動からヒットまで（V-0815） */
const S2_PERIOD = gameSecondsToFirstFrame(15);
const S2_DELAY = 34;
/** バーストの 1 発から AR の最初の発まで（returnFirstShotFrames） */
const RETURN_WAIT = 118;

describe('語彙の検証（returnFirstShotFrames）', () => {
  const withBurst = (patch: Record<string, unknown>) => {
    const raw = structuredClone(rawDefinition(SNOW_WHITE)) as {
      skills: { burst: { effects: Record<string, unknown>[] } };
    };
    Object.assign(raw.skills.burst.effects[0]!, patch);
    return raw;
  };

  it('accepts the field on a weapon change that ends when its magazine is empty', () => {
    expect(() => parseSkillDefinition(withBurst({ returnFirstShotFrames: 116 }))).not.toThrow();
  });

  it('rejects it without maxAmmoRef and with a non-positive value', () => {
    expect(() => parseSkillDefinition(withBurst({ maxAmmoRef: undefined, durationSeconds: 10 }))).toThrow(
      /returnFirstShotFrames needs maxAmmoRef/,
    );
    expect(() => parseSkillDefinition(withBurst({ returnFirstShotFrames: 0 }))).toThrow(/positive integer/);
  });
});

const CASES: Record<string, { input: TeamInput; slot: number }> = {
  '撮影 A（単騎）': { input: fixedTeam([fixedSlot(SNOW_WHITE)], 0, { enemy: rangeEnemy }), slot: 0 },
  '撮影 B（ココア + ソルジャーF.A. + スノーホワイト）': {
    input: fixedTeam([311, 301, SNOW_WHITE], 2, { enemy: rangeEnemy }),
    slot: 2,
  },
  '実戦寄り（リター + クラウン + スノーホワイト + 紅蓮 + ソルジャーE.G.）': {
    input: fixedTeam([82, 330, SNOW_WHITE, 222, 300], 2),
    slot: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, slot: S }) => {
  const plan = planTeamRun(input);
  const log = plan.shots[S]!;
  const changed = new Set(log.weaponChangeShotFrames ?? []);
  const hitsUpTo = (f: number) =>
    log.frames.reduce((sum, frame, k) => (frame <= f ? sum + (log.hits?.[k] ?? 1) : sum), 0);
  const hitsBefore = (f: number) =>
    log.frames.reduce((sum, frame, k) => (frame < f ? sum + (log.hits?.[k] ?? 1) : sum), 0);
  /** 命中の回数が 30 の倍数を越えた発（バーストの 1 発も数える） */
  const s1Shots = log.frames.filter((f) => Math.floor(hitsUpTo(f) / 30) > Math.floor(hitsBefore(f) / 30));
  const hitsOf = (skill: string) =>
    plan.skillHits
      .filter((h) => h.slotIndex === S && h.effect.source.skill === skill)
      .map((h) => h.frame)
      .sort((a, b) => a - b);
  const own = (skill: 'skill1' | 'skill2', stat: 'attack' | 'critRate') =>
    itemsOf(plan.history, { sourceSlotIndex: S, holder: S, kind: 'timed', skill, stat });

  it('fires S1 on the shot of every 30th hit and gives attack from the next frame', () => {
    expect(s1Shots.length).toBeGreaterThan(20);
    expect(hitsOf('skill1')).toEqual(s1Shots);
    // 付いている間にまた付けば維持を付け直すので、窓の始まりはどれもきっかけの発の次のフレーム
    for (const w of own('skill1', 'attack')) expect(s1Shots).toContain(w.start - 1);
  });

  it('fires S2 every 15 s from the start of battle and lands 34 frames later', () => {
    const expected = Array.from({ length: 20 }, (_, k) => (k + 1) * S2_PERIOD + S2_DELAY).filter(
      (f) => f < plan.frames,
    );
    expect(hitsOf('skill2')).toEqual(expected);
  });

  it('gives the S2 critical rate only to activations inside a Full Burst window', () => {
    const fired = Array.from({ length: 20 }, (_, k) => (k + 1) * S2_PERIOD).filter((f) => f < plan.frames);
    const inWindow = fired.filter((f) => plan.schedule !== null && isInFullBurst(plan.schedule, f));
    expect(own('skill2', 'critRate').map((w) => w.start - 1)).toEqual(inWindow);
  });

  if (S !== 0) {
    it('fires one charged shot per Burst and resumes the AR 118 frames later unless the enemy is out of reach', () => {
      const jumps = (input.enemy?.events ?? []).filter((e) => e.kind === 'untargetable');
      expect(changed.size).toBeGreaterThan(1);
      for (const shot of changed) {
        const next = log.frames.find((f) => f > shot);
        if (next === undefined) continue;
        const blocked = jumps.some(
          (e) => gameSecondsToFrames(e.start) <= shot + RETURN_WAIT && shot < gameSecondsToFrames(e.end),
        );
        if (!blocked) expect(next - shot).toBe(RETURN_WAIT);
      }
    });
  }
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
