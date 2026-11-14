# 設計書: アスカ：WILLE（835）のスキルの定義（殲滅態勢・アンチA.T.フィールド・殲滅・緊急修復）

- 手順: [skills-guide.md](skills-guide.md)（1.1 選ぶ → 1.2 説明文を分解する → 1.3 設計書 → 1.4 実装する）
- 関連: [design-named-state.md](design-named-state.md) 4.3 節（「〈名前〉：機能…」を中身にしない形。殲滅態勢の例）、[design-grave.md](design-grave.md) 2.1・2.4 節（`{ ended }` と、状態の間だけ数える回数）、[design-mast.md](design-mast.md) 2.1・2.3 節（敵に付く状態のスタックと、そのスタックコピー）、[design-skill-stage13.md](design-skill-stage13.md) 2.5 節（消去）、[design-new-chars-1029.md](design-new-chars-1029.md) 5.6 節（`spinUpSpeed`）、[design-skill-stage20.md](design-skill-stage20.md) 2.3 節（リロード速度の固定）
- 検証: V-0781
- 作成日: 2026-11-14
- 状態: 起案（論点をオーナーに諮る）

## 0. 範囲

- アスカ：WILLE（SSR・火力型・MG・風圧・バースト III）の S1・S2・バーストを `packages/core/data/skills/835.json` に定義し、撮影（V-0781）で結論に結び付ける。
- 説明文に「味方」は出てこず、効果はどれも自分と敵に付く。敵に付くアンチA.T.フィールド（受けるダメージ▲）だけが、味方の与ダメージも変える。
- 足りない語彙は 4 つ（2.1〜2.4 節）。どれも既にある語彙の制限を、ほかの種類の効果に開く形。
- 殲滅態勢・アンチA.T.フィールドは、定義の無いレイ（仮称）（834）の S1 も読む（[design-skill-stage17-inventory.md](design-skill-stage17-inventory.md) 0.6 節の組）。レイ（仮称）は今回定義しない。目録の id は、レイ（仮称）を定義する時にそのまま指せるように付ける。

### 0.1 コードで確かめた、いまのモデル（2026-11-14）

- `{ ended: 状態 }` は `counterChange`・`ammoDecrease`・状態の付与だけが受ける（`skills/parse/trigger.ts`）。damage・timed・`cancelState` は受けない。
- damage の `perCount`（値 × 数）は、自分の状態のスタック数（`{ state }`）かカウンタの値（`{ counter }`）で、きっかけは `burstUse` だけ。敵に付いた状態のスタック数を写すのは dot の `stacksFrom: { enemyState }` だけ（マストの暴風。`sustained: false` の周期のダメージ）。
- `cancelState` の `target: "enemy"` は、同じ定義の `firstTick: halfAfterLatest` の dot の状態だけを指せる（`skills/parse/crossChecks.ts` の `validateDotStateRefs`）。敵に付けた状態の付与（海風のような `target: "enemy"` の付与）は消せない。
- 回数のきっかけの数える窓 `during: { state }`（その状態が付くたびに 0 から数え直す）は、状態の付与にだけ書ける（`skills/types.ts` の `StateCountWindow`）。damage は `during: "fullBurst"` だけ。
- 状態の付与の `target: "enemy"`・`maxStacksRef`・中身の `damageTaken`（敵が持つ stat）は語彙にある（マストの海風）。付与の条件 `selfState` に、ほかの自分の状態の `present: true` を書ける。
- `spinUpSpeed` は MG の 1 発ごとのレートの上がり幅に max(0, 1 + Σ) を掛ける（C-0743。`frame/firing.ts`）。100%▼ なら上がり幅が 0 で、マガジンの何発目でも最初のレート（60 発/分）のまま。窓が切れると、そのマガジンの発の数から計算したレートに戻る（`cadence.ts` の `rateAfterShots`）。
- `normalAttackDamage`（通常攻撃ダメージ倍率）は、武器倍率に (1 + Σ) を掛けて四捨五入する（C-0121）。▼（`decrease`）は読み込みが受けるが、使う定義はまだ無い。
- 「フルバーストタイムが発動した時、自分が〈状態〉なら」で、同じバーストの使用で付いた状態が見えるのは、マリアン：クイーンの S2 と同じ（C-0741）。

## 1. 説明文の分解（スキル Lv10。スペック固定 ON の撮影の値）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| S1 | 通常攻撃が 50 回命中した時、対象に最終攻撃力の 471.86% の追加ダメージ | 語彙にある | damage（`{ count: normalHit, everyRef: 1 }`・`additional`・`ref: 2`） |
| S1 | 自分が殲滅態勢の時に限り、10 発ごとに照準線に最も近い敵 2 機に最終攻撃力の 15.62% のダメージ | 語彙を足す（2.4） | damage（`{ count: normalShot, everyRef: 4, during: { state: annihilationState } }`・`skill`・`ref: 6`）。敵 1 体の前提なので 2 機は 1 機（`assumes`） |
| S1 | 同じきっかけで、対象に「アンチA.T.フィールド：受けるダメージ 0.83%▲」「30 スタック」「30 秒間維持」 | 語彙にある | 状態の付与（`antiATField`・`target: enemy`・同じきっかけ・`maxStacksRef: 8`・`durationRef: 9`・中身 `damageTaken`・`ref: 7`） |
| S2 | フルバーストタイムが発動した時、自分が殲滅態勢なら、自分に攻撃ダメージ 30.97%▲（10 秒） | 語彙にある | timed（`fullBurstStart`・条件 `selfState: annihilationState`・`attackDamage`・`ref: 1`・`durationRef: 2`） |
| S2 | 殲滅の効果発動時、自分に緊急修復: マシンガン立ち上げ速度 100%▼（3 秒） | 語彙を足す（2.1） | timed（`{ ended: annihilationState }`・`spinUpSpeed`・`decrease`・`ref: 3`・`durationRef: 4`） |
| S2 | 緊急修復: 残弾数 100% 減少 | 語彙にある | `ammoDecrease`（`{ ended: annihilationState }`・`ref: 5`） |
| S2 | 緊急修復: 最終最大HP の 3.77% 持続回復（1 秒間隔・3 秒） | ダメージに関係しない | notes（`noDamage`）。自分にだけ付き、アスカ：WILLE に回復を受けた時の効果は無い |
| S2 | 緊急修復: リロード速度 60% 増加状態で固定（1 発間） | 語彙にある・固定は未対応（2.5） | timed（`{ ended: annihilationState }`・`reloadSpeed`・`ref: 8`・`durationShotsRef: 9`）。「固定」は未対応の notes |
| バースト | 自分に殲滅態勢（機能のみ。状態そのものの維持は書かれていない） | 語彙にある | 中身の無い付与（`burstUse`・`self`・`durationRef: 8`。9 秒。目録に `annihilationState`）。維持の読みは撮影で選ぶ（4 節） |
| バースト | 殲滅態勢: 通常攻撃ダメージ 40% 倍率▼（9 秒） | 語彙にある | timed（`burstUse`・`normalAttackDamage`・`decrease`・`ref: 7`・`durationRef: 8`） |
| バースト | 殲滅態勢: 弾丸チャージ 21% | 語彙にある | `ammoRefill`（`burstUse`・`ref: 1`） |
| バースト | 殲滅態勢: スキル発動者基準で攻撃力 46.8%▲（9 秒） | 語彙にある | timed（`attack`・`scaling: casterAttack`・`ref: 2`・`durationRef: 3`） |
| バースト | 殲滅態勢: 攻撃ダメージ 36%▲（9 秒） | 語彙にある | timed（`attackDamage`・`ref: 4`・`durationRef: 5`） |
| バースト | アンチA.T.フィールド状態の対象に殲滅: 殲滅態勢が終了した時、最終攻撃力 6.62% の追加ダメージ・アンチA.T.フィールドのスタックコピー | 語彙を足す（2.1・2.2） | damage（`{ ended: annihilationState }`・`additional`・`ref: 6`・`perCount: { enemyState: antiATField }`） |
| バースト | 殲滅: 効果適用後、アンチA.T.フィールド解除 | 語彙を足す（2.1・2.3） | `cancelState`（`antiATField`・`target: enemy`・`{ ended: annihilationState }`） |

- 殲滅態勢は、[design-named-state.md](design-named-state.md) 4.3 節のとおり中身にせず、同じ `burstUse` の別の効果で書き、見る側（S1 の数える窓・S2 の条件・殲滅のきっかけ）のために中身の無い付与を足す。維持は、項目の維持（どれも 9 秒）と同じ 9 秒と読む。S1 の説明文に出てこない値 03 も 9 で、殲滅態勢の追加効果の維持とみられる。
- 「殲滅の効果発動時」は、殲滅態勢が終了した時（殲滅のきっかけと同じ）と読む。殲滅は「アンチA.T.フィールド状態の対象に」起きるので、敵にアンチA.T.フィールドが無ければ殲滅も緊急修復も起きないはず。射撃場では殲滅態勢の 9 秒に 10 発以上を必ず撃つ（的のジャンプの 2 秒を挟んでも）ので、条件は書かず `assumes` に書く。
- 10 発ごとの「発」は射撃（`normalShot`）と読む。50 回の「命中」は `normalHit`（命中の期待値）。

## 2. 語彙

### 2.1 状態が終了した時のきっかけを、damage・timed・敵の状態の消去に開く（論点 1）

- `{ ended: 状態 }` を damage・timed・`cancelState`（`target: enemy`）のきっかけに書けるようにする。意味はいまの形のまま（自分のその状態の件が外れた最初のフレーム f）。見る状態は、同じ定義の自分に付ける付与のあるもの（いまと同じ検査）。
- f の順: 殲滅（damage）は f の効果の判定で、f に敵に付いているアンチA.T.フィールドのスタックの数を写し、アンチA.T.フィールドの受けるダメージ▲も乗った値で出る。消去は f の判定の後に件を閉じる（いまの `cancelState` の見え方）。残弾数減少は f に残弾を 0 にして込め始め、リロード速度▲（1 発間）はその込めに効く。立ち上げ速度▼は f から 3 秒。
- timed の発火は、射撃の stat（`spinUpSpeed`・`reloadSpeed`）なので 1 パス目の窓に入る。殲滅態勢の終わりは時間（9 秒）で決まり、射撃からは決まらないので、循環はしない見込み。
- [design-grave.md](design-grave.md) 2.1 節で timed に開かなかったのは、使い手がいなかったため。

### 2.2 damage の `perCount: { enemyState }`（「個別対象ごとに〈名前〉スタックコピー」。論点 2）

- damage の値 × 数の `perCount` に、敵に付いた状態のスタック数 `{ enemyState: 状態 }` を足す。発火のフレームに敵に付いているその状態のスタックの数を倍率に掛け、0 なら出さない。見る状態は、同じ定義の敵にスタックで付ける付与のあるもの（dot の `stacksFrom: { enemyState }` と同じ検査）。
- きっかけは `{ ended }` に限る（使い手は殲滅だけ）。dot の `stacksFrom`（暴風）と違い、1 回だけのヒット。
- 代わりの案: dot（`stacksFrom: { enemyState }`・`sustained: false`）の tick 1 回で書く。周期のダメージの形を 1 回のヒットに曲げることになり、tick の時刻の欄（`firstTick`）が意味を持たないので採らない。

### 2.3 敵に付けた状態の付与の消去（論点 3）

- `cancelState`（`target: enemy`）が、同じ定義の敵に付ける状態の付与（`target: enemy` の付与）も指せるようにする。発火のフレーム f の判定の後に、敵のその状態の件（スタックはすべて）を f + 1 で閉じる。dot の状態の消去と同じ見え方。
- 「解除」（`removeState`）は自分の状態だけで、敵の状態は消去（`cancelState`）が受け持っているので、そちらに足す。説明文の「解除」と「消去」の言葉の違い（解除不可を外すか）は、アンチA.T.フィールドに解除不可が無いので効かない。

### 2.4 damage の数える窓 `during: { state }`（論点 4）

- damage の回数のきっかけに、数える窓 `during: { state }` を書けるようにする（いまは状態の付与だけ）。その状態の件の間の射撃だけを数え、件が始まるたびに 0 から数え直す。付与の条件で絞る数え方（C-1123）は、damage には付与の条件が無いので、件の間の全部の発を数える。
- アンチA.T.フィールドの付与（同じきっかけ）は、いまの語彙で `during: { state }` を書ける。両方を同じ形にそろえる。
- 数え方は撮影で選ぶ:
  - **K1（本命）**: 殲滅態勢が付いてからの 10・20・30…発目。グレイブの過熱II と同じ（C-1123）。
  - **K2**: 戦闘を通して数え、10 の倍数に届いた発が殲滅態勢の間なら起きる（`firesDuring` の形）。K2 なら語彙は足さず、窓なしの回数に条件 `selfState: annihilationState` を付けて書く（damage・付与とも条件で書ける）。
- 録画で見るもの: バーストの使用から、1 回目のダメージ（15.62%）が何発目に出るか。K1 なら毎回 10 発目、K2 ならバーストごとにずれる。

### 2.5 足さないもの

- **リロード速度の「固定」**: 緊急修復の「リロード速度 60% 増加状態で固定」は、ほかのリロード速度▲▼を無視すると読める。アスカ：WILLE の定義だけでは、ほかのリロード速度▲▼が無いので、▲を足し合わせても同じ値（リロード 2.33 秒 × (1 − 0.6)）。足し合わせと分かれるのは、リロード速度▲を付ける味方のいる編成。いまは足し合わせで書き、固定は未対応の notes にする（スロットは `partial`）。値の固定の語彙は、リバーレリオ（別のセッションで検証中）・エクシアの宝物版・シンデレラ：クリスタルウェーブと一緒に決める（[design-skill-stage21.md](design-skill-stage21.md) 4 節の 8）。
- **持続回復**: 計算に無関係（`noDamage`）。
- **敵 2 機**: 敵 1 体の前提（[requirements.md](requirements.md) 4.2 節）で 1 機。補足の notes（`modeling`）。

## 3. 定義の案（`data/skills/835.json`。値は `ref`）

```json
"skill1": { "effects": [
  { "kind": "damage", "trigger": { "count": "normalHit", "everyRef": 1 }, "damageType": "additional", "ref": 2 },
  { "kind": "damage", "trigger": { "count": "normalShot", "everyRef": 4, "during": { "state": "annihilationState" } },
    "damageType": "skill", "ref": 6 },
  { "kind": "state", "state": "antiATField", "trigger": { "count": "normalShot", "everyRef": 4, "during": { "state": "annihilationState" } },
    "target": "enemy", "maxStacksRef": 8, "durationRef": 9, "contents": [ { "stat": "damageTaken", "ref": 7 } ] }
], "notes": [ "敵 2 機は、敵 1 体の前提で 1 機（modeling）" ] },
"skill2": { "effects": [
  { "kind": "timed", "trigger": "fullBurstStart", "condition": { "selfState": "annihilationState" }, "target": "self",
    "stat": "attackDamage", "ref": 1, "durationRef": 2 },
  { "kind": "timed", "trigger": { "ended": "annihilationState" }, "target": "self", "stat": "spinUpSpeed", "decrease": true,
    "ref": 3, "durationRef": 4 },
  { "kind": "ammoDecrease", "trigger": { "ended": "annihilationState" }, "target": "self", "ref": 5 },
  { "kind": "timed", "trigger": { "ended": "annihilationState" }, "target": "self", "stat": "reloadSpeed", "ref": 8,
    "durationShotsRef": 9 }
], "notes": [ "持続回復（noDamage）", "リロード速度の固定（unimplemented）" ] },
"burst": { "effects": [
  { "kind": "state", "state": "annihilationState", "trigger": "burstUse", "target": "self", "durationRef": 8 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "normalAttackDamage", "decrease": true, "ref": 7, "durationRef": 8 },
  { "kind": "ammoRefill", "trigger": "burstUse", "target": "self", "ref": 1 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "attack", "scaling": "casterAttack", "ref": 2, "durationRef": 3 },
  { "kind": "timed", "trigger": "burstUse", "target": "self", "stat": "attackDamage", "ref": 4, "durationRef": 5 },
  { "kind": "damage", "trigger": { "ended": "annihilationState" }, "damageType": "additional", "ref": 6,
    "perCount": { "enemyState": "antiATField" } },
  { "kind": "cancelState", "state": "antiATField", "trigger": { "ended": "annihilationState" }, "target": "enemy" }
] }
```

- 目録（`skills/states.ts`）に `annihilationState`（味方。英語版の「Annihilation State」）と `antiATField`（敵。「Anti A.T. Field」）を足す。
- 数え方が K2 なら、S1 の 2 つのきっかけを窓なしにして条件 `selfState: annihilationState` を付ける。殲滅態勢の維持が S10（4 節）なら、付与の維持を `durationUntil: "fullBurstEnd"` にする。

## 4. 検証（撮影）

- 撮影は V-0781（編成・混ざる要素・予測・撮影の依頼はそちら）。I-DOLL・フラワー（I）+ デルタ（II）+ アスカ：WILLE（III・操作）・オートバースト ON。どちらも機構が確定していて、アスカ：WILLE の与ダメージに効く効果が無い（デルタの防御力▲は間接）。単騎ではバースト III を使えないので 2 体を足す。
- 1 本にフルバーストが 4 回（モデル）。どの問いも毎回起きる（型 A）ので 1 本で決めて後の回で再現できるが、MG の 1 フレームの増分が重なって読みにくい回が出る見込みなので 2 本。
- 見るもの: 殲滅態勢の維持（殲滅の時刻が使用の 9 秒後（S9。本命）か、フルバーストの終わり（S10）か）、10 発ごとのダメージの数え方（K1・K2）、アンチA.T.フィールドの受けるダメージ▲の積み上がり（アスカ：WILLE とデルタの発の値）、殲滅の値（スタックの数 × 6.62%）、緊急修復（残弾が 0 になる時刻・込めの長さ・その後 3 秒の発の間隔）、通常攻撃ダメージ倍率▼の掛かり方（武器倍率 × 0.6 か）、S2 の攻撃ダメージ▲。

## 5. 実装の順とリスク

- 実装は、論点の承認の後に 2.1〜2.4 節を入れ、撮影の後に録画が選んだ読み（S9・S10、K1・K2）で定義を書き直す（1 段ごとに `npm test`）。
  1. `skills/types.ts`・`skills/parse/`（`trigger.ts`・`timed.ts`・`damage` の読み込み・`state.ts`・`crossChecks.ts`）: 2.1〜2.4 の型と検証、目録に 2 つの状態。単体テスト。
  2. `skills/holders/`・`skills/resolve.ts`・`skills/burstDamage.ts`・`frame/firstPass.ts`: ended の damage・timed・消去の発火、敵の状態のスタック数を掛けるヒット、状態の間だけ数える damage の回数。
  3. 既存のテストが数値を変えずに通ること。
  4. 定義 `835.json` と `index.json`、編成のテスト（I-DOLL・フラワー・デルタ・アスカ：WILLE）、最小構成の検査の感度（`npm run records:minimal`）。
- リスク:
  - 殲滅態勢の終わりのフレーム f で、殲滅（スタックを写す）・消去・残弾数減少・リロード速度▲・立ち上げ速度▼の順。消去が殲滅の判定より先に効くと、殲滅が出ない（0 スタック）。
  - 立ち上げ速度▼ の 3 秒が切れた後のレート。モデルはマガジンの発の数から計算し直す（0.1 節）。実機が▼の間の発を上がり幅に数えないなら、▼の後のレートが遅くなる。その時は録画の発の間隔で直し方を決める。
  - 1 パス目で、アンチA.T.フィールドの付与（敵の件）と、同じ発の 15.62% のダメージの、どちらが先に件を見るか。同じ発のダメージに、その発で付いたスタックの▲が乗るかは録画で見る。

## 6. 論点（オーナーに決めてもらうこと）

1. **殲滅態勢が終了した時のきっかけ**（2.1 節）
   - 推奨: `{ ended }` を damage・timed・敵の状態の消去に開く。殲滅と緊急修復の 4 つの効果をそのまま書ける。
   - 代わりの案: 殲滅と緊急修復を未対応の notes にする（バーストと S2 が `partial`。殲滅のダメージ・残弾の 0・込めの速さ・立ち上げの遅れがモデルから抜ける）。
2. **スタックコピーの追加ダメージ**（2.2 節）
   - 推奨: damage の `perCount` に `{ enemyState }` を足す（きっかけは `{ ended }` だけ）。
   - 代わりの案: dot の `stacksFrom: { enemyState }` の tick 1 回で書く（語彙は足さないが、周期のダメージの欄が意味を持たない）。
3. **アンチA.T.フィールドの解除**（2.3 節）
   - 推奨: `cancelState`（`target: enemy`）が、敵に付けた状態の付与も指せるようにする。
4. **殲滅態勢の間の 10 発ごとの数え方**（2.4 節）
   - 推奨: K1（殲滅態勢が付いてからの発を数える。damage に `during: { state }` を開く）を本命に、K2（戦闘を通して数える）も予測に書いて撮影で選ぶ。K2 が選ばれたら語彙は足さない。
5. **殲滅態勢の維持**（1 節・4 節）
   - 推奨: 項目の維持と同じ 9 秒（S9）を本命に、フルバーストの終わりまで（S10）も予測に書いて撮影で選ぶ。
6. **リロード速度の「固定」**（2.5 節）
   - 推奨: 足し合わせの timed（1 発間）で書き、固定は未対応の notes にする。値の固定の語彙は、ほかの使い手と一緒に決める。
7. **撮影の編成**（V-0781）
   - 推奨: I-DOLL・フラワー（I）+ デルタ（II）+ アスカ：WILLE（III・操作）、オートバースト ON、2 本。
8. **PR の範囲**
   - 推奨: 2.1〜2.4 節の語彙（撮影で K2 なら 2.4 節を除く）・アスカ：WILLE の定義・撮影の結論を 1 本にする。

## 経過

- 2026-11-14: 起案。説明文の全行を語彙と照らし、足りないのは 4 つ（2.1〜2.4 節）と分かった。論点 1〜8 と撮影（V-0781）をオーナーに諮る。
