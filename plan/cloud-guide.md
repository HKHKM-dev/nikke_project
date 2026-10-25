# クラウドで作業するときの手引き

- 何のための文書か: デスクトップの PC が使えないとき（停電・故障・不在）も、スマホや MacBook からクラウドのセッションで続けるための手順。どこに何があるか・始め方・離席と再開・同期と衝突・準備・困ったとき
- 関連: [design-cloud-environment.md](design-cloud-environment.md)（決めたことと理由）、[captures/storage.md](captures/storage.md)「バックアップ」（E: と Drive の録画まわりの同期。ここには書き写さない）・「クラウド環境での取り寄せ」（録画の取り寄せ）
- 作成日: 2026-10-23

## どこに何があるか

| もの                                     | 正の置き場所                                        | デスクトップ                                        | クラウドのセッション                                                                                          |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| コード・記録・設計書                     | GitHub                                              | worktree                                            | `/home/user/nikke_project`                                                                                    |
| `private/`・`scratch/`                   | Drive の `nikke_sync/private`・`scratch`            | メインのチェックアウト（`D:/nikke_project/`）の直下 | リポジトリの直下（セッションの始めに置かれる）                                                                |
| Claude のメモリと全体の指示（CLAUDE.md） | Drive の `nikke_sync/claude/`                       | Claude Code の設定のフォルダ（自動メモリ）          | `~/.claude/CLAUDE.md` に、全体の指示とメモリの索引・書き方が置かれる。本文は `~/.claude/projects/…/memory/`   |
| 録画・スクショ・証拠フレーム・参照資料   | E: と Drive の `nikke_project_captures/`            | `E:/nikke_project_captures/`                        | 録画は `node tools/captures/fetch.ts <録画 id>` で取り寄せる。切り出した証拠フレームは応答の終わりに Drive へ |
| 取り込む前の録画                         | `H:/record` と Drive の「マイ コンピュータ/record」 | Drive for desktop が上げる                          | Drive から取り込む（下の「クラウドで録画を取り込む」）                                                        |

## クラウドのセッションの始め方

1. スマホか MacBook の Claude アプリ（または claude.ai/code）で、このリポジトリのクラウドのセッションを始める（環境は「デフォルト」）。
2. 始めのフック（`tools/drive/cloud-sync.ts --pull`）が、Drive から `private/`・`scratch/`・メモリ・全体の CLAUDE.md を取って置く。最初の応答はこれを待つ。並んで走る `tools/cloud/npm-ci.ts` が、`node_modules` が無いか `package-lock.json` と合わなければ `npm ci` を回す（数秒）。
3. 応答の終わりのフック（`--push`）が、直したもの・増やしたもの・消したものを Drive に戻す（衝突は下）。デスクトップには、次のデスクトップのセッションの始めの同期で届く。

クラウドでは自動メモリが使えないので、メモリは `~/.claude/CLAUDE.md` に書かれた決まりで読み書きする（同じ形式。設計書 6.1 節）。

## 離席と再開

- 離席や電源を切る前の手順は AGENTS.md「離席と再開」。
- PC が突然止まったときは、push 済みのブランチと、最後の節目までに Drive に上がったものから続ける（未 push の作業は PC が直るまで待つ）。

## クラウドで録画を取り込む

PC が使えないときに撮った録画は、Drive for desktop が「マイ コンピュータ/record」に上げている。クラウドのセッションで次のように取り込む（設計書 6.3 節）。

1. `node tools/captures/intake.ts --list-record` で record の中を見る。
2. `node tools/captures/intake.ts drive:<record の中のパス> --id NNNN --name <識別子> ...`（ほかの引数はデスクトップと同じ。`intake.ts` の冒頭のコメント。`--copy` は使えない）。録画を取り寄せて `~/nikke_project_captures/<種別>/` に規約名で置き、Drive の sha256 と突き合わせ、`records/recordings/<録画 id>.json` を書き、Drive の中で record から `nikke_project_captures/<種別>/` へ移し、録画の JSON に `backup`（置いた日時・経路・一致したハッシュ）を書き足す。
3. PC を付けると、Drive for desktop が `H:/record` の写しを消し、デスクトップの同期が E: の種別フォルダに録画を降ろす（数百 MB。設計書 6.3 節）。

録画の番号の振り直し（`npm run records:renumber`）も、クラウドでは Drive の名前を受け口で変える（E: は、PC を付けた後の同期で新しい名前のものを降ろし直し、古い名前のものを `E:/nikke_sync_trash/captures/` へ移す）。

## 衝突

- 前に取った（同期した）ときから両側で変わったファイルは、両方を残し、名前に側を付ける: `<名前>.conflict-desktop.<拡張子>`・`<名前>.conflict-drive.<拡張子>`（デスクトップの同期）、`<名前>.conflict-cloud.<拡張子>`（クラウドの応答の終わり）。
- 一覧は、デスクトップで `npm run drive:conflicts`。中身を見て 1 つにまとめ、別名の方を消す。

## 準備（オーナーが 1 回だけ）

デスクトップの rclone の準備は [captures/storage.md](captures/storage.md)「バックアップ」の「準備」。クラウドの側は次のとおり。

1. Apps Script の受け口を公開する。
   1. [script.google.com](https://script.google.com/) で新しいプロジェクトを作り、`tools/drive/gateway/Code.gs` の中身を貼る。プロジェクトの設定で「appsscript.json をエディタで表示」を入れ、`tools/drive/gateway/appsscript.json` の中身を貼る。
   2. プロジェクトの設定の「スクリプト プロパティ」に、`KEY`（長い乱数の合言葉）・`ROOT_SYNC`（`nikke_sync` のフォルダ ID）・`ROOT_CAPTURES`（`nikke_project_captures`）・`ROOT_RECORD`（「マイ コンピュータ/record」）を入れる。フォルダ ID は、Drive でフォルダを開いた URL の `folders/` の後ろ。
   3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」（実行するユーザー: 自分、アクセスできるユーザー: 全員）。認可の画面で、メインのアカウントで許可する。表示されたウェブアプリの URL を控える。
2. 動作を確かめる: デスクトップで `NIKKE_DRIVE_GATEWAY_URL` と `NIKKE_DRIVE_GATEWAY_KEY` を入れて `npm run drive:gateway-check`（試しのファイルを作り、ごみ箱へ移して片付ける）。
3. クラウドの環境（claude.ai/code の環境の設定）に足す:
   - 通信の許可（Custom）: `script.google.com` と `script.googleusercontent.com`
   - 環境変数: `NIKKE_DRIVE_GATEWAY_URL=<ウェブアプリの URL>`、`NIKKE_DRIVE_RECORD_FOLDER_ID=<「マイ コンピュータ/record」のフォルダ ID>`（クラウドでの取り込み。録画の取り寄せの `NIKKE_DRIVE_SA_KEY`・`NIKKE_DRIVE_FOLDER_ID` も使う。[captures/storage.md](captures/storage.md)「クラウド環境での取り寄せ」）
   - 合言葉: ネットワークシークレットの Body parameter 型（ホスト `script.google.com`、名前 `key`）。使えなければ環境変数 `NIKKE_DRIVE_GATEWAY_KEY=<合言葉>`（VM の中から見える）
4. 合言葉が漏れたら、スクリプト プロパティの `KEY` を変え、クラウドの環境の値も替える。受け口ができるのは 3 つのフォルダの中だけで、消すのはごみ箱への移動だけ（設計書 5 節）。

## 困ったとき

- デスクトップの同期の重大なエラー（終了コード 7）・同名の複製: [captures/storage.md](captures/storage.md)「バックアップ」。
- クラウドで「Drive との往復に失敗した」と出る: 受け口の URL・合言葉・通信の許可を確かめる。デスクトップで `npm run drive:gateway-check` が通るかを見る。
- クラウドで Claude が自分で打つ curl などは、auto mode の判定で止まることがある。同期はフックで行うので、この判定は受けない。
- クラウドでは `gh` のトークンが使えない（2026-10-23 の通しの試験）。PR は GitHub の MCP の道具で出す（作成と自動マージの予約）。
- クラウドの Node は 22（リポジトリの `.nvmrc` は 24）。CI と同じ確認は 22 でも通る（`npm ci` の EBADENGINE の警告は出る）。
- 「npm ci が失敗した」と出たか、セッションの途中でブランチを替えて `package-lock.json` が変わった: セッションの中で `npm ci` を回す。`node_modules` が無いまま生成の道具を回すと、全体の別の版の prettier が整形し、手を入れていないファイルに書式の差分が出る。
