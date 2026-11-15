# 設計書: 畳み込んだフルチャージの発ごとの項を、フルチャージでない発から外す

- 何のための文書か: 1 トリガーの値に畳み込んだ「フルチャージの発ごと」の項（射撃ごとの倍率ダメージ `perShot` の一部と、固定ダメージ `fixedShare`）を、フルチャージでない発（部分チャージの発・チャージしない武器の発）から外す形を決める
- 関連: 課題 `records/backlog/2-68.json`、[design-emilia.md](design-emilia.md) 2.2 節（`fixedShare`）、[design-laplace.md](design-laplace.md) 1 節（`foldsIntoShot` の除外。C-1201）、[design-nayuta.md](design-nayuta.md) 2.6 節（チャージしない武器からチャージ武器への変更）、[design-stage22.md](design-stage22.md) 0.2 節（部分チャージの発を `fullChargeShot` に数えない）、[design-hide-reload-detect.md](design-hide-reload-detect.md)（部分チャージの発の時刻と値。C-1001・C-0855）
- 起案: 2026-11-15
- 状態: 完了（3 節）

## 0. 範囲

- 畳み込む項（`skills/burstDamage.ts` の `foldsIntoShot` が真の damage）のうち、きっかけが `{ count: "fullChargeShot" }` のものを、フルチャージでない発に乗せない。
- 畳み込まない項（1 パス目が発ごとに出す倍率ダメージ）は変えない。1 パス目は、もう `ShotLog` の `fullChargeShot` の列（`frame/shots.ts` の `fullChargeFrameSet`）で数えている。
- 部分チャージの発の時刻・値（C-1001・C-0855）と、使用武器の変更の発の時刻は変えない。

## 1. いまのモデル（コードで確かめた。2026-11-15）

- 1 トリガーの値（`damage.ts` の `computeTriggerDamage`）は `normal + perShot + fixedShare`。区間ごとに 1 回出し、2 パス目（`sim/engine.ts` の `createRunner`）が区間の発数に掛ける。
  - `perShot` は、畳み込む射撃ごとの倍率ダメージ（`resolvePerShotDamage`）の和。きっかけの種類（`fullChargeShot` か `normalHit` か）を見ない。
  - `fixedShare` は `charge ? normal × ΣX : 0`。`charge` は「区間の武器（使用武器の変更があれば変更後の武器）がチャージ武器で、手入力の条件 `fullCharge` が真」。
- 部分チャージの発（`ShotLog.partialShots`）は、2 パス目が `partialChargeTriggerDamage` で出し直す。`normal` をチャージの進みで縮め、`fixedShare` を 0 にするが、`perShot` はそのまま。
  - 同じ関数を 1 パス目の蓄積爆破の発の値（`frame/plan.ts` の `shotValueAt`）も使う。
  - 飛ぶ時間のある枠（アニス：スター。C-0992）は、`perShot` を着弾の区間の値で出し直す（`lateShotDamage`。区間の合計では `perShot × (着いた数 − 撃った数)`）。部分チャージの発の分も、着弾の区間の `perShot` のまま。
- チャージしない武器の発（`ShotLog.unchargedShotFrames`）は、2 パス目では特に扱わない。区間の武器が変わるので `charge` が偽になり、`fixedShare` は 0 になるが、`perShot` は残る。
  - 即着弾に替える使用武器の変更を持つ定義（ラプラスの宝物版）だけは、`fullChargeShot` の項を畳み込まず、1 パス目がフルチャージの発に 1 件ずつ出す（`foldsIntoShot` の `firesUnchargedShots`。C-1201）。
  - チャージしない武器からチャージ武器に替える定義（ナユタ）は除外されていない。いまのナユタの `fullChargeShot` の倍率ダメージは条件つき（`selfState`）で畳み込まないので、値はずれていない。条件の無い `fullChargeShot` の項を持つ定義を足すと、SMG の発に乗る。
- 畳み込む項を持つ定義（`packages/core/data/skills/` を 2026-11-15 に調べた）:
  - チャージ武器で `fullChargeShot`: アニス：スター S1・ネオン：ビジョン・アイ S1・ラプンツェル：サンクチュアリ S2・シンデレラ S1・A2 S2・ヘルムの宝物版 S2（いずれも追加ダメージ）、エミリア S2（`fixedShare`）。説明文はどれも「フルチャージ攻撃が命中した時」。
  - `fullChargeShot` でないもの: モダニア S1（`normalHit`。MG）だけ。チャージ武器で畳み込む `normalShot`・`normalHit` の項はいま無い。

## 2. 根拠: 部分チャージの発には「フルチャージ攻撃が命中した時」の追加ダメージが乗らない

- A2: 部分チャージの発の値は、S2 の追加ダメージを含まない（V-0624。`0864-07` の読み）。
- ヘルムの宝物版: 的のジャンプの始まりの部分チャージの発 5 発は、値が小さく、追加ダメージが付かない（V-0038。`0083-03`）。
- 1 パス目は、部分チャージの発とチャージしない武器の発を `fullChargeShot` に数えない（design-stage22.md 0.2 節。紅蓮：ブラックシャドウの S1 の段の数え。design-nayuta.md 2.6 節）。畳み込む項もこれにそろえる。
- チャージしない武器の発に `fullChargeShot` の追加ダメージが出ないことは、ラプラスの宝物版の S2 で確かめてある（C-1201。ビームの発では出ない）。

## 3. 案

### 3.1 項の分け方

- `ResolvedSkillDamage` に `fullChargeOnly?: true` を足す。`resolvePerShotDamage` が、きっかけが `fullChargeShot` の効果に付ける。
- `TriggerDamage` に `perShotFullCharge` を足す。`perShot` のうち、`fullChargeOnly` の効果の分（式は `perShot` と同じ）。`perShot` は今までどおり全部の和で、`perShotFullCharge` を含む。
- `landingTriggerDamage`（条件の配分の重み付きの和）は、`perShotFullCharge` も同じく重みで足す。

### 3.2 外す所を 1 つにする

- `damage.ts` に、フルチャージの発にだけ乗る項を外す関数を 1 つ置く（仮の名 `nonFullChargeTriggerDamage`）。`perShot` から `perShotFullCharge` を引き、`perShotFullCharge` と `fixedShare` を 0 にし、`perTrigger` を足し直す。項を足すときは、この関数だけを直す。
- この関数を呼ぶのは 2 か所で、どちらも「その発がフルチャージの発か」の判定。
  1. **区間の武器**（`computeTriggerDamage`）: `charge` が偽なら（区間の武器がチャージ武器でないか、手入力の `fullCharge` が偽）、項を全部出した値にこの関数を掛けて返す。`fixedShare` の `charge ? … : 0` はこれに置き換える。チャージしない武器の発（即着弾の変更後の武器の発と、ナユタの SMG の発）はここで外れる。
  2. **発ごとの部分チャージ**（`partialChargeTriggerDamage`）: `normal` を縮めた後、この関数を掛ける。2 パス目と 1 パス目の蓄積爆破の発の値の両方が、今と同じくこの関数を通る。
     - いまの早期の戻り（`full <= 1` ならそのまま返す）は、チャージ倍率が 1 以下の区間（1 の判定で外し済み）でだけ同じになる。進みが 1 未満なら、縮めるかどうかによらず項を外す形に直す。
- 使用武器の変更の発を発ごとに見ず、区間の武器で見る理由: 1 トリガーの値のほかの項（武器倍率・チャージ倍率・コア倍率）も、区間の武器で決めている。発の武器と区間の武器は、ナユタ（リター・ナユタ・アリス）とラプラス（リター・クラウン・ラプラス）の 3 分の編成で、全部の発で一致した（`unchargedShotFrames` の発は区間の武器がチャージ武器でなく、ほかの発はチャージ武器。2026-11-15 に一度だけのテストで確かめた）。実装では、この一致をテストに残す。

### 3.3 着弾の区間で出し直す枠（飛ぶ時間のある枠）

- 発の分の `perShot` は、その発の値の `perShot`（部分チャージの発は外した後の値）を引く。着弾の分は、着弾の区間の値に、撃った発と同じ判定を掛けた `perShot`（部分チャージの発なら着弾の区間の `perShot − perShotFullCharge`）を足す。
- 区間の合計（`createRunner`）では、今の `perShot × (着いた数 − 撃った数)` に、`− perShotFullCharge × (着いた部分チャージの発の数 − 撃った部分チャージの発の数)` を足す。着いた部分チャージの発の数は、部分チャージの発の着弾のフレームの列から二分探索で引く。
- 1 秒ごとのダメージ・蓄積爆破の自分の発の値・出来事の列（`trace`）が使う 1 発の分けは、発の値と着弾の分を返す小さな関数 1 つにまとめる（今は 3 か所に同じ式がある）。

### 3.4 変えないもの

- `foldsIntoShot` の即着弾の変更の除外（ラプラスの宝物版）は残す（論点 3）。コメントの理由「畳み込むとどの発にも乗る」は、この変更の後は当たらないので、「1 パス目が発ごとに出す形で C-1201 を確かめた」に書き直す。
- 畳み込む `fullChargeShot` でない項（モダニア S1 の `normalHit` など）は、部分チャージの発・チャージしない武器の発にも乗せたまま（論点 1）。

## 4. 値の見込み

- 変わるのは、畳み込む `fullChargeShot` の項を持つ 7 体（1 節）の部分チャージの発だけ。部分チャージの発は、射撃場 3 分モードの敵のジャンプなど、狙えない窓の始まりに出る。1 発あたり、その区間の `perShotFullCharge` が減る（エミリアの `fixedShare` は今も 0）。
- チャージしない武器の発は、いま該当する定義が無いので値は変わらない。
- 部分チャージの発のフルチャージ倍率のゲージ（未確認。design-stage22.md 0.2 節）・畳み込む項のゲージ（`gaugeHits`）は変えない。
- 既存の残差（`plan/residuals.md`）の許容外の増減は、実装の後に `npm run records:residual` で調べ、PR の本文に書く。

## 5. テスト

- 単体（`damage.ts`）: `fullChargeShot` の効果と `normalHit` の効果を 1 つずつ持つ `perShot` で、
  - 部分チャージの発は `perShotFullCharge` と `fixedShare` が 0、`normalHit` の分は残る。
  - 区間の武器がチャージ武器でないとき（即着弾の変更後の武器・SMG の基礎の武器）も同じ。チャージ武器に替えた区間では両方が乗る。
- sim（部分チャージの発）: アニス：スター単騎（飛ぶ時間あり）と A2 単騎（飛ぶ時間なし）を射撃場の敵で回し、部分チャージの発の 1 発の値が `perShot` を含まないこと、区間の合計が発ごとの値の和（出来事の列の発の値の和）と合うこと。
- sim（チャージ武器に替える使用武器変更の発）: ナユタの定義に条件の無い `fullChargeShot` の追加ダメージと、条件の無い `normalShot` の追加ダメージを足した定義で回し、SMG の発には `normalShot` の分だけ、記憶燃焼の発には両方が乗ること。区間の武器と発の武器の一致（3.2 節）も見る。

## 6. 論点（オーナーに決めてもらうこと）

1. **「フルチャージの発ごと」と「通常攻撃が命中した時」を分けるか**: きっかけの種類で分ける（推奨）。`fullChargeShot` の項だけをフルチャージでない発から外し、`normalShot`・`normalHit` などの項は全部の発に乗せる。語彙は足さない（定義にもう書いてある）。2 節の根拠は「フルチャージ攻撃が命中した時」の 2 体だけで、「通常攻撃が命中した時」が部分チャージの発で出るかは確かめていない。ただし 1 パス目は部分チャージの発を `normalShot`・`normalHit` に数えている（design-stage22.md 0.2 節の 3）ので、それにそろえる。チャージ武器で畳み込む `normalShot`・`normalHit` の項はいま無く、値は変わらない。
2. **判定の置き場所**: 武器は区間で、部分チャージは発ごとに見て、外す項は 1 つの関数にする（推奨。3.2 節）。代わりの案は、2 パス目が `ShotLog` の `fullChargeShot` の列（`fullChargeFrameSet`）だけで発ごとに見る形。1 パス目と全く同じ列を見られるが、区間の値（画面・CLI に出す 1 トリガーの値）が、チャージしない武器の区間でもフルチャージの発の値になり、武器倍率など区間で決めるほかの項と食い違う。また手入力の `fullCharge` が偽の枠でも項が乗る（今の `fixedShare` と変わる）。
   - 推奨の案では、手入力の `fullCharge` が偽の枠で、`fullChargeShot` の射撃ごとの倍率ダメージも乗らなくなる（今は乗る。`fixedShare` は今も乗らない）。1 パス目の畳み込まない `fullChargeShot` の項は、手入力の `fullCharge` を見ずに出る（今のまま。この変更の範囲の外）。
3. **ラプラスの宝物版の除外（`foldsIntoShot` の `firesUnchargedShots`）**: 残す（推奨）。この変更の後は畳み込んでもビームの発から外れるが、畳み込むとヒットの出方（倍率ダメージの発動から 1 トリガーの値へ）と、C-1201 の観測値を比べる指標の読む先が変わる。値の精度は変わらないので、別の変更にする。

## 7. 経過

- 2026-11-15: 起案。論点 1〜3 をオーナーに諮る。
- 2026-11-15: オーナーが論点 1〜3 を推奨どおりに決めた。3 節のとおりに実装し、課題 2-68 を閉じた。
- 2026-11-15: 手入力の条件 `fullCharge` を消した（[design-manual-full-charge.md](design-manual-full-charge.md)）。3.2 節の 1 の判定は、区間の武器がチャージ武器かだけになった。
