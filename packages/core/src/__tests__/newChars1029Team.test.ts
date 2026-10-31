// 2026-10-29 のアップデートのキャラの語彙（plan/design-new-chars-1029.md 5 節）を、仮のキャラの編成で回す。使い手（マリアン：クイーン
// など）の定義は CDN に載ってから書く。ここでは 5.2（N 回順番に攻撃）・5.4（コア命中ダメージ）・5.5（順番攻撃ダメージ▲）の出方を見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { firingParams } from '../frame/firing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { rateAfterShots } from '../cadence.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { ENEMY, itemsOf } from '../skills/holders.ts';
import { createTriggerTracker, type FrameEvents, type ShotEvent } from '../skills/triggers.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const values = (v: string) => Array.from({ length: 10 }, () => v);

/** skill1 の値: 1 = 1 ヒットの倍率（%）、2 = ヒット数、3 = 順番攻撃ダメージ▲（%）、4 = 周期を縮める秒、5 = 弾丸チャージの発数、6 = 通常攻撃のクリティカル確率▲（%） */
function character(): CharacterData {
  const c = makeCharacter();
  const skill = (vs: string[]) => ({
    id: 1,
    name: { ja: 'テスト', en: 'Test' },
    description: { ja: '', en: '' },
    values: vs.map(values),
  });
  return { ...c, skills: { skill1: skill(['100', '7', '50', '2', '1', '35']), skill2: skill([]), burst: skill([]) } };
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const spear = {
  kind: 'damage',
  trigger: { everySeconds: 4 },
  ref: 1,
  damageType: 'skill',
  hitsRef: 2,
  hitIntervalFrames: 5,
};
const sequentialUp = {
  kind: 'timed',
  trigger: 'battleStart',
  target: 'self',
  stat: 'sequentialAttackDamage',
  ref: 3,
  durationUntil: 'battleEnd',
};

function run(effects: Record<string, unknown>[], hasCore = true, shot: Partial<CharacterData['shot']> = {}) {
  const definition = parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-28',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
  const enemy: EnemyInput = { defence: 100, element: null, hasCore };
  const input: TeamInput = {
    slots: [
      {
        character: { ...character(), shot: { ...character().shot, ...shot } },
        growth: { level: 1, grade: 0, core: 0 },
        attackOverride: 10_000,
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy,
    durationSeconds: 20,
    burst: false,
    controlledSlot: 0,
  };
  return planTeamRun(input);
}

describe('5.2 「N 回順番に攻撃」（damage の hitsRef・hitIntervalFrames）', () => {
  it('splits one activation into N hits, each at the value of ref, spaced by the interval', () => {
    const hits = run([spear]).skillHits;
    // 周期の発動ごとに 7 ヒット。発動の時刻は周期のきっかけのまま（plan/design-timer-ceil.md）
    expect(hits.length % 7).toBe(0);
    expect(hits.length).toBeGreaterThan(7);
    hits.forEach((h, i) => expect(h.frame - hits[i - (i % 7)]!.frame).toBe((i % 7) * 5));
    expect(hits[7]!.frame - hits[0]!.frame).toBeGreaterThanOrEqual(gameSecondsToFrames(4));
    expect(new Set(hits.map((h) => h.hit.multiplier))).toEqual(new Set([1]));
  });

  it('puts the N hits on the same frame when the interval is left out', () => {
    const { hitIntervalFrames: _, ...sameFrame } = spear;
    const hits = run([sameFrame]).skillHits;
    expect(hits.slice(0, 7).every((h) => h.frame === hits[0]!.frame)).toBe(true);
  });

  it('gives all N hits the buffs at the activation, even after a delay (10.2 節の d。V-0538)', () => {
    const delayed = { ...spear, delayFrames: 19 };
    // 攻撃力▲が 1 回目の発動（236f）の直後に切れる。遅れて出る 7 ヒット（255f〜）も、発動の時点の▲のまま
    const attackUp = {
      kind: 'timed',
      trigger: 'battleStart',
      target: 'self',
      stat: 'attack',
      ref: 3,
      durationSeconds: 4.05,
    };
    const hits = run([delayed, attackUp]).skillHits;
    expect(hits[0]!.frame).toBe(236 + 19);
    const plain = run([delayed]).skillHits;
    for (let k = 0; k < 7; k++) {
      expect(hits[k]!.hit.perActivation).toBeCloseTo(hits[0]!.hit.perActivation, 9);
      expect(hits[k]!.hit.perActivation).toBeGreaterThan(plain[k]!.hit.perActivation);
    }
    // 2 回目の発動（▲が切れた後）は▲なし
    expect(hits[7]!.hit.perActivation).toBeCloseTo(plain[7]!.hit.perActivation, 9);
  });
});

describe('10.2 節の e: 周期の付与の delayFrames', () => {
  const wound = {
    kind: 'state',
    state: 'openWounds',
    trigger: { everySeconds: 4 },
    target: 'enemy',
    durationUntil: 'battleEnd',
    contents: [{ stat: 'damageTaken', ref: 3 }],
  };

  it('applies the grant delayFrames after each timer fire', () => {
    const startOf = (effect: Record<string, unknown>) =>
      itemsOf(run([effect]).history, { holder: ENEMY }).filter((i) => i.origin.kind === 'state')[0]!.start;
    expect(startOf(wound)).toBe(236);
    expect(startOf({ ...wound, delayFrames: 19 })).toBe(236 + 19);
  });

  it('needs a timer trigger in a state grant', () => {
    const def = (effect: Record<string, unknown>) =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-29',
        skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
      });
    expect(() => def({ ...wound, trigger: 'burstUse', delayFrames: 19 })).toThrow(
      /delayFrames in a state grant needs a timer trigger/,
    );
  });
});

describe('5.5 順番攻撃ダメージ▲（sequentialAttackDamage）', () => {
  it('multiplies only the sequential hits by (1 + Σ)', () => {
    const plain = run([spear]).skillHits[0]!.hit.perActivation;
    const up = run([spear, sequentialUp]).skillHits[0]!.hit;
    expect(up.sequentialAttackDamageMultiplier).toBeCloseTo(1.5, 12);
    expect(up.perActivation).toBeCloseTo(plain * 1.5, 6);
    // 「N 回順番に攻撃」でない倍率ダメージには乗らない
    const { hitsRef: _h, hitIntervalFrames: _i, ...single } = spear;
    const other = run([single, sequentialUp]).skillHits[0]!.hit.perActivation;
    expect(other).toBeCloseTo(run([single]).skillHits[0]!.hit.perActivation, 6);
  });

  it('adds to the attack damage sum, not a separate multiplier (V-0545)', () => {
    const attackDamageUp = { ...sequentialUp, stat: 'attackDamage', ref: 6 };
    const plain = run([spear, attackDamageUp]).skillHits[0]!.hit;
    const up = run([spear, attackDamageUp, sequentialUp]).skillHits[0]!.hit;
    expect(plain.attackDamageMultiplier).toBeCloseTo(1.35, 12);
    expect(up.sequentialAttackDamageMultiplier).toBeCloseTo((1.35 + 0.5) / 1.35, 12);
    expect(up.perActivation).toBeCloseTo((plain.perActivation * (1.35 + 0.5)) / 1.35, 6);
  });
});

describe('5.4 コア命中ダメージ（damage の coreHit）', () => {
  const { hitsRef: _h, hitIntervalFrames: _i, ...single } = spear;

  it('adds the core term as a hit on the core (rate 1)', () => {
    const plain = run([single]).skillHits[0]!.hit;
    const core = run([{ ...single, coreHit: true }]).skillHits[0]!.hit;
    // コア倍率 2 → コアの項 1。会心の期待値 0.15 × 0.5
    expect(core.boost.core).toBeCloseTo(1, 12);
    expect(core.perActivation / plain.perActivation).toBeCloseTo((1 + 0.075 + 1) / (1 + 0.075), 9);
  });

  it('adds nothing on an enemy without a core', () => {
    const plain = run([single], false).skillHits[0]!.hit.perActivation;
    expect(run([{ ...single, coreHit: true }], false).skillHits[0]!.hit.perActivation).toBeCloseTo(plain, 9);
  });
});

describe('5.3 状態の間だけ縮む周期（damage の periodShorten）', () => {
  const { hitsRef: _h, hitIntervalFrames: _i, ...single } = spear;
  const shortened = { ...single, periodShorten: { state: 'followUp', slot: 'skill1', ref: 4 } };
  // 戦闘開始から 10 秒、自分に状態（中身なし）
  const grant = { kind: 'state', state: 'followUp', trigger: 'battleStart', target: 'self', durationSeconds: 10 };

  it('keeps the plain period when the state is never on', () => {
    expect(run([shortened]).skillHits.map((h) => h.frame)).toEqual(run([single]).skillHits.map((h) => h.frame));
  });

  it('uses the shortened period after a fire made while the state is on', () => {
    const frames = run([shortened, grant]).skillHits.map((h) => h.frame);
    const gaps = frames.map((f, i) => f - (i === 0 ? 0 : frames[i - 1]!));
    const four = gameSecondsToFrames(4) + 1;
    const two = gameSecondsToFrames(2) + 1;
    // 戦闘開始のフレームの状態は見えない（付いた件はその次のフレームから）ので 1 回目は 4 秒。状態の間の発動の後は 2 秒。
    // 3 回目（8 秒）の後は縮めた次の発動（10 秒の後）の時点で状態が切れているので 4 秒に戻る（10.2 節の f。V-0538）
    expect(gaps.slice(0, 4)).toEqual([four, two, two, four]);
    expect(gaps.at(-1)).toBe(four);
  });

  it('counts the period by game seconds with the fraction carried over (carry)', () => {
    const carried = run([{ ...single, trigger: { everySeconds: 4, carry: true } }]).skillHits.map((h) => h.frame);
    // 4 秒 = 235.29 フレーム。k 回目は ceil(k × 235.29)（端数を持ち越さないと 236 × k）
    expect(carried.slice(0, 4)).toEqual([236, 471, 706, 942]);
    const plain = run([single]).skillHits.map((h) => h.frame);
    expect(plain.slice(0, 4)).toEqual([236, 472, 708, 944]);
  });

  it('needs a timer trigger', () => {
    const def = (effect: Record<string, unknown>) =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-28',
        skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
      });
    expect(() => def({ ...shortened, trigger: 'burstUse' })).toThrow(/periodShorten needs a timer trigger/);
    expect(() => def({ ...shortened, periodShorten: { state: 'followUp', slot: 'skill1', ref: 4, x: 1 } })).toThrow(
      /unknown field/,
    );
  });
});

describe('11.2 の b 周期の倍率ダメージのヒットごとのゲージ（damage の gaugePerHit。V-0545）', () => {
  const grant = { kind: 'state', state: 'followUp', trigger: 'battleStart', target: 'self', durationSeconds: 10 };
  const gauged = {
    ...spear,
    delayFrames: 3,
    gaugePerHit: true,
    periodShorten: { state: 'followUp', slot: 'skill1', ref: 4 },
  };

  it('charges one hit of the shooter at every hit frame, with the same (shortened) fires as the hits', () => {
    const plan = run([gauged, grant]);
    const hits = plan.skillHits.map((h) => h.frame);
    expect(hits.length).toBeGreaterThan(7);
    expect(plan.timerGauges.map((g) => g.frame)).toEqual(hits);
    expect(new Set(plan.timerGauges.map((g) => g.energy))).toEqual(
      new Set([character().shot.targetBurstEnergyPerShot]),
    );
    // 状態の間に縮んだ周期も、2 パス目のヒットと同じ発火で追う
    const fires = [...new Set(plan.timerGauges.map((g) => g.fireFrame))];
    expect(fires[2]! - fires[1]!).toBe(gameSecondsToFrames(2) + 1);
  });

  it('needs a timer trigger and delayFrames', () => {
    const def = (effect: Record<string, unknown>) =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-28',
        skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
      });
    const { periodShorten: _p, ...plain } = gauged;
    expect(() => def({ ...plain, trigger: 'burstUse' })).toThrow(/gaugePerHit needs a timer trigger/);
    const { delayFrames: _d, ...undelayed } = plain;
    expect(() => def(undelayed)).toThrow(/gaugePerHit needs delayFrames/);
  });
});

describe('5.6 マシンガン立ち上げ速度▲（spinUpSpeed）', () => {
  // MG（rateOfFire 60 → endRateOfFire 4200、1 発ごとに +100rpm。データの MG と同じ形）
  const mg = {
    rateOfFire: 60,
    endRateOfFire: 4200,
    rateOfFireChangePerShot: 100,
    maxAmmo: 300,
    rateOfFireResetTime: 1,
  };
  const spinUp = {
    kind: 'timed',
    trigger: 'battleStart',
    target: 'self',
    stat: 'spinUpSpeed',
    ref: 3,
    durationUntil: 'battleEnd',
  };

  it('scales the rise per shot by (1 + Σ), up to the top rate', () => {
    const shot = { ...character().shot, ...mg };
    expect(rateAfterShots(shot, 10, 1, 1.5)).toBe(60 + 10 * 100 * 1.5);
    // 頭打ち（最高レートか 1 フレーム 1 発）は変えない
    expect(rateAfterShots(shot, 100, 1, 1.5)).toBe(rateAfterShots(shot, 1000));
    expect(firingParams(shot, { ...ZERO_BUFFS, spinUpSpeed: 0.5 }).spinUpScale).toBe(1.5);
    // スピンアップの無い武器には効かない
    expect(firingParams(character().shot, { ...ZERO_BUFFS, spinUpSpeed: 0.5 }).spinUpScale).toBe(1);
  });

  it('fires more MG shots in the same time', () => {
    const plain = run([{ ...spinUp, stat: 'attack' }], true, mg).shots[0]!.frames.length;
    const up = run([spinUp], true, mg).shots[0]!.frames.length;
    expect(up).toBeGreaterThan(plain);
  });
});

describe('5.7 クリティカル命中の回数（critHit）と、変更の外でだけの発火（firesOutside）', () => {
  // AR の装弾数 9（紅蓮：神殺の形）
  const ar = { maxAmmo: 9 };
  const refill = {
    kind: 'ammoRefill',
    trigger: { count: 'critHit', every: 2 },
    target: 'self',
    ref: 5,
    scaling: 'flat',
  };
  const critUp = {
    kind: 'timed',
    trigger: 'battleStart',
    target: 'self',
    stat: 'normalCritRate',
    ref: 6,
    durationUntil: 'battleEnd',
  };

  it('writes the expected critical hits of each shot (hit × crit rate, with the time-varying ▲)', () => {
    const log = run([critUp], true, ar).shots[0]!;
    // 基礎 15% + 35%（戦闘開始の件は 1 発目から効く）
    expect(new Set(log.critHits)).toEqual(new Set([0.5]));
  });

  it('refills one bullet every two expected critical hits, so the magazine lasts longer', () => {
    const reloads = (effects: Record<string, unknown>[]) => run(effects, true, ar).shots[0]!.lastShotFrames!.length;
    const plain = reloads([critUp]);
    const refilled = reloads([critUp, refill]);
    // 4 発に 1 発戻るので、マガジンは 9 → 12 発程度に延びる
    expect(refilled).toBeLessThan(plain);
  });

  const shot = (weaponChange: boolean): ShotEvent => ({
    lastShot: false,
    fullCharge: false,
    hits: 1,
    coreHits: 0,
    critHits: 1,
    ...(weaponChange ? { weaponChange: true } : {}),
  });
  const events = (s: ShotEvent): FrameEvents =>
    ({
      frame: 0,
      shots: [s],
      activations: [],
      burstEffects: [],
      fullBurstStart: false,
      fullBurstEnd: false,
      gaugeFull: false,
      fullBurstStartUsers: [],
      fullBurstEndUsers: [],
      healed: [false],
    }) as unknown as FrameEvents;

  it('counts the shots of a changed weapon but does not fire on them with firesOutside', () => {
    const track = createTriggerTracker({ count: 'critHit', every: 2, firesOutside: 'weaponChange' }, 0, null);
    expect([shot(false), shot(true), shot(true), shot(false)].map((s) => track(events(s)))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('rejects firesOutside with a firing window and on weaponChangeShot', () => {
    const def = (trigger: Record<string, unknown>) =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-28',
        skills: { skill1: { effects: [{ ...refill, trigger }] }, skill2: empty, burst: empty },
      });
    expect(def({ count: 'critHit', every: 2, firesOutside: 'weaponChange' }).skills.skill1.effects[0]).toMatchObject({
      trigger: { firesOutside: 'weaponChange' },
    });
    expect(() => def({ count: 'critHit', every: 2, firesOutside: 'fullBurst' })).toThrow(/firesOutside: expected/);
    expect(() => def({ count: 'weaponChangeShot', firesOutside: 'weaponChange' })).toThrow(
      /firesOutside cannot be used with weaponChangeShot/,
    );
  });
});
