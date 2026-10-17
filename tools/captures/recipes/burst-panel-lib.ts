// 右のバースト欄の表示の時刻を、フレームごとの特徴から決める純粋な部分（レシピ burst-panel。plan/design-burst-panel-recipe.md
// 2 節）。特徴は burst-panel.ts が録画から出し、キャッシュ burst-panel@<版>.tsv に置く。

/** 1 フレームの特徴（座標は 1920×1080） */
export type PanelRow = {
  frame: number;
  /** 六角形（x 1754〜1779・y 428〜451）の平均の色（整数） */
  r: number;
  g: number;
  b: number;
  /** バーの行（x 1800〜1899・y 438〜446）の紫の画素の数（フルバースト） */
  magenta: number;
  /** 顔の枠（x 1785〜1884・y 465〜554）の白の画素（min(R,G,B) > 215）の数。CT の秒の字 */
  white: number;
  /** 顔の枠の白以外の画素の平均の明るさ（小数 1 桁） */
  dim: number;
};

/** 切り出す欄と、特徴を測る所（1920×1080） */
export const PANEL_CROP = { x: 1740, y: 400, w: 180, h: 180 };
export const HEXAGON_BOX = { x0: 1754, x1: 1780, y0: 428, y1: 452 };
export const BAR_BOX = { x0: 1800, x1: 1900, y0: 438, y1: 447 };
export const FACE_BOX = { x0: 1785, x1: 1885, y0: 465, y1: 555 };
/** 白の画素（顔の枠の CT の秒の字） */
export const WHITE_MIN = 215;

/** 紫の画素（バーの行）。フルバースト中のバーの色 */
export function isMagenta(r: number, g: number, b: number): boolean {
  return r > 150 && b > 120 && g < 90;
}

/** フルバーストとみなす紫の画素の数 */
export const MAGENTA_MIN = 100;
/** 六角形の色とみなす明るさ（最大の成分）と彩度（最大 − 最小） */
export const HEXAGON_MAX_MIN = 120;
export const HEXAGON_SATURATION_MIN = 75;
/** 段の替わり目の前後の読めないフレーム（白い光り）の長さの上限 */
export const MAX_GAP = 40;
/** CT の明け: 白以外の明るさの上がり（前のフレームとの差と比）と、前のフレームの秒の字の白の画素の数 */
export const CT_END_RISE = 8;
export const CT_END_RATIO = 1.25;
export const CT_DIGITS_WHITE_MIN = 300;
/** 前のフレームの明るさがその前のこの比より下なら、顔が滑り込んだ途中とみて CT の明けにしない */
export const SLIDE_IN_DROP = 0.8;
/** CT の明けを段の表示の事象（I は I → II、II は II → III、III は 00.00）の前とみなす長さ（plan/design-burst-panel-recipe.md 6 節の 2） */
export const CT_END_LEAD_MAX = 15;

/** フレームの分類。1・2・3 は I・II・III の六角形、F はフルバースト（00.00 からのバーの紫）、- は読めない */
export type PanelClass = '1' | '2' | '3' | 'F' | '-';

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60 < 0 ? h * 60 + 360 : h * 60;
}

export function classOf(row: PanelRow): PanelClass {
  if (row.magenta >= MAGENTA_MIN) return 'F';
  const max = Math.max(row.r, row.g, row.b);
  if (max < HEXAGON_MAX_MIN || max - Math.min(row.r, row.g, row.b) < HEXAGON_SATURATION_MIN) return '-';
  const h = hueOf(row.r, row.g, row.b);
  if (h >= 90 && h <= 160) return '1';
  if (h >= 25 && h <= 70) return '2';
  if (h < 25 || h > 330) return '3';
  return '-';
}

/** 段の替わり目 1 つ。frame は前の段の色の最後のフレームの次、firstColor は新しい段の色が出た最初のフレーム */
export type StageChange = { frame: number; firstColor: number };

export type PanelEvents = {
  /** I → II の替わり目 */
  oneToTwo: StageChange[];
  /** II → III の替わり目 */
  twoToThree: StageChange[];
  /** III のタイマーの 00.00（フルバーストの紫が出た最初のフレーム） */
  fullBurst: number[];
  /**
   * 段ごとの CT の明け（顔の枠の CT の秒が消えたフレーム）のうち、その段の表示の事象の CT_END_LEAD_MAX 前までにあるもの
   * （CT が律速の発動の明け）。添字 0・1・2 が I・II・III の段
   */
  ctEnd: [number[], number[], number[]];
  /** 段ごとの CT の明けの候補のうち、表示の事象の前にないもの（ゲージを待つ間の明けなど。偽物が混ざる） */
  ctEndOther: [number[], number[], number[]];
  /** 段の外（最初の I の緑の前）で捨てた CT の明けの候補 */
  ctEndOutside: number[];
};

/** フレームの列（frame が 0 から 1 ずつ）から事象を出す。行は frame の順に並んでいること */
export function panelEvents(rows: readonly PanelRow[]): PanelEvents {
  const raw = rows.map(classOf);
  // 前後と違う 1 フレームだけの六角形の色は読めないにする
  const cls = raw.map((k, i) => (k !== 'F' && k !== '-' && raw[i - 1] !== k && raw[i + 1] !== k ? '-' : k));
  const out: PanelEvents = {
    oneToTwo: [],
    twoToThree: [],
    fullBurst: [],
    ctEnd: [[], [], []],
    ctEndOther: [[], [], []],
    ctEndOutside: [],
  };
  /**
   * フレームごとの段。段は I → II → III → フルバーストの順にだけ進み（替わり目からは新しい段）、フルバーストの後は次の I の緑が
   * 出るまで II・III の色を読まない（フルバースト中の背景の橙を六角形の色と取り違える）。- は段の外（I の緑の前）
   */
  const stage: PanelClass[] = [];
  let phase = '-' as PanelClass;
  let last: PanelClass = '-';
  let lastAt = -1;
  for (let i = 0; i < cls.length; i++) {
    const k = cls[i]!;
    if (k !== '-' && (phase !== 'F' || k === '1')) {
      const near = k !== last && i - lastAt <= MAX_GAP;
      const change = () => ({ frame: rows[lastAt + 1]!.frame, firstColor: rows[i]!.frame });
      // 替わり目からは新しい段
      const relabel = (to: PanelClass) => {
        for (let j = lastAt + 1; j < i; j++) stage[j] = to;
      };
      if (near && phase === '1' && last === '1' && k === '2') {
        out.oneToTwo.push(change());
        relabel('2');
        phase = '2';
      } else if (near && phase === '2' && last === '2' && k === '3') {
        out.twoToThree.push(change());
        relabel('3');
        phase = '3';
      } else if (near && phase === '3' && last === '3' && k === 'F') {
        out.fullBurst.push(rows[i]!.frame);
        phase = 'F';
      } else if (k === '1') phase = '1';
      last = k;
      lastAt = i;
    }
    stage.push(phase);
  }
  const rises = (i: number) => {
    const now = rows[i];
    const prev = rows[i - 1];
    const before = rows[i - 2];
    if (!now || !prev || !before) return false;
    return (
      now.dim - prev.dim >= CT_END_RISE &&
      now.dim >= prev.dim * CT_END_RATIO &&
      prev.white >= CT_DIGITS_WHITE_MIN &&
      before.white >= CT_DIGITS_WHITE_MIN
    );
  };
  const changes = new Set([...out.oneToTwo, ...out.twoToThree].map((c) => c.frame));
  const displays = [out.oneToTwo.map((c) => c.frame), out.twoToThree.map((c) => c.frame), out.fullBurst];
  for (let i = 2; i < rows.length; i++) {
    if (!rises(i)) continue;
    // 偽の上がり（plan/design-burst-panel-recipe.md 1 節）: 2 フレーム続けて上がる（段の待ちが切れて顔が秒を残したまま
    // 滑り出す）・前のフレームで顔が暗くなったばかり（次の段の顔が滑り込む）・替わり目の前後 2f（顔が入れ替わる）・六角形の分類の切り替わり
    if (rises(i - 1) || rises(i + 1)) continue;
    if (rows[i - 1]!.dim < rows[i - 2]!.dim * SLIDE_IN_DROP) continue;
    // 六角形の分類がこのフレームか前のフレームで切り替わった（段の待ちが切れて六角形が消える・光りが終わる。顔も動く）
    if (raw[i] !== raw[i - 1] || raw[i - 1] !== raw[i - 2]) continue;
    const f = rows[i]!.frame;
    if ([-2, -1, 0, 1, 2].some((d) => changes.has(f + d))) continue;
    const s = stage[i];
    if (s !== '1' && s !== '2' && s !== '3') {
      out.ctEndOutside.push(f);
      continue;
    }
    const at = Number(s) - 1;
    const led = displays[at]!.some((e) => e - f >= 0 && e - f <= CT_END_LEAD_MAX);
    (led ? out.ctEnd : out.ctEndOther)[at]!.push(f);
  }
  return out;
}

const COLUMNS = ['frame', 'r', 'g', 'b', 'magenta', 'white', 'dim'] as const;

export function formatPanelTsv(rows: readonly PanelRow[]): string {
  return `${COLUMNS.join('\t')}\n${rows.map((r) => COLUMNS.map((c) => r[c]).join('\t')).join('\n')}\n`;
}

export function parsePanelTsv(text: string): PanelRow[] {
  const lines = text.trim().split('\n');
  if (lines[0] !== COLUMNS.join('\t')) throw new Error('burst-panel の TSV の見出しが違う');
  return lines.slice(1).map((line) => {
    const [frame, r, g, b, magenta, white, dim] = line.split('\t').map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return { frame, r, g, b, magenta, white, dim };
  });
}
