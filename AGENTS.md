# AGENTS.md

NIKKE のダメージ計算ツール。

## 用語

- **共通のフレームループ（1 パス目）**: 射撃の列・バーストの時刻表・バフの区間・倍率ダメージの発動を作るフレームループ（`packages/core/src/frame/`）。
- **2 パス目**: 1 パス目の結果から、区間ごとの発数（射撃の列を二分探索で数える）とダメージ・1 秒ごとのダメージを集計する部分（`packages/core/src/sim/engine.ts`）。フレームループは出来事の列（`trace`）を作るときだけ回す。
- **sim**: 1 パス目と 2 パス目を回す計算の入口（`runSimulation`。`packages/core/src/sim/`）。画面・CLI・records 層はこの 1 本を使い、画面の形には `simTeamResult` でする。
- **calc**: 古い文書・検証記録・結論の「calc」は、一本化（`plan/design-unify-sim-calc.md`）で消した区間期待値のモデル（`calc/model.ts` の `computeTeamDamage`）と、画面のその表示・records 層の `model: "calc"` の経路を指す。
- **オーナー**: リポジトリの仕様決定者・承認者・指示者。
- **ユーザー / 利用者**: ダメージ計算ツールの利用者。

## 応答の言語

- オーナーとのやりとり（チャットの応答・質問・報告）は日本語で書く。コード・コマンド・識別子・引用はそのまま。

## コミット手順

- 作業はブランチで行い、PR で main にマージする。
- PR の単位は**実装・検証が完了した時点**（動作するコード・確定した結論・テストが揃った状態）。設計起案や撮影待ちの段階では PR を出さない。
- 設計の承認は対話で得て、実装と同じ PR に含める。
- 撮影待ちの間は、トピックブランチを保持する（撮影計画や予測の commit もそのブランチで行う）。
- コード（`packages/`・`apps/`・`tools/`）を変えた PR は、出す前に（テストが通った後に）差分を整理の観点（再利用・簡素化・効率・深さ。バグは見ない）で見直し、直しを同じ PR に入れる。Claude Code では `/simplify`。文書・記録・データだけの PR と、数行の直しでは要らない。
- PR を出す手順:
  1. commit してから `npm run pr:prep -- --push`: main をリベースで取り込み（マージはしない）、生成物の衝突は main の版を取って最後に 1 回だけ作り直し、CI と同じ確認（書式と lint はブランチで変えたファイルだけ。全部のファイルは GitHub の CI が見る）を通し、生成物を main の版に戻して push する（`tools/git/pr-prep.ts` の冒頭）。生成物は PR に入れず、マージの後に GitHub の CI が main で作り直して commit する（並行する PR どうしが生成物で衝突しないように。`plan/design-pr-conflicts.md` 3.1 節）。止まったら、道具が出す直し方に従い（生成物でないファイルの衝突は直して `git add` する。足した ID や録画の番号が main と重なったら、出た `npm run records:renumber` のコマンドで振り直して commit する）、もう一度回す
  2. `gh pr create`
  3. `gh pr merge --auto --squash`（作成直後に自動マージを予約する。マージ方式はスカッシュ）
- マージの後は、メインのチェックアウトの main を origin/main へ早送りし、マージ済みのブランチを origin/main に揃える（スカッシュマージでは、揃えないと差分の表示にマージ済みの変更が残る）。Claude Code ではフック（`.claude/settings.json` → `tools/git/sync-after-merge.ts`）が、セッションの開始・発言・応答の終わりに行う。
- worktree では最初に `npm ci`。

## 併用ルール（Claude Code / Antigravity）

- 同じ作業ツリーを 2 つのエージェントで同時に編集しない。並行するときはブランチと worktree を分ける。
- ブランチ名: Claude Code は `claude/<topic>`、Antigravity は `antigrav/<topic>`。
- worktree の作成先:
  - Claude Code: `.claude/worktrees/<session-name>`
  - Antigravity: `.antigrav/worktrees/<topic>`

## 離席と再開

- 離席や PC の電源を切る前は `npm run drive:sync` を回し（録画まわりを Google Drive にそろえる。`plan/captures/storage.md`「バックアップ」）、続ける作業はデスクトップのアプリの「クラウドで続ける」で移す。クラウドで作業するときの手順は `plan/cloud-guide.md`。

## 事実と記録

- 結論の一覧は `plan/claims.md`（生成）、その根拠は検証記録（`records/verifications/`）と観測値（`records/observations/`）にある。2026-09-26 までの根拠は `plan/verification.md` と `plan/captures/legacy-usage.md`（どちらも凍結）。これと矛盾する変更は、オーナーに確認してから行う。結論を訂正するときは、古い結論を消さずに棄却にする。
- 新しく結論を確定にできる条件（根拠の等級・撮る前の予測の扱い・再現に数えない録画）は `plan/verification-guide.md` 2.2 節が正。
- 1 つの事実は 1 か所に置く。実測値は観測値か検証記録に置き、ほかの文書は ID（`C-NNNN`・`V-NNNN`・観測値の ID）で指して数値を書き写さない。検証記録へはパスのリンクを張らず ID で指す。件数は文書に書かず、生成物に出す。
- 新しい知見は、まず検証記録（数値は観測値）に根拠つきで書き、撮影や読み取りで繰り返し効くものは `plan/captures/guide.md` に 1〜2 行で足す。
- 検証の編成は、観測したい事象に影響しうる未確定の要素が最も少ないものを選ぶ（最小構成）。単騎で観測できる事象は単騎で確かめる。
- 多人数の編成も、観測したい事象のほかは機構が確定したキャラだけで組めば、機構の根拠にしてよい。未確定の要素が 2 つ以上混ざる録画は、残差の推移の記録と仮説の出どころにとどめ、結論は作らない。
- 「機構が確定したキャラ」は、`plan/skills.md` でダメージに効く効果と notes（計算に無関係・間接の notes は除く。間接の notes は、読む側のいる編成で最小構成の検査が見る）の根拠がすべて確定（か範囲外）の結論に結び付き、通常攻撃の条件（コア命中率・距離ボーナス・弾丸命中率）がその的で測られているキャラ。
- 残差を係数で埋めない。モデルと実測の差は、原因を単独で確かめた変更でだけ縮める。
- 根拠のない変更は行わない。未解明の部分は「未実装」等と明記したプレースホルダーとし、ユーザーが未実装であることを理解できるようにする。
- 根拠のある変更は、たとえ実測数値とシミュレーション数値の乖離が広がるとしても実施する。

## 文書の書き方

- 文書の書き方は、下の「記録の置き場所」の表の型で決まる。
  - **現状**: いまの決まり・状態・手順だけを書く。変わったら書き換え、古い記述は消す。決めた日・決めた人・前の形・移した先の案内は書かない（経緯は設計書・検証記録・git の履歴にある）。理由が要るときは、設計書の節を 1 つ指す。
  - **記録**: その時の事実・案・決定と理由・経過を書く（経緯はここに置く）。書いた事実は書き換えず、訂正は棄却か新しい記録で行う。設計書の「経過」には、設計・実装・状態が変わったときだけ 1 行足す（結論の確定は書き写さない）。
  - **生成**: 手で書かない。`npm run records:check` で作り直す。スキル定義・録画の台帳・観測値の比べる指定・結論の状態や `edge` を変えたら、`npm run records:minimal` で最小構成の検査の感度も計算し直す（回し忘れは手元の `npm test` が落とす）。PR には入れない（上の「コミット手順」）。
  - **凍結**: 書き足さない。
- 記録が節の番号・見出し・題名で指しているのは、書いた時点の版（git で引ける）。現状の文書の見出し・節の番号・空の節・閉じた項目を、古い参照のために残さない。ID とファイルのパスは変えない。
- 進み具合は、その仕事の設計書の経過にだけ書く。roadmap.md・backlog.md・段の一覧と、設計書の冒頭の「状態」の行には、状態と設計書の節だけを書く（8 節の課題のファイル・段の一覧の経過・「状態」の行への書き写しは `npm run pr:prep` が止める）。
- 手書きのファイルは 50KB、検証記録は 30KB を目安にし、超えそうなら分ける。
- 行を足し引きする表（roadmap.md など）は詰めた形（`| a | b |`）で書き、前に `<!-- prettier-ignore -->` を置く（列幅をそろえ直すと、1 行の変更で表の全部の行が差分に出て、並行するブランチと衝突する）。
- 各文書の冒頭には、何のための文書かと関連と、その文書に固有の書き方だけを書く（共通の書き方はこの節）。

## コミットしないもの

- `scratch/`（オーナーの育成データを含む。公開リポジトリ）
- 録画の実体と証拠フレーム（スクリーンショット）。どちらも `E:/nikke_project_captures/` に置き、追跡するのは台帳と手引きだけ（`.gitignore` 参照）。クラウド環境では Google Drive のバックアップから取り寄せる（`plan/captures/storage.md`「クラウド環境での取り寄せ」）
- `private/`（個人の情報。下記）

## 記録の置き場所

リポジトリの記録を正とする。どのエージェントも同じものを読めるようにするため、エージェント固有のメモ（Claude Code の全体の CLAUDE.md・メモリなど）には、そのエージェントでしか意味のない手順と、ここへのポインタだけを置く。リポジトリの決まりの写しや、経緯・知見をそちらにだけ書かない。

<!-- prettier-ignore -->
| 置き場所 | 型 | 置くもの |
| --- | --- | --- |
| `README.md` | 現状 | 利用者と開発者への紹介 |
| `AGENTS.md` | 現状 | 両エージェントが守る短い規則と、この表 |
| `plan/requirements.md` | 現状 | 目的・方針・構成・範囲と前提（モデルで扱わないもの） |
| `plan/roadmap.md` | 現状 | Stage の一覧（1 つ 1 行） |
| `records/backlog/`・`plan/backlog.md` | 現状・生成 | 残っている仕事（課題 1 件 1 ファイル。課題の起票もここ）と、その一覧（種類ごとに 1 行。書き方は一覧の冒頭） |
| 設計書（`plan/design-*.md`・`plan/burst-effect-delay-candidates.md`） | 記録 | 1 つの変更の案・論点・決定と理由・経過 |
| `records/claims/`・`plan/claims.md` | 記録・生成 | 結論（1 件 1 ファイル）と、話題ごとの一覧（問いから結論を引くのはここ） |
| `records/verifications/`・`plan/verifications.md` | 記録・生成 | 検証記録（1 回の検証を 1 ファイル）と、その一覧 |
| `records/predictions/` | 記録 | 予測（任意。検証記録ごとに 1 ファイル） |
| `records/recordings/`・`plan/captures/recordings.md` | 記録・生成 | 録画ごとの条件と素性（1 本 1 ファイル）と、その一覧 |
| `records/observations/`・`plan/residuals.md` | 記録・生成 | 録画から読んだ値（観測値）と、モデルとの残差の見る行（全部は `npm run records:residual`） |
| `plan/minimal.md` | 生成 | 最小構成の検査 |
| `packages/core/data/skills/`・`plan/skills.md`・`plan/skill-catalog.md` | データ・生成 | スキル定義と、キャラ × スロットの対応状況・説明文の効果の分類 |
| `plan/verification-guide.md` | 現状 | 検証の流れ（起案 → 撮影計画 → 撮る → 取り込み → 読む → 比べる → 結論 → 閉じる）と道具、確定にできる条件 |
| `plan/skills-guide.md` | 現状 | キャラのスキルを定義する手順 |
| `plan/captures/protocol.md` | 現状 | 撮影の手順と、撮影の依頼の型 |
| `plan/captures/index.md` | 現状 | 命名規約・キャラ同定 |
| `plan/captures/storage.md`・`plan/captures/tools.md` | 現状 | 録画の置き場所・バックアップ・取り寄せ（storage）と、解析ツール（tools） |
| `plan/captures/guide.md` | 現状 | 撮影と読み取りの落とし穴の索引 |
| `plan/captures/backup-log.md` | 記録 | ふだんと違う同期の出来事 |
| `plan/cloud-guide.md` | 現状 | クラウドで作業するときの手引き |
| `plan/references.md`・`plan/game-help.md` | 現状 | 外の資料の目録と、ゲーム内のヘルプ（ⓘ）の書き起こし |
| `plan/verification.md`・`plan/captures/legacy-usage.md`・`plan/roadmap-archive.md`・`plan/captures/backup-log-old*.md` | 凍結 | 凍結した日までの記録（範囲は各文書の題名） |
| `private/`（メインのチェックアウト直下、追跡しない） | — | 所持キャラ・宝物・育成状況・ローカルのパスなど個人の情報。worktree には無いので絶対パスで読む（クラウドでは始めのフックがリポジトリの直下に置く）。worktree のエージェントは書き込めないので、足すものはオーナーに渡す |
