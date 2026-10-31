# 繰り返しの業務の簡素化の案・第 8 回（2026-10-31 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。2026-10-31 にオーナーが 1〜3 を承認し、実施した（7 節）。4 はオーナーが行う。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-7](design-workflow-simplification-7.md)。どれも実施済み。そこで扱ったものは繰り返さない。
- この回で見たもの: PR の前の確認（`pr:prep` の中の `npm run ci`）と生成物の作り直し（`records:check`）にかかる時間、道具・レシピ・npm のスクリプトの使われ方、origin のブランチ、最小構成の感度の全部の計算し直し（[verification-guide.md](verification-guide.md) 7 節の「定期の見直し」の分）。
- 調べ方: origin/main（a5cc5f9f）のクラウドの環境（4 コア）で、各コマンドの時間を測った。道具の使われ方は、観測値の `method.tool` を道具ごとに数えた（使い捨てのスクリプト。コミットしない）。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | `pr:prep` の確認で、書式（prettier）と lint は変えたファイルだけを見る。全部のファイルは GitHub の CI が見る | `pr:prep` 1 回あたり約 60 秒（書式 52 秒・lint 16 秒 → 約 8 秒） | 進めてよいか |
| 2 | 観測値の残差（モデルの予測値）を、モデルの入力の hash で覚え、`records:check` と `npm test` が使い回す | 同じセッションで 2 回目からの `records:check` の約 22 秒（30 秒 → 約 8 秒の見込み）と、`npm test` の同じ計算 | 進めてよいか |
| 3 | 感度の全部の計算し直しで出た差（エラーの文言だけ）を、この回で作り直した | なし（この回の作業） | 直した `sensitivity.json` を入れてよいか |
| 4 | 中身が main に入ったか取り下げた、origin の古いブランチ 4 本を消す | 並行の作業の確かめで見るブランチ | 消してよいか（消すのはオーナー） |

推奨は 1〜4 を全部進める。1 は PR ごと、2 は検証の作業中に何度も効く。3・4 は一度きりの片付け。

## 1. `pr:prep` の確認を、書式と lint は変えたファイルに絞る

**いま**

- `pr:prep` は終わりに `npm run ci`（書式・lint・型・テスト・ビルド）を回し、GitHub の CI（`.github/workflows/ci.yml`）も同じものを全部回す。PR ごとに同じ確認が 2 回走る。
- クラウドの環境で測った時間:

<!-- prettier-ignore -->
| 段 | 時間 | 手直しの後（見込み） |
| --- | --- | --- |
| `format:check`（prettier。リポジトリの全部） | 52 秒 | 変えたファイルだけで 6〜7 秒（PR #827 の 22 ファイル・#822 の 17 ファイルで測った。そのうち `plan/claims.md` 1 つで 3.4 秒） |
| `lint`（eslint。全部） | 16 秒 | 変えたファイルだけで 2 秒 |
| `typecheck` | 22 秒 | そのまま（下の「ほかの手」） |
| `npm test` | 92 秒 | そのまま |
| `build` | 7 秒 | そのまま |

- 書式と lint は、ファイルごとに決まる（eslint は型を使う規則を入れていない。`eslint.config.js`）。main は CI を通っているので、ブランチで変えていないファイルは、設定が同じなら結果も同じ。

**案**

- `pr:prep` の確認を、`npm run ci` から次に替える: 変えたファイル（`git diff --name-only origin/main...HEAD` と、作り直した生成物）だけに `prettier --check --ignore-unknown` と `eslint` を回し、`typecheck`・`test`・`build` は今のまま全部回す。
- 書式・lint の設定（`.prettierrc.json`・`.prettierignore`・`eslint.config.js`・`package-lock.json`）を変えたブランチでは、今のまま全部を見る。
- `npm run ci` は残す（手で全部を見たいとき・`records:close --ci`）。GitHub の CI も変えない。そこで落ちたら、今と同じく PR で直す。
- AGENTS.md「コミット手順」の 1 の「CI と同じ確認（`npm run ci`）」を「書式と lint は変えたファイルだけの確認」に直す（`pr-prep.ts` の冒頭も）。

**効果**: `pr:prep` 1 回で約 60 秒短くなる（直近の 2 日で PR は約 45 本。衝突で回し直すと、その分も）。

**ほかの手（推奨しない）**

- `prettier --cache --cache-strategy content`・`eslint --cache` を全部に付ける: 2 回目からは 8 秒・1.5 秒になるが、クラウドのセッションも worktree も始めはキャッシュが無く、多くのセッションの `pr:prep` の 1 回目は速くならない。
- `tsc --incremental`: `packages/core` で 2 回目が 8.5 秒 → 2.9 秒だが、同じくセッションの 1 回目は速くならない。型の確認は、変えたファイルに絞れない。

## 2. 観測値の残差を、モデルの入力の hash で覚える

**いま**

- `records:check` は約 58 秒かかる。内訳は `records-check.ts` が 30 秒（そのうち `runObservations` が 22.7 秒。比べる観測値の録画と条件の組 536 通りを、全部 sim で回す）、書式の整え直しが 11 秒、ほかは 1 秒未満。
- 検証の作業中は、観測値を足すたびに `records:check` を回す。モデルのコードもスキル定義も変えていないのに、毎回 536 通りを回し直している。
- `npm test` も、`observations.test.ts` が同じ `runObservations` を回す（残差の一覧が生成物と 1 字まで同じかを見るため）。

**案**

- `runObservations` の結果（観測値ごとの予測値と状態）を、`node_modules/.cache/residuals/` に覚える。鍵は「モデルの入力の hash」: `packages/core/src/`・`packages/core/data/` の全部のファイルの中身と、その観測値の `compare` と録画の JSON と、その `compare` が ID で指すほかの観測値の値（`loadRecordsData` の `observationValues`。条件や引数が、ほかの観測値の ID で時刻を指せるため）。値の表の全部を鍵にすると、観測値を 1 つ足すたびに全部を回し直すことになるので、指している値だけを入れる。
- 鍵が合えば sim を回さず覚えた値を使う。合わない組だけ回す。コードを 1 字でも変えれば全部を回し直すので、古い値が残る道は無い（感度の鍵がモデルのコードを含まないのとは違う。[design-workflow-simplification-5.md](design-workflow-simplification-5.md) 7.2 節）。
- GitHub の CI はキャッシュが無いので、今のまま全部を回す（最後の守り）。

**効果**: 同じセッションで 2 回目からの `records:check` が約 30 秒 → 約 8 秒（新しく足した観測値の録画だけを回す）。`npm test` の同じ計算も、`records:check` の後なら覚えた値で済む。直近の 45 本の PR のうち 13 本はモデルのコードもデータも変えておらず、`pr:prep` の中の作り直しとテストでも効く。

**気をつけること**: 鍵の入力の漏れ（モデルが読むのに鍵に入っていないファイル）があると、古い値を使う。実装の PR で、`runSimulation` と `buildTeamInput` が読むファイルを洗い、鍵の入力の一覧をテストで持つ。覚えを使わない道（環境変数 `NIKKE_NO_RESIDUAL_CACHE=1`）も付ける。

## 3. 感度の全部の計算し直しで出た差（この回で作り直した）

- [verification-guide.md](verification-guide.md) 7 節のとおり、`npm run records:minimal -- --all`（98 秒）を回すと、`records/minimal/sensitivity.json` の 2 行が変わった。観測値 `0755-07`・`0755-08` の `error` の文言だけで（「窓の中の発動が 0 回しかない」→「出来事（dotApply）が 0 回しか無い」）、感度の値はどれも変わらない。
- 原因は第 7 回の 2（`dotHitVideoFrames` を `eventFrames` の包みにした）で、指標のエラーの文が変わったこと。鍵がモデルのコードを含まないので、ふだんの差分の計算では作り直されなかった。決まりのとおりの出方で、鍵に足すものは無い。
- 作り直した `sensitivity.json` を、この文書と同じブランチに commit した。

## 4. 古いブランチを消す

origin に、次の 4 本が残っている（どれも PR が無いか、中身が別のブランチの PR で main に入った）。マージした PR のブランチは自動で消えているが、番号を押さえた後に作業を別のブランチに移したり取り下げたりしたブランチは残る。

<!-- prettier-ignore -->
| ブランチ | 最後のコミット | いま |
| --- | --- | --- |
| `claude/eager-maxwell-lhgvfv` | 2026-10-28「段 12 の論点 1〜9 をオーナーの決定どおり推奨に決める」 | 段 12 は #795 で決着した |
| `claude/gifted-gates-zouf70` | 2026-10-29「録画 0731・0732 のラピ：レッドフード（操作）は撃たない枠と台帳に書く」 | 同じ台帳の行が main にある |
| `claude/unstarted-projects-list-11jafn` | 2026-10-29「V-0542: 試し撮りの 2 本を 10 本ずつに数え…」 | V-0542 は #806 で main に入った |
| `claude/kind-meitner-joepfy` | 2026-10-31（紅蓮：神殺の撮影計画を取り下げたコミット。番号は main に入っていない） | 足したファイルを消して終わっている（main との差は無い） |

- 消すのはオーナー（この環境では、ブランチを消すのが安全確認で止まる。第 7 回の 4）。GitHub のブランチの画面か、デスクトップで `git push origin --delete <ブランチ>`。

## 5. 見たが案にしなかったもの

- **使われていない道具**: 観測値の `method.tool` で数えると、レシピは 13 個とも使われている。観測値に出ない `hud-interception.ts`・`result-screen.ts`（迎撃戦の段のため）・`probe.ts`（写しの突き合わせ）は第 7 回で残すとしたもの。npm のスクリプトも、どれも手引きか道具から呼ばれている。
- **使い捨てのスクリプト**: 観測値の `method.tool` に「使い捨て」とあるのは、V-0548 の後では 9 個だけ（それまでは約 2,000 個）。第 3 回・第 7 回の `buff-edge` と `eventFrames` が効いている。
- **遅いテスト**: `cadenceConvergence.test.ts` が 14 秒（18,000 秒の戦闘で収束を見る）。テストの時間はコアの数で決まり（4 コアで 92 秒、CPU の合計は 4 分 43 秒）、これ 1 つを縮めても数秒しか変わらない。モデルの性質を見るテストなので残す。
- **`plan/captures/guide.md`**: 42.7KB で、手書きの目安の 50KB に近い。今は分けない。50KB を超えそうになったら、話題（射撃場の条件・画面の読み方・動画と道具）で分ける。

## 6. 実施の分け方（承認されたら）

- 1〜3 を 1 つの PR にした（7 節）。4 はオーナーの操作。

## 7. 判断と実施

**判断（2026-10-31）**: 1〜3 を承認。4 はオーナーが行う。

- 1: `tools/git/pr-prep-lib.ts` の `changedChecks` が、`git diff --name-only origin/main...HEAD` のうち消していないファイルを書式の対象に、そのうち `.js`・`.ts`・`.tsx` などを lint の対象にする。`pr-prep.ts` は、それに `prettier --check --ignore-unknown` と `eslint --no-warn-ignored` を回し（`.prettierignore` と eslint の ignores にあるファイルは渡しても見ない）、`typecheck`・`test`・`build` は全部回す。案のほかに、変えたファイルが 300 件を超えたら全部を見る（Windows のコマンドラインの長さの上限を避ける）。設定のファイルには `package.json` も入れた（prettier・eslint の版が変わりうる）。AGENTS.md「コミット手順」の 1 と [verification-guide.md](verification-guide.md) 9 節の 1 行を直した。
- 2: `runObservations` に、覚え（`PredictionMemo`）を受ける引数を足し、鍵の入力を `predictionKey`（録画の JSON・比べる指定・比べる指定が ID で指す観測値の値）にした。覚えの読み書きとモデルのコードとデータの hash は `packages/core/scripts/residual-cache.ts`。`records:check`・`records:close`・`records:residual`・`records:new` と `observations.test.ts` がそれを使う。覚えはモデルの hash ごとに 1 ファイルで、新しい 4 つを残す。テストのファイル（`__tests__`）は hash に入れない。NaN・Infinity は JSON で往復できないので覚えない。
  - 測った時間（このクラウドの環境）: `records-check.ts` は覚えなしで 31 秒、覚えありの 2 回目で 2.8 秒。`npm run records:check` は、2 回目で 15 秒（残りは書式の整え直しの 11 秒）。覚えありでもなしでも、生成物は 1 字も変わらなかった。
  - 案の「`buildTeamInput` が読むファイルを洗う」は、`loadRecordsData` がディスクから読むのが `packages/core/data/` と観測値だけだと確かめ、観測値は指している値だけを鍵に入れた。
- 3: 案のとおり（`sensitivity.json` の 2 行）。
- 2026-11-01 のデイリーレビューで見つかった穴を直した: 予測値の覚えの hash に、読み込みのコード（`records-data.ts`）と `residual-cache.ts` 自身を入れ、そこから import で辿れるファイルが全部 hash に入ることと、鍵が録画・条件・引数で変わることをテストで持った（2 節で約束した鍵の入力の一覧のテスト）。録画が無いときの鍵に録画の ID を入れ、許容の無い下書きは前と同じく比べられない 1 行にした。`pr:prep` は、パスの一覧を `git … -z` で読み（日本語のパスが引用符で包まれて書式の確認から抜けていた）、型・テスト・ビルドの段を `npm run ci` から書式と lint を除いて組み、全部を見る設定を名前の形（どの階層の `.prettierrc*`・`.editorconfig`・`eslint.config.*`・`package.json` も）で判定する。
