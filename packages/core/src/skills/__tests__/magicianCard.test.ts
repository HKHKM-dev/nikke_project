// 魔術師のカード編（plan/design-arcana-magician.md 2 節）: 状態の中身の「スキル N クールタイム X%▼」（skillCooldownDown）と、周期のきっかけの
// クールタイムの印（cooldown）の読み込み、クールタイムを縮める窓の規則（cooldownTimer。ドロシーの発現と共通）
import { describe, expect, it } from 'vitest';
import { cooldownTimer } from '../timeline.ts';
import { parseSkillDefinition } from '../types.ts';

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const def = (skill1: unknown[], skill2: unknown[] = []) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-11-10',
  skills: {
    skill1: skill1.length > 0 ? { effects: skill1 } : none,
    skill2: skill2.length > 0 ? { effects: skill2 } : none,
    burst: none,
  },
});
const card = (item: unknown, extra: Record<string, unknown> = {}) => ({
  kind: 'state',
  state: 'magician',
  trigger: 'fullBurstEnd',
  target: 'burstUsers',
  durationRef: 3,
  contents: [item],
  ...extra,
});
const down = { skillCooldownDown: { slot: 'skill2', percentRef: 2 } };
const s2 = (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: 'damage',
  trigger,
  ref: 2,
  damageType: 'skill',
  ...extra,
});

describe('読み込み', () => {
  it('parses skillCooldownDown in a state of an ally', () => {
    const parsed = parseSkillDefinition(def([card(down)]));
    expect(parsed.skills.skill1.effects[0]).toMatchObject({ contents: [down] });
  });

  it('rejects malformed items', () => {
    expect(() => parseSkillDefinition(def([card({ skillCooldownDown: { slot: 'burst', percentRef: 2 } })]))).toThrow(
      /slot/,
    );
    expect(() => parseSkillDefinition(def([card({ skillCooldownDown: { slot: 'skill2' } })]))).toThrow(/percentRef/);
    expect(() =>
      parseSkillDefinition(def([card({ skillCooldownDown: { slot: 'skill2', percentRef: 2, x: 1 } })])),
    ).toThrow(/unknown field/);
    expect(() => parseSkillDefinition(def([card({ ...down, stat: 'attack' })]))).toThrow(/unknown field/);
    expect(() => parseSkillDefinition(def([card(down, { maxStacks: 3 })]))).toThrow(/stacking grant/);
  });

  it('takes the cooldown mark on damage and burstGaugeHit timers (timed: plan/design-centi.md)', () => {
    const parsed = parseSkillDefinition(
      def(
        [],
        [
          s2({ everySeconds: 15, cooldown: true }, { delayFrames: 45 }),
          { kind: 'burstGaugeHit', trigger: { everySeconds: 15, cooldown: true }, delayFrames: 45 },
        ],
      ),
    );
    expect(parsed.skills.skill2.effects[0]).toMatchObject({ trigger: { everySeconds: 15, cooldown: true } });
  });

  it('rejects the cooldown mark in the shapes it does not cover', () => {
    const fails = (skill2: unknown[], re: RegExp) => expect(() => parseSkillDefinition(def([], skill2))).toThrow(re);
    fails([s2({ everySeconds: 15, cooldown: true, carry: true })], /carry or atStart/);
    fails(
      [s2({ everySeconds: 15, cooldown: true }, { periodShorten: { state: 'followUp', slot: 'skill2', ref: 3 } })],
      /periodShorten or gaugePerHit/,
    );
    fails(
      [s2({ everySeconds: 15, cooldown: true }, { gaugePerHit: true, delayFrames: 45 })],
      /periodShorten or gaugePerHit/,
    );
    fails([{ kind: 'burstGaugeHit', trigger: { everySeconds: 15, cooldown: true } }], /needs delayFrames/);
    fails(
      [
        {
          kind: 'heal',
          trigger: { everySeconds: 9, cooldown: true },
          target: 'allies',
          ref: 1,
        },
      ],
      /only allowed in damage, burstGaugeHit and timed/,
    );
    fails(
      [s2({ everySeconds: 15, cooldown: true }), s2({ everySeconds: 10, cooldown: true })],
      /the same everySeconds/,
    );
    fails([s2({ everySeconds: 15, cooldown: 1 })], /expected true/);
  });
});

describe('クールタイムを縮める窓（cooldownTimer）', () => {
  /** 窓 [start, end) の列で、1 から frames − 1 まで回した発火 */
  const run = (long: number, short: number, windows: [number, number][], frames: number) => {
    const tick = cooldownTimer(long);
    const out: number[] = [];
    for (let f = 1; f < frames; f++) {
      const started = windows.some(([s]) => s === f) ? short : undefined;
      if (tick(f, started, () => (windows.some(([s, e]) => s <= f && f < e) ? short : undefined))) out.push(f);
    }
    return out;
  };

  it('repeats the long period without windows', () => {
    expect(run(883, 221, [], 3000)).toEqual([883, 1766, 2649]);
  });

  it('counts the shortened period from the frame it is applied, and keeps the shortened period across the end', () => {
    // 1000 に付き、15 秒（883f）続く。1221・1442・1663 は窓の中、1884 は窓の外（窓の中の 1663 から縮めた周期）。その次は元の周期
    expect(run(883, 221, [[1000, 1883]], 3000)).toEqual([883, 1221, 1442, 1663, 1884, 2767]);
  });

  it('keeps an earlier original timing (the shorter of the two)', () => {
    // 1700 に付いた時、次の予定（1766）は 1700 + 221 より早いので、そのまま来る
    expect(run(883, 221, [[1700, 2583]], 3200)).toEqual(
      [883, 1766, 1987, 2208, 2429, 2650, 3533].filter((f) => f < 3200),
    );
  });

  it('reapplies the same rule when applied again inside the window (no change while the schedule is already short)', () => {
    expect(
      run(
        883,
        221,
        [
          [1000, 1883],
          [1300, 2183],
        ],
        3000,
      ),
    ).toEqual(run(883, 221, [[1000, 2183]], 3000));
  });
});
