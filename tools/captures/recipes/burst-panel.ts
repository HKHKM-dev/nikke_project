// レシピ burst-panel: 右のバースト欄の表示の時刻（I・II の六角形の替わり目、III のタイマーの 00.00、段ごとの CT の明け）を
// 観測値にする（plan/design-burst-panel-recipe.md）。欄を全フレーム切り出して特徴をキャッシュし（burst-panel@<版>.tsv）、
// 事象は burst-panel-lib.ts で決める。欄を左に出した録画（guide.md「バーストの欄の左右」）には使わない。
import { cropFilter, rawFrames } from '../ffmpeg.ts';
import {
  BAR_BOX,
  CT_END_LEAD_MAX,
  FACE_BOX,
  HEXAGON_BOX,
  PANEL_CROP,
  WHITE_MIN,
  formatPanelTsv,
  isMagenta,
  panelEvents,
  parsePanelTsv,
  type PanelRow,
  type StageChange,
} from './burst-panel-lib.ts';
import { derived } from './cache.ts';
import { observation, type Recipe, type RecipeObservation } from './types.ts';

const VERSION = 2;
/** 特徴のキャッシュの名前（特徴の測り方を変えたら上げる） */
const CACHE_KEY = 'burst-panel@1';

async function measure(video: string): Promise<string> {
  const { x: X, y: Y, w: W, h: H } = PANEL_CROP;
  const args = ['-v', 'error', '-i', video, '-vf', cropFilter(PANEL_CROP), '-fps_mode', 'passthrough'];
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const rows: PanelRow[] = [];
  let frame = 0;
  for await (const buf of rawFrames(args, W * H * 3)) {
    const at = (x: number, y: number) => ((y - Y) * W + (x - X)) * 3;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = HEXAGON_BOX.y0; y < HEXAGON_BOX.y1; y++)
      for (let x = HEXAGON_BOX.x0; x < HEXAGON_BOX.x1; x++) {
        const i = at(x, y);
        r += buf[i]!;
        g += buf[i + 1]!;
        b += buf[i + 2]!;
        n++;
      }
    let magenta = 0;
    for (let y = BAR_BOX.y0; y < BAR_BOX.y1; y++)
      for (let x = BAR_BOX.x0; x < BAR_BOX.x1; x++) {
        const i = at(x, y);
        if (isMagenta(buf[i]!, buf[i + 1]!, buf[i + 2]!)) magenta++;
      }
    let white = 0;
    let other = 0;
    let otherSum = 0;
    for (let y = FACE_BOX.y0; y < FACE_BOX.y1; y++)
      for (let x = FACE_BOX.x0; x < FACE_BOX.x1; x++) {
        const i = at(x, y);
        const p0 = buf[i]!;
        const p1 = buf[i + 1]!;
        const p2 = buf[i + 2]!;
        if (Math.min(p0, p1, p2) > WHITE_MIN) white++;
        else {
          other++;
          otherSum += (p0 + p1 + p2) / 3;
        }
      }
    rows.push({
      frame,
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
      magenta,
      white,
      dim: other === 0 ? 0 : Math.round((otherSum / other) * 10) / 10,
    });
    frame++;
  }
  return formatPanelTsv(rows);
}

/** 替わり目ごとの白い光り（前の色の最後の次 → 新しい色の最初）の長さ */
function gaps(changes: readonly StageChange[]): string {
  return changes.map((c) => c.firstColor - c.frame).join('・');
}

export const burstPanel: Recipe = {
  name: 'burst-panel',
  version: VERSION,
  describe:
    '右のバースト欄の I → II・II → III の六角形の替わり目、III のタイマーの 00.00、I・II・III の段の CT の明けのフレーム（timing。事象のある件だけ）',
  options: {},
  async run(ctx) {
    const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
    const text = await derived(ctx.derivedDir, CACHE_KEY, ctx.video, sha, () => measure(ctx.video), ctx.log);
    const ev = panelEvents(parsePanelTsv(text));
    const how = `欄（${PANEL_CROP.x},${PANEL_CROP.y} から ${PANEL_CROP.w}×${PANEL_CROP.h}）のフレームごとの特徴（キャッシュ ${CACHE_KEY}）。`;
    const out: RecipeObservation[] = [];
    const change = (list: readonly StageChange[], from: string, to: string) => {
      if (list.length === 0) return;
      out.push(
        observation(
          this,
          'timing',
          list.map((c) => c.frame),
          `右のバースト欄の六角形が ${from} から ${to} に替わったフレーム（${from} の色の最後のフレームの次）`,
          `${how}${to} の色が出るまでの読めないフレーム（白い光り）: ${gaps(list)}f`,
          { unit: 'f' },
        ),
      );
    };
    change(ev.oneToTwo, 'I', 'II');
    change(ev.twoToThree, 'II', 'III');
    if (ev.fullBurst.length > 0)
      out.push(
        observation(
          this,
          'timing',
          ev.fullBurst,
          '右のバースト欄の III のタイマーが 00.00 になったフレーム（フルバーストの始まり。バーの行が紫になった最初のフレーム）',
          `${how}II → III の替わり目の後、最初にバーの行の紫の画素が 100 以上になったフレーム`,
          { unit: 'f' },
        ),
      );
    const next = ['I → II の替わり目', 'II → III の替わり目', '00.00'];
    ev.ctEnd.forEach((frames, i) => {
      if (frames.length === 0) return;
      const s = ['I', 'II', 'III'][i]!;
      const other = ev.ctEndOther[i]!;
      out.push(
        observation(
          this,
          'timing',
          frames,
          `右のバースト欄の ${s} の段の顔（候補の 1 人目）の CT の秒の表示が消えたフレーム（CT の明け）のうち、` +
            `${next[i]}の ${CT_END_LEAD_MAX}f 前までにあるもの（CT が律速の発動の明け）`,
          `${how}顔の枠の白以外の明るさが上がり、前の 2 フレームに秒の字（白の画素）があったフレーム（顔が動く形を除く）。` +
            `${next[i]}の前にない候補（ゲージを待つ間の明けなど。偽物が混ざるので画で確かめる）: ` +
            `${other.length === 0 ? 'なし' : other.map((f) => `f${f}`).join('・')}`,
          { unit: 'f' },
        ),
      );
    });
    return out;
  },
};
