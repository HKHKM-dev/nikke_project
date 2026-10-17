// レシピ charge-shots: SR・RL（チャージ武器）単騎・スペック固定 ON・射撃場 3 分モードの、区間ごとの撃った発・総ダメージに出ない発・
// フルチャージで出た発・そのうちコアを外した発（plan/design-charge-shots.md。V-0090 の読み方）。
// 総ダメージの増分（hud-jumps のキャッシュ）を charge-lattice.ts で発の列にする。総ダメージに出ない発がコンテナの発（C-0108）か
// 外れかは分けない（画面を見て人が分ける。同書 2 節の論点 1）。
import { readChargeShots, type ChargeShot } from './charge-lattice.ts';
import { loadHudJumps } from './hud-jumps.ts';
import { fixedSpecGrid, segmentOf } from './smg-hits.ts';
import { observation, roundTo, type Recipe, type RecipeObservation } from './types.ts';

const SEGMENTS = 6;

export const chargeShots: Recipe = {
  name: 'charge-shots',
  version: 1,
  describe:
    'SR・RL 単騎・スペック固定 ON・3 分モードの、区間（1〜6）ごとの撃った発・総ダメージに出ない発・フルチャージで出た発・そのうちコアを外した発（count）と、撃った発の合計',
  options: {
    body: '1 発の胴体（フルチャージ・距離ボーナスなし・非会心）。スペック固定 ON の格子（距離 0.3・会心 0.5・コア 1.0）で分ける',
    cuts: '区間の切れ目（窓の前の最後の発の、動画のフレーム）をカンマ区切りで（5 つ）。省けば窓から決める（窓が 5 つでなければ誤り）',
    start: '戦闘開始（残り時間 02:59 が出た動画のフレーム）。与えれば、注記のフレームを戦闘開始からの数でも書く',
  },
  async run(ctx) {
    if (ctx.recording.fixedSpec !== true) throw new Error('スペック固定 ON の録画だけを読む（OFF は格子が決まらない）');
    if (ctx.recording.mode !== 'range-3min') throw new Error('射撃場 3 分モードの録画だけを読む');
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体の 1 発> が要る');
    const start = ctx.options.start === undefined ? undefined : Number(ctx.options.start);
    if (start !== undefined && !Number.isInteger(start)) throw new Error('--opt start=<動画のフレーム> の形が違う');
    const at = (f: number) => (start === undefined ? `動画 f${f}` : `${f - start}f（動画 f${f}）`);

    const rows = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const read = readChargeShots(rows, fixedSpecGrid(body));
    const windowList = read.windows.map(
      (w) => `${at(w.before)}〜${w.after === undefined ? '戦闘の終わり' : at(w.after)}`,
    );

    const given = (ctx.options.cuts ?? '')
      .split(',')
      .filter((x) => x !== '')
      .map(Number);
    if (given.some((c) => !Number.isInteger(c))) throw new Error('--opt cuts=<f>,<f>,... の形が違う');
    if (given.length > 0 && given.length !== SEGMENTS - 1) throw new Error(`--opt cuts は ${SEGMENTS - 1} つ`);
    if (given.length === 0 && read.windows.length !== SEGMENTS - 1) {
      throw new Error(
        `窓が ${read.windows.length} つ（3 分モードは ${SEGMENTS - 1} つ）。--opt cuts=<f>,… で切れ目を与える。` +
          `窓: ${windowList.join('・')}。リロードの空きの前の発: ${read.reloads.map(at).join('・')}`,
      );
    }
    const cuts = given.length > 0 ? given : read.windows.map((w) => w.before);

    const perSegment = (pick: (s: ChargeShot) => boolean): number[] => {
      const a = Array.from({ length: SEGMENTS }, () => 0);
      for (const s of read.shots) if (pick(s)) a[Math.min(segmentOf(s.frame, cuts), SEGMENTS - 1)]!++;
      return a;
    };
    const shots = perSegment(() => true);
    const missing = read.shots.filter((s) => s.kind === 'missing');
    const partial = read.shots.filter((s) => s.kind === 'partial');
    const fulls = perSegment((s) => s.kind === 'full');
    const body0 = perSegment((s) => s.kind === 'full' && s.core === false);
    const total = read.shots.length;

    const who = ctx.recording.team.map((m) => m.name).join('・');
    const lead = `${who}単騎・AUTO で、`;
    const segs = '着地点の区間（1〜6 区間目。中近・近・遠・中遠・近・遠。C-0031）ごとに';
    const common =
      `HUD の総ダメージの増分（hud-jumps のキャッシュ）を、胴体 ${body} の格子（スペック固定 ON）でフルチャージの発に分け、` +
      `発の刻み ${roundTo(read.interval, 2)}f・リロードの空き ${read.reloadGap}f・装弾数 ${read.mag}（どれも増分の列から測った値）の格子をたどった。` +
      `区間の切れ目は ${cuts.map(at).join('・')}（${given.length > 0 ? '--opt cuts' : '窓の前の最後の発'}）。` +
      `窓（格子に乗らない空き）は ${windowList.join('・') || '無し'}。部分チャージの発は ${partial.map((s) => at(s.frame)).join('・') || '無し'}。` +
      `読めない間（gap 2 以上）にかかったフルチャージの発 ${read.shots.filter((s) => s.wide).length}。` +
      `発でない増分として捨てた値 ${read.others.join('・') || '無し'}（${read.dropped} 個）。` +
      `説明のつかない増分 ${read.odd.map((r) => `${at(r.hi)} の ${r.increment}`).join('・') || '無し'}`;

    const out: RecipeObservation[] = [
      observation(
        this,
        'count',
        shots,
        `${lead}${segs}撃った通常攻撃の発の数（部分チャージの発と、総ダメージに出ない発を含む。合計 ${total}）`,
        common,
        { unit: '発' },
      ),
      observation(
        this,
        'count',
        perSegment((s) => s.kind === 'missing'),
        `${lead}区間（1〜6 区間目）ごとの、総ダメージに増分の出ない発（発の刻みの抜け）の数。コンテナの発（C-0108）か弾丸命中率の外れかは分けていない。母数は撃った発の数`,
        `刻みの抜けの、格子の上のフレーム: ${missing.map((s) => at(s.frame)).join('・') || '無し'}。コンテナの発かは画面で確かめる`,
        { unit: '発' },
      ),
      observation(
        this,
        'count',
        fulls,
        `${lead}${segs.replace(/に$/, 'の')}、総ダメージに出たフルチャージの通常攻撃の発の数（部分チャージの発と総ダメージに出ない発を除く）`,
        common,
        { unit: '発' },
      ),
      observation(
        this,
        'count',
        body0,
        `${lead}区間（1〜6 区間目）ごとの、フルチャージの発のうちコアを外した発（胴体・胴体会心の値）の数。母数はフルチャージで出た発`,
        `胴体 ${body} の格子でコアの付かない値に乗った発`,
        { unit: '発' },
      ),
      observation(
        this,
        'count',
        total,
        `${lead}180 秒に撃った通常攻撃の発の数（総ダメージに出ない発を含む。区間ごとの撃った発の合計）`,
        `総ダメージに出た発 ${total - missing.length} + 刻みの抜け ${missing.length}`,
        { unit: '発' },
      ),
    ];
    return out;
  },
};
