# 繰り返しの業務の簡素化の案・第 16 回（2026-11-18 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。2026-11-18 にオーナーが 1（案 A）・2 を承認し、実施した（4 節）。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-15](design-workflow-simplification-15.md)。どれも実施済み。見直しの段（[design-review-steps.md](design-review-steps.md)）・撮影の本数（[design-capture-count.md](design-capture-count.md)）も含め、そこで扱ったもの（使われ方の少ない道具・レシピ、生成物の戻し、`records:new` の `--help` など）は繰り返さない。
- この回で見たもの: 第 15 回の後の PR 27 本（#1203〜#1229）が触るファイル、手書きの手引きの大きさとその伸び（2026-10-20 からの版ごと）、`npm run` と `tools/` の道具の `--help` の振る舞い、`scratch/` の使い捨てのスクリプト、バッジの書き出しの流れ。
- 調べ方: origin/main（37de18db）のクラウドの環境で、git の履歴と道具を直に回して数えた（使い捨て。コミットしない）。この回の環境ではセッションの出来事の列を読めなかったので、所要の時間は測っていない。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | `plan/skills-guide.md` 1.4 節の言い回しの表（112 行・28KB）を、別の文書 `plan/skill-phrases.md` に移す | スキル定義のセッションが毎回読む手引きの量（44KB → 約 16KB）。手引きを縮めては伸びる繰り返し | 移してよいか（案 A）。生成にするか（案 B） |
| 2 | CLI の引数の読み取りを共通の関数 1 つに寄せ、`--help` で冒頭の使い方を出す | 33 か所の `parseArgs` の同じ書き方。`--help` や引数の誤りで出るスタックトレースと、そこからファイルを開いて使い方を読む手間 | 進めてよいか |

推奨: 案 1 の A と、案 2。どちらも小さく、1 つの PR にできる。

## 1. 手引きの言い回しの表

**いま**

- [skills-guide.md](skills-guide.md) は 44.0KB（目安は 50KB）。そのうち 1.4 節「実装する」が 31KB で、ほとんどが「言い回し → 書き方 → 例 → 設計書」の表（112 行・28.4KB）。
- 2026-11-08 からの 39 本の commit がこの手引きを触り、ほぼ全部がスキル定義の PR で、表に 1〜3 行を足した（1 本で 76 行の組み替えが 1 回）。
- 伸び: 2026-11-01 に 29KB → 11-13 に 44.5KB → 11-14 に縮めて 38.7KB → 11-16 に 44.0KB。縮めても 2 日で元に戻る。決まりの文は第 12 回で `skills/types.ts` の注記に移したので、残る伸びは表の行。
- 表は「この言い回しはどう書くか」を引くためのもので、上から読むものではない。それでも手引きを読むと、表の全部が読み込まれる。11-08 からの PR のうち、題名に「スキル」を含むものは 60 本あり、どれも手引きを読む。
- 語彙を足したときは、`types.ts` の注記に決まりを書き、表に 1 行足す（2 か所に書く）。

**案 A（推奨）: 表を別の文書に移す**

- 表を `plan/skill-phrases.md`（現状の型）に移す。手引きの 1.4 節には「言い回しと語彙の対応は skill-phrases.md の表。語彙を足したら 1 行足す」の 1 行だけを残す。手引きは約 16KB になる。
- 引くときは grep か、表の文書を開く。表の文書は大分類（バフ・ダメージ・回復…）の小見出しで分け、50KB に近づいたら大分類ごとのファイルに分ける。
- 直すもの: `pr-prep-lib.ts` の「両方が行を足しただけの衝突を直してよいファイル」（今は `plan/*-guide.md` と設計書）に新しい文書を足す。[AGENTS.md](../AGENTS.md) の「記録の置き場所」の表に 1 行足す。

**案 B: 表を生成にする**

- 語彙の欄の注記（`types.ts`）に言い回しと設計書の節を書き、例のキャラは `data/skills/` で使っている定義から引いて、表を生成する。書く所が 1 か所になる。
- 112 行ぶんの注記の書き足しと、生成の道具が要る。注記と表がずれた事例はまだ無いので、A で足りる。

## 2. CLI の引数の読み取り

**いま**

- `packages/core/scripts/` と `tools/` で、`node:util` の `parseArgs` を直に呼ぶスクリプトが 33 本ある。使い方はどれもファイルの冒頭のコメントに書いてある。
- `--help` で使い方を出すのは `records:new` だけ（第 15 回 10 節で直した）。ほかの 22 本（`char`・`sim`・`records:close`・`records:model`・`records:residual`・`records:predict`・`records:minimal`・`records:renumber`・`pr:prep`・`build:import`、撮影の道具の `read`・`intake`・`probe-result`・`still`・`hud`・`gauge`・`timer`・`aim`・`ammo`・`reticle-ammo`・`banner`・`reload`）は、`--help` も知らない引数も `ERR_PARSE_ARGS_UNKNOWN_OPTION` のスタックトレースで落ちる。
- `records:table` は `--help` を見ずに、録画の一覧を作り直した（中身が同じだったので変更は残らなかった）。
- 第 15 回で `records:model`・`records:residual`・`sim` に引数を足したので、使い方を引く機会が増えている。

**案**

- 共通の関数（例: `cliArgs(import.meta.url, options)`）を 1 つ置き、33 本をそれに替える。`-h`・`--help` ではファイルの冒頭のコメント（使い方）を出して終わる。知らない引数や形の誤りでは、エラーの 1 行と使い方を出して、スタックトレースを出さずに終わる。
- 使い方は今のとおり冒頭のコメントにだけ書く（別の usage の文を持たない）。`records:new` の usage の文も冒頭のコメントに寄せる。
- 引数を取らない道具（`records:table` など）も、知らない引数では何もせずに使い方を出す。

## 3. 見たが案にしなかったもの

- **第 15 回の道具の使われ方**: 入って 3 日で、検証記録は V-0797〜V-0803 の 7 件だけ。`hp-bars`・`buff-edge --opt count` は観測値にまだ出ない。`records:model --like`・`records:residual --base`・`sim --trace` は観測値に跡が残らない道具なので、記録からは数えられない。次の回で、セッションの出来事の列で見る。
- **[captures/guide.md](captures/guide.md) の伸び**（43.4KB。11-07 に 47KB から縮め、8 日で 4.8KB 伸びた）: 伸びは「画面の読み方」の項目で、話題がばらばら。1 の表のような 1 つの塊が無いので、`pr:prep` の大きさの知らせで縮める今の形のままにする。
- **バッジの書き出し（`apps/web/src/assets/badges/`）を commit しない**: 11-15〜11-17 のバッジと画面の PR 7 本は、どれも書き出しを触り、うち 6 本は元（`badges-src/`）も触った。ただ、書き出しは元の枠を書き戻す（元も変える）ので、ビルドの段にすると CI が元を書き換える形になる。ずれは `badges.test.ts` が見ている。今のままにする。
- **CI の「生成物を作り直す」commit**: 11-08 からの PR 226 本に対し 133 本。並行の PR の衝突を避けるための形（[design-pr-conflicts.md](design-pr-conflicts.md) 3.1 節）で、繰り返しの手間は無い。
- **`scratch/` の使い捨てのスクリプト**（100 本）: 文字列を置き換えて書き換えるもの（`fp-edit.ts`・`test-edit.ts`・`close-v.ts` など）が多いが、`records:new observation`・`records:close --mark` より前（11-01 ごろ）のものとみられる。Drive から取り寄せたので日付が分からず、今も書かれているかは判断できない。

## 4. 経過

- 2026-11-18: 起案。
- 2026-11-18: オーナーが 1 の案 A と 2 を承認した。
- 2026-11-18: 1・2 を実装した。言い回しの表（110 行）を `plan/skill-phrases.md` に移し、両方残す衝突の範囲に足した。大分類での小見出しの分けは、表の行が作った順に並んでいて分けるには行ごとの判断が要るので、50KB に近づいたときに行う。引数の読み取りは `packages/core/scripts/cli.ts` の `cliArgs` にし、`parseArgs` を呼んでいた 33 本と、`records:check`（`--keep-generated`）・`records:table`（引数なし）を替えた。`records:new` は話題と機構の一覧を含む今の usage の文を渡す。フック（`review-flow.ts`・`sync-after-merge.ts`）と、位置引数だけを読む `probe.ts`・`format-retry.ts`・`check-pages-build.ts` は替えていない。
