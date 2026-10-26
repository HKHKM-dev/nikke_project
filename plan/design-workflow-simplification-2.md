# 繰り返しの業務の簡素化の案・第 2 回（2026-10-25 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・撮影ごと・PR ごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。2026-10-26 にオーナーが全部を推奨どおりに承認し、実施した（10 節）。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)（2026-10-24。1〜5 節は実施済み、6・7 節は見送り）。そこで扱ったものは繰り返さない。
- 調べた範囲: [AGENTS.md](../AGENTS.md)、[verification-guide.md](verification-guide.md)、[skills-guide.md](skills-guide.md)、[captures/protocol.md](captures/protocol.md)・[captures/storage.md](captures/storage.md)、[cloud-guide.md](cloud-guide.md)、`.claude/settings.json` のフック、`tools/`・`packages/core/scripts/` の道具、Claude Code のメモリ。
- 調べ方: origin/main（7a49143）の直近のコミットで触るファイルと行を数え、道具の参照と観測値の `method.tool` を数えた。

## 0. 案の一覧

| #   | 案                                                                                         | 減るもの                                                            | 判断してほしいこと |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------ |
| 1   | `intake.ts` で 1 回の撮影の録画をまとめて取り込む（番号の自動・push・表・宝物の段階）      | 撮影 1 回あたり録画の本数ぶんのコマンドと、4 つの手作業             | 進めてよいか       |
| 2   | `records:read` が、クラウドで録画が無ければ取り寄せる。録画を複数受ける                    | クラウドでの読みの前の `fetch.ts`、録画ごとの読みのコマンド         | 進めてよいか       |
| 3   | 生成物を作り直すコマンドを `records:check` 1 つにする（録画の一覧とスキルの分類も作る）    | 4 つの生成のコマンドの使い分けと、`skills:catalog` の回し忘れ       | 進めてよいか       |
| 4   | backlog.md・roadmap.md の表を prettier の列幅そろえから外す                                | 1 行の変更で表の全部の行が差分に出ること（変更の行の 55%）・衝突    | 進めてよいか       |
| 5   | skills-guide.md の 1.5 節の語彙の説明を 1 行ずつの対応表にし、4 節は機械が見ない項目だけに | 約 10KB の重なり（`types.ts` の注記と）と、二度の確認               | 進めてよいか       |
| 6   | 小さな直し: `npm run ci` を足す、`records:new` の push を既定にする                        | CI と同じ確認の 5 つのコマンドの書き写し（4 か所）、毎回の `--push` | 進めてよいか       |
| 7   | 残っている古いブランチを消し、4 桁にそろえる道具（`--pad-all`）を外す                      | 約 14KB の一度きりの道具と、使われない枝                            | 枝を消してよいか   |
| 8   | Claude Code のメモリの古い項目を直す・消す                                                 | 毎セッション読む索引の古い指示                                      | 進めてよいか       |

推奨は 1〜6 と 8 を進め、7 は枝を消すことをオーナーが決めてから行う。

**判断（2026-10-26）**: 全部を推奨どおりに進める。7 の枝は 4 本とも消す（`cool-lamport` の 12.5 節も入れ直さない）。

## 1. 取り込みをまとめて行う（`intake.ts`）

**いま**

- `intake.ts` は録画 1 本ずつで、`--id` を人が選んで渡す（ほかのブランチが使った番号なら止まるだけで、選ばない）。
- 1 回の撮影の録画は、直近の 15 件の撮影の PR で 1〜30 本（中央値 4〜5 本）。同じ編成・的・モードの引数を本数ぶん繰り返す。
- 取り込んだ後に、人が次の 4 つを行う（verification-guide.md 5 節・protocol.md「撮った後」）:
  1. 録画の JSON を commit して push する（番号を押さえる。前の回の 4 節）。
  2. `npm run records:table` を回す。
  3. 宝物ありの枠は、録画の JSON の `team` に `treasurePhase` を手で足す（`intake.ts` が受けない。録画 649 本のうち 64 本が持つ）。
  4. 次の録画の番号を選ぶ。

**案**

- `intake.ts` が元ファイルを複数受ける。`--id` を省くと、`records:new` と同じく origin の全ブランチを見て空いている番号を順に取る（`--id` を付けたときは今と同じで、複数なら付けた番号から順に）。`--name` は 1 本ずつ違うので、`--name a,b,c` のように元ファイルと同じ数を並べる。`--note` も同じ形にする。
- `--push` を足す（`records:new --push` と同じ。作った録画の JSON だけを commit して push する。main の上ではしない）。
- 終わりに `records:table` を回す（約 2 秒）。
- `--treasure <枠>:<段階>`（例 `--treasure 2:3`）を足し、`team` の枠に `treasurePhase` を書く。段階は今と同じくオーナーに確かめた値を渡す（protocol.md「撮った後」。画面からは読まない）。
- verification-guide.md 5 節・protocol.md「撮った後」・cloud-guide.md の取り込みの手順は、1 つのコマンドの例に書き換える。

**効果**: 5 本の撮影なら、5 本のコマンドと 4 つの手作業が 1 つのコマンドになる。番号を人が選ばなくなり、録画の番号の重なり（前の回の 4 節の「同時の取り込み」の 2 組）も、取ってすぐ push する分だけ窓が縮む。

**気をつけること**: 1 本だけ失敗したとき（Drive に置けない・長さが合わない）は、そこで止めて、取り込めた分を出す（今と同じく、置けなかった録画の JSON には `backup` が無い）。

## 2. `records:read` が録画を取り寄せる

**いま**

- クラウドのセッションには録画が無い。`records:read` は録画が無いと「クラウド環境では `tools/captures/fetch.ts` で取り寄せる」と出して止まる（`records-io.ts` の `existingVideoOf`）。読む前に毎回 `node tools/captures/fetch.ts <録画>` を回す（検証記録 20 件が読み方にこの手順を書いている）。
- `records:read` は録画を 1 本だけ受ける。同じレシピ・同じ `--opt` で 5〜14 本を読むことが多い。

**案**

- 録画が無く、取り寄せの準備（`NIKKE_DRIVE_SA_KEY`・`NIKKE_DRIVE_FOLDER_ID`）があれば、`fetch.ts` と同じ処理（sha256 の突き合わせつき）で取り寄せてから読む。準備が無ければ今と同じ文で止まる。
- 録画を複数受ける（`npm run records:read -- 0631,0632,0633 --recipe ...`）。1 本ずつ今と同じに読み、観測値を録画ごとのファイルに書く。1 本が失敗したら、そこで止めて、それまでの分は書いたままにする。
- 解析ツールを直に呼ぶとき（`hud.ts` など）は今のまま `fetch.ts` を使う（道具ごとに足すと手間に見合わない）。

**効果**: クラウドでの読みの前の 1 手と、録画の本数ぶんのコマンドが無くなる。

## 3. 生成物を作り直すコマンドを 1 つにする

**いま**

- 生成物を作るコマンドが 4 つある: `records:table`（録画の一覧）、`records:check`（結論・検証記録・残差・対応状況・最小構成の一覧）、`records:minimal`（感度。中で `records:check` も回る）、`skills:catalog`（スキルの効果の分類の一覧）。どれも最新かを `npm test` が確かめる。
- `records:table` を回すことは 5 か所に書いてある（verification-guide.md 5 節、captures/index.md 2 か所、captures/storage.md、skills-guide.md 4 節）。`records:close` は `records:minimal` を回すが `records:table` は回さないので、録画を直した後に回し忘れると、閉じるときの `npm test` で落ちてから回し直す。
- `skills:catalog` は、新しいキャラを定義した PR で要る（一覧が定義済みのキャラを太字にする）が、skills-guide.md に書いていない。`npm test` で落ちて初めて気づく。
- リベースで生成物が衝突したとき（AGENTS.md「コミット手順」の 1）、どのコマンドで作り直すかをファイルごとに選ぶ。

**案**

- `records:check` が、今の中身の前に `records:table` と `skills:catalog` の中身も回す（合わせて約 3 秒。手元で `records:check` は約 33 秒）。`records:minimal` と `records:close` は `records:check` を回すので、自動で揃う。
- `records:table`・`skills:catalog` のコマンドは残す（データを取り込み直した後などに単独で回せるように）が、手順書からは消し、「生成物は `records:check`（感度も要るなら `records:minimal`）」の 1 か所にする。
- AGENTS.md「コミット手順」の 1 の「生成物が衝突したら」を「main の版に戻してから `npm run records:check`」と書く。

**効果**: 覚えるコマンドが 1 つになり、`records:close` を通った PR では生成物の回し忘れが起きない。

## 4. backlog.md・roadmap.md の表を列幅そろえから外す

**いま**

- backlog.md と roadmap.md は、直近 50 件のコミットのうち 33 件・25 件が触る（手で書くファイルでいちばん多い）。中身はほとんどが表の 1 行の書き換え。
- prettier は表の列幅をそろえるので、いちばん長いセルが変わると、表の全部の行が書き換わる。直近の 24 件（1 項目 1 行にした #683 を除く）で、2 つのファイルの変更の行は 354 行、空白だけの違いを除くと 158 行。**変更の行の 55% が、列幅のそろえ直しだけ**。
- 並行するブランチが同じ表の別の行を直しても、列幅のそろえ直しで同じ行どうしになり、リベースで衝突する。この 2 つは生成物でないので、AGENTS.md の「main の版に戻して作り直す」が使えない。
- 生成物の表は #699 で同じ理由から整形の対象を外した（[design-generated-table-width.md](design-generated-table-width.md)）。

**案**

- 2 つのファイルの表の前に `<!-- prettier-ignore -->` を置く（prettier はその次の表をそのまま残す。表のほかの部分は今のまま整形する。手元の prettier 3.9.8 で確かめた）。表は詰めた形（`| a | b |`）で書く。
- `.prettierignore` にファイルごと足す形もあるが、表のほかの箇条書きの整形まで外れるので推さない。

**効果**: 表の 1 行の変更は 1 行の差分になり、並行するブランチの衝突が、同じ行を直したときだけになる。

## 5. skills-guide.md を短くする

**いま**

- 1.5 節「定義を書く」の語彙の説明（HP の経路・防御力の経路・クラス・HP の順・名前の付いた状態など）が約 10KB あり、skills-guide.md（22KB）の半分近い。中身は `packages/core/src/skills/types.ts` の注記（JSDoc）と重なる（例: `casterFinalMaxHp`・`lowerThanSelf`・`lowestHpRatio`・`stackChange`・`undispellable` はどれも types.ts に説明と設計書の節がある）。語彙を足すたびに、ここにも段落が 1 つ増えている。
- 4 節「PR の前の確かめ」の 9 項目のうち 3 つは、機械が見ている: 「`records:close --mark` が通っている」は 9 節の手順そのもの、「生成物がコミットされている」と「CI と同じ確認が通る」は `records:close` が回し `npm test` が確かめる。

**案**

- 1.5 節の語彙の段落を、「説明文の言い回し → 語彙（`kind`・欄の名前）→ 例のキャラ」の 1 行ずつの表にする。条件・組み合わせの制約・既定は types.ts の注記と設計書に任せ、ここには書かない（書き写さない）。
- 4 節は機械が見ない 6 項目だけにする（説明文の全行が入っている・`assumes` と notes の種類・`claims` がある・`decidedOn`・既存のテストの数値・sim と calc の整合のテスト）。終わりに「`records:close --mark` が残りを見る」の 1 行。
- 語彙を足す PR では、表に 1 行足す（段落は書かない）。

**効果**: skills-guide.md は 12〜13KB になる見込み。スキル定義の PR で読む量が減り、types.ts との食い違いの元が無くなる。

## 6. 小さな直し

- **`npm run ci`**: CI と同じ確認（`format:check && lint && typecheck && test && build`）を `package.json` の 1 つのスクリプトにする。今は AGENTS.md「コミット手順」の 2、skills-guide.md 4 節、`records-close.ts`、ci.yml の 4 か所に 5 つのコマンドを書いている。ci.yml はログを分けて見られるよう段のまま残し、ほかの 3 か所は `npm run ci` と書く。
- **`records:new` の push を既定にする**: verification-guide.md 3・8 節は、`records:new` を必ず `--push` 付きで書いている。push を既定にし、しないときだけ `--no-push` を付ける。main の上やブランチが無いときは今と同じく push しない。1 節の `intake.ts --push` も同じ形（既定で push）にそろえる。

## 7. 古いブランチと `--pad-all`

**いま**

- origin には、main のほかに 5 つのブランチがある。
  - `claude/practical-cerf-5eifxm`・`claude/hopeful-carson-44x2yo`: main の祖先のコミットを指していて、中身はマージ済み（#690・#674）。
  - `claude/laughing-maxwell-n39fa0`: V-0486 の起案の 1 コミット。V-0486 は main にあり（録画の番号が 3 桁のままの古い版）、この枝は要らない。
  - `claude/cool-lamport-gf532m`: クラウド環境の実施の記録「12.5 節」を足す 1 コミット（2026-10-23）。main に入っていない。
  - `claude/nice-ptolemy-4d9ka0`: 2026-10-25 の起案（作業中。触らない）。
- `records:renumber -- --pad-all`（`records-pad-recordings.ts`、約 14KB）は、録画の番号を 4 桁にそろえた一度きりの道具。[design-recording-id-4digit.md](design-recording-id-4digit.md) 6 節で、4 桁にそろえる前から残っているブランチを取り込む前に回すために残している。今それに当たるのは上の `laughing-maxwell` と `cool-lamport` だけ。
- [captures/storage.md](captures/storage.md)「クラウド環境での取り寄せ › 使い方」の `fetch.ts` の例が 3 桁の番号（`040 063`）のまま。

**案**

- オーナーが決めたら、`laughing-maxwell`・`practical-cerf`・`hopeful-carson` を消す。`cool-lamport` の 12.5 節は、要るなら main に入れ直し（中身は短い）、要らなければ消す。
- 4 桁より前のブランチが無くなったら、`--pad-all` と `records-pad-recordings.ts` を消し、design-recording-id-4digit.md の 6 節に「消した。消したコミットは …」の 1 行を足す（#697 と同じ形）。`renumber-files.ts` は 1 本ずつの振り直しが使うので残す。
- storage.md の例を 4 桁にする。

## 8. Claude Code のメモリ

**いま**（メモリはデスクトップとクラウドで同じもの。索引は毎セッション読む）

- `pr-workflow.md`: 「未マージの PR があるうちに `records:new` を回すと、main に無い ID がまた振られる。作ったら直後に ID を振り直す」は古い（`records:new` はほかのブランチの番号を避け、前の回の 4 節で `--push` も入った）。「旧の履歴のブランチは … `claude/hit-rate-distance-bonus-spec-d4b55b` だけ」も、今の origin には無い。
- `records-automation-flow.md`: 道具の一覧と手順書の場所で、AGENTS.md の「検証の流れ … の道具は」の段落と同じ。メモリの決まり（AGENTS.md「記録の置き場所」: エージェントでしか意味のない手順とポインタだけ）からも、置く理由が無い。
- `spawn-task-one-at-a-time.md`: 「まとめて出してよい」は既定のふるまいで、制限を解いた経緯だけが残っている。

**案**

- `pr-workflow.md` の古い 2 行を消す。`records-automation-flow.md` と `spawn-task-one-at-a-time.md` を消し、索引の行も消す（チップの「着手前にオーナーに確かめる」の 1 文は、要るなら `check-parallel-work.md` に移す）。

## 9. 見たが案にしなかったもの

- `sync-after-merge` のフック: 1 回 0.7 秒。クラウドでは `gh` が無く、メインのチェックアウトも main でないので `git fetch` だけになるが、時間が小さいので直さない（前の回の 7 節と同じ判断）。
- レシピ `charge-shots`: 今も観測値・検証記録で使われていない。前の回の 6 節（次の SR・RL の検証まで残す）のまま。
- クラウドの準備が 2 か所（storage.md のサービスアカウント、cloud-guide.md の受け口）にあること: オーナーが 1 回だけ行う手順で、繰り返さないので動かさない。
- 検証記録の長さ（1 件 9〜14KB）: 節は `records:close` が見ていて、削れる決まった節は無い。
- [captures/guide.md](captures/guide.md)（40KB）: 目安の 50KB に近い。超えそうになったら話題ごとに分ける（今は分けない）。

## 10. 実施（2026-10-26）

- 1: 案のとおり。`intake.ts` は元ファイルを複数受け、1 本ずつ子のプロセスで取り込む。番号は `--id` から順に、無ければ空いている番号から順に取る。終わりに `records:table` を回し、録画の JSON と一覧を commit して push する（既定。`--no-push` でしない）。`--treasure` は、枠が `--rid` にあることと、そのキャラが宝物を持つことを、録画を動かす前に確かめる。道具が埋めない項目を手で埋めた後は `records:check`（3）。小さな動画 2 本で、番号・名前・宝物の段階・一覧の作り直しを確かめた（JSON は消した）。
- 2: 案のとおり。無い録画は、`NIKKE_DRIVE_SA_KEY` があれば `fetch.ts` を呼んで取り寄せる。録画は , か空白で並べる。クラウドで録画 `0194`・`0068` を取り寄せて読めることを確かめた（書いていない）。
- 3: 案のとおり。`records:check` は録画の一覧とスキルの分類も作り、`records/recordings` も整形する。作り直しても生成物に差分が出ないことを確かめた。
- 4: 案のとおり。加えて、2 つのファイルの今の表を一度だけ詰めた形にし、冒頭に書き方の 1 行を足した。
- 5: 案のとおり。ただし 4 節は 5 項目にした（`decidedOn` があることも `records:close` が見ているため）。skills-guide.md は 22.5KB から 18.2KB（見込みの 12〜13KB に届かないのは、表に決まりの短い文を残したため）。
- 6: 案のとおり。ci.yml は段のまま。`records:new` の `--push` は無くし、`--no-push` にした。押さえる処理は `packages/core/scripts/reserve.ts` に移し、`intake.ts` と共用にした。
- 7: `--pad-all` と `records-pad-recordings.ts`、`renumber.ts` の 4 桁にそろえる関数とテストを消した（[design-recording-id-4digit.md](design-recording-id-4digit.md) 13 節に 1 行）。storage.md の例を 4 桁にした。枝は、クラウドのセッションからは消せない（このセッションのブランチのほかへの push を通信の中継が 403 で止める）ので、オーナーが GitHub で消す: `claude/cool-lamport-gf532m`・`claude/laughing-maxwell-n39fa0`・`claude/practical-cerf-5eifxm`・`claude/hopeful-carson-44x2yo`。
- 8: 案のとおり（チップの「着手前にオーナーに確かめる」は `check-parallel-work.md` に移した）。メモリはリポジトリの外なので、この PR には入らない。
