// アスカ：WILLE（835）を含む編成（plan/design-asuka-wille.md。V-0781）。語彙は skills/__tests__/asukaWille.test.ts。ここでは味方と組んだ時に:
// バーストの殲滅態勢は 00.00 の 1f 前から 9 秒、その間だけ 10 発ごとのダメージとアンチA.T.フィールド（敵に付く受けるダメージ▲）が出て、
// 殲滅態勢が終わると残弾が 0 になり、5f 後に殲滅（スタックの数だけの追加ダメージ）が出てアンチA.T.フィールドが外れる。込め直しの後の
// 立ち上げ速度▼の 3 秒は 1 秒に 1 発で、その間の発は立ち上がりに数えない。
import { describe, expect, it } from 'vitest';
import { hexagonFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { ENEMY } from '../skills/holders/types.ts';
import { gameSecondsToFrames } from '../time.ts';
import { fixedTeam, skillValueOf } from './teamHelpers.ts';

const ASUKA = 835;

const TEAMS = {
  'I-DOLL・フラワー + デルタ + アスカ：WILLE（V-0781 の編成）': fixedTeam([304, 20, ASUKA], 2),
  '実戦寄り（リター + クラウン + アスカ：WILLE + アリス + 紅蓮）': fixedTeam([82, 330, ASUKA, 191, 222], 2),
};

const STATE_FRAMES = gameSecondsToFrames(skillValueOf(ASUKA, 'burst', 8));
const ANNIHILATION_DELAY = 5;

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const a = input.slots.findIndex((s) => s?.character.resourceId === ASUKA);
  const plan = planTeamRun(input);
  const allStates = itemsOf(plan.history, { holder: a, state: 'annihilationState' });
  // 戦闘の終わりで切れた窓は、終わりの効果を比べない
  const states = allStates.filter((w) => w.end < plan.frames);
  const fields = itemsOf(plan.history, { holder: ENEMY, state: 'antiATField' });
  const hits = plan.skillHits.filter((h) => h.slotIndex === a);
  const shots = plan.shots[a]!.frames;
  const inState = (f: number) => allStates.some((w) => w.start <= f && f < w.end);

  it('applies Annihilation State for 9 s from 1 frame before each Full Burst start mark of her burst', () => {
    const mine = plan.schedule!.activations.filter((x) => x.slotIndex === a);
    expect(states.length).toBeGreaterThan(0);
    for (const w of states) {
      expect(w.end - w.start).toBe(STATE_FRAMES);
      expect(mine.some((x) => hexagonFrameOf(x) - 1 === w.start)).toBe(true);
    }
  });

  it('adds Anti A.T. Field stacks and the 10-shot damage only from shots in Annihilation State', () => {
    const tenShot = hits.filter((h) => h.effect.source.skill === 'skill1' && h.effect.multiplier < 1);
    expect(tenShot.length).toBeGreaterThan(0);
    // ヒットは届いた発の 3f 後（C-1266）
    for (const h of tenShot) {
      expect(shots).toContain(h.frame - 3);
      expect(inState(h.frame - 3)).toBe(true);
    }
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) expect(inState(f.start - 1)).toBe(true);
  });

  it('fires Annihilation 5 frames after the state ends with the stacks on the enemy, then removes Anti A.T. Field', () => {
    const annihilations = hits.filter((h) => h.effect.source.skill === 'burst');
    for (const w of states) {
      const at = w.end + ANNIHILATION_DELAY;
      const stacks = Math.max(0, ...fields.filter((f) => f.start <= at && at < f.end).map((f) => f.stack ?? 1));
      const hit = annihilations.find((h) => h.frame === at);
      if (stacks === 0) {
        expect(hit).toBeUndefined();
        continue;
      }
      expect(hit!.stacks).toBe(stacks);
      // 消すのはヒットの判定の後（次のフレームから付いていない）
      expect(fields.some((f) => f.start <= at + 1 && at + 1 < f.end)).toBe(false);
    }
    expect(annihilations.length).toBeGreaterThan(0);
  });

  it('empties the ammo when the state ends', () => {
    const drains = plan.instants.filter((i) => i.slotIndex === a && i.effect.kind === 'ammoDecrease');
    for (const w of states) expect(drains.some((d) => d.frame === w.end)).toBe(true);
  });

  // 実戦寄りの編成はクラウンのリロード速度▲が重なるので、V-0781 の編成だけで見る
  it.runIf(name.includes('V-0781'))(
    'fires at the base rate during the 3 s ramp-up down, then ramps up from the start (V-0781)',
    () => {
      const spinDown = gameSecondsToFrames(skillValueOf(ASUKA, 'skill2', 4));
      for (const w of states) {
        const after = shots.filter((f) => f > w.end);
        const inside = after.filter((f) => f < w.end + spinDown);
        // ▼の窓の後の 1 発目も、▼の間の発を数えないので最初のレート（1 秒に 1 発）。その次から、マガジンの初めの立ち上がり
        // （2 発目の間 23f）と同じ
        const first = after[inside.length]!;
        const next = after[inside.length + 1]!;
        const ramp = [...inside, first];
        expect(inside.length).toBeGreaterThan(0);
        ramp.slice(1).forEach((f, k) => expect(f - ramp[k]!).toBeGreaterThanOrEqual(58));
        expect(next - first).toBeLessThan(30);
      }
    },
  );
});
