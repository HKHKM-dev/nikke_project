# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況（`supported`・`partial`・`unsupported`）と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義には、さかのぼって結論を作らない（[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 27・効果 123（根拠あり 60）・notes 68（根拠あり 21）

## 10 ラピ

- **skill1**: unsupported
  - notes[0] 被弾 N 回で自分に攻撃力▲（維持型）は未対応（被弾は要件 5.2 でスコープ外。射撃場の 3 分モードでは的が反撃するので発動する）: 根拠なし
- **skill2**: unsupported
  - notes[0] 単体大ダメージ（最終攻撃力の 528.97%）と挑発は未対応。倍率ダメージは burst スロットの burstDamage だけが扱える: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0227（仮説）
  - effects[1] timed・burstUse・attack: 根拠なし

## 17 アニス：スター

- **skill1**: supported
  - effects[0] passive・burstGaugeSpeed: 根拠なし
  - effects[1] passive・attack: C-0189（確定）、C-0203（仮説）
  - effects[2] cooldownReduction・battleStart: C-0202（確定）、C-0203（仮説）
  - effects[3] cooldownReduction・fullBurstEnd: C-0202（確定）、C-0203（仮説）
  - effects[4] damage・fullChargeShot・additional: C-0190（確定）、C-0198（確定）
  - effects[5] burstReentry: C-0201（確定）、C-0203（仮説）
- **skill2**: partial
  - effects[0] timed・fullBurstStart・attack: C-0204（確定）、C-0203（仮説）
  - effects[1] timed・fullBurstStart・projectileExplosionDamage: C-0205（確定）、C-0210（仮説）
  - effects[2] timed・fullBurstStart・attackDamage: C-0204（確定）
  - notes[0] 未対応: みんなの星のときのフルチャージ攻撃時の味方全体の回復（回復を受けた時に発動する味方のスキルには効く）: 根拠なし
- **burst**: partial
  - effects[0] autoAttack・burstUse: C-0211（確定）、C-0213（確定）、C-0207（確定）
  - effects[1] timed・burstUse・fixedChargeTime: C-0214（仮説）
  - effects[2] timed・burstUse・attackDamage: C-0209（確定）、C-0203（仮説）
  - notes[0] 未実装: シューティングスターのコアに当たる分（コアの補正 +1 が乗る。当たる割合は距離帯ごとに未測定。plan/design-anis-star-s2-burst.md 9.3 節の b）: C-0212（仮説）
  - notes[1] 未実装: バーストの窓の通常攻撃がコアに当たる分（フルバースト中はコアの 1 ヒット。割合と、爆発範囲▲が 1 発のヒット数を変えるかは未測定。モデルは窓の外と同じ表の行。同 9.3 節の d・2.4 節）: C-0215（仮説）
  - notes[2] 防御力▲・みんなの星のときの最大 HP▲はダメージに関係しない（防御力▲は S2 の対象の比べに効く）: 根拠なし

## 20 デルタ

- **skill1**: unsupported
  - notes[0] フルチャージ攻撃時の自分の最大HP▲は、ダメージに関係しない（C-0081）: C-0081（確定）
- **skill2**: unsupported
  - notes[0] バーストスキル使用時の自分の防御力▲は、ダメージに関係しない（C-0081）: C-0081（確定）
- **burst**: unsupported
  - notes[0] デコイ（分身）と挑発は、ダメージに関係しない（C-0081）: C-0081（確定）

## 32 ミランダ

- **skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0186（仮説）
  - effects[1] timed・normalHit・hitRate: C-0186（仮説）
- **skill2**: unsupported
  - notes[0] 未実装: フルバースト開始時の味方全体のクリティカルダメージ▲（10 秒）。撮影で確かめていない（単騎ではフルバーストにならない）: 根拠なし
- **burst**: unsupported
  - notes[0] 未実装: 「自分を除く最終攻撃力が最も高い味方 1 機（足りなければ自分）」への攻撃力▲・クリティカルダメージ▲（10 秒）。自分を除く対象は語彙に無い（topAttack は自分も候補）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0186（仮説）
  - effects[1] timed・normalHit・hitRate: C-0186（仮説）
  - effects[2] timed・normalHit・attack: C-0187（確定）
- **宝物版 skill2**: unsupported
  - notes[0] 未実装: フルバースト開始時の味方全体のクリティカルダメージ▲、自分のクリティカル確率▲・攻撃ダメージ▲（10 秒）、自分を除く最終攻撃力が最も高い味方 1 機のクリティカル確率▲（1 発間）。撮影で確かめていない（単騎ではフルバーストにならない）。自分を除く対象と、その対象への発数の維持は語彙に無い: 根拠なし
- **宝物版 burst**: unsupported
  - notes[0] 未実装: 「自分を除く最終攻撃力が最も高い味方 2 機（足りなければ自分）」への攻撃力▲・クリティカルダメージ▲（10 秒）。自分を除く対象は語彙に無い: 根拠なし

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
  - effects[0] burstDamage・skill: C-0228（仮説）
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
  - effects[0] burstDamage・skill: C-0230（仮説）
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
  - effects[0] timed・burstUse・critRate: C-0160（確定）
  - effects[1] timed・burstUse・critDamage: C-0160（確定）
  - effects[2] timed・burstUse・attack: C-0160（確定）
- **skill2**: unsupported
  - notes[0] 最終防御力が最も高い敵への 170.58% のダメージは、説明文にきっかけ（いつ出るか）が書かれていないので未対応: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0160（確定）、C-0165（確定）
  - effects[1] timed・burstUse・damageTaken: C-0160（確定）、C-0161（確定）、C-0162（確定）、C-0165（確定）、C-0153（仮説）
  - effects[2] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - effects[3] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - notes[0] フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

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
  - effects[0] burstDamage・skill: C-0089（確定）、C-0219（仮説）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）、C-0219（仮説）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）、C-0219（仮説）

## 271 ノワール

- **skill1**: supported
  - effects[0] passive・attack: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: 根拠なし
  - effects[1] ammoRefill・fullBurstStart: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: C-0226（仮説）
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
- **skill2**: supported
  - effects[0] burstGaugeHit・15 秒ごと: C-0178（確定）、C-0176（確定）
  - notes[0] 最終攻撃力が最も高い敵の攻撃力▼はダメージに関係しない: C-0072（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0072（確定）、C-0220（確定）
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

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstEnd: C-0080（確定）、C-0235（仮説）
  - notes[0] 通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない: 根拠なし
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
  - notes[1] 命中率▲は、条件が自動の枠ではバースト中のコア命中率を 1 にする（N ≥ 1。持続の▲も常時の▲と同じ式で効かせる）。弾丸命中率には効かせていない（未実装）: C-0037（確定）、C-0170（仮説）

## 833 ミサト

- **skill1**: supported
  - effects[0] timed・normalShot・hitRate: C-0183（確定）、C-0184（仮説）
  - notes[0] 通常攻撃 120 回ごとの味方 1 機の HP 回復は、ダメージに関係しない: C-0180（仮説）
- **skill2**: unsupported
  - notes[0] 射撃マニュアル状態の間の味方全体のバリアに与えるダメージ▲は、バリアの無い敵（射撃場の的）では効かない: C-0180（仮説）
  - notes[1] 射撃マニュアルのフルスタック状態の間の自分の与えるHP回復量▲は、ダメージに関係しない: C-0180（仮説）
- **burst**: unsupported
  - notes[0] 味方全体の持続回復は、ダメージに関係しない: C-0180（仮説）

## 851 レイヴン

- **skill1**: supported
  - effects[0] dot・fullChargeShot: C-0181（確定）、C-0182（確定）、C-0111（確定）、C-0112（確定）
  - effects[1] timed・fullBurstStart・attack: C-0185（仮説）
- **skill2**: unsupported
  - notes[0] 戦闘開始時とフルバーストタイム発動時の自分のパーツダメージ▲（急所攻略）は未対応（パーツのダメージはモデルに無い。射撃場の的のコア・胴体には効かない見込み）: 根拠なし
  - notes[1] 味方がパーツを破壊した時、A.N.モードでなければ自分に持続ダメージ▲（一点集中）は未対応（パーツの破壊のトリガーと、持続ダメージ▲の stat が無い）: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: C-0185（仮説）、C-0233（仮説）、C-0234（仮説）
  - notes[0] 自分の A.N.モード（一点集中の解除と、持続ダメージ▲ 10 秒）は未対応（持続ダメージ▲の stat が無い）。S1 の持続ダメージに効くので、バーストの後の tick は過小になる: 根拠なし

## 862 クルミ

- **skill1**: supported
  - effects[0] dot・normalHit: C-0129（確定）、C-0130（確定）、C-0131（確定）、C-0133（確定）、C-0136（確定）、C-0196（確定）
  - effects[1] dot・burstUse: C-0136（確定）、C-0146（確定）、C-0147（確定）、C-0196（確定）
- **skill2**: unsupported
  - notes[0] フルバーストタイム中に通常攻撃が 36 回命中した時、対象がハッキング状態なら 86.17% の追加ダメージは未実装（フルバースト中だけの命中の数え方と、対象がハッキング状態かの条件が語彙に無い）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-0138（確定）、C-0152（確定）、C-0153（仮説）

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
  - effects[0] burstDamage・distributed: C-0231（仮説）
  - effects[1] timed・burstUse・attack: 根拠なし
