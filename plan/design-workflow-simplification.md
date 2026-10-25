# 繰り返しの業務の簡素化の案（2026-10-24 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。オーナーの判断を受けてから直す（まだ何も変えていない）。
- 調べた範囲: [AGENTS.md](../AGENTS.md)「コミット手順」、[verification-guide.md](verification-guide.md)、[captures/protocol.md](captures/protocol.md)、[cloud-guide.md](cloud-guide.md)、`.claude/settings.json` のフック、`tools/`・`packages/core/scripts/` の道具。
- 調べ方: origin/main の直近 50 件のコミットで毎回触るファイルを数え、観測値（`records/observations/`）の `method` から道具とレシピの使われ方を数えた。

## 0. 案の一覧

| #   | 案                                                                       | 減るもの                                                          | 判断してほしいこと                      |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------- |
| 1   | roadmap.md の「今後の課題」に ID を書き足すのをやめ、1 項目 1 行にする   | PR ごとの roadmap の編集・ブランチどうしの衝突・98KB の文書の読み | 進めてよいか                            |
| 2   | backup-log.md に録画 1 本ごとの行を足すのをやめ、録画の JSON に持たせる  | PR ごとの backup-log の編集と衝突・76KB の文書                    | 進めてよいか                            |
| 3   | `records:minimal` を `records:close --mark` に入れ、手で回す決まりを消す | 3 か所の「変えたら回す」の決まりと、回し忘れ                      | 進めてよいか（閉じるのが 1.5 分延びる） |
| 4   | `records:new` で番号を取ったら、すぐ push して番号を押さえる             | 番号の振り直し（直近 50 件の PR のうち 9 件）                     | 進めてよいか                            |
| 5   | クラウドの環境の準備に `npm ci` を足す                                   | クラウドで CI と同じ確認が回らない・生成物の書式がずれる          | 環境の設定はオーナーが行う              |
| 6   | 使われていないレシピ `charge-shots` の扱い                               | 道具の一覧と付録 A の 1 項目                                      | 消すか、次の SR・RL の検証まで残すか    |
| 7   | `sync-after-merge` のフックを 3 か所から 2 か所に減らす                  | 1 往復ごとの `git fetch` の 1 回                                  | 進めてよいか（効果は小さい）            |

推奨は 1〜5 を進め、6 は残す、7 は見送り。

## 1. roadmap.md の「今後の課題」

**いま**

- roadmap.md は 98KB（手書きのファイルの目安 50KB の約 2 倍）。うち「今後の課題」が約 55KB、完了した Stage 1〜24 の節が約 27KB。
- 直近 50 件のコミットのうち 30 件が roadmap.md を触っている。中身はほとんど、項目の行の末尾に V-/C- の ID を書き足すこと（verification-guide.md 9 節「roadmap.md を更新し」）。
- 書き足している ID の並びは、[claims.md](claims.md)（話題ごとの結論の一覧。生成）と [verifications.md](verifications.md)（生成）と重なる。AGENTS.md「1 つの事実は 1 か所に置く」にも合わない。
- 1 項目が 1 行で数 KB になり（例: 「スキルのバフ・状態・回復の分類」）、並行するブランチが同じ行を書き換えて衝突しやすい。

**案**

- 「今後の課題」の 1 項目を「題名（起票日）→ 設計書のリンク・状態（未着手 / 進行中 / 一部完了 / 完了）・残りの行き先（backlog の行）」の 1 行にする。V-/C- の ID と経過は書かない（設計書・claims.md・verifications.md が持つ）。
- 完了した Stage の節（Stage 1〜24）は `roadmap-stages.md`（凍結）に移し、roadmap.md の一覧の表からリンクする。
- verification-guide.md 9 節の「roadmap.md を更新し」を「項目の状態が変わったときだけ更新する」に変える。

**効果**: 検証の PR の大半で roadmap.md を触らなくなる。roadmap.md は 20KB 前後になる見込み。

**判断（2026-10-25）**: 進める。ただし下の「案を変える点」の形で行う（2026-10-25 にオーナーが承認し、同日に実装した）。

- 必要性（origin/main の eabbefb で確かめた）: roadmap.md は 98,497 バイト。うち「今後の課題」が 55,115、一覧の表が 14,979、Stage の節が約 27,400（節があるのは Stage 1〜17。18〜24 は表の行だけ）。直近 50 件のうち 32 件が roadmap.md を触り、1 件（リポジトリの作り直し）を除く 31 件はどれも 1〜3 行の変更で、項目の行に V-/C- の ID と経過を足すもの。一覧の表の行（Stage 15）も同じ形で書き足されていた。案の数は正しい。
- 妥当性:
  - 項目の行の ID と経過は、抜き取りで見た範囲では結論・検証記録・設計書・backlog にある（例: C-0485 を分けたことは C-0485 の棄却と V-0492、SMG の中遠のオーナーの判断は V-0373・V-0386、ナガの S2 の遅れは backlog 2-38 と V-0489）。
  - ただし、課題にどの検証が属するかの束ねと、設計書の無い課題（例: エーテルの S2 の防御力▼、ミハラ：ボンディングチェーンの S1）の経過は roadmap.md にしか無い。backlog.md も冒頭で「課題ごとの経過は roadmap の今後の課題」としている。案のまま消すと、これが失われる。
  - roadmap.md を読む道具・テストは無い。`records-close.ts` が終わりに「plan/roadmap.md を更新し」と出す（文言だけ）。コードの注記 2 か所（`packages/core/src/types.ts`・`calcHybrid.test.ts`）が「今後の課題」を指す。
  - `roadmap.md#...` のアンカーのリンクは無い。検証記録・設計書は「roadmap.md「今後の課題」の「題名」」の形で題名で指している（約 50 か所）。
- 案を変える点:
  1. 消さずに写す: いまの一覧の表・「今後の課題」の全項目・Stage 1〜17 の節を、そのまま `plan/roadmap-archive.md`（2026-10-25 で凍結。書き足さない）に移す。名前を `roadmap-stages.md` から変えるのは、Stage の節だけでなく課題の経過も持つため。こうすると設計書の無い課題の経過も失われず、題名で指す既存の参照も archive で引ける。凍結なので 50KB の目安は `plan/verification.md` と同じく当てない。
  2. 閉じた項目（完了・打ち切り。約 100 項目）は roadmap.md に写さない（archive にある）。roadmap.md の「今後の課題」は、開いている項目（保留を含めて約 20）だけを 1 行で持つ。これから閉じた項目は、その行の状態を変えて残す。
  3. 1 行の形は案のとおり「題名（起票日）→ 状態・設計書のリンク（あれば）・残りの行き先（backlog の行）」。題名は変えない（題名で指す参照を生かすため）。設計書の無い課題は「経過は archive と backlog の行」とし、ID は書かない（backlog の行が結論の ID を持つ）。
  4. 一覧の表も短くする: 列を「Stage・内容・状態（日付）・設計書」にし、成果物と経過は archive に置く（表の行も ID の書き足しで変わっていたため）。
  5. 合わせて直す所: verification-guide.md 9 節（案のとおり）、backlog.md の冒頭の 2 行（経過の置き場所）、AGENTS.md の記録の置き場所の表、`records-close.ts` の終わりの文言、コードの注記 2 か所。
- 見込み: roadmap.md は 15KB 前後。archive は約 98KB（凍結）。
- 実装（2026-10-25）: roadmap.md は約 14KB、開いている項目は 21 行（保留の calc のハイブリッドを含む）。archive は前の roadmap.md の 3 行目から末尾までをそのまま写した（差分なし）。開いている項目の 1 行の「残り」は、いまの backlog.md の行に合わせた（前の行が指していた backlog の行のうち 2-12・2-25・4-1 は閉じていたので、そう書いた）。`calcHybrid.test.ts` の注記は、calc のハイブリッドの項目が roadmap.md に残るので変えていない。

## 2. backup-log.md の 1 録画 1 行

**いま**

- `intake.ts` が録画を取り込むたびに、backup-log.md に 1 行（日時・ファイル名・sha256 が一致したこと）を足す（`appendBackupLog`）。backup-log.md は 76KB で、目安を超えている。
- 検証の PR は 12 本撮れば 12 行が backup-log.md に入る。並行するブランチがどれも末尾に足すので、リベースのたびに衝突しうる。
- sha256 の値はすでに `records/recordings/<録画 id>.json` にあり、行の残りは「Drive に置いて一致した」ことだけ。`intake.ts` は Drive に置けないと終了コード 1 で止まるので、`intake.ts` で取り込んだ録画は置けている。

**案**

- `intake.ts` は backup-log.md に書かず、録画の JSON に `"backup": { "at": "<日時>", "matched": "sha256" }` を書く（取り込みの後に手で同期したものは `npm run drive:sync` の側で足す）。
- backup-log.md は、手で同期したとき・番号の振り直し（`records:renumber` の段落）・失敗と直しのような、ふだんと違う出来事だけを書く文書にする。いまの 76KB は `backup-log-old.md` と同じく凍結して、新しいファイルで続ける。
- 必要なら `records:table` の一覧に「Drive」の列を足す。

**効果**: 撮影を伴う PR で backup-log.md を触らなくなり、衝突の元が 1 つ減る。

**判断（2026-10-25）**: 進める。ただし案のうち 4 点を変える（下の「変える点」）。

確かめたこと（origin/main の 5873a6f で）:

- 必要性
  - backup-log.md は 76,543 バイト（手書きの目安 50KB の約 1.5 倍）で、なお伸びている。
  - 直近 50 件のコミットのうち 20 件が backup-log.md を触る。録画の JSON を足したコミット 21 件のうち 20 件が行を足している（足していない 1 件は、取り込みのときに Drive に置けなかった録画。のちに振り直して置いた）。
  - 衝突の跡: スカッシュマージなので衝突そのものは履歴に残らないが、行の録画番号が前の行より小さくなる所が 21 か所ある（並行するブランチの行が、リベースで前後した跡）。ファイルの末尾への追記どうしは、git では必ず衝突する。backup-log.md は生成物でないので、AGENTS.md「コミット手順」の `--ours` で戻せず、毎回手で両方を残す。
- 妥当性
  - 案の「`intake.ts` で取り込んだ録画は置けている」は当たらない。`intake.ts` は録画の JSON を Drive に置く**前に**書く。置けないと終了コード 1 で止まるが、JSON は残る（デスクトップでは「取り込みは済んでいる。`npm run drive:sync` で上げる」）。rclone の準備が無い環境と `--no-backup` では、置かずに終了コード 0 で終わる。だから「JSON がある = 置けた」とは言えない。置けたことは、置けたときだけ書く欄で持つ必要がある（案の `backup` の欄が要る理由はこれ）。
  - 置く経路は 4 つ（E: から上げた・Drive の中で record の写しからコピーした・クラウドで record から移した・クラウドで record からコピーして元をごみ箱へ移した）。どれも、ハッシュの突き合わせが一致したときだけ記録を書く（`placed`・`moveInDrive`）。`--copy` の注記は取り込み元のファイルを残したことで、Drive の写しには関わらない。
  - 1 行の情報のうち録画の JSON に無いのは、置いた日時（JSON の `date` は録画の日付）・経路・一致したハッシュの種類（sha256 か md5）の 3 つ。編成の名前・ファイル名・sha256 の値は JSON にある。
  - backup-log.md を読む道具は無い。`records:renumber` は段落を足し、過去の行のファイル名を置き換えるだけ（読まない）。録画の JSON は振り直しで移されるので、欄も一緒に動く。`npm run drive:sync` は backup-log.md に書かない（記録は手元の `sync.log`）。

変える点:

1. 欄の形は `"backup": { "at": "2026-10-25T00:31+09:00", "via": "upload" | "drive-copy" | "cloud-move" | "cloud-copy", "matched": "sha256" | "md5" }` にする。案の `at`・`matched` に経路（`via`）を足す（いまの行が持つ情報を落とさない。クラウドの経路の切り分けに使ってきた）。`at` は日本の時刻でオフセットつき（いまの行と同じ時刻）。録画の型（`ProjectRecording`）に省略できる欄として足し、`validateRecordings` で語彙と時刻の形を検査する。旧の録画（`L-`）には書かない。
2. `npm run drive:sync` の側では足さない。bisync はフォルダ単位で、録画ごとのハッシュの突き合わせをしていない。足すには録画ごとに Drive のハッシュを取る処理を新しく作ることになり、この節の範囲を超える。いまも手で同期した録画には `intake.ts` の行が付かず、段落で書いている。それと同じく、`backup` の欄が無い録画は「`intake.ts` が置けたと確かめていない」とし、手で同期したら backup-log.md に段落を書く。
3. `records:table` の一覧に列は足さない。recordings.md は約 940KB の生成物で、手では読まない。欄の無い録画を探す用が出たら、そのときに足す。
4. 過去の行は JSON に移さない。行の書式が少なくとも 3 種（初期の「を同期（E: と I: で sha256 が一致）」・段落・いまの 1 行）あって読み替えを誤りやすく、300 余りの JSON を書き換えるのに、読む道具が無い。いまの backup-log.md は `backup-log-old2.md` として凍結し（`.gitignore` の追跡の許可に足す）、新しい backup-log.md は冒頭の決まりと凍結した 2 つへのリンクから始める。

ほかに直すもの: `intake.ts` の冒頭のコメント、[captures/storage.md](captures/storage.md)「バックアップ」と道具の終わりの行、[cloud-guide.md](cloud-guide.md) の取り込みの手順、[verification-guide.md](verification-guide.md) の取り込みの行（「backup-log.md への記録」→ 録画の JSON の `backup`）。`records:renumber` は直さない（段落はふだんと違う出来事として、新しい backup-log.md に書く）。

## 3. `records:minimal` を閉じる道具に入れる

**いま**

- 「スキル定義・録画の台帳・観測値の比べる指定を変えたら `npm run records:minimal` を回す」という決まりが、AGENTS.md・verification-guide.md 7 節・skills-guide.md 4 節の 3 か所にある。手で回す手順で、忘れると [minimal.md](minimal.md) が古いまま main に入る。
- `records:close --mark` は `records:check` と CI と同じ確認を回すが、`records:minimal` は回さない（閉じる検査の中では、根拠の観測値の感度だけを `withFreshSensitivity` でその場で計算している）。
- `records:minimal` は `records:check` も続けて回す。手元で 1 回 1.5 分ほど。

**案**

- `records:close --mark` が `records:check` の代わりに `records:minimal`（中で `records:check` も回る）を回す。
- 3 か所の決まりは「検証を伴わない PR（スキル定義だけ直すなど）で、上のものを変えたときは `records:minimal` を回す」の 1 行にまとめ、AGENTS.md に置いて、ほかの 2 か所は指すだけにする。
- AGENTS.md「コミット手順」の 2（CI と同じ確認）に「検証の PR は `records:close --mark` が回す」と添える（いまも PR の本文で「`records:close` の中で回した」と書いていて、手順書だけが二度回すように読める）。

**効果**: 検証の PR で手で回す生成が 1 つ減り、回し忘れが無くなる。閉じるのは 1.5 分ほど延びる。

## 4. 番号を取ったらすぐ push する

**いま**

- 直近 50 件の PR のうち 9 件が、V-/C- の番号か録画の番号を振り直している（`records:renumber`）。
- `records:new` は、手元と origin のどのブランチが使った番号も避けて次の番号を取る（`freeId`）。それでも重なるのは、取った番号を push するまで、ほかのセッションから見えないため。撮影待ちの間など、push までが長いと重なりやすい。

**案**

- verification-guide.md 3 節（起案）と 8 節（結論）に「`records:new` で番号を取ったら、その commit をすぐ push する（ブランチを押さえる。PR は出さない）」を足す。AGENTS.md「撮影待ちの間は、トピックブランチを保持する」とも合う。
- 道具で強制はしない（push できない場面がある）。`records:new` の出力の最後に「push すると番号がほかのブランチから見える」と出す程度にする。

**効果**: 振り直しの多くが無くなる見込み（重なりの窓が、push までの時間から、push と相手の `records:new` の間に縮む）。

## 5. クラウドの環境の準備に `npm ci`

**いま**

- クラウドのセッションには `node_modules` が無く、Node は v22（`package.json` の `engines` は 24 以上）。準備の手順（[captures/storage.md](captures/storage.md)「クラウド環境での取り寄せ › 準備」）のセットアップスクリプトは ffmpeg を入れるだけ。
- この状態で生成の道具を回すと、`npx prettier` がプロジェクトの版（3.9.8）ではない別の版で整形し、手を入れていない検証記録と residuals.md に書式の差分が出た（この見直しで確かめた。差分は捨てた）。`npm test` などの CI と同じ確認もそのままでは回らない。

**案**

- クラウドの環境のセットアップスクリプトに `npm ci` を足す（Node 24 を選べるならそれも）。オーナーが環境の設定で行う。
- 手引き（storage.md の準備の 3、cloud-guide.md「困ったとき」）に 1 行ずつ足す。セットアップスクリプトに足せないなら、SessionStart のフックで「クラウドで `node_modules` が無ければ `npm ci`」を回す形にする（フックは待ち時間が延びるので、スクリプトの方を推す）。

## 6. 使われていないレシピ `charge-shots`

**いま**

- 観測値の `method` を数えると、レシピは 12 のうち 10 が使われている。`charge-shots`（と中で使う `charge-lattice`）は 2026-10-17 に足してから、観測値にも検証記録にも使われていない。`buff-edge` は観測値には無いが、検証記録 2 件（V-0457・V-0489）の読みに使っている。
- 解析ツール（`tools/captures/*.ts`）はどれも観測値か検証記録で使われているか、ほかの道具から呼ばれている。`probe.ts` は取り込みでは使わなくなったが、アーカイブの突き合わせ（storage.md）で使う。

**案**

- 推奨は残す。作ったばかりで、SR・RL の単騎の検証（backlog の行）が次に来れば使う。保守の手間はテストが通る限り小さい。
- 次の SR・RL の弾丸命中率の検証で使わずに済んだら、そのときに消す（`recipes/index.ts`・テスト・verification-guide.md 付録 A の 2 か所・design-charge-shots.md の状態）。

## 7. `sync-after-merge` のフック

**いま**: `tools/git/sync-after-merge.ts` を SessionStart・UserPromptSubmit・Stop の 3 か所から呼び、そのたびに `git fetch` する。1 往復で 2 回。

**案**: UserPromptSubmit を外し、SessionStart と Stop だけにする。マージは応答の外で起きるので、次の発言の前に揃っていなくても、応答の終わりで揃う。ただし効果は小さく、発言のときに main が古いと困る場面（すぐ別の worktree を切るなど）もあるので、推奨は見送り。

## 8. 見たが案にしなかったもの

- 撮影の手順（protocol.md）と撮影の依頼の型: すでに「ふだんの手順は書き写さない」の形で短い。直すところは見つからなかった。
- 観測値の 3 割ほど（直近 10 日でも約 200 件）が「使い捨てのスクリプト」で読まれている。繰り返す読み方はレシピにする決まり（verification-guide.md 6 節）がすでにあり、簡素化の案ではないので扱わない。
- plan/ の設計書（130 余り）: 完了したものも claims・検証記録・コードの注記からリンクされていて、移すとリンクが切れる。動かさない。
- 生成物の `plan/captures/recordings.md`（約 940KB）: 生成物で、手では読まない（ID で引く）。動かさない。
