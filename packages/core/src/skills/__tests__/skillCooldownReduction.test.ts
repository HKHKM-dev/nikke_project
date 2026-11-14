// センチ編（plan/design-centi.md 2 節）: 即時の「スキル N のクールタイム X%▼」（skillCooldownReduction）・きっかけ「スキル N を発動した時」
// （{ skillFired }）・timed のクールタイムの印（cooldown）の読み込みと、減らす操作（cooldownTimer の cut）、1 パス目の発動と timed の窓。
// sim は、センチ（80）の基礎版の説明文の値でインラインの定義を組んで回す（周期の秒は仕組みを見るための仮の値で、実測ではない）
import { describe, expect, it } from 'vitest';
import { fixedTeam, fixedSlot, effectWindows } from '../../__tests__/teamHelpers.ts';
import { runSimulation } from '../../sim/engine.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrame, gameSecondsToFrames } from '../../time.ts';
import { cooldownTimer } from '../timeline.ts';
import { parseSkillDefinition } from '../types.ts';

const CENTI = 80;
type Effect = Record<string, unknown>;
const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const entry = (effects: Effect[]) => (effects.length > 0 ? { effects } : none);
const def = (skill1: Effect[], skill2: Effect[] = []) => ({
  formatVersion: 1,
  resourceId: CENTI,
  checkedAt: '2026-11-14',
  skills: { skill1: entry(skill1), skill2: entry(skill2), burst: none },
});

/** 仕組みを見るための仮の周期（秒） */
const PERIOD = 10;
const s2Attack: Effect = {
  kind: 'timed',
  trigger: { everySeconds: PERIOD, cooldown: true },
  target: 'allies',
  stat: 'attack',
  ref: 1,
  durationRef: 2,
};
const cut: Effect = {
  kind: 'skillCooldownReduction',
  trigger: { count: 'fullChargeShot' },
  target: 'self',
  slot: 'skill2',
  percentRef: 1,
};
const onS2: Effect = {
  kind: 'timed',
  trigger: { skillFired: 'skill2' },
  target: 'self',
  stat: 'attackDamage',
  ref: 1,
  durationSeconds: 1,
};

describe('読み込み', () => {
  const fails = (skill1: Effect[], skill2: Effect[], re: RegExp) =>
    expect(() => parseSkillDefinition(def(skill1, skill2))).toThrow(re);

  it('parses the reduction, the skillFired trigger and the cooldown mark on timed', () => {
    const parsed = parseSkillDefinition(def([cut, onS2], [s2Attack]));
    expect(parsed.skills.skill1.effects[0]).toEqual(cut);
    expect(parsed.skills.skill1.effects[1]).toMatchObject({ trigger: { skillFired: 'skill2' } });
    expect(parsed.skills.skill2.effects[0]).toMatchObject({ trigger: { everySeconds: PERIOD, cooldown: true } });
  });

  it('needs a cooldown timer in the slot it reads', () => {
    fails([cut], [], /skill2 needs a cooldown timer/);
    fails([onS2], [], /skill2 needs a cooldown timer/);
    fails([cut], [{ ...s2Attack, trigger: { everySeconds: PERIOD } }], /skill2 needs a cooldown timer/);
  });

  it('rejects malformed reductions', () => {
    fails([{ ...cut, target: 'allies' }], [s2Attack], /must target "self"/);
    fails([{ ...cut, slot: 'burst' }], [s2Attack], /slot/);
    fails([{ ...cut, percentRef: undefined }], [s2Attack], /percentRef/);
    fails([{ ...cut, ref: 1 }], [s2Attack], /unknown field/);
    fails([{ ...cut, trigger: 'burstUse' }], [s2Attack], /needs a shot count trigger/);
    fails([{ ...cut, trigger: { count: 'fullChargeShot', chance: 50 } }], [s2Attack], /chance/);
    fails([{ ...cut, trigger: { count: 'fullChargeShot', stacksRef: 1 } }], [s2Attack], /only takes count, every/);
  });

  it('keeps skillFired to timed, and the cooldown timed without a delay', () => {
    fails(
      [{ kind: 'damage', trigger: { skillFired: 'skill2' }, ref: 1, damageType: 'skill' }],
      [s2Attack],
      /only allowed in timed/,
    );
    fails([{ ...onS2, trigger: { skillFired: 'burst' } }], [s2Attack], /skillFired/);
    fails([], [{ ...s2Attack, stat: 'critRate', delayFrames: 3 }], /cannot have delayFrames/);
    fails([], [{ ...s2Attack, trigger: { everySeconds: PERIOD, cooldown: true, atStart: true } }], /carry or atStart/);
  });
});

describe('減らす操作（cooldownTimer の cut）', () => {
  /** cuts（フレーム → 引くフレーム数）を当てて、1 から frames − 1 まで回した発動 */
  const run = (long: number, cuts: Record<number, number>, frames: number) => {
    const tick = cooldownTimer(long);
    const out: number[] = [];
    for (let f = 1; f < frames; f++) if (tick(f, undefined, () => undefined, cuts[f])) out.push(f);
    return out;
  };

  it('repeats the period without cuts', () => {
    expect(run(589, {}, 2000)).toEqual([589, 1178, 1767]);
  });

  it('subtracts from the remaining, and counts the next period from the earlier fire', () => {
    // 100 に 54f 引く → 535。その次は 535 + 589
    expect(run(589, { 100: 54 }, 1200)).toEqual([535, 1124]);
  });

  it('fires on the next frame when the remaining drops to 0 or below, after the fire of the same frame', () => {
    // 500 で残り 89 から 100 引く → 501 に発動
    expect(run(589, { 500: 100 }, 1200)).toEqual([501, 1090]);
    // 589 の発動の後に引く（次は 1178 − 54）
    expect(run(589, { 589: 54 }, 1200)).toEqual([589, 1124]);
  });
});

describe('1 パス目の発動と窓（センチの単騎・仮の周期）', () => {
  const teamOf = (skill1: Effect[]) => fixedTeam([], 0, { slots: [fixedSlot(CENTI, def(skill1, [s2Attack]))] });
  const s2Starts = (sim: ReturnType<typeof runSimulation>) =>
    effectWindows(sim, 0, { resourceId: CENTI, skill: 'skill2', stat: 'attack' }).map((w) => w.start);
  const long = gameSecondsToFirstFrame(PERIOD);

  it('fires the cooldown timed on the period without reductions, from the frame after the fire', () => {
    const sim = runSimulation(teamOf([onS2]));
    const fires = Array.from({ length: Math.floor((sim.frames - 2) / long) }, (_, k) => (k + 1) * long);
    // 維持（5 秒）は周期より短いので窓は切れる
    expect(s2Starts(sim)).toEqual(fires.map((f) => f + 1));
    // S2 を発動した時の timed も同じフレームから 1 秒
    expect(effectWindows(sim, 0, { resourceId: CENTI, skill: 'skill1', stat: 'attackDamage' })).toEqual(
      fires.map((f) => ({ start: f + 1, end: f + 1 + gameSecondsToFrames(1) })),
    );
  });

  it('pulls the fires earlier by 9.16% of the period on every full charge shot', () => {
    const sim = runSimulation(teamOf([cut, onS2]));
    const shots = new Set(sim.shots[0]!.frames);
    const tick = cooldownTimer(long);
    const amount = gameSecondsToFrame((PERIOD * 9.16) / 100);
    const fires: number[] = [];
    for (let f = 1; f < sim.frames - 1; f++)
      if (tick(f, undefined, () => undefined, shots.has(f) ? amount : undefined)) fires.push(f);
    expect(fires.length).toBeGreaterThan(Math.floor(sim.frames / long));
    expect(s2Starts(sim)).toEqual(fires.map((f) => f + 1));
    // 命中で残りが 0 以下になった回は、発の次のフレームに発動する
    expect(fires.some((f) => shots.has(f - 1))).toBe(true);
  });
});
