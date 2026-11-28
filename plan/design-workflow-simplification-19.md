# 繰り返しの業務の簡素化の案・第 19 回（2026-11-27 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-18](design-workflow-simplification-18.md)。どれも実施済み。見直しの段（[design-review-steps.md](design-review-steps.md)）・撮影の本数（[design-capture-count.md](design-capture-count.md)）・言い回しの表の分け方（第 16 回の案 A）・使われ方の少ない道具（第 7・10・12 回）も含め、そこで扱ったものは繰り返さない。
- この回で見たもの: 第 18 回の後の PR 147 本（#1259〜#1405）。スキル定義 40 本、検証 33 本、モダン UI・最適編成計算 17 本、バッジ 12 本、設計書を縮める 7 本、作り替えの連作（[design-complexity-candidates.md](design-complexity-candidates.md)）、コミットの見直しの起票 3 本など。PR ごとに触ったファイルを数え、多くの PR が同じファイルを手で書き足しているところを探した。
- 調べ方: origin/main（334bf003）のクラウドの環境で、git の履歴を直に数えた（使い捨て。コミットしない）。PR の本数とファイルの大きさは、起案の後の 10 本（#1406〜#1415。スキル定義 3 本）を足して origin/main（3845cc47）で数え直した。この回の環境ではセッションの出来事の列を読めなかったので、所要の時間は測っていない。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | `data/skills/index.json` を無くし、定義済みのキャラの一覧をディレクトリから導く（読む所を 1 つの関数にする） | スキル定義の PR のほぼ全部（43 本中 42 本）の一覧への書き足しと、並行する PR どうしの同じ行の衝突。index.json を別々に読む 11 か所 | 画面の一覧を生成物（`support.json`）から読む形でよいか |
| 2 | キャラごとの注記を、共有の表（`burst/landing.ts` の遅れの表・`skills/states.ts` の目録）から減らす | 行を足すたびの 2〜3 行の注記（landing.ts は 157 本中 25 本、states.ts は 15 本）。結論・定義・目録の生成物の写し | いまある行も縮めるか（案 A）、新しい行だけか（案 B） |
| 3 | 定義済みのキャラの ID を手で並べるテスト 2 つを、インラインのスナップショットにする | キャラを足すたびの「落ちる → 期待値を手で直す」（trina.test.ts 11 本・jackal.test.ts 6 本） | 進めてよいか |

推奨: 1・2 の案 A・3 の全部。効きの大きい順に 1・2・3。PR は 2 本に分ける（1・3 / 2）。

決定: 推奨のとおり、1・2 の案 A・3 の全部を行う（オーナーが承認）。PR は 1・3 と 2 の 2 本。

## 1. スキル定義の一覧 index.json

**いま**

- `packages/core/data/skills/index.json` は、定義のあるキャラの resourceId を昇順に並べた一覧。いまの中身は、同じディレクトリの `<数字>.json` を昇順に並べたものとちょうど同じ（181 件。過不足なし）。
- スキル定義の PR 43 本のうち 42 本が、この一覧に 1 行足した（残りの 1 本は定義の直しだけ）。並行する定義の PR は、隣り合う行を足すことが多く、衝突の直し（auto-rebase.yml か `pr:prep`）の元になる。
- 一覧を読む所は 11 か所あり、それぞれ自分で `index.json` を読んで `resourceIds` を取る。
  - 道具: `scripts/sim-run.ts`・`scripts/data-diff.ts`・`scripts/records-data.ts`（4 か所）
  - テスト: `__tests__/data.ts`・`skills/__tests__/definitions.test.ts`・`trina.test.ts`・`jackal.test.ts`・`apps/web/src/compute.test.ts`
  - 画面: `load.ts` の `loadSkillIndex`（`useSkillDefinitions.ts` が読む）。ビルドの確かめ（`apps/web/scripts/check-pages-build.ts`）も、ビルドに index.json があるかを見る。
- [skills-guide.md](skills-guide.md) の手順にも「`data/skills/{resourceId}.json` と `index.json`」とあり、書き忘れると定義が読まれない。

**案**

- Node の側（道具とテスト）は、ディレクトリの `<数字>.json` を昇順に並べる関数 1 つ（例: `definedSkillIds()`）を読む。11 か所の読み方をこれに替える。
- 画面は、`records:check` が書く生成物 `support.json` に定義のあるキャラの一覧（`defined`）を足し、それを読む。`loadSkillIndex` と index.json の取得を消し、`support.json` の取得 1 本にする。Pages は main で生成物を作り直した後にビルドするので、新しい定義も載る。
- `index.json`・`parseSkillIndex`・`SkillIndex` の型、ビルドの確かめの 1 行、skills-guide.md の「と `index.json`」を消す。
- 定義を足す手順は「`data/skills/<id>.json` を置く」だけになる。

**気を付けること**

- PR のブランチでは生成物が main の版に戻るので、手元の画面で新しいキャラの定義を見るには `npm run records:minimal` を回す（`records:check` は生成物を PR のブランチの版に戻す）。Node の側のテストは関数を読むので、生成物に頼らない。画面の部品のテスト（`OptimalPartyPanel.test.tsx`）は `support.json` を読むが、決まったキャラだけを使うので main の版で足りる（`pr:prep` と CI は作り直してから回す）。

**採らない案**: index.json を生成物にする。Node の側がそれを読むと、PR のブランチでは main の版に戻った一覧を読み、足したキャラがテストから抜ける。

## 2. 共有の表のキャラごとの注記

**いま**

- `burst/landing.ts` の `MEASURED_BURST_DELAYS`（バーストの遅れの実測の表。[skills-guide.md](skills-guide.md) 1.4 節「実測でしか決まらない値は、表の 1 行にして結論の ID を添える」）は 72 行あり、行ごとに 2〜3 行の注記が付く（注記は 150 行。ファイルは 408 行）。
  - 注記の多くは、行の値の出どころの写し（「III のタイマーの 00.00 からヒットまで 7f（動画で 29f。止まり 22f を含む）」）。動画のフレームからの換算（止まり 22f を引く）を書いた行が 54 行ある。値の出どころは、行の `claim` が指す結論にある。
  - 157 本中 25 本（スキル定義では 43 本中 22 本）がこの表に行を足した。
- `skills/states.ts`（名前の付いた状態の目録。47KB）は、状態ごとに注記が付く（133 個）。注記は「〈どのキャラのどのスロット〉。〈効果〉・〈秒数〉。〈どのスキルが見るか〉」で、効果・秒数・スタックは定義（`data/skills/`）にあり、キャラと中身は生成物 [skill-catalog.md](skill-catalog.md) 4.1 節の表（名前・側・参照・中身・キャラ）にも出る。157 本中 15 本が状態を足した。
- 注記はキャラを足すたびに書くが、表の値・定義・結論と同じことを書くので、書く手間と読む量が増えるだけで、ずれても検査で分からない。

**案 A（推奨）: 注記は、値から読めないことだけにする。いまある行も縮める**

- 遅れの表の注記は「キャラ名（とスロット・宝物の有無）」と、行の値だけでは分からない例外（「宝物なしは未測定」「効果の遅れは未測定で、表に無いときの既定と同じ値」など）だけにする。動画のフレームからの換算は、表の冒頭の説明に 1 回だけ書く（いまの冒頭の説明に起点の読み方はある）。数値と根拠は `claim` の結論で引く。
- 状態の目録の注記は「キャラ名とスロット」と、前提の外にした中身など定義から読めないことだけにする。
- いまある行の注記は 1 つの PR で縮める（コメントだけの変更。計算は変わらない）。見込みは、landing.ts が 408 行 → 約 330 行、states.ts が 47KB → 約 25KB。
- skills-guide.md 1.4 節の「表の 1 行にして結論の ID を添える」の後に、「注記はキャラ名と、値から読めないことだけ」と足す。

**案 B: 新しい行だけ短く書く**

- いまある注記は残し、これから足す行だけ案 A の形にする。書く手間は減るが、ファイルを読む量は減らない。

## 3. 定義済みのキャラの ID を手で並べるテスト

**いま**

- `skills/__tests__/trina.test.ts` の「敵全体に」の印の付くバースト（`marks the 敵全体に bursts of the defined characters`）と、`jackal.test.ts` の「敵1機に」の印（`marks the 敵1機に bursts of the defined characters`）は、全部の定義を読んで印の付くキャラの ID を集め、手で並べた一覧と比べる。
- 印の付くキャラを足した PR は、このテストが落ち、期待値の一覧に ID を手で書き足す（157 本中、trina.test.ts は 11 本・jackal.test.ts は 6 本）。
- 一覧はキャラを足すたびに伸び、読み取りの誤りで印が付いた・外れたことを差分で見せるためのもの。

**案**

- 期待値を `toMatchInlineSnapshot()` にする。キャラを足した PR では `npx vitest run <ファイル> -u` で一覧が書き換わり、変わった ID はいまと同じく PR の差分に出る。見直し（`/code-review`）が差分を見るので、意図しない印は今と同じく見つかる。
- 書き換えの手順は、落ちたテストの出す差分を見て `-u` で回す、の 1 行を skills-guide.md 1.4 節に足す。

## 4. 見たが案にしなかったもの

- **`plan/skill-phrases.md` の大きさ**: 39.2KB（第 18 回の時点の 28.5KB から、1 週間で 32 行・10.6KB 伸びた）。このままだと 1 週間ほどで目安の 50KB を超える。分け方は第 16 回の案 A で決めてある（大分類ごとのファイルに分ける）ので、`pr:prep` が知らせたらそのとおりに分ける。
- **`plan/captures/guide.md` の大きさ**: 46.5KB（1 週間で 3KB 伸びた）。超えたら「画面の読み方」を分ける（第 18 回 4 節）。
- **コミットの見直しの起票**: 日次の見直しが、1 日 1 本の PR で課題を 1 件（`core-test-gaps-1122` など）足している。前の起票（#1251 の 8 件）は全部閉じたので、起票は働いている。PR 1 本の手間は機械（`pr:prep` と CI）の時間だけなので、案にしない。
- **バッジ**: 第 18 回の後の描き直しの PR は、元の SVG と書き出しの 2 ファイルだけになった（#1353・#1402）。
- **作り替えの連作・設計書を縮める**: どちらも 1 回きりの連作で、繰り返す業務ではない。
- **Antigravity の併用ルール**: 第 3 回で「今も使う」として残した。いまも origin と main の履歴（1853 件）に `antigrav/` のブランチ・commit は無い。使わなくなっていれば、AGENTS.md の併用ルールと `sync-after-merge-lib.ts` の `antigrav/` を縮められる（オーナーが使い方を変えたときに見直す）。

## 5. 経過

- 2026-11-27: 起案した。
- 2026-11-28: オーナーが 1・2 の案 A・3 を承認した。
- 2026-11-28: 1・3 を実装した。Node の側は `scripts/defined-skills.ts` の `definedSkillIds`、画面は `support.json` の `defined` を読む。衝突の直しで index.json が戻らないよう、`data/skills/` に定義と `support.json` のほかが無いことをテストが見る。
