// きっかけ allyBurstUse（味方（自分を含む編成のどの枠）がバーストスキルを使った時。plan/design-rupee-ws.md 2.1 節）の発火と、
// ルピー：ウィンターショッパー（203）の定義の読み込みと Lv ごとの解決値
import { describe, expect, it } from 'vitest';
import type { BurstActivation } from '../../burst/schedule.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS, resolveStateContents, resolveStateGrants, resolveTimed } from '../resolve.ts';
import { createTriggerTracker, type FrameEvents } from '../triggers.ts';

const RUPEE_WS = 203;

const activation = (slotIndex: number, frame: number): BurstActivation => ({
  frame,
  step: 'Step1',
  slotIndex,
  startsFullBurst: false,
  enteredStep: null,
});

const frame = (f: number, burstEffects: BurstActivation[] = []): FrameEvents => ({
  frame: f,
  shots: [],
  activations: burstEffects,
  burstEffects,
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [],
});

describe('トリガー allyBurstUse の発火', () => {
  it('fires on the effect frame of a Burst of any slot, including its own, once per frame', () => {
    const fires = (slotIndex: number) => {
      const tracker = createTriggerTracker('allyBurstUse', slotIndex, 'dynamic');
      return [
        frame(0),
        frame(100, [activation(0, 100)]),
        frame(128, [activation(1, 128)]),
        frame(150),
        // 同じフレームに 2 つの発動の効果が重なっても 1 回
        frame(200, [activation(2, 200), activation(3, 200)]),
      ]
        .filter((ev) => tracker(ev))
        .map((ev) => ev.frame);
    };
    expect(fires(0)).toEqual([100, 128, 200]);
    expect(fires(3)).toEqual([100, 128, 200]);
  });

  it('differs from burstUse, which fires only on its own Burst', () => {
    const tracker = createTriggerTracker('burstUse', 0, 'dynamic');
    const fired = [frame(100, [activation(0, 100)]), frame(128, [activation(1, 128)])]
      .filter((ev) => tracker(ev))
      .map((ev) => ev.frame);
    expect(fired).toEqual([100]);
  });
});

describe('ルピー：ウィンターショッパーの定義', () => {
  const def = parseSkillDefinition(rawDefinition(RUPEE_WS));
  const character = characterOf(RUPEE_WS);

  it('reads Shopping as a state on all allies granted by allyBurstUse, and the gauge speed up as gated on full stacks', () => {
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'state',
      state: 'shopping',
      trigger: 'allyBurstUse',
      target: 'allies',
    });
    expect(def.skills.skill2.effects[1]).toMatchObject({
      kind: 'timed',
      trigger: 'fullBurstEnd',
      target: 'allies',
      stat: 'burstGaugeSpeed',
      condition: { selfState: { state: 'shopping', stacks: 'full' } },
    });
    expect(def.skills.burst.effects[0]).toMatchObject({ kind: 'burstReentry', step: 'Step1' });
  });

  it.each([
    [MAX_SKILL_LEVELS, { defense: 0.0133, gauge: 0.079, reload: 0.6317 }],
    [
      { skill1: 1, skill2: 1, burst: 1 },
      { defense: 0.0073, gauge: 0.0434, reload: 0.2074 },
    ],
  ] as const)(
    'resolves 4 stacks for 20 s of Shopping, and the gauge speed and reload speed ups (%o)',
    (levels, ratio) => {
      const [grant] = resolveStateGrants(def, character, levels);
      expect(grant).toMatchObject({ state: 'shopping', target: 'allies', trigger: 'allyBurstUse', maxStacks: 4 });
      expect(grant!.durationFrames).toBe(gameSecondsToFrames(20));
      const [content] = resolveStateContents(def, character, levels);
      expect(content).toMatchObject({ whileState: 'shopping', stat: 'defense', target: 'allies', maxStacks: 4 });
      expect(content!.value).toBeCloseTo(ratio.defense, 10);
      const timed = resolveTimed(def, character, levels);
      expect(timed.map((e) => [e.stat, e.trigger, e.target, e.durationFrames])).toEqual([
        ['burstGaugeSpeed', 'fullBurstEnd', 'allies', gameSecondsToFrames(5)],
        ['reloadSpeed', 'burstUse', 'allies', gameSecondsToFrames(10)],
      ]);
      expect(timed[0]!.value).toBeCloseTo(ratio.gauge, 10);
      expect(timed[1]!.value).toBeCloseTo(ratio.reload, 10);
    },
  );
});
