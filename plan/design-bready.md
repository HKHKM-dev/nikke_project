# 設計書: ブレッディ（520）のスキルの定義（やみつきの味・オススメの味・あと味）

- 手順: [skills-guide.md](skills-guide.md)（1.1 選ぶ → 1.2 説明文を分解する → 1.3 設計書 → 1.4 実装する）
- 関連: [design-skill-stage1.md](design-skill-stage1.md) 1.1・1.2 節（自分の状態の条件・消去の実装は使い手を定義する時）、[design-mint-prika.md](design-mint-prika.md) 2.1・2.2 節（自分の状態の消去・切り替えの組）、[design-skill-stage4.md](design-skill-stage4.md) 1.1 節（`{ applied }` のきっかけ）、[design-skill-stage15-inventory.md](design-skill-stage15-inventory.md)（ブレッディの節）、[design-skill-stage20-inventory.md](design-skill-stage20-inventory.md) 0.3 節（ブレッディとクラスト。C-0839）
- 検証: V-0785
- 作成日: 2026-11-15
- 状態: 完了

## 0. 範囲

- ブレッディ（SSR・火力型・SR・水冷・バースト III）の S1・S2・バーストを `packages/core/data/skills/520.json` に定義し、撮影（V-0785）で結論に結び付ける。
- 効果の大半は、自分が「やみつきの味」か「オススメの味」のどちらかのときだけ起きる。味は、味方の持続ダメージ▲・分配ダメージ▲が自分に付いた時に付くので、単騎ではフルバースト発動時の攻撃力▲とバーストの攻撃ダメージ▲しか起きない。
- 同じ部隊のクラスト（521）は今回定義しない。クラストの持続ダメージ▲・分配ダメージ▲は「フルチャージではない通常攻撃を 3 回」「フルチャージ状態を 1 秒以上 3 回維持」で付く状態の中にあり、オートの射撃で起きるかが未確定（C-0839。[design-skill-stage20-inventory.md](design-skill-stage20-inventory.md) 0.3 節）。ブレッディの定義は、どの味方の▲でも働く形で書く。
- 足りない語彙は 3 つ（2.1〜2.3 節）と、あと味効果▲の値の形（2.4 節。撮影で選ぶ）。

### 0.1 コードと記録で確かめた、いまのモデル（2026-11-15）

- 持続ダメージ▲・分配ダメージ▲を味方に配る定義（`data/skills/`）のうち、ブレッディに付くのはロザンナ：シックオーシャン（283）のバースト（味方全体の持続ダメージ▲・10 秒。C-1198）、エレグ（500）のバースト（味方全体の分配ダメージ▲・10 秒。C-0691・C-0778）、マスト：ロマンチックメイド（354）の S2・アンカー：イノセントメイド（355）の S1（どちらも分配ダメージ▲。結論が無い）。アークレンジャー・ブラック（570）の持続ダメージ▲は自分と風圧の AR にだけ付く。
- 「〈名前〉が適用された時」（`{ applied }`）は、名前の付いた状態が自分に付いたフレームに発火する（`skills/holders/fire.ts` の `dispatchApplied`）。stat の▲が付いた時に発火するきっかけは無い。
- 条件 `selfBuffed`（「自分が〈stat〉増加状態なら」）は、timed と付与に書け、常時の値か段 1 の件にその stat の正の値があるかを見る（`skills/holders/conditions.ts`）。「でなければ」の形は無い。使い手はモダニアの 1 体（260）。
- 切り替えの組（目録の `group`）は、同じ持ち主に組の状態が付いたら、組のほかの状態の件を次のフレームで閉じる（解除不可も。`skills/holders/fire.ts` の `fireGrant`）。ミントのバーストの割り当てパート（`assignedPart`）が使う。自分の状態の消去（`cancelState` の `target: "self"`）もある（ミントの S2）。
- 状態の中身のチャージ速度▼（`decrease`）は書ける（エイダ・エミリア）。チャージ速度▼は▲と同じ和に入り、溜めは 1 秒 × (1 − Σ)（減算の式。C-0786・C-1257）。チャージの途中で速度が変わったら、それまでの経過を持ち越して新しい長さまで待つ（C-0528）。
- dot の `state` は、同じキャラの同じ状態の dot を 1 つの持続ダメージとして扱い、付け直しで tick を増やさない（C-0136）。`maxStacksRef` があればスタックで重なる（C-0182）。tick の時刻の形（`firstTick`）は 3 つ。持続ダメージ▲（`sustainedDamage`）は tick にだけ攻撃ダメージ▲と同じ群で乗り、受けるダメージ▲は別の乗数（C-1198）。
- 「〈状態〉効果 X%▲」の形で別の効果の値を変える語彙は、timed の `amplifies`（同じ枠の timed の stat の値を増やす。エマ：タクティカル・アップ（93））だけで、dot の値は変えられない。スキルの効果の分類（[skill-catalog.md](skill-catalog.md)）の行「効果: 状態の中身の値」の使い手は、ブレッディとレイ（仮称）だけ。
- 「敵全体に分配ダメージ」は、敵 1 体の前提で 1 ヒット（ドロシーの S2 の焦土化。233）。分配ダメージ▲は分配ダメージに別の乗数で乗る（C-0691）。
- オートの射撃のチャージ武器は、フルチャージに届いたらすぐ撃つ（C-0839・C-0528）。ブレッディのオートの発はどれもフルチャージ。SR の発の間はモデルで約 82f（チャージ 60f ＋ 撃った後の待ち）。

## 1. 説明文の分解（スキル Lv10。スペック固定 ON の撮影の値）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| S1 | フルバーストタイムが発動した時、自分に攻撃力 70.01%▲（10 秒） | 語彙にある | timed（`fullBurstStart`・`self`・`attack`・`ref: 1`・`durationRef: 2`） |
| S1 | 持続ダメージ増加効果が適用された時、自分にやみつきの味: チャージ速度 20%▼（50 秒・解除不可） | 語彙を足す（2.1） | 状態の付与（`lingeringTaste`・きっかけ `{ buffApplied: "sustainedDamage" }`・`self`・`durationRef: 4`・`undispellable`・中身 `chargeSpeed`・`decrease`・`ref: 3`） |
| S1 | 同: オススメの味消去 | 語彙にある（2.3） | 切り替えの組（目録の `group: "taste"`）。付与と同じフレームで、もう片方を閉じる |
| S1 | 分配ダメージ増加効果が適用された時、持続ダメージ増加状態でなければ、自分にオススメの味: チャージ速度 20%▼（50 秒・解除不可） | 語彙を足す（2.1・2.2） | 状態の付与（`recommendedTaste`・きっかけ `{ buffApplied: "distributedDamage" }`・条件 `selfBuffed: { stat: "sustainedDamage", present: false }`・`durationRef: 6`・中身 `chargeSpeed`・`decrease`・`ref: 5`） |
| S1 | 同: やみつきの味消去 | 語彙にある（2.3） | 切り替えの組（同上） |
| S2 | フルチャージ攻撃が 3 回命中した時、やみつきの味なら、対象に受けるダメージ 10.2%▲（5 秒） | 語彙にある | timed（`{ count: fullChargeShot, everyRef: 8 }`・条件 `selfState: lingeringTaste`・`allies`・`damageTaken`・`ref: 1`・`durationRef: 2`）。敵 1 体の受けるダメージ▲を味方の別の乗数で持つ（ほかの使い手と同じ） |
| S2 | 同: あと味: 最終攻撃力の 150.04% の持続ダメージ（1 秒間隔・5 秒） | 語彙にある | dot（同じきっかけと条件・`state: aftertaste`・`ref: 3`・`intervalSeconds: 1`・`durationRef: 4`）。付け直しの形と tick の時刻は撮影で選ぶ（論点 5） |
| S2 | フルチャージ攻撃が命中した時、オススメの味なら、自分に攻撃ダメージ 60.01%▲（5 秒） | 語彙にある | timed（`{ count: fullChargeShot }`・条件 `selfState: recommendedTaste`・`self`・`attackDamage`・`ref: 5`・`durationRef: 6`） |
| S2 | 同: 敵全体に最終攻撃力の 265.07% の分配ダメージ | 語彙にある | damage（同じきっかけと条件・`distributed`・`ref: 7`）。敵 1 体の前提で 1 ヒット。ヒットの遅れは録画で読む |
| バースト | 自分に攻撃ダメージ 60.19%▲（10 秒） | 語彙にある | timed（`burstUse`・`self`・`attackDamage`・`ref: 1`・`durationRef: 2`） |
| バースト | やみつきの味なら、自分にあと味効果 349.8%▲（10 秒） | 語彙を足す（2.4） | timed（`burstUse`・条件 `selfState: lingeringTaste`・あと味の値を増やす形・`ref: 3`・`durationRef: 4`） |
| バースト | オススメの味なら、自分に攻撃力 70.09%▲（10 秒） | 語彙にある | timed（`burstUse`・条件 `selfState: recommendedTaste`・`self`・`attack`・`ref: 5`・`durationRef: 6`） |

- 「フルチャージ攻撃が命中した時」は `fullChargeShot`（フルチャージの発）で書く。射撃場の的でブレッディの弾丸命中率は 1（モデルの表）なので、命中と同じ列になる。
- S2 の 3 回の数え方は、ほかの回数のきっかけと同じく戦闘を通して数え、3 の倍数に届いた発でやみつきの味なら起きる形（K2）を本命にする（エレグ C-0697・アスカ：WILLE C-1266 と同じ）。味が付いてから数える形（K1）も予測に書いて撮影で選ぶ（論点 6）。K1 なら、数える窓 `during: { state }` を timed・dot に開く語彙が要る。

## 2. 語彙

### 2.1 「〈stat〉増加効果が適用された時」のきっかけ `{ buffApplied: stat }`（論点 1）

- きっかけ `{ buffApplied: BuffStat }` を足す。編成のどの枠の効果でも（自分の効果も）、その stat の▲（`decrease` でない正の値）の件がこの効果を持つ枠に付いたフレームに発火する。付き直し（窓が続いている間の付け直し）でも、付くたびに 1 回。
  - 数える効果: timed（対象にこの枠が入るもの）と、状態の付与の中身。常時の効果（passive）・編成の段で決まる値は発火しない（「適用された時」の出来事が無い）。
  - 同じフレームに 2 つの件が付いても 1 回（`{ applied }` と同じ）。
- 書ける効果は状態の付与だけにする（使い手はブレッディだけ）。対象は自分だけ。
- 段は `{ applied }` と同じ考え方で、見る stat を付ける効果の段のいちばん後の次にする。ロザンナ：シックオーシャン・エレグの▲は `burstUse` の timed（段 1）なので、味の付与は段 1.5 になる。
- 中身のチャージ速度▼は 1 パス目で窓を追う stat なので、1 パス目の射撃のループの中で、味方のバーストの▲が付いたフレームに味の件を登録する（`{ applied }` のきっかけの付与と同じ流れ。5 節のリスク）。
- 代わりの案: きっかけの代わりに、味方のバーストの使用（`burstUse`）を見る形。だれの▲で付くかを定義に書くことになり、配る側のキャラが増えるたびに直すので採らない。

### 2.2 条件「自分が〈stat〉増加状態でなければ」（論点 2）

- 条件 `selfBuffed` に `{ stat, present: false }` の形を足す（いまの `"selfBuffed": "<stat>"` は `present: true` と同じ）。見るものはいまの `selfBuffed` と同じ（常時の値か段 1 の件に、その stat の正の値があるか）で、無ければ満たす。
- 見る瞬間は発火のフレーム。同じフレームに付いた持続ダメージ▲を見るかは、ロザンナ：シックオーシャンとエレグのバーストが同じフレームに起きない（どちらも II）ので、射撃場の編成では決まらない。いまの `selfBuffed` と同じく、そのフレームに付いた件も見る形にする。
- 「でない」側（持続ダメージ▲の間に分配ダメージ▲が付いてもオススメの味が付かない）は、機構が確定したキャラだけでは撮れない（論点 2）。2 つの▲が重なるのは、II のバーストの持続ダメージ▲（ロザンナ：シックオーシャン）と、段階 III 突入時の分配ダメージ▲（マスト：ロマンチックメイドの S2。結論が無い）の組だけ。

### 2.3 味の消去は切り替えの組で書く（論点 3）

- 目録（`skills/states.ts`）に `lingeringTaste`（やみつきの味。味方）・`recommendedTaste`（オススメの味。味方）を足し、両方に切り替えの組 `group: "taste"` を付ける（`StateSwitchGroup` に `taste` を足す）。片方が付いたら、もう片方の件を次のフレームで閉じる（解除不可も）。説明文の「消去」（解除不可でも外れる）と同じ。
- 代わりの案: `cancelState`（`target: "self"`）を、付与と同じきっかけ `{ buffApplied }` で書く。説明文の行どおりだが、`cancelState` にもきっかけを開くことになる。組なら語彙が増えない。
- 目録に `aftertaste`（あと味。敵）を足す（dot の `state`）。

### 2.4 あと味効果▲（論点 4。撮影で形を選んでから足す）

- バーストの「あと味効果 349.8%▲」は、あと味の tick の値を増やす。どう増やすかは説明文から決まらないので、撮影で選んでから語彙を足す:
  - **E1（本命）**: tick の倍率を (1 + 349.8%) 倍にする（150.04% → 674.9%）。ほかの▲とは別の乗数。
  - **E2**: tick の倍率に 349.8% を足す（150.04% → 499.84%）。
  - **E3**: あと味の tick にだけ乗る持続ダメージ▲として、持続ダメージ▲・攻撃ダメージ▲の群に 349.8% を足す。
- いつの値で乗るか:
  - **T1（本命）**: tick ごとに、その tick のフレームに▲が効いていれば乗る（持続ダメージ▲の乗り方と同じ。C-1196）。
  - **T2**: あと味を付けたフレームに▲が効いていれば、その付与の tick に全部乗る。
- 語彙の案（形が決まった後）: timed の stat `aftertasteEffect` のような名前で 1 つ足すのではなく、dot の状態を指す timed の stat `dotEffect` と欄 `dotState`（指す dot の状態の id）を足す。同じ言い回しの使い手が出た時に、状態を替えるだけで使える。E1・E2・E3 のどれかで、`skills/burstDamage.ts` の tick の値の式に 1 項足す。
- 撮影の編成（V-0785 の撮り方 1）では、ブレッディのバーストの 10 秒とロザンナ：シックオーシャンの持続ダメージ▲（20.32%）・ブレッディのバーストの攻撃ダメージ▲（60.19%）が重なるので、3 つの形の tick の値が分かれる（V-0785 の予測）。

### 2.5 足さないもの

- **敵全体**: 敵 1 体の前提（[requirements.md](requirements.md) 4.2 節）で 1 機。分配ダメージの `assumes` に書く。

## 3. 定義の案（`data/skills/520.json`。値は `ref`）

```json
"skill1": { "effects": [
  { "kind": "timed", "trigger": "fullBurstStart", "target": "self", "stat": "attack", "ref": 1, "durationRef": 2 },
  { "kind": "state", "state": "lingeringTaste", "trigger": { "buffApplied": "sustainedDamage" }, "target": "self",
    "durationRef": 4, "undispellable": true, "contents": [ { "stat": "chargeSpeed", "ref": 3, "decrease": true } ] },
  { "kind": "state", "state": "recommendedTaste", "trigger": { "buffApplied": "distributedDamage" }, "target": "self",
    "condition": { "selfBuffed": { "stat": "sustainedDamage", "present": false } },
    "durationRef": 6, "undispellable": true, "contents": [ { "stat": "chargeSpeed", "ref": 5, "decrease": true } ] }
] },
"skill2": { "effects": [
  { "kind": "timed", "trigger": { "count": "fullChargeShot", "everyRef": 8 }, "condition": { "selfState": "lingeringTaste" },
    "target": "allies", "stat": "damageTaken", "ref": 1, "durationRef": 2 },
  { "kind": "dot", "trigger": { "count": "fullChargeShot", "everyRef": 8 }, "condition": { "selfState": "lingeringTaste" },
    "state": "aftertaste", "ref": 3, "intervalSeconds": 1, "durationRef": 4, "firstTick": "atApplication" },
  { "kind": "timed", "trigger": { "count": "fullChargeShot" }, "condition": { "selfState": "recommendedTaste" },
    "target": "self", "stat": "attackDamage", "ref": 5, "durationRef": 6 },
  { "kind": "damage", "trigger": { "count": "fullChargeShot" }, "condition": { "selfState": "recommendedTaste" },
    "damageType": "distributed", "ref": 7 }
] },
"burst": { "effects": [
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "attackDamage", "ref": 1, "durationRef": 2 },
  { "kind": "timed", "trigger": "burstUse", "condition": { "selfState": "lingeringTaste" }, "target": "self",
    "stat": "dotEffect", "dotState": "aftertaste", "ref": 3, "durationRef": 4 },
  { "kind": "timed", "trigger": "burstUse", "condition": { "selfState": "recommendedTaste" }, "target": "self",
    "stat": "attack", "ref": 5, "durationRef": 6 }
] }
```

- あと味の付け直しの形（`state` だけで付け直す・`maxStacksRef` で重なる・効果ごとに別の dot）、`firstTick`、分配ダメージの遅れ（`delayFrames`）、K1・K2、E1〜E3・T1〜T2 は、撮影で選んだ形に書き直す。

## 4. 検証（撮影）

- 撮影は V-0785（編成・混ざる要素・予測・撮影の依頼はそちら）。
- 撮り方 1（やみつきの味）: I-DOLL・フラワー（I）+ ロザンナ：シックオーシャン（II）+ ブレッディ（III・操作）、オートバースト ON。やみつきの味の付き始め・チャージ速度▼・S2 の 3 回の数え方・あと味の形・受けるダメージ▲・あと味効果▲の形を見る。
- 撮り方 2（オススメの味）: I-DOLL・フラワー（I）+ エレグ（II）+ ブレッディ（III・操作）、オートバースト ON。オススメの味・S2 の攻撃ダメージ▲と分配ダメージ・バーストの攻撃力▲を見る。
- 撮り方 3（味の切り替え）: 撮り方 1 にエレグ（4 枠目）を足し、II を手でロザンナ：シックオーシャンとエレグに交互に使う。味が II のたびに入れ替わり、前の味の S2 の効果が止まるか（消去）を見る。

## 5. 実装の順とリスク

- 実装は、論点の承認と撮影の後に、録画が選んだ形（K1・K2、E1〜E3・T1〜T2、あと味の付け直し）で 2.1〜2.4 節を入れる（1 段ごとに `npm test`）。
  1. `skills/types.ts`・`skills/parse/`（`trigger.ts`・`condition.ts`・`state.ts`・`timed.ts`）・`skills/states.ts`: 2.1〜2.4 の型と検証、目録に 3 つの状態と組。単体テスト。
  2. `skills/holders/`（`{ buffApplied }` の発火と段、`selfBuffed` の `present: false`）・`frame/firstPass.ts`（味のチャージ速度▼を 1 パス目の窓に入れる）・`skills/burstDamage.ts`（あと味効果▲）。
  3. 既存のテストが数値を変えずに通ること（`selfBuffed` の文字列の形はそのまま読む）。
  4. 定義 `520.json` と `index.json`、編成のテスト（撮り方 1〜3 の編成）、最小構成の検査の感度（`npm run records:minimal`）。
- リスク:
  - `{ buffApplied }` の付与の中身が 1 パス目で窓を追う stat（チャージ速度）で、きっかけは味方のバーストの timed の件。味方のバーストは 1 パス目のバーストの時刻表で決まるので、`{ applied }` の付与と同じく、時刻表の後に段の順で登録できる見込み。登録できなければ、1 パス目のループの中で味方の▲の付いたフレームを見る形にする。
  - 味の付いたフレームとチャージの途中の発。C-0528 の規則なら、付いた時に溜めの途中の発は、それまでの経過を持ち越して 1.2 秒まで待つ。
  - ロザンナ：シックオーシャンの S2 の持続ダメージの tick がゲージを溜めるかは未確定（未対応の notes）。撮り方 1 のバーストの時刻が録画とずれたら、比べるフレームは録画のバーストの替わり目を起点にする。

## 6. 論点（オーナーに決めてもらうこと）

- 決定（2026-11-15・オーナー）: 8 つとも推奨の案にする。

1. **「〈stat〉増加効果が適用された時」のきっかけ**（2.1 節）
   - 推奨: `{ buffApplied: stat }` を足す。どの枠の▲でも、付くたびに 1 回発火する。書けるのは状態の付与だけ。
   - 代わりの案: S1 の味の 2 行を未対応の notes にする（S1 は `partial`、S2・バーストは味が付かないので起きない。ブレッディは単騎と同じ値になる）。
2. **「持続ダメージ増加状態でなければ」**（2.2 節）
   - 推奨: `selfBuffed` に `present: false` を足して説明文どおりに書く。満たす側（持続ダメージ▲が無い時に付く）は撮り方 2・3 で確かめ、満たさない側は撮れないので、その部分は仮説の結論に分ける。
   - 代わりの案: 条件を書かず、未対応の notes にする（持続ダメージ▲と分配ダメージ▲が重なる編成でだけモデルがずれる）。
3. **味の消去**（2.3 節）
   - 推奨: 切り替えの組 `taste` で書く（語彙は増えない）。
   - 代わりの案: `cancelState` に `{ buffApplied }` を開いて、説明文の行どおりに書く。
4. **あと味効果▲の形**（2.4 節）
   - 推奨: E1・E2・E3 と T1・T2 を予測に書いて撮影で選び、選んだ形だけを `dotEffect`（`dotState` で dot の状態を指す timed の stat）として足す。
5. **あと味の付け直しと tick の時刻**（1 節）
   - 推奨: 3 発ごとの付け直し（モデルで約 4.7 秒ごと。維持 5 秒とほぼ同じ）で、同じあと味として付け直すか（C-0136 の形）・重なるか、tick が付いた瞬間からか（`atApplication`）・1 秒後からか（`afterInterval`）を撮影で選ぶ。
6. **S2 の 3 回の数え方**（1 節）
   - 推奨: K2（戦闘を通して数える。語彙は足さない）を本命に、K1（やみつきの味が付いてから数える）も予測に書いて撮影で選ぶ。K1 なら数える窓を timed・dot に開く語彙を足す（この PR に入れる）。
7. **撮影の編成と本数**（V-0785）
   - 推奨: 撮り方 1 を 2 本（問いが多く、あと味の tick とロザンナ：シックオーシャンの AR の発が重なって読めない回が出る見込み）、撮り方 2 を 1 本、撮り方 3 を 1 本（手動バースト。90 秒まででよい）。
8. **PR の範囲**
   - 推奨: 2.1〜2.4 節の語彙・ブレッディの定義・撮影の結論を 1 本にする。クラストは定義しない。

## 決めたこと（撮った後）

- 論点 1〜8 は推奨どおり。読みは C1（減算の式）・K2（戦闘を通して数える）・F1（`atApplication`）・E1・T1 を選んだ（C-1276・C-1281・C-1283）。
- あと味の付け直しの形（論点 5）は、3 発ごとの付け直しが前のあと味の最後の tick の後に来て値に出ないので決めず、dot に `state` を書かない（効果ごとの持続ダメージ）。条件つきの dot は `state` を書けない（`skills/parse/dot.ts`）ので、2.4 節の語彙は、状態を指す `dotState` を持たず、持ち主の持続ダメージ（sustained の tick）の全部に別の乗数で掛ける stat `dotEffect` にした。持続ダメージを 2 つ以上持つキャラが同じ言い回しを持てば、そのとき指す欄を足す。
- 分配ダメージは発の 6f 後に出る（`delayFrames: 6`。C-1282）。
- やみつきの味の間は、持続ダメージ▲が切れた後もオススメの味が付かなかった（C-1278。撮り方 3）。オススメの味の付与の条件に、説明文の `selfBuffed`（`present: false`）に加えて `selfState: { state: lingeringTaste, present: false }` を書いた。説明文の「持続ダメージ増加状態」がやみつきの味を含むのかは分からないので、C-1278 と説明文の条件の C-1280 は仮説のまま。オススメの味が先に付いた後のやみつきの味による消去は撮っていない（定義の補足の notes）。
- 撮り方 3 は、モデルの手動バーストが II を選べないので、モデルと比べない記録の観測値にした。

## 経過

- 2026-11-15: 起案。説明文の全行を語彙と照らし、足りないのは 3 つ（2.1〜2.3 節）とあと味効果▲の形（2.4 節）と分かった。論点 1〜8 と撮影（V-0785）をオーナーに諮る。
- 2026-11-15: オーナーが論点 1〜8 を推奨どおりに決めた。撮影（録画 1203〜1206。V-0785）を読み、2.1〜2.3 節の語彙と `dotEffect`、ブレッディの定義を実装した。読みと違いは「決めたこと」のとおり。
