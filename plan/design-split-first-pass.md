# 設計書: 1 パス目の長い関数の分割（件の一覧とフレームループ）

- 何のための文書か: 1 パス目の中心の長い関数（件の一覧の `createHolderLists` と、フレームループの `runFirstPassOnce`）と、その周りの長い関数を、動きと速さを変えずに読める単位に分ける変更の、今の構造・分け方の案と得失・段・確かめ方
- 対象: `skills/holders.ts` の `createHolderLists`、`frame/firstPass.ts` の `runFirstPassOnce`。範囲に入れるかを 4 節で決めるもの: `frame/plan.ts` の `planSkillHits`、`sim/engine.ts` の `runSimulation`
- 状態: 進行中（4 節の決定。段は 5 節）
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

行数は空行とコメントを除いたもの（ESLint の `max-lines-per-function` で測った）。

| 関数                                       | 行    | ファイル全体の行 |
| ------------------------------------------ | ----- | ---------------- |
| `skills/holders.ts` の `createHolderLists` | 1,675 | 3,588            |
| `frame/firstPass.ts` の `runFirstPassOnce` | 1,394 | 2,082            |
| `frame/plan.ts` の `planSkillHits`         | 369   | 1,024            |
| `sim/engine.ts` の `runSimulation`         | 257   | 648              |

`createHolderLists` の中の `register`（209 行）と、`planSkillHits` の中の枠ごとの無名関数（330 行）も、それだけで長い。

### 2.1 `createHolderLists`

`holders.ts` は、型と公開の小さな関数（144〜611 行）、件を作る純粋な関数（612〜1209 行。`stateItems`・`timedItems`・`buildTrackItems` など）、`createHolderLists`（1210〜3242 行）、ループの後に履歴を読む関数（3243〜3588 行。`itemsOf`・`valuePiecesOf`・`amplify`・`buffTimelineOf`）の順に並ぶ。

`createHolderLists` の中は、上から次のまとまりに分かれる。

| #   | まとまり                   | 行         | 中身                                                                                                                                                                                                                 |
| --- | -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 記録の入れ物と件の列の作り | 1211〜1274 | `tracks`・`applications`・`conditionSkips`・`rankings`・`heals`・`amplifiers` などの列、`newTrack`・`closeTrack`・`consumeTrack`                                                                                     |
| 2   | 発火の読み                 | 1275〜1357 | `firesOf`（きっかけ → `TriggerTracker`）と、自分の HP の割合のきっかけの状態                                                                                                                                         |
| 3   | 出どころの準備             | 1358〜1749 | 持続バフ・状態の付与の組（`stateGroups`）・HP の while・循環の間隔・解除・延長・デバフ解除・スタック量・自分に付いた記録（`ownApplied`・`sinceFires`・`stateWindowFires`）・カウンタ・消費・吸収回復・敵の状態と消去 |
| 4   | 件の読み                   | 1750〜1894 | 上限の▲（`capRaisers`）・`updateLengths`・`readItems`・`activeAt`・while の件・カウンタの while の件                                                                                                                 |
| 5   | 見る側                     | 1895〜2046 | stat ごとの見る列（`viewsOf`・`sumAt`。射撃・ダメージ・当たり・射程・会心・ペレット・条件・順位・ゲージ・CT）、状態の件（`stateTracks`・`stackLevelAt`・`enemyStateAt`）                                             |
| 6   | 判定                       | 2047〜2129 | `holdsAt`（条件）・`fireContextHolds`                                                                                                                                                                                |
| 7   | HP・防御力・順位           | 2130〜2267 | 最大 HP▲・現在の HP▼・HP の割合・最終防御力・最終攻撃力・`rankContext`                                                                                                                                               |
| 8   | 発火                       | 2268〜2510 | `fireTimed`・`fireGrant`・`switchGroup`・`fireRemove`・`fireExtend`・`fireRemoveDebuff`・`fireStackChange`                                                                                                           |
| 9   | `{ applied }` の配り       | 2511〜2626 | `appliedSources`・`dispatchApplied`・`recordRanking`                                                                                                                                                                 |
| 10  | 段ごとの列と前の回の発     | 2627〜2692 | `stage1Timed` など段ごとの出どころの列、`leads`、`skipGrant`・`skipEffect`、強化の発火                                                                                                                               |
| 11  | 登録                       | 2693〜3009 | `endedAt`・`counterConditionHolds`・`registerCounters`・`register`（1 フレームの登録。前の処理 → 段 1 → 段 1.5 → 段 2 → デバフ解除 → 強化 → カウンタ）                                                               |
| 12  | 返す物                     | 3010〜3242 | `firingBuffs`・`selfStackCountAt` と、`HolderLists` の問い合わせ（約 40）                                                                                                                                            |

依存（構文木で、まとまりの間の名前の参照を拾った）:

- 基本は、後のまとまりが前のまとまりを読む。
- 前のまとまりが後のまとまりを読むのは次の 5 か所で、どれも発火の追跡や問い合わせの中から呼ぶ（準備の間には呼ばない）ので、今は 1 つの閉包の中で成り立っている。
  - `firesOf`（2）→ `endedAt`（11）・`stateWindowFires`（3）・`selfHpAtMostAt`（7）
  - `stateWindowFires`（3）→ `stateTracks`（5）・`readItems`（4）
  - `ownStateActive`（3）→ `stateTracks`（5）・`activeAt`（4）
  - `shotCountEveryOf`（3）→ `readItems`（4）
- 書き換える `let` は 3 つ（`hpAtLeastFrame`・`debuffTracks`・`appliedFrom`）で、どれも 1 つのまとまりの中でだけ読み書きする。
- 共有するのは、記録の列と `Map`（`tracks` など。いくつものまとまりが `push` する）と、準備の後は変わらない見る列。

### 2.2 `runFirstPassOnce`

ループの前は、仕組みごとの準備が並ぶ。

| 仕組み                       | 行                             | 中身                                                                                                            |
| ---------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| バーストの状態機械           | 411〜436                       | `controller`・`fixed`（固定サイクル）・発動と窓の読み口                                                         |
| 即時効果                     | 438〜516、1376〜1424           | 出どころ（回復・遮蔽物 HP 回復・ゲージのチャージ・発動の延長・ほか）、予約した回復・延長                        |
| 射撃の記録とチャージの見張り | 517〜592                       | `logs`・`chargeWatches`                                                                                         |
| 件の一覧                     | 593〜604                       | `createHolderLists` を呼ぶ                                                                                      |
| 射手                         | 606〜632、888〜904、1425〜1428 | 実効値（`paramsAt`）・射手の状態・使用武器の変更・射撃の止まり・枠の撃たない区間                                |
| ゲージの量                   | 634〜789                       | 枠ごとのゲージ速度・発のゲージ・命中・ペレット・障害物                                                          |
| ゲージを溜める効果           | 790〜1125、1326〜1368          | 段の循環・倍率ダメージのゲージ・射撃の回数のゲージ・持続ダメージのゲージ・味方のゲージ・CT の時間・時間のゲージ |
| 蓄積爆破                     | 1126〜1200                     | `accumulators`・`stepAccumulator`                                                                               |
| 召喚                         | 1202〜1288                     | `summonTrackers`・`countSummons`                                                                                |

ループ（1430〜2060 行）は、冒頭の注釈の手順の順に、仕組みごとの処理を呼ぶ。

| 手順                 | 行         | 中身                                                                                                                                    |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0. フレームの頭      | 1431〜1443 | 狙えない窓・時間で変わるゲージ速度・時間のゲージ・予約したゲージ・蓄積爆破の頭                                                          |
| 1. 射手              | 1444〜1587 | 枠ごとに、使用武器の変更・撃たない区間とハイド・止まり・射手を進める・発の記録（命中・会心・ペレット・ゲージ）。1 つの無名関数で 144 行 |
| 1b. 発のゲージの効果 | 1588〜1701 | 蓄積爆破・倍率ダメージのゲージ・射撃の回数のゲージ・持続ダメージのゲージ・ゲージのチャージ・味方のゲージ                                |
| 2. 状態機械          | 1702〜1748 | ゲージを足して進める。出来事を追わない編成はここで次のフレームへ                                                                        |
| 3a. 出来事を集める   | 1749〜1872 | 発動・効果の発火・ヒット・段・フルバーストの窓・ゲージの満タン・回復・フルスタック・撃ち切り・リロード・溜め・遮蔽物 → `ev`             |
| 3b. 回復             | 1873〜1924 | 持続ダメージの付け直しのゲージ・回復・遮蔽物 HP 回復                                                                                    |
| 3c. 件と即時効果     | 1925〜2054 | `lists.registerFrame(ev)` と、即時効果（128 行）                                                                                        |
| 4. 後で数える        | 2055〜2059 | 段の循環・射撃の止まり・倍率ダメージのゲージ・CT の時間・召喚                                                                           |

共有する状態:

- `gauge`（ループの中の局所の数）: 手順 0・1・1b の 7 か所が、決まった順に足す。
- `shotEvents`: 手順 1 が書き、1b・3a・3c・4 が読む。
- 書き換える `let`（`controller`・`allyAddLanding`・`pendingExtensions`・`healedDirty`・`nextActivation` など 11）は、どれも 1 つの仕組みの準備とループの中の処理だけが読み書きする。

### 2.3 `planSkillHits`・`runSimulation`

- `planSkillHits`: 敵の状態の区間を作った後、枠ごとの無名関数（330 行）が、自分の状態の読み口 → 倍率ダメージ（約 130 行）→ 持続ダメージ（約 90 行）→ 段の循環を順に作る。
- `runSimulation`: 上から順の手順で、長いのは枠ごとの区間の読み手（`runners`。103 行）と、バーストのヒットの値（`burstHitDamages`。47 行）だけ。

## 3. 分け方

### 3.1 守ること

- **計算の結果が同じ**: 射撃の列・時刻表・件の一覧・倍率ダメージ・ゲージの記録・区間・`TeamResult` が、浮動小数の末尾まで同じ。
  - ゲージの和 `gauge` は、今の順に 1 つずつ足す。分けた関数は `gauge` を受けて足した値を返す（部分和を返して呼ぶ側で足すと、`(g + a) + b` が `g + (a + b)` になり、末尾が変わりうる）。
  - 準備の順（`newTrack` を呼ぶ順 = `tracks` の並び、`TriggerTracker` を作る順）と、フレームの中の登録・発火の順を変えない。分けた作り手と手順の関数は、今の文の順のとおりに呼ぶ。
- **エラーが同じ**: 準備の検査（`RangeError` など。2 つのファイルの `throw` は計 27）の文と、投げる順を変えない。
- **公開の形が同じ**: `skills/holders.ts` と `frame/firstPass.ts` は今と同じ名前を export する。読む側（`holders.ts` を import する約 70 のファイル、`firstPass.ts` の約 10）とテストは変えない。
- **速さを落とさない**（6.3 節）。
- 本体の書き換えは、分けた単位の口（受ける依存・返す物）に合わせる所だけにする。名前の付け替え・重なりのまとめ直しは同じ PR でしない（見直しの直しも、口の整理に限る）。

### 3.2 案

#### 案 A: 層の作り手（推奨）

- 2.1 節のまとまり（と 2.2 節の仕組み）を、`createXxx(deps): Xxx` の作り手の関数にして、別のファイルに置く。作り手の中は今と同じ閉包で、受けた依存を冒頭で分割代入するので、本体の行はほぼそのまま移る。作り手は、後のまとまりが読む関数と値を返す。
- `createHolderLists` は作り手を今の順に呼び、返す物を組むだけになる。`runFirstPassOnce` は作り手を今の順に呼び、ループは手順の関数を今の順に呼ぶだけになる（3.4 節）。
- 前のまとまりが後のまとまりを読む 5 か所（2.1 節）は、後で埋める口（型の付いたオブジェクト `late`）を前の作り手に渡し、後の作り手を作った後に埋める。前の作り手は、発火の時に `late.endedAt(...)` のように読む。
- 得:
  - 本体はほぼ移すだけなので、見直しが口の所に絞れる。`git blame -C`・`git log --follow` で移す前の履歴を辿れる。
  - まとまりごとに、何を読むかが作り手の引数の型に出る。
  - 呼び出しは今と同じ閉包の呼び出しなので、速さは変わらない見込み。
- 失:
  - 作り手の引数（依存）の型を書く手間。依存の多い作り手（登録・返す物）は引数が長くなる。
  - `late` の口は、埋める前に呼ぶと落ちる（今の閉包の中の、宣言より前の呼び出しと同じ。テストが拾う）。

#### 案 B: 文脈のオブジェクト

- 共有する状態と関数を 1 つのオブジェクト（`HolderContext`・`FirstPassState`）に入れ、各ファイルの関数は `(c, ...) => ...` で受ける。
- 得: 前が後を読む所も同じ形で書ける。関数の置き場所を自由に決められる。
- 失:
  - 本体のほぼ全部の行が書き換わる（`frames` → `c.frames`、`fireTimed(src, …)` → `fireTimed(c, src, …)`）。約 3,000 行の書き換えになり、見直しの量が大きく、`git blame` も切れる。
  - どの関数が何を読むかは、`c` を受けるだけでは分からない（今の閉包と同じ）。
  - 毎フレームの読みが、閉包の変数から、百を超える欄を持つオブジェクトの欄に変わり、速さが変わりうる（測るまで分からない）。

#### 案 C: クラス

- 案 B と同じ得失に加え、メソッドをコールバックに渡す所（`TriggerTracker` など）で `this` の束縛に気をつける所が増える。採らない。

#### 案 D: 関数の外を移すだけ

- `holders.ts` の型・件を作る純粋な関数・ループの後の読みを別のファイルに移す（[design-split-skill-holders.md](design-split-skill-holders.md) 4.4 節の案 3）。`holders.ts` は約 1,500 行短くなるが、長い関数そのものは短くならない。
- 案 A の最初の段（5 節の H1）として行う。

| 案  | 長い関数                              | 本体の変更           | 依存の見え方     | 速さ             |
| --- | ------------------------------------- | -------------------- | ---------------- | ---------------- |
| A   | 作り手を呼ぶだけ（200〜300 行）になる | 移すだけ（口を除く） | 作り手の引数の型 | 変わらない見込み |
| B   | 同じ                                  | ほぼ全部の行         | 見えない         | 測るまで不明     |
| C   | 同じ                                  | ほぼ全部の行         | 見えない         | 測るまで不明     |
| D   | 変わらない                            | 移すだけ             | 今のまま         | 変わらない       |

### 3.3 件の一覧（`skills/holders/`）

`skills/holders.ts` は今の場所に入口として残し、分けたものを `skills/holders/` に置く（論点 3）。見込みの行は、コメントを含むファイルの行。

| ファイル                | 中身（2.1 節の #）                                                                                       | 見込みの行 |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `holders/types.ts`      | 型（`HeldTrack`・`HolderHistory`・`HolderLists`・`HolderListsOptions`・出どころの型）                    | 470        |
| `holders/items.ts`      | 件を作る純粋な関数                                                                                       | 600        |
| `holders/history.ts`    | ループの後に履歴を読む関数                                                                               | 350        |
| `holders/records.ts`    | 1                                                                                                        | 70         |
| `holders/fires.ts`      | 2 と、3 のうち自分に付いた記録（`ownApplied`・`sinceFires`・`stateWindowFires`）                         | 170        |
| `holders/sources.ts`    | 3 の残り。出どころの種類ごとの関数に分け、作り手はそれを順に呼ぶ                                         | 330        |
| `holders/read.ts`       | 4                                                                                                        | 150        |
| `holders/views.ts`      | 5・7                                                                                                     | 300        |
| `holders/conditions.ts` | 6 と、11 のうち `endedAt`・`counterConditionHolds`                                                       | 130        |
| `holders/fire.ts`       | 8・9                                                                                                     | 370        |
| `holders/register.ts`   | 10 と 11 の残り。`register` は、前の処理・段 1・段 1.5・段 2・デバフ解除と強化の関数に分け、今の順に呼ぶ | 370        |
| `holders.ts`（入口）    | `createHolderLists`（作り手を順に呼び、`late` を埋め、返す物を組む）と、今と同じ名前の再公開             | 300        |

- 返す物の問い合わせは、`HolderLists` の型の順のまま入口に置く。数行を超える問い合わせ（`registerFrame`・`applyHeal`・`damageBuffsAt`・`consumeFullStacks` など）は、その層の作り手が返す関数を呼ぶ形にする。

### 3.4 1 パス目（`frame/firstPass/`）

`frame/firstPass.ts` は今の場所に入口として残し（`runFirstPass`・`settleLeadShots`・型・`runFirstPassOnce`）、仕組みごとの作り手を `frame/firstPass/` に置く。作り手は、2.2 節の仕組みの準備と、その仕組みのループの中の処理（手順の関数）を一緒に持つ。

| ファイル                    | 準備（2.2 節）                     | 手順の関数                                                                                       |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `firstPass/burst.ts`        | バーストの状態機械                 | 2（状態機械を進める）                                                                            |
| `firstPass/shooters.ts`     | 射撃の記録とチャージの見張り・射手 | 1。枠 1 つの処理を、使用武器の変更・撃たない区間とハイド・止まり・進める・発の記録の関数に分ける |
| `firstPass/gauge.ts`        | ゲージの量                         | 0（時間で変わるゲージ速度）                                                                      |
| `firstPass/gaugeEffects.ts` | ゲージを溜める効果                 | 0（時間のゲージ）・1b・3b（持続ダメージの付け直し）・4                                           |
| `firstPass/accumulate.ts`   | 蓄積爆破                           | 0・1b                                                                                            |
| `firstPass/summons.ts`      | 召喚                               | 4                                                                                                |
| `firstPass/instants.ts`     | 即時効果                           | 1b（ゲージのチャージ）・3b（回復）・3c（即時効果）                                               |
| `firstPass/frameEvents.ts`  | —                                  | 3a（出来事を集めて `ev` を作る。発動・窓・満タンの読み位置を持つ）                               |

ループは、手順の関数を今の順に呼ぶ形になる（名前は仮）。

```ts
for (let f = 0; f < frames; f++) {
  const blocked = burst.blockedAt(f);
  gauge.updateTimedSpeed(f);
  gaugeEffects.reserveTimerGauges(f);
  let g = gaugeEffects.takeReserved(f);
  g = accumulate.stepHead(g, f);
  g = shooters.step(g, f); // 枠の順に射手を進め、発のゲージを足す。shotEvents を書く
  accumulate.afterShots(f);
  g = gaugeEffects.addShotGauges(g, f); // 倍率ダメージ → 射撃の回数 → 持続ダメージの順
  g = instants.addGaugeCharges(g, f);
  g = gaugeEffects.addAllyGauge(g, f);
  burst.step(f, g, blocked);
  if (!trackEvents && !gaugeEffects.tracksBurstUse) {
    afterFrame(f);
    continue;
  }
  const ev = frameEvents.collect(f);
  gaugeEffects.onBurstEffects(ev);
  instants.applyHeals(ev);
  lists.registerFrame(ev);
  instants.apply(ev);
  afterFrame(f); // 段の循環・止まり・倍率ダメージのゲージ・CT の時間・召喚
}
```

- 上は形の見込みで、`gauge` を足す所の数と順は、今のコード（2.2 節の手順 0・1・1b の 7 か所）に合わせる。
- 手順の関数どうしの受け渡し（`shotEvents`・`ev`・予約の `Map`）は、作り手が作って渡す。

### 3.5 `planSkillHits`・`runSimulation`（論点 2 で入れるなら）

- `planSkillHits`: 枠ごとの無名関数を同じファイルの `slotSkillHits` にし、中を、自分の状態の読み口（`ownReadersOf`）・倍率ダメージ（`damageEffectHits`）・持続ダメージ（`dotHits`）・段の循環（`cycleHits`）に分ける。ヒットを積む `push` は 4 つが共有する。
- `runSimulation`: 枠ごとの区間の読み手を作る所を `createRunner`、バーストのヒットの値を `burstHitDamagesOf` にする（同じファイル）。
- どちらもファイルは分けない（1,024 行と 648 行）。

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

| 段  | 中身                                                                                                | 見直し                            |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| H1  | `holders.ts` の関数の外を `holders/types.ts`・`items.ts`・`history.ts` に移す（本体は変えない）     | `/simplify` → `/code-review high` |
| H2  | `createHolderLists` を層の作り手に分ける（3.3 節の残り）                                            | 同上                              |
| F1  | `runFirstPassOnce` のゲージの系（`gauge`・`gaugeEffects`・`accumulate`・`summons`）を作り手に分ける | 同上                              |
| F2  | `runFirstPassOnce` の残り（`burst`・`shooters`・`instants`・`frameEvents`）とループの形             | 同上                              |
| S   | `planSkillHits`・`runSimulation`（論点 2 で入れるなら）                                             | 同上                              |

- この設計書と課題（`records/backlog/split-first-pass.json`）は、H1 の PR に入れる。
- H と F は独立（`firstPass.ts` は `HolderLists` の型と問い合わせだけを読み、どちらも変えない）。並行するスキルの PR との衝突を小さくするため、1 段ずつ出し、マージしてから次の段に入る。
- 見直しは、H1・H2 は `skills/` だけだが 1 パス目の中心なので、どの段も `high` にする。

## 6. 確かめ方

### 6.1 結果の一致（どの段も）

- `npm test` が全件通る。期待値の書き換えは無い。
- `npm run records:check` の後、生成物に差分が無い。
- `npm run records:minimal -- --all` の後、`records/minimal/sensitivity.json` に差分が無い（感度の使い回しの鍵がモデルのコードを含まないので `--all` で回す。[design-first-pass-perf.md](design-first-pass-perf.md) 4 節）。
- 残差: `npm run records:residual -- <全部の観測値の ID>` の出力が、main と段の後で一致する（残差の覚えはモデルのコードの hash ごとなので、段の後は回し直される）。
- 使い捨ての比べ: main（worktree）と段の後で、4 編成（[design-unify-sim-calc.md](design-unify-sim-calc.md) 3.1 節）と、比べる指定のある全部の観測値の入力について、`runSimulation`（`trace` あり）の `SimResult` と `TeamResult` の JSON が文字列で一致する。脚本はコミットせず、結果を PR の本文に書く。

### 6.2 エラーの一致

- 準備の検査の `throw` の文の一覧（数と文）が main と同じで、作り手を今の順に呼んでいる（2 つ以上の検査に当たる入力で、最初に投げる検査が変わらない）。`toThrow` のテストが通る。

### 6.3 速さ

- [design-first-pass-perf.md](design-first-pass-perf.md) 1.1 節と同じ: 4 編成で、`planTeamRun` と `runFirstPass` を、main（worktree から import）と段の後を同じプロセスで交互に 25 回回し、最初の 5 回を捨てた中央値を比べる。表を PR の本文に書く。
- 揺れを抑えるため、1 回ごとに測る前に GC を回し（`node --expose-gc`）、プロセスを 3 回起こして、編成ごとの比の中央値で論点 6 の幅を見る（同じコードどうしでも、1 プロセスの比は GC を回さないと ±17%、回しても ±6% ほど揺れた）。

### 6.4 移したことの確かめ

- H1: 移した宣言の本文が、移す前と文字単位で同じ（`git diff --color-moved` と、構文木で宣言ごとに並べて比べる使い捨ての脚本）。
- H2〜S: 口に合わせて変えた行（作り手の頭の分割代入・返す物・`late`）のほかは本文が同じことを、`git diff --color-moved=dimmed-zebra` で見る。

## 7. リスク

- **`late` の口を埋める前に呼ぶ**: 今の閉包の中で宣言より前に呼ぶのと同じく落ちる。テスト（`holders.test.ts`・`firstPassItems.test.ts` など）で拾う。
- **準備の順が変わる**: 作り手の呼ぶ順を変えると、`tracks` の並び（同じフレームの登録の順・値の小片の同点の並び）と、検査の投げる順が変わる。6.1 節の JSON の一致と 6.2 節で拾う。作り手は今の文の順に呼ぶ。
- **ゲージの和の順**: 3.1 節。6.1 節の JSON の一致（ゲージの記録・時刻表）で拾う。
- **並行するスキルの PR との衝突**: 移した宣言を書き換えた PR は、移した先へ手で写し直す（`holders.ts` を書き換える PR の数は [design-split-skill-holders.md](design-split-skill-holders.md) 2 節）。1 段ずつ短く出す。分けた後は、語彙を足す PR が層ごとのファイルに分かれるので、同じファイルの別の所への足し合いは今と同じく衝突しない。
- **速さ**: 案 A は閉包の呼び出しのままで、増えるのはフレームごと・仕組みごとの関数の呼び出し（1 フレームに十数回）だけなので、変わらない見込み。6.3 節で測る。
- **履歴を辿りにくくなる**: `git log -L`・素の `git blame` は移した所で切れる。`git blame -C -C`・`git log --follow` で辿る（移すだけの段 H1 を別にするのはそのため）。

## 8. 扱わないもの

- 振る舞いの変更（モデル・語彙・エラー文）と、速くする変更。
- 名前の付け替えと、重なりのまとめ直し。見つけたものは経過に書き、別の PR の候補にする。
- テストの分割。
- 範囲の外の長い関数（`skills/catalogDoc.ts` の `renderSkillCatalog`・`records/observations/teamInput.ts` の `buildTeamInput`・`skills/parse/` の残り。パーサは [design-split-long-functions.md](design-split-long-functions.md) の段 P2）。

## 9. 作り

### 9.1 段 H1（2026-11-12）

- `holders.ts` の関数の外を、型と小さな公開の関数を `holders/types.ts`、件を作る純粋な関数（段の印と状態の付与の組の決め方を含む）を `holders/items.ts`、ループの後に履歴を読む関数を `holders/history.ts` に移した。`holders.ts` には `createHolderLists` を残し、前と同じ名前を再公開する。
- ほかのファイルから読まれる内部の宣言にだけ `export` を付けた。本文は、`export` を付けて 1 行に収まらなくなった 1 つ（`RemoveSource`）の折り返しのほかは、構文木で宣言ごとに比べて文字単位で同じ。
- 移した関数を `skills/holders.ts の …` と指していたコメントは、移した先のファイルを指すように直した。
- 見直し（`/simplify`）で足した直し: 履歴を読む関数だけが使う `SKILL_ORDER`・`compareKeys` は `holders/history.ts` の内部に置いた（main と同じく export しない）。状態の付与の組の作り方と段の印（`stateGroupsOf`・`appliedStagesOf`・`stageOfTimed`・`STAGE_RANK` など）は、出どころの準備・見る側・履歴の読みが共有するので `holders/items.ts` に置いたままにし、段 H2 の `holders/sources.ts` などはここから import する（二度移さない）。`createHolderLists` だけが使う配列の道具（`insertSorted`・`lastAtOrBefore`・`setLength`）と `ALL_READS`、出どころの型は、段 H2 で層のファイルから読むので、いまの置き場所のままにした。

### 9.2 段 H2（2026-11-12）

- `createHolderLists` の直下の文を、8 つの層の作り手（`holders/records.ts`・`fires.ts`・`sources.ts`・`read.ts`・`views.ts`・`conditions.ts`・`fire.ts`・`register.ts`）に写した。作り手は前の層の名前を引数の所で分割代入して受け、後の層と入口が読む名前を返す。入口の `createHolderLists` は、前の層までを積んだオブジェクトを次の作り手に渡しながら順に呼び、`late` を埋め、問い合わせを組む。文の本文は、後の層を読む所を `late.X` にしたほかは変えていない（構文木で文ごとに比べた）。
- 層は 3.3 節の表と次の所が違う。
  - 見る側（`views.ts`）に HP・防御力・順位を入れて、判定（`conditions.ts`）より前に作る（発火の文脈の判定が HP の割合を読むため）。
  - 自分に付いた記録（`ownApplied`・`sinceFires`・`stateWindowFires`）は、出どころの準備（`sources.ts`）に残した。`fires.ts` に移すと、`stateWindowFires` が読む状態の件の列（`stateTracks`。件の列が出そろってから作る）を後で読むことになり、後で埋める口の数は変わらないため。`stateTracks` は `sources.ts` の末尾で作る（`views.ts` から移した）。
  - 条件で落とした記録（`skipGrant`・`skipEffect`）は、{ applied } の出どころが読むので `fire.ts` に置いた。`appliedFrom` は登録だけが読み書きするので `register.ts` に置いた。
  - 動かした文は、どれも副作用の無い宣言（関数・空の入れ物・件の列から作る索引）で、文の順の入れ替えで準備の結果は変わらない。
  - `sources.ts` は、出どころの種類ごとの関数には分けていない（本文の書き換えになるため。見出しのコメントで分かれている）。数行を超える問い合わせ（`applyHeal`・`damageBuffsAt`・`consumeFullStacks` など）も、入口の問い合わせの中に残した（同じ理由）。
- 前の層が後の層を読む口（`LateReaders`）は 6 つで、受けるのは `fires.ts` と `sources.ts` だけ: `endedAt`・`stateWindowFires`・`selfHpAtMostAt`（発火の読み → 判定・出どころ・見る側）、`selfHpRatioAt`・`readItems`・`activeAt`（出どころ → 見る側・件の読み）。2.1 節に挙げた所のほか、HP の while の可否（`updateHpAtLeast`）が HP の割合を読む所。
- `register`（1 フレームの登録）は、手順の関数（`registerEnds`・`registerStage1`・`registerEnemyStates`・`registerStage15`・`registerStage2`・`registerRemoveDebuffs`・`registerAmplifiers`）に分け、手順が共有する値（出来事・フレーム・戦闘開始時か・きっかけの絞り込み・{ applied } の記録の始まり）を 1 つのオブジェクトで渡す。本文の行は変えていない。
- 移した名前を `skills/holders.ts の …` と指していたコメントは、層のファイルを指すように直した（`HolderLists` の問い合わせは入口のまま）。
- 見直し（`/simplify`）で、入口の層の展開の並び（積んだオブジェクトにした）・`late` を受ける層（後の層を読む層だけにした）・`stateTracks` の置き場所・敵の状態の手順（`registerStage1` から分けた）を直した。見送り: 作り手の引数の型（前の層の型の交わり）を `Pick` にすること（読む名前は分割代入に出ている）、`LateReaders` を後の層の型から導くこと（型が循環する。入口の `satisfies` がずれを拾う）、`registerCounters` を手順のオブジェクトで呼ぶこと（本文の書き換えになる）。
- 見直し（`/code-review high`）: 正しさの指摘は無し。手順の関数の説明の置き場所と、層のファイルの冒頭が指す節を直した。見送り: `late` を埋める前に読んだ時の守り（今の閉包の中で宣言より前に呼んだ時と同じく、実行時に落ちる。7 節）、入口で積んだオブジェクトを層ごとに写し直すこと（作る時に 1 回だけで、速さに出ない）、手順のオブジェクトの `f`（`ev.frame` と同じ値。本文を変えないために持たせた）。

## 10. 経過

- 2026-11-12: 起案。オーナーが 4 節の論点をすべて推奨の案で承認した。
- 2026-11-12: 段 H1 を実装した（9.1 節）。
- 2026-11-12: 段 H2 を実装した（9.2 節）。
