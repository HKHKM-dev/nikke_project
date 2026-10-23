# クラウド環境 設計書の補助（調べたことの根拠と出典）

- 本体: [design-cloud-environment.md](design-cloud-environment.md)（方針・段階・承認はそちら。ここは調べたことの根拠と出典だけ）
- 作成日: 2026-10-23（本体の 2 節から移した）
- 調べた時点: main の 3e052720（#642）。件数・容量は 2026-10-23 の手元とクラウドの調べで、判断の材料。以後は書き直さない
- 節の番号は本体の 2 節と同じ（2.1 ↔ 2.1）。この設計への影響は本体の各節に書く

## 2. 調べたこと

出典の番号は末尾の一覧。

### 2.1 サービスアカウントと Drive の権限

- サービスアカウントは容量を持たず、ファイルを所有できない（出典 1）。マイドライブでは作ったアカウントがファイルの持ち主になるので、編集者で共有しても、新しいファイルを作ると 403（`storageQuotaExceeded`）で失敗する。2025-04-15 より後に作ったサービスアカウントには、以前の 15GB も付かない（出典 2）。Google が挙げる代わりの手段のうち、共有ドライブとドメイン全体の委任は Google Workspace の機能（出典 1・2。個人の Google One のプランで使えないことは、公式の対応表では確かめていない）。
- 持ち主でないファイルは削除できず、自分のドライブから外せるだけ（出典 3）。別のアカウントやサービスアカウントを編集者にしても、オーナーの持ち物は消せない。
- 範囲を限った認可（`drive.file`）は、その仕組みが作ったか開いたファイルにしか届かない（出典 4・5）。いまの録画（robocopy で上げた分）には届かない。
- 2026-10-23 の別のセッションで、いまのサービスアカウントで試した: 容量の上限は 0 バイト。オーナーが `nikke_project_captures`・`old_nikkecalc`・`record`（2.9 節）を編集者で共有した後も、中身のある新しいファイルの作成とコピーは 403（`storageQuotaExceeded`）、ごみ箱への移動は 403（`insufficientFilePermissions`）。オーナーのファイルの中身の上書き・改名・移動はできた（持ち主はオーナーのまま）。

### 2.2 Apps Script の受け口

- Drive の操作: `File` に `moveTo`（移動）・`setName`（改名）・`setTrashed`（ごみ箱へ）・`setContent`（上書き）・`getBlob`（読み出し）がある（出典 6）。録画の移動・改名・ごみ箱への移動は中身を送らない。
- 公開の設定: `executeAs: USER_DEPLOYING`（公開した人として動く）、`access: ANYONE_ANONYMOUS`（ログインなしで呼べる）（出典 7）。
- 受け取ったリクエストのヘッダーは読めない。`doPost` の引数が持つのは `queryString`・`parameter`・`postData` など（出典 8）。
- 応答は `script.googleusercontent.com` の一度限りの URL へ転送して返る。呼ぶ側は転送に従う（出典 9）。
- 割り当て（個人のアカウント）: 1 回の実行は 6 分まで、同時に 30 まで（出典 10）。受け取れる大きさの上限は文書に無い。

### 2.3 クラウド環境の設定（Claude Code）

- 環境変数は、その環境を使う人と VM の中のコマンドが読める（出典 11）。
- ネットワークシークレット: 鍵を環境に預け、プロキシが送信の後にリクエストへ付ける。鍵は VM に入らない。個人のプランでも自分の環境に足せる（出典 11）。種類は Bearer（ヘッダー）・Body parameter（本文かクエリ文字列）・GCP access token（サービスアカウントの鍵からプロキシがトークンを作る）など（出典 11・12）。Body parameter で入力する欄は文書に無い。セットアップスクリプトの中のリクエストには付かない（出典 11）。
- セットアップスクリプトは毎回は動かない。初回の結果をスナップショットにして使い回し、スクリプトか通信の許可を変えたときと、約 7 日で作り直す（出典 11）。
- SessionStart フックは、Claude Code が起動した後に毎回（再開を含む）動き、最初の応答はフックの終わりを待つ（出典 11・13）。リポジトリを複数持つセッションでは、リポジトリのフックは動かない（出典 11）。クラウドでは `CLAUDE_CODE_REMOTE=true`（出典 13）。
- 自動メモリはマシンごとで、クラウドとは共有されない（出典 14）。
- デスクトップのアプリは、手元のセッションをクラウドへ移せる（出典 19）。

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

- Drive: 更新時刻は 1ms、ハッシュは MD5・SHA1・SHA256、Drive の中のコピーと移動はサーバーの中でできる（出典 5・16）。「パソコン」として同期したフォルダは、最上位が読み取り専用で、その下も書き込みが 500 で失敗することがある。rclone はそのフォルダの ID を API から見つけられない（どちらも出典 5）。まれに同名の複製ができ、`rclone dedupe` で直す（出典 5）。小さいファイルの転送は 1 秒に約 2 件（出典 5）。
- 認可: 自前の OAuth クライアントを勧める（組み込みの共有の ID は 2026 年中に止まる。出典 5）。同意画面が External で「テスト」のままだと、認可は 7 日で失効する。「本番」にすると、使わないまま 6 か月たつか取り消すまで失効しない。1 つのクライアントにつき 1 アカウント 100 個まで（出典 17）。検証を受けないので認可のときに警告が出るが、自分だけが使うので進めればよい（出典 5）。
- bisync（出典 15）: 初回は `--resync`。既定の比べ方は大きさと更新時刻。衝突は既定で両方を残し、名前の接尾辞を左右で別にできる。`--backup-dir1`・`--backup-dir2`（v1.66）で消したものを退避できる。`--max-delete`（既定 50%）を超える削除は止まる。`--check-access`・`--resilient`・`--recover`・`--max-lock`。フィルタを変えたら `--resync` が要る。ロックで重なった起動を防ぐ。`--track-renames` は `--resync` では効かない。
- ローカル: ジャンクションは既定で無視する。転送の途中で変わったファイルは次回に回す（出典 18）。

### 2.8 Git と GitHub

- CI と Pages は、main への push と PR でしか動かない（`.github/workflows/`）。
- ルール（automerge）は main にだけ掛かる。マージ後に自動で消えるのは PR のブランチだけ。
- 退避のコミットの作り方を試した: 一時の index に今の index を写して `git add -A` し、`git write-tree` と `git commit-tree -p HEAD` でコミットを作る。HEAD・index・作業ツリーのどれも変えずに、未 commit の変更と追跡外のファイル（`.gitignore` のものを除く）を含むコミットができた。`wip/<ブランチ名>` への push は空打ちで通った。

### 2.9 H:/record の今の同期（2026-10-23）

- `H:/record` は、2026-09-28 から Drive for desktop で「マイ コンピュータ」の下の `record` として同期されている（Drive のコネクタで見たフォルダの属性が同期フォルダ。中の `Captures` の作成時刻が `H:/record/Captures` と同じ）。撮った録画は、今も Drive for desktop が自動で上げている（上がるまでの時間は段 ① で確かめる）。
- 「パソコン」の同期フォルダは、最上位の名前を変えられない（2.1 節の別のセッションの試し。出典 5 とも合う）。中のファイルを API で外へ移せるかは試していない。

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
