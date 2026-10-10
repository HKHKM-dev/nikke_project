# AGENTS.md

NIKKE のダメージ計算ツール。

## 用語

- **calc**: 区間期待値のモデル（`packages/core/src/calc/`）と、その結果を出すアプリ（今は `apps/web` の calc 表示）。
- **sim**: フレーム逐次のモデル（`packages/core/src/sim/`）と、その結果を出すアプリ（今は `apps/web` の sim 表示）。
- **共通のフレームループ**: 両モデルが使う 1 パス目（`packages/core/src/frame/`）。1 発分の式・スキル定義・データも両モデルで共通。
- **オーナー**: リポジトリの仕様決定者・承認者・指示者。
- **ユーザー / 利用者**: ダメージ計算ツールの利用者。

## 応答の言語

- オーナーとのやりとり（チャットの応答・質問・報告）は日本語で書く。コード・コマンド・識別子・引用はそのまま。

## コミット手順

- 作業はブランチで行い、PR で main にマージする。
- PR の単位は**実装・検証が完了した時点**（動作するコード・確定した結論・テストが揃った状態）。設計起案や撮影待ちの段階では PR を出さない。
- 設計の承認は対話で得て、実装と同じ PR に含める。
- 撮影待ちの間は、トピックブランチを保持する（撮影計画や予測の commit もそのブランチで行う）。
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
- 撮る前の予測は確定の条件にしない。過去の録画の読み直しでも確定にできる。反復実測の再現には、仮説・値・読み方を決めるのに使った録画を数えない（結論の `decidedOn` に書く）。2026-10-10 のオーナーの決定（`plan/design-investigation-review.md` 1 節）。
- 1 つの事実は 1 か所に置く。実測値は観測値か検証記録に置き、ほかの文書は ID（`C-NNNN`・`V-NNNN`・観測値の ID）で指して数値を書き写さない。検証記録へはパスのリンクを張らず ID で指す。件数は文書に書かず、生成物に出す。
- 手書きのファイルは 50KB、検証記録は 30KB を目安にし、超えそうなら分ける。
- 検証の編成は、観測したい事象に影響しうる未確定の要素が最も少ないものを選ぶ（最小構成）。単騎で観測できる事象は単騎で確かめる。
- 多人数の編成も、観測したい事象のほかは機構が確定したキャラだけで組めば、機構の根拠にしてよい。未確定の要素が 2 つ以上混ざる録画は、残差の推移の記録と仮説の出どころにとどめ、結論は作らない（2026-09-25 の「多人数の録画は分解しない」は、2026-10-01 にこの規則に置き換えた）。
- 「機構が確定したキャラ」は、`plan/skills.md` でダメージに効く効果と notes（計算に無関係の notes は除く）の根拠がすべて確定（か範囲外）の結論に結び付き、通常攻撃の条件（コア命中率・距離ボーナス・弾丸命中率）がその的で測られているキャラ。
- 残差を係数で埋めない。モデルと実測の差は、原因を単独で確かめた変更でだけ縮める。
- 根拠のない変更は行わない。未解明の部分は「未実装」等と明記したプレースホルダーとし、ユーザーが未実装であることを理解できるようにする。
- 根拠のある変更は、たとえ実測数値とシミュレーション数値の乖離が広がるとしても実施する。

## コミットしないもの

- `scratch/`（オーナーの育成データを含む。公開リポジトリ）
- 録画の実体と証拠フレーム（スクリーンショット）。どちらも `E:/nikke_project_captures/` に置き、追跡するのは台帳と手引きだけ（`.gitignore` 参照）。クラウド環境では Google Drive のバックアップから取り寄せる（`plan/captures/storage.md`「クラウド環境での取り寄せ」）
- `private/`（個人の情報。下記）

## 記録の置き場所

リポジトリの記録を正とする。どのエージェントも同じものを読めるようにするため、エージェント固有のメモ（Claude Code のメモリなど）には、そのエージェントでしか意味のない手順と、ここへのポインタだけを置く。経緯や知見をそちらにだけ書かない。

| 置き場所                                             | 置くもの                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                          | 両エージェントが守る短い規則                                                                                                                                       |
| `plan/roadmap.md`・設計書・`plan/backlog.md`         | 計画・決定・Stage の状況。残タスクの棚卸し（種類ごとの 1 行の一覧。経過と数値は書かない）は `plan/backlog.md`                                                      |
| `records/claims/`・`plan/claims.md`                  | 結論（1 件 1 ファイルの JSON。ID・状態・話題・根拠の等級・根拠・モデル側）と、話題ごとの一覧（生成）。問いからいまの結論を引くのは一覧                             |
| `records/verifications/`・`plan/verifications.md`    | 検証記録（1 回の検証を 1 ファイル。問い・予測・結果・結論）と、その一覧（生成。開いている検証が冒頭に出る。予測との比べと最小構成の警告も出る）                    |
| `records/predictions/`                               | 予測（任意。検証記録ごとに 1 ファイル。編成・仮説・比べる指標と、`npm run records:predict` が書く値）。撮影計画で仮説を見分けられるか確かめるのに使う              |
| `plan/captures/index.md`                             | 命名規約・撮影プロトコル・キャラ同定と、録画ごとの注記（録画の一覧の表は `plan/captures/recordings.md`）                                                           |
| `plan/captures/storage.md`・`plan/captures/tools.md` | 録画の置き場所・バックアップ・クラウド環境での取り寄せ（storage.md）と、解析ツール・フレーム番号の約束・証拠フレーム（tools.md）                                   |
| `records/recordings/`・`plan/captures/recordings.md` | 録画ごとの条件（編成・操作枠・的・モード・スペック固定）と素性（1 本 1 ファイルの JSON）と、その一覧（生成。`npm run records:table`）                              |
| `records/observations/`・`plan/residuals.md`         | 録画から読んだ値（観測値）と、モデルとの残差の一覧（生成。`npm run records:check`）                                                                                |
| `plan/verification.md`                               | 2026-09-26 までの実測と確認の記録（凍結。書き足さない）                                                                                                            |
| `plan/captures/guide.md`                             | 撮影と読み取りの落とし穴の話題別の索引（根拠は ID か、上の文書へのリンクで指す）                                                                                   |
| `plan/game-help.md`                                  | ゲーム内のヘルプ（ⓘ）の書き起こし                                                                                                                                  |
| `plan/verification-guide.md`                         | 検証の共通の流れ（起案から閉じるまで）と、確定にできる条件                                                                                                         |
| `plan/skills-guide.md`                               | キャラのスキルを定義する手順（検証の流れは `plan/verification-guide.md`）                                                                                          |
| `packages/core/data/skills/`・`plan/skills.md`       | スキル定義（効果ごとの根拠の結論 ID は `claims` の欄）と、キャラ × スロットの対応状況の一覧（生成。`npm run records:check`）                                       |
| `private/`（メインのチェックアウト直下、追跡しない） | 所持キャラ・宝物・育成状況・ローカルのパスなど個人の情報。worktree には無いので絶対パスで読む。worktree のエージェントは書き込めないので、足すものはオーナーに渡す |

新しい知見は、まず検証記録（数値は観測値）に根拠つきで書き、撮影や読み取りで繰り返し効くものは `guide.md` に 1〜2 行で足す。

検証の流れ（起案 → 撮影計画（予測は任意）→ 撮る → 取り込み → レシピで読む → 比べる → 結論の下書き → 閉じる）の道具は `npm run records:new`・`records:predict`・`records:read`・`records:check`・`records:close` と `tools/captures/intake.ts`（`plan/design-records-automation.md` 2 節。手順は `plan/verification-guide.md`）。

最小構成の検査（確定の結論 × 根拠の観測値の組に、効きうる未確定の要素を出す）は `plan/minimal.md`（生成）。スキル定義・録画の台帳・観測値の比べる指定を変えたら `npm run records:minimal` で感度を計算し直す（`plan/design-minimal-relevance.md` 10.6 節）。
