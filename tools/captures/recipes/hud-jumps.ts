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

function runHud(video: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../hud.ts', import.meta.url));
    const child = spawn(process.execPath, [script, video, '--mode', 'jumps'], {
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

export type HudJumps = { rows: HudRow[]; groups: TriggerGroup[]; shotInterval: number; final: number | undefined };

/** 増分の列（キャッシュ）と、組にまとめたトリガーの列 */
export async function loadHudJumps(ctx: RecipeContext): Promise<HudJumps> {
  const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
  const text = await derived(ctx.derivedDir, HUD_JUMPS_CACHE_KEY, ctx.video, sha, () => runHud(ctx.video), ctx.log);
  const rows = parseHudJumpsTsv(text);
  const shotInterval = shotIntervalOf(rows.map((r) => r.frame));
  const groups = groupIncrements(rows, shotInterval);
  return { rows, groups, shotInterval, final: rows.at(-1)?.value };
}

export const hudJumps: Recipe = {
  name: 'hud-jumps',
  version: HUD_JUMPS_VERSION,
  describe: 'HUD の総ダメージの最後の値（total）と、増分の数から数えたトリガーの数（count）',
  options: {},
  async run(ctx) {
    const { rows, groups, shotInterval, final } = await loadHudJumps(ctx);
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
          `最後の増分は f${rows.at(-1)!.frame}。増分は ${rows.length} 個`,
        ),
      );
    }
    out.push(
      observation(
        this,
        'count',
        triggers,
        `${who} のトリガーの数（総ダメージの増分の数）`,
        `増分は ${rows.length} 個。前の増分から 30f 未満の増分（${merged} 個）は同じトリガーの読みが割れたものとしてまとめ、` +
          `まとめた組が跨ぐ長さ（発の間 ${shotInterval}f）から発の数を決めた（2 発になった組 ${groups.filter((g) => g.shots > 1).length} 個）`,
        { unit: 'トリガー' },
      ),
    );
    return out;
  },
};
