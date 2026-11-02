// レシピ hud-jumps: HUD の総ダメージの増分（hud.ts --mode jumps）を読んでキャッシュし、最後の値とトリガーの数を観測値にする。
// ほかのレシピ（sg-pellets）は loadHudJumps でキャッシュを共有する。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { derived } from './cache.ts';
import { groupIncrements, parseHudJumpsTsv, shotIntervalOf, type HudRow, type TriggerGroup } from './triggers.ts';
import { observation, type Recipe, type RecipeContext } from './types.ts';

/**
 * レシピの版。2: 組の跨ぐ長さを、読めなかった間の真ん中から測る（V-0079）。
 * 3: 読み方は 2 と同じ。hud.ts が 0 と 8 を穴の数で分けるようにした増分（キャッシュ hud-jumps@2）で読む（V-0327）
 */
export const HUD_JUMPS_VERSION = 3;
/**
 * hud.ts --mode jumps の出力のキャッシュの名前（出力の形は版 1 から変わらない）。
 * 2: hud.ts が 0 と 8 を穴の数で分けるようにした（V-0327）。同じ録画でも読みが変わるので作り直す
 */
export const HUD_JUMPS_CACHE_KEY = 'hud-jumps@2';

/**
 * --opt の名前。0 以外なら hud.ts --fallback で読む（数字が赤みがかるレッドウルフの窓。V-0639）。ほかの録画には使わない。
 * hud-jumps のキャッシュを読むレシピ（loadHudJumps）はどれも受ける
 */
export const HUD_FALLBACK_OPTION = 'hud-fallback';

/** hud.ts に足す引数と、増分のキャッシュの名前（--fallback の読みは違うので、別の名前に置く） */
export function hudReading(options: Readonly<Record<string, string>>): { args: string[]; cacheKey: string } {
  const v = options[HUD_FALLBACK_OPTION];
  return v === undefined || v === '0'
    ? { args: [], cacheKey: HUD_JUMPS_CACHE_KEY }
    : { args: ['--fallback'], cacheKey: `${HUD_JUMPS_CACHE_KEY}-fallback` };
}

function runHud(video: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../hud.ts', import.meta.url));
    const child = spawn(process.execPath, [script, video, '--mode', 'jumps', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`hud.ts が ${code} で終わった: ${err}`)),
    );
  });
}

export type HudJumps = {
  rows: HudRow[];
  groups: TriggerGroup[];
  shotInterval: number;
  final: number | undefined;
  /** 増分のキャッシュの名前（derived/<録画 id>/<名前>.tsv） */
  cacheKey: string;
};

/** 増分の列（キャッシュ）と、組にまとめたトリガーの列 */
export async function loadHudJumps(ctx: RecipeContext): Promise<HudJumps> {
  const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
  const { args, cacheKey } = hudReading(ctx.options);
  const text = await derived(ctx.derivedDir, cacheKey, ctx.video, sha, () => runHud(ctx.video, args), ctx.log);
  const rows = parseHudJumpsTsv(text);
  const shotInterval = shotIntervalOf(rows.map((r) => r.frame));
  const groups = groupIncrements(rows, shotInterval);
  return { rows, groups, shotInterval, final: rows.at(-1)?.value, cacheKey };
}

export const hudJumps: Recipe = {
  name: 'hud-jumps',
  version: HUD_JUMPS_VERSION,
  describe: 'HUD の総ダメージの最後の値（total）と、増分の数から数えたトリガーの数（count）',
  options: {
    [HUD_FALLBACK_OPTION]:
      '1 なら閾値 150 で読めなかったフレームを低い閾値で読み直す（hud.ts --fallback。レッドウルフの窓。V-0639）',
  },
  async run(ctx) {
    const { rows, groups, shotInterval, final, cacheKey } = await loadHudJumps(ctx);
    const via = cacheKey === HUD_JUMPS_CACHE_KEY ? '' : '（hud.ts --fallback で読んだ）';
    const triggers = groups.reduce((s, g) => s + g.shots, 0);
    const merged = rows.length - groups.length;
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const out = [];
    if (final !== undefined) {
      out.push(
        observation(
          this,
          'total',
          final,
          `${who} の HUD の総ダメージの最後の値`,
          `最後の増分は f${rows.at(-1)!.frame}。増分は ${rows.length} 個${via}`,
        ),
      );
    }
    out.push(
      observation(
        this,
        'count',
        triggers,
        `${who} のトリガーの数（総ダメージの増分の数）`,
        `増分は ${rows.length} 個${via}。前の増分から 30f 未満の増分（${merged} 個）は同じトリガーの読みが割れたものとしてまとめ、` +
          `まとめた組が跨ぐ長さ（発の間 ${shotInterval}f）から発の数を決めた（2 発になった組 ${groups.filter((g) => g.shots > 1).length} 個）`,
        { unit: 'トリガー' },
      ),
    );
    return out;
  },
};
