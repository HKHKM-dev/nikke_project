// Stage 21-B: ゲーム内の秒の持続を、録画の実測と比べる（plan/design-stage21.md 3.4・5 節）。
// 録画 56（クラウン単騎 AUTO）の S2「攻撃ダメージ 20.99%▲・7 秒間」は、▲の付いた発の区間が 411f（056-04。前後の素の発と
// 1 フレームで接している 2・3 回目）。モデルでも、回復した発の次のフレームから 411f のあいだ▲が付く。
import { describe, expect, it } from 'vitest';
import { loadObservations, loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { buildTeamInput } from '../observations.ts';

const file = loadRecordingsFile();
const data = loadRecordsData(file);
const measured = loadObservations().find((o) => o.id === '056-04')!;

describe('録画 56: クラウンの S2 の 7 秒（056-04）', () => {
  const input = buildTeamInput(
    recordingMap(file).get('056')!,
    { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: false, condition: 'auto', midFarLanding: 'A' },
    data,
  );
  const plan = planTeamRun(input);
  const shots = plan.shots[0]!.frames;
  const windows = plan.timeline.windows.filter((w) => w.effect.stat === 'attackDamage');

  it('buffs the shots from the frame after the heal for 7 game seconds = 411f, as the clean readings of recording 56', () => {
    const clean = (measured.value as number[]).slice(1, 3);
    expect(clean).toEqual([411, 411]);
    expect(gameSecondsToFrames(7)).toBe(411);
    expect(windows.length).toBeGreaterThanOrEqual(5);
    for (const w of windows.filter((x) => x.end < plan.frames)) {
      expect(w.end - w.start).toBe(411);
      // 窓の直前のフレームが回復した発（素）で、窓の最初のフレームから▲が付く
      expect(shots).toContain(w.start - 1);
    }
    // MG が撃ち続けている窓（両端で 1 フレーム 1 発）では、▲の付いた最初の発から最後の発までが 411f（録画の読み方と同じ数え方）。
    // Stage 21-C3: スピンアップの途中で窓が明ける（端の間隔が 1f でない）窓は、録画でも境目が読めないので除く
    const spans = windows
      .filter((w) => w.end < plan.frames)
      .map((w) => {
        const inside = shots.filter((f) => f >= w.start && f < w.end);
        const touching = [w.start, w.end - 1, w.end].every((f) => shots.includes(f));
        return { span: inside.at(-1)! - inside[0]! + 1, touching };
      })
      .filter((x) => x.touching);
    expect(spans.length).toBeGreaterThanOrEqual(2);
    for (const x of spans) expect(x.span).toBe(clean[0]);
  });
});
