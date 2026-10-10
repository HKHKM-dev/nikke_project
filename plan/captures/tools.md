# 解析ツール

- 関連: [index.md](index.md)（命名規約・撮影プロトコル・台帳・キャラの確かめ方）、[storage.md](storage.md)（置き場所・バックアップ・取り寄せ）、[guide.md](guide.md)（撮影と読み取りの落とし穴）、[../verification-guide.md](../verification-guide.md)（検証の流れ）
- 2026-10-11 に index.md の「フレーム番号の約束」「解析ツール」「証拠フレームの切り出し」を移した（[../design-investigation-review.md](../design-investigation-review.md) 7.2 節）。ツールの座標や既定値は、ツールの冒頭のコメントが正。

## フレーム番号の約束

**フレーム番号は「デコードされたフレームの通し番号（0 始まり）」とする。** ffmpeg では `-fps_mode vfr` が相当する。`tools/captures/` のツールはすべてこの番号で統一している。

`-fps_mode cfr` で 60fps に引き伸ばすと重複フレームが挿入され、フレーム落ちのある録画（01・07）では番号がずれる。2026-09-22 の較正メモに残っている番号（SR の 551→633→715 など）は別の数え方で取られたもので、現在のツールの出力とは直接比較できない。**間隔（82f など）は一致するので、較正結果そのものは有効。**

## 解析ツール

```bash
node tools/captures/probe.ts                        # 全録画の素性を表で出力（records/recordings/ の素性の項目に写す）
node tools/captures/fetch.ts <録画 id | 相対パス>... [--legacy] [--force]   # Drive から取り寄せる（storage.md「クラウド環境での取り寄せ」）
node tools/captures/still.ts   <動画> --frame 947 --out out.png [--crop x,y,w,h] [--scale 900]
node tools/captures/diff.ts    <動画> --crop x,y,w,h [--from N] [--to N] --peaks [--csv out.csv]
node tools/captures/probe-result.ts <動画...> [--list] [--out-dir DIR] [--samples 3]
node tools/captures/gauge.ts <動画> [--from N] [--to N] [--mode events|jumps|series] [--step 1]
node tools/captures/ammo.ts  <動画> [--crop 785,902,110,26] [--max 300] [--mode mags|series] [--from N] [--to N]
node tools/captures/reticle-ammo.ts <動画> [--mode mags|series] [--from N] [--to N] [--max 300]   # 照準の左の残弾（操作キャラ。V-0163）
node tools/captures/hud.ts   <動画> [--mode final|jumps|series] [--from N] [--to N] [--crop 810,34,300,38]
node tools/captures/aim.ts   <動画> [--from N] [--to N] [--step 60] [--csv out.csv] [--debug-dir DIR]
node tools/captures/timer.ts <動画...> [--mode summary|changes]   # 残り時間の秒の変わり目と、1 秒あたりのフレーム数（V-0003）
node tools/captures/banner.ts <動画> --hits f1,f2,... [--window 140]   # 左のスキルの帯の立ち上がりと、ヒットまでの差 D（V-0313）
node tools/captures/banner.ts <動画> --mode white --from N --to N   # 帯の地の白さで拾う（撃つ操作キャラのマズルフラッシュと分ける。V-0325）
node tools/captures/timer.ts <動画> --mode steps [--start N]      # 残り時間の止まりの段（V-0168。1f の止まりを取りこぼす）
node tools/captures/timer.ts <動画> --mode stalls [--at f1,f2,...] [--window 35,5] [--start N]   # 止まりの区切りと大きさ（区間の共通部分。V-0379「読み方」2）と、各フレームの前後に掛かる止まりの和
node tools/captures/timer.ts <動画> --mode ticks --at f1,f2,... [--start N]   # フレームを戦闘開始からのゲーム内のティック（止まりを除く）に直す（V-0302）
node tools/captures/dups.ts  <動画> [--from N] [--to N] [--mode summary|list|diff]   # 重複フレーム（前と同じ画）を拾う（V-0004）
node tools/captures/reload.ts <動画> [--shots <hud.ts --mode jumps の出力>] [--stages] [--mode series|segments|fit]   # RELOADING のバーから、リロードごとの完了・伸び・最終弾 → 完了（V-0057）
node tools/captures/intake.ts <元ファイル> --id NNN --name <識別子> [--folder range] [--rid 271,870 --controlled 1 --target BigArms --element Fire --mode range-3min --fixed-spec on|off ...] [--no-backup]   # 取り込み: リネーム・移動・素性・records/recordings/NNN.json・Drive への同期
node tools/captures/read.ts <録画 id> --recipe <名前> --source V-NNNN [--opt key=value ...] [--write] [--against ID,ID]   # レシピで読んで観測値にする（npm run records:read）
node tools/captures/coverage.ts <録画 id> [--config tools/captures/coverage-config.json] [--sections f1,f2,...]   # 着地点ごとの被覆率の表 h(L, s)（plan/design-bullet-hit-rate-frame-coverage.md）
node tools/captures/sg-dots.ts <録画 id> --pellets <sg-pellets の debug 出力> [--sections 遠,中遠]   # SG の着弾点を読み、的のマスクと重ねる（V-0127）
node tools/captures/sg-map.ts <SG の録画 id> [--smg 152] [--smg-landing far]   # SG の当たりの点から的の当たる確率の地図を作る（V-0129）
node tools/captures/mask-tune.ts <録画 id> [--top 15] [--maxFp 0.02]   # 的のマスクの取り方の候補を SG の着弾点で比べる（V-0127）
```

`read.ts` は、録画を**レシピ**（名前と版を持つ読み方。`tools/captures/recipes/`）で読み、観測値（`records/observations/<録画 id>.json` の形）を出す（[../design-records-automation.md](../design-records-automation.md) 3.4 節）。`--list` でレシピと `--opt` の説明が出る。`--write` で観測値のファイルに足す（id は次の空き番号。同じレシピ・同じ版の観測値が既にあれば、同じ値なら足さず、違えば差を出して止まる）。`--against` は既存の観測値の値を並べて出す（旧の観測値の確かめ用）。中間出力（`hud.ts` の増分など）は、録画の置き場所の `derived/<録画 id>/` にキャッシュする（追跡しない。録画のファイルの大きさが変わると作り直す）。目で数える値はレシピの外（観測値の `method.note` に書く）。

- `hud-jumps`: HUD の総ダメージの最後の値（total）と、増分の数から数えたトリガーの数（count）。前の増分から 30f 未満の増分は同じトリガーの読みが割れたものとしてまとめ、まとめた組が跨ぐ長さから発の数を決める（V-0071 の「足し戻し」）。HUD が読めなかった後の読み（`hud.ts` の gap 列が 2 以上）は、読めなかった間の真ん中を組の始まりとして測る（版 2。V-0079）。版 3 は、0 と 8 を穴の数で分けるようにした `hud.ts` の読み（キャッシュ `hud-jumps@2`）で読む（V-0327）。
- `reload-segments`: `reload.ts --mode fit --shots`（増分は hud-jumps のキャッシュ）から、リロードごとの最終弾 → 完了・完了 → 次の増分・バーの長さ（V-0057 の読み方。取り消し・窓をまたいだ回・最終弾の読み違いは除く）。分割リロードは `--opt stages=1`。版 2 は、直した `hud.ts` の読み（キャッシュ `hud-jumps@2`）で読む（V-0327）。
- `sg-pellets`: SG 単騎の録画で、的のジャンプで分けた区間ごとの当たったペレットの割合・近の当たった数の分布・近の「会心 + 2 × コア」、スペック固定 OFF ならコア命中率と会心率（V-0062・V-0069・V-0070 の読み方）。区間の切れ目は、100f 以上でリロードでない空きを候補に、近の区間だけ距離ボーナスで増分の刻みが変わること（スペック固定 ON は 5 の倍数でない刻み、OFF は近の胴体でしか解けない発）で確かめる。5 番目の切れ目がリロードと重なるとき（プロダクト23）は、4 番目から 1,500〜2,600f 後で後ろが全部近以外の刻みの空きを取る。決まらないときは `--opt cuts=` で与える。スペック固定 ON の近以外の当たった数は見積もり（会心率とコア命中率は `--opt critRate=`・`coreRates=`）。近の分布は、読みが割れて 2 発以上にまとめた組も、読みを発ごとに区切って当たった数が一通りに決まれば入れる（版 3）。5 番目の切れ目がリロードと重なり後ろが 1 発だけのときは、その発が近として解けないときだけ切れ目にする（版 4。102）。
- `near-landing`: SG 単騎の録画で、近の区間ごとの照準の高さ ±30px での的の幅（的のふだんの姿勢のフレームの中央値）と、近の着地点（C-0155 の A・B。範囲の外は「決まらない」）（V-0069 の読み方の 3）。近の区間は `sg-pellets` の区間の求め方（`--opt pellet=`・`cuts=` などは同じ）か `--opt near=<f>-<f>,<f>-<f>`。区間の中を 20f ごとに `aim.ts` の部品で測り（背景は録画の全体の 120f ごと）、的の上端の y が 250 以上で fx が 0.45 未満のフレームの中央値を取る。区間ごとの測定は `derived/<録画 id>/` にキャッシュする。1 本に 5〜6 分かかる。
- `smg-mags`: SMG 単騎・スペック固定 ON・3 分モードの録画で、距離帯ごと（中近・近・遠・中遠）の完全なマガジンの弾丸命中率。総ダメージの増分（hud-jumps のキャッシュ）をヒットの数に分け、1 つの増分に入るヒットの数を、前のフレームが読めていれば 1、読めていなければ照準の横の残弾（`reticle-ammo.ts --mode series`）の差で上から抑える（C-0318。V-0200 の読み方）。区間の切れ目は、切れたマガジンと距離ボーナスの替わり目から決める（`--opt cuts` で与えてもよい）。`--opt body=<胴体>` が要る。@2（V-0215）: オートバースト ON の録画では、バーストの効果の窓（攻撃力▲・クリティカルダメージ▲で 1 ヒットの値が変わる約 5 秒）の中を窓の増分から測った格子で分け、窓にかかるマガジン（最大装弾数▲で 174 発から始まる）の撃った数を残弾の読みから数える。窓のマガジンを除いた値も説明に書く。窓の無い録画は @1 と同じ読み（`--opt windows=off` で窓を探さない）。@3 は、直した `hud.ts` の読み（キャッシュ `hud-jumps@2`）で読む（V-0327）
- `smg-cores`: SMG 単騎・スペック固定 ON・3 分モードの録画で、距離帯ごと（近・中近・中遠・遠）のコア命中率（各区間の頭の `--opt head` ヒット（既定 30）を除いた残りと全部）と、そのコアの数・当たった数（V-0110・V-0112・V-0114 の使い捨てのスクリプトの数え方。V-0298）。総ダメージの増分（hud-jumps のキャッシュ）を、胴体 × 攻撃力▲（1 と `--opt atk`）× (1 + コア + 会心 + 距離ボーナス) の格子で差 2 以内で読む。前のフレームも読めた増分は 1 ヒット、読めなかった後の増分は 1 か 2 ヒットで、ヒットの数とコアの数が一通りに決まらなければ落とす。区間の切れ目は `--opt cuts` か detectCuts（ログに 100f を超える空きを出す）。`--opt skip=<f>-<f>` の範囲は数えない。`--opt body=<胴体>` が要り、コアの倍率が 2 でないキャラは `--opt core=<コアの倍率 − 1>`

`intake.ts` は録画の取り込み（design-records-automation.md 3.3 節）。元ファイルを命名規約でリネームして置き場所の種別フォルダへ移し（`--copy` で元を残す）、素性（長さ・フレーム数・fps・大きさ・sha256）を取って `records/recordings/<録画 id>.json` を書く。編成・的・モード・スペック固定などは引数で渡し、無い項目は空（null）で出して人が埋める。日付は `--date`、無ければ元のファイル名の日付、無ければ更新日時。最後に、移した録画を [storage.md](storage.md)「バックアップ」の先（`I:/マイドライブ/nikke_project_captures/<種別>/`。環境変数 `NIKKE_BACKUP_DIR` で変えられる）へ robocopy で 1 本だけ同期し、両方の sha256 を突き合わせて、[backup-log.md](backup-log.md) に 1 行足す（sha256 の値は録画の JSON にあるので書かない）。同期先が無い・既に同じ名前がある・sha256 が違うときは終了コード 1（移動と JSON は済んでいる）。クラウド環境（Windows 以外で `NIKKE_BACKUP_DIR` が無い）と `--no-backup` では同期しない。取り込んだ後は `npm run records:table` と、キャラの確かめに `probe-result.ts --list`。

`gauge.ts` は画面右の BURST バー（x 1793〜1905・y 442）の充填率を 1 フレームずつ読む（Stage 7 のゲージ較正用）。バーストの欄を左に出した録画は `--side left`（x 8〜124。較正していない）。`events` は溜め始め・満タン・バー消失、`jumps` は 1 フレームで跳ねた増分（SR / SG の 1 発ずつ）、`series` は充填率の列。フルバースト中・CT 待ち・チェーン中はバーの位置に別の UI が出るので読めない（`-`）。**ゲージの較正を撮るときは、誰を操作しているか（照準画面が出ているニケ）を台帳に書く**。操作キャラと AI でゲージ量が違うらしい（[../verification.md](../verification.md) Stage 7 節）。

`ammo.ts` は枠アイコンの上の残弾表示「残弾/最大」を 1 フレームずつ読む（MG の射撃レートの再較正用、[../design-mg-fire-rate.md](../design-mg-fire-rate.md)）。**AI の味方の射撃フレームはこの表示からしか読めない。** 表示は中央揃えのプロポーショナルフォントなので、「/最大」の位置を先に探してから桁をテンプレート（`ammo-templates.json`、録画 41 の暗い背景のフレームから作成）と照合し、「残弾は増えない・リロード明けは最大」の制約で復号する。`mags` はマガジンごとの 1 発目・最終弾・次の最大の表示と 4f 以上止まった区間、`series` は残弾の列。`--crop` の既定は 4 人編成の 2 枠目・2 人編成の 1 枠目（枠の間隔は約 130px）。分割リロードの武器には使えない。録画 41 の全 12,573 フレームで約 30 秒。

`hud.ts` は画面上部中央の HUD の総ダメージを全フレーム読む（Stage 19-D）。`final` は最後の値（単騎なら戦闘履歴の与ダメージと同じ）、`jumps` は増えたフレームと増分（単騎で 1 フレームに 1 ヒットなら 1 ヒットの値）。数字は見本（`hud-templates.json`、録画 46 の 5 フレームから作った）と照合し、0 と 8 は見本との照合の差が小さい（0.03 未満の）とき、字の 10px 以上の穴の数（0 は 1 個・8 は 2 個）で分ける（V-0327。それまでは 0 を 8 と読むことがあった）。総ダメージは減らないので最長の非減少列から外れた読み（残った誤読・先頭の桁の欠け）を落とす。2026-09-26 に録画 10・46・47 と旧の 5 本で、最終値と 1 ヒットの値が記録と一致することを確かめた（[../verification.md](../verification.md) Stage 19-D 節）。

`aim.ts` は照準・的・コアの位置と大きさを、`--step` フレームごとに CSV で出す（Stage 18-B2 の試作、[../design-stage18.md](../design-stage18.md) 11.6 節）。

- 照準の中心は、画面の端から端まで通る細い横線・縦線から粗く求め、十字の腕（白・水色・黄）かリングを当てはめて出し直す。精度は ±2px 以内。
- 十字の隙間やリングの半径（`aim_size`）は撃っている間に広がるが、照準円（半透明の円）の大きさではない。照準円は的の上ではほぼ見えないので、空に向けた録画で測る（[guide.md](guide.md)「照準円」）。
- 的は、戦闘中のフレームの中央値を背景として、暗い画素の外接矩形を取る。爆発・遮蔽物・カットインで外れるので、区間ごとの中央値で使う。
- **コアの検出は試作の段階で、まだ信頼できない**（エフェクトや赤い所を拾う）。

`probe-result.ts` はキャラ同定用（[index.md](index.md)「誰が写っているかの確かめ方」）。複数の動画をまとめて渡せる（`--list` なら区間を出すだけで画像は書かない）。判定は `--step` フレームおきなので区間の端は ±`--step` の誤差がある。

`diff.ts` は指定領域のフレーム間差分を取り、閾値を超えた局所ピークをフレーム番号と間隔で返す。領域と閾値は録画ごとに調整が要る。2026-09-22 の較正で有効だった領域（1920×1080 での `x,y,w,h`）:

| 狙うもの               | 領域の目安        | 備考                                             |
| ---------------------- | ----------------- | ------------------------------------------------ |
| SR/RL の発射（反動）   | `300,780,700,280` | 手元。`--sigma 2 --min-gap 20`                   |
| AR の発射（反動）      | `760,620,360,300` | 同じ手元のパルス列。`--sigma 0.2 --min-gap 4`    |
| MG/SMG の命中          | `820,10,280,50`   | HUD 総ダメージカウンター。1 ヒットごとに更新     |
| ダメージ数値の読み取り | `940,220,400,180` | 的の周りに出る数値。`still.ts --crop` で切り出す |

照準の左の残弾の表示（操作キャラ。暗い四角に 3 桁の数字、000 埋め。照準と一緒に動き、残弾が少ないと赤くなる）は `reticle-ammo.ts` で読む（V-0163）。画面の中央付近で、数字の高さの明るい成分が横に等間隔に 3 つ並び、その上の帯が暗い（四角の中）組を表示とし、各桁を見本（`reticle-ammo-templates.json`、録画 099 の 1081〜1100 フレームの 169 → 150 から作成）と照合する。ダメージの数字が重なったフレームや、数字が切り替わる途中（ロール表示）のフレームは照合が悪いので捨てる（読めないフレームは出さない）。`mags` はマガジンごとの最大の表示・0 の表示・減った量の合計・増え（弾丸チャージ）、`series` は読めたフレームの値。枠アイコンの上の残弾表示は `ammo.ts`。

1 ヒットの値を読むときは、HUD 総ダメージカウンターを 1 フレームごとに並べて（`select='between(n,A,B)',crop=280:50:820:10,tile=6x30`）差分を取るのが速い。2 体編成では同じフレームに 2 人分が乗ることがある（録画 13 の 930,273 = 686,756 + 243,517）ので、単独で増えたフレームを探す。

## 証拠フレームの切り出し

証拠フレームは `E:/nikke_project_captures/frames/` に置き、公開しない（2026-09-26 にリポジトリから外した）。台帳などの `frames/…` はこのフォルダを指す。録画と一緒に Google Drive へ同期する。

各録画から 2 枚（全体像の 70% / 85% 地点）＋数値の拡大を置いてある。全体像は次のコマンドで作った。

```bash
ffmpeg -v error -i <動画> -vf "select='eq(n,<フレーム>)',crop=1260:420:340:0,scale=900:-1" \
  -fps_mode vfr -frames:v 1 -q:v 3 -y frames/<名前>_f<フレーム>.jpg
```

**証拠フレームには検証に使う部分だけを入れる。**
