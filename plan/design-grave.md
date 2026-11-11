# 設計書: グレイブ（完全計算・放熱・過熱）

- 手順: [skills-guide.md](skills-guide.md) 1.3 節（語彙を足すときだけ設計書）
- 関連: [design-hp-down-interval.md](design-hp-down-interval.md)（周期の現在の HP▼。グレイブの書き方の見込みは 3 節）、[design-skill-stage11.md](design-skill-stage11.md) 2.2 節（即時効果 `ammoDecrease`）、[design-cinderella-s1-charge.md](design-cinderella-s1-charge.md) 1.1 節（`durationUntil: "reloadEnd"`）、[design-skill-stage19.md](design-skill-stage19.md) 2.1 節（`{ stateEnd }`）、[design-quency-eq.md](design-quency-eq.md) 2 節（段階別の効果）、[design-agent-bunny.md](design-agent-bunny.md) 2.3 節（貫通特化と貫通ダメージ▲）、[design-sg-split-reload.md](design-sg-split-reload.md)（分割リロード）
- 課題: `records/backlog/skill-hp-down-interval.json`（グレイブのバーストの現在の HP▼）
- 検証: V-0735
- 作成日: 2026-11-11
- 状態: 起案（オーナーの承認待ち）

## 0. 範囲

- グレイブ（514。AR・サポーター・バースト II・灼熱）の S1・S2・バーストを `data/skills/514.json` に定義し、撮影（V-0735）で結論に結び付ける。
- 足す語彙は 5 つ（2 節）。どれも撮影の後に、録画が選んだ読みの分だけ実装する（A2 の B モードと同じ進め方）。
- 6 節の HP▼ の課題からグレイブを外す（2.6 節。ほかの対象は無いので課題のファイルを消す）。

### 0.1 コードで確かめた、いまのモデル（2026-11-11）

- `{ ended: 状態 }`（自分のその状態の件が外れた最初のフレームに発火）は `counterChange` にだけ書ける（`parse/state.ts` の `parseCounterChangeEffect`。発火は `holders.ts` の `endedAt`）。`ammoDecrease` は `weaponChangeEnd` と `burstUse` だけ（`parse/instant.ts`）、付与・timed は `parseTrigger` が ended を受けない。
- `durationUntil: "reloadEnd"`（最大装弾数まで込め終わった次のフレームまで）は timed の自分だけ。状態の付与には書けない（`parse/timed.ts`）。
- 回数のきっかけ `{ count: "normalHit", every }` は戦闘を通して数え、N の倍数ごとに発火する。数える窓 `during` は `fullBurst` だけ、数え直し `reset` は `fullBurstStart` だけ。
- `durationUntil: { stateEnd }` は持続ダメージ（dot）にだけ書ける。
- 付与の条件 `selfState` はほかの状態なら `present: true` も書ける（自分の付ける状態だけは `present: false` に限る）。`passive` の `while.selfState` は味方対象にも書ける（例: 354 のほろ酔い）。
- `burstGaugeSpeed`・`pierceDamage`・`attack`・`attackDamage`・`critRate`・`maxAmmo`（`flat`）・`infiniteAmmo`・`pierce` はどれも語彙にある。フラグ（`infiniteAmmo`・`pierce`）は秒の維持だけ。
- グレイブの武器は分割リロード（60 発・1 段 1 秒・`reloadBullet` 0.5 で 1 段 30 発）。分割リロードは、込め始めの前に弾を込めない 1 段を待ち、段を最大装弾数まで込めてから撃つ（C-0154）。
- 「リロード比率」の言い回しはグレイブだけ。説明文の分類の道具（`skills/catalog.ts`）は `reloadSpeed` に寄せているが、根拠は無い。

## 1. 説明文の分解（スキル Lv10。スペック固定 ON の撮影の値）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| バースト | 自分に「完全計算」（10 秒） | 語彙にある | 中身の無い付与（`burstUse`・`self`・`durationSeconds: 10`。目録に `prediction` を足す） |
| バースト | 完全計算: 現在の HP 1%▼・1 秒間隔・10 秒 | 間接（2.6） | 間接の notes（`path: hp`） |
| バースト | 装弾数無限・貫通特化（10 秒） | 語彙にある | timed（`burstUse`・`self`・`infiniteAmmo`／`pierce`・`durationSeconds: 10`） |
| バースト | 貫通ダメージ 52.8%▲・クリティカル確率 85.19%▲（10 秒） | 語彙にある | timed（`self`・`pierceDamage`／`critRate`）。グレイブの会心率は 15% + 85.19% で、完全計算の間は全部会心になる |
| バースト | 味方全体に攻撃ダメージ 48.2%▲・貫通ダメージ 39.98%▲・最大装弾数 3 発▲（10 秒） | 語彙にある | timed（`allies`。最大装弾数は `scaling: "flat"`）。貫通ダメージ▲は `reads: ["pierce"]` |
| S1 | 完全計算が終了した時、自分に残弾数 100% 減少 | 語彙を足す（2.1） | `ammoDecrease`（`trigger: { ended: "prediction" }`） |
| S1 | 同じきっかけで、自分に「放熱: リロード比率 50%▼」 | 語彙を足す（2.1・2.3） | 状態の付与（`{ ended: "prediction" }`・`self`。目録に `heatEmission`）と中身の新しい stat |
| S1 | 放熱: 一定条件で解除 | 語彙を足す（2.2。読みは撮影で選ぶ） | 本命は `durationUntil: "reloadEnd"` |
| S1 | 放熱の時に限り、自分に最終最大HP の 2% 回復（1 秒間隔・持続） | 間接（2.6） | 間接の notes（`path: hp`） |
| S1 | 放熱の時に限り、味方全体にバーストゲージのチャージ速度 38.96%▲・貫通ダメージ 48.4%▲（持続） | 語彙にある | `passive`（`allies`・`while: { selfState: "heatEmission" }`）。貫通ダメージ▲は `reads: ["pierce"]` |
| S2 | 通常攻撃が 15 回命中した時、自分に「過熱I: 攻撃力 15.48%▲」（最大装弾リロード完了時に解除） | 語彙を足す（2.2） | 状態の付与（`{ count: "normalHit", everyRef: 1 }`・`self`・`durationUntil: "reloadEnd"`。目録に `overheatI`） |
| S2 | 完全計算なら、命中ごとに攻撃命中回数別の効果（下位効果のスタック適用）。30 回: 完全計算かつ過熱I の時に限り「過熱II: 攻撃力 20.66%▲」（持続） | 語彙を足す（2.4・2.5） | 状態の付与（`{ count: "normalHit", everyRef: 3, during: { state: "prediction" } }`・条件 `selfState: "overheatI"`・`durationUntil: { stateEnd: "prediction" }`。目録に `overheatII`） |
| S2 | 60 回: 完全計算かつ過熱II の時に限り「過熱III: 攻撃ダメージ 30.8%▲」（持続） | 同上 | 同じ形（`everyRef: 5`・条件 `selfState: "overheatII"`。目録に `overheatIII`） |

- 「完全計算かつ過熱I」の「完全計算」は、数える窓（2.4）が完全計算の間だけなので、条件には書かず、過熱I だけを条件にする（2 つの状態の AND の条件は要らない）。
- 30 回の命中のうちには、戦闘を通して数える 15 の倍数が必ず入るので、30 回目には過熱I が付いている。60 回目には過熱II が付いている。条件は説明文どおり書くが、完全計算の間は落ちない見込み。

## 2. 語彙

### 2.1 状態が終了した時のきっかけを、残弾数減少と状態の付与に開く（論点 1）

- `{ ended: 状態 }` を `ammoDecrease` と状態の付与（`kind: "state"`）のきっかけに書けるようにする。意味は `counterChange` のいまの形のまま（自分のその状態の件が外れた最初のフレーム。続く件が同じフレームに無いとき）。見る状態は、同じ定義の自分に付ける付与のあるもの（`counterChange` と同じ検査）。
- 発火のフレーム f は、完全計算の 10 秒の窓の終わり（装弾数無限・貫通特化などの timed の 10 秒の終わりと同じフレーム）。f に残弾を 0 にし、f から込め始める。放熱は f に付き、その込めに効く。
- 発火は 1 パス目の即時効果の流れ（`frame/firstPass.ts` の `instantTracker`）で、`holders.ts` の `endedAt` を `sinceFires` と同じに公開して読む。状態の付与は `holders.ts` の `firesOf` に `counterFull` と同じ分岐を足す。付与の件の終わりは段の登録の中で決まるので、完全計算の件が閉じた後に放熱を付ける順にする（実装で確かめる）。
- timed には開かない（使い手がいない）。

### 2.2 状態の付与の「最大装弾数のリロード完了時に解除」（論点 2・3）

- 状態の付与の維持に `durationUntil: "reloadEnd"` を書けるようにする（いまは timed の自分だけ）。意味は timed と同じ（持ち主のリロードが最大装弾数まで込め終わったフレームの次で件を閉じる）。対象が自分で、スタックしない付与だけ。
- 過熱I は説明文どおり。放熱の「一定条件で解除」の読みは撮影で選ぶ:
  - **U1（本命）**: 放熱の付いた込め（残弾数減少で始まる込め）が最大装弾数まで込め終わった時に解除。過熱I と同じ `reloadEnd`。
  - **U2**: 次の完全計算まで（次のバーストの使用で外れる）。U2 なら `durationUntil: { stateEnd }` の逆の形が要るので、語彙はその時に決め直す。
  - 録画で見るもの: グレイブの HP のバーが 1 秒ごとに上がる間（回復）と、貫通特化のある味方の発に貫通ダメージ 48.4%▲が乗る間。
- 解除の後は、中身（リロード比率▼）と、放熱を見る `passive`（バーストゲージのチャージ速度▲・貫通ダメージ▲）が止まる。

### 2.3 リロード比率（論点 4）

- 「リロード比率」は、分割リロードの 1 段で込める割合（CDN の `reloadBullet`）と読むのを本命にする。グレイブは分割リロードの武器で、ほかに「リロード比率」を持つキャラはいない。3 つの読みを撮影で選ぶ:
  - **Rm（本命）**: 割合に (1 − 50%) を掛ける（0.5 → 0.25。1 段 15 発、4 段）。込め終わりまでは見えない 1 段 + 4 段で約 5 秒。
  - **Rs**: 割合から 50% を引く（0.5 → 0。1 段の弾数は `max(1, round(60 × 0))` = 1 発、60 段）。込め終わりまで約 61 秒。
  - **Rv**: リロード速度 50%▼（いまの式で 1 段 1.5 秒、2 段）。込め終わりまで約 4.5 秒。
- 録画で見るもの: RELOADING のバーの段の数と長さ、照準の横の残弾の段ごとの増え方（Rm は 15 発ずつ、Rv は 30 発ずつ、Rs は 1 発ずつ）。
- 語彙: Rm・Rs なら stat `reloadRatio`（状態の中身と timed の自分。1 パス目で窓を追う射撃の stat の 1 つ）を足し、`frame/firing.ts` の `reloadChunkAmmo` に渡す割合を変える（Rm は掛け算、Rs は引き算）。込めの途中で付いた・外れたときは、次の段の弾数から変える。Rv なら語彙は足さず、中身を `reloadSpeed`・`decrease` で書く。
- 分割リロードでない武器に付いたときの扱いは、使い手が出た時に決める（グレイブは自分にだけ付ける）。

### 2.4 状態の間だけ数える命中の回数（論点 5）

- 回数のきっかけの数える窓 `during` に、自分の状態 `{ "state": 状態 }` を足す。その状態が自分に付いている間の命中だけを数え、その状態が付くたびに 0 から数え直す（`reset` は書かない）。N の倍数ごとの発火は今と同じ。
- 英語版の説明文は「Activates when landing a normal attack after Prediction takes effect」で、完全計算が付いてからの命中を数える読み（K1）を本命にする:
  - **K1（本命）**: 完全計算が付いてからの命中の 30 回目に過熱II、60 回目に過熱III。グレイブは 720rpm なので、付いてから約 2.5 秒・約 5 秒（バーストの入りの止まりを除く）。
  - **K2**: 戦闘を通して数え、30・60 の倍数に届いた命中が完全計算の間なら付く（`firesDuring` の形。ソーダ：トゥインクルバニーの S1 と同じ数え方）。付く命中の位置がバーストごとにずれる。
- 録画で見るもの: バーストの使用から、グレイブの 1 発の値が攻撃力▲（過熱II）・攻撃ダメージ▲（過熱III）で上がる発の位置。

### 2.5 状態の付与の「〈状態〉の時に限り…持続」（論点 6）

- 状態の付与の維持に `durationUntil: { "stateEnd": 状態 }` を書けるようにする（いまは持続ダメージだけ）。見る状態の、自分の件が外れたフレームで閉じる。見る状態は同じ定義の自分に付ける付与のあるもの。
- 過熱II・III は、完全計算が終わったら外れる（E1。本命）。もう 1 つの読みの「過熱I が外れるまで続く（E2）」とは、グレイブの与ダメージでは見分けられない。完全計算の終わりに残弾が 0 になり、込め終わる（= 過熱I が外れる）まで撃たないため。E1 で書き、`assumes` に書く。
- 代わりの案: 過熱II・III を `passive` の `while` にする。`while` は 1 つの状態しか見られず、「30 回目から」を状態のスタックで数える形が要るので、採らない。

### 2.6 足さないもの: 現在の HP▼ と回復（論点 7）

- バーストの「現在の HP 1%▼・1 秒間隔」と、S1 の放熱の「最大HP の 2% 回復・1 秒間隔」は、どちらも間接の notes（`path: hp`）にする。グレイブに HP を読む効果は無く、HP を読むのは味方の側（「残りの HP の割合が最も低い味方」など）だけ。
- HP▼ だけを効果にすると、モデルは回復で HP が戻る分を扱わない（[design-scarlet.md](design-scarlet.md) 2.1 節）ので、完全計算のたびに HP が下がったまま積み上がり、実際（放熱の回復で戻る）より低い HP を読む側に渡してしまう。回復の語彙（周期の回復が HP の割合を戻す形）を足すまで、両方を間接の notes にしておくほうが読む側への誤りが小さい。
- 撮影では HP のバーも読み、HP▼ の 1 回目の時刻・間隔と、回復の間（放熱の窓）を観測値に残す（放熱の解除の読み U1・U2 の手がかりにも使う）。
- 課題 `skill-hp-down-interval.json` の対象はグレイブだけなので、定義を入れた PR で課題のファイルを消す。

## 3. 定義の案（`data/skills/514.json`。値は `ref`）

```json
"skill1": { "effects": [
  { "kind": "ammoDecrease", "trigger": { "ended": "prediction" }, "target": "self", "ref": 1 },
  { "kind": "state", "state": "heatEmission", "trigger": { "ended": "prediction" }, "target": "self",
    "durationUntil": "reloadEnd", "contents": [ { "stat": "reloadRatio", "ref": 2, "decrease": true } ] },
  { "kind": "passive", "target": "allies", "stat": "burstGaugeSpeed", "ref": 4, "while": { "selfState": "heatEmission" } },
  { "kind": "passive", "target": "allies", "stat": "pierceDamage", "ref": 5, "while": { "selfState": "heatEmission" }, "reads": ["pierce"] }
], "notes": [ "放熱の間の回復（間接・hp）" ] },
"skill2": { "effects": [
  { "kind": "state", "state": "overheatI", "trigger": { "count": "normalHit", "everyRef": 1 }, "target": "self",
    "durationUntil": "reloadEnd", "contents": [ { "stat": "attack", "ref": 2 } ] },
  { "kind": "state", "state": "overheatII", "trigger": { "count": "normalHit", "everyRef": 3, "during": { "state": "prediction" } },
    "target": "self", "condition": { "selfState": "overheatI" }, "durationUntil": { "stateEnd": "prediction" },
    "contents": [ { "stat": "attack", "ref": 4 } ] },
  { "kind": "state", "state": "overheatIII", "trigger": { "count": "normalHit", "everyRef": 5, "during": { "state": "prediction" } },
    "target": "self", "condition": { "selfState": "overheatII" }, "durationUntil": { "stateEnd": "prediction" },
    "contents": [ { "stat": "attackDamage", "ref": 6 } ] }
] },
"burst": { "effects": [
  { "kind": "state", "state": "prediction", "trigger": "burstUse", "target": "self", "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "infiniteAmmo", "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "pierce", "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "pierceDamage", "ref": 2, "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "critRate", "ref": 6, "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "allies", "stat": "attackDamage", "ref": 3, "durationSeconds": 10 },
  { "kind": "timed", "trigger": "burstUse", "target": "allies", "stat": "pierceDamage", "ref": 4, "durationSeconds": 10, "reads": ["pierce"] },
  { "kind": "timed", "trigger": "burstUse", "target": "allies", "stat": "maxAmmo", "scaling": "flat", "ref": 5, "durationSeconds": 10 }
], "notes": [ "完全計算の現在の HP▼（間接・hp）" ] }
```

- 放熱の中身・解除は、撮影で選んだ読み（2.2・2.3）で書き直す。数える窓は K1 の形（2.4）。

## 4. 退化の見込み

- 足す語彙を使う定義はグレイブだけ。既存の定義（`ended` の `counterChange`・`reloadEnd` の timed・`stateEnd` の dot・`during: "fullBurst"`）の形と値は変えない。既存のテストが数値を変えずに通ること。
- グレイブの録画は無いので、既存の観測値の残差は変わらない見込み（`npm run records:residual` で前後を比べる）。

## 5. 検証（撮影）

- 撮影は V-0735（編成・混ざる要素・予測・撮影の依頼はそちら）。
  - 撮影 A（単騎）: 過熱I の付く命中の位置（15 回）と、最大装弾数まで込め終わった時の解除。ふだんの分割リロード（放熱なし）の形も見る。
  - 撮影 B（3 人）: 完全計算の 10 秒（過熱II・III の付く位置、味方への攻撃ダメージ▲・貫通ダメージ▲・最大装弾数▲）と、終わりの残弾数減少・放熱（リロード比率の読み、解除の読み、放熱の間の味方の貫通ダメージ▲・ゲージ）。

## 6. 実装の順とリスク

- 実装は撮影の後に、録画が選んだ読みの分だけ行う（1 段ごとに `npm test`）。
  1. `skills/types.ts`・`skills/parse/`（`instant.ts`・`state.ts`・`timed.ts`・`trigger.ts`・`crossChecks.ts`）: 2.1〜2.5 の型と検証、目録（`skills/states.ts`）に 5 つの状態。単体テスト。
  2. `skills/resolve.ts`・`skills/holders.ts`・`frame/firstPass.ts`・`frame/firing.ts`・`frame/shooter.ts`: ended の発火、状態の付与の reloadEnd・stateEnd の閉じ方、状態の間だけ数える回数、リロード比率。
  3. 既存のテストが数値を変えずに通ること。
  4. 定義 `514.json` と `index.json`、編成のテスト（グレイブ・プロダクト08・アリス）、`records/skills.ts`・`catalogDoc.ts` の表示、最小構成の検査の感度（`npm run records:minimal`）。
- リスク:
  - 完全計算の終わりのフレームで、装弾数無限の窓の終わり・残弾数減少・放熱の付与・リロードの開始の順が 1 パス目の中で循環しないか（放熱のリロード比率は、残弾数減少で始まる込めに効かないといけない）。
  - 過熱I のきっかけは命中の期待値で数える（弾丸命中率が 1 未満の的では、15 の倍数に届く発がマガジンごとにずれる）。マガジンごとに数え直す読みが録画に合えば、`reset` に「リロード完了」を足す（撮影 A で見る）。
  - 分割リロードの段の弾数を込めの途中で変える形は、いまの射手に無い。Rm・Rs が選ばれたら、段ごとに弾数を決める形に直す。

## 7. 論点（オーナーに決めてもらうこと）

1. **完全計算が終了した時のきっかけ**（2.1 節）
   - 推奨: `{ ended }` を `ammoDecrease` と状態の付与に開く（timed には開かない）。
2. **状態の付与の reloadEnd**（2.2 節）
   - 推奨: 状態の付与の維持に `durationUntil: "reloadEnd"` を開く（自分・スタックなし）。過熱I に使う。
3. **放熱の「一定条件で解除」**（2.2 節）
   - 推奨: U1（放熱の付いた込めの込め終わりで解除）を本命に、U2（次の完全計算まで）も予測に書いて撮影で選ぶ。
4. **リロード比率**（2.3 節）
   - 推奨: 分割リロードの 1 段の割合と読む Rm（掛け算）を本命に、Rs（引き算）・Rv（リロード速度）も予測に書いて撮影で選ぶ。Rm・Rs なら stat `reloadRatio` を足す。
5. **攻撃命中回数別の効果の数え方**（2.4 節）
   - 推奨: K1（完全計算が付いてからの命中を数える。`during: { state }` を足す）を本命に、K2（戦闘を通して数える）も予測に書いて撮影で選ぶ。
6. **過熱II・III の「持続」**（2.5 節）
   - 推奨: 状態の付与の維持に `durationUntil: { stateEnd: "prediction" }` を開き、完全計算の終わりで外す（E1）。E2 とは与ダメージで見分けられないことを `assumes` に書く。
7. **現在の HP▼ と放熱の回復**（2.6 節）
   - 推奨: どちらも間接の notes（`path: hp`）にし、課題 `skill-hp-down-interval.json` を消す。HP のバーは撮影で読んで観測値に残す。
   - 代わりの案: HP▼ を A2 と同じ `currentHpDown`（`since`・`atStart`）の効果にし、回復は間接の notes のまま。読む側の味方のいる編成で、HP が戻らない誤りが積み上がる。
8. **撮影の編成**（V-0735）
   - 推奨: A はグレイブ単騎（オートバースト OFF）2 本、B はプロダクト08（I）+ グレイブ（II）+ アリス（III・操作）2 本（オートバースト ON）。
9. **PR の範囲**
   - 推奨: 2.1〜2.5 節の語彙・グレイブの定義・撮影の結論・課題の削除を 1 本にする。

## 経過

- 2026-11-11: 起案。説明文とコードを照らし、語彙が 5 つ足りない（0.1 節・2 節）と分かった。HP▼ と回復は間接の notes にする案（2.6 節）。論点 1〜9 と撮影（V-0735）をオーナーに諮る。
