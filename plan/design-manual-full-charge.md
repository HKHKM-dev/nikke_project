# 設計書: 手入力の条件 `fullCharge` を 1 パス目と 2 パス目でそろえる

- 何のための文書か: 手入力の条件 `fullCharge`（`damage.ts` の `TriggerCondition`）が偽の枠の扱いが、1 パス目と 2 パス目で割れているのを、どちらかにそろえる形を決める
- 関連: 課題 `records/backlog/manual-full-charge.json`、[design-full-charge-fold.md](design-full-charge-fold.md) 6 節の論点 2（推奨の案で、偽の枠の `fullChargeShot` の射撃ごとの倍率ダメージも乗らなくなった）、[requirements.md](requirements.md) 4.2 節（通常攻撃はオートの射撃の撃ち方。C-0839）、[design-stage18.md](design-stage18.md) 12.9 節（条件の決め方。`fullCharge` は手入力のまま）
- 起案: 2026-11-15
- 状態: 完了（2 節の案 A。3 節）

## 1. いまのモデル（コードで確かめた。2026-11-15）

- 2 パス目: 1 トリガーの値（`computeTriggerDamage`）は、`charge = isChargeWeapon(shot) && condition.fullCharge` が偽なら、チャージ倍率を 1 にし、フルチャージの発にだけ乗る項（`perShotFullCharge`・`fixedShare`）を外す（`nonFullChargeTriggerDamage`）。
- 1 パス目: `condition.fullCharge` を見ない。
  - 射撃の列はチャージ時間で撃つ（`frame/firstPass/shooters.ts`）。
  - `ShotLog.fullCharge` は武器で決まる（`frame/firstPass/shotLogs.ts` の `firesChargeShots`）。フルチャージの発の列（`fullChargeShot` の数え）・畳み込まない倍率ダメージ・ゲージ（フルチャージ倍率のゲージ `fullChargeBurstEnergy` を含む）・バフのきっかけは、この列から出る。
  - そのため偽の枠では、同じ発が、1 トリガーの値ではフルチャージでなく、ほかの効果ではフルチャージの発になる。
- 条件の決め方が自動の枠（`frame/landing.ts` の `slotConditionAt`）も、`fullCharge` だけは手入力の値をそのまま渡す。
- 使い手:
  - 画面: 切り替える部品が無い。既定（`apps/web/src/team.ts` の `DEFAULT_SLOT_CONDITION`）は真。偽になるのは、部品があったころの保存データ（`parseCondition` が読む）だけ。
  - 照合（`records/observations/teamInput.ts`）と CLI（`packages/core/scripts/sim-run.ts`）: 常に真。
  - テスト: 条件の書き方として多くのテストに出る。偽の振る舞いを見ているのは `damage.test.ts`・`emilia.test.ts`・`fullChargeFold.test.ts` などの一部で、ほかの偽は、チャージしない武器のキャラに書いてあるだけ。

## 2. 案

### 案 A: 欄を消して、チャージ武器は常にフルチャージで撃つ

- `TriggerCondition` から `fullCharge` を消す（`SlotCondition` は `TriggerCondition` から作るので一緒に消える）。`computeTriggerDamage` の判定は `charge = isChargeWeapon(shot)` だけにする。どの発がフルチャージかは、区間の武器と発ごとの部分チャージで決まる（design-full-charge-fold.md 3.2 節のまま）。
- `slotConditionAt`・照合・CLI・画面の既定から `fullCharge` を消す。
- 古い保存データ（`parseCondition`）の扱いは、次の 2 つから選ぶ（4 節の論点 2）。
  - **無視する（推奨）**: `fullCharge` があってもなくても読み、値は捨てる。偽で保存した枠は、読み込んだ後はフルチャージで計算する（チャージ武器の枠の値が上がる）。保存の形の版（`TEAM_FORMAT_VERSION`）は上げない（欄が 1 つ減るだけで、読めない形にはならない）。
  - 読み込みで落とす: 偽の枠を含む保存データを読めないもの（`null`）にする。`parseTeamState` は 1 枠でも読めないと編成の全部を捨てるので、保存した編成が消える。
- 根拠: 要件（requirements.md 4.2 節）が、通常攻撃をオートの射撃の撃ち方とし、チャージ武器はフルチャージに届いたら撃つ（C-0839）と決めている。偽の枠は、この範囲の外の撃ち方（手動で早く離す）で、モデルが扱わないもの。
- 値: 照合・CLI・画面の既定はもう真なので、照合と残差の値は変わらない。変わるのは、偽で保存した古いデータと、偽を渡すテストだけ。

### 案 B: 1 パス目にも効かせる

- 偽の枠では、`ShotLog.fullCharge` を偽にし、フルチャージの発の列を空にする（`firesChargeShots && condition.fullCharge`）。`fullChargeShot` の畳み込まない倍率ダメージ・フルチャージ倍率のゲージ・`fullChargeShot` と `chargeFull` のきっかけのバフが出なくなる。
- ただし、射撃の列の時刻が決まらない。
  - いまのままチャージ時間で撃つと、「フルチャージまで溜めたのにフルチャージでない発」になり、ゲームに無い撃ち方になる。
  - 早く離す撃ち方にするには、離す時刻（チャージの進み）を新しい条件として足し、その発の値を部分チャージの発の式（`partialChargeTriggerDamage`。C-0843 はバフの無い倍率だけで確かめた）で出す。離す時刻の決め方・その発のゲージ（部分チャージの発のゲージは未確認。design-stage22.md 0.2 節）・「通常攻撃が命中した時」の数え・蓄積爆破の発の値は、どれも根拠が無い。
  - 画面には切り替える部品が無く、案 B でも使い手は増えない。部品を戻すなら、離す時刻の欄も要る。
- 範囲: 1 パス目の射撃の列（`shooters.ts`）・射撃の記録（`shotLogs.ts`）・ゲージ（`gaugeEffects.ts`）・蓄積爆破（`accumulate.ts`）と、2 パス目の部分チャージの扱い（区間の値と発ごとの値の両方）にまたがる。根拠の無い部分は、AGENTS.md「事実と記録」に従って未実装のプレースホルダーにすることになる。

### 比べ

<!-- prettier-ignore -->
| | 案 A | 案 B |
| --- | --- | --- |
| 1 パス目と 2 パス目のそろい | そろう（偽の枠が無くなる） | そろう（離す時刻の根拠が無い所は未実装） |
| 要件との合い方 | 合う（オートの撃ち方だけ） | 範囲の外の撃ち方（手動）を一部だけ足す |
| 根拠の無い仮定 | 足さない | 離す時刻・部分チャージの発のゲージなど |
| 照合・残差の値 | 変わらない | 変わらない（真の枠は今のまま） |
| 直す所 | 型・`computeTriggerDamage` の 1 行・`slotConditionAt`・画面の読み込みと既定・照合と CLI・テストの条件の書き方 | 1 パス目の 4 ファイル・2 パス目の部分チャージ・新しい条件の欄 |
| 古い保存データ | 偽の枠はフルチャージで計算（推奨の無視のとき） | 偽の枠は、偽のまま計算 |

## 3. 実装（案 A）

- `damage.ts`: `TriggerCondition.fullCharge` を消し、`charge = isChargeWeapon(shot)`。コメントの「手入力でフルチャージしない枠」を消す。
- `frame/landing.ts`: `slotConditionAt` の `fullCharge: manual.fullCharge` を消す。`team.ts` の `conditionMode` のコメント（「fullCharge は condition のまま」）も直す。
- `records/observations/teamInput.ts`・`packages/core/scripts/sim-run.ts`・`apps/web/src/team.ts` の既定から `fullCharge` を消す。
- `apps/web/src/team.ts` の `parseCondition`: `fullCharge` を必須にせず、あっても読まない（論点 2 で無視を選んだとき）。
- テスト: 条件の書き方から `fullCharge` を消す（機械的）。偽の振る舞いを見ていたテストは、同じことを区間の武器か部分チャージで見る形に直すか、もう無い振る舞いなら消す。画面の読み込みのテストに、`fullCharge: false` を含む古い保存データを読めて、値を捨てることを足す。

## 4. 論点（オーナーに決めてもらうこと）

1. **案 A か案 B か**: 案 A（推奨）。要件がオートの撃ち方だけを扱い、偽の枠を作る使い手は古い保存データとテストだけ。案 B は、離す時刻など根拠の無い仮定を足さないと 1 パス目にそろえられない。
2. **（案 A のとき）古い保存データの `fullCharge`**: 無視する（推奨）。読み込みで落とすと、保存した編成の全部が消える。無視すると、偽で保存したチャージ武器の枠の値が上がるが、その撃ち方はもともとモデルの範囲の外。

## 5. 経過

- 2026-11-15: 起案。論点 1・2 をオーナーに諮る。
- 2026-11-15: オーナーが論点 1・2 を推奨どおりに決めた（案 A・古い保存データの `fullCharge` は無視する）。3 節のとおりに実装し、課題 `manual-full-charge` を閉じた。
