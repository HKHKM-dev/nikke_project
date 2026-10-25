# バックアップの実行の記録

- 手順は [storage.md](storage.md)「バックアップ」にある。
- `intake.ts` で取り込んで Drive に置いた録画は、ここに書かない。`intake.ts` が録画の JSON（`records/recordings/<録画 id>.json`）に `backup`（置いた日時・経路・一致したハッシュ）を書く（2026-10-25 から。[../design-workflow-simplification.md](../design-workflow-simplification.md) 2 節）。`backup` の無い録画は、`intake.ts` が置けたと確かめていない。
- ここには、ふだんと違う出来事だけを段落で書く（日付・したこと・sha256 の突き合わせの結果）: 手で同期したとき（`intake.ts` が置けずに `npm run drive:sync` で上げた・証拠フレームを手で移したなど）、番号の振り直し（`records:renumber` が段落を足す）、失敗と直し。
- 2026-10-06〜2026-10-25 の記録は [backup-log-old2.md](backup-log-old2.md)、2026-10-05 までは [backup-log-old.md](backup-log-old.md)（どちらも凍結）。

2026-10-25 20:38 に、録画 634 本の番号を 4 桁にそろえた（`records:renumber -- --pad-all`。plan/design-recording-id-4digit.md）。E: で 1,198 件（動画 634・証拠フレーム 215・derived 349）・Drive で 849 件（動画と証拠フレーム）の名前を変えた。1 回目がセッションの終わりで Drive の 240 件で止まり、2 回目で残りを変えた。その後 captures の対を --resync した（中身は変えていないので sha256 は台帳のまま）。

2026-10-25 22:04 に、目印を `SYNC_MARKER_DO_NOT_DELETE.txt` に変えた変更（#668）の後に同期が止まっていないかを確かめた。`sync.log` に目印が無いことで飛ばした対は無く、`captures` と `private` の両側の根に目印がある（2026-10-24 13:42 に置いたもの。旧い `RCLONE_TEST` は両側とも無い）。ふつうの `npm run drive:sync` で 4 つの対がすべて通った。`--resync` は要らなかった。
