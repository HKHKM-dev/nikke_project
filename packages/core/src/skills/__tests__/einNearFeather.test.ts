// アインのニアフェザー編（plan/design-ein-near-feather.md 1 節）: 召喚の展開（kind: 'summon'）と、機数で間隔が変わる召喚の攻撃
// （damage のきっかけ { summon }）。語彙の検証と、1 パス目の機数と進み（ヒットのフレーム・ゲージ）を、アイン（391）の定義で確かめる
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import { GAME_SECONDS_PER_FRAME, gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, summonCountsOf } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const EIN = 391;
const character = readJson<CharacterData>(`../../../data/characters/${EIN}.json`);
const definition = readJson<{ skills: Record<string, { effects: Effect[] }> }>(`../../../data/skills/${EIN}.json`);

type Effect = Record<string, unknown>;

const INTERVALS = { '1': 6.7, '2': 5.4, '3': 4.2, '4': 2.9, '6': 0.3 };
const atStart: Effect = {
  kind: 'summon',
  summon: 'nearFeather',
  trigger: 'battleStart',
  lifetimesSeconds: [26, 32, 38, null],
};
const attack: Effect = {
  kind: 'damage',
  trigger: { summon: 'nearFeather', intervalSeconds: INTERVALS, startDelaySeconds: 0.67 },
  ref: 2,
  damageType: 'true',
  gaugePerHit: 2,
};

const entryOf = (effects: Effect[]) =>
  effects.length > 0
    ? { effects }
    : { effects, notes: [{ ja: 'テスト', en: 'Test', kind: 'outOfScope', effect: { kind: 'unknown' } }] };

function definitionOf(skill1: Effect[], skill2: Effect[] = [], burst: Effect[] = []) {
  return {
    formatVersion: 1,
    resourceId: EIN,
    checkedAt: '2026-11-01',
    skills: { skill1: entryOf(skill1), skill2: entryOf(skill2), burst: entryOf(burst) },
  };
}

describe('語彙の検証', () => {
  const parse =
    (skill1: Effect[], skill2: Effect[] = [], burst: Effect[] = []) =>
    () =>
      parseSkillDefinition(definitionOf(skill1, skill2, burst));

  it('accepts the vocabulary', () => {
    expect(parse([atStart], [attack])).not.toThrow();
  });

  it('needs a summon of the same name, and the interval of every count it can have', () => {
    expect(parse([], [attack])).toThrow(/needs a summon of it/);
    const { '2': _two, ...withoutTwo } = INTERVALS;
    expect(
      parse([atStart], [{ ...attack, trigger: { ...(attack.trigger as Effect), intervalSeconds: withoutTwo } }]),
    ).toThrow(/needs the interval for 2/);
  });

  it('keeps the summon attack to a damage without other trigger fields', () => {
    expect(parse([atStart], [{ ...attack, delayFrames: 3 }])).toThrow(/not allowed with a summon trigger/);
    expect(parse([atStart], [{ ...attack, condition: { inFullBurst: true } }])).toThrow(
      /not allowed with a summon trigger/,
    );
    expect(parse([atStart], [{ ...attack, gaugePerHit: 1 }])).toThrow(/expected true or an integer of 2 or more/);
    expect(parse([atStart], [{ ...attack, trigger: { ...(attack.trigger as Effect), x: 1 } }])).toThrow(
      /unknown field/,
    );
  });

  it('deploys on burstUse only in burst', () => {
    expect(parse([{ ...atStart, trigger: 'burstUse' }], [attack])).toThrow(/only allowed in burst/);
    expect(parse([atStart], [attack], [{ ...atStart, trigger: 'burstUse' }])).not.toThrow();
  });

  it('lists the counts a set of feathers can have', () => {
    expect(summonCountsOf([26, 32, 38, null])).toEqual([1, 2, 3, 4]);
    expect(summonCountsOf([10.67, 10.67, 26, 32, 38, null])).toEqual([1, 2, 3, 4, 6]);
    expect(summonCountsOf([5, 5])).toEqual([2]);
  });
});

describe('ニアフェザー（単騎・バーストなし。アインの定義）', () => {
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: false },
    skills: { definition: parseSkillDefinition(definition), levels: MAX_SKILL_LEVELS },
  };
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const r = runSimulation({ slots: [slot], enemy, durationSeconds: 180, burst: false });
  const hits = r.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2').map((h) => h.frame);

  it('attacks every 2.9 s with 4 feathers after the start delay', () => {
    // 展開から 0.67 秒（39f）は進めず、その後 4 機の間隔（170.6f）ごとに進みが 1 に届く
    const delay = gameSecondsToFrames(0.67);
    const per = 2.9 / GAME_SECONDS_PER_FRAME;
    expect(hits.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, k) => delay + Math.ceil((k + 1) * per - 1e-9)));
    expect(hits.slice(0, 8)).toEqual([210, 381, 551, 722, 892, 1063, 1234, 1404]);
  });

  it('slows down as feathers expire, and keeps the last one to the end', () => {
    // 38 秒の後は 1 機の間隔（6.7 秒 = 394.1f）ごと
    const last = hits.filter((f) => f > gameSecondsToFrames(38) + 400);
    const gaps = last.slice(1).map((f, k) => f - last[k]!);
    expect(new Set(gaps)).toEqual(new Set([394, 395]));
    expect(hits).toHaveLength(32);
  });

  it('charges twice the per-shot gauge on every hit', () => {
    const gauges = r.timerGauges.filter((g) => g.slotIndex === 0);
    expect(gauges.map((g) => g.frame)).toEqual(hits);
    for (const g of gauges) expect(g.energy).toBeCloseTo(2 * character.shot.targetBurstEnergyPerShot);
  });
});
