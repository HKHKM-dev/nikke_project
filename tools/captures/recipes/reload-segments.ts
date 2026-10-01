// レシピ reload-segments: RELOADING のバー（reload.ts --mode fit --shots）から、リロードごとの最終弾 → 完了・完了 → 次の増分・
// バーの長さを観測値にする（V-0057・V-0068 の読み方。plan/design-records-automation.md 3.4 節）。
//
// --opt:
//   stages=1    分割リロード（SG）。段ごとに当てはめる（reload.ts --stages）
//   crop=x,y,w,h  バーの位置（既定は reload.ts の既定）
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derived } from './cache.ts';
import { HUD_JUMPS_VERSION, loadHudJumps } from './hud-jumps.ts';
import { parseReloadRows, summarizeReloads, MAX_FIT_RMS } from './reload-rows.ts';
import { observation, roundTo, type Recipe, type RecipeContext } from './types.ts';

const VERSION = 1;

function runReload(video: string, shots: string, stages: boolean, crop: string | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../reload.ts', import.meta.url));
    const args = [script, video, '--mode', 'fit', '--shots', shots];
    if (stages) args.push('--stages');
    if (crop !== undefined) args.push('--crop', crop);
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`reload.ts が ${code} で終わった: ${err}`)),
    );
  });
}

function who(ctx: RecipeContext): string {
  return ctx.recording.team.map((m) => m.name).join('・');
}

export const reloadSegments: Recipe = {
  name: 'reload-segments',
  version: VERSION,
  describe: 'リロードごとの最終弾 → 完了（interval）、完了 → 次の増分（interval）、バーの長さ（interval）',
  options: {
    stages: '分割リロード（SG）なら 1。段ごとに当てはめる',
    crop: 'バーの位置 x,y,w,h（既定は reload.ts の既定 760,524,400,10）',
  },
  async run(ctx) {
    const stages = ctx.options.stages !== undefined && ctx.options.stages !== '0';
    await loadHudJumps(ctx);
    const shots = join(ctx.derivedDir, `hud-jumps@${HUD_JUMPS_VERSION}.tsv`);
    const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
    const key = `reload-fit${stages ? '-stages' : ''}${ctx.options.crop ? `-${ctx.options.crop.replace(/,/g, '_')}` : ''}@${VERSION}`;
    const text = await derived(
      ctx.derivedDir,
      key,
      ctx.video,
      sha,
      () => runReload(ctx.video, shots, stages, ctx.options.crop),
      ctx.log,
    );
    const rows = parseReloadRows(text);
    const s = summarizeReloads(rows, stages);
    const name = who(ctx);
    const ex = `取り消し ${s.excluded.canceled} 回・窓をまたいだ回 ${s.excluded.window} 回・最終弾の読み違い ${s.excluded.misread} 回を除いた`;
    const how = `tools/captures/reload.ts --mode fit${stages ? ' --stages' : ''} --shots（hud-jumps のキャッシュ）。`;
    return [
      observation(
        this,
        'interval',
        s.lastToEnd.map((x) => x.value),
        `${name} のマガジンの最終弾（総ダメージの増分）からリロード完了（RELOADING のバーが消えたフレーム${stages ? '。分割リロードは最後の段' : ''}）まで（${ex}全部の回）`,
        `${how}完了のフレーム: ${s.lastToEnd.map((x) => x.end).join('・')}。窓をまたいだ回は、完了 → 次の増分がこの録画の中央値 + 5f を超える回`,
        { unit: 'f' },
      ),
      observation(
        this,
        'interval',
        s.endToNext.map((x) => x.value),
        `${name} のリロード完了から次の発（総ダメージの増分）まで（取り消し・窓をまたいだ回を除いた全部の回）`,
        `${how}完了のフレーム: ${s.endToNext.map((x) => x.end).join('・')}`,
        { unit: 'f' },
      ),
      observation(
        this,
        'interval',
        s.barFrames.map((v) => roundTo(v, 2)),
        stages
          ? `${name} の分割リロードの段ごとのバーが 0 から満ちるまでの長さ（溝の幅 ÷ 段のバーの伸び）`
          : `${name} のリロードのバーが 0 から満ちるまでの長さ（溝の幅 ÷ バーの伸び。直線の当てはめ）`,
        `${how}当てはめの残差が ${MAX_FIT_RMS}px を超える${stages ? '段' : '回'}は除いた。取り消し・窓をまたいだ回も除いた`,
        { unit: 'f' },
      ),
    ];
  },
};
