# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: `supported`（効果あり・未対応なし）・`partial`（効果あり・未対応あり）・`unsupported`（効果なし・未対応あり）・`noEffect`（前提の中でダメージに効く効果なし）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 58・効果 196（根拠あり 188）・notes 223（根拠あり 70）

notes の種類: 未対応 124・前提の外 37・計算に無関係 54・補足 8

スロット: supported 77・partial 16・unsupported 59・noEffect 34

## 10 ラピ

- **skill1**: noEffect
  - notes[0] 前提の外: 被弾 N 回で自分に攻撃力▲（維持型）は、被弾を扱わないので起きない（要件 5.2 節。射撃場の 3 分モードでは的が反撃するので発動する）: 根拠なし
- **skill2**: supported
  - effects[0] damage・20 秒ごと・skill: C-0403（仮説）、C-0102（確定）
  - effects[1] burstGaugeHit・20 秒ごと: C-0409（仮説）、C-0403（仮説）
  - notes[0] 計算に無関係: 挑発はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0227（確定）
  - effects[1] timed・burstUse・attack: C-0457（確定）、C-0469（確定）

## 16 ラピ：レッドフード

- **skill1**: unsupported
  - notes[0] 未対応: 部隊構成による戦闘補助（基本バースト段階が I の味方がいなければ、自分をバースト I に変更）は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイムの発動時、戦闘補助状態なら味方全体のバーストスキルクールタイム▼は未対応: 根拠なし
  - notes[2] 未対応: フルバーストタイムの発動時、戦闘補助状態なら味方全体の攻撃ダメージ▲（10 秒）は未対応: 根拠なし
  - notes[3] 未対応: フルバーストタイムの発動時、戦闘補助状態でなければ自分の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[4] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: unsupported
  - notes[0] 未対応: 電撃コードの敵への有利コード、発射体付着ダメージ▲・発射体爆発ダメージ▲（持続）は未対応: 根拠なし
  - notes[1] 未対応: 通常攻撃 120 回ごとの粘着榴弾（付着と起爆のダメージ）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: バースト I で使った時の、自分のバーストスキルクールタイム▼は未対応: 根拠なし
  - notes[1] 未対応: バースト I で使った時の、味方全体のスキル発動者基準の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[2] 未対応: バースト III で使った時の、照準線に最も近い敵 1 機への追加ダメージは未対応: 根拠なし
  - notes[3] 未対応: 爆発範囲▲・発射体付着ダメージ▲・粘着榴弾の回数条件▼（10 秒）は未対応（爆発範囲はダメージの式に無い）: 根拠なし

## 17 アニス：スター

- **skill1**: partial
  - effects[0] passive・burstGaugeSpeed: C-0244（仮説）
  - effects[1] passive・attack: C-0189（確定）、C-0203（仮説）
  - effects[2] cooldownReduction・battleStart: C-0202（確定）、C-0203（仮説）
  - effects[3] cooldownReduction・fullBurstEnd: C-0202（確定）、C-0203（仮説）
  - effects[4] damage・fullChargeShot・additional: C-0190（確定）、C-0198（確定）、C-0413（確定）、C-0461（確定）
  - effects[5] burstReentry: C-0201（確定）、C-0203（仮説）
  - notes[0] 未対応: 味方のゲージへの効き方は、実測では ×1.06 ではなく、味方のゲージ 1 回（弾・追加ダメージのヒット）ごとに一定量を足す形（アニス：スターが撃っているとき約 1,680、操作で撃たないとき約 840）。モデルはまだ ×1.06 のまま（未反映）: C-0245（仮説）、C-0246（仮説）
  - notes[1] 未対応: 誘導弾の飛ぶ時間（ゲージが着弾で溜まる分）は、射撃場の的の距離帯ごとの代表値だけ。的の表の無い敵では 0（発射のフレームに溜まる）。着地点ごとの値、ダメージを置くフレームとバフの判定を着弾の時刻にすること（発動に重なる発の追加ダメージだけにバーストの攻撃ダメージ▲が乗る分）は未実装（plan/design-anis-star-gauge-timing.md 3 節）: C-0413（確定）、C-0461（確定）
- **skill2**: partial
  - effects[0] timed・fullBurstStart・attack: C-0204（確定）、C-0203（仮説）
  - effects[1] timed・fullBurstStart・projectileExplosionDamage: C-0205（確定）、C-0210（仮説）
  - effects[2] timed・fullBurstStart・attackDamage: C-0204（確定）
  - notes[0] 未対応: みんなの星のときのフルチャージ攻撃時の味方全体の回復（回復を受けた時に発動する味方のスキルには効く）: 根拠なし
- **burst**: partial
  - effects[0] autoAttack・burstUse: C-0211（確定）、C-0213（確定）、C-0207（確定）、C-0240（仮説）、C-0297（確定）、C-0466（確定）
  - effects[1] timed・burstUse・fixedChargeTime: C-0214（確定）
  - effects[2] timed・burstUse・attackDamage: C-0209（確定）、C-0203（仮説）
  - notes[0] 未対応: シューティングスターのコアに当たる割合は射撃場の的でしか測っていない。的の表に行の無い敵では、モデルのシューティングスターはコアに当たらない（plan/design-anis-star-core-path.md 3.2 節）: C-0466（確定）
  - notes[1] 未対応: コアダメージ▲がシューティングスターのコアに乗るかは確かめていない。モデルは乗せない（plan/design-anis-star-core-path.md 7 節の論点 4）: 根拠なし
  - notes[2] 未対応: 爆発範囲▲がバーストの窓の通常攻撃のコアに当たる割合を変えるか（窓の中も外も同じ表の行でコアに当たる。C-0424。単騎の録画 320・321 で同じ遠の区間の窓の中と外を比べても差は見分けられず、遠の割合は録画どうしで食い違う（C-0425。V-0297）。0.1〜0.2 程度の差は否定できない。plan/design-anis-star-core-path.md 11 節）: C-0424（確定）、C-0425（仮説）
  - notes[3] 計算に無関係: 防御力▲・みんなの星のときの最大 HP▲はダメージに関係しない（防御力▲は S2 の対象の比べに効く）: 根拠なし

## 18 ネオン：ビジョン・アイ

- **skill1**: partial
  - effects[0] damage・fullChargeShot・additional: C-0410（確定）
  - notes[0] 前提の外: 攻撃を受けた時の無敵・デバフ免疫・受けるHP回復量▲は、被弾を扱わないので起きない: 根拠なし
  - notes[1] 未対応: 超火力状態のときの追加ダメージ（262.79%）は未対応（超火力はバーストの火力ゲージで決まる）: C-0410（確定）
- **skill2**: partial
  - effects[0] timed・fullBurstStart・attack: 根拠なし
  - notes[0] 未対応: 火力ゲージ（戦闘開始時 100、火力チャージ状態の通常攻撃で 2、終了時 45）と、フルバースト終了時のゲージ量に比例するバーストゲージのチャージ速度▲・超火力の攻撃力▲は未対応: 根拠なし
- **burst**: partial
  - effects[0] timed・burstUse・attackDamage: 根拠なし
  - notes[0] 未対応: 火力ゲージが 100 のときの超火力（攻撃ダメージ▲）と、100 未満のときの火力チャージは未対応: 根拠なし
  - notes[1] 未対応: 爆発範囲▲は未対応（爆発範囲はダメージの式に無い）: 根拠なし

## 20 デルタ

- **skill1**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時の自分の最大HP▲は、ダメージに関係しない: C-0081（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: バーストスキル使用時の自分の防御力▲は、ダメージに関係しない: C-0081（確定）
- **burst**: noEffect
  - notes[0] 計算に無関係: デコイ（分身）と挑発は、ダメージに関係しない: C-0081（確定）

## 32 ミランダ

- **skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0440（確定）、C-0441（仮説）
  - effects[1] timed・normalHit・hitRate: C-0440（確定）、C-0441（仮説）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・critDamage: C-0326（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0325（仮説）
  - effects[1] timed・burstUse・critDamage: C-0325（仮説）
- **宝物版 skill1**: supported
  - effects[0] timed・normalHit・hitRate: C-0440（確定）、C-0441（仮説）
  - effects[1] timed・normalHit・hitRate: C-0440（確定）、C-0441（仮説）
  - effects[2] timed・normalHit・attack: C-0187（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・critDamage: C-0323（確定）
  - effects[1] timed・fullBurstStart・critRate: C-0324（確定）
  - effects[2] timed・fullBurstStart・attackDamage: C-0323（確定）
  - effects[3] timed・fullBurstStart・critRate: C-0334（確定）
- **宝物版 burst**: supported
  - effects[0] timed・burstUse・attack: C-0322（確定）、C-0450（確定）、C-0451（確定）
  - effects[1] timed・burstUse・critDamage: C-0322（確定）、C-0450（確定）、C-0451（確定）

## 60 ベロータ

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージ攻撃時の自分の爆発範囲▲（5 秒）は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 4 機以上に同時に命中した時の防御力▼と追加ダメージは、敵 1 体では起きない: C-0443（範囲外）
- **burst**: unsupported
  - notes[0] 未対応: 攻撃範囲内の敵へのダメージは未対応: 根拠なし
  - notes[1] 未対応: 味方全体のチャージ速度▲（10 秒）は未対応: 根拠なし

## 82 リター

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[3] timed・burstUse・maxAmmo: C-0468（確定）
  - effects[4] timed・burstUse・critDamage: C-0468（確定）、C-0493（確定）
  - effects[5] timed・burstUse・attack: C-0468（確定）、C-0493（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 遮蔽物の HP 回復はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0468（確定）、C-0493（確定）

## 90 エマ

- **skill1**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の味方全体の HP 回復は、被弾を扱わないので起きない（要件 5.2 節。射撃場の 3 分モードでは的が反撃するので起きうる）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の HP が 90% 以上の時の、味方全体の受けるHP回復量▲はダメージに関係しない: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の HP 回復と吸収回復（攻撃ダメージの X% 回復・5 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし

## 93 エマ：タクティカル・アップ

- **skill1**: partial
  - effects[0] timed・30 秒ごと・damageTaken: C-0305（確定）
  - effects[1] timed・10 秒ごと・damageTaken: C-0305（確定）、C-0306（確定）
  - notes[0] 未対応: 環境コントロールの味方全体の持続回復は未対応（回復を受けた時の効果を起こさない）: 根拠なし
  - notes[1] 計算に無関係: 陽動はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] passive・critDamage: C-0266（確定）、C-0235（仮説）
  - effects[1] passive・projectileExplosionDamage: C-0373（確定）、C-0205（確定）
  - effects[2] passive・trueDamage: C-0375（確定）、C-0306（確定）
  - effects[3] passive・projectileExplosionDamage: C-0374（確定）、C-0306（確定）
  - notes[0] 計算に無関係: フォーメーションAS 適用中の陽動発動不可はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0337（確定）、C-0497（確定）
  - effects[1] timed・burstUse・damageTaken: C-0335（確定）、C-0336（仮説）、C-0379（仮説）
  - notes[0] 計算に無関係: 味方全体の受ける HP 回復量▲はダメージに関係しない: 根拠なし

## 95 ウンファ：タクティカル・アップ

- **skill1**: supported
  - effects[0] timed・burstUse・trueDamageConversion: C-0311（確定）
  - effects[1] timed・burstUse・trueDamage: C-0311（確定）
  - effects[2] timed・fullChargeShot・trueDamageConversion: C-0314（確定）、C-0311（確定）
  - effects[3] timed・fullChargeShot・trueDamage: C-0314（確定）、C-0311（確定）
  - notes[0] 前提の外: カモフラージュの単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提。カモフラージュは 5 秒続く）: 根拠なし
- **skill2**: supported
  - effects[0] passive・critRate: C-0317（確定）、C-0268（仮説）、C-0235（仮説）
  - effects[1] passive・chargeDamage: C-0020（確定）
  - effects[2] passive・attack: C-0020（確定）
  - effects[3] passive・projectileExplosionDamage: C-0374（確定）
  - effects[4] passive・trueDamage: C-0375（確定）
- **burst**: partial
  - effects[0] timed・weaponChangeShot・damageTaken: C-0312（確定）、C-0138（確定）
  - effects[1] weaponChange・burstUse: C-0313（確定）
  - notes[0] 未対応: 炸裂弾（使用武器変更の 1 発）に発射体爆発ダメージ▲が乗る分は未対応。録画では (1 + 防御力無視ダメージ▲ + 発射体爆発ダメージ▲) の和で掛かっていた（C-0376。変更後の武器の発に発射体の爆発を持たせる語彙と、2 つの▲の置き場所が要る）: C-0376（確定）

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
  - effects[0] timed・fullBurstStart・attack: C-0459（確定）
  - effects[1] timed・fullBurstStart・attack: C-0471（確定）
  - effects[2] timed・fullBurstStart・maxAmmo: C-0471（確定）
  - effects[3] timed・fullBurstStart・hitRate: C-0485（確定）、C-0486（仮説）
- **宝物版 skill2**: supported
  - effects[0] damage・normalShot・skill: C-0458（確定）
  - effects[1] damage・normalShot・skill: C-0458（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-0228（確定）
  - effects[1] timed・burstUse・attackDamage: C-0420（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0420（確定）

## 103 ラプラス：アルティメットヒーロー

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時の、最終最大HPに比例する自分の攻撃力▲（持続）は未対応: 根拠なし
  - notes[1] 未対応: フルチャージ攻撃時のウォームアップ（チャージ速度▲・5 スタック）は未対応: 根拠なし
  - notes[2] 未対応: ウォームアップのフルスタックの後の使用武器変更（エレクトリックパワー・フル・フルチャージ）と、終了時の残弾数減少は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 使用武器変更中の通常攻撃によるオーバーエネルギー（最大HP▲の段階）は未対応（最大HP は S1 の攻撃力▲に効く）: 根拠なし
  - notes[1] 未対応: バースト 3 段階突入時の自分の攻撃ダメージ▲（10 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 自分の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: 敵全体へのバーストスキルダメージと、オーバーエネルギーの段階に応じた追加ダメージは未対応: 根拠なし

## 121 エヌ : ミラクルフェアリー

- **skill1**: unsupported
  - notes[0] 未対応: 通常攻撃 3 回ごとの、支援型の味方全体の吸収回復（攻撃ダメージの X% 回復・5 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の HP が 90% 以上の時の味方全体の受けるHP回復量▲と、最後の弾丸が命中した時の敵全体の受けるHP回復量▼はダメージに関係しない（後半はバーストゲージも溜めない。C-0431）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 火力型の味方全体の HP 回復は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[1] 未対応: 火力型の味方全体の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[2] 前提の外: 戦闘不能の火力型の味方の復活は、味方が倒れないので起きない（要件 5.2 節）: C-0443（範囲外）

## 160 ユニ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-0013（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・maxAmmo: C-0390（確定）
  - effects[1] heal・fullChargeShot: C-0082（確定）
  - notes[0] 計算に無関係: 味方全体の防御力▲はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0230（確定）
  - notes[0] 計算に無関係: 移動不可（5 秒間維持）はダメージに関係しない: 根拠なし

## 162 ミハラ：ボンディングチェーン

- **skill1**: unsupported
  - notes[0] 未対応: キャプチャーチェーン（戦闘開始時と、バーストを使ったフルバーストタイムの終了時のチャージ）による、ランダムな敵へのダメージは未対応: 根拠なし
  - notes[1] 未対応: チェーンバインド（同じ敵への持続ダメージ・20 スタック・持続）は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: フルバーストタイム中の通常攻撃 40 回命中ごとの、チェーンバインドのスタック量▲は未対応: 根拠なし
  - notes[1] 前提の外: 自分が戦闘不能になった時のスタック量▲と、敵が破壊された時のキャプチャーチェーン▲は、前提（味方が倒れない・敵 1 体）の外（要件 5.2 節）: C-0443（範囲外）
  - notes[2] 未対応: バースト 3 段階突入時の自分の持続ダメージ▲（10 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: チェーンバインド状態の対象への持続ダメージ（プリング・チェーン）は未対応: 根拠なし

## 172 アドミ

- **skill1**: noEffect
  - notes[0] 前提の外: 「20 回攻撃を受けた時」のチャージダメージ倍率▲は、被弾を扱わないので起きない（要件 5.2 節）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最終攻撃力が最も高い味方 2 機の受けるダメージ▼は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: C-0456（確定）、C-0479（仮説）
  - effects[1] timed・burstUse・critDamage: C-0463（確定）、C-0479（仮説）

## 190 ルドミラ

- **skill1**: unsupported
  - notes[0] 未対応: 最後の弾丸が命中した時の対象の防御力▼（10 秒）は未対応: 根拠なし
  - notes[1] 計算に無関係: 最後の弾丸が命中した時の対象の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルバーストタイムの発動時の敵全体への挑発と、自分の受けるダメージ▼はダメージに関係しない: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い敵 10 機へのダメージは未対応: 根拠なし
  - notes[1] 計算に無関係: 自分の HP が 50% 以上の時の味方全体の防御力▲はダメージに関係しない: 根拠なし

## 191 アリス

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-0474（確定）
  - effects[1] timed・fullBurstStart・chargeDamage: C-0474（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 貫通特化は敵 1 体ではダメージに関係しない: C-0443（範囲外）
  - notes[1] 前提の外: HP 80% 未満のときの回復は、被弾を扱わないので起きない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・chargeSpeed: C-0475（確定）
  - effects[1] timed・burstUse・attack: C-0475（確定）

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
  - effects[0] timed・fullBurstStart・maxAmmo: C-0490（確定）
  - effects[1] ammoRefill・fullBurstStart: C-0490（確定）
- **burst**: supported
  - effects[0] cycleEvery・burstUse: C-0492（確定）
  - effects[1] timed・burstUse・attack: C-0491（確定）
  - effects[2] timed・burstUse・chargeDamage: C-0491（確定）

## 226 ラプンツェル：ピュアグレイス

- **skill1**: unsupported
  - notes[0] 前提の外: 戦闘開始時とバースト使用時の共用バリアは扱わない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: フルチャージ状態を 1 秒以上維持した時、自分がバリア適用状態なら味方全体の攻撃ダメージ▲（持続）は未対応（バリアを扱わないので条件が決まらない）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: フルチャージ攻撃時の自分の HP 回復は未対応（回復を受けた時の効果を起こしうる）: 根拠なし
  - notes[1] 計算に無関係: バリア適用状態の時の現在のHP▼とバリアHP回復はダメージに関係しない: 根拠なし
- **burst**: unsupported
  - notes[0] 計算に無関係: 自分の最大HP▲はダメージに関係しない: 根拠なし
  - notes[1] 未対応: 味方全体の攻撃ダメージ▲（10 秒）は未対応: 根拠なし

## 231 イサベル

- **skill1**: supported
  - effects[0] timed・burstUse・critRate: C-0160（確定）
  - effects[1] timed・burstUse・critDamage: C-0160（確定）
  - effects[2] timed・burstUse・attack: C-0160（確定）
- **skill2**: supported
  - effects[0] damage・15 秒ごと・skill: C-0402（仮説）、C-0102（確定）
  - effects[1] burstGaugeHit・15 秒ごと: C-0404（仮説）、C-0402（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0160（確定）、C-0165（確定）
  - effects[1] timed・burstUse・damageTaken: C-0160（確定）、C-0161（確定）、C-0162（確定）、C-0165（確定）、C-0153（仮説）
  - effects[2] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - effects[3] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - notes[0] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

## 242 フォルクヴァン

- **skill1**: noEffect
  - notes[0] 前提の外: 最終攻撃力が最も高い味方 2 機へのバリアは扱わない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 計算に無関係: 最終攻撃力が最も高い味方 2 機への受けるHP回復量▲はダメージに関係しない: 根拠なし
- **skill2**: unsupported
  - notes[0] 計算に無関係: 最終攻撃力が最も高い敵 1 機への挑発と、自分の最大HP▲はダメージに関係しない: 根拠なし
  - notes[1] 未対応: S2 の発動のたびに、射手の target_burst_energy_pershot（4,000）のゲージを溜めるのは未対応（説明文にきっかけが無い。C-0422）: C-0422（確定）
- **burst**: unsupported
  - notes[0] 前提の外: 最終攻撃力が最も高い味方 2 機へのバリアは扱わない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: 最終攻撃力が最も高い味方 2 機の吸収回復（攻撃ダメージの X% 回復・10 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし

## 260 モダニア

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-0105（確定）、C-0119（確定）
  - effects[1] timed・normalHit・critDamage: C-0272（確定）
  - effects[2] timed・normalHit・maxAmmo: C-0272（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・hitRate: C-0485（確定）、C-0486（仮説）
  - effects[1] timed・normalHit・attack: C-0124（確定）、C-0118（確定）
- **burst**: partial
  - effects[0] timed・burstUse・infiniteAmmo: C-0455（確定）、C-0452（確定）
  - effects[1] weaponChange・burstUse: C-0273（確定）、C-0455（確定）、C-0452（確定）
  - notes[0] 補足: 「フルバーストタイム 5 秒▲」は burst_duration（フルバースト 15 秒）で入っている: C-0455（確定）
  - notes[1] 未対応: 殲滅モードと装弾数無限は III の発動の 6f 後に付き、殲滅モードの最初の発は発動の 7f 後（C-0452。遅れの表の行）。実測では止まりの明けから殲滅モードの最初の発までモダニアは撃たない（発動の前も 6〜19f 撃たない回がある）が、モデルはこの間も通常の MG の発を撃つ（未対応）: C-0452（確定）
  - notes[2] 前提の外: 殲滅モードの照準線拡張・照準範囲内のすべての敵を同時に照準は、単体の的では関係しない: C-0443（範囲外）

## 261 ニヒリスター

- **skill1**: noEffect
  - notes[0] 前提の外: フルチャージ攻撃時の貫通特化・貫通範囲の拡張は、敵 1 体ではダメージに関係しない: C-0088（確定）
  - notes[1] 前提の外: 2 機以上に同時に命中した時の追加ダメージは、敵 1 体では起きない: C-0088（確定）
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-0102（確定）、C-0401（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0089（確定）、C-0219（確定）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）、C-0219（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）

## 270 ブラン

- **skill1**: noEffect
  - notes[0] 前提の外: 通常攻撃 120 回ごとの味方共用バリアは扱わない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: unsupported
  - notes[0] 未対応: フルバーストタイム終了時の味方全体の持続回復は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[1] 未対応: フルバーストタイム終了時、同じ部隊の味方がいれば自分のバーストスキルクールタイム▼は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の持続回復（8 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[1] 計算に無関係: 残りの HP が最も低い味方 1 機への不屈と最大HP▲はダメージに関係しない: 根拠なし
  - notes[2] 未対応: 敵全体の受けるダメージ▲（10 秒）は未対応: 根拠なし

## 271 ノワール

- **skill1**: supported
  - effects[0] passive・attack: C-0020（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: C-0395（確定）
  - effects[1] ammoRefill・fullBurstStart: C-0395（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0226（確定）
  - effects[1] timed・burstUse・hitRate: C-0396（仮説）
  - effects[2] timed・burstUse・hitRate: C-0442（仮説）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲（SG の味方に 10 秒、同じ部隊の味方がいれば味方全体に 30 秒）は、射撃場の敵に阻止部位が無いのでダメージに関係しない: C-0443（範囲外）

## 281 モラン

- **skill1**: unsupported
  - notes[0] 計算に無関係: 戦闘開始時の、自分の失った HP に応じた防御力▲はダメージに関係しない: 根拠なし
  - notes[1] 未対応: 武器変更状態で通常攻撃が 5 回命中した時の、対象への追加ダメージ（最終攻撃力の X%）は未対応（撮っていない。武器変更の中の命中を数えるトリガーが無い）: 根拠なし
- **skill2**: supported
  - effects[0] burstGaugeHit・lastShot: C-0480（確定）
  - notes[0] 計算に無関係: 最後の弾丸で攻撃した時の、最終攻撃力が最も高い敵 3 機への挑発（4 秒）そのものはダメージに関係しない（ゲージは effects[0]）: 根拠なし
  - notes[1] 計算に無関係: HP 20% 以下の時の、自分への使用回数別の最大 HP▲はダメージに関係しない: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 使用武器の変更（最終攻撃力の X% のダメージ・10 秒）は未対応（撮っていない）: 根拠なし
  - notes[1] 未対応: 自分への装弾数無限（10 秒）は未対応（使用武器の変更と合わせて撮っていない）: 根拠なし
  - notes[2] 未対応: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[3] 計算に無関係: 敵全体への挑発（ヘイト）、味方全体への受けるダメージ▼・発動者基準の防御力▲はダメージに関係しない: 根拠なし
- **宝物版 skill1**: unsupported
  - notes[0] 計算に無関係: 戦闘開始時の、自分の失った HP に応じた防御力▲はダメージに関係しない: 根拠なし
  - notes[1] 未対応: 武器変更状態で通常攻撃が 5 回命中した時の、対象への追加ダメージ（最終攻撃力の X%）は未対応（撮っていない。武器変更の中の命中を数えるトリガーが無い）: 根拠なし
  - notes[2] 未対応: ラプチャーが出現した時の、自分への熱血（バーストスキルのクールタイム 20 秒▼・持続）は未対応（持続するクールタイム▼の語彙が無い。撮っていない）: 根拠なし
- **宝物版 skill2**: partial
  - effects[0] burstGaugeHit・lastShot: C-0480（確定）
  - notes[0] 計算に無関係: 最後の弾丸で攻撃した時の、最終攻撃力が最も高い敵 3 機への挑発（4 秒）そのものはダメージに関係しない（ゲージは effects[0]）: 根拠なし
  - notes[1] 計算に無関係: HP 20% 以下の時の、自分への使用回数別の最大 HP▲はダメージに関係しない: 根拠なし
  - notes[2] 未対応: フルバーストタイムの発動時、熱血状態なら味方全体のバーストスキルクールタイム▼は未対応（撮っていない）: 根拠なし
- **宝物版 burst**: unsupported
  - notes[0] 未対応: 使用武器の変更（最終攻撃力の X% のダメージ・10 秒）は未対応（撮っていない）: 根拠なし
  - notes[1] 未対応: 自分への装弾数無限（10 秒）は未対応（使用武器の変更と合わせて撮っていない）: 根拠なし
  - notes[2] 未対応: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は未対応（回復を受けた時の効果を持つ味方の発動を変える）: 根拠なし
  - notes[3] 計算に無関係: 敵全体への挑発（ヘイト）、味方全体への受けるダメージ▼・発動者基準の防御力▲はダメージに関係しない: 根拠なし
  - notes[4] 未対応: 味方全体への発動者基準の攻撃力▲（10 秒）は未対応（撮っていない）: 根拠なし

## 290 マナ

- **skill1**: partial
  - effects[0] passive・attack: C-0020（確定）
  - notes[0] 未対応: 通常攻撃 10 回ごとの味方全体の回復は未対応（回復を受けた時の効果を起こさない）: 根拠なし
  - notes[1] 前提の外: 味方の戦闘不能時の復活とマターガンマ解除は、味方が倒れないので起きない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] passive・burstGaugeSpeed: C-0269（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-0281（確定）
  - effects[2] timed・fullBurstStart・attack: C-0281（確定）
  - effects[3] timed・fullBurstStart・chargeSpeed: C-0267（確定）
- **burst**: supported
  - effects[0] timed・burstUse・sustainedDamage: C-0299（確定）、C-0301（仮説）
  - effects[1] dot・burstUse: C-0300（確定）、C-0301（仮説）

## 291 エーテル

- **skill1**: noEffect
  - notes[0] 計算に無関係: 残りの HP の数値が最も低い味方 1 機に受けるダメージ▼は、ダメージとゲージに関係しない: 根拠なし
- **skill2**: partial
  - effects[0] damage・13 秒ごと・skill: C-0405（確定）、C-0102（確定）
  - effects[1] burstGaugeHit・13 秒ごと: C-0409（仮説）、C-0405（確定）
  - notes[0] 未対応: フルバーストタイム持続中に発動した時の、同じ敵への防御力▼は未対応（語彙と効きの確かめが要るため）: 根拠なし
- **burst**: noEffect
  - notes[0] 計算に無関係: 残りの HP の数値が最も低い味方へのバリアは、ダメージとゲージに関係しない: 根拠なし

## 300 ソルジャーE.G.

- **skill1**: supported
  - effects[0] timed・normalHit・attack: C-0372（確定）
- **skill2**: supported
  - effects[0] timed・9 秒ごと・maxAmmo: C-0369（確定）、C-0017（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0371（確定）、C-0370（確定）

## 301 ソルジャーF.A.

- **skill1**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の自分の防御力▲は、被弾を扱わないので起きない: C-0366（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の吸収回復（攻撃ダメージの一部を回復）は、ダメージに関係しない（自分にだけ付き、ソルジャーF.A. に回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: C-0366（確定）
- **burst**: noEffect
  - notes[0] 計算に無関係: 自分の最大HP▲は、ダメージに関係しない: C-0366（確定）

## 302 プロダクト08

- **skill1**: noEffect
  - notes[0] 計算に無関係: 通常攻撃命中時（確率 20%）の残りの HP が最も低い味方 1 機の防御力▲は、被弾を扱わないのでダメージに関係しない: C-0072（確定）
- **skill2**: supported
  - effects[0] timed・17 秒ごと・critRate: C-0496（確定）
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の攻撃力▲（10 秒）は未対応（単騎ではバーストを撃たず、撮っていない）: 根拠なし

## 304 I-DOLL・フラワー

- **skill1**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した対象（敵）の攻撃力▼はダメージに関係しない: C-0072（確定）、C-0367（確定）
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

## 307 プロダクト23

- **skill1**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の自分の防御力▲はダメージに関係しない: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は未対応（説明文にきっかけが無い。回復を受けた時の効果を起こしうる）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い敵 2 機への防御力▼（5 秒）は未対応: 根拠なし

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

## 313 プリバティ：アンカインド・メイド

- **skill1**: supported
  - effects[0] damage・pelletHit・skill: C-0408（確定）
- **skill2**: unsupported
  - notes[0] 未対応: 通常攻撃 1 回でペレットが 5 個以上命中した時の自分のリロード速度▲（2 秒）は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイム中のペレット 30 回命中ごとの、自分の弾丸チャージと攻撃力▲（5 スタック・2 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 自分の攻撃ダメージ▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: 自分のクリティカルダメージ▲（10 秒）は未対応: 根拠なし
  - notes[2] 未対応: 敵全体へのバーストスキルダメージは未対応: 根拠なし

## 314 ソーダ：トゥインクルバニー

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時のゴールデンチップ 50 個と、フルバーストタイム中の通常攻撃 3 回ごとのゴールデンチップ（クリティカルダメージ▲・最大 50 スタック・持続）は未対応（戦闘開始からの 66% は C-0128）: 根拠なし
  - notes[1] 未対応: フルバーストタイム中の通常攻撃 3 回ごとの、自分と自分を除く最終攻撃力が最も高い味方 1 機への攻撃ダメージ▲（2 秒）は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: バースト 3 段階突入時の、ゴールデンチップのスタック量別のフルバーストタイムの持続時間▲は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイム中の通常攻撃ごとの、時間延長状態別のダメージは未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: ゴールデンチップのスタック量別の、敵全体へのバーストスキルダメージは未対応: 根拠なし
  - notes[1] 未対応: ゴールデンチップのスタック量別の、自分の命中率▲（15 秒）は未対応: 根拠なし
  - notes[2] 未対応: ゴールデンチップのスタック量別の、自分の攻撃力▲（15 秒）は未対応: 根拠なし

## 330 クラウン

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0393（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-0394（確定）
  - notes[0] 計算に無関係: 直前にバーストスキルを使用していない味方への防御力▲はダメージに関係しない: C-0393（確定）
- **skill2**: supported
  - effects[0] heal・normalShot: C-0271（確定）
  - effects[1] timed・healed・attackDamage: C-0050（確定）、C-0271（確定）
  - notes[0] 計算に無関係: リラックス（受ける HP 回復量▲）・無敵・挑発はダメージに関係しない: 根拠なし
  - notes[1] 補足: リラックスは 20 スタックで回復するまでの数え上げにだけ使う: C-0271（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0393（確定）、C-0498（仮説）
  - notes[0] 前提の外: バリアは扱わない（要件 5.2 節）: C-0393（確定）

## 331 チャイム

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時に自分の王へ付ける、スキル発動者基準の攻撃力▲（持続）は未対応（王の決まり方を扱っていない）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: フルバーストタイムの発動時に自分の王へ付ける通常攻撃ダメージ倍率▲（10 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体のバースト再突入 2 段階は未対応: 根拠なし
  - notes[1] 未対応: 味方全体の最大装弾数▲（10 秒）は未対応: 根拠なし
  - notes[2] 未対応: 自分の王への攻撃ダメージ▲（10 秒）は未対応: 根拠なし

## 352 ヘルム

- **skill1**: supported
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0098（仮説）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0098（仮説）
  - effects[1] heal・burstUse: C-0346（仮説）
  - notes[0] 補足: 説明文に出てこない数値（description_value_04・05）は使っていない: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・lastShot・normalCritRate: C-0097（確定）
  - effects[1] burstGauge・fullChargeShot: C-0094（確定）、C-0103（確定）
  - effects[2] heal・fullChargeShot: C-0345（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-0096（確定）
  - effects[1] damage・fullChargeShot・additional: C-0093（確定）、C-0103（確定）、C-0104（確定）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない: C-0443（範囲外）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-0096（確定）
  - effects[1] timed・burstUse・chargeDamageMultiplier: C-0099（確定）
  - effects[2] heal・burstUse: C-0346（仮説）

## 471 スノーホワイト：ヘビーアームズ

- **skill1**: unsupported
  - notes[0] 未対応: チャージ中の 0.2 秒ごとのロックオンと、ロックオン状態の敵全体への受けるダメージ▲（4 秒）は未対応（ゲージは溜めない。C-0426）: 根拠なし
  - notes[1] 計算に無関係: チャージ中のオートファイア準備（防御力▲）はダメージに関係しない: 根拠なし
  - notes[2] 未対応: フルチャージ攻撃時のオートファイア（敵全体と、ロックオン対象への装填数分の順番の攻撃）は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 戦闘開始時のチャージ時間 1.2 秒の固定（持続）は未対応: 根拠なし
  - notes[1] 未対応: フルチャージした時の自分の攻撃力▲（5 秒）は未対応: 根拠なし
  - notes[2] 前提の外: フルチャージした時の貫通特化とパーツダメージ▲は、敵 1 体・パーツの無い射撃場の的ではダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
  - notes[3] 未対応: バースト 3 段階突入時の自分の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[4] 未対応: セブンスドワーフ・フルアクティブ状態のフルチャージ時のチャージダメージ▲・順番攻撃ダメージ▲（1 発）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 自分の攻撃ダメージ▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: セブンスドワーフ・フルアクティブ（チャージ時間 3.2 秒の固定、ロックオン対象数とオートファイア準備の装填数▲、使用回数 2 回）は未対応: 根拠なし
  - notes[2] 前提の外: 破壊可能な発射体全体へのダメージは、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）

## 500 エレグ

- **skill1**: unsupported
  - notes[0] 前提の外: 戦闘開始時の、敵の発射体を攻撃する時の発射体に与えるダメージ▲は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: 通常攻撃 100 回命中ごとの、ブームインストール状態の対象と周囲の敵への分配ダメージは未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 通常攻撃 60 回命中ごとの、対象がブームインストール状態のときの味方全体の攻撃力▲（5 秒）は未対応: 根拠なし
  - notes[1] 未対応: ターゲットが出現した時の味方全体のバーストゲージのチャージ 100%（戦闘中 1 回）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の分配ダメージ▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: 照準線に最も近い敵 1 機へのバーストスキルダメージと、ブームインストール（防御力▼・10 秒）は未対応: 根拠なし

## 501 トロニー

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージ攻撃が命中した時の蓄積爆破（与えたダメージの一部を蓄積し、最大量で分配ダメージ）は未対応（付けたときはゲージを溜めず、切れるときに溜める。C-0430）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: フルチャージ攻撃 5 回ごとの自分の分配ダメージ▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: フルチャージ攻撃が 5 回命中した時の対象の防御力▼（10 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 自分の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: 蓄積爆破のダメージ蓄積割合▲（10 秒）は未対応: 根拠なし

## 511 シンデレラ

- **skill1**: unsupported
  - notes[0] 未対応: バースト 3 段階突入時の、最終最大HPに比例する自分の攻撃力▲（10 秒）は未対応: 根拠なし
  - notes[1] 未対応: フルチャージ攻撃時の自分のチャージ速度▲（リロード完了で解除）は未対応: 根拠なし
  - notes[2] 未対応: フルチャージ攻撃が命中した時の追加ダメージは未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 前提の外: デコイ（分身）は、被弾を扱わないのでダメージに関係しない（要件 5.2 節）: 根拠なし
  - notes[1] 未対応: デコイがある時の 3 秒ごとの美しさ（最大HP▲・12 スタック）は未対応（最大HP は S1 の攻撃力▲と、バーストの追加ダメージに効く）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: ランダムな敵への 10 回の倍率ダメージと、美しさのスタックに応じた追加ダメージは未対応: 根拠なし

## 811 A2

- **skill1**: partial
  - effects[0] timed・burstUse・chargeDamage: 根拠なし
  - notes[0] 未対応: バーストスキルを使用した時の爆発範囲▲は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: supported
  - effects[0] damage・fullChargeShot・additional: C-0407（仮説）
  - notes[0] 前提の外: パーツダメージ▲はパーツを扱わないので効かない: C-0443（範囲外）
- **burst**: unsupported
  - notes[0] 未対応: B モード（1 秒ごとに現在の HP▼、攻撃力▲・チャージ速度▲。HP 40% 以下で解除）は未対応（HP を持たないので解除の時刻が決まらない）: 根拠なし

## 822 ラム

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstEnd: C-0080（確定）、C-0235（仮説）
  - notes[0] 計算に無関係: 通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない: C-0253（確定）、C-0367（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の最大HP▲と、残りの HP が最も低い味方 2 機の防御力▲は、ダメージに関係しない: C-0253（確定）
- **burst**: noEffect
  - notes[0] 前提の外: 味方全体のバリアは扱わない（要件 5.2 節）: C-0253（確定）

## 830 アスカ

- **skill1**: supported
  - effects[0] timed・healed・attack: C-0464（確定）、C-0087（確定）
  - notes[0] 前提の外: 戦闘開始時のバリアに与えるダメージ▲は、射撃場の敵にバリアが無いのでダメージに関係しない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・coreDamage: C-0075（確定）
  - notes[0] 前提の外: 「自分がバリア適用状態なら」有利コードの攻撃ダメージ▲は、バリアを扱わないので起きない: C-0075（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0076（確定）
  - effects[1] heal・burstUse: C-0464（確定）、C-0082（確定）
  - effects[2] timed・burstUse・hitRate: C-0076（確定）
  - notes[0] 前提の外: 貫通特化は射撃場の敵ではダメージに関係しない: C-0076（確定）
  - notes[1] 補足: 命中率▲は、条件が自動の枠ではバースト中のコア命中率を 1 にする（N ≥ 1。持続の▲も常時の▲と同じ式で効かせる）。AR の弾丸命中率にも同じ式で効かせる（確かめたのは SMG だけ）。バーストゲージにも同じ N で効かせるが、▲の窓（10 秒）はフルバーストの窓に収まり、ゲージの溜まる時間と重ならない（きっかけの遅れは未測定で 0）: C-0037（確定）、C-0192（確定）、C-0011（確定）、C-0264（仮説）、C-0362（確定）、C-0363（仮説）

## 833 ミサト

- **skill1**: partial
  - effects[0] timed・normalShot・hitRate: C-0183（確定）、C-0184（仮説）
  - notes[0] 未対応: 通常攻撃 120 回ごとの味方 1 機の HP 回復は未対応（回復を受けた時の効果を起こさない。単騎ではダメージに関係しない）: C-0180（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 射撃マニュアル状態の間の味方全体のバリアに与えるダメージ▲は、バリアの無い敵（射撃場の的）では効かない: C-0180（確定）
  - notes[1] 計算に無関係: 射撃マニュアルのフルスタック状態の間の自分の与えるHP回復量▲は、ダメージに関係しない: C-0180（確定）
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の持続回復は未対応（回復を受けた時の効果を起こさない。単騎ではダメージに関係しない）: C-0180（確定）

## 836 サクラ

- **skill1**: supported
  - effects[0] timed・normalHit・damageTaken: C-0138（確定）、C-0152（確定）、C-0315（確定）、C-0367（確定）
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
  - notes[0] 前提の外: 戦闘開始時とフルバーストタイム発動時の自分のパーツダメージ▲（急所攻略）は、射撃場の的にパーツが無いので効かない: C-0365（確定）
  - notes[1] 前提の外: 味方がパーツを破壊した時の、自分の持続ダメージ▲（一点集中）は、射撃場の的にパーツが無いので起きない: C-0365（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0185（確定）、C-0233（確定）、C-0234（確定）
  - effects[1] timed・burstUse・sustainedDamage: C-0332（確定）、C-0421（確定）
  - notes[0] 補足: A.N.モードの一点集中の解除は、一点集中（S2。パーツの破壊で付く）が射撃場の的では起きないので何もしない: C-0365（確定）

## 861 たきな

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時とフルバーストタイム終了時の自分の攻撃力▲（5 秒）は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイムの発動時の自分の防御力無視ダメージ▲（15 秒）は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 敵全体の受けるダメージ▲（5 秒）と気絶は未対応（説明文にきっかけが無い。発動してもバーストゲージは溜めない。C-0418）: 根拠なし
  - notes[1] 未対応: 味方全体の防御力無視ダメージ▲（10 秒）は未対応（説明文にきっかけが無い）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 使用武器変更（10 秒。通常攻撃を防御力無視ダメージに変更し、命中した敵に受けるダメージ▲）は未対応: 根拠なし

## 862 クルミ

- **skill1**: supported
  - effects[0] dot・normalHit: C-0129（確定）、C-0130（確定）、C-0131（確定）、C-0133（確定）、C-0136（確定）、C-0196（確定）
  - effects[1] dot・burstUse: C-0136（確定）、C-0146（確定）、C-0147（確定）、C-0196（確定）
- **skill2**: supported
  - effects[0] damage・normalHit・additional: C-0276（確定）、C-0277（確定）
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-0138（確定）、C-0152（確定）、C-0153（仮説）、C-0494（確定）

## 870 クイーン（真）

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0270（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0392（確定）
  - effects[2] passive・elementDamage: C-0296（確定）
  - effects[3] damage・burstUse・distributed: C-0310（確定）
  - effects[4] damage・followUp が適用された時・distributed: C-0429（仮説）
  - notes[0] 補足: ペルソナ - ヨハンナ（戦闘開始時・持続・解除不可）は、定義の states の persona（ペルソナ状態）で持つ: C-0354（確定）
  - notes[1] 計算に無関係: 防御力▲（ペルソナ - ヨハンナ）はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] passive・attackDamage: C-0018（確定）
  - effects[1] timed・burstStage3Enter・distributedDamage: C-0391（確定）
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
  - effects[2] damage・burstUse・distributed: C-0358（確定）、C-0428（確定）
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
