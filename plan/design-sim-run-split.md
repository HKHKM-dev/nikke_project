# 設計書: sim-run.ts の表示を、テストのある関数に分ける

- 何のための文書か: ヘッドレスの実行口 `packages/core/scripts/sim-run.ts` に直に書いてある表示（きっかけ・効果の値のラベル、表の行、`--trace` の行）を、行を作る関数に分けてテストを書く変更の、今の構造・案と得失・論点・段・確かめ方
- 対象: `packages/core/scripts/sim-run.ts` と、新しく置く `packages/core/scripts/sim-run/` の下のファイルとテスト。計算（`runSimulation`・`simTeamResult`）と、出力の中身は変えない
- 状態: 承認待ち（4 節）
- 関連: [verification-guide.md](verification-guide.md)・[skills-guide.md](skills-guide.md)（`npm run sim` を使う手順）、[design-workflow-simplification-15.md](design-workflow-simplification-15.md) 6 節（`--trace`）、[design-workflow-simplification-16.md](design-workflow-simplification-16.md) 2 節（引数の読み取り `cli.ts`）
- 作成日: 2026-11-19
- 調べた時点: main の 8be26a23

## 1. 背景と目的

- `sim-run.ts` は 988 行で、テストが無い。テストから（直接にも間接にも）読み込まれない本体のファイルの中で、一番大きい。
- この 1 か月で 37 回変わっている。スキルの PR は、きっかけや効果の種類を足すたびに、このファイルのラベル（`triggerLabel` など）に 1 行足す。足した行が正しいかは、手で回した出力を目で見るしかない。
- 表示の処理の多くが、関数の外（スクリプトの最上位）か、最上位の変数（`result`・`sim`・`slots`）を直に読む関数に書いてある。そのままではテストから呼べない。
- 目的は、**表示を「行を作る関数」にして、テストで守ること**。出力（標準出力・標準エラー・終了コード）は一字も変えない。

## 2. 今の構造

### 2.1 中身の並び

<!-- prettier-ignore -->
| 行 | 中身 | 形 |
| --- | --- | --- |
| 73〜141 | ラベル: `effectValueText`（効果の値）・`itemLabel`（件の出どころ）・`triggerLabel`（きっかけ）・`stateLabelOf`（状態の id） | 入力だけで決まる関数 |
| 143〜501 | 引数の読み取りと検査、育成入力の読み込み（`readBuildFile`・`withBuild`）、敵・出来事・着地点、入力（`TeamInput`）の組み立て | 最上位の処理と、最上位の変数を読む関数。`process.exit` が 21 か所 |
| 502〜554 | 編成の条件の表（`compositionRows`） | 最上位の処理 |
| 555〜733 | 計算と、頭書き・着地点・敵の出来事・バーストの要約と発動の表・順位の表・即時効果の表・枠ごとの合計の表・自動の条件の表・注記 | 最上位の処理 |
| 735〜783 | 枠ごとの区間の表 | 最上位の処理 |
| 785〜906 | `printDelayedHits`・`printDots`・`printCycles`・`compactTimed` | `result`・`sim`・`fmt` を直に読む関数（`compactTimed` は入力だけ） |
| 908〜988 | `--trace`: `seconds`・`traceKindOf`・`traceText`・`printTrace` | `traceKindOf`・`traceText` は入力だけ |

- `console.log`・`console.table`・`console.warn`・`console.error` の呼び出しは 53 か所。
- 表は `console.table` に行（オブジェクトの配列）を渡して出す。行を作る所と出す所が同じ式の中にある。

### 2.2 きっかけを文字にする関数

- `triggerLabel`（`sim-run.ts`）は、解決したきっかけ（`ResolvedTrigger`）を短い語にする（`normalShot/10`・`applied:followUp`）。きっかけの形ごとに `if ('…' in t)` を並べ、最後は回数トリガーの形で返す。
- 同じ役目の関数が `records/skills.ts` にもある（定義のきっかけ `EffectTrigger` を日本語の文にする。`plan/skills.md` 用）。型も出す文も違う。
- どちらも、扱っていない形のきっかけが型に足されると、最後の行（`t.count` を読む）が型の検査で落ちる。値が正しいか（`undefined` が混ざらないか）は、テストが無い。

### 2.3 出力の決まり方

- 同じ引数なら出力は同じ（2 回回して比べた）。1 回は約 0.6 秒。
- 出力の経路は、区間の表を出すふだんの経路と、`--trace`（出来事の列だけを出して終わる）の 2 つ。育成入力（`--build`）があると、枠ごとに `build …` の行が先に出る。

## 3. 案

### 3.1 守ること

- 標準出力・標準エラー・終了コードを変えない（文・表の列の名前と並び・数字の桁）。
- 引数とその検査、既定値を変えない。
- 計算の入口（`runSimulation`・`simTeamResult`）と、その結果の型を変えない。

### 3.2 どこまで分けるか

<!-- prettier-ignore -->
| 案 | 中身 | 得失 |
| --- | --- | --- |
| a | ラベル（2.1 節の 73〜141 行）と `--trace` の文だけを別のファイルに出し、テストを書く | 小さい（約 150 行の移動）。スキルの PR が触る所は守れる。表の行と、枠ごとの内訳（持続ダメージ・段の循環・遅れのある倍率ダメージ）はテストできないまま |
| b | 表示の全部を「行を作る関数」にして出す。ラベル・`--trace` に加えて、表の行（編成の条件・発動・順位・即時効果・枠ごとの合計・自動の条件・区間）と、1 行の文（頭書き・着地点・バーストの要約・内訳）を、引数で入力・結果を受けて返す関数にする。`sim-run.ts` には、引数の読み取り・入力の組み立て・`console` への出力だけを残す | 表示の全部にテストを書ける。`sim-run.ts` は約半分になる。移す量が多い（約 500 行） |
| c | b に加えて、引数から入力を組み立てる所（143〜501 行）も関数にしてテストする | 引数の検査までテストできる。検査の途中の `process.exit`（21 か所）を、例外か結果の値に置き換えることになり、終了コードとエラー文の出方に触る |

### 3.3 置き場所

<!-- prettier-ignore -->
| 案 | 中身 | 得失 |
| --- | --- | --- |
| a | `packages/core/scripts/sim-run/` の下（`labels.ts`・`tables.ts`・`trace.ts` とテスト）。入口は `scripts/sim-run.ts` のまま | `scripts/data-diff.ts` と `scripts/data-diff/compare.ts` と同じ置き方。`scripts/**/*.test.ts` はテストの対象に入っている |
| b | `packages/core/src/sim/` の下 | 画面からも読める。画面は、この英語の短いラベルと表を使わない。`@nikke/core` の入口に名前が増える |

### 3.4 きっかけを文字にする 2 つの関数

<!-- prettier-ignore -->
| 案 | 中身 | 得失 |
| --- | --- | --- |
| a | まとめない。CLI の側に、全部の定義のきっかけを解決して `triggerLabel` に通し、`undefined` が混ざらないことを見るテストを足す | 出す文と型が別なので、無理が無い。きっかけの形を足したときの足し忘れを、データで見られる |
| b | きっかけの形ごとに 1 行の表（短い語と日本語の文）にまとめる | 足す所が 1 つになる。`EffectTrigger`（定義）と `ResolvedTrigger`（解決後）の 2 つの型を 1 つの表で扱うことになり、`records/skills.ts` にも触る |

### 3.5 分けた後の形（案 b・置き場所 a）

- `scripts/sim-run/labels.ts`: `effectValueText`・`itemLabel`・`triggerLabel`・`stateLabelOf`・`compactTimed`。
- `scripts/sim-run/trace.ts`: `TRACE_KINDS`・`traceKindOf`・`traceText`・`traceLines`（種類と範囲で絞った行の並びを返す。知らない種類は例外でなく、結果で返す）。
- `scripts/sim-run/tables.ts`: 表の行と 1 行の文を作る関数。入力（`TeamInput`）・`sim`・`result` を引数で受ける。
- `scripts/sim-run.ts`: 引数の読み取りと検査、入力の組み立て、計算、上の関数が返した行を `console.table`・`console.log` に渡すだけ。出す順は今のまま。
- 関数の名前と分け方の細かい所は、実装の時に決める（9 節に書く）。

## 4. 論点（オーナーの判断）

<!-- prettier-ignore -->
| # | 論点 | 案 | 推奨 |
| --- | --- | --- | --- |
| 1 | どこまで分けるか | 案 a（ラベルと `--trace` だけ）・案 b（表示の全部）・案 c（b と、引数から入力を組み立てる所） | **推奨: 案 b**。表示の全部を守れて、出力が変わらないことを確かめやすい。案 c は終了コードとエラー文の出方に触るので、やるなら別の変更にする |
| 2 | 置き場所 | 案 a（`scripts/sim-run/` の下）・案 b（`src/sim/` の下） | **推奨: 案 a**。CLI だけが使う表示で、`scripts/data-diff/` と同じ置き方になる |
| 3 | きっかけを文字にする 2 つの関数 | 案 a（まとめず、CLI の側にデータで見るテストを足す）・案 b（1 つの表にまとめる） | **推奨: 案 a**。型と出す文が別。まとめると `records/skills.ts` まで広がる |

## 5. 段

1 つの PR で行う（`sim-run.ts` はよく変わるので、PR を長く開けない）。

1. 変更の前の出力を控える（6 節の引数の組）。
2. ラベルと `--trace` を移し、テストを書く。
3. 表の行と 1 行の文を、行を作る関数にして移し、テストを書く。
4. 控えた出力と突き合わせる。

## 6. 確かめ方

- `npm run typecheck`・`npm run lint`・`npm test` が通る。
- **出力の突き合わせ**: 次の引数の組で、標準出力・標準エラー・終了コードが変更の前と一字も違わないこと。
  - 定義のある全部のキャラの単騎（`--fixed-spec`）と、その `--trace all`。
  - 編成: 持続ダメージ・段の循環・遅れのある倍率ダメージ・順位（最終攻撃力の高い味方）・即時効果・編成の条件・確率のきっかけ・召喚・カウンタ・使用武器の変更を持つキャラを入れた編成。
  - オプション: `--no-burst`・`--fixed-cycle`・`--controlled`・`--enemy`・`--element`・`--condition manual`（`--core-hit-rate`・`--hit-rate`）・`--mid-far`・`--near`・`--far`・`--no-jump`・`--events`・`--jump-windows`（観測値の id と数の並び）・`--manual-bursts`・`--treasure`・`--skill-levels`・`--build`（育成入力のファイルと、育成データのスナップショット）・`--trace` の種類ごとと `--from`・`--to`。
  - 誤った引数（終了コード 2 になる組）と `--help`。
- 足すテスト: ラベル（きっかけの形ごと・効果の値の種類ごと）、全部の定義のきっかけを通して `undefined` が混ざらないこと、同じ効果の段のまとめ、`--trace` の行、表の行（決まった編成で、列と値）。

## 7. リスク

- **並行する PR との衝突**: スキルの PR が `sim-run.ts` のラベルに 1 行足すと、移した後の行と衝突する。出す前に開いている PR とブランチを見る。衝突したら、足された行を移した先（`labels.ts`）に書き直す。
- **出力が変わる**: 行を作る所と出す所を分けるときに、列の並び・空の表を出すかどうか・出す順を取り違える。6 節の突き合わせで見る（表は `console.table` の出力のまま比べる）。
- **突き合わせの組に無い経路**: 出力の分かれ道のうち、6 節の組が通らないものが残る。分かれ道（`if`）ごとに、通る組があるかを実装の時に数える。

## 8. 扱わないもの

- 引数から入力を組み立てる所の関数への切り出し（3.2 節の案 c）。
- 出力の中身の見直し（列の名前・並び・英語と日本語が混ざっていること）。
- `catalogDoc.ts` の `renderSkillCatalog` の分割、`fixedSpec.ts` の 3 つの関数の重なり（別の候補）。

## 9. 経過

- 2026-11-19: 起案。
