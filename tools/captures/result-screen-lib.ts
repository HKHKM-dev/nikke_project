// リザルト画面の読み取り（plan/design-result-screen.md）の純粋な部分。result-screen.ts と probe-result.ts が使い、
// result-screen-lib.test.ts でテストする。録画は読まない。
//
// 戦闘の後の画面は 2 枚（設計書 1 節）:
//   (a) TOTAL DAMAGE の画面（迎撃戦）: ボスの名前・赤い帯の TOTAL DAMAGE と総ダメージ・PHASE GAUGE
//   (b) 戦闘履歴のパネル（射撃場と同じ）: 合計交戦時間と、枠ごとの名前・LV・⚔・与ダメージ・盾の欄・回復の欄
// 数字は読まない（OCR は実用にならなかった。design-stage12.md 0.3 節）。探して切り出すまでが機械、読字は 2 セッションが
// 独立に行い、一致した欄だけを観測値にする。
import type { Observation } from '../../packages/core/src/records/observations.ts';
import type { Crop } from './ffmpeg.ts';

/** 座標の基準の大きさ。ほかの大きさの録画は比で直す */
export const BASE = { width: 1920, height: 1080 } as const;

export function scaleCrop(crop: Crop, width: number, height: number): Crop {
  const sx = width / BASE.width;
  const sy = height / BASE.height;
  return {
    x: Math.round(crop.x * sx),
    y: Math.round(crop.y * sy),
    w: Math.round(crop.w * sx),
    h: Math.round(crop.h * sy),
  };
}

// ---- (b) 戦闘履歴のパネルの検出（probe-result.ts から移した） ----
//
// 検出は 2 つの特徴の AND:
//   1. 中央のカードが明るく、周囲が暗い（パネルが開くと背景が暗幕になる）
//   2. カード上部に青いヘッダー帯がある（これが無いと射撃場の出撃画面を拾ってしまう）
// 実測（録画 0004・0017・0021）では パネル 60〜87% に対し 出撃画面・戦闘中は 0〜24% と離れている。
// 迎撃戦の録画 15 本でも、戦闘履歴の区間が 1 つずつ取れた（設計書 1 節）。

/** 判定用の縮小サイズ。パネルが開いているかが分かれば十分なので粗くてよい */
export const PANEL_DETECT = { w: 64, h: 36 } as const;
/** パネル内部の白いカード（画面サイズに対する割合） */
const CARD = { x0: 0.37, y0: 0.22, x1: 0.64, y1: 0.85 };
/** パネル上部の青いヘッダー帯（画面サイズに対する割合） */
const HEADER = { x0: 0.36, y0: 0.03, x1: 0.65, y1: 0.2 };
/** 既定の閾値（明暗差は輝度の差、青は占有率） */
export const PANEL_THRESHOLDS = { contrast: 60, blue: 0.4 } as const;
/** パネル全体の切り出し（一時停止・戦闘履歴のどちらも収まる） */
export const PANEL_CROP: Crop = { x: 640, y: 40, w: 660, h: 990 };

export type PanelFeatures = { contrast: number; blue: number };

/** 縮小フレーム（PANEL_DETECT の大きさの rgb24）の、カードの明暗差と青ヘッダーの占有率 */
export function measurePanel(frame: Uint8Array): PanelFeatures {
  const { w: W, h: H } = PANEL_DETECT;
  const px = (v: number, n: number) => Math.round(v * n);
  const card = { x0: px(CARD.x0, W), x1: px(CARD.x1, W), y0: px(CARD.y0, H), y1: px(CARD.y1, H) };
  const head = { x0: px(HEADER.x0, W), x1: px(HEADER.x1, W), y0: px(HEADER.y0, H), y1: px(HEADER.y1, H) };
  let inner = 0;
  let innerCount = 0;
  let outer = 0;
  let outerCount = 0;
  let blueHit = 0;
  let blueCount = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const offset = (y * W + x) * 3;
      const r = frame[offset]!;
      const g = frame[offset + 1]!;
      const b = frame[offset + 2]!;
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      if (x >= card.x0 && x < card.x1 && y >= card.y0 && y < card.y1) {
        inner += luma;
        innerCount += 1;
      } else {
        outer += luma;
        outerCount += 1;
      }
      if (x >= head.x0 && x < head.x1 && y >= head.y0 && y < head.y1) {
        blueCount += 1;
        // NIKKE のパネルのヘッダーは彩度の高い青。背景の暗幕や白いカードとは離れている。
        if (b > r + 40 && b > 110) blueHit += 1;
      }
    }
  }
  return { contrast: inner / innerCount - outer / outerCount, blue: blueHit / blueCount };
}

export function isPanel(f: PanelFeatures, t: PanelFeatures = PANEL_THRESHOLDS): boolean {
  return f.contrast >= t.contrast && f.blue >= t.blue;
}

/** 判定が立った区間（サンプルのフレーム番号で、両端を含む） */
export type Run = { from: number; to: number };

/** 判定が立ったサンプルを、連続したものどうしでまとめる（samples はフレーム順） */
export function runsOf<T extends { frame: number }>(samples: readonly T[], hit: (s: T) => boolean): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const s of samples) {
    if (hit(s)) {
      if (current === null) current = { from: s.frame, to: s.frame };
      else current.to = s.frame;
    } else if (current !== null) {
      runs.push(current);
      current = null;
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}

// ---- (a) TOTAL DAMAGE の画面の検出 ----
//
// 赤い帯「TOTAL DAMAGE」で探す（設計書 1 節の 3）。帯は y 670〜688、左端の縦 4px が純な赤、文字の右の本体が暗い紅、
// 帯の上下は暗い。3 つの AND で、迎撃戦の録画 15 本とも区間が 1 つだけ取れ、戦闘中の誤検出は無かった。
// 数字は増えてから行き過ぎて戻り、止まる（同 1 節の 4）ので、数字の領域の画素が変わらなくなった所を取る。

/** 測る範囲（元の画の px）。帯と数字が入る。ほかの大きさの録画は、この範囲を切り出してこの大きさに縮める */
export const TOTAL_PROBE: Crop = { x: 680, y: 660, w: 560, h: 100 };
/** 帯の左端の赤（元の画の px。x1・y1 は含まない） */
const BAND_EDGE = { x0: 685, x1: 688, y0: 672, y1: 686 };
/** 帯の本体（「TOTAL DAMAGE」の文字の右） */
const BAND_BODY = { x0: 840, x1: 900, y0: 672, y1: 686 };
/** 帯の上下の行 */
const BAND_AROUND_ROWS = [663, 664, 691, 692];
/** 数字の領域 */
const DIGITS = { x0: 900, x1: 1235, y0: 695, y1: 755 };
/** 画素が変わったとみなす差（R・G・B のどれか） */
const CHANGE_DELTA = 40;

export type TotalFeatures = {
  /** 帯の左端の R・G の平均 */
  edgeR: number;
  edgeG: number;
  /** 帯の本体の紅の画素の割合 */
  crimson: number;
  /** 帯の上下の輝度の平均 */
  around: number;
  /** 数字の領域で、前のサンプルから変わった画素の割合（前が無ければ 1） */
  changed: number;
};

export const TOTAL_THRESHOLDS = { edgeR: 200, edgeG: 40, crimson: 0.7, around: 50 } as const;
/** 数字が止まったとみなす、変わった画素の割合の上限 */
export const STABLE_CHANGED = 0.005;
/** 止まった伸びとみなす、続くサンプルの数 */
export const STABLE_SAMPLES = 10;

/** TOTAL_PROBE の大きさの rgb24 を測る。prev は前のサンプル（同じ大きさ） */
export function measureTotal(frame: Uint8Array, prev: Uint8Array | null): TotalFeatures {
  const W = TOTAL_PROBE.w;
  const at = (x: number, y: number) => ((y - TOTAL_PROBE.y) * W + (x - TOTAL_PROBE.x)) * 3;
  let edgeR = 0;
  let edgeG = 0;
  let n = 0;
  for (let y = BAND_EDGE.y0; y < BAND_EDGE.y1; y++)
    for (let x = BAND_EDGE.x0; x < BAND_EDGE.x1; x++) {
      const i = at(x, y);
      edgeR += frame[i]!;
      edgeG += frame[i + 1]!;
      n++;
    }
  edgeR /= n;
  edgeG /= n;
  let crimson = 0;
  n = 0;
  for (let y = BAND_BODY.y0; y < BAND_BODY.y1; y++)
    for (let x = BAND_BODY.x0; x < BAND_BODY.x1; x++) {
      const i = at(x, y);
      const r = frame[i]!;
      if (r >= 80 && frame[i + 1]! < 40 && r > 1.8 * frame[i + 2]!) crimson++;
      n++;
    }
  crimson /= n;
  let around = 0;
  n = 0;
  for (const y of BAND_AROUND_ROWS)
    for (let x = BAND_BODY.x0; x < BAND_BODY.x1; x++) {
      const i = at(x, y);
      around += (frame[i]! + frame[i + 1]! + frame[i + 2]!) / 3;
      n++;
    }
  around /= n;
  let changed = 1;
  if (prev !== null) {
    let c = 0;
    n = 0;
    for (let y = DIGITS.y0; y < DIGITS.y1; y++)
      for (let x = DIGITS.x0; x < DIGITS.x1; x++) {
        const i = at(x, y);
        const d = Math.max(
          Math.abs(frame[i]! - prev[i]!),
          Math.abs(frame[i + 1]! - prev[i + 1]!),
          Math.abs(frame[i + 2]! - prev[i + 2]!),
        );
        if (d > CHANGE_DELTA) c++;
        n++;
      }
    changed = c / n;
  }
  return { edgeR, edgeG, crimson, around, changed };
}

export function isTotalScreen(f: TotalFeatures): boolean {
  const t = TOTAL_THRESHOLDS;
  return f.edgeR > t.edgeR && f.edgeG < t.edgeG && f.crimson > t.crimson && f.around < t.around;
}

export type TotalSample = { frame: number; total: boolean; changed: number };

/**
 * (a) の読むフレーム。最後の (a) の区間のうち、数字が止まった（changed < STABLE_CHANGED）サンプルが STABLE_SAMPLES 以上
 * 続く最後の伸びの中央。無ければ null
 */
export function pickTotalFrame(samples: readonly TotalSample[]): number | null {
  const runs = runsOf(samples, (s) => s.total);
  const last = runs[runs.length - 1];
  if (last === undefined) return null;
  const inRun = samples.filter((s) => s.frame >= last.from && s.frame <= last.to);
  // 区間の最初のサンプルは前（(a) でない画）と比べているので、止まった数に入れない
  const stable = runsOf(inRun.slice(1), (s) => s.changed < STABLE_CHANGED);
  const counted = stable.map((r) => ({ r, n: inRun.filter((s) => s.frame >= r.from && s.frame <= r.to).length }));
  const ok = counted.filter((c) => c.n >= STABLE_SAMPLES);
  const pick = ok[ok.length - 1];
  if (pick === undefined) return null;
  const mid = inRun.filter((s) => s.frame >= pick.r.from && s.frame <= pick.r.to);
  return mid[(mid.length - 1) >> 1]!.frame;
}

/**
 * (b) の読む区間。(a) のフレームより後の最初の区間、(a) が無ければ最後の区間（戦闘中の一時停止を拾わないため）。
 * 区間が 2 つ以上あって (a) が無いときは、一時停止を拾ったかもしれないので注意を返す
 */
export function pickPanelRun(runs: readonly Run[], totalFrame: number | null): { run: Run | null; warning?: string } {
  if (totalFrame !== null) {
    const run = runs.find((r) => r.from > totalFrame) ?? null;
    return run === null ? { run, warning: 'TOTAL DAMAGE の画面の後に戦闘履歴のパネルが無い' } : { run };
  }
  const run = runs[runs.length - 1] ?? null;
  if (runs.length >= 2)
    return { run, warning: `パネルの区間が ${runs.length} つある（最後を取った。一時停止でないか画で確かめる）` };
  return { run };
}

/** 区間の中央のフレーム */
export const middleOf = (run: Run): number => Math.round((run.from + run.to) / 2);

// ---- 切り出しの位置（元の画の px。1920×1080） ----

/** (a) の証拠と読字の範囲（ボスの名前・TOTAL DAMAGE・PHASE GAUGE） */
export const TOTAL_CROP: Crop = { x: 680, y: 600, w: 560, h: 270 };
/** (b) の合計交戦時間 */
export const TIME_CROP: Crop = { x: 850, y: 193, w: 220, h: 36 };
/** パネルの枠の数と、枠の行の並び */
export const PANEL_SLOTS = 5;
const ROW = { x: 826, y: 255, w: 372, h: 112, pitch: 129.25 };

/** 枠（1 始まり）の行（名前・LV・⚔・与ダメージ・盾の欄・回復の欄） */
export function rowCrop(slot: number): Crop {
  if (!Number.isInteger(slot) || slot < 1 || slot > PANEL_SLOTS) throw new Error(`枠は 1〜${PANEL_SLOTS}: ${slot}`);
  return { x: ROW.x, y: Math.round(ROW.y + ROW.pitch * (slot - 1)), w: ROW.w, h: ROW.h };
}

/** 証拠フレームの名前（frames/ の下） */
export function evidenceName(recording: string, frame: number, screen: 'total' | 'panel'): string {
  return `${recording}_f${frame}_result-${screen}.jpg`;
}

// ---- 読み（読字の雛形と、読み手が埋めたもの） ----

export type ReadingSlot = {
  slot: number;
  name: string | null;
  damage: number | null;
  shield: number | null;
  heal: number | null;
};

export type Reading = {
  recording: string;
  /** 読み手の名札（a・b・owner など） */
  reader: string;
  /** 読んだフレーム（cut が書く。読み手は変えない） */
  frames: { total: number | null; panel: number };
  totalDamage: number | null;
  /** PHASE GAUGE の到達した段階 */
  phase: number | null;
  /** 合計交戦時間（秒） */
  engagementSeconds: number | null;
  slots: ReadingSlot[];
};

/** 読字の雛形。値はすべて null（機械の読みは入れない。読み手が見る前の値に引きずられない） */
export function readingTemplate(recording: string, frames: Reading['frames']): Reading {
  return {
    recording,
    reader: '',
    frames,
    totalDamage: null,
    phase: null,
    engagementSeconds: null,
    slots: Array.from({ length: PANEL_SLOTS }, (_, i) => ({
      slot: i + 1,
      name: null,
      damage: null,
      shield: null,
      heal: null,
    })),
  };
}

/** 0 以上の整数。数か、カンマ付きの文字列（"4,652,679"）。null は読めない */
export function parseCount(value: unknown, at: string): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,3}(,?\d{3})*$/.test(value.trim()) ? Number(value.trim().replace(/,/g, '')) : Number.NaN; // prettier-ignore
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`${at}: 0 以上の整数（カンマ付きの文字列も可）でない: ${JSON.stringify(value)}`);
  return n;
}

/** 秒。数か、パネルの表示のままの "mm:ss" */
export function parseSeconds(value: unknown, at: string): number | null {
  if (typeof value === 'string') {
    const m = /^(\d+):([0-5]\d)$/.exec(value.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return parseCount(value, at);
}

/** 読み手が埋めたファイルの中身を確かめて読む */
export function parseReading(json: unknown, at: string): Reading {
  if (typeof json !== 'object' || json === null) throw new Error(`${at}: オブジェクトでない`);
  const o = json as Record<string, unknown>;
  if (typeof o['recording'] !== 'string' || o['recording'] === '') throw new Error(`${at}: recording が無い`);
  if (typeof o['reader'] !== 'string' || o['reader'].trim() === '') throw new Error(`${at}: reader（名札）が空`);
  const frames = o['frames'] as Record<string, unknown> | undefined;
  const panel = frames?.['panel'];
  const total = frames?.['total'];
  if (typeof panel !== 'number' || !(total === null || typeof total === 'number'))
    throw new Error(`${at}: frames（cut が書いたもの）が無い`);
  if (!Array.isArray(o['slots'])) throw new Error(`${at}: slots が無い`);
  const slots = (o['slots'] as unknown[]).map((s, i): ReadingSlot => {
    const r = s as Record<string, unknown>;
    const where = `${at}: slots[${i}]`;
    const slot = r['slot'];
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > PANEL_SLOTS)
      throw new Error(`${where}.slot が 1〜${PANEL_SLOTS} でない`);
    const name = r['name'];
    if (!(name === null || name === undefined || typeof name === 'string'))
      throw new Error(`${where}.name が文字列でない`);
    return {
      slot,
      name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
      damage: parseCount(r['damage'], `${where}.damage`),
      shield: parseCount(r['shield'], `${where}.shield`),
      heal: parseCount(r['heal'], `${where}.heal`),
    };
  });
  if (new Set(slots.map((s) => s.slot)).size !== slots.length) throw new Error(`${at}: slots の枠が重なっている`);
  return {
    recording: o['recording'],
    reader: o['reader'].trim(),
    frames: { total, panel },
    totalDamage: parseCount(o['totalDamage'], `${at}: totalDamage`),
    phase: parseCount(o['phase'], `${at}: phase`),
    engagementSeconds: parseSeconds(o['engagementSeconds'], `${at}: engagementSeconds`),
    slots,
  };
}

// ---- 一致の判定 ----

/** 台帳の編成の 1 枠 */
export type TeamSlot = { slot: number; name: string };

export type Agreed = {
  totalDamage?: number;
  phase?: number;
  engagementSeconds?: number;
  /** 台帳の枠順。枠の全部がそろったときだけ */
  damage?: number[];
  shield?: number[];
  heal?: number[];
};

export type MergeResult = { agreed: Agreed; mismatches: string[]; warnings: string[] };

const norm = (s: string) => s.normalize('NFKC').replace(/\s/g, '');

/** 読んだ名前が台帳の名前と合うか。横スクロールで切れるので、部分一致なら合うとみなす */
export function nameMatches(read: string, team: string): boolean {
  const r = norm(read);
  const t = norm(team);
  return r !== '' && (t.includes(r) || r.includes(t));
}

/** 2 つの読みを欄ごとに比べ、両方が読めて同じ値の欄だけを採る */
export function mergeReadings(a: Reading, b: Reading, team: readonly TeamSlot[]): MergeResult {
  if (a.recording !== b.recording) throw new Error(`録画が違う: ${a.recording} と ${b.recording}`);
  if (a.reader === b.reader) throw new Error(`名札が同じ（${a.reader}）。独立の 2 つの読みが要る`);
  if (a.frames.panel !== b.frames.panel || a.frames.total !== b.frames.total)
    throw new Error(
      `読んだフレームが違う: ${JSON.stringify(a.frames)} と ${JSON.stringify(b.frames)}（同じ cut の画像を読む）`,
    );
  const agreed: Agreed = {};
  const mismatches: string[] = [];
  const warnings: string[] = [];
  const compare = (field: string, x: number | null, y: number | null): number | undefined => {
    if (x !== null && y !== null && x === y) return x;
    mismatches.push(`${field}: ${a.reader}=${x ?? '読めない'} / ${b.reader}=${y ?? '読めない'}`);
    return undefined;
  };
  // (a) の画面が無い録画（射撃場など）では、TOTAL DAMAGE と段階は比べない
  if (a.frames.total !== null) {
    const total = compare('totalDamage', a.totalDamage, b.totalDamage);
    if (total !== undefined) agreed.totalDamage = total;
    const phase = compare('phase', a.phase, b.phase);
    if (phase !== undefined) agreed.phase = phase;
  }
  const seconds = compare('engagementSeconds', a.engagementSeconds, b.engagementSeconds);
  if (seconds !== undefined) agreed.engagementSeconds = seconds;

  const slotOf = (r: Reading, slot: number) => r.slots.find((s) => s.slot === slot);
  const columns = { damage: [] as (number | undefined)[], shield: [] as (number | undefined)[], heal: [] as (number | undefined)[] }; // prettier-ignore
  for (const t of team) {
    const sa = slotOf(a, t.slot);
    const sb = slotOf(b, t.slot);
    for (const [reader, s] of [
      [a.reader, sa],
      [b.reader, sb],
    ] as const) {
      if (s?.name && !nameMatches(s.name, t.name))
        warnings.push(`枠 ${t.slot}: ${reader} の名前「${s.name}」が台帳の「${t.name}」と合わない`);
    }
    for (const key of ['damage', 'shield', 'heal'] as const)
      columns[key].push(compare(`slots[${t.slot}].${key}`, sa?.[key] ?? null, sb?.[key] ?? null));
  }
  for (const key of ['damage', 'shield', 'heal'] as const) {
    const col = columns[key];
    if (col.length > 0 && col.every((v) => v !== undefined)) agreed[key] = col as number[];
  }
  return { agreed, mismatches, warnings };
}

// ---- 観測値の形 ----

/** 観測値の下書き（id・recording・source・readAt は書く側が埋める） */
export type DraftObservation = Omit<Observation, 'id' | 'recording' | 'source' | 'readAt'>;

export const TOOL = 'result-screen.ts@1';

export type ObservationContext = {
  recording: string;
  team: readonly TeamSlot[];
  /** 台帳の的の名前（無ければ null） */
  target: string | null;
  readers: [string, string];
  frames: Reading['frames'];
};

/** 一致した欄を観測値にする（設計書 2.3 節の表の順） */
export function resultObservations(agreed: Agreed, ctx: ObservationContext): DraftObservation[] {
  const order = ctx.team.map((t) => t.name).join('・');
  const note = (screen: string, frame: number | null) =>
    `2 セッションの独立読字の一致（${ctx.readers.join('・')}）。${screen}（f${frame}）を result-screen.ts cut で切り出して読んだ`;
  const out: DraftObservation[] = [];
  const panel = (kind: 'total' | 'timing', value: number | number[], description: string, unit?: string) =>
    out.push({
      kind,
      use: 'record',
      value,
      ...(unit === undefined ? {} : { unit }),
      description,
      method: { tool: TOOL, note: note('戦闘履歴のパネル', ctx.frames.panel) },
      evidence: [`frames/${evidenceName(ctx.recording, ctx.frames.panel, 'panel')}`],
    });
  if (agreed.damage) panel('total', agreed.damage, `戦闘履歴のパネルの与ダメージ（枠順: ${order}）`);
  if (agreed.shield) panel('total', agreed.shield, `戦闘履歴のパネルの盾の欄の値（枠順: ${order}）`);
  if (agreed.heal) panel('total', agreed.heal, `戦闘履歴のパネルの回復の欄の値（枠順: ${order}）`);
  if (agreed.engagementSeconds !== undefined)
    panel('timing', agreed.engagementSeconds, '戦闘履歴のパネルの合計交戦時間', 's');
  const totalScreen = (kind: 'total' | 'count', value: number, description: string) =>
    out.push({
      kind,
      use: 'record',
      value,
      description,
      method: { tool: TOOL, note: note('TOTAL DAMAGE の画面', ctx.frames.total) },
      evidence: ctx.frames.total === null ? [] : [`frames/${evidenceName(ctx.recording, ctx.frames.total, 'total')}`],
    });
  const boss = ctx.target === null ? '' : `（${ctx.target}）`;
  if (agreed.totalDamage !== undefined) totalScreen('total', agreed.totalDamage, `リザルト画面の TOTAL DAMAGE${boss}`);
  if (agreed.phase !== undefined)
    totalScreen('count', agreed.phase, `リザルト画面の PHASE GAUGE の到達した段階${boss}`);
  return out;
}
