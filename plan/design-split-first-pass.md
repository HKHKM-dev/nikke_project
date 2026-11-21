# 設計書: 1 パス目の長い関数の分割（件の一覧とフレームループ）

- 何のための文書か: 1 パス目の中心の長い関数（件の一覧の `createHolderLists` と、フレームループの `runFirstPassOnce`）と、その周りの長い関数を、動きと速さを変えずに読める単位に分ける変更の、今の構造・分け方の案と得失・段・確かめ方
- 対象: `skills/holders.ts` の `createHolderLists`、`frame/firstPass.ts` の `runFirstPassOnce`。範囲に入れるかを 4 節で決めるもの: `frame/plan.ts` の `planSkillHits`、`sim/engine.ts` の `runSimulation`
- 状態: 完了（4 節の決定。段は 5 節。作りは 9 節）
- 関連: [design-split-long-functions.md](design-split-long-functions.md)（パーサと画面の分割。9 節で、この文書の対象を「速さと結果の一致の確かめ方が別に要る」として外した）、[design-split-skill-holders.md](design-split-skill-holders.md)（衝突を減らすための分割は見送った。4.4 節の案 3 が、移すだけでは `createHolderLists` が短くならないことを書いている）、[design-holder-effects.md](design-holder-effects.md)（件の一覧の元の設計。2.4 節がフレームの中の順番）、[design-first-pass-perf.md](design-first-pass-perf.md)（1 パス目の速さの測り方と、結果の一致の確かめ方）、[design-code-comments.md](design-code-comments.md)（段 3 が同じファイルのコメントを直している）
- 作成日: 2026-11-12
- 調べた時点: main の b7afcabf。行番号はその時点のファイルの行

## 1. 背景と目的

- 1 パス目の中心は 2 つの関数で、どちらも 1 つの閉包の中に、準備・状態・判定・フレームごとの処理を抱える。
  - `createHolderLists` は、件の列・記録・判定を閉包で共有する 1 つの関数。直下の文（宣言）は約 180 で、どれもほかのどれからも見える。
  - `runFirstPassOnce` は、射手・ゲージ・バースト・即時効果など約 10 の仕組みの準備（約 1,000 行）と、それらを 1 フレームずつ進めるループ（約 630 行）を持つ。ループの中で、仕組みごとの処理が手順の順に交互に並ぶ。
- 困ること:
  - 語彙を足すとき、どこに書くか（出どころの準備・発火・判定・登録）と、何が何を読むかを知るのに、関数を通しで読む必要がある。閉包の中では、どの宣言も全部の宣言を読めるので、依存が型にも位置にも出ない。
  - フレームの中の順番（`firstPass.ts` の冒頭の注釈の手順 1〜3）が、630 行のループの中に散り、注釈の手順とコードの位置の対応がつきにくい。
- 目的は、**読む人が層（件の一覧）と手順（フレームループ）の単位で関数を開けるようにすること**。計算の結果（浮動小数の足す順を含む）・エラー文・速さは変えない。

## 2. 今の構造

- `createHolderLists`（約 1,700 行）は、上から 12 のまとまりに分かれる: 1 記録の入れ物と件の列の作り、2 発火の読み（`firesOf`）、3 出どころの準備、4 件の読み（`readItems`・`activeAt`）、5 見る側（stat ごとの見る列・状態の件 `stateTracks`）、6 判定（`holdsAt`）、7 HP・防御力・順位、8 発火（`fireTimed` など）、9 `{ applied }` の配り、10 段ごとの列と前の回の発、11 登録（`endedAt`・`register`）、12 返す物（`HolderLists` の問い合わせ）。
  - 基本は、後のまとまりが前のまとまりを読む。前のまとまりが後のまとまりを読む所（`firesOf` → `endedAt`・`stateWindowFires`・`selfHpAtMostAt`、`stateWindowFires`・`ownStateActive`・`shotCountEveryOf` → `stateTracks`・`readItems`・`activeAt`）は、どれも発火の追跡や問い合わせの中から呼ぶ（準備の間には呼ばない）ので、1 つの閉包の中で成り立っている。
  - 書き換える `let` は 3 つで、どれも 1 つのまとまりの中でだけ読み書きする。共有するのは、記録の列と `Map`（いくつものまとまりが `push` する）と、準備の後は変わらない見る列。
- `runFirstPassOnce`（約 1,400 行）は、仕組みごとの準備（バーストの状態機械・即時効果・射撃の記録とチャージの見張り・件の一覧・射手・ゲージの量・ゲージを溜める効果・蓄積爆破・召喚）の後に、冒頭の注釈の手順の順に仕組みごとの処理を呼ぶループ（0 フレームの頭・1 射手・1b 発のゲージの効果・2 状態機械・3a 出来事を集める・3b 回復・3c 件と即時効果・4 後で数える）が続く。
  - ループの中の `gauge` は、手順 0・1・1b の 7 か所が決まった順に足す。`shotEvents` は手順 1 が書き、1b・3a・3c・4 が読む。書き換える `let`（約 11）は、どれも 1 つの仕組みの準備とループの中の処理だけが読み書きする。
- `planSkillHits` は枠ごとの無名関数（330 行）が、自分の状態の読み口 → 倍率ダメージ → 持続ダメージ → 段の循環を順に作る。`runSimulation` で長いのは、枠ごとの区間の読み手とバーストのヒットの値だけ。

## 3. 分け方

### 3.1 守ること

- **計算の結果が同じ**: 射撃の列・時刻表・件の一覧・倍率ダメージ・ゲージの記録・区間・`TeamResult` が、浮動小数の末尾まで同じ。
  - ゲージの和 `gauge` は、今の順に 1 つずつ足す。分けた関数は `gauge` を受けて足した値を返す（部分和を返して呼ぶ側で足すと、`(g + a) + b` が `g + (a + b)` になり、末尾が変わりうる）。
  - 準備の順（`newTrack` を呼ぶ順 = `tracks` の並び、`TriggerTracker` を作る順）と、フレームの中の登録・発火の順を変えない。分けた作り手と手順の関数は、今の文の順のとおりに呼ぶ。
- **エラーが同じ**: 準備の検査（`RangeError` など）の文と、投げる順を変えない。
- **公開の形が同じ**: `skills/holders.ts` と `frame/firstPass.ts` は今と同じ名前を export する。読む側とテストは変えない。
- **速さを落とさない**（6.3 節）。
- 本体の書き換えは、分けた単位の口（受ける依存・返す物）に合わせる所だけにする。名前の付け替え・重なりのまとめ直しは同じ PR でしない（見直しの直しも、口の整理に限る）。

### 3.2 案

#### 案 A: 層の作り手（推奨）

- 2 節のまとまり（と仕組み）を、`createXxx(deps): Xxx` の作り手の関数にして、別のファイルに置く。作り手の中は今と同じ閉包で、受けた依存を冒頭で分割代入するので、本体の行はほぼそのまま移る。作り手は、後のまとまりが読む関数と値を返す。
- `createHolderLists` は作り手を今の順に呼び、返す物を組むだけになる。`runFirstPassOnce` は作り手を今の順に呼び、ループは手順の関数を今の順に呼ぶだけになる（3.4 節）。
- 前のまとまりが後のまとまりを読む所（2 節）は、後で埋める口（型の付いたオブジェクト `late`）を前の作り手に渡し、後の作り手を作った後に埋める。前の作り手は、発火の時に `late.endedAt(...)` のように読む。
- 得: 本体はほぼ移すだけなので、見直しが口の所に絞れる。`git blame -C`・`git log --follow` で移す前の履歴を辿れる。まとまりごとに、何を読むかが作り手の引数の型に出る。呼び出しは今と同じ閉包の呼び出しなので、速さは変わらない見込み。
- 失: 作り手の引数（依存）の型を書く手間。`late` の口は、埋める前に呼ぶと落ちる（今の閉包の中の、宣言より前の呼び出しと同じ。テストが拾う）。

#### 案 B: 文脈のオブジェクト

- 共有する状態と関数を 1 つのオブジェクトに入れ、各ファイルの関数は `(c, ...) => ...` で受ける。
- 得: 前が後を読む所も同じ形で書ける。関数の置き場所を自由に決められる。
- 失: 本体のほぼ全部の行が書き換わり（約 3,000 行）、見直しの量が大きく、`git blame` も切れる。どの関数が何を読むかは、`c` を受けるだけでは分からない。毎フレームの読みが閉包の変数からオブジェクトの欄に変わり、速さが変わりうる。

#### 案 C: クラス

- 案 B と同じ得失に加え、メソッドをコールバックに渡す所（`TriggerTracker` など）で `this` の束縛に気をつける所が増える。採らない。

#### 案 D: 関数の外を移すだけ

- `holders.ts` の型・件を作る純粋な関数・ループの後の読みを別のファイルに移す（[design-split-skill-holders.md](design-split-skill-holders.md) 4.4 節の案 3）。長い関数そのものは短くならない。
- 案 A の最初の段（5 節の H1）として行う。

### 3.3 件の一覧（`skills/holders/`）

`skills/holders.ts` は今の場所に入口として残し、分けたものを `skills/holders/` に置く（論点 3）。

| ファイル                | 中身（2 節のまとまりの番号）                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `holders/types.ts`      | 型（`HeldTrack`・`HolderHistory`・`HolderLists`・`HolderListsOptions`・出どころの型）                    |
| `holders/items.ts`      | 件を作る純粋な関数                                                                                       |
| `holders/history.ts`    | ループの後に履歴を読む関数                                                                               |
| `holders/records.ts`    | 1                                                                                                        |
| `holders/fires.ts`      | 2                                                                                                        |
| `holders/sources.ts`    | 3。出どころの種類ごとの関数に分け、作り手はそれを順に呼ぶ                                                |
| `holders/read.ts`       | 4                                                                                                        |
| `holders/views.ts`      | 5・7                                                                                                     |
| `holders/conditions.ts` | 6 と、11 のうち `endedAt`・`counterConditionHolds`                                                       |
| `holders/fire.ts`       | 8・9                                                                                                     |
| `holders/register.ts`   | 10 と 11 の残り。`register` は、前の処理・段 1・段 1.5・段 2・デバフ解除と強化の関数に分け、今の順に呼ぶ |
| `holders.ts`（入口）    | `createHolderLists`（作り手を順に呼び、`late` を埋め、返す物を組む）と、今と同じ名前の再公開             |

- 返す物の問い合わせは、`HolderLists` の型の順のまま入口に置く。数行を超える問い合わせは、その層の作り手が返す関数を呼ぶ形にする。
- 作りで表と違えた所は 9.2 節。

### 3.4 1 パス目（`frame/firstPass/`）

`frame/firstPass.ts` は今の場所に入口として残し（`runFirstPass`・`settleLeadShots`・型・`runFirstPassOnce`）、仕組みごとの作り手を `frame/firstPass/` に置く。作り手は、仕組みの準備と、その仕組みのループの中の処理（手順の関数）を一緒に持つ。

| ファイル                    | 準備                               | 手順の関数                                                                                       |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `firstPass/burst.ts`        | バーストの状態機械                 | 2（状態機械を進める）                                                                            |
| `firstPass/shooters.ts`     | 射撃の記録とチャージの見張り・射手 | 1。枠 1 つの処理を、使用武器の変更・撃たない区間とハイド・止まり・進める・発の記録の関数に分ける |
| `firstPass/gauge.ts`        | ゲージの量                         | 0（時間で変わるゲージ速度）                                                                      |
| `firstPass/gaugeEffects.ts` | ゲージを溜める効果                 | 0（時間のゲージ）・1b・3b（持続ダメージの付け直し）・4                                           |
| `firstPass/accumulate.ts`   | 蓄積爆破                           | 0・1b                                                                                            |
| `firstPass/summons.ts`      | 召喚                               | 4                                                                                                |
| `firstPass/instants.ts`     | 即時効果                           | 1b（ゲージのチャージ）・3b（回復）・3c（即時効果）                                               |
| `firstPass/frameEvents.ts`  | —                                  | 3a（出来事を集めて `ev` を作る。発動・窓・満タンの読み位置を持つ）                               |

- ループは、手順の関数を今の順に呼ぶ形になる。`gauge` を足す所の数と順は、今のコード（手順 0・1・1b の 7 か所）に合わせる。
- 手順の関数どうしの受け渡し（`shotEvents`・`ev`・予約の `Map`）は、作り手が作って渡す。
- 作り手が共通に受けるもの（入力・常時の値・件の一覧・射撃の記録・時刻表の読み口・発の飛ぶ時間・このフレームの射撃）は `FirstPassBase`（`base.ts`）にまとめる。
- 作りで表と違えた所は 9.3 節・9.4 節。

### 3.5 `planSkillHits`・`runSimulation`（論点 2 で入れるなら）

- `planSkillHits`: 枠ごとの無名関数を同じファイルの関数にし、中を、自分の状態の読み口・倍率ダメージ（`damageEffectHits`）・持続ダメージ（`dotHits`）・段の循環（`cycleHits`）に分ける。
- `runSimulation`: 枠ごとの区間の読み手を作る所を `createRunner`、バーストのヒットの値を別の関数にする（同じファイル）。
- どちらもファイルは分けない。

## 4. 決めたこと（2026-11-12、オーナー）

論点を推奨の案で出し、オーナーがすべて推奨のとおり承認した。

| #   | 論点               | 決定                                                                                                                                                | ほかの案                                                              |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | 分け方             | 案 A（層の作り手。3.2 節）                                                                                                                          | 案 B（文脈のオブジェクト）                                            |
| 2   | 範囲               | `createHolderLists`・`runFirstPassOnce` と、`planSkillHits`・`runSimulation`（3.5 節。同じファイルの中で関数に分けるだけ）                          | `createHolderLists`・`runFirstPassOnce` だけ                          |
| 3   | ファイルの置き場   | `skills/holders/`・`frame/firstPass/` に分け、今のファイルを入口に残す（import は変えない）                                                         | 同じファイルの中で関数に分けるだけ（ファイルは 3,000 行を超えたまま） |
| 4   | 段と PR            | 5 節の 5 段で、1 段 1 PR。関数の外を移すだけの段（H1）を先に別の PR にする                                                                          | `holders` と `firstPass` で 1 PR ずつ（PR が大きく、見直しが重い）    |
| 5   | 始める時           | コメントの段 3（[design-code-comments.md](design-code-comments.md)。同じ 4 ファイルのコメントを直している）のマージを待ってから                     | すぐに始め、段 3 の直しは移した先に手で写す                           |
| 6   | 速さの許し         | 6.3 節の測り方で、どの編成も段の後 ÷ main の中央値が 1.05 以下。超えたら原因を直してから出す                                                        | 測らない（案 A は閉包のままなので）                                   |
| 7   | 長さの lint の規則 | 入れない（`renderSkillCatalog` など範囲の外に長い関数が残る。[design-split-long-functions.md](design-split-long-functions.md) 4 節の論点 6 と同じ） | 全部の段の後に警告で入れる                                            |

## 5. 段

| 段  | 中身                                                                                                |
| --- | --------------------------------------------------------------------------------------------------- |
| H1  | `holders.ts` の関数の外を `holders/types.ts`・`items.ts`・`history.ts` に移す（本体は変えない）     |
| H2  | `createHolderLists` を層の作り手に分ける（3.3 節の残り）                                            |
| F1  | `runFirstPassOnce` のゲージの系（`gauge`・`gaugeEffects`・`accumulate`・`summons`）を作り手に分ける |
| F2  | `runFirstPassOnce` の残り（`burst`・`shooters`・`instants`・`frameEvents`）とループの形             |
| S   | `planSkillHits`・`runSimulation`                                                                    |

- H と F は独立（`firstPass.ts` は `HolderLists` の型と問い合わせだけを読み、どちらも変えない）。並行するスキルの PR との衝突を小さくするため、1 段ずつ出し、マージしてから次の段に入る。
- 見直しは、H1・H2 は `skills/` だけだが 1 パス目の中心なので、どの段も `high` にする。

## 6. 確かめ方

### 6.1 結果の一致（どの段も）

- `npm test` が全件通る。期待値の書き換えは無い。
- `npm run records:check` の後、生成物に差分が無い。
- `npm run records:minimal -- --all` の後、`records/minimal/sensitivity.json` に差分が無い（感度の使い回しの鍵がモデルのコードを含まないので `--all` で回す。[design-first-pass-perf.md](design-first-pass-perf.md) 4 節）。
- 残差: `npm run records:residual -- <全部の観測値の ID>` の出力が、main と段の後で一致する。
- 使い捨ての比べ: main（worktree）と段の後で、4 編成（[design-unify-sim-calc.md](design-unify-sim-calc.md) 3.1 節）と、比べる指定のある全部の観測値の入力について、`runSimulation`（`trace` あり）の `SimResult` と `TeamResult` の JSON が文字列で一致する。脚本はコミットせず、結果を PR の本文に書く。

### 6.2 エラーの一致

- 準備の検査の `throw` の文の一覧（数と文）が main と同じで、作り手を今の順に呼んでいる（2 つ以上の検査に当たる入力で、最初に投げる検査が変わらない）。`toThrow` のテストが通る。

### 6.3 速さ

- 編成ごとに、main と段の後を別のプロセスで交互に 6 回ずつ起こし、1 回のプロセスで `planTeamRun` を 60 回回した平均の中央値を比べる（段 F2 からのオーナーの決定）。同じプロセスに 2 つの版を読み込むと、互いの最適化を乱して段の後が遅く出る（9.4 節）。画面と CLI は 1 つの版だけを読み込む。
- 段 F1 までは [design-first-pass-perf.md](design-first-pass-perf.md) 1.1 節と同じく、同じプロセスで交互に回し、1 回ごとに GC を回して（`node --expose-gc`）測った。

### 6.4 移したことの確かめ

- H1: 移した宣言の本文が、移す前と文字単位で同じ（`git diff --color-moved` と、構文木で宣言ごとに並べて比べる使い捨ての脚本）。
- H2〜S: 口に合わせて変えた行（作り手の頭の分割代入・返す物・`late`）のほかは本文が同じことを、`git diff --color-moved=dimmed-zebra` で見る。

## 7. リスク

- **`late` の口を埋める前に呼ぶ**: 今の閉包の中で宣言より前に呼ぶのと同じく落ちる。テストで拾う。
- **準備の順が変わる**: 作り手の呼ぶ順を変えると、`tracks` の並び（同じフレームの登録の順・値の小片の同点の並び）と、検査の投げる順が変わる。6.1 節の JSON の一致と 6.2 節で拾う。作り手は今の文の順に呼ぶ。
- **ゲージの和の順**: 3.1 節。6.1 節の JSON の一致（ゲージの記録・時刻表）で拾う。
- **並行するスキルの PR との衝突**: 移した宣言を書き換えた PR は、移した先へ手で写し直す。1 段ずつ短く出す。分けた後は、語彙を足す PR が層ごとのファイルに分かれる。
- **速さ**: 案 A は閉包の呼び出しのままで、増えるのはフレームごと・仕組みごとの関数の呼び出し（1 フレームに十数回）だけなので、変わらない見込み。6.3 節で測る。
- **履歴を辿りにくくなる**: `git log -L`・素の `git blame` は移した所で切れる。`git blame -C -C`・`git log --follow` で辿る（移すだけの段 H1 を別にするのはそのため）。

## 8. 扱わないもの

- 振る舞いの変更（モデル・語彙・エラー文）と、速くする変更。
- 名前の付け替えと、重なりのまとめ直し。見つけたものは経過に書き、別の PR の候補にする。
- テストの分割。
- 範囲の外の長い関数（`skills/catalogDoc.ts` の `renderSkillCatalog`・`records/observations/teamInput.ts` の `buildTeamInput`・`skills/parse/` の残り。パーサは [design-split-long-functions.md](design-split-long-functions.md) の段 P2）。

## 9. 作り

### 9.1 段 H1（2026-11-12）

- `holders.ts` の関数の外を、型と小さな公開の関数を `holders/types.ts`、件を作る純粋な関数（段の印と状態の付与の組の決め方を含む）を `holders/items.ts`、ループの後に履歴を読む関数を `holders/history.ts` に移した。`holders.ts` には `createHolderLists` を残し、前と同じ名前を再公開する。ほかのファイルから読まれる内部の宣言にだけ `export` を付けた。
- 状態の付与の組の作り方と段の印は、出どころの準備・見る側・履歴の読みが共有するので `holders/items.ts` に置き、段 H2 の層のファイルはここから import する（二度移さない）。

### 9.2 段 H2（2026-11-12）

- `createHolderLists` の直下の文を、8 つの層の作り手（`holders/records.ts`・`fires.ts`・`sources.ts`・`read.ts`・`views.ts`・`conditions.ts`・`fire.ts`・`register.ts`）に写した。作り手は前の層の名前を引数の所で分割代入して受け、後の層と入口が読む名前を返す。入口の `createHolderLists` は、前の層までを積んだオブジェクトを次の作り手に渡しながら順に呼び、`late` を埋め、問い合わせを組む。文の本文は、後の層を読む所を `late.X` にしたほかは変えていない。
- 層は 3.3 節の表と次の所が違う。
  - 見る側（`views.ts`）に HP・防御力・順位を入れて、判定（`conditions.ts`）より前に作る（発火の文脈の判定が HP の割合を読むため）。
  - 自分に付いた記録（`ownApplied`・`sinceFires`・`stateWindowFires`）は、出どころの準備（`sources.ts`）に置く。`fires.ts` に移すと、`stateWindowFires` が読む状態の件の列（`stateTracks`。件の列が出そろってから作る）を後で読むことになり、後で埋める口の数は変わらないため。`stateTracks` は `sources.ts` の末尾で作る。
  - 条件で落とした記録（`skipGrant`・`skipEffect`）は、{ applied } の出どころが読むので `fire.ts` に置く。`appliedFrom` は登録だけが読み書きするので `register.ts` に置く。
  - 動かした文は、どれも副作用の無い宣言（関数・空の入れ物・件の列から作る索引）で、文の順の入れ替えで準備の結果は変わらない。
- 前の層が後の層を読む口（`LateReaders`）は 6 つで、受けるのは `fires.ts` と `sources.ts` だけ: `endedAt`・`stateWindowFires`・`selfHpAtMostAt`（発火の読み → 判定・出どころ・見る側）、`selfHpRatioAt`・`readItems`・`activeAt`（出どころ → 見る側・件の読み）。
- `register`（1 フレームの登録）は、手順の関数（`registerEnds`・`registerStage1`・`registerEnemyStates`・`registerStage15`・`registerStage2`・`registerRemoveDebuffs`・`registerAmplifiers`）に分け、手順が共有する値（出来事・フレーム・戦闘開始時か・きっかけの絞り込み・{ applied } の記録の始まり）を 1 つのオブジェクトで渡す。
- 出どころの準備を種類ごとの関数に分けることと、数行を超える問い合わせを作り手に移すことは、本文の書き換えになるので見送り、11.1 節の #1・#2 で行った。

### 9.3 段 F1（2026-11-12）

- `runFirstPassOnce` のゲージの系の準備の文を、作り手 `frame/firstPass/gauge.ts`（ゲージの量）・`gaugeEffects.ts`（射撃の回数で溜まるゲージの追跡 `createShotGaugeTrackers` と、ゲージを溜める効果 `createGaugeEffects`）・`shotPauses.ts`（射撃の止まり）・`accumulate.ts`（蓄積爆破）・`summons.ts`（召喚）に写した。作り手が共通に受けるものは `FirstPassBase`（`base.ts`）にまとめ、入口は段 H2 と同じく前の作り手までを積んだオブジェクトを渡す。準備の中の検査が投げる順を変えないため、作り手は元の文の順に呼ぶ（ゲージを溜める効果を射撃の止まりの前後で 2 つの作り手に分けたのはこのため）。
- ループの中のゲージの系のひと続きは、作り手の中の手順の関数にした。ゲージを足す関数は、ループの `gauge` を受けて足した値を返す（3.1 節）。
- 共通の入力にするため、副作用の無い宣言（`flights`・`shotFlightAt`・`shotEvents`）を作り手より前に置いた。
- 3.4 節の `shooters.ts` は作り手 1 つにならない。射撃の記録とチャージの見張りは件の一覧より前に要り、射手の手順はゲージの量とゲージを溜める効果を読むので、それより後に要る。記録の作り手と射手の作り手の 2 つに分ける（9.4 節）。

### 9.4 段 F2（2026-11-12）

- `runFirstPassOnce` の残りの準備の文とループの中のひと続きを、作り手に写した。3.4 節の表と次の所が違う（どれも、準備の文の順（検査が投げる順）と、作り手の間で状態を共有しないことを守るため）。
  - `burst.ts`: 時刻表を作る `createBurstSchedule`（件の一覧の前）と、状態機械を進める手順・狙えない窓・発動の延長の `createBurstStep`（ゲージの系の後）の 2 つ。
  - `instants.ts`: 即時効果の出どころの `createInstantSources`（件の一覧の前。件の一覧は発火の時に `InstantLate` から読む）と、ゲージのチャージ・ほかの即時効果を当てる手順の `createInstants` の 2 つ。
  - `shotLogs.ts`: 射撃の記録とチャージの見張り（件の一覧の前に要る。9.3 節）。
  - `shooters.ts`: 射手の実効値と状態の `createShooterStates` と、枠の射手を進める手順の `createShooters` の 2 つ。
  - `frameEvents.ts`: 出来事を集める手順と、回復を当てる手順（3.4 節では即時効果の 3b）。回復の出来事の印は、出来事を集める時と回復を当てる時の両方が書き換えるので、同じ作り手に置いた。
- 共通の入力（`FirstPassBase`）に、入力を整えた値（`model`・`untargetable`・`burstModel`）と当てた即時効果の記録（`instants`）を足した。入口は、件の一覧の後に共通の入力を組み、前の作り手までを積んだオブジェクトを渡す。件の一覧を後で読む口はゲッター（`listsOf`。作る前に読めば宣言より前の読みで落ちる）にした。
- ループは手順の関数を順に呼ぶ形になった（`blockedAt` → ゲージ → `stepShooters` → ゲージ → `stepBurst` → 出来事を追う編成だけ `collectFrameEvents`・`applyHeals`・`registerFrame`・`applyInstants` → 手順の後に数える 5 つ）。出来事を追わない編成の `continue` は、手順 3 を if で囲む形にした（数える 5 つの呼び出しが 1 か所になる）。
- 速さ: 同じプロセスで main と交互に測ると、小さい編成で 1.05 を超えた（main と段の後を読み込む順を入れ替えても、段の後のほうが遅い）。編成ごとに別のプロセスで交互に回すと段の後のほうが速く、どの編成も 1.05 以下だった。これを受けて 6.3 節の測り方を変えた。

### 9.5 段 S（2026-11-12）

- `planSkillHits`（`frame/plan.ts`）: 枠ごとの無名関数の本文を、同じファイルの `slotReadersOf`（枠の読み口・ヒットを積む `push`・間隔の変更の読み口と、同じ発動の順のバーストの検査）・`damageEffectHits`・`dotHits`・`cycleHits` に写した。枠をまたいで共有するものと引数は `SkillHitsContext` で渡す。3.5 節の自分の状態の読み口は、`push` と間隔の変更の読み口と一緒に `slotReadersOf` にした（3 つが同じ枠の局所を読むため）。
- `runSimulation`（`sim/engine.ts`）: 枠の区間ごとの読み手を `createRunner` に、バーストのヒットの値を `burstHitDamageOf` に写した（同じファイル）。

## 11. 見送った整理（課題）

各段の見直し（9 節）で、本文の書き換えか受け口の変更になるので見送った指摘。課題は `records/backlog/split-first-pass-followups.json`。どれも振る舞いを変えない整理で、1 つ直すごとに 6.1 節の一致と 6.3 節の速さで確かめる。

### 11.1 直す候補

| #   | 場所                                              | 中身                                                                                    |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `skills/holders/sources.ts`                       | 出どころの準備を、出どころの種類ごとの関数に分ける（3.3 節の表のとおり）                |
| 2   | `skills/holders.ts`                               | 数行を超える問い合わせを、その層の作り手が返す関数にする（3.3 節）                      |
| 3   | `skills/holders/register.ts`                      | `registerCounters` を、ほかの手順と同じく手順のオブジェクト（`FrameStep`）で呼ぶ        |
| 4   | `frame/firstPass/gaugeEffects.ts`                 | 4 つの追跡の `energy` の欄と周期のゲージの式を、`gauge.ts` の `hitGaugeEnergy` に寄せる |
| 5   | `frame/firstPass/gaugeEffects.ts`・`firstPass.ts` | `cooldownTrackers` を入口で写すのをやめ、作り手が記録の形で返す                         |
| 6   | `frame/firstPass/gauge.ts`                        | 前の形との比べのコメントを、いまの振る舞いの説明に直す                                  |
| 7   | `frame/firstPass/burst.ts`                        | `blockedAt` の一時の名前を外す                                                          |
| 8   | `frame/plan.ts`                                   | `push` が積んだヒットを返す形にする                                                     |
| 9   | `frame/plan.ts`                                   | `selfStateHolds`・`counterAt` と `self` の二重の受け渡しを 1 つにする                   |
| 10  | `frame/plan.ts`                                   | `slotReadersOf` から `push` を出す。`SlotReaders` の型を名前で書く                      |
| 11  | `frame/plan.ts`                                   | `planSkillHits` が引数をオブジェクトで受ける                                            |
| 12  | `sim/engine.ts`・`frame/plan.ts`                  | `computeTriggerDamage` の入力を組む所（3 か所）を共通の関数にまとめる                   |

### 11.2 直さない見込み（理由つき。オーナーの判断で 11.1 に移す）

| #   | 中身                                                                                                               | 見送った理由                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 13  | 作り手の引数の型を、前の層の型の交わりから `Pick` で読む名前だけにする                                             | 読む名前は分割代入の行に出ている。`Pick` にすると同じ一覧が 2 か所になる |
| 14  | `LateReaders` を後の層の型から導く                                                                                 | 型が循環する。ずれは入口の `satisfies` が拾う                            |
| 15  | `late` を埋める前に読んだ時の守り                                                                                  | 今と同じく、実行時に落ちる（7 節）                                       |
| 16  | 入口で積んだオブジェクトを層ごとに写し直すのをやめる                                                               | 作る時に 1 回だけで、速さに出ない                                        |
| 17  | `skills/holders/types.ts` に入っている小さな関数を別の名前のファイルに移す（`skills/types.ts` と名前が紛らわしい） | 3.3 節の決定どおりの置き場所                                             |

## 10. 経過

- 2026-11-12: 起案。オーナーが 4 節の論点をすべて推奨の案で承認した。
- 2026-11-12: 段 H1・H2・F1 を実装した（9.1〜9.3 節）。
- 2026-11-12: 段 F2 を実装した（9.4 節）。オーナーが、段 F2 からは別のプロセスで測った値で論点 6 の幅を見ると決めた（6.3 節）。
- 2026-11-12: 段 S を実装した（9.5 節）。見送った整理を 11 節にまとめ、課題にした。
- 2026-11-14: 11.1 節の #1〜#12 を片づけた。
