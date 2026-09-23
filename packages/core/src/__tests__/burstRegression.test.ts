// Stage 7: 射撃場の録画（18〜22、2026-09-22 撮影・3 分モード・自動バースト ON）に対する動的サイクルの回帰テスト。
// 実測は tools/captures/gauge.ts で BURST バーを読んだ値（plan/verification.md Stage 7 節）。
//
// 確定していること（厳しく固定する）:
//   - III が 1 体・全員 CT 40 秒の編成は、フルバーストが 180 秒で 5 回・40 秒周期（録画 18〜21）
//   - III がいない編成はフルバーストせず、II の後 600f でチェーンが切れてゲージが 0 に戻る（録画 22）
// ゲージ量は単騎の録画 13 本（2026-09-23）で較正した（burst/dynamic.ts の BURST_ENERGY_MULTIPLIER = 1.2、
// SG_PELLET_GAUGE_HIT_RATE = 0.75、フルチャージ倍率は操作キャラだけ）。1 回目の満タンまでの時間は、
// 較正前の −167f〜+163f から、録画 18・19・21 で −37f〜−2f、録画 22 で +61f まで縮んだ（設計書の目標 ±30f には届いていない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planDynamicSchedule } from '../burst/dynamic.ts';
import { summarizeSchedule } from '../burst/schedule.ts';
import { computeCadence } from '../cadence.ts';
import type { CharacterData } from '../types.ts';

function load(id: number): { character: CharacterData } {
  const path = new URL(`../../data/characters/${id}.json`, import.meta.url);
  return { character: JSON.parse(readFileSync(path, 'utf8')) as CharacterData };
}

const FRAMES = 180 * 60;
/** 1 回目の満タンまでの許容幅（フレーム）。録画 22（MG のスピンアップ + 操作 SR）だけ外れが大きいので別に持つ */
const FIRST_FILL_TOLERANCE = 40;
const FIRST_FILL_TOLERANCE_MG = 70;

type Recording = {
  name: string;
  ids: number[];
  /** 操作キャラの枠（録画で照準画面が出ていたニケ。18〜21 は III） */
  controlledSlot: number;
  /** 最初にゲージが増えてから満タンまで（実測、フレーム） */
  measuredFirstFill: number;
};

// エーテル（I・SG）+ デルタ（II・SR）+ III。録画 20（マナ）は S2 の「バーストゲージのチャージ速度▲」が
// 戦闘開始から乗っている。この表はスキル定義を読まない planDynamicSchedule を直接呼ぶので、マナの満タンまでの時間は
// Stage 8 でゲージ速度を入れた __tests__/stage8Team.test.ts（録画 20: 予測 270f / 実測 267f）で見る
const WITH_III: Recording[] = [
  { name: '録画 18（ラピ III）', ids: [291, 20, 10], controlledSlot: 2, measuredFirstFill: 427 },
  { name: '録画 19（ノワール III）', ids: [291, 20, 271], controlledSlot: 2, measuredFirstFill: 266 },
  { name: '録画 21（クイーン（真） III）', ids: [291, 20, 870], controlledSlot: 2, measuredFirstFill: 447 },
];

/** 最初の射撃のフレーム（録画側の「最初にゲージが増えたフレーム」に対応させる） */
function firstShotFrame(slots: { character: CharacterData }[]): number {
  return Math.min(...slots.map((s) => computeCadence(s.character.shot).firstShotFrames));
}

describe('録画 18〜21: III 1 体・CT 40 秒の編成', () => {
  for (const rec of WITH_III) {
    describe(rec.name, () => {
      const slots = rec.ids.map(load);
      const schedule = planDynamicSchedule(slots, FRAMES, undefined, undefined, rec.controlledSlot);
      const summary = summarizeSchedule(schedule, FRAMES);

      it('full-bursts 5 times in 180 s, 40 s apart', () => {
        expect(summary.fullBursts).toBe(5);
        const starts = schedule.fullBurstWindows.map((w) => w.start);
        for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(2400);
        expect(summary.chainTimeouts).toBe(0);
        expect(summary.fullBurstUptime).toBeCloseTo(5 / 18, 12);
      });

      it('fires I → II → III in slot order every cycle', () => {
        expect(schedule.activations.map((a) => a.slotIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
      });

      it(`fills the first gauge within ±${FIRST_FILL_TOLERANCE}f of the recording`, () => {
        const predicted = schedule.gaugeFullFrames[0]! - firstShotFrame(slots);
        expect(Math.abs(predicted - rec.measuredFirstFill)).toBeLessThanOrEqual(FIRST_FILL_TOLERANCE);
      });
    });
  }

  it('録画 20（マナ III）も回数と周期は同じ（ゲージ速度バフは CT 律速なので効かない）', () => {
    const schedule = planDynamicSchedule([291, 20, 290].map(load), FRAMES, undefined, undefined, 2);
    expect(summarizeSchedule(schedule, FRAMES).fullBursts).toBe(5);
  });
});

describe('録画 22: エマ：TU（I）+ デルタ（II）、III なし', () => {
  const slots = [93, 20].map(load);
  // 操作キャラはデルタ（照準画面に CHARGE / BURST 250% が出ている）
  const schedule = planDynamicSchedule(slots, FRAMES, undefined, undefined, 1);

  it('fills much more slowly when nobody is controlled (the full-charge ratio is lost on the AI SR)', () => {
    const ai = planDynamicSchedule(slots, FRAMES);
    expect(ai.gaugeFullFrames[0]!).toBeGreaterThan(schedule.gaugeFullFrames[0]! + 100);
  });

  it('never full-bursts and the chain keeps timing out after II', () => {
    expect(schedule.fullBurstWindows).toEqual([]);
    expect(schedule.chainTimeouts.length).toBeGreaterThanOrEqual(3);
    // 最後の発動（II）から 600f 後に切れる
    const first = schedule.chainTimeouts[0]!;
    const lastUse = Math.max(...schedule.activations.filter((a) => a.frame < first).map((a) => a.frame));
    expect(first - lastUse).toBe(600);
  });

  it(`fills the first gauge within ±${FIRST_FILL_TOLERANCE_MG}f of the recording`, () => {
    const predicted = schedule.gaugeFullFrames[0]! - firstShotFrame(slots);
    expect(Math.abs(predicted - 329)).toBeLessThanOrEqual(FIRST_FILL_TOLERANCE_MG);
  });
});
