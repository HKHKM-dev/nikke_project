# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況（`supported`・`partial`・`unsupported`）と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義には、さかのぼって結論を作らない（[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 23・効果 98（根拠あり 25）・notes 55（根拠あり 14）

## 10 ラピ

- **skill1**: unsupported
  - notes[0] 被弾 N 回で自分に攻撃力▲（維持型）は未対応（被弾は要件 5.2 でスコープ外。射撃場の 3 分モードでは的が反撃するので発動する）: 根拠なし
- **skill2**: unsupported
  - notes[0] 単体大ダメージ（最終攻撃力の 528.97%）と挑発は未対応。倍率ダメージは burst スロットの burstDamage だけが扱える: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし

## 20 デルタ

- **skill1**: unsupported
  - notes[0] フルチャージ攻撃時の自分の最大HP▲は、ダメージに関係しない（C-0081）: C-0081（確定）
- **skill2**: unsupported
  - notes[0] バーストスキル使用時の自分の防御力▲は、ダメージに関係しない（C-0081）: C-0081（確定）
- **burst**: unsupported
  - notes[0] デコイ（分身）と挑発は、ダメージに関係しない（C-0081）: C-0081（確定）

## 82 リター

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: 根拠なし
  - effects[1] cooldownReduction・fullBurstStart: 根拠なし
  - effects[2] cooldownReduction・fullBurstStart: 根拠なし
  - effects[3] timed・burstUse・maxAmmo: 根拠なし
  - effects[4] timed・burstUse・critDamage: 根拠なし
  - effects[5] timed・burstUse・attack: 根拠なし
- **skill2**: unsupported
  - notes[0] 遮蔽物の HP 回復はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: 根拠なし

## 93 エマ：タクティカル・アップ

- **skill1**: unsupported
  - notes[0] 環境コントロール（敵の受けるダメージ増加・味方回復・再発動周期）と陽動は未対応。敵デバフは要件でスコープ外: 根拠なし
- **skill2**: partial
  - effects[0] passive・critDamage: 根拠なし
  - notes[0] 発射体爆発ダメージは未対応: 根拠なし
  - notes[1] フォーメーションAS 併用時の追加効果（防御力無視ダメージ・再発動周期短縮）は未対応: 根拠なし
- **burst**: partial
  - effects[0] timed・burstUse・attack: 根拠なし
  - notes[0] 環境コントロール強化（環境コントロールのダメージ増加倍率・受ける HP 回復量▲）は未対応: 根拠なし

## 95 ウンファ：タクティカル・アップ

- **skill1**: unsupported
  - notes[0] カモフラージュ状態（バースト使用時・フルバースト中のフルチャージ時）の防御力無視ダメージは未対応: 根拠なし
- **skill2**: partial
  - effects[0] passive・critRate: 根拠なし
  - effects[1] passive・chargeDamage: 根拠なし
  - effects[2] passive・attack: 根拠なし
  - notes[0] フォーメーションLT 併用時の追加効果（発射体爆発ダメージ・防御力無視ダメージ）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 武器変更（1 発のみ）は未対応。敵の受けるダメージ▲（10 秒間維持）も未対応（敵デバフは語彙にない）: 根拠なし

## 101 ドレイク

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: 根拠なし
  - effects[1] timed・fullBurstStart・hitRate: 根拠なし
- **skill2**: supported
  - effects[0] damage・normalShot・skill: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: 根拠なし
  - effects[1] timed・burstUse・maxAmmo: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・fullBurstStart・attack: 根拠なし
  - effects[1] timed・fullBurstStart・attack: 根拠なし
  - effects[2] timed・fullBurstStart・maxAmmo: 根拠なし
  - effects[3] timed・fullBurstStart・hitRate: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] damage・normalShot・skill: 根拠なし
  - effects[1] damage・normalShot・skill: 根拠なし
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: 根拠なし
  - effects[1] timed・burstUse・attackDamage: 根拠なし
  - effects[2] timed・burstUse・maxAmmo: 根拠なし

## 160 ユニ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullChargeShot・maxAmmo: 根拠なし
  - effects[1] heal・fullChargeShot: C-0082（確定）
  - notes[0] 味方全体の防御力▲はダメージに関係しない: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: 根拠なし
  - notes[0] 移動不可（5 秒間維持）はダメージに関係しない: 根拠なし

## 172 アドミ

- **skill1**: unsupported
  - notes[0] 「20 回攻撃を受けた時」のチャージダメージ倍率▲は未対応（被弾は要件 5.2 でスコープ外）: 根拠なし
- **skill2**: unsupported
  - notes[0] 最終攻撃力が最も高い味方 2 機の受けるダメージ▼は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: 根拠なし
  - effects[1] timed・burstUse・critDamage: 根拠なし

## 191 アリス

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: 根拠なし
  - effects[1] timed・fullBurstStart・chargeDamage: 根拠なし
- **skill2**: unsupported
  - notes[0] 貫通特化は単体の的ではダメージに関係しない。HP 80% 未満の回復は HP を持たないので扱わない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・chargeSpeed: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし

## 225 紅蓮：ブラックシャドウ

- **skill1**: supported
  - effects[0] cycle・fullChargeShot: C-0047（確定）、C-0085（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: 根拠なし
  - effects[1] ammoRefill・fullBurstStart: 根拠なし
- **burst**: supported
  - effects[0] cycleEvery・burstUse: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし
  - effects[2] timed・burstUse・chargeDamage: 根拠なし

## 231 イサベル

- **skill1**: supported
  - effects[0] timed・burstUse・critRate: 根拠なし
  - effects[1] timed・burstUse・critDamage: 根拠なし
  - effects[2] timed・burstUse・attack: 根拠なし
- **skill2**: unsupported
  - notes[0] 最終防御力が最も高い敵への 170.58% のダメージは、説明文にきっかけ（いつ出るか）が書かれていないので未対応: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: 根拠なし
  - effects[1] damage・burstUse・additional: 根拠なし
  - effects[2] damage・burstUse・additional: 根拠なし
  - notes[0] 段階 1 の敵の受けるダメージ 39.96%▲（5 秒間維持。2 回目の発動から）は未対応（敵デバフは語彙にない。録画 38 で別枠の乗数 ×1.3996 と確認）。フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: 根拠なし

## 260 モダニア

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-0105（確定）
  - effects[1] timed・normalHit・critDamage: 根拠なし
  - effects[2] timed・normalHit・maxAmmo: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・hitRate: 根拠なし
  - effects[1] timed・normalHit・attack: C-0124（確定）
- **burst**: partial
  - effects[0] timed・burstUse・infiniteAmmo: 根拠なし
  - effects[1] weaponChange・burstUse: 根拠なし
  - notes[0] 「フルバーストタイム 5 秒▲」は burst_duration（フルバースト 15 秒）で入っている: 根拠なし
  - notes[1] 殲滅モードの照準線拡張・照準範囲内のすべての敵を同時に照準は、単体の的では関係しない: 根拠なし

## 261 ニヒリスター

- **skill1**: unsupported
  - notes[0] フルチャージ攻撃時の貫通特化・貫通範囲の拡張は、敵 1 体ではダメージに関係しない: C-0088（確定）
  - notes[1] 2 機以上に同時に命中した時の追加ダメージは未対応（敵 1 体の前提）: C-0088（確定）
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-0091（仮説）、C-0102（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0089（確定）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）

## 271 ノワール

- **skill1**: supported
  - effects[0] passive・attack: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: 根拠なし
  - effects[1] ammoRefill・fullBurstStart: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: 根拠なし
  - effects[1] timed・burstUse・hitRate: 根拠なし
  - notes[0] SG 味方の阻止部位の攻撃ダメージ▲（10 秒間維持）は未対応（阻止部位ダメージは単体の的では関係しない）。「同じ部隊の味方がいれば」味方全体の命中率▲・阻止部位の攻撃ダメージ▲（30 秒間維持）は未対応（部隊の条件は語彙外）: 根拠なし

## 290 マナ

- **skill1**: partial
  - effects[0] passive・attack: 根拠なし
  - notes[0] 10 回攻撃ごとの味方回復、味方戦闘不能時の復活とマターガンマ解除は未対応（静止ボス・被弾なし前提では起きない）: 根拠なし
- **skill2**: partial
  - effects[0] passive・burstGaugeSpeed: 根拠なし
  - effects[1] timed・fullBurstStart・attackDamage: 根拠なし
  - effects[2] timed・fullBurstStart・attack: 根拠なし
  - notes[0] フルバースト時の「基本チャージ時間が一番長い味方 1 機」のチャージ時間 0.18 秒▼は未対応（対象が語彙外。主力キャラの Stage 以降）: 根拠なし
- **burst**: unsupported
  - notes[0] 持続ダメージ（最終攻撃力の 396% × 1 秒間隔 × 10 秒）と自分の持続ダメージ▲は未対応（tick 数が未検証）: 根拠なし

## 304 I-DOLL・フラワー

- **skill1**: unsupported
  - notes[0] 最後の弾丸が命中した対象（敵）の攻撃力▼はダメージに関係しない: C-0072（確定）
- **skill2**: unsupported
  - notes[0] 最終攻撃力が最も高い敵の攻撃力▼はダメージに関係しない: C-0072（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0072（確定）
  - notes[0] 挑発はダメージに関係しない: C-0072（確定）

## 311 ココア

- **skill1**: unsupported
  - notes[0] 味方全体の遮蔽物 HP 回復と、デバフのかかった味方のデバフ解除は、ダメージに関係しない: C-0092（確定）
- **skill2**: unsupported
  - notes[0] フルチャージ攻撃時に自分に付くプロケチャップ（受けるダメージ▼）は、ダメージに関係しない: C-0092（確定）
- **burst**: unsupported
  - notes[0] 味方全体のデバフ解除と、プロケチャップがフルスタックのときの敵全体の攻撃力▼は、ダメージに関係しない: C-0092（確定）

## 330 クラウン

- **skill1**: partial
  - effects[0] timed・fullBurstStart・attack: 根拠なし
  - effects[1] timed・fullBurstStart・reloadSpeed: 根拠なし
  - notes[0] 直前にバーストスキルを使用していない味方への防御力▲はダメージに関係しない: 根拠なし
- **skill2**: partial
  - effects[0] heal・normalShot: 根拠なし
  - effects[1] timed・healed・attackDamage: 根拠なし
  - notes[0] リラックス（受ける HP 回復量▲）・無敵・挑発はダメージに関係しない。リラックスは 20 スタックで回復するまでの数え上げにだけ使う: 根拠なし
- **burst**: partial
  - effects[0] timed・burstUse・attackDamage: 根拠なし
  - notes[0] バリアはダメージに関係しない: 根拠なし

## 352 ヘルム

- **skill1**: supported
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0098（仮説）
  - notes[0] 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: C-0098（仮説）
  - notes[0] 味方全体の吸収回復（攻撃ダメージの一定割合を回復）は未対応（回復を受けた時の効果を起こさない）: 根拠なし
  - notes[1] 説明文に出てこない数値（description_value_04・05）は使っていない: 根拠なし
- **宝物版 skill1**: partial
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
  - effects[1] burstGauge・fullChargeShot: C-0094（仮説）、C-0103（確定）
  - notes[0] フルチャージ攻撃時の味方全体の回復は未対応（回復を受けた時の効果を起こさない）: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0096（確定）
  - effects[1] damage・fullChargeShot・additional: C-0093（確定）、C-0103（確定）、C-0104（仮説）
  - notes[0] 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: 根拠なし
- **宝物版 burst**: partial
  - effects[0] burstDamage・skill: C-0096（確定）
  - effects[1] timed・burstUse・chargeDamageMultiplier: C-0099（確定）
  - notes[0] 味方全体の吸収回復（攻撃ダメージの一定割合を回復）は未対応（回復を受けた時の効果を起こさない）: 根拠なし

## 822 ラム

- **skill1**: unsupported
  - notes[0] 通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない: 根拠なし
  - notes[1] 「フルバースト終了時、同じ部隊の味方がいれば自分のバーストスキルクールタイム▼」は未対応（部隊を扱わない）。同じ部隊の味方がいない編成では起きない（C-0080）: C-0080（確定）
- **skill2**: unsupported
  - notes[0] 自分の最大HP▲と、残りの HP が最も低い味方 2 機の防御力▲は、ダメージに関係しない: 根拠なし
- **burst**: unsupported
  - notes[0] 味方全体のバリアは、ダメージに関係しない: 根拠なし

## 830 アスカ

- **skill1**: supported
  - effects[0] timed・healed・attack: C-0077（仮説）、C-0087（仮説）
  - notes[0] 戦闘開始時のバリアに与えるダメージ▲は、射撃場の敵にバリアが無いのでダメージに関係しない: 根拠なし
- **skill2**: partial
  - effects[0] timed・fullBurstStart・coreDamage: C-0075（確定）
  - notes[0] 「自分がバリア適用状態なら」有利コードの攻撃ダメージ▲は未対応（バリアを扱わない）: C-0075（確定）
- **burst**: partial
  - effects[0] timed・burstUse・attackDamage: C-0076（確定）
  - effects[1] heal・burstUse: C-0077（仮説）、C-0082（確定）
  - effects[2] timed・burstUse・hitRate: C-0076（確定）
  - notes[0] 貫通特化は射撃場の敵ではダメージに関係しない: C-0076（確定）
  - notes[1] 命中率▲はコア命中率に効かせていない（持続の命中率▲は未反映）: 根拠なし

## 862 クルミ

- **skill1**: supported
  - effects[0] dot・normalHit: C-0129（確定）、C-0130（確定）、C-0131（確定）、C-0133（仮説）
  - effects[1] dot・burstUse: C-0132（仮説）
- **skill2**: unsupported
  - notes[0] フルバーストタイム中に通常攻撃が 36 回命中した時、対象がハッキング状態なら 86.17% の追加ダメージは未実装（フルバースト中だけの命中の数え方と、対象がハッキング状態かの条件が語彙に無い）: 根拠なし
- **burst**: unsupported
  - notes[0] 敵全体の受けるダメージ 18.06%▲（10 秒間維持）は未実装（敵デバフは語彙に無い）: 根拠なし

## 870 クイーン（真）

- **skill1**: partial
  - effects[0] timed・battleStart・attack: 根拠なし
  - effects[1] timed・fullBurstEnd・attack: 根拠なし
  - notes[0] 有利コードの攻撃ダメージ・防御力（ペルソナ - ヨハンナ）と 1more/追撃の分配ダメージは未対応: 根拠なし
- **skill2**: partial
  - effects[0] passive・attackDamage: 根拠なし
  - effects[1] timed・burstStage3Enter・distributedDamage: 根拠なし
  - notes[0] バースト使用時の鉄・拳・制・裁！（有利コードの攻撃ダメージ・防御力）と 1more 時のバトンタッチ（スタック）は未対応。バースト 3 段階突入時の分配ダメージ 90.01%▲（10 秒間維持）は Stage 8 で対応（録画 21 の 6,323,975 = 1.9001 倍を再現）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし
