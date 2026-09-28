# AGENTS.md

NIKKE のダメージ計算ツール。

## 用語

- **calc**: 区間期待値のモデル（`packages/core/src/calc/`）と、その結果を出すアプリ（今は `apps/web` の calc 表示）。
- **sim**: フレーム逐次のモデル（`packages/core/src/sim/`）と、その結果を出すアプリ（今は `apps/web` の sim 表示）。
- **共通のフレームループ**: 両モデルが使う 1 パス目（`packages/core/src/frame/`）。1 発分の式・スキル定義・データも両モデルで共通。
- **オーナー**: リポジトリの仕様決定者・承認者・指示者。
- **ユーザー / 利用者**: ダメージ計算ツールの利用者。

## コミット手順

- 作業はブランチで行い、PR で main にマージする。
- PR を出す手順:
  1. `git fetch origin && git rebase origin/main`（main を取り込むときはマージではなくリベース）。生成物が衝突したら `git checkout --ours -- <ファイル>` で main の版に戻し、自分のブランチで足した ID が main と重なっていれば次の空き番号に振り直し、作り直してから `git rebase --continue` する（`plan/design-stage20.md` 3.6 節）
  2. CI と同じ確認を通す: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
  3. `git push -u origin HEAD`（リベースで履歴を書き換えたときは `--force-with-lease`）
  4. `gh pr create`
  5. `gh pr merge --auto --squash`（作成直後に自動マージを予約する。マージ方式はスカッシュ）
- マージの後は、メインのチェックアウトの main を origin/main へ早送りし、マージ済みのブランチを origin/main に揃える（スカッシュマージでは、揃えないと差分の表示にマージ済みの変更が残る）。Claude Code ではフック（`.claude/settings.json` → `tools/git/sync-after-merge.ts`）が、セッションの開始・発言・応答の終わりに行う。
- worktree では最初に `npm ci`。

## 併用ルール（Claude Code / Antigravity）

- 同じ作業ツリーを 2 つのエージェントで同時に編集しない。並行するときはブランチと worktree を分ける。
- ブランチ名: Claude Code は `claude/<topic>`、Antigravity は `antigrav/<topic>`。
- worktree の作成先:
  - Claude Code: `.claude/worktrees/<session-name>`
  - Antigravity: `.antigrav/worktrees/<topic>`

## 事実と記録

- 結論の一覧は `plan/claims.md`（生成）、その根拠は検証記録（`records/verifications/`）と観測値（`records/observations/`）にある。2026-09-26 までの根拠は `plan/verification.md` と `plan/captures/legacy-usage.md`（どちらも凍結）。これと矛盾する変更は、オーナーに確認してから行う。結論を訂正するときは、古い結論を消さずに棄却にする。
- 新しく結論を確定にするのは、根拠の等級が厳密一致・反復実測・データ明記のときだけ（等級の決め方は `plan/claims.md` の冒頭）。
- 1 つの事実は 1 か所に置く。実測値は観測値か検証記録に置き、ほかの文書は ID（`C-NNNN`・`V-NNNN`・観測値の ID）で指して数値を書き写さない。検証記録へはパスのリンクを張らず ID で指す。件数は文書に書かず、生成物に出す。
- 手書きのファイルは 50KB、検証記録は 30KB を目安にし、超えそうなら分ける。
- 単騎または最小構成による実測を優先する。ここでいう最小構成とは、確定させたいスキル効果や仕様について、可能な限り未確定の要素が混入しないものをいう。
- 根拠のない変更は行わない。未解明の部分は「未実装」等と明記したプレースホルダーとし、ユーザーが未実装であることを理解できるようにする。
- 根拠のある変更は、たとえ実測数値とシミュレーション数値の乖離が広がるとしても実施する。

## コミットしないもの

- `scratch/`（オーナーの育成データを含む。公開リポジトリ）
- 録画の実体と証拠フレーム（スクリーンショット）。どちらも `E:/nikke_project_captures/` に置き、追跡するのは台帳と手引きだけ（`.gitignore` 参照）
- `private/`（個人の情報。下記）

## 記録の置き場所

リポジトリの記録を正とする。どのエージェントも同じものを読めるようにするため、エージェント固有のメモ（Claude Code のメモリなど）には、そのエージェントでしか意味のない手順と、ここへのポインタだけを置く。経緯や知見をそちらにだけ書かない。

| 置き場所                                             | 置くもの                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                          | 両エージェントが守る短い規則                                                                                                                                       |
| `plan/roadmap.md`・設計書                            | 計画・決定・Stage の状況                                                                                                                                           |
| `records/claims/`・`plan/claims.md`                  | 結論（1 件 1 ファイルの JSON。ID・状態・話題・根拠の等級・根拠・モデル側）と、話題ごとの一覧（生成）。問いからいまの結論を引くのは一覧                             |
| `records/verifications/`・`plan/verifications.md`    | 検証記録（1 回の検証を 1 ファイル。問い・予測・結果・結論）と、その一覧（生成。開いている検証が冒頭に出る）                                                        |
| `plan/captures/index.md`                             | 置き場所・撮影プロトコル・命名規約・キャラ同定・解析ツールと、録画ごとの注記（録画の一覧の表は `plan/captures/recordings.md`）                                     |
| `records/recordings/`・`plan/captures/recordings.md` | 録画ごとの条件（編成・操作枠・的・モード・スペック固定）と素性（1 本 1 ファイルの JSON）と、その一覧（生成。`npm run records:table`）                              |
| `records/observations/`・`plan/residuals.md`         | 録画から読んだ値（観測値）と、モデルとの残差の一覧（生成。`npm run records:check`）                                                                                |
| `plan/verification.md`                               | 2026-09-26 までの実測と確認の記録（凍結。書き足さない）                                                                                                            |
| `plan/captures/guide.md`                             | 撮影と読み取りの落とし穴の話題別の索引（根拠は ID か、上の文書へのリンクで指す）                                                                                   |
| `plan/skills-guide.md`                               | キャラのスキルを定義して撮影で確かめる手順                                                                                                                         |
| `packages/core/data/skills/`・`plan/skills.md`       | スキル定義（効果ごとの根拠の結論 ID は `claims` の欄）と、キャラ × スロットの対応状況の一覧（生成。`npm run records:check`）                                       |
| `private/`（メインのチェックアウト直下、追跡しない） | 所持キャラ・宝物・育成状況・ローカルのパスなど個人の情報。worktree には無いので絶対パスで読む。worktree のエージェントは書き込めないので、足すものはオーナーに渡す |

新しい知見は、まず検証記録（数値は観測値）に根拠つきで書き、撮影や読み取りで繰り返し効くものは `guide.md` に 1〜2 行で足す。
