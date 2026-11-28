# 繰り返しの業務の簡素化の案・第 20 回（2026-11-28 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-19](design-workflow-simplification-19.md)。どれも実施済み。そこで扱ったものは繰り返さない。
- この回で見たもの: 直近の PR 200 本（#1221〜#1420）が手で触ったファイル（記録の JSON と定義の JSON を除く）。テストの全部の所要時間（ファイルごと・テストごと）。毎セッション読む AGENTS.md の節ごとの大きさと、その推移。
- 調べ方: origin/main（e86af0f2）のクラウドの環境（4 コア）で、git の履歴を直に数え、`npx vitest run --reporter=json` の所要時間を集計した（使い捨て。コミットしない）。時間の比べは、同じ環境で続けて 2 回回した値（1 回目は温まる前で遅いので比べに使わない）。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | 「射撃の列がどのグループにも 1 回ずつ入る」の確かめを、編成のテスト 107 本から `simTeamResult` の中に移す | `npm test` 1 回あたり約 7 秒（67 秒 → 約 60 秒。CPU は約 25 秒）。編成のテストを書くたびの 1 行と、その手順の 1 文 | 確かめが外れたとき、画面の計算をエラーにしてよいか（案 A） |
| 2 | AGENTS.md「コミット手順」から、道具とフックの中の動きの説明を除き、エージェントがすることだけにする | 毎セッション読む AGENTS.md の約 1.5KB（17.9KB → 約 16.4KB）。`pr-prep.ts` の冒頭・設計書と同じことの二重の手入れ | 進めてよいか |

推奨: 1 の案 A と 2。効きの大きい順に 1・2。PR は 2 本に分ける（1 はコード、2 は文書）。

## 1. 「射撃の列がどのグループにも 1 回ずつ入る」の確かめ

**いま**

- 編成のテスト（`packages/core/src/__tests__/<名前>Team.test.ts`。166 本）のうち 107 本が、最後に `describeEveryShotInOneGroup(TEAMS)` を呼ぶ（`teamHelpers.ts`）。編成ごとに `runSimulation` と `simTeamResult` を回し、枠ごとに、グループの区間（`groupTimeline` を `mergeAdjacentRanges` でつないだもの）で数えた発数の和が、射撃の列の発数と同じかを見る（386 件）。
- [skills-guide.md](skills-guide.md) 1.4 節が、編成のテストにこれを入れるよう求めている。直近の 200 本のうち 46 本が、これを足した。
- このテストは、ファイルの本体が回したのと同じ編成で sim をもう一度回す。本体は `planTeamRun(input)`（1 パス目）か `runSimulation(input)` を回しているので、1 パス目を 2 回回している。
- 測った値（4 コア）:
  - 編成のテストの時間（テストごとの和）49 秒のうち、このテストが 30 秒。その 96% が `runSimulation`（`simTeamResult` と数える所は 1 秒）。
  - `describeEveryShotInOneGroup` を空にすると、`npm test` は 67 秒 → 60 秒（CPU の user は 3 分 23 秒 → 2 分 58 秒）。`pr:prep`・GitHub の CI・手で回す全部のテストに効く。
- 確かめている中身は、キャラの効果ではなく、グループ分け（`groupTimeline`）と区間のつなぎ（`mergeAdjacentRanges`）が射撃の列を漏れなく重ねずに分けること。キャラによって状態の組み合わせが変わるので、多くの編成で見ている。

**案 A（推奨）: `simTeamResult` の中で確かめ、テストの側から外す**

- `simTeamResult`（`sim/teamResult.ts`）が、枠ごとのグループを作った後に、区間で数えた発数の和が射撃の列の発数と同じかを確かめ、違えば枠と数を添えて投げる。数え方はいまのテストと同じ（`countShotsInRanges`。二分探索なので、sim に比べて無視できる）。
- `describeEveryShotInOneGroup` と、107 本の呼び出しと、skills-guide.md 1.4 節のその文を消す。確かめが投げることを見る単体テストを 1 つ足す（区間を欠いた sim を渡すなど）。
- 効き:
  - テストの側の sim の回し直しが無くなる（上の 7 秒）。
  - 確かめる範囲は広がる。`simTeamResult` を通るすべての計算（編成のテストの 107 本に限らず、`simTeamResult` を使うテスト・画面・records 層・CLI）で毎回確かめる。
  - 編成のテストを書くときの決まりが 1 つ減る。
- 外れたときの振る舞い: 画面の計算（`apps/web/src/compute.ts`）は例外を受け止めてエラーとして出すので、誤った数値の代わりにエラーが出る。根拠のない数値を出さない方針（AGENTS.md「事実と記録」）に合う。最適編成計算の候補の 1 つで投げたときも、いまの例外と同じ扱いになる。
- `packages/core/src/sim/` を変えるので、見直しは `/code-review high`。

**案 B: テストは残し、sim を使い回す**

- `teamHelpers.ts` に、編成の入力ごとに sim を覚える `simOf(input)` を足し、本体と `describeEveryShotInOneGroup` がそれを読む。
- 使い回せるのは、本体が `runSimulation(input)` を回す 31 本だけ。ほかの 76 本は `planTeamRun(input)` を回していて、`runSimulation` は宝物と編成の差し替えをした後で 1 パス目を回すので、結果を取り替えると中身が変わりうる。減るのは 2 秒ほど。

**採らない案**: 確かめを 1 つのテストファイルに集め、定義のある全部のキャラの単騎で回す。181 本の sim で、いまの半分ほどの時間がかかり、編成の組み合わせは見なくなる。

## 2. AGENTS.md「コミット手順」

**いま**

- AGENTS.md は、どのエージェントも毎セッション読む（17.9KB）。2026-11-07 の 13.8KB から 4KB 伸び、伸びの多くは「コミット手順」（いまは約 5.3KB で、ファイルの 3 割）。
- 「コミット手順」の次の 4 項目（2.9KB）は、エージェントがすることより、道具とフックの中の動きを書いている。その動きは、それぞれの道具の冒頭か設計書にも書いてある。

<!-- prettier-ignore -->
| 項目 | いまの中身 | 同じことを書いた所 |
| --- | --- | --- |
| 撮影待ちのブランチ | フックがセッションの始まりと発言のときに、作業中の変更が無ければリベースして push し、決まりと道具が変わったかを知らせる | `tools/git/sync-after-merge.ts`・`catch-up.ts` の冒頭 |
| `pr:prep` | リベース・生成物の衝突の取り方・作り直し・書式と lint の範囲・生成物を main の版に戻す・止まったときの直し方（`git add`・`records:renumber`） | `tools/git/pr-prep.ts` の冒頭（手順 1〜7）。止まったときの直し方は道具が出す |
| 自動マージを待つ PR の衝突 | Actions が 1 つの commit にまとめて振り直す・揃えないとマージの後にフックが揃えない・揃える前に `pr:prep` を回すと止まる | [design-auto-conflict-fix.md](design-auto-conflict-fix.md)、`pr-prep.ts` の冒頭の手順 1 |
| マージの後 | メインのチェックアウトの作業中の変更の片付け・スカッシュマージで揃える理由・フックが動く時（開始・発言・応答の終わり、CI を待つこと） | `tools/git/sync-after-merge.ts` の冒頭 |

**案**

- 4 項目を、エージェントがすること（コマンドと、知らせを受けたときにすること）と、中身の書いてある所へのポインタだけにする。書き直しの形:
  - 撮影待ち: 「撮影待ちの間は、トピックブランチを保持する（撮影計画や予測の commit もそのブランチで行う）。トピックブランチは、作業中の変更が無ければフック（`tools/git/catch-up.ts`）が main に取り込む。衝突したら元に戻して知らせるので、`npm run pr:prep` で取り込んで直す。」
  - `pr:prep`: 「commit してから `npm run pr:prep -- --push`（main をリベースで取り込み、生成物を作り直して CI と同じ確認を通し、生成物を main の版に戻して push する。中身は `tools/git/pr-prep.ts` の冒頭）。生成物は PR に入れず、マージの後に GitHub の CI が main で作り直す。止まったら、道具が出す直し方に従ってもう一度回す。」
  - 衝突: 「自動マージを待つ PR の衝突と ID の重なりは、GitHub Actions（`.github/workflows/auto-rebase.yml`）が直して PR にコメントする。直したなら手元を `git reset --hard origin/<ブランチ>` で揃え、直せないなら `npm run pr:prep -- --push` で直して自動マージを予約し直す（`plan/design-auto-conflict-fix.md`）。」
  - マージの後: 「マージの後に、メインのチェックアウトの main を origin/main へ早送りし、マージ済みのブランチを origin/main に揃える。Claude Code ではフック（`tools/git/sync-after-merge.ts`）が行う。」（フックの無いエージェントが手でする手順は残す）
- 4 項目は 2.9KB → 1.4KB になる。見直し（1・2）の項目の「フックが止める」の括弧は、止められたときにわけが分かるよう残す。
- Claude Code のメモリ `pr-workflow` の「How to apply」にある、自動マージを待つ PR の衝突の扱い（AGENTS.md の写し）を、AGENTS.md へのポインタにする。

**気を付けること**: 消すのは、道具の冒頭や設計書と同じことと、道具が止まったときに自分で出す直し方だけ。エージェントがすること・コマンド・知らせを受けたときの動きは残す。

## 3. 見たが案にしなかったもの

- **語彙を足すたびの分類の表の書き換え**: `skills/catalogDoc.ts`（直近の 200 本中 17 本）と `catalog.ts`（9 本）で、分類の区分を「語彙なし」から「語彙あり」に直し、語彙の名前を書く。区分はどの言い回しをどの語彙で書けるかの判断で、パーサーから機械で決めるには分類と語彙の対応表がもう 1 つ要る。1 本あたり 1〜3 行なので、案にしない。
- **単独で遅いテスト**: `tools/drive/cloud-sync.test.ts`（10 秒）・`cadenceConvergence.test.ts`（8 秒）・`catch-up.test.ts`（5 秒）。どれも本物の git や長い戦闘を回すテストで、ほかのワーカーと並ぶので、全体の時間への効きは小さい。
- **編成のテストと照合の重なり**: 編成のテストの多くは撮影と同じ編成を回すが、見ているのは効果の付くフレームや回数で、観測値との照合（`records:check`）では分からない。重なりは無い。
- **設計書の数**: `plan/design-*.md` は 306 本・7.0MB。読むのはその変更に関わる時だけで、要らない記述は触るどの PR で消してもよい（[design-design-doc-trim.md](design-design-doc-trim.md)）ので、案にしない。
- **大きくなっている手引き**: [skill-phrases.md](skill-phrases.md) は 40.2KB、[captures/guide.md](captures/guide.md) は 46.5KB（第 19 回から変わらない）。分け方は決めてある（第 16 回の案 A・第 18 回 4 節）ので、`pr:prep` が知らせたらそのとおりに分ける。

## 4. 経過

- 2026-11-28: 起案した。
