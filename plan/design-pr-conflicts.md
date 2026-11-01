# PR の衝突の頻度と対策の案（2026-11-01）

- 何のための文書か: PR が main と衝突する頻度を、マージ済みの PR（#1〜#873）の履歴から測り、原因のファイルと対策の案を出す。2026-11-01 にオーナーが 1 と ruleset の bypass を承認し、1 を実施した（5 節）。3 は [design-backlog-files.md](design-backlog-files.md) で実施した（2 は 1 の代わりなので要らない）。
- 関連: 衝突の手間を道具に寄せた `npm run pr:prep`（[design-workflow-simplification-4.md](design-workflow-simplification-4.md) 2 節）、表の列幅（[-2](design-workflow-simplification-2.md) 4）・roadmap.md と backup-log.md の書き足し（[design-workflow-simplification.md](design-workflow-simplification.md) 1・2）・段の一覧の経過（[-6](design-workflow-simplification-6.md)）の衝突を減らした回。生成物をコミットし続ける判断（[-4](design-workflow-simplification-4.md) の採らない案・[-7](design-workflow-simplification-7.md)）。
- 調べ方: origin/main（68f19e24）の first-parent の履歴（スカッシュの commit が PR 1 本）と、PR の作成・マージの時刻（GitHub の検索）と、PR の最後の head（`refs/pull/N/head`）を使った。PR ごとに、PR の変更（スカッシュの commit とその親の差）を、次の 2 つの時点の main の上に置いたときに、マージの直前の main と衝突するかを `git merge-tree --merge-base` で試した。
  - **作成の後**: PR を作った時刻の main。GitHub の画面で「衝突あり」になり、自動マージが止まる分。
  - **作業の全体**: PR の commit のいちばん早い author の時刻の main。作業の間とその後の `pr:prep` のリベースで出会う分（作成の後を含む）。
  - 同じ行を直した PR の変更だけを見るので、作業の途中の commit どうし・同じセッションの続きの PR どうしの衝突は数えていない（少なめに出る）。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | 生成物を PR に入れず、マージの後に GitHub Actions が main で作り直して commit する | 作成の後の衝突のほとんど（直近は PR の約 3 割が衝突し、開いている時間の中央値が 5 分 → 30 分）。`pr:prep` の生成物の衝突の解消 | 進めてよいか。ruleset「automerge」の bypass に GitHub Actions（か、専用の GitHub App）を足してよいか |
| 2 | 1 を採らないなら: main に push されたら、生成物だけで衝突した PR を GitHub Actions が `pr:prep` と同じやり方でリベースして push し直す | 生成物だけの衝突の、セッションの手当て待ち | 1 と 2 のどちらにするか。2 なら CI を起こせるトークン（PAT か GitHub App）を secret に置いてよいか |
| 3 | backlog.md を 1 項目 1 ファイルにして、backlog.md を生成物にする | 手で直す衝突でいちばん多いファイル（直近の 73 本で 8 本） | 1 か 2 の後に進めてよいか |

推奨は 1、その後に 3。2 は、ruleset に bypass を足したくないときの代わり。

## 1. 頻度

PR 100 本ごと（#801〜#873 は 73 本）。「生成物」は `GENERATED_PATHS`（`pr:prep` が main の版を取って作り直すもの）。

<!-- prettier-ignore -->
| PR | 作業の全体で衝突 | うち生成物だけ | うち手で直すファイルを含む | 作成の後に衝突 | うち手で直すファイルを含む |
| --- | --- | --- | --- | --- | --- |
| #1〜#100 | 11 | 6 | 5 | 9 | 4 |
| #101〜#200 | 9 | 3 | 6 | 8 | 6 |
| #201〜#300 | 29 | 4 | 25 | 8 | 8 |
| #301〜#400 | 42 | 4 | 38 | 10 | 8 |
| #401〜#500 | 43 | 16 | 27 | 17 | 9 |
| #501〜#600 | 36 | 3 | 33 | 5 | 5 |
| #601〜#700 | 35 | 2 | 33 | 8 | 5 |
| #701〜#800 | 34 | 13 | 21 | 9 | 3 |
| #801〜#873 | 43 | 27 | 16 | 21 | 5 |

- 全体では 872 本のうち 282 本（32%）が作業の間かその後に衝突し、95 本（11%）は PR を作った後に衝突した。
- 直近（#801〜）は、作業の全体で 59%、作成の後で 29% と、いちばん多い。並行するセッションが増えた日（10-31 は PR 73 本のうち 37 本、11-01 は 28 本のうち 16 本が衝突）に集中する。
- 手で直す衝突は減ってきた（#301〜#700 は 100 本あたり 27〜38 本 → #801〜 は 16 本）。いま残る衝突の大半は生成物。
- #701〜 の PR で、作成の後に衝突したもの（30 本）は開いている時間の中央値が 30 分（計 1183 分）、main が進んでも衝突しなかったもの（29 本）は 5 分、main が進まなかったもの（114 本）は 4 分。衝突すると、セッションが気づいて `pr:prep` を回し直すまで自動マージが止まる。

## 2. 原因のファイル

**生成物**（作業の全体で衝突した PR の数。全期間）: `plan/verifications.md` 71・`plan/residuals.md` 67・`plan/claims.md` 61・`plan/minimal.md` 41・`plan/captures/recordings.md` 26・`plan/skills.md` 15・`records/minimal/sensitivity.json` 13。

- 検証の PR は生成物をほぼ全部書き換えるので、並行する検証の PR どうしはまず衝突する。
- #701〜 の作成の後の衝突の中身（衝突の箇所）: Markdown の生成物では、冒頭の件数の行を含む箇所が 107、表の行だけの箇所が 68。件数の行は PR ごとに必ず変わり、表は新しい ID が末尾の同じ所に足される。件数の行を外しても表の末尾で衝突が残るので、生成物の中身を変えても衝突は無くならない。`sensitivity.json` は 76 箇所。

**手で直すファイル**（同じ数え方。全期間 → #601〜）:

<!-- prettier-ignore -->
| ファイル | 全期間 | #601〜 | #801〜 |
| --- | --- | --- | --- |
| `plan/backlog.md` | 108 | 34 | 8 |
| `plan/captures/backup-log.md` | 50 | 14 | 0 |
| `plan/roadmap.md` | 49 | 10 | 0 |
| `packages/core/src/skills/types.ts` | 13 | 6 | 2 |
| 段の一覧・段の設計書（`plan/design-skill-stage*.md`） | 12 | 11 | 4 |

- backup-log.md と roadmap.md は、前の回の対策（録画ごとの行をやめた・1 項目 1 行・段の一覧の経過）の後、衝突が無くなった。
- backlog.md は、同じ節の表の隣り合う行を、並行する PR が足したり消したりして衝突する（行の追加は節の末尾の同じ所に入る）。
- 段の設計書は、同じ段の続きの PR を並行して進め、経過の末尾に行を足し合ったもの。
- コード（`packages/`・`apps/`・`tools/` の `.ts`）の衝突は全期間で 36 本（#801〜 は 4 本）。同じ話題を並行して進めたときで、構造の対策の外。

## 3. 案

### 3.1 案 1: 生成物を main でだけ作り直す

**いま**

- PR のブランチが生成物を書き換えて commit する。CI のテスト（`skills.test.ts`・`relevance.test.ts` など）が、生成物が入力と合っているかを見る。
- 生成物をコミットするのは、GitHub の画面とスマホで結論・検証の一覧を読むため（第 4 回・第 7 回）。

**案**

- `pr:prep` は、作り直しで生成物に出た差分を commit せず、main の版に戻してから push する（生成物の作り直しとテストは、手元では今どおり回して確かめる）。PR は生成物を触らないので、生成物では衝突しない。
- CI（`ci.yml`）は、テストの前に生成物を作り直す（PR では commit しない）。今の「生成物が入力と合っているか」のテストは、作り直した後のものを見るので通る。
- main への push で動く新しいワークフローが、生成物を作り直し、差分があれば「生成物を作り直す」の commit を main に push する（`concurrency` で 1 本ずつ）。この push は ruleset「automerge」の「PR 必須」を通らないので、bypass に GitHub Actions（か専用の GitHub App）を足す。
- main の生成物は、マージから数分遅れて合う。GitHub で読む使い方はそのまま残る。

**効果**: 直近の作成の後の衝突（#801〜 の 21 本）のうち 16 本は生成物だけで、無くなる。残りの 5 本も生成物の衝突は無くなる。`pr:prep` の生成物の衝突の解消と、生成物だけの commit が要らなくなる。

**気をつけること**

- bypass は main への直接の push を Actions に許す。ワークフローは生成物のパス（`GENERATED_PATHS`）だけを commit するように書き、ほかのファイルが変わったら止める。
- 作り直しの commit も main の CI を回す（数分）。
- PR の差分の画面では、生成物の変わり方が見えなくなる（PR の本文の結論の一覧で足りるか）。

### 3.2 案 2: 生成物だけの衝突を Actions が直す

- main への push で動くワークフローが、自動マージを予約した開いている PR のうち、`mergeable` が衝突のものを取り、`pr:prep` と同じやり方（生成物の衝突は main の版を取り、終わりに作り直す。生成物でないファイルが衝突したら何もしない）でリベースして push し直す。
- `GITHUB_TOKEN` で push すると、その push では CI が起きず、必須チェック `check` が付かないので自動マージが進まない。CI を起こすには PAT か GitHub App のトークンを secret に置く。
- 生成物の置き方を変えないので、PR ごとの生成物の commit と、PR の数だけの作り直し（`records:check` で約 1 分）は残る。並行する PR が多いと、1 本マージされるたびに残りの全部を作り直す。

### 3.3 案 3: backlog.md を 1 項目 1 ファイルにする

- `records/claims/` と同じく、課題を 1 件 1 ファイル（例 `records/backlog/<id>.json`。節・種類・本文・指す ID）に置き、`plan/backlog.md` を生成物にする。課題を足す・消す PR は別のファイルを触るので、衝突しない（生成物の衝突は案 1 か 2 で無くなる）。
- 課題の書き方の手順（AGENTS.md・設計書の「backlog.md に足す」の書き方）を変える必要がある。直近の衝突は 73 本に 8 本なので、案 1 の後に進めればよい。

## 4. 採らない案

- **生成物の件数の行を外す**: 2 節のとおり、表の末尾の衝突が残る。件数は生成物に出す決まり（AGENTS.md「事実と記録」）もある。
- **`.gitattributes` の `merge=union`**: GitHub は PR の衝突の判定に `.gitattributes` のマージの指定を使わないので、作成の後の衝突（自動マージが止まる分）には効かない。手元のリベースでも、表の行を消す変更と足す変更が混ざると、行が重複・復活するおそれがある。
- **GitHub の merge queue**: 衝突の解消はしない。
- **並行するセッションを減らす**: 衝突は並行の多い日に集中するが、並行で進めることはオーナーの使い方なので、構造の側で減らす。

## 5. 決定と実施

- 決定（2026-11-01、オーナー）: 案 1 で進める。ruleset「automerge」の bypass に GitHub Actions を足してよい。
- 案からの変更:
  - main で作り直すのは新しいワークフローではなく、CI（`ci.yml`）の `check` のジョブの終わりの段にした（`tools/git/ci-generated.ts --commit`）。確認の前に作り直しているので、確認の通った中身をそのまま commit でき、作り直しを 2 回回さずに済む。push の前に origin/main がまだその commit かを見て、進んでいれば何もしない（後の commit の CI が全部を作り直す）。
  - PR の CI も確認の前に `npm run records:minimal` で作り直す。作り直しで生成物でないファイル（開いている検証記録の予測との比べの表・整形）が変わったら、PR の CI を落とす（`tools/git/ci-generated.ts`。CI の作業ツリーで整形し直したファイルが書式の確認を素通りしないように）。main では知らせるだけ。
  - `pr:prep` は、作り直しをいつも `records:minimal`（変わった組だけ計算し直す。`records:check` も回る）にした（前の `regenerateScript` の切り替えは要らなくなった）。作り直しで生成物でないファイルが変わったら「records:check の書き換え」として commit し、確認の後に生成物を main の版に戻して「生成物を main の版に戻す」の commit を足す。
  - GitHub Pages（`pages.yml`）は、main への push ではなく、main の CI が通った後（`workflow_run`）に main の先頭を配る。画面が読む `packages/core/data/skills/support.json` も生成物で、CI の push（`GITHUB_TOKEN`）では Pages が起きないため。CI が落ちた main は配らなくなる。
- 確かめたこと: 使い捨てのブランチで結論の文を変えて生成物ごと commit し、`node tools/git/pr-prep.ts --no-ci` を回した。main を取り込み、生成物を main の版に戻す commit が足され、`origin/main...HEAD` の差分に生成物が無くなった。その上で `records:minimal` と `ci-generated.ts` を回し、変わった生成物が `plan/claims.md` だけと出て通った。`--commit` の push は GitHub の上でしか試せないので、この PR のマージの後の main の CI で確かめる。
- 費用: PR の CI が作り直しの分（このクラウドの環境で約 1 分半）長くなる。
- push の身元: ruleset の Bypass list に GitHub Actions（`GITHUB_TOKEN`・github-actions[bot]）は出てこない（GitHub の仕様で、bypass に足せない）。そのため、書き込みのできるデプロイキーで push する。秘密鍵は secret の `GENERATED_DEPLOY_KEY` に置き、`ci-generated.ts --commit` が SSH で使う。CI の `GITHUB_TOKEN` は読むだけ（`contents: read`）に戻した。デプロイキーはこのリポジトリだけに効き、人のアカウントに結び付かない。
- オーナーの設定（この PR のマージの前に）: 鍵の組を作り、公開鍵を Settings → Deploy keys に「Allow write access」つきで足し、秘密鍵を Settings → Secrets and variables → Actions に `GENERATED_DEPLOY_KEY` で足し、ruleset「automerge」の Bypass list に「Deploy keys」を足す。

## 経過

- 2026-11-01: 起案（頻度の測定と案）。
- 2026-11-01: 案 1 を実施（5 節）。
- 2026-11-01: 案 3 を実施（[design-backlog-files.md](design-backlog-files.md)）。
