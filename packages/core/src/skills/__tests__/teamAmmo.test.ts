// シンデレラ：クリスタルウェーブ編（plan/design-cinderella-cw.md 2.3・2.4 節）: 回数トリガー teamAmmo（味方が消費した弾の合計。C-1250）の
// 読み込みの制約と数え方、damage の条件 usedBurst（C-1252）の読み込みの制約
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVELS, resolveTrigger } from '../resolve.ts';
import { createTriggerTracker, shotCountWeight, type FrameEvents, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';
import type { CharacterData } from '../../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = readJson<CharacterData>('../../../data/characters/515.json');
const raw = readJson<{ skills: Record<string, { effects: unknown[]; notes?: unknown[] }> }>(
  '../../../data/skills/515.json',
);

/** 515.json を写して、skill1 の effects を差し替えた定義 */
function withSkill1Effects(effects: unknown[]): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill1!.effects = effects;
  return parseSkillDefinition(copy);
}

const gauge = { kind: 'burstGauge', trigger: { count: 'teamAmmo', everyRef: 8 }, target: 'allies', ref: 9 };
const shot = (ammo?: number): ShotEvent => ({
  lastShot: false,
  fullCharge: false,
  hits: 1,
  coreHits: 0,
  ...(ammo === undefined ? {} : { ammo }),
});
const frame = (f: number, shots: (ShotEvent | null)[]): FrameEvents => ({
  frame: f,
  shots,
  activations: [],
  burstEffects: [],
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [],
});

describe('teamAmmo の読み込み', () => {
  it('reads it in a burstGauge with every or everyRef', () => {
    expect(withSkill1Effects([gauge]).skills.skill1.effects[0]).toMatchObject(gauge);
  });

  it('rejects it outside burstGauge, without every, and with a window, stacks or chance', () => {
    expect(() =>
      withSkill1Effects([{ kind: 'damage', trigger: { count: 'teamAmmo', every: 200 }, ref: 7, damageType: 'skill' }]),
    ).toThrow('a teamAmmo count is only allowed in burstGauge');
    expect(() => withSkill1Effects([{ ...gauge, trigger: { count: 'teamAmmo' } }])).toThrow(
      'teamAmmo needs every or everyRef',
    );
    for (const extra of [{ firesDuring: 'fullBurst' }, { stacksRef: 8 }, { chanceRef: 8 }]) {
      expect(() => withSkill1Effects([{ ...gauge, trigger: { ...gauge.trigger, ...extra } }])).toThrow(
        'cannot be used with teamAmmo',
      );
    }
  });
});

describe('teamAmmo の数え方', () => {
  it('counts one per shot and nothing for a shot under infinite ammo', () => {
    expect(shotCountWeight('teamAmmo', shot())).toBe(1);
    expect(shotCountWeight('teamAmmo', shot(0))).toBe(0);
  });

  it('adds the shots of every slot and fires on the frame the total reaches each multiple, even without its own shot', () => {
    const trigger = resolveTrigger({ count: 'teamAmmo', every: 3 }, character.skills.skill1, MAX_SKILL_LEVELS.skill1);
    const fires = createTriggerTracker(trigger, 0, null);
    expect(fires(frame(1, [shot(), shot()]))).toBe(false); // 2
    expect(fires(frame(2, [null, shot()]))).toBe(true); // 3（自分は撃っていない）
    expect(fires(frame(3, [shot(0), shot()]))).toBe(false); // 4（装弾数無限の発は数えない）
    expect(fires(frame(4, [shot(), shot()]))).toBe(true); // 6
  });

  it('fires once when the shots of one frame pass N', () => {
    const trigger = resolveTrigger({ count: 'teamAmmo', every: 2 }, character.skills.skill1, MAX_SKILL_LEVELS.skill1);
    const fires = createTriggerTracker(trigger, 0, null);
    expect(fires(frame(1, [shot(), shot(), shot(), shot(), shot()]))).toBe(true); // 5
    expect(fires(frame(2, [shot()]))).toBe(true); // 6
    expect(fires(frame(3, [shot()]))).toBe(false); // 7
  });
});

describe('damage の usedBurst', () => {
  const damage = {
    kind: 'damage',
    trigger: 'fullBurstStart',
    ref: 7,
    damageType: 'skill',
    condition: { usedBurst: true },
  };

  it('reads it with a Full Burst start or end trigger only', () => {
    expect(withSkill1Effects([damage]).skills.skill1.effects[0]).toMatchObject({ condition: { usedBurst: true } });
    expect(() => withSkill1Effects([{ ...damage, trigger: 'burstUse' }])).toThrow(
      'usedBurst is only allowed with trigger',
    );
  });
});
