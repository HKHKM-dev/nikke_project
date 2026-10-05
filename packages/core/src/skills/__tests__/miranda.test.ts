// ミランダ（32）: S1「ヘルスアップ！」の命中率▲（30 ヒットごとに味方全体 5.44%・SMG の味方 3.79%・5 秒）と、
// 宝物版 S1 の自分の攻撃力▲（50.06%・5 秒）の解決（V-0114）。バースト「パワーアップ！」は自分を除く最終攻撃力の上位 N 機
// （足りなければ自分。宝物版 2 機 C-0322・基礎版 1 機 C-0325）、S2「ウェイクアップ！」はフルバーストタイムの発動時の
// クリティカルダメージ▲（味方全体）と、宝物版の自分のクリティカル確率▲・攻撃ダメージ▲（C-0323・C-0324・C-0326。V-0216〜V-0218）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const miranda = readJson<CharacterData>('../../../data/characters/32.json');
const def = parseSkillDefinition(readJson<unknown>('../../../data/skills/32.json'));
const FIVE_SECONDS = gameSecondsToFrames(5);
const TEN_SECONDS = gameSecondsToFrames(10);

describe('ミランダ（32）の定義', () => {
  it('resolves S1 to two hit rate ups every 30 normal hits (all allies, and SMG allies)', () => {
    const timed = resolveTimed(def, miranda, MAX_SKILL_LEVELS).filter((e) => e.stat === 'hitRate');
    expect(timed).toHaveLength(2);
    const [all, smg] = timed;
    expect(all).toMatchObject({ stat: 'hitRate', target: 'allies', durationFrames: FIVE_SECONDS });
    expect(all!.trigger).toEqual({ count: 'normalHit', every: 30 });
    expect(all!.value).toBeCloseTo(0.0544, 12);
    expect(all!.targetWeapon).toBeUndefined();
    expect(smg).toMatchObject({ stat: 'hitRate', target: 'allies', targetWeapon: 'SMG', durationFrames: FIVE_SECONDS });
    expect(smg!.value).toBeCloseTo(0.0379, 12);
    expect(all!.maxStacks).toBeUndefined();
  });

  it('resolves the base burst to 1 ally except self (self if short) and the base S2 to Critical Damage up on all allies', () => {
    const timed = resolveTimed(def, miranda, MAX_SKILL_LEVELS);
    const burst = timed.filter((e) => e.trigger === 'burstUse');
    expect(burst.map((e) => e.stat)).toEqual(['attack', 'critDamage']);
    for (const e of burst) {
      expect(e).toMatchObject({ target: 'topAttack', targetCount: 1, excludeSelf: 'unlessShort' });
      expect(e.durationFrames).toBe(TEN_SECONDS);
    }
    expect(burst[0]!.value).toBeCloseTo(0.404, 12);
    expect(burst[1]!.value).toBeCloseTo(0.5623, 12);
    const s2 = timed.filter((e) => e.trigger === 'fullBurstStart');
    expect(s2).toHaveLength(1);
    expect(s2[0]).toMatchObject({ stat: 'critDamage', target: 'allies', durationFrames: TEN_SECONDS });
    expect(s2[0]!.value).toBeCloseTo(0.3299, 12);
  });

  it('switches to the treasure skills at phase 3 (S1 self ATK up, burst on 2 allies, S2 lines 1 and 2)', () => {
    const applied = applyTreasure(miranda, def, 3);
    const timed = resolveTimed(applied.definition!, applied.character, MAX_SKILL_LEVELS);
    const atk = timed.find((e) => e.stat === 'attack' && e.target === 'self')!;
    expect(atk).toMatchObject({ durationFrames: FIVE_SECONDS });
    expect(atk.trigger).toEqual({ count: 'normalHit', every: 30 });
    expect(atk.value).toBeCloseTo(0.5006, 12);
    const burst = timed.filter((e) => e.trigger === 'burstUse');
    expect(burst.map((e) => [e.stat, e.targetCount, e.excludeSelf])).toEqual([
      ['attack', 2, 'unlessShort'],
      ['critDamage', 2, 'unlessShort'],
    ]);
    const s2 = timed.filter((e) => e.trigger === 'fullBurstStart');
    expect(s2.map((e) => [e.stat, e.target])).toEqual([
      ['critDamage', 'allies'],
      ['critRate', 'self'],
      ['attackDamage', 'self'],
    ]);
    expect(s2.map((e) => e.value)).toEqual([0.3299, 0.301, 0.237].map((v) => expect.closeTo(v, 12)));
    for (const e of s2) expect(e.durationFrames).toBe(TEN_SECONDS);
    // 3 行目（1 発間のクリティカル確率▲）は語彙に無いので notes のまま
    expect(applied.definition!.skills.skill2.support).toBe('partial');
    expect(applied.definition!.skills.burst.support).toBe('supported');
  });

  it('has no instant effects', () => {
    expect(resolveInstant(def, miranda, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
