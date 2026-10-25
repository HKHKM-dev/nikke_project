// リザルト画面の読み取り（plan/design-result-screen.md）。数字は読まず、探して切り出すまでが機械、読字は 2 セッションが独立に行う。
//   node tools/captures/result-screen.ts cut <録画 id>
//   node tools/captures/result-screen.ts merge <録画 id> [--readings a.json,b.json] [--source V-NNNN --write]
//
// cut: 戦闘の後の 2 枚の画面を探し、証拠フレームと読字の画像と読字の雛形を書き出す。
//   (a) TOTAL DAMAGE の画面（迎撃戦）: 赤い帯で探し、数字が止まった所を取る。無い録画（射撃場など）は (b) だけ
//   (b) 戦闘履歴のパネル: probe-result.ts と同じ判定。(a) の後の最初の区間（(a) が無ければ最後の区間）の中央
//   - 証拠フレーム: frames/<録画 id>_f<N>_result-total.jpg・_result-panel.jpg（Drive にも上げる）
//   - 読字の画像: derived/<録画 id>/result-screen/total.png（2 倍）・panel.png（合計交戦時間と枠の行を 3 倍にして縦に並べた）
//   - 雛形: 同じ所の reading-template.json（値はすべて null）
//   同じ録画からは同じフレーム・同じ画像になるので、2 人の読み手はそれぞれ cut を回してよい。
// 読字: 画像だけを見て雛形を埋め、reader に名札を書いて scratch/readings/<録画 id>-<名札>.json に置く（--readings-dir で変える）。
//   scratch/ は Drive で同期されるので、別のセッションの読みも届く。相手の読みのファイルは開かない。
// merge: 2 つの読みを欄ごとに比べ、両方が読めて同じ値の欄だけを観測値にする（標準出力に JSON）。不一致の欄は出さず、
//   一覧にして終了コード 2（それぞれが相手の値を見ずにその欄だけ読み直し、もう一度 merge を回す）。--write で
//   records/observations/<録画 id>.json に足す（採番と重複の扱いは read.ts と同じ。records-io.ts）。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { todayLocal } from '../../packages/core/src/records/predictions.ts';
import { capturesDir } from './dirs.ts';
import { cropFilter, ffprobe, rawFrames, writeStill, type Crop } from './ffmpeg.ts';
import { uploadFrame } from './frames-upload.ts';
import { existingVideoOf, loadRecording, prepareObservations, writeObservations } from './records-io.ts';
import {
  PANEL_CROP,
  PANEL_DETECT,
  PANEL_SLOTS,
  TIME_CROP,
  TOOL,
  TOTAL_CROP,
  TOTAL_PROBE,
  evidenceName,
  isPanel,
  isTotalScreen,
  measurePanel,
  measureTotal,
  mergeReadings,
  middleOf,
  parseReading,
  pickPanelRun,
  pickTotalFrame,
  readingTemplate,
  resultObservations,
  rowCrop,
  runsOf,
  scaleCrop,
  type TotalSample,
} from './result-screen-lib.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** 測る間隔（フレーム） */
const STEP = 3;
/** 読字の画像の幅（px） */
const SHEET_WIDTH = 1116;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    readings: { type: 'string' },
    'readings-dir': { type: 'string' },
    source: { type: 'string' },
    write: { type: 'boolean', default: false },
    'read-at': { type: 'string' },
  },
});

const [command, id] = positionals;
if ((command !== 'cut' && command !== 'merge') || !id) {
  console.error(
    'usage: node tools/captures/result-screen.ts cut <録画 id>\n' +
      '       node tools/captures/result-screen.ts merge <録画 id> [--readings a.json,b.json] [--source V-NNNN --write]',
  );
  process.exit(1);
}
const readingsDir = resolve(values['readings-dir'] ?? join(ROOT, 'scratch', 'readings'));
const recording = loadRecording(id);
const team = recording.team.map((m) => ({ slot: m.slot, name: m.name }));

if (command === 'cut') await cut();
else merge();

type Sample = TotalSample & { panel: boolean };

/**
 * 1 回のデコードで (a) と (b) の両方を測る。STEP おきのフレームを、(a) の測る範囲（TOTAL_PROBE の大きさ）の下に (b) の縮小
 * （PANEL_DETECT の大きさ）を左寄せで並べた 1 枚にして受け取る
 */
async function scan(video: string, probeCrop: Crop): Promise<Sample[]> {
  const { w, h } = TOTAL_PROBE;
  const { w: pw, h: ph } = PANEL_DETECT;
  const graph = [
    `[0]select='not(mod(n,${STEP}))',split=2[a][b]`,
    `[a]${cropFilter(probeCrop)},scale=${w}:${h}[t]`,
    `[b]scale=${pw}:${ph},pad=${w}:${ph}[p]`,
    `[t][p]vstack=inputs=2,format=rgb24`,
  ].join(';');
  const args = ['-v', 'error', '-i', video, '-filter_complex', graph, '-fps_mode', 'vfr', '-f', 'rawvideo', '-'];
  const samples: Sample[] = [];
  let prev: Uint8Array | null = null;
  let index = 0;
  for await (const buf of rawFrames(args, w * (h + ph) * 3)) {
    const top = Uint8Array.from(buf.subarray(0, w * h * 3));
    const small = new Uint8Array(pw * ph * 3);
    for (let y = 0; y < ph; y++) small.set(buf.subarray((h + y) * w * 3, ((h + y) * w + pw) * 3), y * pw * 3);
    const f = measureTotal(top, prev);
    samples.push({
      frame: index * STEP,
      total: isTotalScreen(f),
      changed: f.changed,
      panel: isPanel(measurePanel(small)),
    });
    prev = top;
    index += 1;
  }
  return samples;
}

/** 読むフレームを 1 回のデコードで PNG に取り出す（フレームごとに writeStill すると、そのたびに先頭からデコードし直す） */
function grab(video: string, frames: readonly number[], dir: string): Map<number, string> {
  const sorted = [...new Set(frames)].sort((x, y) => x - y);
  const select = sorted.map((f) => `eq(n,${f})`).join('+');
  const pattern = join(dir, 'grab-%d.png');
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', video, '-vf', `select='${select}'`, '-fps_mode', 'vfr', '-y', pattern],
    {
      stdio: 'inherit',
    },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed grabbing frames ${sorted.join('・')} of ${video}`);
  const out = new Map<number, string>();
  sorted.forEach((f, i) => {
    const png = join(dir, `f${f}.png`);
    renameSync(join(dir, `grab-${i + 1}.png`), png);
    out.set(f, png);
  });
  return out;
}

/** 1 フレームから crops（2 つ以上）を切り出し、幅をそろえて縦に並べた 1 枚を書く */
function writeSheet(video: string, frame: number, crops: readonly Crop[], out: string): void {
  const labels = (p: string) => crops.map((_, i) => `[${p}${i}]`).join('');
  const graph = [
    `[0]select='eq(n,${frame})',split=${crops.length}${labels('s')}`,
    ...crops.map((c, i) => `[s${i}]${cropFilter(c)},scale=${SHEET_WIDTH}:-2:flags=lanczos[c${i}]`),
    `${labels('c')}vstack=inputs=${crops.length}`,
  ].join(';');
  const args = ['-v', 'error', '-i', video, '-filter_complex', graph, '-fps_mode', 'vfr', '-frames:v', '1', '-y', out];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed writing ${out} (frame ${frame} of ${video})`);
}

async function cut(): Promise<void> {
  const video = existingVideoOf(recording);
  const probe = ffprobe(video);
  const scale = (c: Crop) => scaleCrop(c, probe.width, probe.height);
  const samples = await scan(video, scale(TOTAL_PROBE));

  const totalRuns = runsOf(samples, (s) => s.total);
  const totalFrame = pickTotalFrame(samples);
  if (totalRuns.length === 0) console.log('TOTAL DAMAGE の画面は無い（戦闘履歴のパネルだけ出す）');
  else {
    console.log(`TOTAL DAMAGE の画面: ${totalRuns.map((r) => `f${r.from}..${r.to}`).join('・')}`);
    if (totalFrame === null) console.log('注意: TOTAL DAMAGE の数字が止まった所が無い（(a) は出さない）');
    else console.log(`  数字が止まった所の中央: f${totalFrame}`);
  }
  const panelRuns = runsOf(samples, (s) => s.panel);
  console.log(`戦闘履歴のパネル: ${panelRuns.map((r) => `f${r.from}..${r.to}`).join('・') || '無い'}`);
  const { run, warning } = pickPanelRun(panelRuns, totalFrame);
  if (warning) console.log(`注意: ${warning}`);
  if (run === null) {
    console.error('戦闘履歴のパネルが見つからないので止める');
    process.exit(1);
  }
  const panelFrame = middleOf(run);
  console.log(`  区間の中央: f${panelFrame}`);

  const dir = join(capturesDir(), 'derived', id!, 'result-screen');
  mkdirSync(dir, { recursive: true });
  const png = grab(video, totalFrame === null ? [panelFrame] : [totalFrame, panelFrame], dir);

  const framesDir = join(capturesDir(), 'frames');
  mkdirSync(framesDir, { recursive: true });
  const evidence: string[] = [];
  const images: string[] = [];
  if (totalFrame !== null) {
    const out = join(framesDir, evidenceName(id!, totalFrame, 'total'));
    writeStill(png.get(totalFrame)!, 0, out, { crop: scale(TOTAL_CROP), scale: 1120, quality: 3 });
    evidence.push(out);
    images.push(join(dir, 'total.png'));
    writeStill(png.get(totalFrame)!, 0, images[0]!, { crop: scale(TOTAL_CROP), scale: TOTAL_CROP.w * 2 });
  }
  const panelOut = join(framesDir, evidenceName(id!, panelFrame, 'panel'));
  writeStill(png.get(panelFrame)!, 0, panelOut, { crop: scale(PANEL_CROP), scale: 900, quality: 3 });
  evidence.push(panelOut);
  for (const out of evidence) {
    console.log(`証拠フレーム: ${out}`);
    uploadFrame(out);
  }
  const rows = Array.from({ length: PANEL_SLOTS }, (_, i) => scale(rowCrop(i + 1)));
  images.push(join(dir, 'panel.png'));
  writeSheet(png.get(panelFrame)!, 0, [scale(TIME_CROP), ...rows], images[images.length - 1]!);
  const template = join(dir, 'reading-template.json');
  writeFileSync(
    template,
    `${JSON.stringify(readingTemplate(id!, { total: totalFrame, panel: panelFrame }), null, 2)}\n`,
  );

  console.log(`\n読字の画像: ${images.join('・')}`);
  console.log(`雛形: ${template}`);
  console.log(
    `読み手は画像だけを見て雛形を埋め（reader に名札、数はカンマ付きの文字列でよい、読めない欄は null、` +
      `engagementSeconds は "00:16" の形でよい、空き枠は null のまま）、${join(readingsDir, `${id}-<名札>.json`)} に置く。` +
      '相手の読みは開かない',
  );
}

function merge(): void {
  const files = values.readings
    ? values.readings.split(',').map((f) => resolve(f.trim()))
    : existsSync(readingsDir)
      ? readdirSync(readingsDir)
          .filter((f) => f.startsWith(`${id}-`) && f.endsWith('.json'))
          .map((f) => join(readingsDir, f))
      : [];
  if (files.length !== 2) {
    console.error(`読みは 2 つ要る（見つかったのは ${files.length} つ: ${files.join('・') || 'なし'}）`);
    process.exit(1);
  }
  const [a, b] = files.map((f) => parseReading(JSON.parse(readFileSync(f, 'utf8')), f)) as [
    ReturnType<typeof parseReading>,
    ReturnType<typeof parseReading>,
  ];
  for (const r of [a, b])
    if (r.recording !== id) throw new Error(`${r.reader} の読みの録画が ${r.recording}（${id} でない）`);
  const result = mergeReadings(a, b, team);
  for (const w of result.warnings) console.error(`注意: ${w}`);
  if (result.mismatches.length > 0) {
    console.error(`一致しない欄（採らない）:\n${result.mismatches.map((m) => `  ${m}`).join('\n')}`);
    process.exitCode = 2;
  }
  const drafts = resultObservations(result.agreed, {
    recording: id!,
    team,
    target: recording.target?.name ?? null,
    readers: [a.reader, b.reader],
    frames: a.frames,
  });
  if (values.write && !values.source) {
    console.error('--write には --source V-NNNN が要る');
    process.exit(1);
  }
  const { existing, finished } = prepareObservations(id!, drafts, {
    tool: TOOL,
    source: values.source ?? '',
    readAt: values['read-at'] ?? todayLocal(),
  });
  console.log(JSON.stringify(finished, null, 2));
  if (values.write) writeObservations(id!, existing, finished);
}
