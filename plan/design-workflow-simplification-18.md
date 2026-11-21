# 繰り返しの業務の簡素化の案・第 18 回（2026-11-20 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-17](design-workflow-simplification-17.md)。どれも実施済み。見直しの段（[design-review-steps.md](design-review-steps.md)）・撮影の本数（[design-capture-count.md](design-capture-count.md)）・バッジの置き方（[design-modern-ui.md](design-modern-ui.md) 2.5 節の決定 3〜5）も含め、そこで扱ったものは繰り返さない。
- この回で見たもの: 第 17 回の後の PR 22 本（#1237〜#1258）。バッジ 11 本（#1240・#1242・#1246〜#1250・#1253〜#1256）、モダン UI 1 本（#1257）、撮影の検証 3 本（#1244・#1252・#1258）、第 17 回の道具 4 本（#1237〜#1239・#1243）、コードの整理 2 本（#1241・#1245）、課題の起票 1 本（#1251）。
- 調べ方: origin/main（63daef27）のクラウドの環境で、git の履歴・PR の本文・記録のファイルを直に読んで数えた（使い捨て。コミットしない）。この回の環境ではセッションの出来事の列を読めなかったので、所要の時間は測っていない。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | 入力の観測値を読み直したら、それを指す比べの setup を付け替える（`records:new observation --invalidate <入力> --by <新>` が、結論の根拠に加えて比べの setup の参照も付け替える） | 読み直しのたびの比べの写しと無効（#1258 で 11 本・写し 22 件・無効 22 件・約 800 行） | 比べの setup の参照をその場で書き換えてよいか |
| 2 | バッジの名前の一覧を 1 か所にする（スプライトに入るバッジを書き出しの道具が決め、画面は 1 つの glob で読む） | 画面のバッジを足すたびの 2 ファイルの一覧の書き足し（バッジの PR 11 本中 4 本） | 進めてよいか |
| 3 | `pr:prep` がバッジを書き出す（`badges-src/` が書き出しと合わなければ `badges:build` を回して commit する） | 描き直しの PR での書き出しの手順と、書き忘れでテストが落ちる往復 | 進めてよいか |

推奨: 1〜3 の全部。効きの大きい順に 1・2・3。PR は 2 本に分ける（1 / 2・3）。

## 1. 入力の観測値の読み直しと、比べの写し

**いま**

- 比べ（`use: compare`）の setup は、録画から読んだ入力（`use: input`。的のジャンプの窓・障害物の数・ペレットの当たりなど）を観測値の ID で指す（`setup.jumpWindows: "1119-03"` など。`observations/setup.ts`）。
- 入力を読み直すと、新しい入力の観測値を足すだけでは済まない。それを指す比べを、値・説明・method ごと写して新しい ID で足し、前の比べに invalid を付けた。
  - #1258: 11 本の録画で、入力 11 件の読み直しに対し、比べの写し 22 件と無効 22 件。写しの説明は「値は 1119-02 と同じ」「1119-02 と同じ値」で、値は元の比べの写し。
  - 観測値のファイルに「〜と同じ値」の写しのある録画は 109 本。このうち、同じ値を別の条件（代表値のジャンプ・録画のジャンプ）で比べるもの（#1252 の初回）は意味のある写しなので、案の外。
- 第 17 回の `--invalidate <ID> --by <新しい ID>` は、結論の根拠だけを付け替え、比べの setup の参照は付け替えない。

**案**

- `--invalidate <入力の ID> --by <新しい入力の ID>` が、無効にした入力を setup で指している比べ（`jumpWindows`・`obstacles[].count`・`pelletHits`・`manualBursts` など、`validate.ts` の `ref` で見る欄）の参照を新しい ID に書き換える。比べ自体は写さず、無効にもしない。書き換えた比べの ID を出す。
- 決まり: 入力の**読み直し**（同じものを読み方を直して読む）は、比べの参照を付け替える。入力の**別の条件**（代表値に対して録画の値など）で比べたいときは、今と同じく比べを足す。[verification-guide.md](verification-guide.md) の 6 節（読む）に 1 行足す。
- 前の参照での予測は、git の履歴と検証記録の本文（残差の前後）に残る。

**判断してほしいこと**: 比べの setup の参照をその場で書き換えることは、「書いた事実は書き換えない」（AGENTS.md）に当たらない、としてよいか。比べの事実は値（録画から読んだもの）で、setup はモデルの入力の指定なので、当たらないと考える。

## 2. バッジの名前の一覧

**いま**

- 画面のスプライトに入るバッジ（白黒で描き、色を CSS で決めるもの）を足すと、2 つのファイルの一覧に同じ名前を書く。
  - 書き出しの道具の `MONOCHROME_NAMES`（`apps/web/scripts/badges.ts:76`）: 書き出しで色を CSS の変数にする。
  - 画面の `import.meta.glob` の並び（`apps/web/src/components/modern/badges.ts:23`）: スプライトに読む。
  - そのうえで、使う場所の定数（`badgeName('ui_...')`）を足す。
- 2 つの一覧は、グループ（`element`〜`main`）が `MONOCHROME_GROUPS` と同じで、`ui_*` は `ui_blank_main` のほかは `MONOCHROME_NAMES` と同じ。片方だけに書くと、色が CSS で変わらないか、`badgeViewBox` が実行時に落ちる。
- 4 本（#1246 の `ui_cu`・`ui_mcu`、#1247 の `ui_arrow`、#1250 の `ui_light` など 3 個、#1255 の `ui_classic`・`ui_modern`）が両方に書き足した。

**案**

- 書き出しの道具が、スプライトに入るバッジを `src/assets/badges/sprite/` に、それ以外（`<img>` で読む `ui_check`・`ui_selection_*` と、使っていないもの）を `src/assets/badges/` に書き出す。スプライトに入るかは、道具の一覧 1 つ（いまの `MONOCHROME_GROUPS`・`MONOCHROME_NAMES` に、色のままスプライトに入る `ui_blank_main` を足したもの）で決める。
- 画面の glob は `'../../assets/badges/sprite/*.svg'` の 1 つにする（束に入るのはスプライトのバッジだけ、は変わらない）。
- 画面のバッジを足す手順は、道具の一覧に 1 行と、使う場所の定数だけになる。`apps/web/scripts/badges.ts` の冒頭の説明を直す。

## 3. バッジの書き出しを pr:prep に寄せる

**いま**

- オーナーが Inkscape で `badges-src/` を描き直し、エージェントが `npm run badges:build` で書き出して PR にする。書き出しだけの PR が 3 本（#1248・#1254・#1256）。バッジを足すか直すほかの PR も、毎回書き出しを含む。
- 書き出しを忘れると、`scripts/badges.test.ts`（書き出しが元を小さくしたものと同じか）が `pr:prep` のテストで落ち、書き出して commit し直す。

**案**

- `pr:prep` の手順 4（生成物の作り直し）で、`badges:build` を回し、`src/assets/badges/` が変わったら「バッジの書き出し」の commit を足す（いまの「records:check の書き換え」の commit と同じ扱い）。書き出しは決定的なので、変わらなければ何もしない。
- 描き直しの PR の手順は、元の取り込みと `pr:prep` だけになる。`apps/web/scripts/badges.ts` の冒頭の「これを回す」は「pr:prep が回す（手元で見るときは npm run badges:build）」にする。

## 4. 見たが案にしなかったもの

- **使っていないバッジの書き出し**: `src/assets/badges/` の 67 個のうち、どこからも読まれないものが 15 個（`burst_*`・`rarity_*`・`ui_bell`・`ui_caution`・型の `ui_blank_*`）。束には入らず、置く決まり（[design-modern-ui.md](design-modern-ui.md) 2.5 節の決定 3）があるので、案にしない。2 の案で `sprite/` の外に出るので、書き出し直しの差分にスプライトの外のものが混ざることは変わらない。
- **`plan/captures/guide.md` の大きさ**: 43.5KB で目安の 50KB に近いが、10-20 からの変更は 2 回だけ。超えそうになったら「画面の読み方」（21KB）を分ける。
- **見直しのフォローアップの起票**: 日次の見直しの指摘を別の PR で課題にした（#1251）が、1 回だけ。
- **第 17 回の道具の使われ方**: PR の本文に名前が出たのは `code:survey`（#1241）と `records:new backlog`（#1251）だけ。ほかはセッションの出来事の列を読める回で見る。

## 5. 経過

- 2026-11-20: 起案した。
- 2026-11-21: オーナーが 1〜3 を承認した。1・2・3 を 1 つの PR で実装した（ブランチを 1 本で進めたため、案の 2 本には分けなかった）。1 は `observationEdits.ts` の `repointSetup`・`setupRefIds` で、`--by` が無いときは setup で指したままの比べを出す。2 はグループの外の一覧を `SPRITE_NAMES`（名前 → `monochrome`・`color`）にした。3 は `pr:prep` の手順 4 の後で回す。
