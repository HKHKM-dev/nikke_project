# デプロイキーを使えるジョブを main の版のコードに限る（2026-11-22）

- 何のための文書か: 書き込みのできるデプロイキー（secret の `GENERATED_DEPLOY_KEY`）を使えるジョブを、main で動く、main の版のコードだけを回すジョブに限る変更の、目的・案・決定を残す。
- 関連: デプロイキーを足した回（[design-pr-conflicts.md](design-pr-conflicts.md) 5 節）、自動マージを待つ PR の衝突の直し（[design-auto-conflict-fix.md](design-auto-conflict-fix.md)）、道具（`tools/git/auto-rebase.ts`・`tools/git/ci-generated.ts`）。

## 1. 目的

- デプロイキーは ruleset「automerge」の Bypass list に入っていて、main の規則（PR 必須・必須チェック）を通らずに main に書き込める。
- そのため、この鍵は、main に入って CI を通った版のコードのほかには見せない。PR のブランチの版のコード（ワークフローのファイル・道具・依存のパッケージ）が動くジョブには渡さない。
- いまは次の 2 か所で、この線が守られていない。
  - 鍵はリポジトリの secret なので、どのブランチのどのワークフローの実行からも読める（フォークの PR を除く）。
  - 衝突の直し（`auto-rebase.yml` の `--fix`）は、PR のブランチを取り出して、そのブランチの版の `records:renumber`・`pr:prep` を、鍵を持ったジョブの中で回す（design-auto-conflict-fix.md 7 節の「制約」）。同じジョブの中では、子の環境変数から鍵を外しても、後の段を守れない。

## 2. 決定（案 A）

決定（2026-11-22、オーナー）: 案 A。鍵は替えない。コードの直しを先に main に入れる準備をし（自動マージを予約しない）、オーナーが GitHub の設定を変えてからマージする。

決定（2026-11-22、オーナー）: 鍵は作り直す。GitHub の secret は値を読み出せず、前の秘密鍵の値が手元に無かったため。新しい鍵を Deploy keys と environment の secret に置いてからマージし、main の CI が新しい鍵で動くのを見てから、古い鍵とリポジトリの secret を消す（止まる時間を作らない）。

### 2.1 GitHub の設定（オーナー）

1. Settings → Environments に environment `main-push` を作り、「Deployment branches and tags」を「Selected branches and tags」にして `main` だけを足す。
2. 秘密鍵をその environment の secret `GENERATED_DEPLOY_KEY` に置き、リポジトリの secret（Settings → Secrets and variables → Actions）の `GENERATED_DEPLOY_KEY` を消す。

environment の secret は、その environment を指したジョブにしか渡らない。使えるブランチを main に限ると、PR の実行（`refs/pull/N/merge`）とほかのブランチの実行は、その environment を使えない。

### 2.2 ワークフローと道具

- 鍵を使うジョブには `environment: main-push` を付ける。`deployment: false`（Deployments の一覧に記録を作らない指定）は付けない。この指定のジョブにもブランチの制限がかかるかを、文書と手元で確かめられなかったため（記録が増えるだけで、制限は確実にかかる）。
- **CI（`ci.yml`）**: 生成物の commit を `commit` のジョブに分ける。
  - `check` のジョブ（依存のパッケージを入れて確認を回す）は、作り直した生成物を全部 `ci-generated.ts --export` で写し、artifact で渡すだけにする。
  - `commit` のジョブは、main の版を取り出しただけの作業ツリーで（`npm ci` もしない）、`ci-generated.ts --commit` が生成物のパスのものだけを戻して commit し、push する（artifact にほかのファイルがあっても読まない）。
- **衝突の直し（`auto-rebase.yml`）**: 3 つのジョブに分ける。
  - `find`: 今のまま（API だけ。鍵なし）。
  - `prepare`: 鍵も token も渡さない（PR は `find` が出力で渡す）。PR のブランチの版の道具で振り直し・まとめ・`pr:prep` を回し、main の先頭からの commit を git bundle にして、結果の一覧（`manifest.json`）と一緒に artifact で渡す。観測値のモデルの予測値の覚え（キャッシュ）は戻すだけで、保存しない。
  - `push`: 鍵あり。main の版を取り出しただけの作業ツリーで（`npm ci` もしない）、`auto-rebase.ts --push` が一覧の形を確かめて `find` の選んだ PR に限り、直せなかった PR に先にコメントしてから、PR を API で引き直し、対象のままで head が `prepare` の時と同じなら、bundle を取り込んで、そのブランチにだけ lease つきで push する。題名の書き換えとコメントもここで行う。
  - bundle と一覧の中身は、PR のブランチの道具が決められる。ただし push の先は、API で引き直した `claude/`・`antigrav/` のブランチだけなので、そのブランチに書き込める者ができることは増えない。
- あわせて直したもの（同じ所の組み替えで済むもの）:
  - 振り直しも main の新しい commit も無い PR は、まとめて push し直さない（前は `mergeable` が決まらなかった PR を、直すものが無くてもまとめて push し直した）。
  - `push` のジョブは、PR ごとの API の失敗で残りの PR を止めない（最後に 1 で終わる）。
  - `pr:prep` が通信の失敗で止まったときは、「直せない」のコメントをせず、次の実行で直し直す（`transientFailure`）。

## 3. 採らない案

- **案 B（鍵は同じく囲い、衝突の直しは知らせるだけに戻す）**: コードは一番少ないが、衝突のたびにセッションが起きて直すまで止まる。2026-11-21 に決めた、Actions が直す利点（design-auto-conflict-fix.md 5 節）を手放す。
- **案 C（衝突の直しだけ直し、environment は使わない）**: 鍵がリポジトリの secret のままなので、1 節の 1 つ目が残る。
- **案 D（何もしない）**: ブランチに書き込めるのはオーナーとエージェントだけだが、エージェントは外の文章や依存のパッケージの影響を受けうる。鍵が漏れると、必須チェックも main の履歴も迂回され、気づく手立てが無い。

## 4. 残ること

- エージェントは、CI を通るコードを自動マージで main に入れられ、そのコードは main の CI で鍵の近くで動く。この変更で変わるのは、鍵に届くコードが「main に入って CI を通り、履歴に残ったもの」に限られること。
- `prepare` のジョブはブランチの道具を main の push の実行の中で回すので、そのジョブの中のもの（作業ツリー・artifact）はブランチの道具が書き換えうる。鍵のジョブは、それを data として形を確かめて使う（2.2 節）。

## 経過

- 2026-11-22: 起案し、案 A をオーナーが承認した。ワークフローと道具を直した（2.2 節）。GitHub の設定（2.1 節）は、マージの前にオーナーが行う。
- 2026-11-22: オーナーが 2.1 節の設定をし（鍵は作り直した）、マージした。main の CI の `commit` のジョブは、古い鍵とリポジトリの secret を消した後の実行でも、environment の secret の鍵で origin を読み書きできた（ls-remote と push --dry-run）。衝突の直しの `prepare`・`push` は、直す PR が無く、まだ回っていない。
