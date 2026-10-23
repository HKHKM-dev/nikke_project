# クラウド環境 設計書の実施の記録（段ごとに足したもの・確かめたこと）

- 本体: [design-cloud-environment.md](design-cloud-environment.md)（方針・段階・承認はそちら。ここは段ごとの実施と確かめだけ）
- 作成日: 2026-10-23（本体の 12 節から移した。50KB を超えたため）
- 節の番号は本体の 12 節のまま（12.1 段 ①・12.2 段 ②・12.3 段 ③・12.4 通しの試験）

## 12. 実施

### 12.1 段 ①（2026-10-23。録画まわりの自動同期）

- 足したもの:
  - `tools/drive/sync.ts`（`npm run drive:sync`・`npm run drive:conflicts`）: `captures` の対を rclone bisync で回す。4.2 節の設定・ロック・フックの間引き（30 分）・記録（ホームの下の `.nikke-sync/`）
  - `tools/drive/rclone.ts`（rclone の呼び出しと、Drive に書けるかの判定）、`tools/drive/sync-lib.ts`（引数・衝突の名前・仕分けなど。テストは `sync-lib.test.ts`）、`tools/drive/filters/captures.txt`
  - `.claude/settings.json` の SessionStart フック（`sync.ts --hook`。`async`。rclone の準備が無い環境とクラウド環境では何もしない）
- 変えたもの:
  - `intake.ts`: I: への robocopy をやめ、Drive の `nikke_project_captures/<種別>/` に置く（4.4 節）。Drive の中のコピーは、取り込み元を動かす前に行う（動かすと Drive for desktop が `record` の写しを消すため）。コピーした後は、E: の更新時刻を Drive の写しにそろえる（次の bisync で同じファイルと見なさせる）
  - `still.ts`: `frames/` に切り出したら Drive にも上げる
  - `records-renumber.ts`: I: を置き場所から外し、Drive の中の改名（`rclone moveto`）を足す。Drive に古い名前と新しい名前の両方があれば、どれも変える前に止める
  - `dirs.ts`: `backupDir()`（I: のパス）を外し、取り込み元の `recordDir()` を足す
  - 文書: [captures/storage.md](captures/storage.md)「運用」「バックアップ」、[captures/tools.md](captures/tools.md)、AGENTS.md に「離席と再開」の規則（項目 10）
- 確かめたこと（rclone の準備の前）: CI と同じ確認（format:check・lint・typecheck・test・build）が通る。rclone が無い環境では、`npm run drive:sync` は理由を出して終了コード 1、フックとクラウド環境では何もせず 0 で抜ける
- 確かめたこと（2026-10-23。オーナーが rclone のリモートを作った後）:
  - 空打ち（`--resync --dry-run`）で送るのは、Drive に無かった証拠フレーム 30 枚（6.4MB）だけ（2.5 節の見込みどおり）。ほかは録画約 40 本の更新時刻をそろえるだけで、中身は送らない
  - 初回の `--resync` が通り、続けて回したふだんの同期は 2.3 秒で何も送らなかった
  - Drive の中のコピー（`copyid`）は SHA256 が元と一致し、更新時刻も元のまま。E: 側の時刻をそろえると、次の同期は何も送らず、衝突も出ない。E: で消したものは、同期で Drive のごみ箱へ移る（試しのファイルで確かめ、片付けた）
- 試しで直したもの:
  - `copyid` のコピー先は、リモートの名前を付けないとローカルのパスと見なされ、手元へダウンロードされる。`intake.ts` はリモートの名前を付けて書く
  - `RCLONE_TEST` を両側で別々に作ると更新時刻が食い違い、`--resync` が止まる（終了コード 7）。Drive 側はローカルのものを写して作る
  - bisync はフィルタの指紋（`.md5`）をフィルタの隣に書くので、リポジトリの中では worktree ごとに無くなる。フィルタは記録の場所（`.nikke-sync/`）に写して使う
- 分かったこと: 2026-10-23 の時点で、Drive for desktop が `H:/record` を上げていない（試しのファイルが 5 分たっても Drive に無い。10-22 に作られた `既読未分類` も無い）。取り込み元の写しからの Drive の中のコピーは、写しが Drive にあるときだけ使い、無ければ E: から上げる（4.4 節）ので、取り込みは止まらない。同じ日にオーナーが Drive for desktop を設定し直した後は、`H:/record` に置いた試しのファイルが 10 秒以内に `record` に上がり（`既読未分類` も上がった）、そこからの Drive の中のコピーも SHA256 が一致した（試しのファイルは片付けた）
- 残り: 実際の取り込み（`intake.ts`）は次の撮影のときに確かめる。デスクトップのセッションの始めの同期は、マージの後のセッションで記録（`sync.log`）を見る

### 12.2 段 ②（2026-10-23。受け口と小さいファイルの往復）

- 足したもの:
  - デスクトップの同期の対 `private`・`scratch`・`claude`（`tools/drive/sync.ts`。Drive の `nikke_sync/` の下。`private` は鍵の `*.json` を外し、`claude` は全体の CLAUDE.md とこのプロジェクトのメモリだけ）。フィルタは対の定義に中身で持つ
  - Apps Script の受け口（`tools/drive/gateway/Code.gs`・`appsscript.json`）。DriveApp だけを使う（高度なサービスは要らない）。中身の差し替えは、新しく作って古い方をごみ箱へ移す
  - クラウドの往復（`tools/drive/cloud-sync.ts`。SessionStart で `--pull`、Stop で `--push`）、受け口を呼ぶ `gateway.ts`、決まりごとの `cloud-lib.ts`（テストは `cloud-lib.test.ts`）、動作確認の `npm run drive:gateway-check`
  - 手引き [cloud-guide.md](cloud-guide.md)。AGENTS.md の「離席と再開」から指し、「記録の置き場所」に 1 行・`private/` の行にクラウドのことを足した（項目 10）。[captures/storage.md](captures/storage.md) のクラウドで切り出したフレームの扱いを直した
- 確かめたこと: デスクトップの 3 つの対の初回の `--resync` で `nikke_sync/` ができ（`private` は owner.md だけ）、4 つの対のふだんの同期は約 10 秒で何も送らない。CI と同じ確認が通る。クラウドでない環境と受け口の URL が無い環境では、往復のフックが何もせずに抜ける
- 受け口（2026-10-23。オーナーが公開した後の `npm run drive:gateway-check`）: 書き込み・一覧と中身・衝突の別名（`.conflict-cloud`）・同じ中身は何もしない・3MB・証拠フレームの下への書き込み・移動と改名（`moveTo` で動いた）・録画の上には書けない・合言葉が違えば断る、の 9 つがどれも通った（試しのファイルはごみ箱へ移した）
- クラウドのセッション（2026-10-23。ブランチ `claude/cloud-env-stage2`）: クラウドで書いた `scratch/_cloud-check.md` が応答の終わりに Drive に戻り、デスクトップの同期で D: に届いた。そのセッションの答え: 文脈に「メモリ（クラウド）」の節・メモリの索引・日本語で答える指示（CLAUDE.md・AGENTS.md・システム）が入っていた。`private/owner.md` が読め、メモリのフォルダ（`~/.claude/projects/-home-user-nikke-project/memory`）は索引と同じ件数のファイルがあり、基準（`~/.cache/nikke-sync/base.json`）もあった。試しのファイルは片付けた
- 合言葉: ネットワークシークレットの Body parameter 型では受け口に届かなかったので、環境変数 `NIKKE_DRIVE_GATEWAY_KEY` に入れた（5.2 節の「使えなければ環境変数」）
- 残り: クラウドの側の衝突と、クラウドで切り出した証拠フレームが E: に届くことは、実際の作業の中で確かめる（owner.md とメモリが見える・直したものが D: に届く・衝突が両方残る・証拠フレームが E: に届く）

### 12.3 段 ③（2026-10-23。クラウドでの取り込み）

- 足したもの:
  - `intake.ts` の `drive:<record の中のパス>` と `--list-record`。サービスアカウントで record をたどって取り寄せ（`.part` に書いてから名前を変える）、Drive の sha256（無ければ md5）と突き合わせ、受け口の `move` で種別フォルダへ規約名で移す。種別フォルダに同じ名前があれば取り寄せる前に止める。移せなかったら終了コード 1（録画の JSON と手元の録画は書いてある。消して回し直す）。日付をファイルの更新時刻から決めるときは日本の日付にする（クラウドの時計は UTC）
  - `records:renumber` は、クラウド環境で受け口の URL があれば、Drive の一覧を受け口の `snapshot`（変えるファイルの親のフォルダ）で取り、名前を受け口の `move` で変える
  - Drive API のラッパ（`tools/captures/drive.ts`）に、更新時刻と、1 ファイルのハッシュ（`checksums`）
  - 手引き [cloud-guide.md](cloud-guide.md) に「クラウドで録画を取り込む」と、クラウドの環境の `NIKKE_DRIVE_RECORD_FOLDER_ID`。[captures/tools.md](captures/tools.md)・[captures/storage.md](captures/storage.md) の取り込みと振り直しの説明
- 確かめたこと（デスクトップ）: `H:/record/Captures/` に試しのファイルを置くと、`--list-record` に出て、サービスアカウントで取り寄せたものが Drive の sha256・md5 と一致した（試しのファイルは消した）。CI と同じ確認が通る
- クラウドのセッション（2026-10-23。PC を切って、ブランチ `claude/cloud-env-stage3`）: `H:/record` に置いた試しの録画が `--list-record` に出て、`drive:` で取り込めた（record から `nikke_project_captures/range/` へ `moveTo` で動いた。sha256 が一致）。PC を付けると `H:/record` から消え、`npm run drive:sync` で E: に規約名で届き、sha256 が台帳と一致した。試しの録画は E: から消して同期で Drive のごみ箱へ移し、台帳と backup-log の行はコミットしていない
- そのとき直したこと: クラウドで書く backup-log の時刻が UTC になっていたので、日本の時刻で書くようにした

### 12.4 通しの試験（2026-10-23）

1 節の完成の条件を、上から順に 1 回ずつ確かめた。試験で作ったもの（検証記録の下書きの PR・ブランチ・`scratch/` とメモリの目印・証拠フレーム）は、確かめた後に消した（Drive の側はごみ箱へ）。

- 「クラウドで続ける」: デスクトップの新しいセッションを移すと、クラウドで `owner.md` の行数・メモリの索引の件数・`scratch/` の件数が、どれもデスクトップと同じだった
- PC を切った状態で、スマホからクラウドのセッションを main で始めた: `owner.md`・`scratch/`・メモリが読めた。録画 535 を取り寄せ（sha256 が台帳と一致）、証拠フレームを切り出した。`scratch/` とメモリに書き、検証記録を作って CI と同じ確認を通し、push して下書きの PR を出せた
- PC を付けた後: クラウドで書いた `scratch/`・メモリ（索引の 1 行を含む）が D: に、証拠フレームが E: の `frames/` に届いた
- 見つかって直したこと:
  - SessionStart フックの同期は、前の成功から 30 分以内なら飛ばしていたので、切る前の同期の 20 分ほど後に PC を付けると、付けた後の最初のセッションで降ろさなかった（試験では手で `npm run drive:sync` を回した）。前の成功が PC の起動より前なら飛ばさないようにし、飛ばしたときも sync.log に書くようにした
  - `still.ts` が出力先のフォルダを作らず、クラウドの新しい VM（`frames/` が無い）で失敗した。作るようにした
- 道具の外のこと: クラウドでは `gh` のトークンが使えず、PR は GitHub の MCP の道具で出した（[cloud-guide.md](cloud-guide.md)「困ったとき」）

### 12.5 段 ①〜③ のコードの見直し（2026-10-24。過去 24 時間のコミットの定期の見直し）

PR #643〜#648 のコードを読み直して見つけたもの。どれもまだ直していない（直したらこの節に書き足し、`backlog.md` 5 節の行を消す）。

- 衝突の別名が応答のたびに増える（`tools/drive/cloud-sync.ts` の `push`）: 受け口の `put` が衝突を返したとき、基準（`base.files`・`base.frames`）を変えないので、次の Stop フックでも同じ `baseMd5` で `put` し直し、受け口が `.conflict-cloud1`・`.conflict-cloud2`… を作り続ける（次のセッションの始めの `--pull` まで）。直し方の案: 衝突で置いた手元の md5 を基準とは別に覚え、手元が変わるまで送り直さない
- 起動の時刻（`tools/drive/sync.ts` の `hookShouldSkip` に渡す `Date.now() - uptime() * 1000`）: Windows の高速スタートアップが有効だと、シャットダウンで `os.uptime()` が 0 に戻らないことがある（要確認）。その場合、12.4 節の直しが効かず、切る前の同期から 30 分以内に PC を付けると最初のセッションで降ろさない。12.4 節の直しは実機で確かめていない（試験では手で回した）
- フックで黙って飛ばす（`tools/drive/sync.ts --hook`）: `RCLONE_TEST` が無くて対を飛ばしたとき（E: が付いていないときなど）は `failed` を数えるが `hookMessage` を入れないので、フックでは何も知らせない。2 つ以上の対が失敗したときも、知らせるのは最後の 1 つだけ。`RCLONE_TEST` を置く `copyto` と Drive の `mkdir` の終了コードも見ていない
- テストの無いところ: `cloud-sync.ts` の `push`・`pull`（基準の扱い・Drive で消えたものを手元から消す条件）、受け口（`gateway/Code.gs`）、`intake.ts` の `drive:`、`records-renumber.ts` の受け口の経路。どれも通しの試験（12.4 節）で手で確かめただけ。上の 1 つ目は、受け口を差し替えて `push` を 2 回呼ぶテストで捕まえられる
