# 敵の受けるダメージ▲（`damageTaken`）

- 日付: 2026-10-01
- 関連: [design-kurumi.md](design-kurumi.md)、[design-stage8.md](design-stage8.md) 2.4 節（分配ダメージ▲の別枠の乗数）
- 検証記録: V-0054（クルミのバーストの▲を実測）、V-0067（モデルに入れた値の確かめと、味方にも乗るか）

## 1. 何を足すか

- 説明文の「敵全体に受けるダメージ X%▲」（敵へのデバフ）を、stat `damageTaken` として足す。
- クルミのバーストの▲は、クルミの 1 発にも tick にも、ほかのどの群とも別の乗数 × (1 + X) で乗った（C-0138）。

## 2. 語彙

```json
{ "kind": "timed", "trigger": "burstUse", "target": "allies", "stat": "damageTaken", "ref": 1, "durationRef": 2 }
```

- 敵 1 体の前提なので、敵へのデバフを「味方全体の与ダメージに掛かる乗数」として持つ。
  - `target` は `allies` だけ（検証で弾く）。武器種・属性で絞る `targetWeapon`・`targetElement` も書けない。
  - 敵の側に状態を持たせる仕組みを作るより小さい。敵が複数になるときに見直す。
- 乗数は (1 + Σ damageTaken)。次のすべてに掛ける。
  - 通常攻撃（`damage.ts` の 1 トリガーの式）
  - 射撃ごとの倍率ダメージ（`damage.ts` の `perShotDamage`）
  - 倍率ダメージ・バーストの倍率ダメージ・持続ダメージ（`skills/burstDamage.ts` の `computeBurstHit`）
- 複数の▲は足し合わせる（C-0153。仮説・推論）。ほかの別枠の乗数（攻撃ダメージ▲・分配ダメージ▲）と同じ扱い。
- バフの区間の鍵（`skills/timeline.ts` の `BUFF_FIELDS`）に入れる。▲の窓で区間が割れ、calc も同じ値を使う。

## 3. 退化

- `damageTaken` を書かない定義では、乗数は 1。既存のテストと照合の結果は変わらない。
- 画面のラベルは「敵の受けるダメージ」（`apps/web/src/skillLabels.ts`）。

## 4. 今回入れないもの

- **イサベル（231）のバーストの「ターゲットマーキング 1: 受けるダメージ 39.96%▲（5 秒）」** → 2026-10-01 に同じ語彙（`timed`・`{ count: burstUse, atLeast: 2 }`・`damageTaken`）で入れた（V-0075、C-0160〜C-0163）。
  - 実機の窓はバーストスキルダメージの着弾から 5 秒（C-0162）で、同じ発動の段階 2・3 の追加ダメージにも乗る（C-0163）。どちらもこの語彙では書けず、未反映（[roadmap.md](roadmap.md) の今後の課題。語彙の案は [design-burst-landing.md](design-burst-landing.md)）。
- 敵の側の状態（敵ごとのデバフ）。敵 1 体の前提の外。
