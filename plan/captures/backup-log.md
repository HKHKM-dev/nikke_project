# バックアップの実行の記録

- 手順は [storage.md](storage.md)「バックアップ」にある。
- `intake.ts` で取り込んで Drive に置いた録画は、ここに書かない。`intake.ts` が録画の JSON（`records/recordings/<録画 id>.json`）に `backup`（置いた日時・経路・一致したハッシュ）を書く（2026-10-25 から。[../design-workflow-simplification.md](../design-workflow-simplification.md) 2 節）。`backup` の無い録画は、`intake.ts` が置けたと確かめていない。
- ここには、ふだんと違う出来事だけを段落で書く（日付・したこと・sha256 の突き合わせの結果）: 手で同期したとき（`intake.ts` が置けずに `npm run drive:sync` で上げた・証拠フレームを手で移したなど）、番号の振り直し（`records:renumber` が段落を足す）、失敗と直し。
- 2026-10-06〜2026-10-25 の記録は [backup-log-old2.md](backup-log-old2.md)、2026-10-05 までは [backup-log-old.md](backup-log-old.md)（どちらも凍結）。

2026-10-25 20:38 に、録画 634 本の番号を 4 桁にそろえた（`records:renumber -- --pad-all`。plan/design-recording-id-4digit.md）。E: で 1,198 件（動画 634・証拠フレーム 215・derived 349）・Drive で 849 件（動画と証拠フレーム）の名前を変えた。1 回目がセッションの終わりで Drive の 240 件で止まり、2 回目で残りを変えた。その後 captures の対を --resync した（中身は変えていないので sha256 は台帳のまま）。

2026-10-25 22:04 に、目印を `SYNC_MARKER_DO_NOT_DELETE.txt` に変えた変更（#668）の後に同期が止まっていないかを確かめた。`sync.log` に目印が無いことで飛ばした対は無く、`captures` と `private` の両側の根に目印がある（2026-10-24 13:42 に置いたもの。旧い `RCLONE_TEST` は両側とも無い）。ふつうの `npm run drive:sync` で 4 つの対がすべて通った。`--resync` は要らなかった。

2026-10-26 15:42 に、録画 0689 を 0693 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0693_smg+mg+mg_sakura+yukiko+elegg_elegg-burst-dist-2.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:42 に、録画 0688 を 0692 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0692_smg+mg+mg_sakura+yukiko+elegg_elegg-burst-dist-1.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:42 に、録画 0687 を 0691 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0691_smg+ar+mg_sakura+idoll-sun+elegg_elegg-burst-2.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:42 に、録画 0686 を 0690 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0690_smg+ar+mg_sakura+idoll-sun+elegg_elegg-burst-1.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:35 に、録画 0676 を 0691 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0691_naga-barrier-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:35 に、録画 0678 を 0693 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0693_lud-bel-lap-priv-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:36 に、録画 0679 を 0695 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0695_lud-bel-lap-priv-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:36 に、録画 0680 を 0696 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0696_lud-bel-lap-priv-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:36 に、録画 0681 を 0697 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0697_product08-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:36 に、録画 0682 を 0699 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0699_rapunzel-pg-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:37 に、録画 0683 を 0700 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0700_emma-burst-heal.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:37 に、録画 0684 を 0701 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0701_blanc-burst-heal.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:37 に、録画 0685 を 0702 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0702_blanc-burst-heal.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:37 に、録画 0686 を 0703 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0703_naga-heal-asuka.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 15:38 に、録画 0687 を 0705 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0705_folkwang-burst-heal.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 16:26 に、録画 0691 を 0706 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0706_naga-barrier-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-26 16:27 に、録画 0693 を 0707 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261026-0707_lud-bel-lap-priv-burst.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-11-05 23:06 に、録画 0939 の台帳の素性を、E: と Drive の実体に合わせて直した（`sha256` `e6bcaea58d6c` → `060d884cd575`、`sizeMB` 237.6 → 245.1、`durationSec` 195.7 → 202.2、`frames` null → 12133）。OS の入れ直しの後に E: の range 全体を `probe.ts` で台帳と突き合わせて見つけた（E: と Drive の中身は同じ）。原因は、クラウドで取り込んだ（`intake.ts drive:`、2026-11-03 19:37）とき、Drive for desktop が録画を上げ終えていなかったこと: Drive のファイルの作成は撮り始めの 4 秒後（撮っている間から上げている）で、取り込みは撮り終わり（19:35:59）の約 1 分後。台帳には途中までの版（撮り終わりの約 6.5 秒前まで、戦闘の終わりの戦闘履歴のパネルの前）を書き、その後 Drive for desktop が同じファイルに完全な版を上げた。同じ取り込みで移した 0938 も、ほかのクラウドで移した録画も、Drive の更新時刻は移した時刻なのに、0939 だけが手元の撮り終わりの時刻（19:36:01）になっている。Drive の版の履歴には今の版しか残っていない。V-0660 の観測値は、今の実体でレシピ `hud-jumps@3`（増分 3960 個・`0939-01`・`0939-02`）と `burst-panel@3`（`0939-03`〜`0939-08`）を回し直して同じ値になった（戦闘は途中までの版の中で終わっている）ので、変えていない。取り込みの直しは `records/backlog/cloud-intake-upload-settled.json`。

2026-11-05 23:06 に、台帳に無かった録画 `range/20261006-273_smg+sr+ar_miranda+delta+idoll-sun_miranda-control.mp4`（sha256 `c4443d2d31ec`。0262 とは別の中身）を、録画 0273 として台帳に足し（`records/recordings/0273.json`。条件は録画の画で確かめた）、E: と Drive（rclone moveto）で `range/20261006-0273_smg+sr+ar_miranda+delta+idoll-sun_miranda-control.mp4` に名前を変えた（オーナーの判断）。2026-10-06 20:39 に撮り、取り込んだが台帳の JSON が main に入らなかったもので、4 桁にそろえたとき（2026-10-25）にも台帳に無いので 3 桁の名前のまま残っていた。`records:renumber` は 273 と 0273 を同じ番号とみるので手で変えた。中身は変えていないので sha256 は変えた前と同じ（Drive の sha256 も一致）。

2026-11-10 21:58 に、録画 1023・1024 の名前を、E: の代わりのクラウドの置き場所と Drive（受け口の move）で `range/20261110-1023_sr_ade-agent-bunny_fire.mp4`・`range/20261110-1024_sr_ade-agent-bunny_fire.mp4` に変えた（取り込みの時の名前は `..._rl+sr_i-doll-flower+ade-agent-bunny_fire.mp4`）。撮った順が撮影の依頼の表と逆（2 人 2 本 → 単騎 2 本）で、取り込みの引数を表の順で付けたため。編成は戦闘履歴のパネルで確かめ、台帳の `team`・`autoBurst` も直した（1021・1022 が 2 人、1023・1024 が単騎）。中身は変えていないので sha256 は台帳のまま。

2026-11-12 02:42 に、録画 1092 を 1095 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261112-1095_sr_ade-agent-bunny_near1-pause.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-11-12 02:42 に、録画 1091 を 1094 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261112-1094_sr_ade-agent-bunny_near1-pause.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-11-12 02:42 に、録画 1090 を 1093 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261112-1093_sr_ade-agent-bunny_near1-pause.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-11-12 02:50 に、録画 1094・1095 の名前を、E: の代わりのクラウドの置き場所と Drive（受け口の move）で `range/20261112-1094_sr_ade-agent-bunny_midfar-start.mp4`・`range/20261112-1095_sr_ade-agent-bunny_midfar-start.mp4` に変えた（取り込みの時の名前は `..._near1-pause.mp4`）。Drive の record に別の撮影の録画が混ざって上がっていて、撮った時刻の順で V-0728 の 3 本とみて取り込んだが、オート射撃のボタンの画で V-0731 の撮り方（戦闘の始まりから撃たない）と分かったため。台帳の `autoFire`・`conditionNote` も直した。中身は変えていないので sha256 は台帳のまま。

2026-11-12 14:44 に、録画 1113 を 1125 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261112-1125_grave-sakura-heat.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-11-14 02:33 に、録画 1144 を 1154 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261114-1154_exia-solo.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。
