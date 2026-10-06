# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: `supported`（効果あり・未対応なし）・`partial`（効果あり・未対応あり）・`unsupported`（効果なし・未対応あり）・`noEffect`（前提の中でダメージに効く効果なし）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 32・効果 172（根拠あり 131）・notes 80（根拠あり 38）

notes の種類: 未対応 22・前提の外 21・計算に無関係 29・補足 8

スロット: supported 67・partial 11・unsupported 7・noEffect 20

## 10 ラピ

- **skill1**: noEffect
  - notes[0] 前提の外: 被弾 N 回で自分に攻撃力▲（維持型）は、被弾を扱わないので起きない（要件 5.2 節。射撃場の 3 分モードでは的が反撃するので発動する）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い敵への倍率ダメージは未対応（説明文にきっかけ（いつ出るか）が書かれていない）: 根拠なし
  - notes[1] 計算に無関係: 挑発はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0227（確定）
  - effects[1] timed・burstUse・attack: 根拠なし

## 17 アニス：スター

- **skill1**: partial
  - effects[0] passive・burstGaugeSpeed: C-0244（仮説）
  - effects[1] passive・attack: C-0189（確定）、C-0203（仮説）
  - effects[2] cooldownReduction・battleStart: C-0202（確定）、C-0203（仮説）
  - effects[3] cooldownReduction・fullBurstEnd: C-0202（確定）、C-0203（仮説）
  - effects[4] damage・fullChargeShot・additional: C-0190（確定）、C-0198（確定）、C-0293（仮説）
  - effects[5] burstReentry: C-0201（確定）、C-0203（仮説）
  - notes[0] 未対応: 味方のゲージへの効き方は、実測では ×1.06 ではなく、味方のゲージ 1 回（弾・追加ダメージのヒット）ごとに一定量を足す形（アニス：スターが撃っているとき約 1,680、操作で撃たないとき約 840）。モデルはまだ ×1.06 のまま（未反映）: C-0245（仮説）、C-0246（仮説）
  - notes[1] 未対応: 誘導弾の飛ぶ時間（ゲージが着弾で溜まる分）は、射撃場の的の距離帯ごとの代表値だけ。的の表の無い敵では 0（発射のフレームに溜まる）。着地点ごとの値、ダメージを置くフレームとバフの判定を着弾の時刻にすること（発動に重なる発の追加ダメージだけにバーストの攻撃ダメージ▲が乗る分）は未実装（plan/design-anis-star-gauge-timing.md 3 節）: C-0293（仮説）
- **skill2**: partial
  - effects[0] timed・fullBurstStart・attack: C-0204（確定）、C-0203（仮説）
  - effects[1] timed・fullBurstStart・projectileExplosionDamage: C-0205（確定）、C-0210（仮説）
  - effects[2] timed・fullBurstStart・attackDamage: C-0204（確定）
  - notes[0] 未対応: みんなの星のときのフルチャージ攻撃時の味方全体の回復（回復を受けた時に発動する味方のスキルには効く）: 根拠なし
- **burst**: partial
  - effects[0] autoAttack・burstUse: C-0211（確定）、C-0213（確定）、C-0207（確定）、C-0240（仮説）、C-0297（確定）、C-0298（確定）
  - effects[1] timed・burstUse・fixedChargeTime: C-0214（仮説）
  - effects[2] timed・burstUse・attackDamage: C-0209（確定）、C-0203（仮説）
  - notes[0] 未対応: シューティングスターのコアに当たる割合は射撃場の的でしか測っていない。的の表に行の無い敵では、モデルのシューティングスターはコアに当たらない（plan/design-anis-star-core-path.md 3.2 節）: C-0298（確定）
  - notes[1] 未対応: コアダメージ▲がシューティングスターのコアに乗るかは確かめていない。モデルは乗せない（plan/design-anis-star-core-path.md 7 節の論点 4）: 根拠なし
  - notes[2] 未対応: 爆発範囲▲がバーストの窓の通常攻撃のコアに当たる割合を変えるか（窓の中も外も同じ表の行でコアに当たる。C-0282。単騎の録画 164 では遠で高く中遠で低く、向きが揃わない。録画 211 では帯ごとの窓の中と外の差が小さい標本で見分けられない（V-0187）。plan/design-anis-star-core-path.md 9 節）: C-0282（確定）
  - notes[3] 計算に無関係: 防御力▲・みんなの星のときの最大 HP▲はダメージに関係しない（防御力▲は S2 の対象の比べに効く）: 根拠なし

## 20 デルタ

- **skill1**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時の自分の最大HP▲は、ダメージに関係しない: C-0081（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: バーストスキル使用時の自分の防御力▲は、ダメージに関係しない: C-0081（確定）
- **burst**: noEffect
  - notes[0] 計算に無関係: デコイ（分身）と挑発は、ダメージに関係しない: C-0081（確定）

## 32 ミランダ

- **skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0186（仮説）
  - effects[1] timed・normalHit・hitRate: C-0186（仮説）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・critDamage: C-0326（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0325（仮説）
  - effects[1] timed・burstUse・critDamage: C-0325（仮説）
- **宝物版 skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0186（仮説）
  - effects[1] timed・normalHit・hitRate: C-0186（仮説）
  - effects[2] timed・normalHit・attack: C-0187（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・critDamage: C-0323（確定）
  - effects[1] timed・fullBurstStart・critRate: C-0324（仮説）
  - effects[2] timed・fullBurstStart・attackDamage: C-0323（確定）
  - effects[3] timed・fullBurstStart・critRate: C-0334（仮説）
- **宝物版 burst**: supported
  - effects[0] timed・burstUse・attack: C-0322（確定）
  - effects[1] timed・burstUse・critDamage: C-0322（確定）

## 82 リター

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: 根拠なし
  - effects[1] cooldownReduction・fullBurstStart: 根拠なし
  - effects[2] cooldownReduction・fullBurstStart: 根拠なし
  - effects[3] timed・burstUse・maxAmmo: 根拠なし
  - effects[4] timed・burstUse・critDamage: 根拠なし
  - effects[5] timed・burstUse・attack: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 遮蔽物の HP 回復はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: 根拠なし

## 93 エマ：タクティカル・アップ

- **skill1**: partial
  - effects[0] timed・30 秒ごと・damageTaken: C-0305（確定）
  - effects[1] timed・10 秒ごと・damageTaken: C-0305（確定）、C-0306（確定）
  - notes[0] 未対応: 環境コントロールの味方全体の持続回復は未対応（回復を受けた時の効果を起こさない）: 根拠なし
  - notes[1] 計算に無関係: 陽動はダメージに関係しない: 根拠なし
- **skill2**: partial
  - effects[0] passive・critDamage: C-0266（確定）、C-0235（仮説）
  - notes[0] 未対応: 味方全体の発射体爆発ダメージ▲は未対応（語彙 projectileExplosionDamage はある）: 根拠なし
  - notes[1] 未対応: フォーメーションAS 適用中の追加効果のうち、味方全体の防御力無視ダメージ▲・発射体爆発ダメージ▲は未対応（語彙 withCharacter・trueDamage・projectileExplosionDamage はあるが、根拠の結論が無い。防御力無視ダメージの発か RL のいる編成で撮る必要がある）。環境コントロールの再発動周期 20 秒▼は S1 の効果に書いた: 根拠なし
  - notes[2] 計算に無関係: フォーメーションAS 適用中の陽動発動不可はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0337（確定）
  - effects[1] timed・burstUse・damageTaken: C-0335（確定）、C-0336（仮説）
  - notes[0] 計算に無関係: 味方全体の受ける HP 回復量▲はダメージに関係しない: 根拠なし

## 95 ウンファ：タクティカル・アップ

- **skill1**: supported
  - effects[0] timed・burstUse・trueDamageConversion: C-0311（確定）
  - effects[1] timed・burstUse・trueDamage: C-0311（確定）
  - effects[2] timed・fullChargeShot・trueDamageConversion: C-0314（確定）、C-0311（確定）
  - effects[3] timed・fullChargeShot・trueDamage: C-0314（確定）、C-0311（確定）
  - notes[0] 前提の外: カモフラージュの単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提。カモフラージュは 5 秒続く）: 根拠なし
- **skill2**: partial
  - effects[0] passive・critRate: C-0317（確定）、C-0268（仮説）、C-0235（仮説）
  - effects[1] passive・chargeDamage: C-0020（確定）
  - effects[2] passive・attack: C-0020（確定）
  - notes[0] 未対応: フォーメーションLT 適用中の追加効果（味方全体の発射体爆発ダメージ▲・防御力無視ダメージ▲）は未対応（語彙 withCharacter・projectileExplosionDamage・trueDamage はあるが、根拠の結論が無い。エマ：TU とウンファ：TU のスキルの結論が先に要る）: 根拠なし
- **burst**: supported
  - effects[0] timed・weaponChangeShot・damageTaken: C-0312（確定）、C-0138（確定）
  - effects[1] weaponChange・burstUse: C-0313（確定）

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
  - effects[0] burstDamage・skill: C-0228（確定）
  - effects[1] timed・burstUse・attackDamage: 根拠なし
  - effects[2] timed・burstUse・maxAmmo: 根拠なし

## 160 ユニ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-0013（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・maxAmmo: 根拠なし
  - effects[1] heal・fullChargeShot: C-0082（確定）
  - notes[0] 計算に無関係: 味方全体の防御力▲はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0230（確定）
  - notes[0] 計算に無関係: 移動不可（5 秒間維持）はダメージに関係しない: 根拠なし

## 172 アドミ

- **skill1**: noEffect
  - notes[0] 前提の外: 「20 回攻撃を受けた時」のチャージダメージ倍率▲は、被弾を扱わないので起きない（要件 5.2 節）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最終攻撃力が最も高い味方 2 機の受けるダメージ▼は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: 根拠なし
  - effects[1] timed・burstUse・critDamage: 根拠なし

## 191 アリス

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: 根拠なし
  - effects[1] timed・fullBurstStart・chargeDamage: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 貫通特化は敵 1 体ではダメージに関係しない: 根拠なし
  - notes[1] 前提の外: HP 80% 未満のときの回復は、被弾を扱わないので起きない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・chargeSpeed: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし

## 194 ルドミラ：ウィンターオーナー

- **skill1**: supported
  - effects[0] timed・normalHit・damageTaken: C-0138（確定）、C-0257（仮説）、C-0251（確定）
  - effects[1] damage・normalHit・additional: C-0163（確定）、C-0257（仮説）、C-0251（確定）
  - effects[2] ammoRefill・normalHit: C-0257（仮説）、C-0251（確定）、C-0256（確定）
- **skill2**: supported
  - effects[0] damage・coreHit・additional: C-0249（仮説）、C-0251（確定）
  - effects[1] timed・fullBurstStart・critRate: C-0249（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0250（仮説）、C-0252（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-0250（仮説）、C-0252（確定）

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
  - notes[0] 未対応: 最終防御力が最も高い敵への 170.58% のダメージは、説明文にきっかけ（いつ出るか）が書かれていないので未対応: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0160（確定）、C-0165（確定）
  - effects[1] timed・burstUse・damageTaken: C-0160（確定）、C-0161（確定）、C-0162（確定）、C-0165（確定）、C-0153（仮説）
  - effects[2] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - effects[3] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - notes[0] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

## 260 モダニア

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-0105（確定）、C-0119（確定）
  - effects[1] timed・normalHit・critDamage: C-0272（確定）
  - effects[2] timed・normalHit・maxAmmo: C-0272（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・hitRate: C-0170（仮説）
  - effects[1] timed・normalHit・attack: C-0124（確定）、C-0118（確定）
- **burst**: supported
  - effects[0] timed・burstUse・infiniteAmmo: C-0274（仮説）
  - effects[1] weaponChange・burstUse: C-0273（確定）、C-0274（仮説）
  - notes[0] 補足: 「フルバーストタイム 5 秒▲」は burst_duration（フルバースト 15 秒）で入っている: C-0274（仮説）
  - notes[1] 前提の外: 殲滅モードの照準線拡張・照準範囲内のすべての敵を同時に照準は、単体の的では関係しない: 根拠なし

## 261 ニヒリスター

- **skill1**: noEffect
  - notes[0] 前提の外: フルチャージ攻撃時の貫通特化・貫通範囲の拡張は、敵 1 体ではダメージに関係しない: C-0088（確定）
  - notes[1] 前提の外: 2 機以上に同時に命中した時の追加ダメージは、敵 1 体では起きない: C-0088（確定）
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-0091（仮説）、C-0102（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0089（確定）、C-0219（仮説）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）、C-0219（仮説）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）、C-0219（仮説）

## 271 ノワール

- **skill1**: supported
  - effects[0] passive・attack: C-0020（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: 根拠なし
  - effects[1] ammoRefill・fullBurstStart: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: C-0226（確定）
  - effects[1] timed・burstUse・hitRate: 根拠なし
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲（SG の味方に 10 秒、同じ部隊の味方がいれば味方全体に 30 秒）は、射撃場の敵に阻止部位が無いのでダメージに関係しない: 根拠なし
  - notes[1] 未対応: 同じ部隊の味方がいれば味方全体の命中率▲（30 秒間維持）は未対応（部隊の条件 squad はあるが、AI のサクラのコア命中率の、部隊あり・なしの直の比べ（V-0219。10 本）で R = 1.13 ± 0.08 と、付くかどうかを決められなかった）: 根拠なし

## 290 マナ

- **skill1**: partial
  - effects[0] passive・attack: C-0020（確定）
  - notes[0] 未対応: 通常攻撃 10 回ごとの味方全体の回復は未対応（回復を受けた時の効果を起こさない）: 根拠なし
  - notes[1] 前提の外: 味方の戦闘不能時の復活とマターガンマ解除は、味方が倒れないので起きない: 根拠なし
- **skill2**: supported
  - effects[0] passive・burstGaugeSpeed: C-0269（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-0281（確定）
  - effects[2] timed・fullBurstStart・attack: C-0281（確定）
  - effects[3] timed・fullBurstStart・chargeSpeed: C-0267（確定）
- **burst**: supported
  - effects[0] timed・burstUse・sustainedDamage: C-0299（確定）、C-0301（仮説）
  - effects[1] dot・burstUse: C-0300（確定）、C-0301（仮説）

## 304 I-DOLL・フラワー

- **skill1**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した対象（敵）の攻撃力▼はダメージに関係しない: C-0072（確定）
- **skill2**: supported
  - effects[0] burstGaugeHit・15 秒ごと: C-0178（確定）、C-0176（確定）
  - notes[0] 計算に無関係: 最終攻撃力が最も高い敵の攻撃力▼はダメージに関係しない: C-0072（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0072（確定）、C-0220（確定）
  - notes[0] 計算に無関係: 挑発はダメージに関係しない: C-0072（確定）

## 305 I-DOLL・オーシャン

- **skill1**: unsupported
  - notes[0] 未対応: 最後の弾丸が命中した時の、残りの HP の割合が最も低い味方 1 機の HP 回復は未対応（HP を持たないので対象が決まらない。回復を受けた時の効果を起こさない。ほかにダメージとゲージには関係しない）: C-0254（確定）
- **skill2**: unsupported
  - notes[0] 未対応: 残りの HP の割合が最も低い味方 1 機の HP 回復は未対応（説明文にきっかけが無く、録画では戦闘開始から約 15 秒、その後 15 秒ごとに発動した。HP を持たないので対象が決まらない。回復を受けた時の効果を起こさない。ほかにダメージとゲージには関係しない）: C-0254（確定）
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の HP 回復は未対応（回復を受けた時の効果を起こさない。ほかにダメージとゲージには関係しない）: C-0254（確定）

## 308 I-DOLL・サン

- **skill1**: noEffect
  - notes[0] 計算に無関係: 通常攻撃が 10 回命中した時の自分の防御力▲は、ダメージに関係しない: C-0275（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の自分の攻撃力▲は、被弾を扱わないので起きない: C-0275（確定）
- **burst**: supported
  - effects[0] timed・burstUse・maxAmmo: C-0364（確定）、C-0017（確定）、C-0275（確定）

## 311 ココア

- **skill1**: noEffect
  - notes[0] 計算に無関係: 味方全体の遮蔽物 HP 回復と、デバフのかかった味方のデバフ解除は、ダメージに関係しない: C-0092（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時に自分に付くプロケチャップ（受けるダメージ▼）は、ダメージに関係しない: C-0092（確定）
- **burst**: noEffect
  - notes[0] 計算に無関係: 味方全体のデバフ解除と、プロケチャップがフルスタックのときの敵全体の攻撃力▼は、ダメージに関係しない: C-0092（確定）

## 330 クラウン

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: 根拠なし
  - effects[1] timed・fullBurstStart・reloadSpeed: 根拠なし
  - notes[0] 計算に無関係: 直前にバーストスキルを使用していない味方への防御力▲はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] heal・normalShot: C-0271（確定）
  - effects[1] timed・healed・attackDamage: C-0050（確定）、C-0271（確定）
  - notes[0] 計算に無関係: リラックス（受ける HP 回復量▲）・無敵・挑発はダメージに関係しない: 根拠なし
  - notes[1] 補足: リラックスは 20 スタックで回復するまでの数え上げにだけ使う: C-0271（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: 根拠なし
  - notes[0] 前提の外: バリアは扱わない（要件 5.2 節）: 根拠なし

## 352 ヘルム

- **skill1**: supported
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0098（仮説）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0098（仮説）
  - effects[1] heal・burstUse: C-0346（仮説）
  - notes[0] 補足: 説明文に出てこない数値（description_value_04・05）は使っていない: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
  - effects[1] burstGauge・fullChargeShot: C-0094（仮説）、C-0103（確定）
  - effects[2] heal・fullChargeShot: C-0345（仮説）
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0096（確定）
  - effects[1] damage・fullChargeShot・additional: C-0093（確定）、C-0103（確定）、C-0104（仮説）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: 根拠なし
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-0096（確定）
  - effects[1] timed・burstUse・chargeDamageMultiplier: C-0099（確定）
  - effects[2] heal・burstUse: C-0346（仮説）

## 822 ラム

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstEnd: C-0080（確定）、C-0235（仮説）
  - notes[0] 計算に無関係: 通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない: C-0253（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の最大HP▲と、残りの HP が最も低い味方 2 機の防御力▲は、ダメージに関係しない: C-0253（確定）
- **burst**: noEffect
  - notes[0] 前提の外: 味方全体のバリアは扱わない（要件 5.2 節）: C-0253（確定）

## 830 アスカ

- **skill1**: supported
  - effects[0] timed・healed・attack: C-0077（仮説）、C-0087（仮説）
  - notes[0] 前提の外: 戦闘開始時のバリアに与えるダメージ▲は、射撃場の敵にバリアが無いのでダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・coreDamage: C-0075（確定）
  - notes[0] 前提の外: 「自分がバリア適用状態なら」有利コードの攻撃ダメージ▲は、バリアを扱わないので起きない: C-0075（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0076（確定）
  - effects[1] heal・burstUse: C-0077（仮説）、C-0082（確定）
  - effects[2] timed・burstUse・hitRate: C-0076（確定）
  - notes[0] 前提の外: 貫通特化は射撃場の敵ではダメージに関係しない: C-0076（確定）
  - notes[1] 補足: 命中率▲は、条件が自動の枠ではバースト中のコア命中率を 1 にする（N ≥ 1。持続の▲も常時の▲と同じ式で効かせる）。AR の弾丸命中率にも同じ式で効かせる（確かめたのは SMG だけ）。バーストゲージにも同じ N で効かせるが、▲の窓（10 秒）はフルバーストの窓に収まり、ゲージの溜まる時間と重ならない（きっかけの遅れは未測定で 0）: C-0037（確定）、C-0170（仮説）、C-0192（確定）、C-0011（確定）、C-0264（仮説）、C-0362（確定）、C-0363（仮説）

## 833 ミサト

- **skill1**: partial
  - effects[0] timed・normalShot・hitRate: C-0183（確定）、C-0184（仮説）
  - notes[0] 未対応: 通常攻撃 120 回ごとの味方 1 機の HP 回復は未対応（回復を受けた時の効果を起こさない。単騎ではダメージに関係しない）: C-0180（仮説）
- **skill2**: noEffect
  - notes[0] 前提の外: 射撃マニュアル状態の間の味方全体のバリアに与えるダメージ▲は、バリアの無い敵（射撃場の的）では効かない: C-0180（仮説）
  - notes[1] 計算に無関係: 射撃マニュアルのフルスタック状態の間の自分の与えるHP回復量▲は、ダメージに関係しない: C-0180（仮説）
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の持続回復は未対応（回復を受けた時の効果を起こさない。単騎ではダメージに関係しない）: C-0180（仮説）

## 836 サクラ

- **skill1**: supported
  - effects[0] timed・normalHit・damageTaken: C-0138（確定）、C-0152（確定）、C-0315（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 通常攻撃 60 回ごとの、残りの HP の割合が最も低い味方 2 機の受ける HP 回復量▲は、ダメージに関係しない: C-0316（確定）
  - notes[1] 計算に無関係: 通常攻撃 120 回ごとの、残りの HP の割合が最も低い味方 2 機の受けるダメージ▼は、防御系でダメージに関係しない: C-0316（確定）
- **burst**: unsupported
  - notes[0] 未対応: 残りの HP の割合が最も低い味方 2 機の持続回復は未対応（HP を持たないので対象が決まらない。回復を受けた時の効果を起こさない。ほかにダメージとゲージには関係しない）: C-0316（確定）

## 851 レイヴン

- **skill1**: supported
  - effects[0] dot・fullChargeShot: C-0181（確定）、C-0182（確定）、C-0111（確定）、C-0112（確定）
  - effects[1] timed・fullBurstStart・attack: C-0185（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 戦闘開始時とフルバーストタイム発動時の自分のパーツダメージ▲（急所攻略）は、射撃場の的にパーツが無いので効かない: 根拠なし
  - notes[1] 前提の外: 味方がパーツを破壊した時の、自分の持続ダメージ▲（一点集中）は、射撃場の的にパーツが無いので起きない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0185（確定）、C-0233（確定）、C-0234（確定）
  - effects[1] timed・burstUse・sustainedDamage: C-0332（確定）
  - notes[0] 補足: A.N.モードの一点集中の解除は、一点集中（S2。パーツの破壊で付く）が射撃場の的では起きないので何もしない: 根拠なし

## 862 クルミ

- **skill1**: supported
  - effects[0] dot・normalHit: C-0129（確定）、C-0130（確定）、C-0131（確定）、C-0133（確定）、C-0136（確定）、C-0196（確定）
  - effects[1] dot・burstUse: C-0136（確定）、C-0146（確定）、C-0147（確定）、C-0196（確定）
- **skill2**: supported
  - effects[0] damage・normalHit・additional: C-0276（確定）、C-0277（確定）
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-0138（確定）、C-0152（確定）、C-0153（仮説）

## 870 クイーン（真）

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0270（仮説）
  - effects[1] timed・fullBurstEnd・attack: 根拠なし
  - effects[2] passive・elementDamage: C-0296（確定）
  - effects[3] damage・burstUse・distributed: C-0310（確定）
  - effects[4] damage・followUp が適用された時・distributed: C-0361（仮説）
  - notes[0] 補足: ペルソナ - ヨハンナ（戦闘開始時・持続・解除不可）は、定義の states の persona（ペルソナ状態）で持つ: C-0354（確定）
  - notes[1] 計算に無関係: 防御力▲（ペルソナ - ヨハンナ）はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] passive・attackDamage: C-0018（確定）
  - effects[1] timed・burstStage3Enter・distributedDamage: 根拠なし
  - effects[2] timed・burstUse・elementDamage: C-0307（確定）
  - effects[3] timed・burstUse・attack: C-0357（確定）
  - notes[0] 計算に無関係: 鉄・拳・制・裁！の防御力▲はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: C-0231（確定）
  - effects[1] timed・burstUse・attack: C-0308（確定）

## 871 雪子

- **skill1**: partial
  - effects[0] timed・battleStart・attack: C-0347（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0347（確定）
  - effects[2] damage・burstUse・distributed: C-0358（確定）、C-0359（確定）
  - notes[0] 補足: ペルソナ - コノハナサクヤ（戦闘開始時・持続・解除不可）は、定義の states の persona（ペルソナ状態）で持つ: C-0354（確定）
  - notes[1] 未対応: ペルソナ - コノハナサクヤの 3 秒ごとの味方全体の回復（メディア）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
- **skill2**: partial
  - effects[0] passive・attackDamage: C-0348（確定）
  - effects[1] timed・burstUse・distributedDamage: C-0349（確定）
  - effects[2] timed・burstStage3Enter・elementDamage: C-0350（確定）、C-0360（確定）
  - effects[3] timed・burstUse・attack: C-0355（確定）
  - notes[0] 未対応: 真紅の華の 3 秒ごとの味方全体の回復（メディラマ）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[1] 計算に無関係: 真紅の守護（水冷コードの敵から受けるダメージ▼）はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: C-0351（確定）
  - effects[1] timed・burstUse・attack: C-0352（確定）
