# 録画の置き場所とバックアップ

- 関連: [index.md](index.md)（命名規約・撮影プロトコル・台帳・キャラの確かめ方）、[tools.md](tools.md)（解析ツール）、[backup-log.md](backup-log.md)（同期の記録）
- 2026-10-11 に index.md の「置き場所」「バックアップ」「クラウド環境での取り寄せ」を移した（[../design-investigation-review.md](../design-investigation-review.md) 7.2 節）。

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
  derived/<録画 id>/            解析ツールの中間出力のキャッシュ（read.ts のレシピ・coverage.ts など。追跡しない。作り直せる）
  reference/                    録画ではない参照資料（画像）。下の「参照資料」
    tooltips/                   ゲーム内の用語のツールチップ（ファイル名は用語）
    prerelease/                 実装前に先行公開されたスキル画像

D:/nikke_project/plan/captures/ リポジトリ側（Git 追跡）
  index.md                      録画の索引（命名規約・撮影プロトコル・台帳）
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
4. Google Drive に同期する（下記）。移した録画・スクショ・証拠フレームはどれも `E:/nikke_project_captures/` の下にあるので、フォルダ全体を同期すれば全部バックアップされる。録画は `intake.ts` が取り込みの最後に同期し、sha256 も突き合わせる（[tools.md](tools.md)「解析ツール」の `intake.ts`）。スクショと証拠フレームは手で同期する。

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

`E:/nikke_project_captures/` と、旧プロジェクトのアーカイブ `E:/old_nikkecalc/` を Google Drive にバックアップする（Drive 上は同じ名前のフォルダ）。Google Drive for desktop がストリーミングモードで 2 アカウント分マウントされている。**使うのはメインアカウント側の `I:`**（別アカウントの `J:` は使わない）。

```bash
robocopy "E:/nikke_project_captures" "I:/マイドライブ/nikke_project_captures" /E /R:1 /W:1
robocopy "E:/old_nikkecalc" "I:/マイドライブ/old_nikkecalc" /E /R:1 /W:1
```

- `/E` はサブディレクトリを含めて差分コピーする。コピー元で消したファイルはコピー先に残る（`/MIR` のようにミスが伝播しない）。リネームすると**コピー先に旧名が残る**ので、必要なら手で消す。
- **Git Bash から実行しない。** `/E` がパス `E:/` に変換されて「無効なパラメーター」になる。PowerShell か cmd から実行する（パスも `\` 区切りで渡す）。
- 録画・スクショを足したタイミングで実行する。`intake.ts` で取り込んだ録画は、取り込みの中で 1 本ずつ同期される（失敗したら終了コード 1 で知らせるので、そのときは手で実行する）。
- robocopy の終了コードは 0〜7 が正常（1 = コピーした、0 = 差分なし）。8 以上が失敗。

同期したら sha256 で中身を突き合わせる。`probe.ts` はどのディレクトリにも使える:

```bash
node tools/captures/probe.ts "I:/マイドライブ/nikke_project_captures"
```

`probe.ts` が見るのは `.mp4` だけなので、スクショと証拠フレームは PowerShell の `Get-FileHash`（既定で SHA256）で突き合わせる。

同期の実行の記録は [backup-log.md](backup-log.md) にある（同期したら 1 段落足す。`intake.ts` で同期した録画の段落は `intake.ts` が足す）。

### 冗長性の現状と限界

| 対象               | 冗長                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 台帳               | Git → GitHub（`HKHKM-dev/nikke_project`）                                                                                          |
| 録画・証拠フレーム | E: の実体 + Google Drive（`I:`）。**別拠点にコピーがある**                                                                         |
| 取り込み元         | `H:/record/` にあるのは未読のものだけ（読んだものは移す）。バックアップ対象外。`E:/old_nikkecalc/` は Google Drive（`I:`）にもある |

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
- クラウド環境のディスクはセッションごとに消える。取り寄せた録画も、クラウドで切り出したフレームも残らない（Drive へは書き戻さない）。残す証拠フレームは、検証記録にフレーム番号を書いておき、手元で切り出す。
