# 繰り返しの業務の簡素化の案・第 3 回（2026-10-26 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・撮影ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。**承認待ち**。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)（2026-10-24）・[design-workflow-simplification-2.md](design-workflow-simplification-2.md)（2026-10-25。全部を実施済み）。そこで扱ったもの（取り込み・読みの一括、生成のコマンド、表の列幅、skills-guide.md、`npm run ci`、`--pad-all`、メモリの 3 項目）は繰り返さない。
- 調べた範囲: [AGENTS.md](../AGENTS.md)、[verification-guide.md](verification-guide.md)、[records/verifications/README.md](../records/verifications/README.md)、生成物（`plan/*.md`・[captures/recordings.md](captures/recordings.md)）、レシピと解析ツール（`tools/captures/`）、観測値の `method`、`npm test` の時間、Claude Code のメモリ。
- 調べ方: origin/main（8251a15）で、V-0480 以降の検証記録 43 件の観測値の `method.tool` と「読み方」を読み、生成物の節ごとの大きさと、直近 50 件のコミットで触るファイルを数えた。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | 「HUD の増分を何人かの 1 ヒットの格子に当て、窓の端を挟む」読み方をレシピにする（`buff-edge` を広げる） | 検証 1 件ごとの使い捨てのスクリプト（V-0480 以降の 43 件のうち約 10 件） | 進めてよいか |
| 2 | 残差の一覧（2.0MB）に許容外・失効の行だけを載せ、ほかは引くコマンドにする。録画の一覧の「素性」の表を外す | PR ごとの生成物の差分・エージェントが一度に読めない大きさ | 許容内の行を一覧から外してよいか |
| 3 | AGENTS.md を短くする（置き場所の表を 1 行ずつに・確定の条件の重なりを 1 か所に・Antigravity の併用ルール） | 毎セッション読む 15.6KB のうち約 7KB | 進めてよいか。Antigravity を今も使うか |
| 4 | Claude Code のメモリの古い項目を直す（`records-layout` の誤った指示・`pr-workflow` の経緯） | 毎セッション読む索引の誤り | 進めてよいか |

推奨は 1〜4 を全部進める。3 の併用ルールは、Antigravity を使わなくなっていれば縮める。

## 1. 「増分を格子に当てる」読み方をレシピにする

**いま**

- V-0480 以降で観測値を書いた検証記録 43 件のうち 26 件が、観測値の `method.tool` に「使い捨てのスクリプト」（か「scratchpad の解析」）と書いている。そのうち約 10 件（V-0489・V-0496・V-0500・V-0508・V-0513〜V-0517・V-0523）は同じ形の読み方で、検証ごとに書き直している:
  1. `hud-jumps` の増分を取る。
  2. 録画の編成で、何人かの 1 ヒットの格子（胴体・コア × 会心 × 距離 × ▲の有無 × フルバーストの有無）を作る。
  3. 増分を格子に当てて、誰のどのヒットか（▲が乗っているか）を決める。
  4. `burst-panel` の発動の時刻の前後で、▲の無い最後の発と乗った最初の発で窓の端を挟む。
- この形は 1 人ぶんならレシピ `buff-edge` がある（V-0368・V-0378・V-0389 の使い捨てのスクリプトをレシピにしたもの。[design-buff-edge-recipe.md](design-buff-edge-recipe.md)）。ただし 1 枠の▲の有無の 2 つの格子だけで、事象の時刻は手で渡す。観測値の `method.tool` に `recipe:buff-edge` は 1 件も無く、読み方に挙げたのも V-0457・V-0489 の 2 件だけ。何人かの発が混ざる録画では使えず、使い捨てのスクリプトに戻っている。
- 使い捨てのスクリプトは追跡しないので、観測値の読み方は検証記録の「読み方」の文でしか追えず、次の検証で同じものを書き直す（V-0523「読み方」は「V-0457・V-0458 と同じ」と書いて、また書いている）。

**案**

- `buff-edge` を広げる（か、同じ部品で新しいレシピにする）:
  - 格子は `--opt slots`（例 `2,3`）の枠ごとに、モデルが増分のフレームで出す 1 ヒットの値（`hitDamage` のコア × 会心 × 距離）と、`--opt states`（モデルの状態の名前か `off`）を外した値。フルバーストの有無はモデルのフレームから取る（今の `buff-edge` が区間ごとに取っているのと同じ）。
  - 増分ごとに「枠・コア・会心・距離・▲あり／なし／区別できない／外れ」を出す。SG は増分をペレットの値の和に分ける（今の `sg-pellets` の分け方を使う）。
  - 事象の時刻は、`--opt events burst-panel:<枠>:<段>` で `burst-panel` のキャッシュから取る（手でも渡せる）。事象ごとに窓の端を挟んだ幅を出す（今の `buff-edge` の timing と同じ形）。
- 設計は実装の PR の前に短い設計書（[design-buff-edge-recipe.md](design-buff-edge-recipe.md) に節を足す）で決める。V-0513・V-0516 の録画で、使い捨てのスクリプトと同じ観測値が出ることを確かめる（観測値は書き換えない）。
- 格子に乗らない読み方（画素の数・アイコンの色。V-0497・V-0499・V-0501）は、件数が少なく形もばらばらなので、レシピにしない。

**効果**: スキル定義の検証のいちばん多い読み方が 1 つのコマンドになり、読み方を検証記録の文で書き直さなくてよくなる（「読み方」は `--opt` を書くだけ）。観測値の `method.tool` にレシピ名と版が入り、読み方を後から追える。

**気をつけること**: モデルの格子に当てるので、モデルにまだ無い状態（定義していない▲）の発は「外れ」になる。今の `buff-edge` の `--opt scale`（モデルに無い状態の倍率。結論の ID を検証記録に書く）を残す。

## 2. 残差の一覧に、見る行だけを載せる

**いま**

- 生成物の大きさ: [residuals.md](residuals.md) 2.0MB（1,511 行）、[claims.md](claims.md) 1.2MB、[verifications.md](verifications.md) 0.55MB、[captures/recordings.md](captures/recordings.md) 0.45MB。
- residuals.md の行の 96%（1,445 行）は許容内。許容内の行のうち確定の結論に結び付いたものは、`npm test` が許容外になれば落とすので、一覧で見張る必要が無い。見て手を打つのは許容外（47 行）と失効（19 行）。
- 観測値を足す PR は、どれも residuals.md に行が増える（直近 50 件のコミットのうち 32 件が生成物を触る）。どの PR も件数の行も書き換えるので、並行する PR どうしはリベースで必ず衝突し、AGENTS.md「コミット手順」の 1 の作り直しを回す（これはこの案の後も残る）。
- 2MB はエージェントの読みの道具で一度に読めず、いつも grep で引いている。verification-guide.md 1 節の「既にある … 残差で答えられないかを探す」も、行の ID か録画で引く使い方。
- recordings.md の「素性」の表（97KB。尺・フレーム数・fps・サイズ・sha256）は、どれも録画の JSON（`durationSec`・`frames`・`fps`・`sizeMB`・`sha256`）と同じ値で、録画の一覧の表と行が 1 対 1。

**案**

- residuals.md は、冒頭の件数（判定ごと・話題ごと）と、許容外・失効・比べられないの行だけにする（約 90KB の見込み）。
- 許容内も含めて引くコマンドを足す: `npm run records:residual -- <観測値 ID|録画 id|V-NNNN>...`（residuals.md の今の行と同じ列で出す。比べる処理は今の照合ランナーをそのまま使う）。verification-guide.md 6・7 節に、読んだ後に自分の観測値の残差を見るコマンドとして 1 行書く。
- recordings.md の「素性」の表を外す（`probe.ts` はアーカイブの突き合わせで使うので残す。storage.md）。
- claims.md・verifications.md は、問いから引く索引として読む形のものなので、今のままにする。

**効果**: PR の生成物の差分は、許容外か失効が変わったときだけになる。残差の一覧は開けば全部読める大きさになり、見るべき行が埋もれない。

**気をつけること**: GitHub の画面で許容内の行を見たいときは、コマンドを回す必要がある（スマホだけのときはクラウドのセッションに頼む）。許容内の行を一覧で見ている使い方があれば、案をやめるか、話題ごとのファイルに分ける形に替える。

## 3. AGENTS.md を短くする

**いま**（AGENTS.md は 15.6KB。どのエージェントもセッションごとに全部を読む）

- 「記録の置き場所」の表が 8.5KB（全体の 55%）。行ごとの説明は、指す文書の冒頭（「何のための文書か」）と重なる。例: verification-guide.md・cloud-guide.md・skills-guide.md の行は、各文書の冒頭の 1 行と同じことを書いている。roadmap.md・backlog.md の行は、両方の文書の冒頭の書き方の決まりを書き写している。
- 「事実と記録」の確定の条件（等級・予測・`decidedOn`）は、AGENTS.md・[verification-guide.md](verification-guide.md) 2.2 節（「この節が正」）・claims.md の冒頭（生成。`claims.ts`）・[records/verifications/README.md](../records/verifications/README.md) の 4 か所にある。
- 「併用ルール（Claude Code / Antigravity）」: 直近の履歴と origin に `antigrav/` のブランチは無い（手元の履歴は浅いので、それより前は見ていない）。今も Antigravity を使うかは分からない。

**案**

- 置き場所の表は「置き場所 | 置くもの（1 句）」にし、説明は指す文書の冒頭に任せる（約 3KB の見込み）。表の後の「新しい知見は …」と道具の段落は残す。
- 「事実と記録」の確定の条件の 3 項目は、「確定にできる条件は verification-guide.md 2.2 節（正）」の 1 行にする。ほかの項目（1 つの事実は 1 か所・大きさの目安・最小構成・機構が確定したキャラ・残差を係数で埋めない・根拠の無い変更をしない）は AGENTS.md にしか無いので残す。records/verifications/README.md の「完了にする前に」の検査の列挙も、`records-close.ts` の冒頭を指す 1 行にする。
- Antigravity を使わなくなっていれば、併用ルールは「同じ作業ツリーを 2 つのセッションで同時に編集しない。並行するときはブランチと worktree（`.claude/worktrees/<session-name>`）を分ける」の 1 項目にし、`.gitignore` の `.antigrav/worktrees/` を消す。使っていれば今のまま。

**効果**: AGENTS.md は約 8KB になる見込み。確定の条件を直すときに直す所が 1 か所になる。

## 4. Claude Code のメモリ

**いま**（メモリはデスクトップとクラウドで同じもの。索引は毎セッション読む）

- `records-layout.md` の本文に、今の決まりと合わない指示が 4 つある:
  - 「根拠の文章は `verification.md` に書く」: verification.md は凍結（AGENTS.md「記録の置き場所」）。今は検証記録に書く。
  - 「結論は `claims.md` に書く」: claims.md は生成物。今は `records:new -- claim` で `records/claims/C-NNNN.json` を作る。
  - 「録画の条件: `records/recordings.json`（… `records:table` で生成）」: 今は `records/recordings/<録画 id>.json` で、生成は `records:check`。
  - 証拠フレームを「robocopy で同期する」: 今は `npm run drive:sync`（storage.md「バックアップ」）。
- `pr-workflow.md` の「How to apply」の 2026-09-26 の作り直しの経緯（旧リポジトリの PR 番号・旧の履歴のブランチ）は、旧の履歴のブランチが origin に無くなった今は、PR 番号の注意の 1 行のほかは要らない。

**案**

- `records-layout.md` は「AGENTS.md『記録の置き場所』に従う。メモリにはエージェント固有の手順とポインタだけ」と、`private/`・E: の証拠フレームと参照資料の場所の 3 行にする（今の誤りの 4 つは消す）。索引の行も合わせて縮める。
- `pr-workflow.md` の作り直しの経緯は、「文書の PR #1〜#37 は旧リポジトリの番号。PR は題名か日付も添えて指す」の 1 行にする。
- メモリはリポジトリの外なので、実施の PR には入らない（前の回と同じ）。

## 5. 見たが案にしなかったもの

- `npm test`（92 秒。手元の 4 コア）: 時間の 61% はファイルごとの読み込み。vitest は `isolate: false` で約 9 秒縮むと出すが、テストどうしが状態を共有すると落ち方が分かりにくくなるので、割に合わない。いちばん長い `simCalc.test.ts`（27 秒）は sim と calc の整合を全キャラで見るもので、削れない。
- レシピ `charge-shots`: 今も観測値・検証記録で使われていない。第 1 回の 6 節（次の SR・RL の弾丸命中率の検証まで残す）のまま。その検証はまだ来ていない。
- 検証記録の「読み方」に取り込みの引数を書くこと（V-05xx の 24 件のうち 11 件）: 撮影の前に取り込みの段取りを決めておく役があり、取り込みは 1 度きりなので、書き写しの手間は小さい。
- 設計書が 127 本あること: 繰り返し読むものではなく、roadmap.md と backlog.md から節で指して引く。まとめて移すとリンクが壊れるので、動かさない。
- `sync-after-merge` のフック・[captures/guide.md](captures/guide.md)（40KB）: 前の回の 9 節と同じ判断。
