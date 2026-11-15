// 1 パス目の { counterFull } のきっかけのヒットのゲージ（frame/firstPass/counterGauges.ts。plan/design-mihara-bc-gauge.md 3 節。V-0761・C-1197）を、
// 作り手を直接呼んで境目で見る。定義はミハラ：ボンディングチェーン（162）の S1 を、確かめる形に書き換えて使う。件の一覧は、カウンタが上限に
// 届いた発火のフレームと敵の状態だけを返す形に差し替える
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BurstActivation } from '../../burst/schedule.ts';
import { effectHitFrames, perCountFrames, resolveDamageEffects } from '../../skills/burstDamage.ts';
import { counterMax, type CounterId } from '../../skills/counters.ts';
import type { HolderLists } from '../../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import type { TimelineSlot } from '../../skills/timeline.ts';
import type { FrameEvents } from '../../skills/triggers.ts';
import { parseSkillDefinition } from '../../skills/types.ts';
import type { CharacterData } from '../../types.ts';
import { latestDotTicks } from '../dot.ts';
import { createCounterGauges } from '../firstPass/counterGauges.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type RawEffect = Record<string, unknown>;
type RawDefinition = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: RawEffect[] }> };

const MIHARA_BC = 162;
const mihara = readJson<CharacterData>(`../../../data/characters/${MIHARA_BC}.json`);
const raw = readJson<RawDefinition>(`../../../data/skills/${MIHARA_BC}.json`);
const CHAINS = raw.skills.skill1.effects.findIndex((e) => e.kind === 'dot');
const STACK_UP = raw.skills.skill2.effects.findIndex((e) => e.kind === 'stackChange');
const COUNTER: CounterId = 'restraintChains';
/** チェーンバインドの刻みの間隔（162.json の tickIntervalFrames） */
const INTERVAL = raw.skills.skill1.effects[CHAINS]!.tickIntervalFrames as number;
const ENERGY = 1000;

type Run = {
  /** カウンタが上限に届いた発火のフレーム（件の一覧の counterFullFiresAt が真を返す） */
  fires: number[];
  frames: number;
  /** バーストの使用（チェーンバインドの消去のきっかけ）の出来事のフレーム */
  burstUses?: number[];
  /** フルバーストの開始の出来事のフレーム（スタック量▲のきっかけを fullBurstStart に替えた定義で使う） */
  fullBurstStarts?: number[];
  /** 敵がチェーンバインドの状態か（スタック量▲の条件 enemyState） */
  enemyState?: boolean;
};

function eventAt(f: number, run: Run): FrameEvents {
  return {
    frame: f,
    shots: [null],
    activations: [],
    burstEffects: (run.burstUses ?? []).includes(f) ? [{ slotIndex: 0 } as BurstActivation] : [],
    fullBurstStart: (run.fullBurstStarts ?? []).includes(f),
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: [false],
  };
}

type CounterGaugesInput = Parameters<typeof createCounterGauges>[0];
/** 書き換えた定義で作り手を作り、フレーム 0 から frames − 1 までの終わりに countCounterGauges を呼ぶ（frame/firstPass.ts の手順と同じ） */
function runGauges(run: Run, patch: (def: RawDefinition) => void = () => {}) {
  const copy = structuredClone(raw);
  patch(copy);
  const definition = parseSkillDefinition(copy);
  const slot = { character: mihara, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 0 } as TimelineSlot;
  const queried: CounterId[] = [];
  const lists = {
    counterFullFiresAt: (holder: number, counter: CounterId, frame: number) => {
      queried.push(counter);
      return holder === 0 && run.fires.includes(frame);
    },
    enemyStateAt: () => run.enemyState ?? true,
  } as unknown as HolderLists;
  const reserved: { frame: number; energy: number }[] = [];
  // 作り手が分割代入で読む欄だけを渡す（欄ごとの型は検査する）
  const input: Pick<
    CounterGaugesInput,
    'burstModel' | 'damageEffects' | 'frames' | 'hitGaugeEnergy' | 'lists' | 'options' | 'reserveGauge' | 'slots'
  > = {
    burstModel: 'fixed',
    damageEffects: [resolveDamageEffects(definition, mihara, MAX_SKILL_LEVELS)],
    frames: run.frames,
    hitGaugeEnergy: () => ENERGY,
    lists,
    options: { frames: run.frames, burst: false },
    reserveGauge: (frame: number, energy: number) => void reserved.push({ frame, energy }),
    slots: [slot],
  };
  const gauges = createCounterGauges(input as CounterGaugesInput);
  for (let f = 0; f < run.frames; f++) gauges.countCounterGauges(f, gauges.trackCounterEvents ? eventAt(f, run) : null);
  const framesOf = (kind: 'attack' | 'apply' | 'tick') =>
    gauges.counterGauges.filter((g) => g.kind === kind).map((g) => g.frame);
  return { ...gauges, reserved, queried, framesOf };
}

/** 発火のフレームごとの付けるフレーム（2 パス目の planSkillHits と同じ perCountFrames） */
function appliesOf(fires: number[], frames: number): number[] {
  const chains = raw.skills.skill1.effects[CHAINS]!;
  const step = { frames: chains.perCountIntervalFrames as number, delay: chains.delayFrames as number };
  return fires.flatMap((fire) => perCountFrames(fire, counterMax(COUNTER), step, frames));
}

/** 2 パス目（latestDotTicks）の刻みのうち、付けるフレームと重ならないもの（刻みのゲージを予約するフレーム） */
function secondPassTicks(applies: number[], frames: number, interval: number, cancels: number[] = []): number[] {
  return latestDotTicks(applies, frames, Number.POSITIVE_INFINITY, interval, cancels).map((t) => t.frame);
}

const withChains = (patch: RawEffect) => (def: RawDefinition) => {
  def.skills.skill1.effects[CHAINS] = { ...def.skills.skill1.effects[CHAINS], ...patch };
};

describe('counterGauges: 攻撃と付けた時のヒット', () => {
  it('reserves one hit per chain on the frames of the second pass, counting up to the cap of the trigger counter', () => {
    const frames = 600;
    const r = runGauges({ fires: [1], frames });
    const definition = parseSkillDefinition(raw);
    const attack = resolveDamageEffects(definition, mihara, MAX_SKILL_LEVELS).find(
      (e) => e.source.skill === 'skill1' && e.gaugePerHit !== undefined,
    )!;
    // ヒットの数はきっかけのカウンタの上限（読み込みが perCount を同じカウンタに限る）
    expect(r.framesOf('attack')).toEqual(effectHitFrames(attack, 1, counterMax(COUNTER), frames));
    expect(r.framesOf('attack')).toHaveLength(counterMax(COUNTER));
    expect(r.framesOf('apply')).toEqual(appliesOf([1], frames));
    expect(new Set(r.queried)).toEqual(new Set([COUNTER]));
    // 予約はどれも射手の 1 ヒットぶんで、記録と予約が同じ列
    expect(r.counterGauges.every((g) => g.energy === ENERGY && g.slotIndex === 0)).toBe(true);
    expect(r.reserved).toEqual(r.counterGauges.map(({ frame, energy }) => ({ frame, energy })));
  });

  it('drops the hits from the end of battle on (a fire at the last frame reserves nothing)', () => {
    const frames = 100;
    const r = runGauges({ fires: [1, frames], frames });
    expect(r.framesOf('attack').at(-1)).toBeLessThan(frames);
    expect(r.framesOf('apply')).toEqual(appliesOf([1], frames));
    expect(r.framesOf('tick')).toEqual(secondPassTicks(appliesOf([1], frames), frames, INTERVAL));
    expect(Math.max(...r.counterGauges.map((g) => g.frame))).toBeLessThan(frames);
  });

  it('does not charge on application without gaugeOnApply, but still restarts the ticks there', () => {
    const frames = 600;
    const r = runGauges({ fires: [1], frames }, withChains({ gaugeOnApply: undefined }));
    expect(r.framesOf('apply')).toEqual([]);
    expect(r.framesOf('tick')).toEqual(secondPassTicks(appliesOf([1], frames), frames, INTERVAL));
  });
});

describe('counterGauges: 刻み（halfAfterLatest）', () => {
  it('ticks from the latest application like the second pass', () => {
    const frames = 600;
    const r = runGauges({ fires: [1], frames });
    const applies = appliesOf([1], frames);
    const last = applies.at(-1)!;
    expect(r.framesOf('tick').slice(0, 3)).toEqual([last + 30, last + 89, last + 148]);
    expect(r.framesOf('tick')).toEqual(secondPassTicks(applies, frames, INTERVAL));
  });

  it('skips a tick that falls on the next application frame (the application restarts the ticks)', () => {
    // 間隔 30f は、最初の刻み（付けた 15f 後）が次の付けるフレームちょうどに来る
    const frames = 300;
    const r = runGauges({ fires: [1], frames }, withChains({ tickIntervalFrames: 30 }));
    const applies = appliesOf([1], frames);
    for (const a of applies.slice(1)) expect(r.framesOf('tick')).not.toContain(a);
    expect(r.framesOf('tick')).toEqual(secondPassTicks(applies, frames, 30));
    expect(r.framesOf('tick').slice(0, 3)).toEqual([applies.at(-1)! + 15, applies.at(-1)! + 45, applies.at(-1)! + 75]);
  });

  it('keeps the tick on the cancel frame and stops after it until the next application', () => {
    const frames = 700;
    const applies = appliesOf([1, 400], frames);
    const last = appliesOf([1], frames).at(-1)!;
    const ticks = secondPassTicks(applies, frames, INTERVAL);
    const second = last + 89;
    // 消去のフレームちょうどの刻みは出る
    const onCancel = runGauges({ fires: [1, 400], frames, burstUses: [second] });
    expect(onCancel.framesOf('tick')).toEqual(secondPassTicks(applies, frames, INTERVAL, [second]));
    expect(onCancel.framesOf('tick')).toContain(second);
    expect(onCancel.framesOf('tick')).not.toContain(last + 148);
    // 消去が 1f 前なら、その刻みも出ない
    const before = runGauges({ fires: [1, 400], frames, burstUses: [second - 1] });
    expect(before.framesOf('tick')).toEqual(secondPassTicks(applies, frames, INTERVAL, [second - 1]));
    expect(before.framesOf('tick')).not.toContain(second);
    // 次の発火で付けた後は、また刻む
    expect(before.framesOf('tick').filter((f) => f > 400)).toEqual(ticks.filter((f) => f > 400));
  });

  describe('スタック量▲での付け直し', () => {
    // S2 のスタック量▲のきっかけ（通常攻撃の命中の回数）を、出来事 1 つで起こせるフルバーストの開始に替える
    const upOnFullBurstStart = (def: RawDefinition) => {
      def.skills.skill2.effects[STACK_UP] = { ...def.skills.skill2.effects[STACK_UP], trigger: 'fullBurstStart' };
    };
    const frames = 500;
    const last = appliesOf([1], frames).at(-1)!;

    it('restarts the ticks at the stack up when the enemy is in the state, and ignores it otherwise', () => {
      const up = last + 60;
      const on = runGauges({ fires: [1], frames, fullBurstStarts: [up] }, upOnFullBurstStart);
      expect(on.framesOf('tick').slice(0, 3)).toEqual([last + 30, up + 30, up + 89]);
      expect(on.framesOf('tick')).toEqual(secondPassTicks([...appliesOf([1], frames), up], frames, INTERVAL));
      const off = runGauges({ fires: [1], frames, fullBurstStarts: [up], enemyState: false }, upOnFullBurstStart);
      expect(off.framesOf('tick')).toEqual(secondPassTicks(appliesOf([1], frames), frames, INTERVAL));
    });

    it('still reserves a tick on the frame of the stack up (the first pass knows it one frame late)', () => {
      // フレーム f の終わりに f + 1 の刻みを予約するので、f + 1 の▲より先に予約が済む。2 パス目はこの刻みを出さない。▲はフルバーストの
      // 中だけで、バーストの状態機械はフルバーストの中のゲージを足さないので、時刻表には効かない（設計書 3 節）
      const up = last + 89;
      const r = runGauges({ fires: [1], frames, fullBurstStarts: [up] }, upOnFullBurstStart);
      expect(r.framesOf('tick').slice(0, 3)).toEqual([last + 30, up, up + 30]);
      expect(secondPassTicks([...appliesOf([1], frames), up], frames, INTERVAL)).not.toContain(up);
    });
  });
});

describe('counterGauges: 追えない形は作る時に落とす', () => {
  it('needs a tick interval whose first tick is at least 1 frame after the application', () => {
    // 最初の刻みは付けた round(0.5 × 間隔) 後。0 になると、フレームごとの判定（f + 1 の刻み）に掛からない
    expect(() => runGauges({ fires: [1], frames: 10 }, withChains({ tickIntervalFrames: 0.9 }))).toThrow(
      /tick interval of 1 frame or more, got 0.9/,
    );
    const frames = 200;
    const r = runGauges({ fires: [1], frames }, withChains({ tickIntervalFrames: 1 }));
    const applies = appliesOf([1], frames);
    expect(r.framesOf('tick')[0]).toBe(applies[0]! + 1);
    expect(r.framesOf('tick')).toEqual(secondPassTicks(applies, frames, 1));
  });

  it('rejects a dot state with gauge that mixes { counterFull } and another trigger', () => {
    // 同じ状態の dot の刻みは 1 つの列なので、ほかのきっかけで付けた分を追えない
    const mixed = (def: RawDefinition) => {
      const chains = { ...def.skills.skill1.effects[CHAINS]!, gaugeOnTick: undefined };
      def.skills.skill1.effects[CHAINS] = chains;
      def.skills.skill1.effects.push({
        ...chains,
        trigger: 'battleStart',
        perCount: undefined,
        perCountIntervalFrames: undefined,
        delayFrames: undefined,
        gaugeOnApply: undefined,
      });
    };
    expect(() => runGauges({ fires: [1], frames: 10 }, mixed)).toThrow(
      /mixes \{ counterFull \} and other triggers \(not implemented\)/,
    );
  });
});
