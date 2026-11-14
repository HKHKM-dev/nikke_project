# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: `supported`（効果あり・未対応なし）・`partial`（効果あり・未対応あり）・`unsupported`（効果なし・未対応あり）・`noEffect`（前提の中でダメージに効く効果なし）。宝物を持つキャラで宝物版の定義が無いスロットは、計算と同じく `unsupported`（画面のキャラの選択肢の「（未）」も同じ判定。`data/skills/support.json`）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足・間接（それ自体は与ダメージを変えず、経路（HP・防御力・バリアなど）を読む効果のある編成でだけ効く。括弧は経路。[design-indirect-notes.md](design-indirect-notes.md)）。「読む:」は、その経路を読む効果・notes の印。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 109・効果 766（根拠あり 746）・notes 251（根拠あり 107）

notes の種類: 未対応 39・前提の外 61・計算に無関係 53・補足 33・間接 65

スロット: supported 278・partial 26・unsupported 9・noEffect 41

## 10 ラピ

- **skill1**: noEffect
  - notes[0] 前提の外: 被弾 N 回で自分に攻撃力▲（維持型）は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] damage・20 秒ごと・skill: C-0403（確定）、C-0102（確定）、C-0453（確定）
  - effects[1] burstGaugeHit・20 秒ごと: C-0409（仮説）、C-0403（確定）、C-0453（確定）
  - notes[0] 計算に無関係: 挑発はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0227（確定）
  - effects[1] timed・burstUse・attack: C-0457（確定）、C-0469（確定）、C-0513（仮説）、C-0611（確定）

## 15 アニス：スパークリングサマー

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-1036（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-1036（確定）
- **skill2**: supported
  - effects[0] damage・lastShot・skill: C-1032（確定）
  - notes[0] 前提の外: 最後の弾丸で攻撃した時の自分への阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 補足: ミサイルのヒットがバーストゲージを溜めるかは確かめていない（溜めない形で回す）。3 人の録画のフルバーストの入りどうしの間隔はモデルと違い（V-0712 の結果）、ココアのデバフ解除を入れても 1〜4 回目の入りは変わらないので、違いの原因は分からない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・maxAmmo: C-1037（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-1037（確定）
  - effects[2] timed・burstUse・elementDamage: C-1037（確定）

## 16 ラピ：レッドフード

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0715（確定）
  - effects[1] burstStepChange: C-0729（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-0730（確定）
  - effects[3] timed・fullBurstStart・attackDamage: C-0731（確定）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] shotPause・normalShot: C-0717（確定）、C-0718（確定）
  - effects[1] passive・projectileStickDamage: C-0724（確定）
  - effects[2] passive・projectileExplosionDamage: C-0725（確定）
  - effects[3] damage・normalShot・skill: C-0724（確定）、C-0991（確定）、C-0998（確定）
  - effects[4] damage・normalShot・skill: C-0726（確定）、C-0725（確定）
  - effects[5] counterChange・normalShot・stickyGrenade: C-0726（確定）
  - effects[6] damage・fullBurstStart・skill: C-0726（確定）、C-0725（確定）
  - effects[7] counterChange・fullBurstStart・stickyGrenade（減少）: C-0726（確定）
  - effects[8] passive・elementAdvantage: C-0723（確定）
- **burst**: supported
  - effects[0] damage・burstUse・additional: C-0716（確定）
  - effects[1] timed・burstUse・projectileStickDamage: C-0724（確定）
  - effects[2] cycleEvery・burstUse: C-0727（確定）
  - effects[3] cooldownReduction・burstUse: C-0732（確定）
  - effects[4] timed・burstUse・attack: C-0733（確定）
  - notes[0] 前提の外: 爆発範囲▲（I・III の行とも 10 秒）は、敵 1 体では複数の敵へのヒットを増やすだけで起きない。射撃場の的では、窓の中と外で粘着榴弾の爆発の 1 ヒットの値・コア・数が変わらない: C-0759（確定）

## 17 アニス：スター

- **skill1**: supported
  - effects[0] passive・burstGaugeSpeed: C-0198（確定）、C-0244（確定）
  - effects[1] state・battleStart・myOwnStar（attack）: C-0189（確定）、C-0203（確定）、C-0555（確定）
  - effects[2] cooldownReduction・battleStart: C-0202（確定）、C-0203（確定）、C-0555（確定）
  - effects[3] cooldownReduction・fullBurstEnd: C-0202（確定）、C-0203（確定）、C-0555（確定）
  - effects[4] damage・fullChargeShot・additional: C-0190（確定）、C-0198（確定）、C-0413（確定）、C-0461（確定）、C-0992（確定）、C-1148（確定）、C-1149（確定）、C-1150（仮説）
  - effects[5] burstReentry: C-0201（確定）、C-0203（確定）、C-0555（確定）
  - effects[6] state・battleStart・everyonesStar: C-0201（確定）、C-0203（確定）、C-0555（確定）
  - effects[7] allyGaugeAdd: C-0244（確定）、C-0245（確定）、C-0246（確定）、C-0620（確定）、C-0627（確定）、C-0998（確定）
  - notes[0] 補足: 通常攻撃の本体のバフは発射のフレームで、S1 の追加ダメージのバフは着弾のフレームで決まる（▲の付き始め・切れ目を跨いで飛ぶ発は、本体と追加ダメージで▲が食い違う。plan/design-anis-star-unimplemented.md 3 節）: C-0992（確定）
  - notes[1] 補足: 部隊構成による効果の「みんなの星消去」「私だけの星消去」と、フルバーストタイム終了時の付け直しは書かない。編成で決まる入れ替えで、戦闘中は片方しか付かず、付け直しは持続の状態を延ばすだけなので、値は変わらない（plan/design-skill-stage1.md 2.1 節）: C-0189（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attack: C-0204（確定）、C-0203（確定）、C-0555（確定）
  - effects[1] timed・fullBurstStart・projectileExplosionDamage（読む: 防御力）: C-0205（確定）、C-0587（確定）、C-0588（確定）
  - effects[2] timed・fullBurstStart・attackDamage: C-0204（確定）
  - effects[3] heal・fullChargeShot: C-0576（確定）
- **burst**: supported
  - effects[0] autoAttack・burstUse: C-0211（確定）、C-0213（確定）、C-0207（確定）、C-0504（確定）、C-0297（確定）、C-0466（確定）、C-0521（仮説）、C-0594（確定）
  - effects[1] timed・burstUse・fixedChargeTime: C-0214（確定）、C-0520（仮説）
  - effects[2] timed・burstUse・attackDamage: C-0209（確定）、C-0203（確定）、C-0555（確定）、C-0520（仮説）
  - effects[3] state・burstUse・shootingStar: C-0211（確定）
  - effects[4] timed・burstUse・defense: C-0587（確定）
  - notes[0] 補足: シューティングスターのコアに当たる割合は、敵の的の表の行（coreHitRate.autoAttacks の 17:burst）から引く。行は射撃場の的にだけあり（C-0466）、行の無い敵ではコアに当たらないとして計算し、結果の注記に出す（通常攻撃のコア命中率と同じく、敵を足すときに測る。plan/design-anis-star-unimplemented.md 4 節）: C-0466（確定）
  - notes[1] 補足: コアダメージ▲（味方の効果）は、シューティングスターのコアにも通常攻撃と同じ形で乗る（コアの項 +1 に足す。乗るかはヒットの時点で付いているかで決まる）: C-0594（確定）
  - notes[2] 間接（HP）: みんなの星のときの味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 18 ネオン：ビジョン・アイ

- **skill1**: supported
  - effects[0] damage・fullChargeShot・additional: C-0410（確定）、C-0995（確定）
  - effects[1] damage・fullChargeShot・additional: C-0410（確定）、C-0665（確定）
  - notes[0] 前提の外: 攻撃を受けた時の無敵・デバフ免疫・受けるHP回復量▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attack: C-0665（確定）
  - effects[1] counterChange・battleStart・firepowerGauge: C-0667（確定）
  - effects[2] counterChange・normalShot・firepowerGauge: C-0667（確定）
  - effects[3] counterChange・firepowerCharge が終了した時・firepowerGauge: C-0667（確定）
  - effects[4] state・fullBurstEnd・superFirepowerCharge（burstGaugeSpeed）: C-0666（確定）
  - effects[5] timed・fullBurstStart・attack: C-0665（確定）
- **burst**: partial
  - effects[0] timed・burstUse・attackDamage: C-0665（確定）
  - effects[1] state・burstUse・firepowerCharge: C-0667（確定）
  - effects[2] counterChange・burstUse・firepowerGauge: C-0667（確定）
  - effects[3] state・burstUse・superFirepower（attackDamage）: C-0667（確定）、C-0665（確定）
  - effects[4] counterChange・burstUse・firepowerGauge（減少）: C-0667（確定）
  - notes[0] 未対応: 爆発範囲▲は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし

## 19 マリアン：クイーン

- **skill1**: supported
  - effects[0] state・battleStart・intoTheFraySharpenedResolve: C-0750（確定）
  - effects[1] damage・4 秒ごと・skill: C-0734（確定）、C-0735（確定）、C-0738（確定）、C-0753（確定）
  - effects[2] state・4 秒ごと・openWounds（damageTaken）: C-0736（確定）
  - effects[3] state・burstUse・openWounds: C-0737（確定）
- **skill2**: supported
  - effects[0] state・burstUse・intoTheFrayPenetrantWish: C-0738（確定）
  - effects[1] damage・normalShot・skill: C-0739（確定）
  - effects[2] timed・fullBurstStart・sequentialAttackDamage: C-0752（確定）
  - effects[3] timed・fullBurstStart・coreDamage: C-0741（確定）
- **burst**: supported
  - effects[0] ammoRefill・burstUse: C-0743（確定）
  - effects[1] timed・burstUse・spinUpSpeed: C-0743（確定）
  - effects[2] timed・burstUse・attack: C-0741（確定）
  - effects[3] timed・burstUse・attackDamage: C-0741（確定）
  - effects[4] burstDamage・skill: C-0742（確定）

## 20 デルタ

- **skill1**: noEffect
  - notes[0] 間接（HP）: フルチャージ攻撃時の自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-0081（確定）
- **skill2**: supported
  - effects[0] timed・burstUse・defense: C-0081（確定）、C-0589（確定）
- **burst**: noEffect
  - notes[0] 間接（デコイ）: デコイ（分身）は、それ自体は与ダメージを変えない（デコイを読む効果のある編成でだけ効く）: C-0081（確定）
  - notes[1] 計算に無関係: 挑発はダメージに関係しない: C-0081（確定）

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

## 40 D

- **skill1**: supported
  - effects[0] timed・fullBurstStart・elementDamage: C-0928（確定）、C-0960（確定）
  - notes[0] 計算に無関係: フルバーストタイムが発動した時（初回は追加で）の、攻撃ダメージの回復（吸収回復）は、回復で、回復を受けた時を読む味方がいなければダメージに効かない: 根拠なし
- **skill2**: supported
  - effects[0] burstGauge・battleStart: C-0918（確定）
  - effects[1] state・battleStart・stunImmunity: C-0886（確定）
  - effects[2] timed・battleStart・elementDamage: C-0928（確定）、C-0963（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0887（確定）
  - effects[1] fullBurstExtend・burstUse: C-0886（確定）
  - notes[0] 前提の外: 火力型の味方全体へのパーツダメージ▲は、パーツを扱わないので効かない（要件の前提の外）: C-0443（範囲外）

## 43 D：キラーワイフ

- **skill1**: supported
  - effects[0] timed・fullChargeShot・pierce: C-1080（確定）、C-1085（仮説）
  - effects[1] timed・fullBurstStart・pierceDamage（読む: 貫通）: C-1080（確定）
- **skill2**: supported
  - effects[0] cooldownReduction・fullChargeShot: C-1082（確定）
  - effects[1] timed・fullChargeShot・attackDamage: C-1081（確定）
- **burst**: supported
  - effects[0] damage・burstUse・additional: C-1083（確定）
  - effects[1] timed・burstUse・attack: C-1084（確定）
  - notes[0] 補足: ターゲット殲滅（照準線に最も近い敵 1 機に 10 秒）は、命中させた味方への攻撃力▲（effects[1]）の holderHit が表す（敵に付く状態の付与は書かない。ほかに読む効果が無い）: 根拠なし
  - notes[1] 前提の外: パーツに命中させた味方のコアダメージ▲は、パーツを扱わないので起きない（要件 4.2 節）。射撃場の的のミサイルがパーツに当たるかは確かめていない: 根拠なし

## 60 ベロータ

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージ攻撃時の自分の爆発範囲▲（5 秒）は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 4 機以上に同時に命中した時の防御力▼と追加ダメージは、敵 1 体では起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0676（確定）、C-0677（確定）
  - effects[1] timed・burstUse・chargeSpeed: C-0678（確定）

## 71 ソリン

- **skill1**: supported
  - effects[0] timed・normalShot・attackSpeed: C-1110（確定）
- **skill2**: supported
  - effects[0] passive・critRate（読む: HP）: C-1111（確定）、C-1112（確定）
  - effects[1] passive・critDamage（読む: HP）: C-1111（確定）、C-1112（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1113（確定）
  - effects[1] damage・burstUse・additional（読む: HP）: C-1114（確定）、C-1115（仮説）

## 73 ブリッド：サイレントトラック

- **skill1**: supported
  - effects[0] timed・fullBurstStart・damageTaken: C-1041（確定）
  - effects[1] damage・fullBurstStart・skill: C-1041（確定）
- **skill2**: supported
  - effects[0] timed・normalShot・damageTaken: C-1039（確定）
  - effects[1] damage・normalShot・skill: C-1039（確定）、C-1040（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1042（確定）

## 75 ディーゼル：ウィンタースイーツ

- **skill1**: supported
  - effects[0] state・fullBurstStart・intro（critDamage）: C-1016（確定）
  - effects[1] state・fullBurstStart・highlight（critDamage）: C-1016（確定）
  - effects[2] timed・fullBurstStart・sustainedDamage: C-1016（確定）
  - effects[3] timed・fullBurstStart・sustainedDamage: C-1016（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・sustainedDamage: C-1017（確定）
  - effects[1] dot・fullBurstStart: C-1017（確定）
  - notes[0] 前提の外: 味方の誰かがパーツを破壊した時の、自分を除く味方全体への消音（騒音公害免疫・3 スタック・持続）は、射撃場の的にパーツが無いので起きない: C-0443（範囲外）
  - notes[1] 前提の外: 味方の誰かがパーツを破壊した時の、自分の持続ダメージ▲（15 秒）は、射撃場の的にパーツが無いので起きない: C-0443（範囲外）
- **burst**: partial
  - effects[0] timed・burstUse・damageTaken: C-1018（確定）
  - effects[1] dot・burstUse: C-1018（確定）
  - effects[2] dot・burstUse: C-1018（確定）
  - notes[0] 未対応: 自分がクライマックス状態なら、自分を除く味方全体に「騒音公害：命中率 100%▼」（1 秒）は未対応。命中率▼の効き方は MG のほろ酔い（−20% × 1〜3 スタック）しか測っておらず、ほかの武器種と −100% の効き方が無い（plan/design-diesel-ws.md 2.4 節）。消音（免疫）はパーツの破壊でしか付かないので、射撃場では常に効く: 根拠なし
  - notes[1] 前提の外: 自分がクライマックス状態なら、味方全体の消音スタック量 1 個▼は、消音がパーツの破壊でしか付かず射撃場では無いので、何もしない: C-0443（範囲外）

## 82 リター

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[3] timed・burstUse・maxAmmo: C-0468（確定）
  - effects[4] timed・burstUse・critDamage: C-0468（確定）、C-0493（確定）
  - effects[5] timed・burstUse・attack: C-0468（確定）、C-0493（確定）
- **skill2**: partial
  - effects[0] coverHeal・15 秒ごと: C-0821（確定）
  - notes[0] 未対応: 3 体以上の編成で、遮蔽物 HP が最も低い味方 2 機をどう選ぶか（遮蔽物 HP が並んだ時・敵の攻撃で減った時）は未対応（モデルでは誰にも遮蔽物 HP 回復を起こさない。plan/design-skill-stage17.md 論点 3）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0468（確定）、C-0493（確定）

## 90 エマ

- **skill1**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の味方全体の HP 回復は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（HP）: 自分の HP が 90% 以上の時の、味方全体の受けるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-0686（確定）、C-0687（仮説）

## 93 エマ：タクティカル・アップ

- **skill1**: supported
  - effects[0] timed・30 秒ごと・damageTaken: C-0305（確定）
  - effects[1] timed・10 秒ごと・damageTaken: C-0305（確定）、C-0306（確定）
  - effects[2] heal・30 秒ごと: C-0578（確定）
  - effects[3] heal・10 秒ごと: C-0578（確定）
  - notes[0] 計算に無関係: 陽動はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] passive・critDamage: C-0266（確定）、C-0235（仮説）
  - effects[1] passive・projectileExplosionDamage: C-0373（確定）、C-0205（確定）
  - effects[2] passive・trueDamage: C-0375（確定）、C-0306（確定）
  - effects[3] passive・projectileExplosionDamage: C-0374（確定）、C-0306（確定）
  - notes[0] 計算に無関係: フォーメーションAS 適用中の陽動発動不可はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・battlefieldFormation（attack）: C-0337（確定）、C-0497（確定）
  - effects[1] timed・burstUse・damageTaken: C-0335（確定）、C-0336（仮説）、C-0819（仮説）、C-0619（仮説）
  - notes[0] 間接（HP）: 味方全体の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 94 ベスティー：タクティカル・アップ

- **skill1**: supported
  - effects[0] state・fullChargeShot・missileGuide（chargeSpeed）: C-0804（確定）、C-0818（確定）
  - effects[1] removeState・最大弾数のリロードが完了した時・missileGuide: C-0818（確定）
  - effects[2] timed・fullChargeShot・chargeDamage: C-0804（確定）、C-0818（確定）
- **skill2**: supported
  - effects[0] damage・fullChargeShot・true: C-0805（確定）、C-0806（確定）
  - effects[1] timed・fullChargeShot・attack: C-0809（確定）
  - effects[2] timed・fullChargeShot・projectileExplosionDamage: C-0809（確定）
- **burst**: partial
  - effects[0] timed・burstUse・trueDamage: C-0808（確定）
  - effects[1] burstDamage・true: C-0807（確定）
  - notes[0] 未対応: 爆発範囲▲は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし

## 95 ウンファ：タクティカル・アップ

- **skill1**: supported
  - effects[0] state・burstUse・camouflage（trueDamageConversion・trueDamage）: C-0311（確定）
  - effects[1] state・fullChargeShot・camouflage: C-0314（確定）、C-0311（確定）
  - notes[0] 前提の外: カモフラージュの単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提。カモフラージュは 5 秒続く）: 根拠なし
- **skill2**: supported
  - effects[0] passive・critRate: C-0317（確定）、C-0268（確定）、C-0235（仮説）
  - effects[1] passive・chargeDamage: C-0020（確定）
  - effects[2] passive・attack: C-0020（確定）
  - effects[3] passive・projectileExplosionDamage: C-0374（確定）
  - effects[4] passive・trueDamage: C-0375（確定）
- **burst**: supported
  - effects[0] state・weaponChangeShot・explosiveRound（damageTaken）: C-0312（確定）、C-0138（確定）、C-0816（確定）
  - effects[1] weaponChange・burstUse: C-0313（確定）、C-0376（確定）、C-0509（確定）
  - notes[0] 補足: II の直後に III が来たとき、炸裂弾は III のタイマーの 00.00（フルバーストの窓の始まり）より前に着き、フルバースト補正が乗らない（0233-10）。モデルもフルバーストの窓を III の発動の 6f 後の 00.00 から始める（II の替わり目の 29f 後。C-0516）ので、炸裂弾（替わり目の 22〜28f 後）に補正は乗らない: C-0509（確定）、C-0516（確定）

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
  - effects[3] timed・fullBurstStart・hitRate: C-0640（確定）、C-0641（仮説）、C-0486（仮説）
- **宝物版 skill2**: supported
  - effects[0] damage・normalShot・skill: C-0458（確定）、C-0660（確定）
  - effects[1] damage・normalShot・skill: C-0458（確定）、C-0660（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-0228（確定）
  - effects[1] timed・burstUse・attackDamage: C-0420（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0420（確定）

## 103 ラプラス：アルティメットヒーロー

- **skill1**: partial
  - effects[0] timed・battleStart・attack（読む: HP）: C-0579（確定）
  - effects[1] state・fullChargeShot・warmUp（chargeSpeed）: C-0698（確定）
  - effects[2] weaponChange・warmUp のフルスタック: C-0699（確定）、C-0836（確定）、C-1097（確定）
  - effects[3] ammoDecrease・使用武器の変更が終了した時: C-0700（確定）
  - notes[0] 未対応: 変更後の武器が 6 区間目（5 回目の着地の後の遠）でコアを外す発（V-0528）は未対応（的の表の行はどの区間もコア命中率 1）: C-0701（仮説）
- **skill2**: supported
  - effects[0] timed・burstStage3Enter・attackDamage: C-0681（確定）
  - effects[1] counterChange・weaponChangeShot・overEnergy: C-0702（確定）
  - effects[2] counterChange・overEnergy が最大になった時・overEnergy（減少）: C-0702（確定）
  - effects[3] counterChange・overEnergy が最大になった時・overEnergyStage: C-0702（確定）
  - effects[4] passive・overEnergyStage 1 以上の間・maxHpOnly: C-0577（確定）、C-0702（確定）
  - effects[5] passive・overEnergyStage 2 以上の間・maxHpOnly: C-0577（確定）、C-0702（確定）
  - effects[6] passive・overEnergyStage 3 以上の間・maxHpOnly: C-0577（確定）、C-0702（確定）
  - effects[7] passive・overEnergyStage 4 以上の間・maxHpOnly: C-0577（確定）、C-0702（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0682（確定）
  - effects[1] burstDamage・skill: C-0682（確定）、C-0683（確定）
  - effects[2] damage・burstUse・additional: C-0707（確定）

## 105 マクスウェル：オーディナリーメカニック

- **skill1**: supported
  - effects[0] timed・fullChargeShot・maxHp: C-1158（確定）
  - effects[1] timed・burstStage3Enter・attackDamage: C-1158（確定）
- **skill2**: supported
  - effects[0] timed・burstUse・attack（読む: HP）: C-1158（確定）
  - effects[1] state・burstUse・overcurrent（attack）: C-1158（確定）
  - effects[2] burstGauge・fullChargeShot: C-1159（確定）
  - notes[0] 補足: 説明文に出てこない数値（description_value_03。ゲージのチャージと同じ値）は使っていない: 根拠なし
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1157（確定）
  - effects[1] weaponChange・burstUse: C-1157（確定）
  - effects[2] weaponChange・burstUse: C-1157（確定）
  - effects[3] weaponChange・burstUse: C-1157（確定）
  - effects[4] weaponChange・burstUse: C-1157（確定）
  - effects[5] timed・burstUse・attackDamage: C-1158（確定）

## 121 エヌ : ミラクルフェアリー

- **skill1**: supported
  - effects[0] heal・normalShot: C-0598（仮説）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の敵全体の受けるHP回復量▼はダメージに関係しない（バーストゲージも溜めない。C-0431）: 根拠なし
  - notes[1] 間接（HP）: 自分の HP が 90% 以上の時の味方全体の受けるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-0618（確定）、C-0845（確定）、C-0846（仮説）
  - effects[1] timed・burstUse・attack: C-0595（確定）、C-0596（確定）
  - notes[0] 前提の外: 戦闘不能の火力型の味方の復活は、味方が倒れないので起きない（要件 5.2 節）: C-0443（範囲外）

## 140 シュガー

- **skill1**: noEffect
  - notes[0] 前提の外: 遮蔽物が攻撃を受けた時（確率）の自分のクリティカルダメージ▲は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
  - notes[1] 前提の外: 遮蔽物が攻撃を受けた時（確率）の自分のリロード速度▲は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・critRate: C-1007（仮説）、C-1008（確定）
  - effects[1] timed・fullBurstStart・maxAmmo: C-1004（確定）、C-1008（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackSpeed: C-1005（確定）、C-1008（確定）
  - effects[1] timed・burstUse・hitRate: C-1007（仮説）、C-1008（確定）
- **宝物版 skill1**: supported
  - effects[0] passive・attackDamage（読む: 遮蔽物）: C-1002（確定）
  - effects[1] passive・elementAdvantage: C-1002（確定）
  - notes[0] 前提の外: 遮蔽物が攻撃を受けた時の自分のクリティカルダメージ▲は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
  - notes[1] 前提の外: 遮蔽物が攻撃を受けた時の自分のリロード速度▲は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
  - notes[2] 前提の外: 遮蔽物が攻撃を受けた時の自分の遮蔽物 HP 回復は、被弾を扱わないので起きない（要件 4.2 節）。起きても遮蔽物が壊れない前提では与ダメージを変えない: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・critRate: C-1007（仮説）
  - effects[1] timed・fullBurstStart・attack: C-1003（確定）
  - effects[2] timed・fullBurstStart・maxAmmo: C-1004（確定）
  - effects[3] timed・fullBurstStart・elementDamage: C-1006（仮説）
  - effects[4] timed・fullBurstStart・elementDamage: C-1003（確定）
- **宝物版 burst**: supported
  - effects[0] timed・burstUse・attackSpeed: C-1005（確定）
  - effects[1] timed・burstUse・hitRate: C-1007（仮説）
  - effects[2] timed・burstUse・attack: C-1003（確定）
  - effects[3] timed・burstUse・elementDamage: C-1006（仮説）
  - effects[4] timed・burstUse・elementDamage: C-1003（確定）

## 141 ミルク

- **skill1**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い味方 2 機への攻撃力▲（10 秒）は未対応（きっかけの書かれていない CT ごとのアクティブで、周期を録画で読んでいない。宝物版を持つキャラはスペック固定でも宝物版が出るので、基礎版を撮れない。plan/design-skill-stage15.md 論点 3）: 根拠なし
- **skill2**: supported
  - effects[0] passive・critDamage（読む: HP）: C-0770（確定）、C-1106（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0771（確定）
  - effects[1] heal・burstUse: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・20 秒ごと・attack: C-0769（確定）
  - effects[1] timed・battleStart・burstCooldown: C-0769（確定）
- **宝物版 skill2**: supported
  - effects[0] passive・critDamage（読む: HP）: C-0770（確定）、C-1106（確定）
  - effects[1] cooldownReduction・fullChargeShot: C-0770（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-0771（確定）
  - effects[1] heal・burstUse: 根拠なし
  - notes[0] 間接（HP）: 味方全体の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 160 ユニ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-0013（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・maxAmmo: C-0390（確定）
  - effects[1] heal・fullChargeShot: C-0082（確定）
  - notes[0] 間接（防御力）: 味方全体の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0230（確定）
  - notes[0] 計算に無関係: 移動不可（5 秒間維持）はダメージに関係しない: 根拠なし

## 161 ミハラ

- **skill1**: supported
  - effects[0] timed・lastShot・critDamage: C-0917（確定）
- **skill2**: supported
  - effects[0] state・burstUse・highwayToHell1（attack）: C-0563（確定）
  - effects[1] state・burstUse・highwayToHell2（critRate）: C-0566（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0563（確定）、C-0564（確定）、C-0575（確定）
  - effects[1] damage・burstUse・additional: C-0566（確定）、C-0565（確定）、C-0714（確定）
  - notes[0] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）
  - notes[1] 補足: バーストスキルダメージの 3 ヒットは会心がそろう（1 回の発動で 3 ヒットとも会心か、3 ヒットとも会心なし）。モデルは期待値なので、値には効かない: C-0564（確定）

## 162 ミハラ：ボンディングチェーン

- **skill1**: supported
  - effects[0] counterChange・battleStart・restraintChains: C-0411（確定）
  - effects[1] counterChange・fullBurstEnd・restraintChains: C-0747（確定）
  - effects[2] damage・restraintChains が最大になった時・skill: C-0411（確定）、C-0745（確定）、C-0747（確定）
  - effects[3] counterChange・restraintChains が最大になった時・restraintChains（減少）: C-0411（確定）
  - effects[4] dot・restraintChains が最大になった時: C-0411（確定）、C-0745（確定）、C-0747（確定）
- **skill2**: supported
  - effects[0] timed・burstStage3Enter・sustainedDamage: C-0748（確定）、C-0755（確定）
  - effects[1] stackChange・normalHit・ensnaringChains: C-0754（確定）、C-0751（確定）
  - notes[0] 前提の外: 自分が戦闘不能になった時のスタック量▲と、敵が破壊された時のキャプチャーチェーン▲は、前提（味方が倒れない・敵 1 体）の外（要件 5.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] dot・burstUse: C-0746（確定）
  - effects[1] cancelState・burstUse: C-0746（確定）

## 170 プリバティ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0924（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-0924（確定）
  - effects[2] timed・fullBurstStart・maxAmmo: C-0924（確定）
- **skill2**: partial
  - effects[0] damage・lastShot・additional: C-0921（確定）
  - notes[0] 未対応: 対象が気絶状態の時の追加ダメージは未対応（ボス・射撃場の的にバーストの気絶が付くかを確かめていない。基礎版は撮れない）: 根拠なし
- **burst**: partial
  - effects[0] burstDamage・skill: C-0923（確定）
  - notes[0] 計算に無関係: 敵全体の気絶はそれ自体ダメージに関係しない（S2 の気絶の条件は未対応）: 根拠なし
  - notes[1] 未対応: バーストの発動の後に撃たない間（宝物版は 97f）は、基礎版では未測定で入れていない（基礎版は撮れない）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0924（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-0924（確定）
  - effects[2] timed・fullBurstStart・maxAmmo: C-0924（確定）
  - effects[3] timed・fullBurstStart・attackDamage: C-0924（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・lastShot・damageTaken: C-0921（確定）
  - effects[1] damage・lastShot・additional: C-0921（確定）
  - effects[2] damage・lastShot・additional: C-0921（確定）
- **宝物版 burst**: supported
  - effects[0] timed・burstUse・elementDamage: C-0923（確定）、C-0921（確定）
  - effects[1] burstDamage・skill: C-0923（確定）
  - effects[2] state・burstUse・designatedTarget: C-0922（確定）
  - effects[3] shotPause・burstUse: C-0925（確定）
  - notes[0] 計算に無関係: 敵全体の気絶と、ターゲット指定の攻撃力▼はダメージに関係しない: 根拠なし

## 172 アドミ

- **skill1**: noEffect
  - notes[0] 前提の外: 「20 回攻撃を受けた時」のチャージダメージ倍率▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最終攻撃力が最も高い味方 2 機の受けるダメージ▼は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: C-0456（確定）、C-0479（確定）
  - effects[1] timed・burstUse・critDamage: C-0463（確定）、C-0479（確定）

## 190 ルドミラ

- **skill1**: supported
  - effects[0] timed・lastShot・enemyDefenseDown: C-0556（確定）
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の対象の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルバーストタイムの発動時の敵全体への挑発と、自分の受けるダメージ▼はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0674（確定）、C-0675（確定）
  - notes[0] 間接（防御力）: 自分の HP が 50% 以上の時の味方全体の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし

## 191 アリス

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-0474（確定）
  - effects[1] timed・fullBurstStart・chargeDamage: C-0474（確定）
- **skill2**: supported
  - effects[0] passive・pierce: C-1098（確定）
  - notes[0] 前提の外: HP 80% 未満のときの回復は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・chargeSpeed: C-0475（確定）
  - effects[1] timed・burstUse・attack: C-0475（確定）、C-0523（確定）

## 192 トーブ

- **skill1**: partial
  - effects[0] state・normalShot・temporaryModification: C-0559（確定）、C-0561（確定）、C-0986（確定）、C-0987（仮説）
  - effects[1] timed・normalShot・critDamage: C-0560（確定）、C-0986（確定）、C-0987（仮説）
  - notes[0] 未対応: 攻撃した時の確率で自分に付く代用弾丸の弾丸チャージは未対応（確率の即時効果は射撃の列を変えるので期待値で持てない。plan/design-tove-base.md 論点 4）: 根拠なし
  - notes[1] 未対応: 応急改造の最大装弾数▲（1 スタック {03} 発）は未対応（確率で付く状態の中身に、射撃の列を変える stat は書けない。plan/design-tove-base.md 論点 4）: 根拠なし
- **skill2**: partial
  - effects[0] passive・temporaryModification のフルスタックの間・critRate: C-0599（確定）、C-0601（確定）、C-0602（確定）、C-0986（確定）、C-0987（仮説）
  - notes[0] 未対応: 自分が応急改造のフルスタック状態の時のみの、ショットガンを所持する味方全体の攻撃速度▲（持続）は未対応（応急改造が確率で付くので、射撃の列を変える stat は期待値で持てない。plan/design-tove-base.md 論点 4）: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・miracleOfMakeshifts（attack）: C-0668（確定）、C-0669（確定）、C-0670（確定）、C-0986（確定）、C-0987（仮説）
  - effects[1] state・burstUse・miracleOfMakeshiftsShotgun（attack）: C-0669（確定）、C-0670（確定）、C-0986（確定）、C-0987（仮説）
- **宝物版 skill1**: supported
  - effects[0] ammoRefill・normalShot: C-0558（確定）
  - effects[1] state・normalShot・emergencyCraftedBullets: C-0558（確定）
  - effects[2] state・emergencyCraftedBullets が適用された時・temporaryModification（maxAmmo）: C-0559（確定）
  - effects[3] timed・emergencyCraftedBullets が適用された時・critDamage: C-0560（確定）
- **宝物版 skill2**: supported
  - effects[0] passive・temporaryModification のフルスタックの間・critRate: C-0599（確定）、C-0601（確定）、C-0602（確定）
  - effects[1] passive・temporaryModification のフルスタックの間・attackSpeed: C-0600（確定）、C-0601（確定）、C-0602（確定）
- **宝物版 burst**: supported
  - effects[0] state・burstUse・miracleOfMakeshifts（attack）: C-0668（確定）、C-0669（確定）、C-0670（確定）
  - effects[1] state・burstUse・miracleOfMakeshiftsShotgun（attack）: C-0669（確定）、C-0670（確定）

## 194 ルドミラ：ウィンターオーナー

- **skill1**: supported
  - effects[0] timed・normalHit・damageTaken: C-0138（確定）、C-0257（仮説）、C-0251（確定）、C-0645（確定）
  - effects[1] damage・normalHit・additional: C-0163（確定）、C-0257（仮説）、C-0251（確定）、C-1144（確定）
  - effects[2] ammoRefill・normalHit: C-0257（仮説）、C-0251（確定）、C-0256（確定）
- **skill2**: supported
  - effects[0] damage・coreHit・additional: C-0249（仮説）、C-0251（確定）、C-1144（確定）
  - effects[1] timed・fullBurstStart・critRate: C-0249（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0250（仮説）、C-0252（確定）、C-0510（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-0250（仮説）、C-0252（確定）

## 195 アリス：ワンダーランドバニー

- **skill1**: partial
  - effects[0] heal・normalShot: C-1166（確定）
  - effects[1] state・normalShot・carrotParty: C-1166（確定）
  - notes[0] 前提の外: ニンジンパーティーの阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: 通常攻撃 90 回ごとの、水冷コードの味方全体（自分を含む）のスタック可能バフ効果のスタック量▲は未対応（stackChange は同じ定義で自分に付けた状態にしか書けず、ほかの味方のどのバフのスタックを足すかを読む語彙が無い。自分のニンジンパーティーの分はダメージに効かない）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstEnd・burstGaugeSpeed: C-1168（仮説）
  - effects[1] timed・fullBurstStart・maxAmmo: C-1167（確定）
  - effects[2] ammoRefill・fullBurstStart: C-1167（確定）
- **burst**: supported
  - effects[0] burstReentry: C-1169（確定）
  - effects[1] heal・burstUse: C-1170（仮説）
  - notes[0] 間接（HP）: 自分がニンジンパーティーのフルスタック状態の時の、味方全体の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 222 紅蓮

- **skill1**: supported
  - effects[0] timed・normalHit・attack: C-1048（確定）
  - effects[1] currentHpDown・normalHit: C-1044（確定）
- **skill2**: supported
  - effects[0] timed・自分の HP が閾値以下に下がった時・critDamage: C-1045（確定）、C-1044（確定）
  - notes[0] 前提の外: 攻撃を受けた時、30% の確率の追加ダメージは、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: C-1049（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critRate: C-1046（確定）、C-1044（確定）
  - effects[1] burstDamage・skill: C-1047（確定）

## 223 ナユタ

- **skill1**: partial
  - effects[0] timed・memoryAbsorption が適用された時・coreDamage: C-0940（確定）
  - effects[1] timed・memoryAbsorption が適用された時・attack: C-0940（確定）
  - effects[2] damage・fullChargeShot・skill: C-0937（確定）
  - effects[3] damage・fullChargeShot・additional: C-0937（確定）
  - notes[0] 計算に無関係: 戦闘開始時の不動心（不屈。戦闘中 1 回）はダメージに関係しない: 根拠なし
  - notes[1] 前提の外: 記憶吸収が適用される時の味方全体への HP 回復均等分配は、被弾で HP が減った時に効く（被弾なしの前提の外）: 根拠なし
  - notes[2] 未対応: 記憶吸収が適用される時の自分の HP 回復（最終最大HP の 25%）は撮っていない。回復で、回復を受けた時を読む味方がいなければダメージに効かない（plan/design-nayuta.md の論点 3）: 根拠なし
- **skill2**: supported
  - effects[0] state・3 秒ごと・memoryAbsorption（hitRate）: C-0935（確定）、C-0939（仮説）
  - effects[1] passive・memoryAbsorption の説明文の値（5）スタック以上の間・attack: C-0935（確定）
  - effects[2] passive・memoryAbsorption の説明文の値（7）スタック以上の間・attackDamage: C-0935（確定）
  - effects[3] passive・memoryAbsorption の説明文の値（3）スタック以上の間・coreDamage: C-0935（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0938（確定）
  - effects[1] burstDamage・skill: C-0938（確定）
  - effects[2] weaponChange・burstUse: C-0936（確定）、C-0939（仮説）
  - effects[3] timed・burstUse・infiniteAmmo: C-0936（確定）
  - effects[4] state・burstUse・memoryIncineration: C-0936（確定）、C-0939（仮説）

## 225 紅蓮：ブラックシャドウ

- **skill1**: supported
  - effects[0] cycle・fullChargeShot: C-0047（確定）、C-0085（確定）、C-0651（確定）、C-0661（確定）、C-0764（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: C-0490（確定）
  - effects[1] ammoRefill・fullBurstStart: C-0490（確定）
- **burst**: supported
  - effects[0] cycleEvery・burstUse: C-0492（確定）
  - effects[1] timed・burstUse・attack: C-0491（確定）、C-0524（仮説）
  - effects[2] timed・burstUse・chargeDamage: C-0491（確定）

## 226 ラプンツェル：ピュアグレイス

- **skill1**: noEffect
  - notes[0] 間接（バリア）: 戦闘開始時とバースト使用時の共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
  - notes[1] 前提の外: フルチャージ状態を 1 秒以上維持した時、自分がバリア適用状態なら味方全体の攻撃ダメージ▲（持続）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時の自分の HP 回復は、ダメージに関係しない（自分にだけ付き、ラプンツェル：ピュアグレイスに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
  - notes[1] 前提の外: フルチャージ状態を 1 秒以上維持した時、自分がバリア適用状態なら自分に付く現在のHP▼（1 秒間隔・持続）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）
  - notes[2] 計算に無関係: バリア適用状態の時のバリアHP回復はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0685（確定）
  - notes[0] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 231 イサベル

- **skill1**: supported
  - effects[0] timed・burstUse・critRate: C-0160（確定）、C-0872（確定）
  - effects[1] timed・burstUse・critDamage: C-0160（確定）、C-0872（確定）
  - effects[2] timed・burstUse・attack: C-0160（確定）、C-0872（確定）
- **skill2**: supported
  - effects[0] damage・15 秒ごと・skill: C-0402（確定）、C-0102（確定）、C-0453（確定）、C-0864（確定）
  - effects[1] burstGaugeHit・15 秒ごと: C-0404（仮説）、C-0402（確定）、C-0453（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0160（確定）、C-0165（確定）
  - effects[1] timed・burstUse・damageTaken: C-0160（確定）、C-0161（確定）、C-0162（確定）、C-0165（確定）、C-0153（確定）、C-0872（確定）
  - effects[2] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）、C-0838（確定）、C-0872（確定）
  - effects[3] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）、C-0838（確定）、C-0872（確定）
  - notes[0] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

## 232 ノア

- **skill1**: noEffect
  - notes[0] 計算に無関係: 攻撃を受けた時（確率）の味方全体の受けるダメージ▼は防御系でダメージに関係しない（被弾を扱わないので起きもしない。射撃場の 3 分モードでは敵の攻撃で起きうる）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃が命中した時の、対象への挑発（2 秒）はダメージに関係しない（付けてもゲージを溜めない）: C-1020（確定）
  - notes[1] 計算に無関係: フルチャージ攻撃が命中した時の、対象の攻撃力▼は敵の攻撃力でダメージに関係しない: 根拠なし
- **burst**: noEffect
  - notes[0] 計算に無関係: 自分へのヘイト（敵全体を挑発。10 秒）と、味方全体の無敵（3 秒）はダメージに関係しない。付けるのはチェーンの間で、その間とフルバーストの間はゲージが溜まらないので、ゲージにも出ない: C-0264（仮説）、C-0316（確定）
  - notes[1] 間接（防御力）: 味方全体の防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし

## 233 ドロシー

- **skill1**: supported
  - effects[0] cooldownReduction・lastShot: C-0919（確定）
  - notes[0] 前提の外: 最後の弾丸で攻撃した時、自分が発現状態なら味方全体のパーツダメージ▲は、射撃場の的にパーツが無いので効かない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] damage・20 秒ごと・distributed: C-0847（確定）、C-0848（確定）
- **burst**: partial
  - effects[0] damage・burstUse・distributed: C-0901（確定）、C-0902（仮説）、C-0906（確定）
  - effects[1] timed・burstUse・pierce: C-1090（確定）
  - notes[0] 補足: 発現（スキル 2 のクールタイム 18 秒▼・10 秒）は、スキル 2 の焦土化の周期の短縮（skill2.effects[0] の periodShorten）に書いた: 根拠なし
  - notes[1] 補足: 烙印の最大蓄積量に届く回は録画に無く、最大量の攻撃力と分配ダメージ▲を発動の時に読む形は、トロニーの蓄積爆破（C-0904）と同じとみた: 根拠なし
  - notes[2] 未対応: 烙印の爆発のヒットのバーストゲージは未実装（溜めない。爆発の前後は画面の光でゲージのバーが読めず、溜めても 1 ヒットぶん（0.4%）で前後の発と見分けられない）: 根拠なし

## 234 ドロシー：セレンディピティ

- **skill1**: supported
  - effects[0] timed・pelletHit・pierce: C-1075（仮説）、C-1074（確定）
  - effects[1] timed・pelletHit・hitRate: C-1075（仮説）、C-1074（確定）
  - effects[2] timed・pelletHit・attackDamage: C-1074（確定）
  - effects[3] timed・pelletHit・singlePellet: C-1074（確定）、C-1075（仮説）、C-1077（確定）
  - notes[0] 前提の外: ペレットが 160 回命中した時の貫通範囲の拡大は、敵 1 体ではダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] passive・pierceDamage（読む: 貫通）: C-1074（確定）
  - effects[1] timed・fullBurstStart・attack: C-1078（確定）
  - effects[2] timed・fullBurstStart・hitRate: C-1079（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attackSpeed: C-1078（確定）
  - effects[1] timed・burstUse・attack: C-1078（確定）
  - effects[2] timed・burstUse・pelletCount: C-1076（確定）、C-1077（確定）

## 240 ルマニ

- **skill1**: noEffect
  - notes[0] 間接（HP）: フルチャージして攻撃した時の、自分へのマッスルアップ（最大HP▲・5 スタック・2 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）。フルスタックかを読むのは、バーストの受けるダメージ▼の条件だけ: 根拠なし
  - notes[1] 計算に無関係: フルバーストタイムの持続中にフルチャージ攻撃が命中した時の、対象への挑発（5 秒）はダメージに関係しない。付けるのはフルバーストの間だけで、その間はゲージが溜まらないので、ゲージにも出ない: C-0264（仮説）
- **skill2**: noEffect
  - notes[0] 前提の外: 対象のパーツに 5 回命中した時の、味方全体のパーツダメージ▲（5 秒）は、射撃場の的にパーツが無いので効かない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・normalAttackDamage: C-1176（確定）、C-1177（確定）、C-1178（仮説）
  - notes[0] 間接（HP）: 自分の最大HP▲（10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 自分がマッスルアップのフルスタック状態の時の、自分の受けるダメージ▼（10 秒）は防御系でダメージに関係しない: 根拠なし

## 242 フォルクヴァン

- **skill1**: noEffect
  - notes[0] 間接（バリア）: 最終攻撃力が最も高い味方 2 機へのバリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
  - notes[1] 間接（HP）: 最終攻撃力が最も高い味方 2 機への受けるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: unsupported
  - notes[0] 計算に無関係: 最終攻撃力が最も高い敵 1 機への挑発はダメージに関係しない: 根拠なし
  - notes[1] 未対応: S2 の発動のたびに、射手の target_burst_energy_pershot（4,000）のゲージを溜めるのは未対応（説明文にきっかけが無い。C-0422）: C-0422（確定）
  - notes[2] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-0695（確定）、C-0763（仮説）
  - notes[0] 間接（バリア）: 最終攻撃力が最も高い味方 2 機へのバリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）

## 260 モダニア

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-0105（確定）、C-0119（確定）
  - effects[1] timed・normalHit・critDamage: C-0272（確定）
  - effects[2] timed・normalHit・maxAmmo: C-0272（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・hitRate: C-0640（確定）、C-0486（仮説）
  - effects[1] timed・normalHit・attack: C-0124（確定）、C-0118（確定）
- **burst**: partial
  - effects[0] timed・burstUse・infiniteAmmo: C-0455（確定）、C-0452（確定）
  - effects[1] weaponChange・burstUse: C-0273（確定）、C-0455（確定）、C-0452（確定）
  - notes[0] 補足: 「フルバーストタイム 5 秒▲」は burst_duration（フルバースト 15 秒）で入っている: C-0455（確定）
  - notes[1] 未対応: 殲滅モードと装弾数無限は III の発動の 6f 後に付き、殲滅モードの最初の発は発動の 7f 後（C-0452。遅れの表の行）。実測では止まりの明けから殲滅モードの最初の発までモダニアは撃たない（発動の前も 6〜19f 撃たない回がある）が、モデルはこの間も通常の MG の発を撃つ（未対応）: C-0452（確定）
  - notes[2] 前提の外: 殲滅モードの照準線拡張・照準範囲内のすべての敵を同時に照準は、単体の的では関係しない: C-0443（範囲外）

## 261 ニヒリスター

- **skill1**: supported
  - effects[0] timed・fullChargeShot・pierce: C-1091（確定）
  - notes[0] 前提の外: 2 機以上に同時に命中した時の追加ダメージは、敵 1 体では起きない: C-0088（確定）
  - notes[1] 前提の外: フルチャージ攻撃時の貫通範囲の拡張は、敵 1 体ではダメージに関係しない: C-0088（確定）
- **skill2**: partial
  - effects[0] damage・10 秒ごと・skill: C-0102（確定）、C-0401（確定）、C-0453（確定）
  - notes[0] 未対応: S2 のヒットがバーストゲージを溜めるかは確かめていない（イサベル・エーテル・ラピの S2 は溜める。C-0404・C-0409）。モデルは溜めない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0089（確定）、C-0219（確定）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）、C-0219（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）

## 270 ブラン

- **skill1**: noEffect
  - notes[0] 間接（バリア）: 通常攻撃 120 回ごとの味方共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
- **skill2**: partial
  - effects[0] heal・fullBurstEnd: C-0694（確定）
  - notes[0] 未対応: フルバーストタイム終了時、同じ部隊の味方がいれば自分のバーストスキルクールタイム▼は未対応: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-0693（確定）
  - effects[1] timed・burstUse・damageTaken: C-0692（確定）
  - notes[0] 計算に無関係: 残りの HP が最も低い味方 1 機への不屈はダメージに関係しない: 根拠なし
  - notes[1] 間接（HP）: 残りの HP が最も低い味方 1 機への最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 271 ノワール

- **skill1**: supported
  - effects[0] passive・attack（読む: HP）: C-0020（確定）、C-0835（確定）、C-1106（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: C-0395（確定）
  - effects[1] ammoRefill・fullBurstStart: C-0395（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0226（確定）
  - effects[1] timed・burstUse・hitRate: C-0396（仮説）
  - effects[2] timed・burstUse・hitRate: C-0442（仮説）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲（SG の味方に 10 秒、同じ部隊の味方がいれば味方全体に 30 秒）は、射撃場の敵に阻止部位が無いのでダメージに関係しない: C-0443（範囲外）

## 281 モラン

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-0705（確定）
  - notes[0] 間接（防御力）: 戦闘開始時の、自分の失った HP に応じた防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] burstGaugeHit・lastShot: C-0480（確定）
  - notes[0] 計算に無関係: 最後の弾丸で攻撃した時の、最終攻撃力が最も高い敵 3 機への挑発（4 秒）そのものはダメージに関係しない（ゲージは effects[0]）: 根拠なし
  - notes[1] 間接（HP）: HP 20% 以下の時の、自分への使用回数別の最大 HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-0703（確定）
  - effects[1] timed・burstUse・infiniteAmmo: C-0703（確定）
  - notes[0] 計算に無関係: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、モランに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
  - notes[1] 計算に無関係: 敵全体への挑発（ヘイト）と、味方全体への受けるダメージ▼はダメージに関係しない: 根拠なし
  - notes[2] 間接（防御力）: 味方全体への発動者基準の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] damage・normalHit・additional: C-0705（確定）
  - effects[1] state・battleStart・fervor（burstCooldown）: C-0706（確定）
  - notes[0] 間接（防御力）: 戦闘開始時の、自分の失った HP に応じた防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] burstGaugeHit・lastShot: C-0480（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-0728（確定）
  - notes[0] 計算に無関係: 最後の弾丸で攻撃した時の、最終攻撃力が最も高い敵 3 機への挑発（4 秒）そのものはダメージに関係しない（ゲージは effects[0]）: 根拠なし
  - notes[1] 間接（HP）: HP 20% 以下の時の、自分への使用回数別の最大 HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 burst**: supported
  - effects[0] weaponChange・burstUse: C-0703（確定）
  - effects[1] timed・burstUse・infiniteAmmo: C-0703（確定）
  - effects[2] timed・burstUse・attack: C-0704（確定）
  - notes[0] 計算に無関係: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、モランに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
  - notes[1] 計算に無関係: 敵全体への挑発（ヘイト）と、味方全体への受けるダメージ▼はダメージに関係しない: 根拠なし
  - notes[2] 間接（防御力）: 味方全体への発動者基準の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし

## 290 マナ

- **skill1**: supported
  - effects[0] state・battleStart・metalGamma（attack）: C-0020（確定）
  - effects[1] heal・normalShot: C-0570（確定）、C-0628（確定）
  - notes[0] 前提の外: 味方の戦闘不能時の復活とマターガンマ解除は、味方が倒れないので起きない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] state・battleStart・metalSigma（burstGaugeSpeed）: C-0269（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-0281（確定）
  - effects[2] timed・fullBurstStart・attack: C-0281（確定）
  - effects[3] timed・fullBurstStart・chargeSpeed: C-0267（確定）
  - effects[4] removeState・fullBurstStart・metalSigma: C-0562（確定）
  - effects[5] state・fullBurstEnd・metalSigma: C-0562（確定）
- **burst**: supported
  - effects[0] timed・burstUse・sustainedDamage: C-0299（確定）、C-0301（仮説）
  - effects[1] dot・burstUse: C-0300（確定）、C-0301（仮説）

## 291 エーテル

- **skill1**: noEffect
  - notes[0] 計算に無関係: 残りの HP の数値が最も低い味方 1 機に受けるダメージ▼は、ダメージとゲージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] damage・13 秒ごと・skill: C-0405（確定）、C-0102（確定）、C-0453（確定）
  - effects[1] burstGaugeHit・13 秒ごと: C-0409（仮説）、C-0405（確定）、C-0453（確定）
  - effects[2] timed・13 秒ごと・enemyDefenseDown: C-0832（確定）、C-0405（確定）、C-0453（確定）、C-0790（確定）、C-0835（確定）
- **burst**: noEffect
  - notes[0] 間接（バリア）: 残りの HP の数値が最も低い味方へのバリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。バーストゲージは溜めない）: 根拠なし

## 300 ソルジャーE.G.

- **skill1**: supported
  - effects[0] timed・normalHit・attack: C-0372（確定）
- **skill2**: supported
  - effects[0] timed・9 秒ごと・maxAmmo: C-0369（確定）、C-0017（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0371（確定）、C-0370（確定）

## 301 ソルジャーF.A.

- **skill1**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の自分の防御力▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: C-0366（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の吸収回復（攻撃ダメージの一部を回復）は、ダメージに関係しない（自分にだけ付き、ソルジャーF.A. に回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: C-0366（確定）
- **burst**: noEffect
  - notes[0] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-0366（確定）

## 302 プロダクト08

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 通常攻撃命中時（確率 20%）の、残りの HP が最も低い味方 1 機の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: C-0072（確定）
- **skill2**: supported
  - effects[0] timed・17 秒ごと・critRate: C-0496（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0684（確定）

## 304 I-DOLL・フラワー

- **skill1**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した対象（敵）の攻撃力▼はダメージに関係しない: C-0072（確定）、C-0367（確定）
- **skill2**: supported
  - effects[0] burstGaugeHit・15 秒ごと: C-0178（確定）、C-0176（確定）
  - notes[0] 計算に無関係: 最終攻撃力が最も高い敵の攻撃力▼はダメージに関係しない: C-0072（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0072（確定）、C-0220（確定）、C-0221（確定）
  - notes[0] 計算に無関係: 挑発はダメージに関係しない: C-0072（確定）

## 305 I-DOLL・オーシャン

- **skill1**: supported
  - effects[0] heal・lastShot: C-0591（確定）、C-0254（確定）、C-0650（確定）
- **skill2**: supported
  - effects[0] heal・15 秒ごと: C-0591（確定）、C-0254（確定）
- **burst**: supported
  - effects[0] heal・burstUse: C-0254（確定）、C-0554（仮説）
  - notes[0] 補足: 説明文に出てこない数値（description_value_01）は使っていない: 根拠なし

## 307 プロダクト23

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 最後の弾丸が命中した時の自分の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、プロダクト23 に回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い敵 2 機への防御力▼（5 秒）は未対応: C-0777（仮説）

## 308 I-DOLL・サン

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 通常攻撃が 10 回命中した時の自分の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: C-0275（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の自分の攻撃力▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: C-0275（確定）
- **burst**: supported
  - effects[0] timed・burstUse・maxAmmo: C-0364（確定）、C-0616（確定）、C-0017（確定）、C-0275（確定）

## 310 エード

- **skill1**: partial
  - effects[0] timed・自分の HP が閾値以下に下がった時・attack: C-1025（確定）
  - notes[0] 間接（デバフ）: 戦闘開始時に味方全体に付く「完璧なメイド：デバフ効果免疫 1 個」は、それ自体は与ダメージを変えない（味方にデバフを付ける味方（マスト：ロマンチックメイドのほろ酔い）のいる編成でだけ効く。防ぐ数え方・自分で付けるデバフを防ぐかは確かめていないので、モデルでは防がない）: 根拠なし
  - notes[1] 未対応: 回復で現在の HP が戻って HP の割合が 90% を上回る分（最大HP のみ▲ の間に回復を受けた時）は扱わない（HP の割合は最大HP▲・最大HP のみ▲ だけで下げる）: 根拠なし
- **skill2**: supported
  - effects[0] timed・normalShot・maxHpOnly: C-1026（確定）、C-1107（確定）
  - notes[0] 間接（デバフ）: 通常攻撃 420 回ごとに味方全体に付く「完璧なメイド：デバフ効果免疫 1 個」は、それ自体は与ダメージを変えない（味方にデバフを付ける味方（マスト：ロマンチックメイドのほろ酔い）のいる編成でだけ効く。防ぐ数え方・自分で付けるデバフを防ぐかは確かめていないので、モデルでは防がない）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・maxHpOnly: C-1026（確定）、C-1107（確定）
  - effects[1] timed・burstUse・attack: C-1027（確定）

## 311 ココア

- **skill1**: supported
  - effects[0] coverHeal・15 秒ごと: C-0977（確定）、C-0822（確定）
  - effects[1] removeDebuff・15 秒ごと・デバフ 1 個（デバフのかかった味方 2 機）: C-0978（確定）、C-0979（確定）、C-1038（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時に自分に付くプロケチャップ（受けるダメージ▼）は、ダメージに関係しない: C-0977（確定）
- **burst**: supported
  - effects[0] removeDebuff・burstUse・デバフ 1 個: C-0976（確定）、C-0979（確定）、C-1088（確定）
  - notes[0] 計算に無関係: プロケチャップがフルスタックのときの敵全体の攻撃力▼は、ダメージに関係しない: C-0977（確定）

## 313 プリバティ：アンカインド・メイド

- **skill1**: supported
  - effects[0] damage・pelletHit・skill: C-0408（確定）、C-0659（確定）、C-0830（確定）、C-0831（確定）
- **skill2**: unsupported
  - notes[0] 未対応: 通常攻撃 1 回でペレットが 5 個以上命中した時の自分のリロード速度▲（2 秒）は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイム中のペレット 30 回命中ごとの、自分の弾丸チャージと攻撃力▲（5 スタック・2 秒）は未対応: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0679（確定）
  - effects[1] timed・burstUse・critDamage: C-0679（確定）
  - effects[2] burstDamage・skill: C-0679（確定）、C-0680（確定）

## 314 ソーダ：トゥインクルバニー

- **skill1**: partial
  - effects[0] stackChange・battleStart・goldenChip: C-0128（確定）
  - effects[1] state・normalShot・goldenChip（critDamage）: C-0580（確定）
    - contents[0] critDamage: C-0128（確定）
  - effects[2] timed・normalShot・attackDamage: C-0881（確定）
  - notes[0] 未対応: 同じきっかけの、自分を除く最終攻撃力が最も高い味方 1 機への攻撃ダメージ▲（2 秒）は未対応。ラム・デルタ（スペック固定の攻撃力が同じ）との編成の録画では▲はデルタに乗り、ラムには乗らない（V-0634）。モデルの順位（最終攻撃力。同値は枠の若い順）ではラムになり、選び方が決まらない: C-0882（確定）
- **skill2**: supported
  - effects[0] fullBurstExtend・burstStage3Enter: C-0877（確定）
  - effects[1] fullBurstExtend・burstStage3Enter: C-0877（確定）
  - effects[2] state・burstStage3Enter・timeExtension1: C-0880（確定）
  - effects[3] state・burstStage3Enter・timeExtension2: C-0880（確定）
  - effects[4] damage・normalShot・skill: C-0880（確定）
  - effects[5] damage・normalShot・skill: C-0880（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0572（確定）、C-0581（確定）、C-0582（確定）、C-0615（確定）
  - effects[1] timed・burstUse・hitRate: C-0573（確定）
  - effects[2] timed・burstUse・attack: C-0573（確定）、C-0582（確定）
  - effects[3] stackChange・burstUse・goldenChip（減少）: C-0573（確定）、C-0574（確定）

## 315 エード：エージェントバニー

- **skill1**: partial
  - effects[0] timed・fullChargeShot・attack: C-1034（確定）
  - effects[1] state・fullChargeShot・spyLens（minEffectiveRange）: C-1043（確定）、C-1033（仮説）
  - notes[0] 未対応: 近（帯の外）でも、隠しレンズがフルスタック（貫通特化）の間は、攻撃力▲がときどき付き直す（距離ボーナスの乗らない発がきっかけになる）。きっかけの規則が分からないので未対応（plan/design-agent-bunny.md 10 節の 6）: C-1104（確定）、C-1105（仮説）
- **skill2**: partial
  - effects[0] timed・fullChargeShot・pierceDamage（読む: 貫通）: C-1031（確定）、C-1034（確定）
  - effects[1] passive・spyLens のフルスタックの間・pierce: C-1031（確定）
  - effects[2] passive・spyLens のフルスタックの間・attack: C-1034（確定）
  - notes[0] 未対応: 近（帯の外）でも、貫通特化の間は貫通ダメージ▲がときどき付き直す。S1 の攻撃力▲と同じく未対応（plan/design-agent-bunny.md 10 節の 6）: C-1104（確定）、C-1105（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・minEffectiveRange: C-1043（確定）、C-1033（仮説）
  - effects[1] timed・burstUse・attackDamage: C-1034（確定）
  - effects[2] timed・burstUse・pierceDamage（読む: 貫通）: C-1031（確定）

## 316 ベルベット

- **skill1**: supported
  - effects[0] counterChange・battleStart・ammoPouch: C-1160（確定）
  - effects[1] counterChange・burstStage2Enter・ammoPouch: C-1164（仮説）
  - effects[2] counterChange・fullChargeShot・ammoPouch（減少）: C-1160（確定）
  - effects[3] timed・fullChargeShot・attack: C-1160（確定）
  - effects[4] timed・fullChargeShot・attackDamage: C-1160（確定）
  - notes[0] 計算に無関係: 弾丸泥棒の効果 1（敵全体の残弾数▼）はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] counterChange・fullChargeShot・ammoPouch（減少）: C-1165（仮説）
  - effects[1] timed・fullChargeShot・attack: C-1163（確定）
  - effects[2] timed・fullChargeShot・chargeDamage: C-1163（確定）
  - effects[3] counterChange・normalHit・ammoPouch（減少）: C-1164（仮説）
  - effects[4] timed・normalHit・attackDamage: C-1162（確定）
  - effects[5] damage・normalHit・additional: C-1162（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1161（確定）
  - effects[1] timed・burstUse・attackDamage: C-1161（確定）

## 330 クラウン

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0393（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-0394（確定）
  - notes[0] 間接（防御力）: 直前にバーストスキルを使用していない味方への防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: C-0393（確定）
- **skill2**: supported
  - effects[0] heal・relax のフルスタック: C-0271（確定）
  - effects[1] timed・healed・attackDamage: C-0050（確定）、C-0271（確定）
  - effects[2] state・normalShot・relax: C-0271（確定）
  - notes[0] 計算に無関係: 無敵・挑発はダメージに関係しない: 根拠なし
  - notes[1] 間接（HP）: リラックス（受ける HP 回復量▲）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0393（確定）、C-0499（確定）
  - notes[0] 間接（バリア）: バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0393（確定）

## 331 チャイム

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時に自分の王へ付ける、スキル発動者基準の攻撃力▲（持続）は未対応（王の決まり方を扱っていない）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: フルバーストタイムの発動時に自分の王へ付ける通常攻撃ダメージ倍率▲（10 秒）は未対応: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体のバースト再突入 2 段階は未対応: 根拠なし
  - notes[1] 未対応: 味方全体の最大装弾数▲（10 秒）は未対応: 根拠なし
  - notes[2] 未対応: 自分の王への攻撃ダメージ▲（10 秒）は未対応: 根拠なし

## 350 マスト

- **skill1**: partial
  - effects[0] state・critHit・seaBreeze（enemyDefenseDown）: C-0858（確定）
  - effects[1] timed・自分の HP が閾値以下に下がった時・critDamage: C-0862（確定）
  - effects[2] timed・自分の HP が閾値以下に下がった時・critDamage: C-0862（確定）
  - notes[0] 補足: 海風は通常攻撃のクリティカルの命中 2 回ごとに付き、最後の付与から約 3 秒で全スタックが切れる。実機では会心が 3 秒の間に 2 回無いと途切れて 0 から積み直すが、モデルはクリティカルを期待値で数えるので途切れず、暴風が写すスタックを多めに出す（V-0623）: 根拠なし
  - notes[1] 未対応: 回復で現在の HP が戻って HP の割合が 70% を上回る分（最大HP のみ▲ の間に回復を受けた時）は扱わない（HP の割合は最大HP▲・最大HP のみ▲ だけで下げる）: 根拠なし
- **skill2**: supported
  - effects[0] timed・battleStart・critRate: C-0859（確定）
  - effects[1] timed・battleStart・critRate: C-0863（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critDamage: C-0861（確定）
  - effects[1] timed・burstUse・critDamage: C-0861（確定）
  - effects[2] dot・burstUse: C-0860（確定）
  - effects[3] timed・burstUse・maxHpOnly: C-0862（確定）
  - effects[4] timed・burstUse・maxHpOnly: C-0863（確定）、C-1107（確定）
  - notes[0] 補足: 暴風は説明文で「持続ダメージ」でなく「ダメージ」なので、持続ダメージ▲を掛けない。確かめた編成は無い（持続ダメージ▲の使い手を混ぜていない。plan/design-mast.md 2.3 節）: 根拠なし

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

## 353 ヘルム：アクアマリン

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-1056（確定）、C-1059（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-1057（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-1057（確定）
  - effects[3] cooldownReduction・fullBurstStart: C-1057（確定）
- **skill2**: supported
  - effects[0] damage・4 秒ごと・skill: C-1058（確定）
  - effects[1] burstGaugeHit・4 秒ごと: C-1059（確定）、C-1058（確定）
  - effects[2] timed・4 秒ごと・damageTaken: C-1060（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1061（確定）
  - effects[1] damage・burstUse・additional: C-1062（確定）、C-1061（確定）

## 354 マスト：ロマンチックメイド

- **skill1**: supported
  - effects[0] state・burstStage1Enter・drunken（hitRate）: C-0941（確定）、C-0942（確定）
  - effects[1] passive・drunken の間・critRate: C-0941（確定）
  - effects[2] passive・drunken の間・attack: C-0941（確定）
- **skill2**: supported
  - effects[0] timed・burstStage3Enter・distributedDamage: 根拠なし
  - effects[1] timed・burstStage3Enter・reloadSpeed: 根拠なし
  - effects[2] removeState・fullBurstEnd・drunken: C-0943（確定）
  - effects[3] state・fullBurstEnd・hangover: C-0943（確定）
  - effects[4] shotPause・hangover が適用された時: C-0943（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critDamage: 根拠なし
  - effects[1] timed・burstUse・attackDamage: C-0942（確定）
  - effects[2] timed・burstUse・attack: C-0942（確定）

## 355 アンカー：イノセントメイド

- **skill1**: supported
  - effects[0] timed・fullBurstStart・distributedDamage: 根拠なし
  - effects[1] heal・fullBurstStart: 根拠なし
  - notes[0] 間接（HP）: 使用回数別の効果の 1 回目からの HP 回復量▲（5 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 前提の外: 使用回数別の効果の 3 回目からのスタック可能デバフ効果のスタック量▼は、味方に付くデバフが敵の攻撃から来るので起きない（被弾を扱わない。要件 4.2 節）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstEnd・hitRate: 根拠なし
  - effects[1] timed・fullBurstEnd・attack: C-0944（確定）
  - effects[2] timed・fullBurstEnd・reloadSpeed: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: 根拠なし
  - effects[1] timed・burstUse・attack: C-0945（確定）
  - notes[0] 間接（HP）: 保存（超過した回復量を発動者の最大HP の X% まで保存・25 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 390 ツバイ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・pierceDamage（読む: 貫通）: C-1071（確定）
  - effects[1] timed・fullBurstStart・pierceDamage（読む: 貫通）: C-1071（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・critRate: C-1073（確定）
  - notes[0] 間接（遮蔽物）: 通常攻撃で 5 回攻撃した時の、味方全体の遮蔽物 HP 回復は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1069（確定）、C-1070（確定）
  - effects[1] timed・burstUse・pierceDamage（読む: 貫通）: C-1071（確定）
- **宝物版 skill1**: supported
  - effects[0] timed・fullBurstStart・pierceDamage（読む: 貫通）: C-1071（確定）
  - effects[1] timed・fullBurstStart・pierceDamage（読む: 貫通）: C-1071（確定）
  - effects[2] timed・normalShot・pierceDamage（読む: 貫通）: C-1072（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・fullBurstStart・critRate: C-1073（確定）
  - effects[1] timed・normalShot・critRate: C-1073（確定）
  - notes[0] 間接（遮蔽物）: 通常攻撃で 5 回攻撃した時の、味方全体の遮蔽物 HP 回復は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 burst**: supported
  - effects[0] weaponChange・burstUse: C-1069（確定）、C-1070（確定）
  - effects[1] state・burstUse・pierceAttacks101（pierceDamage）（読む: 貫通）: C-1071（確定）

## 391 アイン

- **skill1**: supported
  - effects[0] timed・burstStage3Enter・attack: C-0869（確定）
  - effects[1] summon・battleStart・nearFeather 4 機: C-0888（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・chargeDamage: C-0868（確定）
  - effects[1] damage・nearFeather の攻撃（機数で決まる間隔）・true: C-0888（確定）、C-0889（確定）、C-0890（仮説）、C-0891（確定）
- **burst**: supported
  - effects[0] timed・burstUse・trueDamage: C-0870（確定）
  - effects[1] timed・burstUse・chargeDamage: C-0869（確定）
  - effects[2] damage・burstUse・true: C-0870（確定）、C-0871（仮説）
  - effects[3] summon・burstUse・nearFeather 6 機: C-0889（確定）、C-0890（仮説）

## 400 ギルティ

- **skill1**: supported
  - effects[0] state・normalShot・mindIfIBorrowThis（attack）: C-0873（確定）
- **skill2**: partial
  - effects[0] stackChange・normalShot・mindIfIBorrowThis: C-0873（確定）
  - effects[1] timed・normalShot・attack: C-0873（確定）
  - notes[0] 未対応: 風圧コードのほかの味方のスタック可能バフ効果のスタック量▲は未対応（自分の借りていくよぉ…の分だけ扱う）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0874（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-0874（確定）
  - effects[2] damage・burstUse・additional: C-0874（確定）

## 401 シン

- **skill1**: noEffect
  - notes[0] 間接（HP）: 最後の弾丸で攻撃した時の、自分への最大HP が最も高い味方 1 機の最大HP のコピーは、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 最後の弾丸で攻撃した時の、敵全体への挑発（ヘイト）はダメージに関係しない（付けたときも切れるときもゲージを溜めない。ティアの S2 と同じ形）: C-0883（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstEnd・burstGaugeSpeed: C-0892（確定）
  - notes[0] 計算に無関係: バーストスキルを使用した時の 1 回目の吸収回復はダメージに関係しない: 根拠なし
  - notes[1] 間接（HP）: バーストスキルを使用した時の 2 回目からの自分の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[2] 間接（防御力）: バーストスキルを使用した時の 3 回目からの自分の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0875（確定）
  - notes[0] 前提の外: ニケを除いた敵が 4 機以上の時の敵全体の受けるダメージ▲は、敵 1 体では起きない: 根拠なし

## 402 クエンシー

- **skill1**: noEffect
  - notes[0] 間接（HP）: 通常攻撃 60 回ごとの、自分への最大HP が最も高いニケの最大HP のコピーは、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] timed・8 秒ごと・attack: C-0878（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critDamage: C-0879（確定）
  - notes[0] 間接（HP）: 最終攻撃力が最も高い味方 2 機への最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 403 クエンシー：エスケープクイーン

- **skill1**: supported
  - effects[0] passive・exploreRouteStage1 のフルスタックの間・distributedDamage: C-1010（確定）
  - effects[1] passive・exploreRouteStage2 のフルスタックの間・coreDamage: C-1010（確定）
  - effects[2] passive・exploreRouteStage3 のフルスタックの間・critRate: C-1010（確定）
- **skill2**: supported
  - effects[0] state・normalShot・exploreRouteStage1（hitRate・attack）: C-1009（確定）、C-1024（仮説）、C-1029（仮説）、C-1145（仮説）
  - effects[1] state・normalShot・exploreRouteStage2（hitRate・attack）: C-1009（確定）
  - effects[2] state・normalShot・exploreRouteStage3（hitRate・attack）: C-1009（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1011（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-1015（確定）
  - effects[2] burstDamage・distributed: C-1011（確定）

## 430 ノイズ

- **skill1**: noEffect
  - notes[0] 計算に無関係: 20 回攻撃を受けた時の味方全体の受けるダメージ▼は防御系でダメージに関係しない（被弾を扱わないので起きもしない。射撃場の 3 分モードでは敵の攻撃で起きうる）: 根拠なし
- **skill2**: unsupported
  - notes[0] 計算に無関係: フルチャージ攻撃が命中した時の、対象への挑発（2 秒）そのものはダメージに関係しない。付けるたびに射手の target_burst_energy_pershot を溜める形と、付いていない所から付いた時（マガジンの 1 発目）だけ溜める形は、発ごとのゲージと合わない: C-1175（仮説）
  - notes[1] 未対応: フルチャージの発の 1 ヒットのゲージが target_burst_energy_pershot より多い分（マガジンの何発目かによらない）は扱っていない。出どころ（挑発が付けるたびに少し溜めるのか、ほかの何か）は分からない: C-1175（仮説）
  - notes[2] 間接（HP）: フルチャージして攻撃した時の自分の最大HP▲（1.8 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1174（確定）
  - notes[0] 間接（HP）: 味方全体の最大HP▲（10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 431 ボリューム

- **skill1**: noEffect
  - notes[0] 前提の外: 敵を倒した時の自分の攻撃力▲（5 秒）は、射撃場の的が倒れないので起きない（敵 1 体の前提。要件 4.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-1171（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-1171（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-1171（確定）
  - effects[3] timed・burstUse・critDamage: C-1172（確定）
  - effects[4] timed・burstUse・critDamage: C-1172（確定）
  - effects[5] timed・burstUse・critDamage: C-1172（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critRate: C-1173（確定）

## 450 ナガ

- **skill1**: supported
  - effects[0] timed・barrier が適用された時・coreDamage（読む: バリア）: C-0671（確定）
  - effects[1] coverHeal・normalShot: C-0826（確定）
- **skill2**: supported
  - effects[0] timed・normalShot・coreDamage: C-0592（確定）、C-0593（確定）、C-0653（確定）
  - effects[1] heal・normalShot: C-0673（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0672（確定）
  - effects[1] timed・burstUse・attack（読む: バリア）: C-0672（確定）
  - effects[2] timed・burstUse・pierce: C-1092（確定）

## 451 ティア

- **skill1**: supported
  - effects[0] timed・遮蔽物の HP を回復した時・burstCooldown（読む: 遮蔽物）: C-0775（確定）、C-0827（確定）
  - effects[1] timed・遮蔽物の HP を回復した時・attackDamage（読む: 遮蔽物）: C-0776（確定）、C-0821（確定）、C-0826（確定）
- **skill2**: supported
  - effects[0] coverHeal・burstUse: C-0775（確定）
  - effects[1] heal・burstUse: 根拠なし
  - notes[0] 間接（遮蔽物）: 通常攻撃が 5 回命中した時の、自分の遮蔽物の最大 HP▲は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 通常攻撃が 5 回命中した時の、敵全体への挑発（ヘイト）はダメージに関係しない（ゲージも溜めない。C-0505）: C-0505（確定）
- **burst**: supported
  - effects[0] burstReentry: C-0775（確定）
  - notes[0] 間接（バリア）: 自分と、自分を除く味方全体へのバリア（10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く）: 根拠なし

## 470 レッドフード

- **skill1**: supported
  - effects[0] timed・normalShot・chargeSpeed: C-0895（確定）
  - effects[1] passive・chargeSpeedOverflow: C-0899（確定）、C-0909（確定）
- **skill2**: supported
  - effects[0] timed・redWolf が適用された時・attack: C-0899（確定）
  - effects[1] passive・pierce: C-1093（確定）
  - notes[0] 間接（防御力）: ビーストケージを適用時の、味方全体へのスキル発動者基準の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: ハウリングエンドを適用時の、攻撃ダメージの回復（吸収回復）は、回復で、回復を受けた時を読む味方がいなければダメージに効かない: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・beastCage: C-0893（確定）
  - effects[1] timed・burstUse・attack: C-0893（確定）
  - effects[2] cooldownReduction・burstUse: C-0894（確定）
  - effects[3] state・burstUse・theLastHowl: C-0920（確定）
  - effects[4] cooldownReduction・burstUse: C-0894（確定）
  - effects[5] state・burstUse・redWolf: C-0899（確定）
  - effects[6] weaponChange・burstUse: C-0896（確定）、C-0897（確定）
  - effects[7] timed・burstUse・chargeSpeed: C-0899（確定）
  - notes[0] 補足: 使用武器変更の発射レートは、CDN のバーストが使用武器の変更の形（ChangeWeapon）でないので無い。チャージ武器の発の間隔はチャージ時間と解放で決まり、レートを読まないので、基礎の武器のレート（60）を書いた: 根拠なし
  - notes[1] 計算に無関係: バーストⅡの、自分にヘイト：敵全体を挑発は、ダメージに関係しない。付けたときにゲージを溜めても、チェーンの間はゲージを足さないので効かない: 根拠なし
  - notes[2] 間接（HP）: バーストⅡの、自分の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[3] 前提の外: バーストⅢの貫通範囲の拡張は、敵 1 体の前提では効かない（要件の前提の外）: C-0443（範囲外）

## 471 スノーホワイト：ヘビーアームズ

- **skill1**: supported
  - effects[0] state・チャージ中の 0.2 秒ごと・autoFireReady: C-0757（確定）
  - effects[1] removeState・normalShot・autoFireReady: C-0757（確定）
  - effects[2] timed・チャージ中の 0.2 秒ごと・damageTaken: C-0758（確定）
  - effects[3] damage・fullChargeShot・skill: C-0757（確定）、C-0426（確定）
  - effects[4] damage・fullChargeShot・skill: C-0757（確定）、C-0426（確定）、C-0761（確定）
  - effects[5] stackChange・fullChargeShot・sevenDwarvesFullyActive（減少）: C-0760（確定）
  - effects[6] removeState・normalShot・sevenDwarvesFullyActive: C-0834（確定）
  - notes[0] 間接（防御力）: オートファイア準備の中身の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く。装填数は effects[0]）: 根拠なし
- **skill2**: supported
  - effects[0] timed・battleStart・fixedChargeTime: C-0849（確定）、C-0850（仮説）
  - effects[1] timed・フルチャージした時・attack: C-0758（確定）
  - effects[2] timed・burstStage3Enter・attack: C-0762（確定）
  - effects[3] timed・フルチャージした時・chargeDamage: C-0760（確定）
  - effects[4] timed・フルチャージした時・sequentialAttackDamage: C-0760（確定）
  - effects[5] timed・フルチャージした時・pierce: C-1094（確定）
  - notes[0] 前提の外: フルチャージした時のパーツダメージ▲は、パーツの無い射撃場の的ではダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0762（確定）
  - effects[1] state・burstUse・sevenDwarvesFullyActive（fixedChargeTime・maxStacksUp）: C-0760（確定）
  - notes[0] 前提の外: 破壊可能な発射体全体へのダメージは、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）

## 472 紅蓮：神殺

- **skill1**: supported
  - effects[0] state・battleStart・intoTheFraySereneMind: 根拠なし
  - effects[1] timed・battleStart・normalCritRate: C-0954（確定）
  - effects[2] damage・normalShot・additional: C-0955（確定）、C-0969（確定）
  - effects[3] damage・normalShot・additional: C-0969（確定）
  - effects[4] timed・fullBurstStart・critDamage: C-0970（確定）
  - effects[5] passive・pierce: C-1095（確定）
  - notes[0] 前提の外: 通常攻撃が広範囲の攻撃になることは、敵 1 体の前提では的の数を変えない（要件 5.2 節）。射撃場の的では、どの区間も通常攻撃がコアに当たる（的の表の弾の種類 InstantBox の行。V-0675）: C-0443（範囲外）、C-0957（確定）
- **skill2**: supported
  - effects[0] ammoRefill・critHit: C-0956（確定）、C-0971（確定）
  - effects[1] state・burstUse・intoTheFrayAtOneWithTheSword（normalCritRate・attackDamage）: C-0968（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-0965（確定）
  - effects[1] timed・burstUse・attack: C-0966（確定）
  - effects[2] damage・burstUse・additional: C-0967（確定）
  - notes[0] 前提の外: 通常攻撃の範囲 100%▲ は、敵 1 体の前提では的の数を変えない（要件 5.2 節）: C-0443（範囲外）

## 473 ラプンツェル：サンクチュアリ

- **skill1**: partial
  - effects[0] heal・fullChargeShot: C-0913（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-0719（確定）、C-0750（確定）
  - notes[0] 前提の外: ナノ粒子投与（バーストの、戦闘不能の味方が 3 機以上の分岐）を使用した時の、バーストスキルのクールタイム▲とナノ粒子消耗：防御力▲は、味方が倒れない前提では起きない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: フルチャージした時からの、自分へのチャージ速度▲▼の無効（持続）は未対応（効果の無効の語彙が無い。自分にチャージ速度▲▼を付ける味方のいる編成でだけ効く。plan/design-new-chars-1029.md 論点 F）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attack: C-0719（確定）、C-0750（確定）
  - effects[1] damage・fullChargeShot・additional: C-0720（確定）、C-0721（確定）、C-0914（確定）
  - notes[0] 前提の外: フルチャージ状態を 1 秒以上維持した時の自分への共用バリアは、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）
  - notes[1] 前提の外: フルチャージ状態を 1 秒以上維持した時の味方全体のゴッデスブレッシング（発動者基準の防御力▲）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0722（確定）
  - notes[0] 前提の外: 戦闘不能状態の味方が 3 機以上の分岐（ナノ粒子投与の復活と、発動者基準の攻撃力▲・防御力▲。戦闘中 1 回）は、味方が倒れない前提では起きない（要件 5.2 節）: C-0443（範囲外）

## 500 エレグ

- **skill1**: supported
  - effects[0] damage・normalHit・distributed: C-0697（確定）、C-0766（確定）、C-0772（確定）、C-0773（確定）、C-0779（仮説）
  - notes[0] 前提の外: 戦闘開始時の、敵の発射体を攻撃する時の発射体に与えるダメージ▲は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] burstGauge・battleStart: C-0662（確定）
  - effects[1] timed・normalHit・attack: C-0696（確定）、C-0697（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0689（確定）
  - effects[1] state・burstHit・boomInstall（enemyDefenseDown）: C-0690（確定）
  - effects[2] timed・burstUse・distributedDamage: C-0691（確定）、C-0778（確定）

## 501 トロニー

- **skill1**: partial
  - effects[0] damage・fullChargeShot・distributed: C-0430（確定）、C-0903（確定）、C-0904（仮説）、C-0910（確定）、C-0911（確定）、C-0916（仮説）、C-0927（仮説）
  - notes[0] 補足: 最大量の攻撃力と分配ダメージ▲は、付けた発の 16f 後（切れる時の遅れ 16f を付くまでの遅れとみた時点）に読む形にした。録画で分かったのは、付けた発から 3〜21f の間の値で読むこと（C-0916）だけ: C-0916（仮説）
  - notes[1] 未対応: 最大量に届いた時の爆発のバーストゲージは未実装（溜めない。録画で読めていない）: C-0904（仮説）
  - notes[2] 補足: 溜める発の締め切りは、切れるフレームの 13f 前（付けた発の 297f 後。最大量の爆発の遅れ 13f と同じ遅れとみた形）にした。録画で分かったのは、付けた発の 295f 後の発は溜まり、299f 後の発は溜まらないこと（C-0927）だけ: C-0927（仮説）
- **skill2**: partial
  - effects[0] timed・fullChargeShot・distributedDamage: C-0904（仮説）
  - notes[0] 未対応: フルチャージ攻撃が 5 回命中した時の対象の防御力▼（10 秒）は未対応（録画では、▼の後に的の防御 100 が 0 になった値で、説明文の 9.59% を C-0556 の式で引いた値と合わない。V-0613）: C-0851（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0852（仮説）
  - effects[1] timed・burstUse・accumulateRatio: C-0903（確定）

## 511 シンデレラ

- **skill1**: supported
  - effects[0] damage・fullChargeShot・additional: C-0583（確定）、C-0604（確定）
  - effects[1] timed・burstStage3Enter・attack（読む: HP）: C-0584（確定）、C-0585（仮説）
  - effects[2] timed・fullChargeShot・chargeSpeed: C-0603（確定）
- **skill2**: supported
  - effects[0] state・battleStart・decoy: C-0584（確定）
  - effects[1] state・burstStage3Enter・decoy: C-0584（確定）
  - effects[2] state・3 秒ごと・beauty（maxHp）: C-0584（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0654（確定）、C-0655（確定）
  - effects[1] damage・burstUse・additional: C-0656（確定）、C-0657（確定）

## 514 グレイブ

- **skill1**: supported
  - effects[0] ammoDecrease・prediction が終了した時: C-1120（確定）
  - effects[1] state・prediction が終了した時・heatEmission（reloadRatio）: C-1120（確定）
  - effects[2] passive・heatEmission の間・pierceDamage（読む: 貫通）: C-1121（確定）
  - effects[3] allyGaugeAdd: C-1154（確定）、C-1120（確定）、C-0244（確定）
  - notes[0] 計算に無関係: 放熱の時に限り、味方全体に付くバーストゲージのチャージ速度▲の自分（グレイブ）の分は、放熱の間は込めていて撃たず（C-1120・C-1124）、ゲージを溜めるスキルのヒットも無いので、ゲージに関係しない: 根拠なし
  - notes[1] 間接（HP）: 放熱の時に限り、自分に最終最大HP の 2% を 1 秒ごとに回復するのは、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・normalHit・overheatI（attack）: C-1117（確定）
  - effects[1] state・normalHit・overheatII（attack）: C-1123（確定）
  - effects[2] state・normalHit・overheatIII（attackDamage）: C-1123（確定）
- **burst**: supported
  - effects[0] state・burstUse・prediction: C-1118（確定）、C-1119（確定）
  - effects[1] timed・burstUse・infiniteAmmo: C-1118（確定）、C-1119（確定）
  - effects[2] timed・burstUse・pierce: C-1118（確定）、C-1119（確定）
  - effects[3] timed・burstUse・pierceDamage: C-1118（確定）、C-1119（確定）
  - effects[4] timed・burstUse・critRate: C-1118（確定）、C-1119（確定）
  - effects[5] timed・burstUse・attackDamage: C-1118（確定）、C-1119（確定）
  - effects[6] timed・burstUse・pierceDamage（読む: 貫通）: C-1118（確定）、C-1119（確定）
  - effects[7] timed・burstUse・maxAmmo: C-1118（確定）、C-1119（確定）
  - notes[0] 間接（HP）: 完全計算の、自分の現在の HP 1%▼（1 秒間隔・10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く。グレイブに HP を読む効果は無く、S1 の放熱の回復で戻る）: 根拠なし

## 570 アークレンジャー・ブラック

- **skill1**: supported
  - effects[0] state・battery が最大になった時・transformation（attack）: C-0865（確定）
  - effects[1] counterChange・transformation の間 0.2 秒ごと・battery（減少）: C-0865（確定）
  - effects[2] timed・normalShot・sustainedDamage: C-0867（確定）
  - notes[0] 前提の外: 戦闘開始時のパーツダメージ▲と、味方がパーツを破壊した時のバッテリーのチャージは、射撃場の的にパーツが無いので起きない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] dot・transformation が適用された時: C-0865（確定）
  - effects[1] timed・fullBurstStart・sustainedDamage: C-0867（確定）
  - notes[0] 前提の外: 変身状態の間に敵が出現した時のアークブラックコレダーは、射撃場の的が 1 体で出現し直さないので起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] counterChange・burstUse・battery: C-0865（確定）
  - effects[1] counterChange・transformation が適用された時・battery（減少）: C-0865（確定）
  - effects[2] dot・burstUse: C-0866（確定）
  - effects[3] timed・burstUse・sustainedDamage: C-0867（確定）
  - notes[0] 前提の外: 自分が変身状態ならバッテリー 50%▲は、射撃場では起きない。変身状態でバーストを使うには、バースト以外でバッテリーを満たす（味方のパーツの破壊。的にパーツが無い）必要がある。バーストの緊急チャージで付いた変身は約 10 秒で外れ、バーストの CT（40 秒）より短い: C-0443（範囲外）

## 581 アルカナ

- **skill1**: supported
  - effects[0] timed・fullBurstEnd・attackDamage: C-1053（確定）、C-1054（確定）
  - effects[1] timed・fullBurstEnd・attack: C-1052（確定）
  - effects[2] state・fullBurstEnd・magician（skillCooldownDown）: C-1053（確定）、C-1054（確定）、C-1055（仮説）、C-1086（確定）
    - contents[0] skillCooldownDown: C-1055（仮説）、C-1086（確定）
  - notes[0] 補足: 魔術師のカードは、相手の S2 のクールタイムの周期（印 cooldown のある周期。イサベルの S2）にだけ効かせ、印の無い周期（説明文の発動間隔・召喚の攻撃）や、印を付けていない味方の周期は縮めない。フルバーストタイムが 10 秒の III では付かない（C-1054）ので、いまの編成で付く相手はイサベルだけ: 根拠なし
- **skill2**: supported
  - effects[0] state・fullBurstEnd・strength（attack）: C-1053（確定）、C-1054（確定）
  - effects[1] state・fullBurstEnd・death（burstCooldown・attack）: C-1053（確定）、C-1054（確定）
  - effects[2] timed・fullBurstEnd・attackDamage: C-1052（確定）
- **burst**: supported
  - effects[0] state・burstUse・wheelOfFortune（attackDamage）: C-1050（確定）、C-1054（確定）
  - effects[1] burstDamage・skill: C-1051（確定）
  - effects[2] state・burstUse・judgment（damageTaken）: C-1050（確定）

## 600 ミント

- **skill1**: supported
  - effects[0] state・fullChargeShot・singingEffect（attack）: C-1129（確定）
  - effects[1] state・fullChargeShot・dancingEffect: C-1135（仮説）
  - effects[2] heal・fullChargeShot: C-1135（仮説）
  - notes[0] 補足: ダンスエフェクトの持続回復（1 秒間隔）は、付いた時に 1 回だけ「回復効果が適用された時」を起こす（1 秒ごとの刻みでは起こさない。C-0578 と同じ読み）。満タンの味方にも付く。回復量はダメージに関係しない: C-1135（仮説）
- **skill2**: supported
  - effects[0] cancelState・burstStage3Enter: C-1130（確定）
  - effects[1] cancelState・burstStage3Enter: C-1130（確定）
  - effects[2] timed・burstStage3Enter・critRate: C-1131（確定）
  - effects[3] timed・burstStage3Enter・projectileExplosionDamage: C-1131（確定）
  - effects[4] timed・burstStage3Enter・pierceDamage（読む: 貫通）: C-1131（確定）
  - notes[0] 補足: 消去は次のフレームで閉じるので、ボーカルでシンガロングの無い 3 段階突入時には、消去と同じフレームの S2 の▲も出るとして回す（確かめていない）: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・assignedPartSinging: C-1128（確定）
  - effects[1] state・burstUse・assignedPartDancing: C-1128（確定）
  - effects[2] state・burstUse・singAlong（attackDamage・maxAmmo・critDamage）: C-1132（確定）
  - notes[0] 補足: 「条件に合うステージパートのみ適用」は、ボーカルとダンスを同じ切り替えの組（目録の group）にして書く。片方が付くと、もう片方は次のフレームで外れる（解除不可でも）: C-1128（確定）
  - notes[1] 補足: シンガロングの 3 つの項目の維持はどれも 10 秒なので、付与の維持は値 02 で持つ: C-1132（確定）

## 601 プリカ

- **skill1**: supported
  - effects[0] timed・fullChargeShot・projectileExplosionDamage: C-1126（確定）
  - effects[1] timed・fullChargeShot・pierceDamage（読む: 貫通）: C-1127（確定）
  - effects[2] timed・fullChargeShot・attack: C-1125（確定）
  - effects[3] passive・performance の間・pierce: C-1127（確定）
  - notes[0] 間接（HP）: パフォーマンスの間の自分の与える HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・singAlong が適用された時・encore: C-1133（確定）
  - effects[1] state・singAlong が適用された時・assignedPartSinging: C-1133（確定）
  - effects[2] stateExtend・singAlong が適用された時: C-1133（確定）
  - effects[3] timed・singAlong が適用された時・attackDamage: C-1134（仮説）
  - effects[4] cooldownReduction・singAlong が適用された時: C-1133（確定）
  - notes[0] 間接（HP）: フルバーストタイムが発動した時の自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 補足: アンコールのボーカルは、シンガロングを付けた枠（ミントのバースト）に付き、同じフレームにミントのバーストが付けるダンスより後とみなす（ボーカルが残る）: C-1133（確定）
- **burst**: supported
  - effects[0] state・burstUse・performance（chargeDamage）: C-1127（確定）
  - effects[1] heal・burstUse: C-1135（仮説）
  - notes[0] 補足: パフォーマンスの持続回復（1 秒間隔・解除不可）は、付いた時に 1 回だけ「回復効果が適用された時」を起こす（C-0578 と同じ読み）。アンコールの延長は回復の出来事を起こさない。持続回復とチャージダメージ▲の維持はどちらも 25 秒なので、付与の維持は値 06 で持つ。回復量はダメージに関係しない: C-1135（仮説）

## 811 A2

- **skill1**: partial
  - effects[0] timed・burstUse・chargeDamage: C-1102（確定）
  - notes[0] 未対応: バーストスキルを使用した時の爆発範囲▲は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: supported
  - effects[0] damage・fullChargeShot・additional: C-0407（仮説）
  - notes[0] 前提の外: パーツダメージ▲はパーツを扱わないので効かない: C-0443（範囲外）
- **burst**: supported
  - effects[0] state・burstUse・modeB（attack・chargeSpeed・fireStanceScale）: C-1100（確定）
    - contents[2] fireStanceScale: C-1155（仮説）
  - effects[1] currentHpDown・modeB の間 1 秒ごと（付いた時から）: C-1101（確定）

## 822 ラム

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstEnd: C-0080（確定）、C-0235（仮説）
  - notes[0] 計算に無関係: 通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない: C-0253（確定）、C-0367（確定）
- **skill2**: noEffect
  - notes[0] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-0253（確定）
  - notes[1] 間接（防御力）: 残りの HP が最も低い味方 2 機の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: C-0253（確定）
- **burst**: supported
  - effects[0] state・burstUse・barrier: C-0253（確定）、C-0557（確定）

## 830 アスカ

- **skill1**: supported
  - effects[0] timed・healed・attack: C-0464（確定）、C-0087（確定）
  - notes[0] 前提の外: 戦闘開始時のバリアに与えるダメージ▲は、射撃場の敵にバリアが無いのでダメージに関係しない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・coreDamage: C-0075（確定）、C-0613（確定）
  - effects[1] timed・fullBurstStart・elementDamage（読む: バリア）: C-0075（確定）、C-0557（確定）、C-0613（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0076（確定）、C-0514（仮説）、C-0612（確定）
  - effects[1] heal・burstUse: C-0464（確定）、C-0082（確定）
  - effects[2] timed・burstUse・hitRate: C-0076（確定）
  - effects[3] timed・burstUse・pierce: C-1096（確定）
  - notes[0] 補足: 命中率▲は、条件が自動の枠ではバースト中のコア命中率を 1 にする（N ≥ 1。持続の▲も常時の▲と同じ式で効かせる）。AR の弾丸命中率にも同じ式で効かせる（確かめたのは SMG だけ）。バーストゲージにも同じ N で効かせるが、▲の窓（10 秒）はフルバーストの窓に収まり、ゲージの溜まる時間と重ならない（きっかけの遅れは未測定で 0）: C-0037（確定）、C-0192（確定）、C-0011（確定）、C-0264（仮説）、C-0362（確定）、C-0363（仮説）

## 831 レイ

- **skill1**: supported
  - effects[0] timed・normalShot・elementDamage: C-1063（確定）
  - effects[1] damage・normalHit・skill: C-1066（確定）
  - notes[0] 補足: S1 の倍率ダメージがバーストゲージを溜めるかは確かめていない（溜めないとした。溜めても 1 回で射手の 2 ヒットぶん）。2 ヒット目の値は、そのヒットのフレームのバフで出す（発動の時点の値で出るかは、2 ヒットの間にバフの替わる回を読んでいないので確かめていない）: 根拠なし
- **skill2**: supported
  - effects[0] timed・burstStage3Enter・attack: C-1064（確定）
  - notes[0] 前提の外: 戦闘開始時のバリアに与えるダメージ▲は、射撃場の敵にバリアが無いのでダメージに関係しない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1067（確定）
  - effects[1] timed・burstUse・attackDamage: C-1065（確定）
  - notes[0] 間接（バリア）: 灼熱コードの味方全体へのバリア（最終最大HP の X%）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）

## 833 ミサト

- **skill1**: supported
  - effects[0] timed・normalShot・hitRate: C-0183（確定）、C-0184（仮説）
  - effects[1] heal・normalShot: C-0567（確定）、C-0180（確定）、C-0652（確定）、C-1116（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 射撃マニュアル状態の間の味方全体のバリアに与えるダメージ▲は、バリアの無い敵（射撃場の的）では効かない: C-0180（確定）
  - notes[1] 間接（HP）: 射撃マニュアルのフルスタック状態の間の自分の与えるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-0180（確定）
- **burst**: supported
  - effects[0] heal・burstUse: C-0646（仮説）、C-0180（確定）

## 836 鈴原サクラ

- **skill1**: supported
  - effects[0] timed・normalHit・damageTaken: C-0138（確定）、C-0152（確定）、C-0315（確定）、C-0367（確定）、C-0645（確定）
- **skill2**: noEffect
  - notes[0] 間接（HP）: 通常攻撃 60 回ごとの、残りの HP の割合が最も低い味方 2 機の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-0316（確定）、C-0321（確定）
  - notes[1] 計算に無関係: 通常攻撃 120 回ごとの、残りの HP の割合が最も低い味方 2 機の受けるダメージ▼は、防御系でダメージに関係しない: C-0316（確定）、C-0321（確定）
- **burst**: supported
  - effects[0] heal・burstUse: C-0590（確定）、C-0316（確定）

## 840 エイダ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0784（確定）
  - effects[1] timed・fullBurstStart・trueDamage: C-0784（確定）
  - effects[2] heal・fullBurstStart: 根拠なし
- **skill2**: supported
  - effects[0] damage・2 秒ごと・true: C-0787（確定）、C-0788（確定）、C-0783（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0785（確定）
  - effects[1] timed・burstUse・trueDamage: C-0785（確定）
  - effects[2] state・burstUse・specialModification（chargeSpeed・chargeDamage）: C-0786（確定）

## 841 ジル

- **skill1**: supported
  - effects[0] timed・battleStart・normalAttackDamage: C-0823（確定）
  - effects[1] timed・最大弾数のリロードが完了した時・normalAttackDamage: C-0823（確定）
  - effects[2] timed・burstUse・trueDamage: C-0825（確定）
- **skill2**: supported
  - effects[0] state・battleStart・acidRound: C-0824（確定）
  - effects[1] state・最大弾数のリロードが完了した時・acidRound: C-0824（確定）
  - effects[2] dot・normalShot: C-0824（確定）
  - effects[3] removeState・normalShot・acidRound: C-0824（確定）
  - effects[4] timed・fullBurstStart・attack: C-0825（確定）
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: C-0825（確定）
  - effects[1] ammoDecrease・burstUse: C-0825（確定）
  - effects[2] timed・burstUse・hitRate: C-0915（確定）
  - effects[3] timed・burstUse・attackDamage: C-0825（確定）
  - effects[4] timed・burstUse・trueDamageConversion: C-0825（確定）
  - notes[0] 計算に無関係: リロード速度の「増加状態で固定」（窓の間、ほかのリロード速度▲▼を無視する）は、どの編成でも値に効かない。リロードの時間は 時間 × max(0, 1 − Σ速度)（C-0013）で、この▲にほかのリロード速度▲を足しても足さなくても 1 フレームに満たない。固定と足し合わせが分かれるのはジルにリロード速度▼が付く時だけで、味方に▼を付けるキャラはいない（plan/design-skill-stage20.md 2.3 節）: 根拠なし

## 842 クレア

- **skill1**: supported
  - effects[0] heal・fullChargeShot: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（バリア）: バーストスキルを使用した時の、味方全体へのブルーハーブ（スキル発動者の最終最大HP の X% のバリア・10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: 根拠なし
  - effects[1] removeDebuff・burstUse・デバフ 1 個: C-0979（確定）、C-0988（仮説）

## 851 レイヴン

- **skill1**: supported
  - effects[0] dot・fullChargeShot: C-0181（確定）、C-0182（確定）、C-0111（確定）、C-0112（確定）、C-0661（確定）、C-0765（確定）
  - effects[1] timed・fullBurstStart・attack: C-0185（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 戦闘開始時とフルバーストタイム発動時の自分のパーツダメージ▲（急所攻略）は、射撃場の的にパーツが無いので効かない: C-0365（確定）
  - notes[1] 前提の外: 味方がパーツを破壊した時の、自分の持続ダメージ▲（一点集中）は、射撃場の的にパーツが無いので起きない: C-0365（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0185（確定）、C-0233（確定）、C-0234（確定）
  - effects[1] timed・burstUse・sustainedDamage: C-0332（確定）、C-0421（確定）
  - notes[0] 補足: A.N.モードの一点集中の解除は、一点集中（S2。パーツの破壊で付く）が射撃場の的では起きないので何もしない: C-0365（確定）

## 860 千束

- **skill1**: supported
  - effects[0] counterChange・battleStart・extrasensory: C-0797（確定）
  - effects[1] counterChange・2 秒ごと・extrasensory（減少）: C-0797（確定）
  - effects[2] passive・extrasensory 70 以上の間・attack: C-0797（確定）
  - effects[3] passive・extrasensory 55 以上の間・trueDamage: C-0797（確定）
  - effects[4] passive・extrasensory 25 以上の間・hitRate: C-0800（仮説）
  - notes[0] 計算に無関係: 超感覚 100% の時の射撃予測：無敵はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] timed・burstUse・trueDamageConversion: C-0799（確定）
  - effects[1] damage・normalHit・true: C-0814（確定）、C-0815（確定）
- **burst**: supported
  - effects[0] counterChange・burstUse・extrasensory: C-0797（確定）
  - effects[1] timed・burstUse・attack: C-0799（確定）

## 861 たきな

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0658（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0711（確定）
  - effects[2] timed・fullBurstStart・trueDamage: C-0710（確定）
- **skill2**: supported
  - effects[0] timed・15 秒ごと・damageTaken: C-0712（確定）、C-0418（確定）、C-0502（確定）
  - effects[1] timed・15 秒ごと・trueDamage: C-0712（確定）、C-0418（確定）、C-0502（確定）
  - notes[0] 計算に無関係: 敵全体の気絶はダメージに関係しない: C-0712（確定）
- **burst**: partial
  - effects[0] weaponChange・burstUse: C-0708（確定）
  - effects[1] timed・weaponChangeShot・damageTaken: C-0709（確定）、C-0312（確定）
  - notes[0] 補足: 射撃場の的で変更後の武器の発がコアに当たる割合は、的の表の行（coreHitRate.weaponChanges の 861:burst。帯ごとの値）で持つ: C-0713（仮説）
  - notes[1] 未対応: 変更後の武器の発が総ダメージに出ない回（V-0531。2 本とも 5 回目のバーストの替わり目の 430〜478f 後に 1 発）は未対応（モデルは弾丸命中率 1）: C-0708（確定）

## 862 クルミ

- **skill1**: supported
  - effects[0] dot・normalHit: C-0129（確定）、C-0130（確定）、C-0131（確定）、C-0133（確定）、C-0136（確定）、C-0196（確定）
  - effects[1] dot・burstUse: C-0136（確定）、C-0146（確定）、C-0147（確定）、C-0196（確定）
- **skill2**: supported
  - effects[0] damage・normalHit・additional: C-0276（確定）、C-0277（確定）、C-0833（確定）
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-0138（確定）、C-0152（確定）、C-0153（確定）、C-0494（確定）、C-0517（確定）

## 870 クイーン（真）

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0270（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0392（確定）
  - effects[2] state・battleStart・persona（elementDamage）: C-0354（確定）
    - contents[0] elementDamage: C-0296（確定）
  - effects[3] damage・burstUse・distributed: C-0310（確定）
  - effects[4] damage・followUp が適用された時・distributed: C-0429（確定）
  - notes[0] 間接（防御力）: 防御力▲（ペルソナ - ヨハンナ）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] passive・attackDamage: C-0018（確定）
  - effects[1] timed・burstStage3Enter・distributedDamage: C-0391（確定）
  - effects[2] timed・burstUse・elementDamage: C-0307（確定）、C-0522（仮説）
  - effects[3] state・burstUse・batonPass（attack）: C-0357（確定）、C-0555（確定）
  - notes[0] 間接（防御力）: 鉄・拳・制・裁！の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: C-0231（確定）
  - effects[1] timed・burstUse・attack: C-0308（確定）、C-0522（仮説）

## 871 雪子

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0347（確定）、C-0962（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0347（確定）
  - effects[2] damage・burstUse・distributed: C-0358（確定）、C-0428（確定）
  - effects[3] state・battleStart・persona: C-0354（確定）
  - effects[4] heal・3 秒ごと: C-0647（確定）
- **skill2**: supported
  - effects[0] passive・attackDamage: C-0348（確定）
  - effects[1] timed・burstUse・distributedDamage: C-0349（確定）
  - effects[2] timed・burstStage3Enter・elementDamage: C-0350（確定）、C-0360（確定）、C-0755（確定）
  - effects[3] state・burstUse・followUp（attack）: C-0355（確定）、C-0555（確定）
  - notes[0] 補足: 真紅の華の 3 秒ごとの味方全体の回復（メディラマ）は、S1 のメディア（skill1 の effects[4]）と同じフレームに起き、ほかのフレームには起きないので、別に定義しない（回復を受けた時の効果の発動は S1 の回復の定義で入る）: C-0648（確定）
  - notes[1] 計算に無関係: 真紅の守護（水冷コードの敵から受けるダメージ▼）はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: C-0351（確定）
  - effects[1] timed・burstUse・attack: C-0352（確定）、C-0614（確定）
