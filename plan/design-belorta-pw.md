# 設計書: ベロータ：パンプキンウィッチ（63）のスキルの定義（右隣の味方 1 機）

- 手順: [skills-guide.md](skills-guide.md)（1.1 選ぶ → 1.2 説明文を分解する → 1.3 設計書 → 1.4 実装する）
- 関連: [design-rouge.md](design-rouge.md) 2.1 節・[design-adjacent-allies.md](design-adjacent-allies.md) 2.1 節（両隣の対象 `targetAdjacent`）、[design-trina.md](design-trina.md) 2.2 節（左端の対象 `targetLeftmost`。枠の番号の若い方が左）、[design-named-state.md](design-named-state.md)（名前の付いた状態）
- 検証: V-0859
- 作成日: 2026-11-22
- 状態: 完了

## 0. 範囲

- ベロータ：パンプキンウィッチ（SSR・支援型・RL・バースト II・水冷。CT 40 秒）の S1・S2・バーストを `packages/core/data/skills/63.json` に定義し、撮影で結論に結び付ける。宝物は無い。ベロータ（60）とは別のキャラ。
- 足す語彙は 1 つ（対象「自分の右隣の味方 1 機」。2.1 節）。ほかの行は既存の語彙で書ける。

## 1. 説明文の分解（スキル Lv10）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| S1 | フルバーストタイムが発動した時、自分に「おばけの仮装：単一攻撃の対象から除外。直接攻撃を受けると解除」「10 秒間維持」 | 語彙にある | 付与（`state: "ghostCostume"`・`fullBurstStart`・`self`・`durationRef: 1`。中身なし）。S2 の条件が見る。除外と解除は前提の外の notes（ウンファ：タクティカル・アップの S1 のカモフラージュと同じ扱い） |
| S1 | 同じきっかけで、自分に「イタズラ準備：最大HP 15.84%▲」「10 秒間維持」 | 間接（`hp`） | notes。読む側はいない（プリカの S1 の同じ形と同じ扱い） |
| S1 | フルバーストタイムが発動した時、自分の右隣の味方 1 機に「スキル発動者基準で攻撃力 44.88%▲」「10 秒間維持」 | 語彙を足す（2.1） | timed（`fullBurstStart`・`allies`・`targetAdjacent: "right"`・`attack`・`scaling: "casterAttack"`・`ref: 4`・`durationRef: 5`） |
| S2 | フルチャージ攻撃が命中した時、自分がおばけの仮装状態なら、対象に「おばけのイタズラ：受けるダメージ 10.56%▲」「10 秒間維持」 | 語彙にある | 敵への付与（`state: "ghostlyPrank"`・`{ count: "fullChargeShot" }`・条件 `selfState: "ghostCostume"`・`enemy`・中身 `damageTaken`・`durationRef: 2`）。命中を発の次のフレームとみなす（誘導弾の飛ぶ時間は入れない） |
| S2 | フルチャージして攻撃した時、自分の右隣の味方 1 機に「持続ダメージ 19.97%▲」「5 秒間維持」 | 語彙を足す（2.1） | timed（`{ count: "fullChargeShot" }`・`allies`・`targetAdjacent: "right"`・`sustainedDamage`・`ref: 3`・`durationRef: 4`） |
| バースト | 自分の右隣の味方 1 機に「スキル発動者基準で攻撃力 47.52%▲」「10 秒間維持」 | 語彙を足す（2.1） | timed（`burstUse`・同じ対象・`attack`・`casterAttack`・`ref: 1`・`durationRef: 2`） |
| バースト | 同じ 1 機に「持続ダメージ 27.23%▲」「10 秒間維持」 | 語彙を足す（2.1） | timed（`burstUse`・同じ対象・`sustainedDamage`・`ref: 3`・`durationRef: 4`） |

## 2. 足す語彙

### 2.1 論点 1: 対象「自分の右隣の味方 1 機」

- いまの語彙で編成の並びを読む対象は、両隣（`targetAdjacent: true`。自分の左右の枠）と左端（`targetLeftmost`。枠の番号の最も若い枠）だけで、右隣だけを指す形が無い。英語版は「the ally to the right of this unit」。説明文の「右隣の」にはゲーム内の用語のツールチップ（word_group 10109）が付くが、中身は撮っていない。
- **案 A（推奨）**: `targetAdjacent` の値に `"right"` を足す（`true` は両隣のまま）。
  - 右隣 = 編成の枠の順で自分の次の枠（枠の番号 + 1）。左端（`targetLeftmost`）が枠の番号の若い方なので、右は番号の大きい方と読む。両隣と同じく、空枠と最後の枠の外側は無し（その先の枠へは飛ばない）。右端の発動者では誰にも付かない。
  - 書けるのは、いまの `targetAdjacent` と同じ効果（timed・付与・回復）で、`target: "allies"` のときだけ。`includeSelf` とは組まない（「自分と右隣」の使い手がいない）。
  - 枠は編成の組み立て（`skills/composition.ts`）が `fixedTargets` に書く（両隣と同じ流れ。`skills/targets.ts` の `adjacentSlotsOf` に向きを足す）。
- 案 B: 別の欄（`targetRight: true` など）を足す。両隣と同じ組み立ての流れを使うのに、欄と組み合わせの検査が 2 組になる。採らない。
- 案 C: 語彙を足さず、右隣の 4 つの効果を未対応の notes にする（S1・S2・バーストが `partial`）。右隣の味方の攻撃力▲と持続ダメージ▲が抜け、モデルは与ダメージを低く出す。採らない。

## 3. 定義の案（`data/skills/63.json`）

- 1 節の表のとおり。目録（`skills/states.ts`）に `ghostCostume`（おばけの仮装。味方）と `ghostlyPrank`（おばけのイタズラ。敵）を足す。
- 根拠の結論は撮影の後に作り、効果と notes の `claims` に書く。

## 4. 検証

- 撮影は V-0859（編成・予測・撮影の依頼はそちら）。
  - 撮影 A（左にクルミ・中央にベロータ：パンプキンウィッチ・右にレイヴン）: 右隣にだけ付く攻撃力▲・持続ダメージ▲と、左隣に付かないこと（向き）。おばけの仮装の間の受けるダメージ▲（味方全体のヒットに乗る）。
  - 撮影 B（ベロータ：パンプキンウィッチを右端に）: 右隣がいないと誰にも付かないこと。

## 5. 退化の見込み

- 足すのは `targetAdjacent` の新しい値だけなので、既存の定義（両隣は `true`）の数値は変わらない。

## 6. 実装の順（論点 1 が決まったら。1 段ごとに `npm test`）

1. `skills/types.ts` の型（`TargetAdjacent`）と注記、`skills/parse/target.ts` の検証（`"right"` を受け、`includeSelf` と組まない）、その単体テスト。
2. `skills/targets.ts` の `adjacentSlotsOf` に向き、`skills/composition.ts` の枠の決め方。
3. [skill-phrases.md](skill-phrases.md) に「自分の右隣の味方 1 機」の行を足す。
4. 定義・目録の 2 つの状態・編成のテスト（`__tests__/belortaPwTeam.test.ts`。右隣だけに付くこと・右端で誰にも付かないこと・射撃の列の分け方）。
5. 予測（records/predictions/V-0859.json）。

## 7. 論点（オーナーに決めてもらうこと）

- 論点 1（2.1 節）: 右隣の対象を `targetAdjacent: "right"` で書くか。推奨は案 A。

## 8. 決めたこと

- 論点 1 は案 A（2026-11-22 のオーナーの判断）。両隣と同じ組み立ての流れ（`fixedTargets`）で書け、既存の両隣の定義の数値は変わらない（2.1 節）。

## 経過

- 2026-11-22: 起案。
- 2026-11-22: 論点 1 を案 A で実装した（`targetAdjacent: "right"`・定義の下書き・編成のテスト）。撮影は V-0859。
- 2026-11-22: 撮影（V-0859。録画 1378〜1380）を読み、右隣の対象とおばけのイタズラを確かめた。発動者基準の攻撃力▲も効果ごとに丸める形を既定にした（C-1538）。
