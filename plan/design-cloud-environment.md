# クラウド環境 設計書（PC が使えないときも、クラウドのセッションで続ける）

- 対象: Google Drive との同期（新しい `tools/drive/`。デスクトップの rclone の双方向同期と、Apps Script の受け口）、クラウドのセッションのフック（`.claude/settings.json`）、作業中のブランチの退避（`tools/git/`）、録画の道具の Drive への書き方（`tools/captures/intake.ts`・`dirs.ts`、`packages/core/scripts/records-renumber.ts`）、文書（[captures/storage.md](captures/storage.md)・[captures/tools.md](captures/tools.md)・AGENTS.md・新しい手引き）
- 状態: **起案（2026-10-23）。承認待ち（11 節）**
- 関連: [captures/storage.md](captures/storage.md)「バックアップ」「クラウド環境での取り寄せ」、[design-records-automation.md](design-records-automation.md) 3.3 節（`intake.ts`）、[design-recording-renumber.md](design-recording-renumber.md) 5 節（Drive 側の名前の変え方）
- 作成日: 2026-10-23
- 調べた時点: main の 3e052720（#642）。件数・容量は 2026-10-23 の手元とクラウドの調べで、判断の材料。以後は書き直さない

## Context

オーナーの目的（2026-10-23）:

- デスクトップ PC とタブレットで同じファイルにアクセスできる
- デスクトップ PC の電源が切れていても作業を継続できる
- タスクの途中で中断しても、タブレット・スマホで作業を再開できる

いまは、デスクトップのセッション（Remote Control を含む）からは全部の情報に届く。クラウドのセッションからは、`private/`・`scratch/`・Claude のメモリと全体の指示（`~/.claude/CLAUDE.md`）と、Drive に上がっていない証拠フレームに届かない。Remote Control はデスクトップの電源が要る。

インタビュー（1 節）で、目的を次のように読み替えた。

- 「同じファイル」は、どの端末から始めた Claude のセッションでも、デスクトップと同じ情報を読み書きできること。端末でオーナーがファイルを開く必要はない。
- 端末はスマホと MacBook（目標の「タブレット」）。どちらもクラウドのセッションを使う。
- 停電・故障・回線の不調・長期の不在で PC が使えないときも、クラウドのセッションだけで続けられること。外から電源を入れる案では足りない。

2026-10-22 に起案した「全フォルダを Drive と丸ごと双方向に同期する」案は、オーナーの判断で取り下げ、目的から考え直した。そのとき調べた根拠のうち、この設計が使うものは 2 節に移した。

## 1. 決めたこと（2026-10-23 のインタビュー）

| 問い                               | オーナーの決定                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| 端末                               | スマホと MacBook。MacBook もクラウドのセッションを使い、MacBook には何も置かない       |
| 端末でしたいこと                   | Claude に指示して進めること（ファイルを自分で開く・直すことは求めない）                |
| PC が使えない場面                  | 停電・故障・回線の不調・長期の不在。遠隔で電源を入れる案では足りない                   |
| 中断の引き継ぎ                     | 離席の前に、デスクトップのアプリの「クラウドで続ける」で移す                           |
| `private/`・`scratch/` の置き場所  | Google Drive（公開リポジトリ以外の置き場所を Drive にまとめる）                        |
| Claude のメモリと全体の指示        | メモリのフォルダと全体の CLAUDE.md をクラウドに写す。セッションの記録は写さない        |
| デスクトップ → Drive               | 数分以内に自動                                                                         |
| クラウド → Drive                   | 応答の終わりごとに自動                                                                 |
| 衝突                               | 両方を別名で残し、一覧に出して人が決める（2026-10-22 の決定のまま）                    |
| クラウドから書く身分               | サービスアカウントは書けない（2.1 節）ので、Apps Script の受け口にする                 |
| クラウドから編集・削除してよいもの | 同期する小さいファイルと、Drive にある録画                                             |
| 証拠フレーム                       | クラウドで切り出したものを Drive に戻し、E: に届ける。derived は戻さない               |
| 取り込む前の録画（`H:/record`）    | 数分以内に Drive へ上げ、PC が使えないときはクラウドで取り込む                         |
| 作業中のブランチ                   | 応答の終わりごとに、未 commit の変更も含めて退避用のブランチへ自動で push する         |
| 道具                               | 必要なら足してよい                                                                     |
| 範囲外・後回し                     | `D:/old_nikkecalc`、Antigravity（2026-10-22 の決定のまま）、MacBook でのローカルの作業 |
| 進め方                             | 設計書 → 承認 → 段階的に（9 節）                                                       |
| 引き継ぐ 2026-10-22 の決定         | パスを変えない。消えたときの備えは Drive のごみ箱と版の履歴で足りる                    |

完成の条件（2026-10-23 のオーナーの合意）: **録画したファイルは Google Drive に自動で同期される。デスクトップの電源を切った状態で、スマホか MacBook からクラウドのセッションを始め、`owner.md`・`scratch/`・メモリ・直前までの録画と証拠フレームを読んで検証記録を書き、PR を出せる。クラウドで書いたものは、PC を付けると D:・E: に届いている。「クラウドで続ける」で移したセッションも、PC が突然止まったときの作業（WIP の push）も、同じ情報でクラウドで続けられる。** 段階ごとに確かめ、最後に通しで試す（9 節）。

## 2. 調べたこと

出典の番号は末尾の一覧。

### 2.1 サービスアカウントと Drive の権限

- サービスアカウントは容量を持たず、ファイルを所有できない（出典 1）。マイドライブでは作ったアカウントがファイルの持ち主になるので、編集者で共有しても、新しいファイルを作ると 403（`storageQuotaExceeded`）で失敗する。2025-04-15 より後に作ったサービスアカウントには、以前の 15GB も付かない（出典 2）。Google が挙げる代わりの手段のうち、共有ドライブとドメイン全体の委任は Google Workspace の機能（出典 1・2。個人の Google One のプランで使えないことは、公式の対応表では確かめていない）。
- 持ち主でないファイルは削除できず、自分のドライブから外せるだけ（出典 3）。別のアカウントやサービスアカウントを編集者にしても、オーナーの持ち物は消せない。
- 範囲を限った認可（`drive.file`）は、その仕組みが作ったか開いたファイルにしか届かない（出典 4・5）。いまの録画（robocopy で上げた分）には届かない。
- 2026-10-23 の別のセッションで、いまのサービスアカウントで試した: 容量の上限は 0 バイト。オーナーが `nikke_project_captures`・`old_nikkecalc`・`record`（2.9 節）を編集者で共有した後も、中身のある新しいファイルの作成とコピーは 403（`storageQuotaExceeded`）、ごみ箱への移動は 403（`insufficientFilePermissions`）。オーナーのファイルの中身の上書き・改名・移動はできた（持ち主はオーナーのまま）。

影響: 録画の本体を読むのは、いまのサービスアカウント（`fetch.ts`）のまま。新しいファイルの作成とごみ箱への移動はサービスアカウントにはできないので、小さいファイルの読み書きと、Drive の中の移動・改名・ごみ箱への移動は、オーナーとして動く Apps Script の受け口にまとめる（5 節）。書く道を受け口の 1 つにすれば、サービスアカウントは閲覧者に戻せる（鍵は VM の中から見えるので、権限を小さく保つ。11 節の 5）。

### 2.2 Apps Script の受け口

- Drive の操作: `File` に `moveTo`（移動）・`setName`（改名）・`setTrashed`（ごみ箱へ）・`setContent`（上書き）・`getBlob`（読み出し）がある（出典 6）。録画の移動・改名・ごみ箱への移動は中身を送らない。
- 公開の設定: `executeAs: USER_DEPLOYING`（公開した人として動く）、`access: ANYONE_ANONYMOUS`（ログインなしで呼べる）（出典 7）。
- 受け取ったリクエストのヘッダーは読めない。`doPost` の引数が持つのは `queryString`・`parameter`・`postData` など（出典 8）。
- 応答は `script.googleusercontent.com` の一度限りの URL へ転送して返る。呼ぶ側は転送に従う（出典 9）。
- 割り当て（個人のアカウント）: 1 回の実行は 6 分まで、同時に 30 まで（出典 10）。受け取れる大きさの上限は文書に無い。

影響: クラウドの通信の許可に `script.google.com` と `script.googleusercontent.com` を足す。大きさの上限は段 ② の最初に試す（同期する小さいファイルの最大は 0.74MB。2.6 節）。

### 2.3 クラウド環境の設定（Claude Code）

- 環境変数は、その環境を使う人と VM の中のコマンドが読める（出典 11）。
- ネットワークシークレット: 鍵を環境に預け、プロキシが送信の後にリクエストへ付ける。鍵は VM に入らない。個人のプランでも自分の環境に足せる（出典 11）。種類は Bearer（ヘッダー）・Body parameter（本文かクエリ文字列）・GCP access token（サービスアカウントの鍵からプロキシがトークンを作る）など（出典 11・12）。Body parameter で入力する欄は文書に無い。セットアップスクリプトの中のリクエストには付かない（出典 11）。
- セットアップスクリプトは毎回は動かない。初回の結果をスナップショットにして使い回し、スクリプトか通信の許可を変えたときと、約 7 日で作り直す（出典 11）。
- SessionStart フックは、Claude Code が起動した後に毎回（再開を含む）動き、最初の応答はフックの終わりを待つ（出典 11・13）。リポジトリを複数持つセッションでは、リポジトリのフックは動かない（出典 11）。クラウドでは `CLAUDE_CODE_REMOTE=true`（出典 13）。
- 自動メモリはマシンごとで、クラウドとは共有されない（出典 14）。
- デスクトップのアプリは、手元のセッションをクラウドへ移せる（出典 19）。

影響: 新しいデータは、セットアップスクリプトではなく SessionStart フックで置く。受け口の合言葉は、Body parameter 型のネットワークシークレットを試し、使えなければ環境変数に置く（5.2 節）。

### 2.4 クラウドのセッションで試したこと（2026-10-23）

試しのブランチに SessionStart フックを置き、クラウドのセッションを 2 回立てた（ブランチは消した）。

| 試したこと                                                                                            | 結果                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| フックが `~/.claude/CLAUDE.md` に書いた行                                                             | 2 回とも文脈に入った（ユーザーの CLAUDE.md として）                          |
| フックの `additionalContext`                                                                          | 2 回とも文脈に入った                                                         |
| フックが自動メモリの場所（`~/.claude/projects/-home-user-nikke-project/memory/`）に書いた `MEMORY.md` | 入らなかった。システムプロンプトに自動メモリの節が無い                       |
| プロジェクトの設定に `autoMemoryEnabled: true` を足す                                                 | 自動メモリは入らなかった（ユーザーの設定で入れる方法は試していない）         |
| VM の使い回し                                                                                         | 2 回目のセッションに、1 回目のフックが書いたファイルが残っていた             |
| 場所                                                                                                  | リポジトリは `/home/user/nikke_project`、ホームは `/root`                    |
| 道具                                                                                                  | ffmpeg・ffprobe・Node 22・Python 3.13 はある。rclone は無い                  |
| 資源                                                                                                  | CPU 4 コア、メモリ 15GB、ディスクの空き約 30GB                               |
| 通信                                                                                                  | Claude が自分で打った curl は auto mode の判定で止められ、届くかは分からない |

影響: 全体の指示とメモリの索引は、フックが `~/.claude/CLAUDE.md` に書いて渡す。メモリの本文はフォルダに置き、読み方と書き方も CLAUDE.md に書く（6.1 節）。フックは足し書きせず上書きで書き、使い回された VM でも同じ結果にする。同期はフックで行う（フックは auto mode の判定を受けない）。

### 2.5 E: と Drive のいまのコピー（2026-10-23）

`E:/nikke_project_captures` と `I:/マイドライブ/nikke_project_captures` を、相対パス・大きさ・更新時刻で突き合わせた（中身は読まない）。

| 区分                                                | 件数                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E:                                                  | 2,146                                                                                    |
| Drive                                               | 1,163（うち `desktop.ini` 102）                                                          |
| 両方にあり、大きさが同じで、更新時刻の差が 1ms 未満 | 1,061（`range/` 516・`interception/` 9・参照資料 104・証拠フレーム 216・`derived/` 216） |
| E: にだけある                                       | 証拠フレーム 30（6.7MB）、`derived/` 1,050（43.9MB）                                     |
| 両方にあり、大きさが違う                            | `desktop.ini` 5（Windows のフォルダの設定のファイルで、録画などではない）                |

- rclone は Drive の更新時刻を 1ms の精度で扱い（出典 5）、bisync は既定で大きさと更新時刻で比べる（出典 15）。
- 「Drive にまだ無かった」の原因は、手で同期する決まりの証拠フレームの上げ忘れ（[captures/storage.md](captures/storage.md)「運用」の 4）。

影響: 既存のコピーは、上げ直さずに同期の相手にできる見込み。切り替えの前に空打ちで、送られるのが証拠フレームだけかを見る（4.3 節）。`desktop.ini` と `derived/` は同期から外す。

### 2.6 同期する小さいファイルの大きさ（2026-10-23）

| 対象                          | 件数 | 合計   | 最大    |
| ----------------------------- | ---- | ------ | ------- |
| `private/`（鍵を除く）        | 1    | 0.01MB | 0.01MB  |
| `scratch/`                    | 66   | 1.3MB  | 0.40MB  |
| メモリ                        | 11   | 0.02MB | 0.003MB |
| 全体の CLAUDE.md              | 1    | 58 B   | 58 B    |
| 証拠フレーム                  | 246  | 19.8MB | 0.74MB  |
| `H:/record`（ふだんはほぼ空） | 0    | 0      | —       |

録画は最大 635MB だが、録画の本体は受け口を通さない（上げはデスクトップ、降ろしはサービスアカウント）。

### 2.7 rclone

- Drive: 更新時刻は 1ms、ハッシュは MD5・SHA1・SHA256、Drive の中のコピーと移動はサーバーの中でできる（出典 5・16）。「パソコン」として同期したフォルダは、最上位が読み取り専用で、その下も書き込みが 500 で失敗することがある（出典 5）。まれに同名の複製ができ、`rclone dedupe` で直す（出典 5）。小さいファイルの転送は 1 秒に約 2 件（出典 5）。
- 認可: 自前の OAuth クライアントを勧める（組み込みの共有の ID は 2026 年中に止まる。出典 5）。同意画面が External で「テスト」のままだと、認可は 7 日で失効する。「本番」にすると、使わないまま 6 か月たつか取り消すまで失効しない。1 つのクライアントにつき 1 アカウント 100 個まで（出典 17）。検証を受けないので認可のときに警告が出るが、自分だけが使うので進めればよい（出典 5）。
- bisync（出典 15）: 初回は `--resync`。既定の比べ方は大きさと更新時刻。衝突は既定で両方を残し、名前の接尾辞を左右で別にできる。`--backup-dir1`・`--backup-dir2`（v1.66）で消したものを退避できる。`--max-delete`（既定 50%）を超える削除は止まる。`--check-access`・`--resilient`・`--recover`・`--max-lock`。フィルタを変えたら `--resync` が要る。ロックで重なった起動を防ぐ。Windows はタスクスケジューラで回す。`--track-renames` は `--resync` では効かない。
- ローカル: ジャンクションは既定で無視する。転送の途中で変わったファイルは次回に回す（出典 18）。

影響: デスクトップの同期は rclone bisync にする。相手はマイドライブのフォルダにし、「パソコン」の同期は使わない。

### 2.8 Git と GitHub

- CI と Pages は、main への push と PR でしか動かない（`.github/workflows/`）。
- ルール（automerge）は main にだけ掛かる。マージ後に自動で消えるのは PR のブランチだけ。
- 退避のコミットの作り方を試した: 一時の index に今の index を写して `git add -A` し、`git write-tree` と `git commit-tree -p HEAD` でコミットを作る。HEAD・index・作業ツリーのどれも変えずに、未 commit の変更と追跡外のファイル（`.gitignore` のものを除く）を含むコミットができた。`wip/<ブランチ名>` への push は空打ちで通った。

影響: `wip/` への push では CI が動かず、PR にも入り込まない。片付けは自前で行う（7 節）。

### 2.9 H:/record の今の同期（2026-10-23）

- `H:/record` は、2026-09-28 から Drive for desktop で「マイ コンピュータ」の下の `record` として同期されている（Drive のコネクタで見たフォルダの属性が同期フォルダ。中の `Captures` の作成時刻が `H:/record/Captures` と同じ）。撮った録画は、今も数分のうちに Drive に上がる。
- 「パソコン」の同期フォルダは、最上位の名前を変えられない（2.1 節の別のセッションの試し。出典 5 とも合う）。中のファイルを API で外へ移せるかは試していない。

影響: `H:/record` は今の Drive for desktop の同期のまま使い、rclone では扱わない（2 つの道具で同じフォルダを同期しない）。クラウドで取り込むときに `record` から外へ移せなければ、受け口でサーバーの中のコピーと元のごみ箱への移動に代える（6.3 節）。

## 3. 全体の形

| もの                                     | 正の置き場所                                           | デスクトップ                          | クラウド                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| コード・記録・設計書（追跡するファイル） | GitHub                                                 | git（今のまま）                       | git（今のまま）                                                                                               |
| 作業中のブランチ                         | GitHub の `wip/<ブランチ名>`（退避）                   | 応答の終わりに自動で push             | 応答の終わりに自動で push。再開のときに取り出す                                                               |
| `private/`・`scratch/`                   | Drive の `nikke_sync/`                                 | rclone bisync（5 分ごと）             | 始めに受け口から取り、応答の終わりに受け口へ戻す                                                              |
| メモリ・全体の CLAUDE.md                 | Drive の `nikke_sync/claude/`                          | rclone bisync（5 分ごと）             | 始めに受け口から取り、`~/.claude/CLAUDE.md` を組み立てる。メモリは応答の終わりに戻す                          |
| 録画・スクショ・証拠フレーム・参照資料   | E: と Drive の `nikke_project_captures/`（今のコピー） | rclone bisync（5 分ごと）             | 録画の本体はサービスアカウントで取り寄せる（今の `fetch.ts`）。切り出した証拠フレームは応答の終わりに受け口へ |
| 取り込む前の録画                         | `H:/record` と Drive の「マイ コンピュータ/record」    | Drive for desktop（今のまま。2.9 節） | 取り込むとき、受け口で種別フォルダへ移して改名する（移せなければコピーと元のごみ箱への移動）                  |
| derived                                  | E: だけ（作り直せる）                                  | 同期しない                            | 作り直す                                                                                                      |

この形にする理由:

- デスクトップは手元の信頼できる場所なので、Drive 全体に効く認可（rclone の OAuth）を置く。クラウドには、決めたフォルダにしか届かない受け口と、読むだけのサービスアカウントだけを置く。
- 追跡するファイルの正は GitHub の 1 か所にする。Drive に置くのは追跡しないものだけ（同じファイルに 2 つの正を作らない）。
- 大きい録画は受け口を通さない。

## 4. デスクトップの同期（rclone bisync）

### 4.1 対と除外

| 対         | ローカル（Path1）           | Drive（Path2）                   | 除外・対象                                                                                         |
| ---------- | --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `captures` | `E:/nikke_project_captures` | `nikke_project_captures`（既存） | `desktop.ini`・`derived/` を外す                                                                   |
| `private`  | `D:/nikke_project/private`  | `nikke_sync/private`             | `*.json`（サービスアカウントの鍵）を外す                                                           |
| `scratch`  | `D:/nikke_project/scratch`  | `nikke_sync/scratch`             | —                                                                                                  |
| `claude`   | `D:/home/claude`            | `nikke_sync/claude`              | 全体の `CLAUDE.md` と、このプロジェクトのメモリ（`projects/D--nikke-project/memory/`）だけを含める |

- `H:/record` は対にせず、今の Drive for desktop の同期のままにする（2.9 節）。
- `old_nikkecalc`（E: と Drive）は対にせず、今の手の robocopy のままにする（範囲外）。
- Drive for desktop の I: は残し、見るだけにする（同じフォルダに 2 つの道具で書かない）。

### 4.2 回し方

- `npm run drive:sync`（`tools/drive/sync.ts`）が 4 つの対を順に bisync する。タスクスケジューラで 5 分ごとに回す（登録はオーナー。8 節）。手でも回せる。
- 付ける設定:
  - `--resilient --recover`（中断・電源断からの復旧）
  - 重なった起動は、タスクスケジューラの「実行中なら新しく始めない」と bisync のロックで防ぐ。ロックの失効（`--max-lock`）は、録画の上げにかかる時間より長くする
  - `--conflict-loser pathname --conflict-suffix conflict-desktop,conflict-drive`（衝突の名前に側を付ける。拡張子は保つ）
  - `--backup-dir1`（ローカルで消すものを、同じドライブの退避フォルダへ移す）
  - `--max-delete 50`（既定）。Drive 側の削除はごみ箱へ（rclone の既定）
  - `captures` は `--check-access`（E: が外れていて全部消えたと見なす事故を防ぐ。両側の根に `RCLONE_TEST` を置く）
- 結果（送った数・衝突・エラー）を、ローカルのログ（追跡しない）に 1 回 1 行で足す。衝突は `npm run drive:conflicts` で一覧にする。

### 4.3 初回（既存のコピーの採用）

- `captures`: `--resync --dry-run` で送られるものを見る。2.5 節の見込みでは、証拠フレーム 30 枚と、その後に足したものだけ。見込みと違えば止めてオーナーに相談する。合っていれば `--resync` を実行する。
- ほかの 3 つ: Drive に無いので、`--resync` でローカルを上げる。
- 以後、フィルタを変えたら、その対だけ `--resync` する。

### 4.4 録画の道具の書き方を変える

- `intake.ts`: 今は移した録画を I: へ robocopy し、sha256 を突き合わせる。これを次に変える。
  - Drive の中で、取り込み元の写し（「マイ コンピュータ/record」の下。2.9 節）を種別フォルダへ規約名でコピーする（サーバーの中なので上げ直さない。rclone は「パソコン」のフォルダの ID を自分では見つけられないので、ID を指して読む。出典 5）。コピーできなければ E: から上げる（数百 MB を上げ直す）。取り込み元を E: へ移すと、Drive for desktop が `record` の写しも消す。
  - 突き合わせは、rclone が返す Drive の SHA256 と台帳の sha256 で行う。
  - コピーの後の bisync は、両側に同じファイルがあると見て何も送らない見込み（段 ① で確かめる）。
- `records-renumber.ts`: I: の中の改名を、Drive の中の改名（`rclone moveto`）に変える。
- `dirs.ts`: `backupDir()`（I: のパス）を、Drive の相手（rclone のリモートとパス）に変える。
- [captures/storage.md](captures/storage.md)「バックアップ」の robocopy の手順は、`old_nikkecalc` の分だけ残す。

## 5. Apps Script の受け口

### 5.1 範囲

- 根は 3 つだけ: `nikke_sync/`・`nikke_project_captures/`・「マイ コンピュータ/record」（スクリプトのプロパティにフォルダ ID を置く）。パスは根からの相対で受け、`..` と根の外は断る。
- 操作:

  | 操作       | すること                                                                                                                      |
  | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
  | `snapshot` | 根の下の決めた範囲の一覧（パス・md5・大きさ・更新時刻）と、小さいファイルの中身                                               |
  | `get`      | 1 ファイルの中身                                                                                                              |
  | `put`      | 作るか上書きする。呼ぶ側が前に取った md5 と Drive の今の md5 が違えば、上書きせず `<名前>.conflict-cloud.<拡張子>` として置く |
  | `trash`    | ごみ箱へ移す（完全には消さない）。md5 が違えば何もしない                                                                      |
  | `move`     | 移動・改名（取り込みと録画の番号の振り直し）。`record` から外へ移せなければ、サーバーの中のコピーと元のごみ箱への移動で代える |

- `put` で書けるのは、`nikke_sync/` の下と `nikke_project_captures/frames/` の下だけにする（録画の上に書かせない）。
- 1 ファイルの大きさの上限を決める（10MB を案とし、段 ② の試しで決める）。
- md5 などの一覧は、Apps Script の高度なサービス（Drive API）で取る。
- コードはリポジトリに置き（`tools/drive/gateway/`）、オーナーが Apps Script に貼って公開する（8 節）。

### 5.2 合言葉と通信先

- 合言葉はスクリプトのプロパティに置き、リクエストの本文で受けて比べる。クラウド側は、まず Body parameter 型のネットワークシークレットで付ける（VM に入らない）。使えなければ環境変数（`NIKKE_DRIVE_GATEWAY_KEY`）に置く。受け口の URL は環境変数（`NIKKE_DRIVE_GATEWAY_URL`）に置く。
- クラウドの環境の通信の許可（Custom）に `script.google.com` と `script.googleusercontent.com` を足す。
- 合言葉が漏れたときに起こりうるのは、3 つの根の中の読み出し、`put` で書ける場所への書き込み、ごみ箱への移動・移動・改名まで。完全な削除はできず、ごみ箱から 30 日は戻せる。漏れたら合言葉を変える。

## 6. クラウドのセッション

### 6.1 始め（SessionStart フック）

`tools/drive/cloud-pull.ts`（`CLAUDE_CODE_REMOTE=true` のときだけ動く）:

1. 受け口の `snapshot` で `nikke_sync/` の `private`・`scratch`・`claude` を取り、次に置く。
   - `private/`・`scratch/` → リポジトリの `private/`・`scratch/`（デスクトップのメインのチェックアウトと同じ相対パス。どちらも `.gitignore` 済み）
   - メモリ → `~/.claude/projects/-home-user-nikke-project/memory/`（ローカルと同じ名前の付け方で決めた場所。今は読まれないが、自動メモリが入ればそのまま使える見込み）
   - 全体の CLAUDE.md → 下の 2 で使う
   - Drive に無いファイルは手元からも消す（使い回された VM に古いものを残さない）。ただし、前の応答で戻せなかった手元の変更（前に取った md5 と違うもの）は消さず、先に 6.2 節の手順で戻す。
2. `~/.claude/CLAUDE.md` を上書きで書く。中身は、全体の CLAUDE.md と「メモリ（クラウド）」の節（`MEMORY.md` の索引、本文の置き場所、デスクトップの自動メモリと同じ形式で書くこと、書いたものは応答の終わりに Drive へ戻ること）。
3. 取ったファイルの md5 を、手元の基準として残す（`~/.cache/nikke-sync/base.json`）。

全体の CLAUDE.md は、デスクトップからクラウドへの一方向にする（クラウドの `~/.claude/CLAUDE.md` は組み立てたものなので戻さない）。

### 6.2 応答の終わり（Stop フック）

`tools/drive/cloud-push.ts`:

- `private/`・`scratch/`・メモリ: 基準と違うものを `put`、消えたものを `trash` する。どちらも前に取った md5 を添え、Drive 側も変わっていれば衝突として別名で置く。
- 証拠フレーム: クラウドの録画の置き場所（`~/nikke_project_captures/frames/`）に新しくできたものを `put` する（同じ名前があり中身が違えば衝突）。
- 衝突があれば、フックの出力でどのファイルかを知らせる。
- 失敗しても応答は止めず、次の応答の終わりにやり直す。

### 6.3 クラウドでの取り込み（段 ④）

- `intake.ts` に、Drive の取り込み元（「マイ コンピュータ/record」。2.9 節）から取り込む形を足す。サービスアカウントで一覧と取り寄せ → sha256 → 番号と規約名（今と同じ決め方）→ 受け口の `move` で種別フォルダへ移して改名（移せなければコピーと元のごみ箱への移動）→ 台帳と [captures/backup-log.md](captures/backup-log.md)。
- PC を付けると、Drive for desktop が `H:/record` の写しを消し、bisync が種別フォルダに増えた録画を E: に降ろす（数百 MB）。PC が使えなかったときだけ起きるので、降ろし直しを許す（デスクトップで先に動かす仕組みは作らない）。
- `records:renumber` をクラウドで回すときの Drive 側の改名も、受け口の `move` で行う。
- サービスアカウントが読むのは、今と同じ `nikke_project_captures`・`old_nikkecalc` と、取り込み元の `record`（どれも閲覧者で足りる）。`nikke_sync/`（`private`・`scratch`・`claude`）は共有しない。

### 6.4 再開

- 「クラウドで続ける」で移したセッションも、6.1 節で同じものが置かれる。
- PC が突然止まったときは、クラウドのセッションで `wip/<ブランチ名>` を取り出して続ける（7 節）。

## 7. 作業中のブランチの退避（WIP）

- `tools/git/wip-push.ts` を Stop フックから呼ぶ（ローカルとクラウドの両方）。手順は 2.8 節で試した形で、`wip/<ブランチ名>` に強制で push する。
- 退避しないとき:
  - main のとき
  - 作業中の変更が無く、HEAD が push 済みのとき（`wip/` が残っていれば消す）
  - 前回の退避と同じ中身のとき（前回の tree をブランチごとに覚えておく）
  - 追跡外の大きいファイル（合計 50MB を超える）があるとき（知らせる）
- push は 30 秒で打ち切り、失敗しても応答は止めない。
- 片付け:
  - `sync-after-merge.ts` がマージ済みのブランチを origin/main に揃えるときに、`wip/<ブランチ名>` も消す。
  - 残ったものを片付ける `npm run wip:prune`（元のブランチが origin に無く、worktree も無いもの）。
- 再開の手順（手引きに書く）: `git fetch origin wip/<ブランチ名>` → `git switch -C <ブランチ名> FETCH_HEAD` → `git reset --soft HEAD~1`（退避のコミットを外し、変更を残す）。
- 気をつけること: `wip/` は公開リポジトリですぐ見える。PR の前の、文面を直していないものも見える。

## 8. オーナーが行う設定

- 段 ①: rclone を入れる（winget）。Google Cloud の今のプロジェクトで、OAuth の同意画面（External・本番）と「デスクトップアプリ」のクライアント ID を作る。`rclone config` でリモートを作り、ブラウザで認可する。タスクスケジューラに `drive:sync` を 5 分ごとに登録する（登録のコマンドは Claude が用意する）。
- 段 ②: Apps Script のプロジェクトを作り、コードを貼り、高度なサービス（Drive API）を有効にし、プロパティ（合言葉・3 つの根のフォルダ ID）を入れて、ウェブアプリとして公開する（自分として実行・ログインなし）。クラウドの環境に、通信の許可（2 つ）・環境変数（URL）・Body parameter 型のネットワークシークレット（合言葉）を足す。
- いつでも: 2026-10-23 にサービスアカウントを編集者にした `nikke_project_captures`・`old_nikkecalc`・`record` を、閲覧者に戻す（11 節の 5。今のツールは書かないので、戻しても困らない）。

鍵（rclone の設定・合言葉）はリポジトリに置かない。

## 9. 段階と確かめ

| 段                             | 中身                                                          | 確かめ                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① 録画まわりの自動同期         | 4 節の `captures` の対、4.4 節                                | 空打ちで、送られるのが証拠フレームだけ。撮った録画が数分以内に Drive に上がる（`record` は今の同期）。`intake.ts` で取り込んだ録画が上げ直されない                                                               |
| ② 受け口と小さいファイルの往復 | 4 節の `private`・`scratch`・`claude` の対、5 節、6.1・6.2 節 | 受け口の試し（大きさ・合言葉・通信先）。クラウドのセッションで `owner.md` とメモリが見え、全体の指示が効く。クラウドで直したものが数分で D: に届く。衝突が両方残る。クラウドで切り出した証拠フレームが E: に届く |
| ③ WIP の自動 push              | 7 節                                                          | 変更を残したまま応答を終え、`wip/` に上がる。クラウドで取り出して続けられる。マージの後に `wip/` が消える                                                                                                        |
| ④ クラウドでの取り込み         | 6.3 節                                                        | PC を切ってクラウドで `H:/record` の録画を取り込み、PC を付けると E: に規約名で届き、`H:/record` から消える                                                                                                      |
| 通しの試験                     | 1 節の完成の条件                                              | PC を切った状態で、スマホから始めて PR まで                                                                                                                                                                      |

- 段ごとに PR にする（実装と確かめが済んだ時点。AGENTS.md「コミット手順」）。この設計書は段 ① の PR に含め、以後の段で 12 節に実施を書き足す。
- 手引き `plan/cloud.md`（どこに何があるか、再開の手順、衝突の扱い、コマンド）を段 ② で新しく作り、AGENTS.md の「記録の置き場所」に 1 行足す。

## 10. 気をつけること

- 2 つの道具で同じ Drive のフォルダに書かない（I: は見るだけ。`H:/record` は Drive for desktop だけが同期する）。
- bisync の重大なエラー（終了コード 7 など）は `--resync` が要る。`--resync` はローカルが勝つので、空打ちで確かめてから行う。
- Drive に同名の複製ができたら `rclone dedupe` で直す。
- クラウドのメモリは自動メモリの代わり（CLAUDE.md に書いた決まりで読み書きする）。デスクトップの自動メモリと同じ形式にそろえる。
- 使い回された VM: フックは上書きで書き、Drive に無いものは消す（6.1 節）。
- クラウドの Node は 22（リポジトリの `.nvmrc` は 24）。クラウドで `npm test` を通せるかは段 ② で確かめる。
- Claude が自分で打つ通信は、auto mode の判定で止まることがある。同期はフックで行う。`fetch.ts` は今もクラウドで動いている（オーナー）。
- `wip/` は公開される（7 節）。
- 電源断の途中の同期は、次回に `--recover`・`--resilient` で直す。

## 11. 承認を求める項目

1. 全体の形（3 節）。デスクトップは rclone bisync。クラウドは、録画の本体をサービスアカウントで読み、小さいファイルの読み書きと Drive の中の移動・改名を受け口で行う。【推奨】
2. Drive の配置: `nikke_sync/` の下に `private`・`scratch`・`claude` を置き、既存の `nikke_project_captures` を同期の相手にする。`H:/record` は今の Drive for desktop の同期（「マイ コンピュータ/record」）のまま。`old_nikkecalc` は今のまま（4.1 節）。
3. デスクトップの同期: 5 分ごと、除外（4.1 節）、安全装置（4.2 節）、初回の手順（4.3 節）。【推奨】
4. 受け口の範囲（5.1 節）と、合言葉の置き場所（5.2 節）。【推奨】
5. サービスアカウントは閲覧者に戻す（今は 3 つのフォルダで編集者。書くのは受け口だけにする。2.1 節）。`nikke_sync/`（`private`・`scratch`・メモリ）は共有しない（6.3 節）。【推奨】
6. メモリと全体の指示の渡し方（6.1 節）。全体の CLAUDE.md はデスクトップからの一方向。
7. 衝突の名前: デスクトップの同期は `conflict-desktop`・`conflict-drive`、クラウドは `conflict-cloud`。一覧は `npm run drive:conflicts`。
8. WIP の退避（7 節）。ローカルとクラウドの両方で動かす。
9. クラウドでの取り込みは、デスクトップでの降ろし直しを許す（6.3 節）。【推奨】
10. 手引き `plan/cloud.md` を段 ② で作り、AGENTS.md に 1 行足す（9 節）。
11. 段階の順と確かめ（9 節）。

## 12. 実施（承認後に書く）

## この設計の外

- `D:/old_nikkecalc` と `E:/old_nikkecalc` のクラウドでの作業（後回し。1 節）
- Antigravity の置き場所（後回し。2026-10-22 の決定）
- いまのサービスアカウントの鍵（環境変数）を、GCP access token 型のネットワークシークレットへ移すこと（2.3 節。VM に鍵を置かずに済む。`fetch.ts` の手直しが要る）
- `derived/` を Drive に置いて、クラウドで作り直しを省くこと

## 出典

1. Google Drive API「Resolve errors」（サービスアカウントは容量を持たずファイルを所有できない）: https://developers.google.com/workspace/drive/api/guides/handle-errors
2. サービスアカウントの容量の変更の告知（2025-04-15 より後に作ったものは容量が無い。rclone フォーラムの転載）: https://forum.rclone.org/t/google-drive-service-account-changes-and-rclone/50136
3. Google ドライブ ヘルプ「ファイルを削除する」（持ち主でないファイルは削除できない）: https://support.google.com/drive/answer/2375102
4. Google Drive API「Choose Google Drive API scopes」（`drive.file`・`drive`）: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
5. rclone「Google Drive」（自前の client_id、`drive.file`、更新時刻、「パソコン」のフォルダ、複製、1 秒 2 件、ごみ箱）: https://rclone.org/drive/
6. Apps Script「Class File」: https://developers.google.com/apps-script/reference/drive/file
7. Apps Script「Web app manifest」（`executeAs`・`access`）: https://developers.google.com/apps-script/manifest/web-app-api-executable
8. Apps Script「Web Apps」（`doGet`・`doPost` の引数）: https://developers.google.com/apps-script/guides/web
9. Apps Script「Content Service」（`script.googleusercontent.com` への転送）: https://developers.google.com/apps-script/guides/content
10. Apps Script「Quotas」: https://developers.google.com/apps-script/guides/services/quotas
11. Claude Code「Configure cloud environments」（環境変数・ネットワークシークレット・セットアップスクリプトとスナップショット・SessionStart フック）: https://code.claude.com/docs/en/cloud-environments
12. Claude Tag「Connect a service that isn't in the list」（ネットワークシークレットの種類）: https://claude.com/docs/claude-tag/admins/connections/custom
13. Claude Code「Hooks」（SessionStart・Stop・`CLAUDE_CODE_REMOTE`）: https://code.claude.com/docs/en/hooks
14. Claude Code「How Claude remembers your project」（自動メモリ）: https://code.claude.com/docs/en/memory
15. rclone「Bisync」: https://rclone.org/bisync/
16. rclone「Overview」（Drive のハッシュとサーバーの中の移動）: https://rclone.org/overview/
17. Google「Using OAuth 2.0 to Access Google APIs」（リフレッシュトークンの失効と個数の上限）: https://developers.google.com/identity/protocols/oauth2
18. rclone「Local Filesystem」（ジャンクション・転送中に変わるファイル）: https://rclone.org/local/
19. Claude Code「Use Claude Code in the cloud」（手元のセッションをクラウドへ移す）: https://code.claude.com/docs/en/claude-code-on-the-web
