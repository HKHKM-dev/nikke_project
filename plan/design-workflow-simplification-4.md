# 繰り返しの業務の簡素化の案・第 4 回（2026-10-27 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。オーナーの判断を待つ（0 節の「判断してほしいこと」）。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)（2026-10-24）・[design-workflow-simplification-2.md](design-workflow-simplification-2.md)（2026-10-25）・[design-workflow-simplification-3.md](design-workflow-simplification-3.md)（2026-10-26。どれも実施済み）。そこで扱ったものは繰り返さない。
- 調べた範囲: [AGENTS.md](../AGENTS.md)「コミット手順」、[verification-guide.md](verification-guide.md)、[skills-guide.md](skills-guide.md)、[captures/protocol.md](captures/protocol.md)、[roadmap.md](roadmap.md)・[backlog.md](backlog.md)、`package.json` のスクリプト、解析ツールとレシピ（`tools/captures/`）、`packages/core/src/__tests__/` の編成のテスト。
- 調べ方: origin/main（198f33d）で、直近 50 件のコミットが触るファイルを数え、観測値の `method.tool` をツールごとに数え、`records:check`・`records:minimal`・`npm test` の時間を測った（クラウドの 4 コア）。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | 一本化（sim と calc）の後片付け: 「sim vs calc」の自己比較のテストを外し、skills-guide.md から calc の手順を消す | 語彙を足す PR ごとの手順 1 つと確かめ 1 項目、同じ計算の 2 回の実行（テスト 55 本）、`npm test` の最長のファイルの約半分 | 進めてよいか |
| 2 | PR の前のリベースを 1 つのコマンドにする（生成物の衝突は main の版を取り、終わりに 1 回だけ作り直して CI を回す） | PR ごとの手作業の 4〜6 手と、閉じるときとリベースの後の CI の 2 回目 | 進めてよいか |
| 3 | 課題の起票を backlog.md の 1 か所にする（roadmap.md「今後の課題」を backlog に寄せる） | 新しい課題・状態の変化ごとの 2 か所の書き換え（直近 50 件の 14 件が両方を触る） | 進めてよいか |
| 4 | 小さな直し（設計書の「経過」に結論の確定を書き写さない・protocol.md の重複・`skills:catalog` のスクリプト） | PR ごとの設計書の 1 行と、二度書きの 2 か所 | 進めてよいか |

推奨は 1〜4 を全部進める。1 と 2 が効果が大きい。

## 1. 一本化の後片付け（テストと skills-guide.md）

**いま**

- 2026-10-27 の一本化（[design-unify-sim-calc.md](design-unify-sim-calc.md)）で、テストの `runTeam(input)` は `simTeamResult(input, runSimulation(input))` になった（`__tests__/runTeam.ts`）。
- ところが編成のテスト 41 本（`*Team.test.ts` ほか）は、今も `describe.each(...)('sim vs calc: %s')` で `runSimulation(input)` と `runTeam(input)` を並べ、「schedule・区間・グループの発数とダメージが一致する」「1 枠 5%・編成 3% の中に入る」を見ている（115 か所）。どちらも同じ `runSimulation` の結果なので、落ちることが無い。`runSimulation` と `runTeam` の両方を回すテストファイルは 55 本で、同じ計算を 2 回している。
- `simCalc.test.ts`（`npm test` でいちばん長い。単独で 24 秒）も同じ形。設計書 5.4 節は「段 1（厳密一致）と段 3（収束）は自明になる。平均レートの閉じた式の検算として書き直す」としたが、まだ書き直していない。いまの収束のテストは、すでに平均レート（`averageRateTotal`）と比べているので意味があるが、`both()` が同じ計算を 2 回回す。試しに `both()`・`bothTimed()` で `runSimulation` を 1 回にすると、20 件とも通り、24 秒が 13 秒になった（手元で試して戻した）。
- [skills-guide.md](skills-guide.md) に、calc を前提にした手順が 5 か所残っている: 0 節の完了条件「sim と calc が整合する」、1.5 節「sim → calc の順で」と手順 4「calc（`calc/model.ts`）」（消したファイル）、テストの「sim と calc が整合することを見る」、4 節の確かめ「実戦的な編成で sim と calc が整合するテストがある」。語彙を足す PR のたびに、無い手順を読み、意味の無いテストを書き足すことになる。

**案**

- 編成のテストの「sim vs calc」の `describe` を外す。そのキャラの効果を見る `it`（窓・発動・付与の中身。例 `deltaTeam.test.ts` の「gives no damage buff windows … from Delta」）と、射撃の列がどのグループにも 1 回ずつ入る検算（`partitions every shot`）は残す。`runSimulation` は 1 回だけ回し、画面の形が要るときは `simTeamResult(input, sim)` にする。
- `simCalc.test.ts` は設計書 5.4 節の案のとおり、平均レートの閉じた式との検算（1 マガジン以内・18,000 秒で 0.5% 未満）だけにし、`runSimulation` は 1 回にする。ファイル名は `cadenceConvergence.test.ts` などに替える。
- skills-guide.md の 5 か所は、完了条件を「そのキャラを含む実戦的な編成のテストで、そのキャラの効果（窓・発動・付与）が意図どおりに出る」にし、1.5 節の手順 4 と「sim → calc の順で」を消す。4 節の確かめも同じ文に替える。
- テストが見る数値は変えない（外すのは常に一致する比べだけ）。外す前後で、残す `it` の数と `npm test` の時間を PR に書く。

**効果**: 語彙を足す PR の手順が 1 つ減り、編成のテストを書く量が減る。`npm test` の CPU 時間は、`simCalc.test.ts` で約 11 秒、ほかの 54 本の 2 回目の計算のぶんも減る。

**気をつけること**: 「sim vs calc」の `describe` の中に、キャラ固有の中身を見る `it` が入っているファイルがある（例 `deltaTeam.test.ts` の「gives no damage buff windows …」）。それは別の `describe` に移して残す。

## 2. PR の前のリベースを 1 つのコマンドにする

**いま**

- 検証の PR は、生成物 7 つ（`plan/claims.md`・`verifications.md`・`residuals.md`・`minimal.md`・`skills.md`・`captures/recordings.md`・`records/minimal/sensitivity.json`）をどれも触る（直近 50 件のうち 20〜27 件）。どれも件数の行を書き換えるので、並行する PR どうしはリベースで衝突する（第 3 回 2 節）。
- AGENTS.md「コミット手順」の 1 は、衝突のたびに `git checkout --ours -- <ファイル>` → `records:check`（54 秒）か `records:minimal`（93 秒）で作り直し → `git rebase --continue`。衝突するコミットが 2 つあれば 2 回作り直す。エージェントは毎回、衝突したファイルが生成物だけかを目で見て分ける。
- その前の `records:close -- V-NNNN --mark` が `records:minimal` と `npm run ci`（2 分 53 秒。うち `npm test` が 93 秒）を回し、リベースの後に手順 2 でもう一度 `npm run ci` を回す。main が進んでいれば、CI を 2 回回すことになる。

**案**

- `npm run pr:prep`（名前は案。`tools/git/pr-prep.ts`）を足す:
  1. `git fetch origin` → `git rebase origin/main`。
  2. 衝突したら、衝突したファイルが全部生成物（`records:check` が書くもの。一覧は道具が持つ）なら main の版を取って `rebase --continue` する。生成物でないファイルが 1 つでもあれば、そこで止めてファイルを出す（人が直す）。
  3. 終わったら、生成物を 1 回だけ作り直す（`sensitivity.json` が衝突したか、スキル定義・録画の台帳・観測値の比べる指定が main で変わっていれば `records:minimal`、ほかは `records:check`）。差分があれば「生成物を作り直す」の commit を 1 つ足す（スカッシュマージなので、途中のコミットの生成物は合っていなくてよい）。
  4. 自分のブランチで足した ID（V-・C-・録画）が main と重なっていたら、止めて `records:renumber` のコマンドを出す（今の手順の `rebase --abort` から振り直す流れを、道具が見つけて案内する）。
  5. `npm run ci` を回す。`--push` を付けると、通ったら `git push --force-with-lease -u origin HEAD` まで行う。
- `records:close --mark` は CI を回さない既定にし（`--ci` で回す）、[verification-guide.md](verification-guide.md) 9 節は「`records:close -- V-NNNN --mark` → `npm run pr:prep -- --push` → PR」にする。AGENTS.md「コミット手順」の 1〜3 は `pr:prep` の 1 行と、止まったときの直し方の 1 行にする。

**効果**: PR ごとの手作業（衝突の仕分け・作り直し・continue の繰り返し・CI・push）が 1 つのコマンドになり、CI は 1 回で済む。作り直しはコミットの数によらず 1 回。

**気をつけること**: 生成物の一覧を道具と `records:check` の 2 か所に持つとずれるので、`records-check.ts` が書くパスの一覧を書き出して共有する。コードの PR（生成物を触らない）でもそのまま使える。

## 3. 課題の起票を backlog.md の 1 か所にする

**いま**

- 残りの仕事が 2 か所にある: [roadmap.md](roadmap.md)「今後の課題」（課題ごとに 1 行。状態・設計書・「残りは backlog の行」）と [backlog.md](backlog.md)（種類ごとの 1 行）。backlog.md の冒頭は「新しい課題は roadmap に 1 行で起票してから、ここに 1 行足す」。
- 直近 50 件のコミットのうち、roadmap.md を触ったのが 20 件、backlog.md が 22 件、両方が 14 件。同じ課題の状態を 2 か所で直している（例: sim と calc の一本化は、roadmap.md の 1 行と backlog.md の 5-5・5-6 の行の両方に「残り」があり、段 A-1〜A-3 の PR が両方を書き換えた）。
- 「今後の課題」の 25 行のうち 4 行は閉じた課題（完了・実装済み）で、2026-10-25 に archive に移した後も閉じた行が溜まり続ける。多くの行は「一部完了: 設計書。残りは backlog N 節」で、中身は backlog にしか無い。

**案**

- roadmap.md は Stage の一覧（と基本原則）だけにする。「今後の課題」の開いている行は backlog.md の新しい節「課題（設計書のあるもの）」に 1 行ずつ移す（題名・設計書・残りの行き先の列）。閉じた 4 行は roadmap-archive.md の「今後の課題」に移す。
- 以後、課題は backlog.md に 1 行で起票し、閉じたら消す（経過は設計書と検証記録にある）。verification-guide.md 9 節の「roadmap.md は … 状態が変わったときだけ更新」は、「backlog.md の行を直す。Stage の状態が変わったときだけ roadmap.md」にする。
- 検証記録・設計書が課題を題名で指している所は、題名を変えずに移すので壊れない。

**効果**: 課題 1 つの書き換えが 1 か所になる。並行する PR が roadmap.md と backlog.md の両方で衝突することが減る。

**気をつけること**: roadmap.md を「今後の課題」で引いている文書（AGENTS.md の置き場所の表・各文書の「関連」）の指し先を backlog.md に直す。

## 4. 小さな直し

- **設計書の「経過」に結論の確定を書き写さない**: 段の設計書（例 [design-skill-stage10.md](design-skill-stage10.md)「経過」）は、撮影で仮説を再現して確定にしただけの PR でも「C-NNNN を V-NNNN で確定にした」の 1 行を足している（直近の 3 件の検証の PR が同じ行を足した）。結論の状態と根拠は [claims.md](claims.md)・[verifications.md](verifications.md) が持つ（AGENTS.md「1 つの事実は 1 か所」）。「経過」には設計か実装が変わったときだけ書き、モデルを変えない確定は書かない、と [skills-guide.md](skills-guide.md) 1.4 節に 1 行足す。
- **[captures/protocol.md](captures/protocol.md)「編成と条件の選び方」**: 「操作枠は 3 枠目に」が 2 項目（3 項目目と 6 項目目）にある。1 つにまとめる。
- **`npm run skills:catalog`**: 第 2 回で `records:check` が skill-catalog.md も作るようにした後も、スクリプトと README.md の 1 行が残っている。README.md は `records:check` を指し、スクリプトは消す（`skill-catalog.ts` の冒頭の使い方も直す）。`records:table` は `intake.ts` が呼ぶので残す。

## 5. 見たが案にしなかったもの

- **使われていない解析ツール・レシピ**: 観測値の `method.tool` で数えると、レシピのうち観測値に出ないのは `charge-shots`（と、それだけが使う `charge-lattice`）と、新しくした `buff-edge` 版 2 だけ。ほかの部品（`smg-hits`・`triggers`・`pellets`・`landing`・`reload-rows`・`midfar`）はほかのレシピが読み込む。`charge-shots` は第 1 回 6 節の判断（次の SR・RL の弾丸命中率の検証まで残す）のまま。`result-screen.ts`・`diff.ts`・`probe.ts`・`hud-glyph.ts`・`reload-bar.ts` も観測値に出ないが、2026-10-25 に作った迎撃戦（15-B）と較正の道具で、まだ出番が来ていない。
- **Drive の 3 つの経路**（デスクトップの rclone・クラウドの受け口・クラウドのサービスアカウント）: 統合したくなるが、サービスアカウントは書けず（容量 0）、受け口は録画（最大 635MB）を通せないので、分けた理由がそのまま残る（[design-cloud-environment.md](design-cloud-environment.md) 2.1 節）。
- **生成物をコミットしない**: 2 で衝突の手間は道具に寄せられる。GitHub の画面とスマホで結論・検証の一覧を読む使い方があるので、コミットはやめない。
- **凍結の記録**（`backup-log-old*.md`・`legacy-usage.md`・`verification.md`）: 繰り返し読むものではなく、書き足さないので手間にならない。
- **verification-guide.md・records/verifications/README.md**: 第 3 回で重なりを除いた後で、繰り返し読むのに要らない部分は見つからなかった。

## 6. 判断

（オーナーの判断を待つ）
