# 設計書: レイ（仮称）（834）のスキルの定義（攻撃態勢・アンチA.T.フィールドのスタック量▲・殲滅態勢の味方）

- 手順: [skills-guide.md](skills-guide.md)（1.1 選ぶ → 1.2 説明文を分解する → 1.3 設計書 → 1.4 実装する）
- 関連: [design-asuka-wille.md](design-asuka-wille.md)（殲滅態勢・アンチA.T.フィールドを付ける側。数え方 K2・殲滅のスタックコピー）、[design-named-state.md](design-named-state.md) 4.2 節（キャラをまたぐ状態の組）・8.1 節（時間で変わる状態の対象の絞り込み）、[design-skill-stage3.md](design-skill-stage3.md) 1.1 節（スタック量▲）、[design-skill-stage13.md](design-skill-stage13.md) 2.6 節（敵の持続ダメージのスタック量▲）、[design-adjacent-allies.md](design-adjacent-allies.md) 2.5 節（味方の全部のスタック可能バフへのスタック量▲）、[design-elegg-s3.md](design-elegg-s3.md) 3 節（条件 `enemyState` の数え方 K1）
- 検証: V-0788
- 作成日: 2026-11-15
- 状態: 起案

## 0. 範囲

- レイ（仮称）（SSR・火力型・AR・風圧・バースト III）の S1・S2・バーストを `packages/core/data/skills/834.json` に定義し、撮影（V-0788）で結論に結び付ける。
- S1 の 2 つの効果（18 回命中の効果・フルバーストの殲滅態勢の味方への効果）は、アスカ：WILLE（835）が付ける状態（敵のアンチA.T.フィールド・味方の殲滅態勢）を読む。アスカ：WILLE の定義（V-0781）は main にある。
- 足りない語彙は 2 つ（2.1・2.2 節）。どちらも、いまは同じ定義の中か静的な状態に限っている語彙を、他のキャラの付けた時間で変わる状態に開く形。

### 0.1 コードで確かめた、いまのモデル（2026-11-15）

- damage の条件 `enemyState` は、敵の状態の件ならどの枠のものでも見る（付与の件も持続ダメージの件も。`frame/plan.ts` の `enemySpans`）。同じ定義に付与が無くてもよい。アスカ：WILLE の付けるアンチA.T.フィールドを、レイ（仮称）の damage の条件で読める。
- スタック量▲（`stackChange`）の足す先は、同じ定義の付与の状態の、自分の件の列（`skills/holders/sources.ts` の `createStackSources`）。`target: "enemy"` は、同じ定義の `firstTick: halfAfterLatest` の持続ダメージの状態だけ（`skills/parse/crossChecks.ts` の `validateDotStateRefs`）。他のキャラが敵に付けた付与の件には足せない。
- 味方の全部のスタック可能バフへのスタック量▲（`allStackable`）は、どの枠の定義から付いた件にも足せるが、敵に付く状態を除く（`skills/holders/fire.ts` の `fireAllStackable`）。
- 対象の絞り込み `targetState` が見るのは、枠の静的な状態だけ（`skills/composition.ts` の `fixedTargetsOf`。戦闘開始時から戦闘の終わりまで付く付与）。殲滅態勢（バーストの使用で 9 秒）のような時間で変わる状態では絞れない。
- 「直前にバーストスキルを使用した〈武器〉の味方」は、`target: "burstUsers"` と `targetWeapon` で書ける（アルカナの S1 は `targetElement` で同じ形）。
- 立ち上げ速度▲▼（`spinUpSpeed`）は和を取り、MG の 1 発ごとのレートの上がり幅に max(0, 1 + Σ) を掛ける（C-0743。`frame/firing.ts`）。▼の間の発は立ち上がりに数えない（C-1269。立ち上げ速度が 0 の発）。
- アスカ：WILLE のアンチA.T.フィールドは、殲滅態勢の間の 10 発ごと（戦闘を通した数）に 1 スタック・30 スタック・30 秒で付き、殲滅態勢の終わりの 5f 後に殲滅がスタックの数を写してから消える（C-1265・C-1266・C-1267）。射撃場では、アンチA.T.フィールドが付いているのは殲滅態勢の 9 秒の間だけ。

## 1. 説明文の分解（スキル Lv10。スペック固定 ON の撮影の値）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| S1 | 通常攻撃が 18 回命中した時、対象がアンチA.T.フィールド状態なら、対象に最終攻撃力の 590.64% の追加ダメージ | 語彙にある | damage（`{ count: normalHit, everyRef: 1 }`・条件 `enemyState: antiATField`・`additional`・`ref: 2`）。数え方は 2.3 節 |
| S1 | 同じきっかけで、アンチA.T.フィールドのスタック量 10 個▲ | 語彙を足す（2.1） | `stackChange`（`antiATField`・`target: enemy`・同じきっかけと条件・`amountRef: 3`） |
| S1 | 自分が攻撃態勢状態なら、通常攻撃が 7 回命中した時、対象に最終攻撃力の 286.37% の追加ダメージ | 語彙にある | damage（`{ count: normalHit, everyRef: 4 }`・条件 `selfState: attackState`・`additional`・`ref: 5`）。数え方は 2.3 節 |
| S1 | フルバーストタイムが発動した時、殲滅態勢状態の味方全体に、殲滅態勢の追加効果適用対象 1▲（9 秒） | 前提の外 | notes（`outOfScope`）。追加効果の対象が 2 機から 3 機になる。敵 1 体の前提では、追加効果は毎回その敵に当たる（V-0781） |
| S1 | 同じく、殲滅態勢の追加効果攻撃範囲 500%▲（9 秒） | 前提の外 | 上と同じ notes。射撃場の敵は毎回範囲に入っている |
| S1 | 同じく、スキル発動者基準で攻撃力 17.6%▲（9 秒） | 語彙を足す（2.2） | timed（`fullBurstStart`・`allies`・`targetState: annihilationState`・`attack`・`casterAttack`・`ref: 10`・`durationRef: 11`） |
| S2 | フルバーストタイムが発動した時、直前にバーストスキルを使用したマシンガンの味方全体に、マシンガン立ち上げ速度 100%▲（13 秒） | 語彙にある | timed（`fullBurstStart`・`burstUsers`・`targetWeapon: MG`・`spinUpSpeed`・`ref: 1`・`durationRef: 2`） |
| S2 | フルバーストタイムが発動した時、味方全体にスキル発動者基準で攻撃力 11.61%▲（10 秒） | 語彙にある | timed（`fullBurstStart`・`allies`・`attack`・`casterAttack`・`ref: 3`・`durationRef: 4`） |
| バースト | 自分に「攻撃態勢」：攻撃ダメージ 35.9%▲（10 秒）・スキル発動者基準で攻撃力 63.36%▲（10 秒） | 語彙にある | 状態の付与（`attackState`・`burstUse`・`self`・`durationRef: 2`・中身 `attackDamage` `ref: 1`・`attack` `casterAttack` `ref: 3`）。状態そのものの維持は書かれていないので、項目の維持（どちらも 10 秒）と読む |
| バースト | 敵全体に最終攻撃力の 990.2% のバーストスキルダメージ | 語彙にある | `burstDamage`（`skill`・`ref: 5`）。敵 1 体の前提で 1 ヒット |

- 攻撃態勢は、項目がどちらも状態の間だけ持ち主に効くので、中身（`contents`）に書く（[design-named-state.md](design-named-state.md) 4.3 節）。目録に `attackState`（英語版の「Attack State」。殲滅態勢の `annihilationState` にそろえる）を足す。
- 「アンチA.T.フィールドスタック量 10 個▲」は、[design-skill-stage3.md](design-skill-stage3.md) 1.1 節の言い回し（付いている状態に N スタックを足す）と読む。上限（30）は付けた側の付与のもの。最大スタック数▲（上限を 40 にする）とは読まない（最大スタック数▲は「最大スタック数」と書かれる）。どちらかは撮影で見る（4 節の A1・A2）。

## 2. 語彙

### 2.1 他のキャラが敵に付けた状態のスタック量▲（論点 1）

- `stackChange` の `target: "enemy"` が、敵にスタックで付く状態の付与（`kind: "state"`・`target: "enemy"`・上限あり）の状態も指せるようにする。付与は同じ定義に無くてよい（編成のどの枠の定義でもよい）。
- 意味: 発火のフレーム（射撃の回数のきっかけは次のフレーム。いまの `stackChange` と同じ）に、敵に付いているその状態の件（どの枠が付けたものでも）に N スタックを足す。上限・維持・中身は件を付けた付与のもの。件が付いていなければ足さない（いまの敵の `stackChange` と同じく、条件 `{ enemyState: 状態 }` を必ず書く）。増加だけ。
- 足したスタックは、付けた枠の件の一部になる。アスカ：WILLE の殲滅（付けた枠のスタックの数を写す。`perCount: { enemyState }`）と、受けるダメージ▲の中身も、足したスタックを数える。
- 段は 1.5（足す先の件を読む。`existingOnly`・`allStackable` と同じ）。足す先の件の列は、組み立ての後の最初の発火で選ぶ（`fireAllStackable` と同じ）。
- 見る付与が編成のどこにも無ければ何もしない（アスカ：WILLE のいない編成）。読み込みの検査は、目録の `holder: "enemy"` と、条件 `enemyState` が同じ状態であることだけにする（同じ定義に付与があることは求めない）。
- 代わりの案: 未対応の notes にする（S1 が `partial`。アスカ：WILLE と組むと、受けるダメージ▲の積み上がりと殲滅の値がモデルで低く出る）。

### 2.2 時間で変わる状態の味方を対象にする（論点 2）

- timed の `targetState` が、時間で変わる状態（バーストの使用などで付く付与の状態）も指せるようにする。発火のフレームにその状態の件が付いている枠だけに付く（[design-named-state.md](design-named-state.md) 8.1 節の見込みの形）。どの枠の定義が付けた件でもよい。
- 見え方: 発火のフレーム f に件が付いていれば当たる（f に付いた件も入れる）。殲滅態勢はアスカ：WILLE のバーストの効果のフレーム（00.00 の 1f 前。C-1262）に付き、フルバーストの開始（00.00）に見える（C-1263 と同じ）。付いた後は、状態が外れても timed の維持（9 秒）の終わりまで続く。
- 段: 件を読むので 1.5（条件 `selfState` と同じ）。対象の枠の決め方は、静的な状態は今のまま（編成の組み立てで決める）。時間で変わる状態（編成のどの定義にも静的でない付与がある状態）は、編成の組み立てでは武器種などの絞り込みだけを当て、発火の文脈（`FireContext`）に「f にその状態を持つ枠」を入れて絞る（`targetDefense` の `lowerDefense` と同じ形）。
- 書けるのは timed だけ（付与・heal は使い手が出た時に開く）。`includeSelf` との組はそのまま書ける。
- 代わりの案: 未対応の notes にする（S1 が `partial`。アスカ：WILLE の殲滅態勢の 9 秒の攻撃力▲がモデルから抜ける）。

### 2.3 命中の数え方（論点 3。語彙は撮影の後に決める）

- 7 回・18 回の命中の数え方は、説明文の日本語（「自分が攻撃態勢状態なら、通常攻撃が 7 回命中した時」「通常攻撃が 18 回命中した時、対象がアンチA.T.フィールド状態なら」）と英語版（「after landing 7 normal attacks while in Attack State」「after landing 18 normal attacks against a target in the Anti A.T. Field state」）で読みが分かれる。撮影で選ぶ。
  - **H1（本命）**: 戦闘を通して数え、7（18）の倍数に届いた命中の時に、自分が攻撃態勢（敵がアンチA.T.フィールド）なら起きる。いまの語彙（窓なしの回数と条件）で書ける。アスカ：WILLE の 10 発ごと（C-1266）とエレグの S1・S2（K1。[design-elegg-s3.md](design-elegg-s3.md) 経過）がこの形。
  - **H2**: その状態の間の命中だけを数え、状態が付くたびに 0 から数え直す。7 回の方は damage の `during: { state }`（[design-asuka-wille.md](design-asuka-wille.md) 2.4 節の案。アスカ：WILLE では要らなかった）、18 回の方は `during: { enemyState }`（[design-elegg-s3.md](design-elegg-s3.md) 3.3 節の K2 の案）を足す。H2 が選ばれたら、その語彙を同じ PR で足す。
- 録画で見るもの: 攻撃態勢（殲滅態勢の後の最初のアンチA.T.フィールド）が付いてから、1 回目の追加ダメージが何回目の命中で出るか。H2 なら毎回 7（18）回目、H1 ならフルバーストごとにずれる。

### 2.4 足さないもの

- **殲滅態勢の追加効果の適用対象・攻撃範囲の▲**: 敵 1 体の前提では効かない（前提の外の notes）。
- **立ち上げ速度▲と緊急修復の▼の重なり**: いまの和の形（C-0743）のまま。アスカ：WILLE がバーストを使った回は、レイ（仮称）の▲（フルバーストの開始から 13 秒）と緊急修復の▼（殲滅態勢の終わりから 3 秒）が重なり、和が 0 でふだんの立ち上がりになる。撮影で見る（4 節の P1・P2）。

## 3. 定義の案（`data/skills/834.json`。値は `ref`）

```json
"skill1": { "effects": [
  { "kind": "damage", "trigger": { "count": "normalHit", "everyRef": 1 }, "condition": { "enemyState": "antiATField" },
    "damageType": "additional", "ref": 2 },
  { "kind": "stackChange", "state": "antiATField", "target": "enemy", "trigger": { "count": "normalHit", "everyRef": 1 },
    "condition": { "enemyState": "antiATField" }, "amountRef": 3 },
  { "kind": "damage", "trigger": { "count": "normalHit", "everyRef": 4 }, "condition": { "selfState": "attackState" },
    "damageType": "additional", "ref": 5 },
  { "kind": "timed", "trigger": "fullBurstStart", "target": "allies", "targetState": "annihilationState",
    "stat": "attack", "scaling": "casterAttack", "ref": 10, "durationRef": 11 }
], "notes": [ "追加効果の適用対象・攻撃範囲の▲（outOfScope）" ] },
"skill2": { "effects": [
  { "kind": "timed", "trigger": "fullBurstStart", "target": "burstUsers", "targetWeapon": "MG", "stat": "spinUpSpeed",
    "ref": 1, "durationRef": 2 },
  { "kind": "timed", "trigger": "fullBurstStart", "target": "allies", "stat": "attack", "scaling": "casterAttack",
    "ref": 3, "durationRef": 4 }
] },
"burst": { "effects": [
  { "kind": "state", "state": "attackState", "trigger": "burstUse", "target": "self", "durationRef": 2,
    "contents": [ { "stat": "attackDamage", "ref": 1 }, { "stat": "attack", "scaling": "casterAttack", "ref": 3 } ] },
  { "kind": "burstDamage", "ref": 5, "damageType": "skill" }
] }
```

- トピックブランチの定義は、2.1・2.2 節の 2 つの効果を未対応の notes にした下書き（承認の後に効果に替える）。

## 4. 検証（撮影）

- 撮影は V-0788（編成・混ざる要素・予測・撮影の依頼はそちら）。
- 編成 A（レイ（仮称）がバーストを使う）: I-DOLL・フラワー（I）+ デルタ（II）+ レイ（仮称）（III・操作）。攻撃態勢・7 回命中の追加ダメージ・S2 の味方全体の攻撃力▲・バーストのダメージを見る。殲滅態勢・アンチA.T.フィールド・MG の味方がいないので、S1 の残りと S2 の立ち上げ速度▲は起きない。
- 編成 B（アスカ：WILLE がバーストを使う）: 編成 A のレイ（仮称）の代わりにアスカ：WILLE（III・操作。V-0781 と同じ）を置き、4 枠目にレイ（仮称）。III は枠の若いアスカ：WILLE が撃つ（モデルでは 4 回とも）。18 回命中の効果とスタック量▲（A1: 10 スタックを足し 30 で止まる・A2: 上限が 40 になる）、殲滅態勢の味方への攻撃力▲、立ち上げ速度▲（P1: 緊急修復の▼と和で 0 になり、ふだんの立ち上がり・P2: ▼が勝ち、1 秒に 1 発のまま）、S2 の味方全体の攻撃力▲を見る。

## 5. 実装の順とリスク

- 実装は、論点の承認の後に 2.1・2.2 節を入れ、撮影の後に録画が選んだ読み（H1・H2、A1・A2）で定義を書き直す（1 段ごとに `npm test`）。
  1. `skills/types.ts`・`skills/parse/`（`state.ts` の `parseStackChangeEffect`・`crossChecks.ts`・`target.ts`・`timed.ts`）: 2.1・2.2 節の検証。単体テスト。
  2. `skills/holders/`（`sources.ts`・`fire.ts`・`register.ts`・`views.ts`）・`skills/targets.ts`・`skills/composition.ts`: 敵の付与の件へのスタック量▲、発火の文脈の「状態を持つ枠」。
  3. 既存のテストが数値を変えずに通ること。
  4. 定義 `834.json`、編成のテスト（編成 B）、最小構成の検査の感度（`npm run records:minimal`）。
- リスク:
  - 同じフレームの順: 18 回目の命中のフレームで、アスカ：WILLE の 10 発ごとの付与（段 1.5）と、レイ（仮称）のスタック量▲（段 1.5）が重なったとき、足す先の件が付いているか。最初のスタックより前の命中では足さない（件が無い）。
  - 殲滅（終了の 5f 後）とアンチA.T.フィールドの消去の間の 18 回目の命中。消す前なら足し、条件も満たすので追加ダメージが出る。
  - 時間で変わる `targetState` の timed は、攻撃力（1 パス目で窓を追う stat）なので、1 パス目で対象を決める段の順に入る。`selfState` の条件の timed と同じ段 1.5 に置けば、同じフレームのバーストの使用で付いた殲滅態勢が見える見込み。

## 6. 論点（オーナーに決めてもらうこと）

1. **他のキャラが敵に付けた状態のスタック量▲**（2.1 節）
   - 推奨: `stackChange` の `target: "enemy"` を、編成のどの枠の付与が敵に付けた状態にも開く。
   - 代わりの案: 未対応の notes にする（S1 が `partial`）。
2. **時間で変わる状態の味方を対象にする**（2.2 節）
   - 推奨: timed の `targetState` を、発火のフレームにその状態を持つ枠に開く（時間で変わる状態のときだけ。静的な状態は今のまま）。
   - 代わりの案: 未対応の notes にする（S1 が `partial`）。
3. **命中の数え方**（2.3 節）
   - 推奨: H1（戦闘を通して数える。いまの語彙）を本命に、H2（状態の間だけ数える）も予測に書いて撮影で選ぶ。H2 が選ばれたら、その数える窓の語彙を同じ PR で足す。
4. **スタック量 10 個▲の読み**（1 節）
   - 推奨: A1（付いているスタックに 10 を足し、上限 30 で止まる）を本命に、A2（上限が 40 になる）も予測に書いて撮影で選ぶ。
5. **撮影の編成**（4 節・V-0788）
   - 推奨: 編成 A を 1 本、編成 B を 2 本。どちらもオートバースト ON。
6. **PR の範囲**
   - 推奨: 2.1・2.2 節の語彙（H2 なら 2.3 節の数える窓も）・レイ（仮称）の定義・撮影の結論を 1 本にする。

## 経過

- 2026-11-15: 起案。説明文の全行を語彙と照らし、足りないのは 2 つ（2.1・2.2 節）と分かった。論点 1〜6 と撮影（V-0788）をオーナーに諮る。
