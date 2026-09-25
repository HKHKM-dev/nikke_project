# AGENTS.md

NIKKE のダメージ計算ツール。

## 用語

- **calc**: 区間期待値のモデル（`packages/core/src/calc/`）と、その結果を出すアプリ（今は `apps/web` の calc 表示）。
- **sim**: フレーム逐次のモデル（`packages/core/src/sim/`）と、その結果を出すアプリ（今は `apps/web` の sim 表示）。
- **共通のフレームループ**: 両モデルが使う 1 パス目（`packages/core/src/frame/`）。1 発分の式・スキル定義・データも両モデルで共通。

## 進め方

- `roadmap.md`の各stage設計を行う際は`plan/design-stageN.md` を案として起こし、ユーザーの承認を得る。
- 作業はブランチで行い、PR で main にマージする。
- PR 前に CI と同じ確認を通す: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`
- PR を出す手順:
  1. `git fetch origin && git rebase origin/main`（main を取り込むときはマージではなくリベース）
  2. 上の CI と同じ確認を通す
  3. `git push -u origin HEAD`（リベースで履歴を書き換えたときは `--force-with-lease`）
  4. `gh pr create`
  5. `gh pr merge --auto --squash`（作成直後に自動マージを予約する。マージ方式はスカッシュ）
- worktree では最初に `npm ci`。

## 併用ルール（Claude Code / Antigravity）

- 同じ作業ツリーを 2 つのエージェントで同時に編集しない。並行するときはブランチと worktree を分ける。
- ブランチ名: Claude Code は `claude/<topic>`、Antigravity は `antigrav/<topic>`。
- worktree の作成先:
  - Claude Code: `.claude/worktrees/<session-name>`
  - Antigravity: `.antigrav/worktrees/<topic>`

## 事実と記録

- 確定済みの結論は `plan/verification.md` と `plan/captures/index.md`（録画台帳）にある。これと矛盾する変更は、ユーザーに確認してから行う。
- 単騎または最小構成による実測を優先する。ここでいう最小構成とは、確定させたいスキル効果や仕様について、可能な限り他の要素が混入しないものをいう。
- 根拠のない変更は行わない。未解明の部分は「未実装」等と明記したプレースホルダーとし、ユーザーが未実装であることを理解できるようにする。
- 根拠のある変更は、たとえ実測数値とシミュレーション数値の乖離が広がるとしても実施する。

## コミットしないもの

- `scratch/`（ユーザーの育成データを含む。公開リポジトリ）
- 録画の実体。追跡するのは台帳と `plan/captures/frames/*.jpg` だけ（`.gitignore` 参照）
