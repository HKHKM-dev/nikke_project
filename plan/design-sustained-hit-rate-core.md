# 設計書: 持続の命中率▲をコア命中率に効かせる

- 対象: `D:\nikke_project`
- 状態: **承認待ち**（2026-10-02 起案。実装はしていない）
- 関連: [design-stage18.md](design-stage18.md)（コア命中率の表と常時の▲）、[design-asuka.md](design-asuka.md) 8 節の論点 1、[design-records-automation.md](design-records-automation.md)（予測の出し直し）
- 根拠: C-0170（仮説・単独実測。V-0074・V-0096）。常時の▲の式は C-0036・C-0037

## Context

- いまのモデルは、常時の命中率▲（OL・キューブ・`passive` の `hitRate`）だけをコア命中率に効かせている。`frame/landing.ts` の `planLandings` が、枠ごとの常時の状態（`resolvePassiveStates`）から N を 1 つ取り（`LandingPlan.hitRateUp`）、着地点ごとの条件（`autoConditionAt` → `coreHitRateWithHitRateUp(p, N)`）を計画の時点で決めている。
- 持続の `hitRate`（フルバースト開始時などに配られる `timed` の効果）は、`skills/timeline.ts` の区間の鍵（`BUFF_FIELDS`）に入れておらず（「状態だけなので入れない」）、条件の判定と表示にだけ使っている（`skills/types.ts` の注記）。
- V-0074・V-0096 で、持続の▲も常時の▲と同じ式でコア命中率を上げ、2 つの▲は N の和で効くことが分かった（C-0170）。影響するキャラは、ドレイク（101）S1・モダニア（260）S2・ノワール（271）バースト・アスカ（830）バースト（`partial`。design-asuka.md 8 節の論点 1）。

## 1. 何を決めるか

持続の `hitRate` を、受け手の条件が自動の枠（的の表がある敵）で、コア命中率の式に読ませる。

- **N** = 常時の▲の和 + その時点で効いている持続の▲の和（`SlotBuffState.buffs.hitRate`。出どころが違う効果は足す。C-0170「N の和」）。
- **式**はいまのまま `coreHitRateWithHitRateUp(p, N)` = min(1, p ÷ (1 − N)²)。N ≥ 1 なら 1（C-0037。アスカのバースト 101.37%）。
- **弾丸命中率**（`hitRate` の表の値）には効かせない（2-1 の課題。式が未定）。

## 2. 入れ方（core）

1. **区間の鍵**: `skills/timeline.ts` の `BUFF_FIELDS` に `hitRate` を足す。持続の▲の始まり・終わりで区間が割れ、calc は区間の鍵ごと、sim は区間（= フレームの並び）ごとに別の N を持てる。鍵に入れると、▲の値が同じでも出どころが違えば別の区間になる（いまの `timedEffects` の規則どおり）。
2. **条件の計算を使う時点に移す**: `planLandings` は着地点の配分（`parts`）と常時の N を出すだけにし、コア命中率は `landingTriggerDamage` を呼ぶ所（`sim/engine.ts`・`calc/model.ts`）で、その区間の `state.buffs.hitRate` を N にして `autoConditionAt` を引き直す。`LandingPart.condition.coreHitRate` を計画の値から「区間の N で出し直した値」に置き換える小さな関数（`landingPartsWith(plan, slotIndex, landing, hitRateUp)` の形）を `frame/landing.ts` に足す。
   - `state.buffs.hitRate` が常時の分を含むか（`resolvePassiveStates` の合計が `timeline` の `buffs` に入っているか）を実装の最初に確かめ、含むならそれを N に、含まないなら `plan.hitRateUp[i] + state.buffs.hitRate` にする。
3. **1 パス目は変えない**: 弾丸命中率の区間（`hitRateSpansOf`）とゲージは今のまま。
4. **表示・注記**: `autoConditionSummary.hitRateUp`（掛けた常時の▲）を「発数で重みを付けた N の平均」にし、`slotConditionNotes` の注記に「持続の▲を含む」と出す。条件欄の「コア命中率」も発数平均なので、値が動く。
5. **データ**: 定義の `hitRate` の値はそのまま（ドレイク 11.85%・モダニア 8.56%・ノワール・アスカ）。アスカのバーストの `partial` を外せるかは、design-asuka.md 8 節の論点 1 を閉じてから。

## 3. 影響と予測の出し直し

- 15-A（録画 48〜50。V-0065）のリター・クラウン・モダニアの予測が動く（▲の中でコア命中率が上がる向き）。**15-A からは結論を作らない**（AGENTS.md の規則）。V-0065 の派生として新しい検証記録を起こし、実装の前後の値（`records:check` の残差）を並べて、残差の推移の記録にとどめる。
- 単騎の録画は持続の▲を配る味方がいないので動かない（`npm test` の確定の照合は変わらないはず。変われば原因を調べる）。
- 中近（V-0096 の参考）は式より高かった。実装では区間（距離）によらず同じ式を使い、差は注記に書く。

## 4. 段取り

1. `BUFF_FIELDS` に `hitRate` を足し、`npm test` で区間の数が変わるテストを直す（鍵の桁は `KEY_DIGITS` のまま）。
2. `landingPartsWith` を足し、sim → calc の順で `landingTriggerDamage` の呼び出しを置き換える。`coreHitRateWithHitRateUp` のテスト（`stage18Landing.test.ts`）に、持続の▲ 2 つの和（N = 0.2041 で 0.2644 → 0.417）を足す。
3. 表示（`autoConditionSummary`・注記）。
4. `npm run records:check` で残差の一覧を作り直し、動いた観測値（15-A）を V-0065 の派生の記録に書く。
5. C-0170 の `model` を「反映（`landingPartsWith`）」に書き換え、C-0036・C-0037 の `model` の「持続の▲は未反映」を消す（結論の文は変えない）。

## 5. やらないこと

- 命中率▲を弾丸命中率に効かせる（2-1 の課題。式が未定）。
- 命中率▼の効き方（測っていない。`coreHitRateWithHitRateUp` は N ≤ 0 で変えない）。
- 的の表の SMG の近の値（0.264）の見直し（V-0096「分からないこと」1。別の問い）。

## 6. 決めてほしいこと

1. この設計で実装に進んでよいか（C-0170 は仮説のまま。確定にするかは backlog 4-3）。
2. 2 節の 2 の形（使う時点で引き直す）でよいか。代わりの案は、`planLandings` が N の候補ごとに `parts` を持つ形（鍵に N を入れるので候補が増える。推奨しない）。

## 経過

- 2026-10-02: 起案（V-0074「判定の予定」の H1 のとおり。実装はこの PR に入れない）。
