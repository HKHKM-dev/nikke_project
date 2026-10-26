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
