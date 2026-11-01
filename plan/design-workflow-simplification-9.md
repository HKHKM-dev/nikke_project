# 繰り返しの業務の簡素化の案・第 9 回（2026-11-01 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。2026-11-01 にオーナーが 1・2 を承認し、実施した（5 節）。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)・[-2](design-workflow-simplification-2.md)〜[-8](design-workflow-simplification-8.md)。どれも実施済み（第 8 回の 4 の古いブランチも消えている）。そこで扱ったものは繰り返さない。
- この回で見たもの: `npm test` の時間の内訳（`pr:prep` と GitHub の CI の両方で回る一番長い段）、直近の 50 本の PR が触るファイル、文書が指す道具と npm のスクリプトの有無、手書きの文書の大きさ、最小構成の感度の全部の計算し直し（[verification-guide.md](verification-guide.md) 7 節の「定期の見直し」の分）。
- 調べ方: origin/main（e4be34b7）のクラウドの環境（4 コア）で測った。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | vitest のテストのファイルごとの隔離（`isolate`）を外す | `npm test` 1 回あたり約 30 秒（74〜80 秒 → 約 45 秒）。`pr:prep`・GitHub の CI・手で回すテストのどれでも | 進めてよいか |
| 2 | 感度の全部の計算し直しで出た差（値だけ。警告は変わらない）を、この回で作り直した | なし（この回の作業） | 直した `sensitivity.json` を入れてよいか |

推奨は 1・2 とも進める。1 は PR ごとに 2 回以上（`pr:prep` と CI。衝突で回し直すとその分も）効く。

## 1. vitest の隔離を外す

**いま**

- `npm test` は、テストのファイル 232 個を、ファイルごとに新しいワーカーで回す（vitest の既定の `isolate: true`）。ワーカーごとに `packages/core` のモジュールとデータを読み直す。
- このクラウドの環境で測ると、`npm test` は 74〜80 秒で、その 48〜51% が import（モジュールの読み込み）。テストの本体の時間の合計は 87 秒で、4 コアに分かれている。
- `npm test` は、PR ごとに `pr:prep` で 1 回以上、GitHub の CI で 1 回以上回る（直近の 2 日で PR は約 50 本）。

**案**

- 3 つのプロジェクトの設定（`packages/core/vitest.config.ts`・`apps/web/vitest.config.ts`・`tools/vitest.config.ts`）に `isolate: false` を書く。同じワーカーが、モジュールを読み込んだまま次のファイルを回す。

**測った結果**

<!-- prettier-ignore -->
| 回し方 | 時間 | 結果 |
| --- | --- | --- |
| 今の既定（隔離あり・forks） | 74〜80 秒 | 2943 通る・5 飛ばす |
| `--no-isolate`（3 回） | 44.5〜45.9 秒 | 同じ |
| `--no-isolate --pool=threads` | 48 秒 | 同じ（forks より速くないので、プールは今のまま） |

**気をつけること**

- 隔離を外すと、あるテストがモジュールの状態や大域の状態（モック・偽のタイマー・環境変数・`process.chdir`）を変えて戻さないと、後のファイルが落ちうる。今のテストには `vi.mock`・`vi.spyOn`・`vi.fn`・`vi.useFakeTimers`・`vi.stubEnv`・`process.env` への代入・`process.chdir` が 1 つも無い（数えた）。
- テストの順をかき混ぜて（`--sequence.shuffle`、種 7・42）回すと、`tools/drive/cloud-sync.test.ts` の 4 件が、隔離のありなしに関わらず同じように落ちた。同じファイルの中のテストが前のテストの作ったファイルに頼っているためで、隔離とは関係が無い（ふだんの順では通る）。この回の案には入れない（5 節）。
- 将来、隔離が要るテストが出たら、そのファイルだけを `isolate: true` の別のプロジェクトに分ける（vitest のプロジェクトごとの設定）。

**効果**: `npm test` 1 回で約 30 秒。PR 1 本で `pr:prep` と CI の 2 回なら約 1 分、2 日で約 50 分。GitHub の CI は 4 コアで、同じ割合で縮む見込み。

## 2. 感度の全部の計算し直しで出た差（この回で作り直した）

- [verification-guide.md](verification-guide.md) 7 節のとおり、`npm run records:minimal -- --all`（2 分）を回すと、`records/minimal/sensitivity.json` の 5 行の値が変わった: 観測値 `0165-12`（アニス：スター burst.effects[0]）と `0721-11`・`0722-10`・`0722-11`・`0722-12`（たきな burst.effects[0]。`0722-12` は値が出なくなった）の `minus`。
- どの行も `effective`（効きうるか）は変わらず、`records:check` で作り直した [minimal.md](minimal.md)・[claims.md](claims.md) は 1 字も変わらない（最小構成の警告は変わらない）。
- 原因は、第 8 回の後にモデルのコード（`packages/core/src`）を変えた PR が 16 本あること。感度の鍵はモデルのコードを含まないので、ふだんの差分の計算では作り直されない。決まりのとおりの出方で（[design-workflow-simplification-5.md](design-workflow-simplification-5.md) 7.2 節）、鍵に足すものは無い。
- 作り直した `sensitivity.json` を、この文書と同じブランチに commit した。

## 3. 見たが案にしなかったもの

- **文書だけの PR の確認を軽くする**: 直近の 50 本のうち 4 本は `plan/backlog.md` だけの PR で、`pr:prep` は生成物の作り直しと型・テスト・ビルドを全部回す。文書が指す ID を `npm test`（`verifications.test.ts`）が見るのでテストは要り、省けるのは型とビルドの約 30 秒と、変わらない生成物の作り直しだけ。50 本で 4 本・1 本 1 分ほどで、道具に分かれ道を足すほどではない。
- **50KB を超える手書きの設計書**（`design-stage12.md` など 20 個）: どれも記録の型で、最後の変更はリポジトリを作り直したときのコミットだけ。書き足されていないので分けない。
- **文書が指す道具と npm のスクリプト**: 手引き（AGENTS.md・README.md・verification-guide.md・skills-guide.md・cloud-guide.md・captures の手引き・records の README）が指す `tools/`・`packages/core/scripts/` のファイルは全部ある。`npm run` のスクリプトで無いのは `skills:catalog` だけで、記録（第 4 回の設計書）の中なので直さない。
- **型の確認（`typecheck` 22 秒）**: ワークスペースごとに `tsc` を回している。`tsc -b` のプロジェクト参照にすれば並べられるが、設定の組み直しが大きく、セッションの 1 回目には効きにくい（第 8 回 1 節の「ほかの手」と同じ）。
- **この見直しの間隔**: 第 7 回の 4（週 1 回にする）はオーナーの設定で、今も毎日回っている。案の数は 3・2 と減っている。

## 4. 実施の分け方（承認されたら）

- 1・2 を 1 つの PR にする。1 は 3 つの設定に 1 行ずつ足すだけで、手引きは変えない（テストの回し方は変わらない）。PR に前後の `npm test` の時間を書く。

## 5. 経過

- 2026-11-01: 起案。2 を同じブランチに commit した。
- 2026-11-01: オーナーが 1・2 を推奨どおり承認。1 は 3 つの設定（`packages/core`・`apps/web`・`tools` の `vitest.config.ts`）に `isolate: false` を足した。設定で回した `npm test` は 51 秒（同じ環境の前の既定で 74〜80 秒）、2943 件が通り 5 件を飛ばすのは前と同じ。
- 2026-11-01: main を取り込むと、たきなの 4 行は、その間にマージされた段 17 の PR 2・3（#867・#868）が鍵の変わった組として作り直していて、この回と同じ値になっていた。この PR の `sensitivity.json` の差は `0165-12` の 1 行だけ。
