# 録画の置き場所とバックアップ

- 関連: [index.md](index.md)（命名規約・撮影プロトコル・台帳・キャラの確かめ方）、[tools.md](tools.md)（解析ツール）、[backup-log.md](backup-log.md)（ふだんと違う同期の記録）

## 置き場所

録画は容量が読めないので D: のリポジトリには置かず、**E:（2.8TB HDD）に集約する**。証拠フレームも E: に置き、公開しない（2026-09-26 から）。リポジトリ側に残すのは台帳と手引きだけ。

```
H:/record/                      取り込み元: 撮った録画・スクショの保存先（元ファイル名のまま。2026-09-26 に H:/video から作り直した）
E:/old_nikkecalc/               取り込み元: 未分類の生録画（旧プロジェクトのアーカイブ。元ファイル名のまま。2026-09-29 に E:/record/nikke/ から移した）
  動画/                         269 本・約 110GB
  命中/ リザルト/ …              過去の検証素材

E:/nikke_project_captures/      このプロジェクトが採用した録画（種別ごとに分ける）
  range/                        射撃場（1 ヒット・発射サイクル。Stage 15-A の 3 分モード・スペック固定 OFF もここ）
  interception/                 迎撃戦（異常個体 / 特殊個体）の実戦（Stage 15-B）
  raid/                         ソロ / ユニオンレイドの実戦
  skill/                        スキル発動・バフ持続
  burst/                        バーストゲージ・フルバースト
  ui/                           ステータス画面・ShiftyPad などの画面録画と、録画に付かないスクショ
  frames/*.jpg                  証拠フレーム（台帳の `frames/…` はここを指す）
  derived/<録画 id>/            解析ツールの中間出力のキャッシュ（read.ts のレシピなど。追跡しない。作り直せる）
  reference/                    録画ではない参照資料（画像）。下の「参照資料」
    tooltips/                   ゲーム内の用語のツールチップ（ファイル名は用語）
    prerelease/                 実装前に先行公開されたスキル画像

D:/nikke_project/plan/captures/ リポジトリ側（Git 追跡）
  index.md                      録画の索引（命名規約・台帳・キャラの確かめ方）
  protocol.md                   撮影の手順
  storage.md                    このファイル（置き場所・バックアップ・取り寄せ）
  tools.md                      解析ツール
  guide.md                      撮影と読み取りの手引き
```

種別フォルダは必要になった時点で作る（現状あるのは `range/`・`interception/`・`frames/`・`reference/`）。**種別の語彙はこの一覧に足してから使う。** 録画の種別は `records/recordings/<録画 id>.json` の `folder` と同じ語彙（`packages/core/src/records/recordings.ts` の `RECORDING_FOLDERS`）。

### 運用

取り込み元は `H:/record/` と `E:/old_nikkecalc/` の 2 つ。撮った録画とスクショはどちらかに置かれる。

1. 撮る → 取り込み元に保存される。読んでいないものはそのまま置いておく。
2. 読み込んだ（解析に使った）録画とスクショは、検証に採用したかどうかにかかわらず `E:/nikke_project_captures/<種別>/` へ**移し**、規約名を付ける。取り込み元には残さない（同じ録画が 2 箇所にあって食い違う状態を作らない）。
   - ドライブをまたぐので、コピー → sha256 の一致を確かめる → 取り込み元から消す、の順に行う。
   - スクショは、関連する録画と同じ種別フォルダに置く。録画に付かないスクショ（ステータス画面だけ など）は `ui/` に置く（名前は [index.md](index.md)「命名規約」）。
   - 例外: 旧プロジェクトの録画（`L-` の番号）は移さない（[index.md](index.md)「旧プロジェクトの録画」）。
3. 録画は `records/recordings/<録画 id>.json` を 1 本足し、`npm run records:table` で録画の一覧（[recordings.md](recordings.md)）を作り直す。採用しなかった録画にも通し番号を振って載せ、採用しなかった理由を `conditionNote` に書く。スクショは `records/recordings/` に載せない（録画に付くものはファイル名の番号で結びつく。録画に付かないものは、それを読んだ記録（検証記録など）にファイル名を書く）。証拠フレームは `E:/nikke_project_captures/frames/` に切り出す（コミットしない）。
4. Google Drive に同期する（下記「バックアップ」）。移した録画・スクショ・証拠フレームはどれも `E:/nikke_project_captures/` の下にある。録画は `intake.ts` が取り込みの最後に Drive に置き、ハッシュを突き合わせる（`intake.ts` の冒頭のコメント）。`frames/` に切り出した証拠フレームは `still.ts` が上げる。ほかに足したもの（スクショ・手で置いたもの）は、デスクトップのセッションの始めか、離席の前の `npm run drive:sync` で上がる。

### 参照資料（`reference/`）

録画ではないので台帳の番号は振らない。公開しない（出典はゲーム内の画面と公式の告知画像）。

- `tooltips/`: スキル情報の「」内の用語を押したときに出る説明（例: 分配ダメージ・フォーカス・デコイ）。100 枚、2026-08-09 撮影（旧プロジェクトの時期）。ファイル名は用語そのもの（日本語）。
- `prerelease/`: 実装前に先行公開されたスキル紹介画像。数値はスキル Lv10 の値で、実装時に変わることがある（画像内の注記）。名前は `<rid>_<英名>_<スキル>.jpg`。

| ファイル                               | キャラ（rid）                   | 内容               | 元のファイル名        | 取得日     |
| -------------------------------------- | ------------------------------- | ------------------ | --------------------- | ---------- |
| `404_guilty-mighty-bunny_s1.jpg`       | ギルティ：マイティバニー（404） | スキル 1           | `HSUWN_AbMAAji9Q.jpg` | 2026-09-16 |
| `404_guilty-mighty-bunny_s2-burst.jpg` | ギルティ：マイティバニー（404） | スキル 2・バースト | `HSUWN-3bcAAZEb8.jpg` | 2026-09-16 |
| `405_sin-swift-bunny_s1.jpg`           | シン：スウィフトバニー（405）   | スキル 1           | `HSUldGBbIAAH7K4.jpg` | 2026-09-16 |
| `405_sin-swift-bunny_s2-burst.jpg`     | シン：スウィフトバニー（405）   | スキル 2・バースト | `HSUldDwbUAA9ohl.jpg` | 2026-09-16 |

## バックアップ

`E:/nikke_project_captures/` は、Google Drive のマイドライブの `nikke_project_captures` と、デスクトップの rclone の双方向同期（bisync）でそろえる（2026-10-23 から。[../design-cloud-environment.md](../design-cloud-environment.md) 4 節）。片側で消したものは、Drive ではごみ箱へ、E: では `E:/nikke_sync_trash/captures/` へ移る（どちらも戻せる）。`derived/` と `desktop.ini` は同期しない（`tools/drive/filters/captures.txt`）。

- 回すのは作業の節目（2026-10-23 のオーナーの決定）:
  - 道具の終わり: `intake.ts` が取り込んだ録画を Drive に置き、`still.ts` が `frames/` に切り出した証拠フレームを上げ、`npm run records:renumber -- <古い番号> <新しい番号>` が Drive でも名前を変える（Drive の中で変えるので上げ直さない。クラウドでは受け口で変える。[backup-log.md](backup-log.md) に段落を足す。[../design-recording-renumber.md](../design-recording-renumber.md) 5 節。手でリネームしない）
  - デスクトップのセッションの始め: SessionStart フックが裏で `npm run drive:sync` を回す（30 分以内に回っていれば飛ばす）
  - 離席の前: 手で `npm run drive:sync` を回す（「クラウドで続ける」の前にも。Claude に頼んでもよい）
- 衝突（前の同期から両側で変わった）ファイルは両方を残し、名前に側を付ける（`<名前>.conflict-desktop.<拡張子>` と `<名前>.conflict-drive.<拡張子>`）。一覧は `npm run drive:conflicts`。中身を見て 1 つにまとめ、別名の方を消す。
- 実行の記録は、ホームの下の `.nikke-sync/sync.log`（1 回 1 行。フックで回した rclone の出力は `last-captures.log`）。
- 重大なエラー（終了コード 7）が出たら、`npm run drive:sync -- --pair captures --resync --dry-run` で何が動くかを見てから `--resync` する（`--resync` はローカルが勝つ）。フィルタを変えたときも `--resync` が要る。
- `captures` と `private` の根には、両側に目印 `SYNC_MARKER_DO_NOT_DELETE.txt` がある（`--check-access` が見る。消すと同期が止まる）。無いと言われたら、ドライブがつながっているかを確かめてから、その対を `--resync --dry-run` で見て `--resync`（目印を置き直す）。
- `Safety abort: all files were changed` で止まったら、片側で全部のファイルが変わっている。その側の中身を見てから直す（2026-10-24 に目印の無かった `private` で起きた。[../design-cloud-environment-log.md](../design-cloud-environment-log.md) 12.2 節）。
- Drive に同名の複製ができたら `rclone dedupe` で直す。
- Drive for desktop の `I:` は見るためだけに使い、ここから書かない（2 つの道具で同じフォルダに書かない）。
- 取り込み元の `H:/record/` は、Drive for desktop が「マイ コンピュータ/record」として同期している（rclone では扱わない）。

### 準備（オーナーが 1 回だけ）

1. rclone を入れる（`winget install Rclone.Rclone`）。
2. Google Cloud の今のプロジェクト（サービスアカウントと同じでよい）で、OAuth の同意画面を External で作り、公開の状態を「本番」にする（「テスト」のままだと認可が 7 日で切れる）。認証情報で「デスクトップアプリ」の OAuth クライアント ID を作る。
3. rclone のリモートを作る: `rclone config create gdrive drive client_id <クライアント ID> client_secret <クライアント シークレット> scope drive`。ブラウザが開くので、メインのアカウントで認可する（「このアプリは Google で確認されていません」の画面は、自分のアプリなので進めてよい）。名前を gdrive 以外にするなら、環境変数 `NIKKE_RCLONE_REMOTE` に入れる。
4. 取り込み元の写しを Drive の中でコピーさせる（上げ直さない）なら、ユーザーの環境変数 `NIKKE_DRIVE_RECORD_FOLDER_ID` に「マイ コンピュータ/record」のフォルダ ID を入れる。無ければ E: から上げる。
5. 初回: `npm run drive:sync -- --resync --dry-run` で送られるものを見る（2026-10-23 の見込みは、Drive に無い証拠フレーム 30 枚だけ。[../design-cloud-environment-notes.md](../design-cloud-environment-notes.md) 2.5 節）。合っていれば `npm run drive:sync -- --resync`（`captures` と `private` の両側の根に目印 `SYNC_MARKER_DO_NOT_DELETE.txt` を置いてから、両側を合わせる）。

鍵（rclone の設定ファイルのトークンと、クライアント シークレット）はリポジトリに置かない。

### 旧プロジェクトのアーカイブ

`E:/old_nikkecalc/` は、今までどおり手の robocopy で Google Drive に写す（Drive 上は同じ名前のフォルダ）。Google Drive for desktop がストリーミングモードで 2 アカウント分マウントされている。**使うのはメインアカウント側の `I:`**（別アカウントの `J:` は使わない）。

```bash
robocopy "E:/old_nikkecalc" "I:/マイドライブ/old_nikkecalc" /E /R:1 /W:1
```

- `/E` はサブディレクトリを含めて差分コピーする。コピー元で消したファイルはコピー先に残る（`/MIR` のようにミスが伝播しない）。リネームすると**コピー先に旧名が残る**ので、必要なら手で消す。
- **Git Bash から実行しない。** `/E` がパス `E:/` に変換されて「無効なパラメーター」になる。PowerShell か cmd から実行する（パスも `\` 区切りで渡す）。
- robocopy の終了コードは 0〜7 が正常（1 = コピーした、0 = 差分なし）。8 以上が失敗。
- 写したら sha256 で中身を突き合わせる。`probe.ts` はどのディレクトリにも使える（`node tools/captures/probe.ts "I:/マイドライブ/old_nikkecalc"`）。見るのは `.mp4` だけなので、ほかは PowerShell の `Get-FileHash`（既定で SHA256）で突き合わせる。

`intake.ts` で Drive に置いた録画は、`intake.ts` が録画の JSON（`records/recordings/<録画 id>.json`）に `backup`（置いた日時・経路・一致したハッシュ）を書く（2026-10-25 から。[../design-workflow-simplification.md](../design-workflow-simplification.md) 2 節）。`backup` の無い録画は、`intake.ts` が置けたと確かめていない。手で同期したとき・番号の振り直し・失敗と直しのような、ふだんと違う出来事は [backup-log.md](backup-log.md) に段落で足す（2026-10-25 までは [backup-log-old2.md](backup-log-old2.md)、2026-10-05 までは [backup-log-old.md](backup-log-old.md)。どちらも凍結）。

### 冗長性の現状と限界

| 対象               | 冗長                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 台帳               | Git → GitHub（`HKHKM-dev/nikke_project`）                                                                                                                                                             |
| 録画・証拠フレーム | E: の実体 + Google Drive（rclone の双方向同期。消したものは Drive のごみ箱と E: の退避フォルダに残る）。**別拠点にコピーがある**                                                                      |
| 取り込み元         | `H:/record/` にあるのは未読のものだけ（読んだものは移す）。Drive for desktop が「マイ コンピュータ/record」として同期している（2026-09-28 から）。`E:/old_nikkecalc/` は Google Drive（`I:`）にもある |

**注意: `I:` のローカル表示の空きは Drive 本体の容量ではなく、Google Drive デスクトップアプリのローカルキャッシュ置き場の空きに連動する。** 表示が少なくなってきたら、まずキャッシュドライブの設定を疑うこと。

## クラウド環境での取り寄せ

クラウド環境（Claude Code on the web など）には E: が無いので、上のバックアップ先（Drive の `マイドライブ/nikke_project_captures` と `old_nikkecalc`）からサービスアカウントで取り寄せる（`tools/captures/fetch.ts`）。権限は読み取り専用で、共有したフォルダの中しか見えない。

### 準備（オーナーが 1 回だけ）

1. Google Cloud でプロジェクトを作り、Google Drive API を有効にする。サービスアカウントを作り（ロールは付けない）、鍵（JSON）を 1 つ作ってダウンロードする。
2. Drive の `nikke_project_captures` フォルダを、サービスアカウントのメールアドレス（鍵の `client_email`）に**閲覧者**で共有する。ほかのフォルダは共有しない。フォルダ ID は、フォルダを開いたときの URL `drive.google.com/drive/folders/<ID>` の `<ID>`。旧プロジェクトの録画も取るなら、`old_nikkecalc` フォルダも同じように共有する。
3. クラウド環境の設定に次を入れる。
   - 環境変数: `NIKKE_DRIVE_SA_KEY`（鍵の JSON を base64 にしたもの。PowerShell なら `[Convert]::ToBase64String([IO.File]::ReadAllBytes("鍵.json"))`。JSON そのままでも読める）と `NIKKE_DRIVE_FOLDER_ID`（上の `<ID>`）。旧プロジェクトの録画も取るなら `NIKKE_DRIVE_LEGACY_FOLDER_ID`（`old_nikkecalc` の `<ID>`）。どちらもフォルダを複数指すときは、1 行の中で `<ID1>,<ID2>` のようにカンマで区切る（設定欄は 1 行 1 変数なので、改行すると 2 行目は捨てられる）。前に書いたフォルダから探して最初に見つかったものを取り、`--list` は全部のフォルダの中身を合わせて出す。
   - ネットワーク: `www.googleapis.com` と `oauth2.googleapis.com` への通信を許可する。
   - セットアップスクリプト: `apt-get update && apt-get install -y ffmpeg`（解析ツールが ffmpeg・ffprobe を使う）。
4. 鍵のファイルはリポジトリに置かない（公開リポジトリ）。漏れたら Google Cloud でその鍵を消して作り直す。

### 使い方

```bash
node tools/captures/fetch.ts 040 063                # 録画 id で取り寄せ、sha256 の先頭 12 桁を台帳と突き合わせる
node tools/captures/fetch.ts frames/<名前>.jpg      # 相対パスでも取れる。フォルダを指すと中身を全部取る
node tools/captures/fetch.ts --list range           # Drive 上のフォルダの中身を見る
node tools/captures/fetch.ts L-AD                   # 旧プロジェクトの録画（台帳の path から old_nikkecalc の下を引く）
node tools/captures/fetch.ts --legacy リザルト      # --legacy を付けると相対パスは old_nikkecalc の下（--list にも効く）
```

- 置き場所は環境変数 `NIKKE_CAPTURES_DIR`。無ければ Windows は `E:/nikke_project_captures`、それ以外はホームの下の `nikke_project_captures`（`tools/captures/dirs.ts`）。種別フォルダの構成は E: と同じ。旧プロジェクトのものは `NIKKE_LEGACY_DIR`（無ければ `E:/old_nikkecalc`、それ以外はホームの下の `old_nikkecalc`）。
- 旧プロジェクトの録画は台帳に sha256 が無いので、突き合わせない。
- 既にあるファイルは取り直さない（録画は sha256 が台帳と違えば取り直す）。`--force` で取り直す。
- Drive に無いと言われたら、手元の E: から同期（上の「バックアップ」）していないことが多い。
- クラウド環境のディスクはセッションごとに消える。取り寄せた録画は残らない。クラウドで `frames/` に切り出した証拠フレームは、応答の終わりのフックが Apps Script の受け口で Drive に戻し、デスクトップの次の同期で E: に届く（受け口の準備が済んだ環境だけ。[../cloud-guide.md](../cloud-guide.md)）。
