# 設計: 射撃場の的の RL のコア命中率を弾の種類ごとに持つ

- 関連: V-0097〜V-0101（検証記録）、C-0171・C-0172・C-0173（結論）、plan/design-stage18.md 12.2 節（的の条件の表）、plan/backlog.md 2-13
- 作成日: 2026-10-02
- 状態: 実装済み（2026-10-02 承認・実装。外す側の割合は V-0104 で計ってから別の変更で入れる）

## 1. 何を決めたか

- 射撃場の的（`data/enemies.json` の `range-bigarms`）のコア命中率の表は、武器種 × 着地点で持っている。RL の行は `{ "all": 1 }` で、紅蓮：ブラックシャドウで測った値（C-0172。C-0028 を置き換えた）。
- V-0097 で、RL の通常攻撃のコアの外れは弾の種類で違うと分かった（C-0171 確定）。直進弾の弾速 300・400 は外さず、弾速 100 の直進弾・誘導弾・曲射は、近ではほとんど外さず遠で多く外す。
- 2026-10-02 にオーナーが、表の RL の行を弾の種類ごとに分けると決めた。この設計書は、その表の形・引き方・値・注記を決める。

## 2. いまの表と引き方

- 型は `TargetRateTable = Partial<Record<WeaponType, Record<string, number> | null>>`（`types.ts`）。行のキーは着地点の id・距離帯・`all`。`null` は未測定。
- 引くのは `targetRateOf(table, character, landing)`（`frame/landing.ts`）だけで、`character.weaponType` で行を選ぶ。`null` なら手入力の値（既定 1）を使い、注記「コア命中率（…）はこの的で未測定」を出す（`landingNotes`）。
- `records/minimal.ts` の `normalConditionMeasured` は、行が `null` でないことを「通常攻撃の条件がその的で測られている」（AGENTS.md の「機構が確定したキャラ」の条件の 1 つ）とみる。
- 弾の種類はキャラデータの `shot.fireType` と `shot.projectile.speed` にある（2026-10-02 に足した。計算にはまだ使っていない）。2026-10-02 の RL の弾の種類は、直進弾（`ProjectileDirect`）の弾速 400・300・100、誘導弾（`HomingProjectile`）の弾速 100、曲射（`ProjectileCurve`）の弾速 1500 の 5 つ。

## 3. 案

### 3.1 表の形

武器種の行に、行そのもの（今の形）か、弾の種類ごとの行の表（`byProjectile`）のどちらかを書けるようにする。RL だけが `byProjectile` を使う。

```json
"RL": {
  "byProjectile": {
    "ProjectileDirect:400": { "all": 1 },
    "ProjectileDirect:300": { "all": 1 },
    "ProjectileDirect:100": null,
    "HomingProjectile:100": null,
    "ProjectileCurve:1500": null
  }
}
```

- キーは `<fireType>:<弾速>`（キャラデータの `shot.fireType` と `shot.projectile.speed` の生値）。弾速の閾値（たとえば「300 以上は外さない」）では分けない。弾速 300 と 100 の間の直進弾が無く、どこから外れ始めるかは測れないため（C-0173 は仮説のまま）。
- 爆発の範囲はキーに入れない。爆発の範囲で決まる仮説は合わなかった（C-0173 の根拠。H1c）。
- 表に無いキー（新しい弾の種類のキャラ）は未測定（`null` と同じ）。
- 型: `TargetRateRow = Readonly<Record<string, number>>`、`TargetRateCell = TargetRateRow | { byProjectile: Readonly<Record<string, TargetRateRow | null>> } | null`、`TargetRateTable = Partial<Record<WeaponType, TargetRateCell>>`。弾丸命中率の表（`bulletHitRate`）も同じ型にする（使うのは今はコア命中率だけ。SR・RL の弾丸命中率は弾の種類によらず 1。C-0168）。

### 3.2 値

| キー                   | 値             | 根拠                                                             |
| ---------------------- | -------------- | ---------------------------------------------------------------- |
| `ProjectileDirect:400` | `{ "all": 1 }` | C-0172（紅蓮BS）・C-0171（レイヴンも外さない）                   |
| `ProjectileDirect:300` | `{ "all": 1 }` | C-0171（A2 は着地の後の 1 発目と跳び始めの直前を除いて外さない） |
| `ProjectileDirect:100` | `null`         | C-0171（遠で外す。区間ごとの割合の値は決めていない）             |
| `HomingProjectile:100` | `null`         | 同上                                                             |
| `ProjectileCurve:1500` | `null`         | 同上。曲射の弾は damage.ts が未対応で、計算はもともと止まる      |

- 外す側の 3 つは、区間ごとの割合を 1 本ずつの録画でしか測っていない（V-0097「結果」の弾の種類 × 距離帯の表）。C-0171 は「値は決めない」としたので、表には入れず未測定にする（AGENTS.md「根拠のない変更は行わない。未解明の部分はプレースホルダー」）。
- 未測定の枠は、今と同じく手入力の値（画面・CLI・照合ランナーとも既定 1）を使う。既定のままなら数値は今と変わらない（今も RL は全部 1）。手入力のコア命中率を変えている枠では、外す側の RL にその値が使われるようになる（今は表の 1 で上書きしている）。ほかに変わるのは注記と最小構成の判定（3.4・3.5）。

### 3.3 引き方

- `targetRateOf` で、行が `byProjectile` なら `character.shot.fireType` と `character.shot.projectile?.speed` でキーを作って行を選ぶ。`projectile` が無い（即着弾）キャラに `byProjectile` の行が当たったら未測定。
- ほかの呼び出し側（`autoConditionAt`・`landingNotes`・時間割りの集計）は `targetRateOf` を通しているので変えない。

### 3.4 注記

- 未測定のとき、今の注記（「コア命中率（100%）はこの的で未測定。手入力の値を使う」）に加えて、RL の外す側の弾の種類なら「この弾の種類の RL は遠の区間でコアを外す（C-0171）。割合は未測定なので、手入力の値（既定 100%）は実際より高い」を出す。どの弾の種類が外す側かは、表の行が `null` と明記されていること（キーがある）で判断し、キャラ名や fireType をコアに書かない（キーが無い新しい弾の種類は、今の注記だけ）。
- 注記の文言は calc と sim で共通（`landingNotes`）。画面と CLI は注記の一覧をそのまま出すので変えない。

### 3.5 最小構成の判定

- `normalConditionMeasured` を `targetRateOf` と同じ規則に揃える（キャラの弾の種類の行が `null` でない）。今の `profile.coreHitRate[w] != null` は着地点を見ないので、行が `byProjectile` のときはキャラの行を引く関数を別に置く（着地点を使わない `rateRowOf(table, character)`）。
- これで、フラワー（誘導弾）など外す側の RL を含む録画は「通常攻撃の条件が測られていない」になり、最小構成の警告に出るようになる（実態に合う。`plan/verifications.md` の警告が増える）。紅蓮BS・レイヴン・A2 は今までどおり。

### 3.6 パースと検証

- `parseRateTable`（`enemies.ts`）で、行が `{ byProjectile: {...} }` の形を受ける。キーは `<文字列>:<数>` の形、値は今の行と同じ検査（キーは着地点・距離帯・`all`、値は [0, 1]）か `null`。`byProjectile` と着地点のキーを同じ行に混ぜない。
- `byProjectile` は RL 以外の武器種でも書けるようにするが、今は RL だけに使う。

### 3.7 テスト

- `targetRateOf`: 直進弾 400 → 1、誘導弾 100 → null、表に無いキー → null、`projectile` の無いキャラ → null、今の形の行（AR など）は今までどおり。
- `parseRateTable`: `byProjectile` の正常系と、キーの形・値の範囲・混在の誤りで落ちること。
- 注記: フラワーの自動の枠に C-0171 の注記が出て、紅蓮BS には出ないこと。
- 退化: 既存のテストが数値を変えずに通ること（今も RL は全部 1 なので、与ダメージは動かない）。`npm run records:check` で残差の一覧の値が動かないこと（最小構成の警告は増える）。

## 4. やらないこと

- 外す側の弾の種類の割合を表に入れること。入れるには、弾の種類ごとに録画を足して割合の再現を確かめる（V-0097「次に撮るもの」）か、1 本の値を仮説として入れるかをオーナーが決めてから、別の変更にする。
- 弾速の閾値・飛ぶ時間（C-0173）でコア命中率を計算すること。
- 曲射の弾の計算（damage.ts の未対応）。

## 5. 段取り

1. 型と `parseRateTable`・`targetRateOf`・`rateRowOf`（とその単体テスト）。
2. `data/enemies.json` の RL の行を 3.2 の形にし、`source` に C-0171・C-0172 と、この設計書を書く。
3. 注記（3.4）と `normalConditionMeasured`（3.5）。
4. 退化の確認（`npm test`・`npm run records:check`）。C-0171・C-0172 の「モデル側」を書き換える。
5. backlog 2-13 を閉じる（外す側の割合を入れる課題は、残すならオーナーの判断で新しい行にする）。

## 6. オーナーに決めてほしいこと

- この形（`<fireType>:<弾速>` のキーで分け、外す側は未測定にする）で実装してよいか。
- 外す側の割合を、今ある 1 本ずつの値で仮説として入れたいか（入れるなら、この設計の後の別の変更にする）。
