# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: `supported`（効果あり・未対応なし）・`partial`（効果あり・未対応あり）・`unsupported`（効果なし・未対応あり）・`noEffect`（前提の中でダメージに効く効果なし）。宝物を持つキャラで宝物版の定義が無いスロットは、計算と同じく `unsupported`（画面のキャラの選択肢の「（未）」も同じ判定。`data/skills/support.json`）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足・間接（それ自体は与ダメージを変えず、経路（HP・防御力・バリアなど）を読む効果のある編成でだけ効く。括弧は経路。[design-indirect-notes.md](design-indirect-notes.md)）。「読む:」は、その経路を読む効果・notes の印。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 64・効果 380（根拠あり 360）・notes 169（根拠あり 77）

notes の種類: 未対応 41・前提の外 32・計算に無関係 33・補足 13・間接 50

スロット: supported 143・partial 13・unsupported 17・noEffect 34

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

## 16 ラピ：レッドフード

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-0715（確定）
  - effects[1] burstStepChange: C-0729（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-0730（確定）
  - effects[3] timed・fullBurstStart・attackDamage: C-0731（確定）
  - notes[0] 前提の外: 阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: partial
  - effects[0] shotPause・normalShot: C-0717（確定）、C-0718（確定）
  - effects[1] passive・projectileStickDamage: C-0724（確定）
  - effects[2] passive・projectileExplosionDamage: C-0725（確定）
  - effects[3] damage・normalShot・skill: C-0724（確定）
  - effects[4] damage・normalShot・skill: C-0726（確定）、C-0725（確定）
  - effects[5] counterChange・normalShot・stickyGrenade: C-0726（確定）
  - effects[6] damage・fullBurstStart・skill: C-0726（確定）、C-0725（確定）
  - effects[7] counterChange・fullBurstStart・stickyGrenade（減少）: C-0726（確定）
  - effects[8] passive・elementAdvantage: C-0723（確定）
  - notes[0] 未対応: 粘着榴弾の付着のヒットでバーストゲージが溜まる（単騎の録画 0733・0734。観測値 0733-08・0734-08）のは未対応。量は射手の 1 ヒットぶん（target_burst_energy_pershot）より大きく、会心の付着でも増えない（付着のダメージに比例しない。0733-06）。説明文にもデータにも値が無く、出どころが分からない（plan/design-skill-stage12-leftovers.md 2 節）: 根拠なし
- **burst**: supported
  - effects[0] damage・burstUse・additional: C-0716（確定）
  - effects[1] timed・burstUse・projectileStickDamage: C-0724（確定）
  - effects[2] cycleEvery・burstUse: C-0727（確定）
  - effects[3] cooldownReduction・burstUse: C-0732（確定）
  - effects[4] timed・burstUse・attack: C-0733（確定）
  - notes[0] 前提の外: 爆発範囲▲（I・III の行とも 10 秒）は、敵 1 体では複数の敵へのヒットを増やすだけで起きない。射撃場の的では、窓の中と外で粘着榴弾の爆発の 1 ヒットの値・コア・数が変わらない: C-0759（確定）

## 17 アニス：スター

- **skill1**: partial
  - effects[0] passive・burstGaugeSpeed: C-0198（確定）、C-0244（確定）
  - effects[1] state・battleStart・myOwnStar（attack）: C-0189（確定）、C-0203（確定）、C-0555（確定）
  - effects[2] cooldownReduction・battleStart: C-0202（確定）、C-0203（確定）、C-0555（確定）
  - effects[3] cooldownReduction・fullBurstEnd: C-0202（確定）、C-0203（確定）、C-0555（確定）
  - effects[4] damage・fullChargeShot・additional: C-0190（確定）、C-0198（確定）、C-0413（確定）、C-0461（確定）
  - effects[5] burstReentry: C-0201（確定）、C-0203（確定）、C-0555（確定）
  - effects[6] state・battleStart・everyonesStar: C-0201（確定）、C-0203（確定）、C-0555（確定）
  - effects[7] allyGaugeAdd: C-0244（確定）、C-0245（確定）、C-0246（確定）、C-0620（確定）、C-0627（確定）
  - notes[0] 未対応: 誘導弾の飛ぶ時間（ゲージが着弾で溜まる分）は、射撃場の的の距離帯ごとの代表値だけ。的の表の無い敵では 0（発射のフレームに溜まる）。着地点ごとの値、ダメージを置くフレームとバフの判定を着弾の時刻にすること（発動に重なる発の追加ダメージだけにバーストの攻撃ダメージ▲が乗る分）は未実装（plan/design-anis-star-gauge-timing.md 3 節）: C-0413（確定）、C-0461（確定）
  - notes[1] 補足: 部隊構成による効果の「みんなの星消去」「私だけの星消去」と、フルバーストタイム終了時の付け直しは書かない。編成で決まる入れ替えで、戦闘中は片方しか付かず、付け直しは持続の状態を延ばすだけなので、値は変わらない（plan/design-skill-stage1.md 2.1 節）: C-0189（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attack: C-0204（確定）、C-0203（確定）、C-0555（確定）
  - effects[1] timed・fullBurstStart・projectileExplosionDamage（読む: 防御力）: C-0205（確定）、C-0587（確定）、C-0588（確定）
  - effects[2] timed・fullBurstStart・attackDamage: C-0204（確定）
  - effects[3] heal・fullChargeShot: C-0576（確定）
- **burst**: partial
  - effects[0] autoAttack・burstUse: C-0211（確定）、C-0213（確定）、C-0207（確定）、C-0504（確定）、C-0297（確定）、C-0466（確定）、C-0521（仮説）、C-0594（確定）
  - effects[1] timed・burstUse・fixedChargeTime: C-0214（確定）、C-0520（仮説）
  - effects[2] timed・burstUse・attackDamage: C-0209（確定）、C-0203（確定）、C-0555（確定）、C-0520（仮説）
  - effects[3] state・burstUse・shootingStar: C-0211（確定）
  - effects[4] timed・burstUse・defense: C-0587（確定）
  - notes[0] 未対応: シューティングスターのコアに当たる割合は射撃場の的でしか測っていない。的の表に行の無い敵では、モデルのシューティングスターはコアに当たらない（plan/design-anis-star-core-path.md 3.2 節）: C-0466（確定）
  - notes[1] 補足: コアダメージ▲（味方の効果）は、シューティングスターのコアにも通常攻撃と同じ形で乗る（コアの項 +1 に足す。乗るかはヒットの時点で付いているかで決まる）: C-0594（確定）
  - notes[2] 未対応: 爆発範囲▲がバーストの窓の通常攻撃のコアに当たる割合を変えるか（窓の中も外も同じ表の行でコアに当たる。C-0424。単騎の録画 0320・0321 で同じ遠の区間の窓の中と外を比べても差は見分けられず、遠の割合は録画どうしで食い違う（C-0425。V-0297）。0.1〜0.2 程度の差は否定できない。plan/design-anis-star-core-path.md 11 節）: C-0424（確定）、C-0425（仮説）
  - notes[3] 間接（HP）: みんなの星のときの味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 18 ネオン：ビジョン・アイ

- **skill1**: supported
  - effects[0] damage・fullChargeShot・additional: C-0410（確定）
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

## 60 ベロータ

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージ攻撃時の自分の爆発範囲▲（5 秒）は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 4 機以上に同時に命中した時の防御力▼と追加ダメージは、敵 1 体では起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0676（確定）、C-0677（確定）
  - effects[1] timed・burstUse・chargeSpeed: C-0678（確定）

## 82 リター

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-0460（確定）
  - effects[3] timed・burstUse・maxAmmo: C-0468（確定）
  - effects[4] timed・burstUse・critDamage: C-0468（確定）、C-0493（確定）
  - effects[5] timed・burstUse・attack: C-0468（確定）、C-0493（確定）
- **skill2**: noEffect
  - notes[0] 間接（遮蔽物）: 遮蔽物の HP 回復は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
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
  - effects[0] timed・burstUse・attack: C-0337（確定）、C-0497（確定）
  - effects[1] timed・burstUse・damageTaken: C-0335（確定）、C-0336（仮説）、C-0379（仮説）、C-0619（仮説）
  - notes[0] 間接（HP）: 味方全体の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

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
  - effects[0] timed・weaponChangeShot・damageTaken: C-0312（確定）、C-0138（確定）
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
  - effects[2] weaponChange・warmUp のフルスタック: C-0699（確定）
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
  - notes[0] 間接（HP）: 最大HP のみ▲ で HP の割合が下がる分（現在の HP は増えない）は、それ自体は与ダメージを変えない（HP の割合を読む効果のある編成でだけ効く）。モデルは HP の割合を読む効果（自分の HP の割合の条件・HP の割合の低い味方を対象にする効果）に、枠の HP の割合の想定のまま渡す（下がる分は未実装）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0682（確定）
  - effects[1] burstDamage・skill: C-0682（確定）、C-0683（確定）
  - effects[2] damage・burstUse・additional: C-0707（確定）

## 121 エヌ : ミラクルフェアリー

- **skill1**: supported
  - effects[0] heal・normalShot: C-0598（仮説）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の敵全体の受けるHP回復量▼はダメージに関係しない（バーストゲージも溜めない。C-0431）: 根拠なし
  - notes[1] 間接（HP）: 自分の HP が 90% 以上の時の味方全体の受けるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-0618（確定）、C-0617（仮説）
  - effects[1] timed・burstUse・attack: C-0595（確定）、C-0596（確定）
  - notes[0] 前提の外: 戦闘不能の火力型の味方の復活は、味方が倒れないので起きない（要件 5.2 節）: C-0443（範囲外）

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
  - effects[0] timed・lastShot・critDamage: 根拠なし
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
  - effects[1] stackChange・normalHit・ensnaringChains: C-0754（確定）、C-0751（仮説）
  - notes[0] 前提の外: 自分が戦闘不能になった時のスタック量▲と、敵が破壊された時のキャプチャーチェーン▲は、前提（味方が倒れない・敵 1 体）の外（要件 5.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] dot・burstUse: C-0746（確定）
  - effects[1] cancelState・burstUse: C-0746（確定）

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
- **skill2**: noEffect
  - notes[0] 間接（貫通）: 貫通特化は、それ自体は与ダメージを変えない（貫通ダメージ▲のある編成でだけ効く。敵 1 体に乗るかは確かめていない）: C-0443（範囲外）
  - notes[1] 前提の外: HP 80% 未満のときの回復は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・chargeSpeed: C-0475（確定）
  - effects[1] timed・burstUse・attack: C-0475（確定）、C-0523（確定）

## 192 トーブ

- **skill1**: unsupported
  - notes[0] 未対応: 攻撃した時の確率で自分に付く代用弾丸（弾丸チャージ）は未対応（確率のきっかけの即時効果と付与は書けない）: 根拠なし
  - notes[1] 未対応: 代用弾丸が適用される時の、味方全体の応急改造（最大装弾数▲・3 スタック・5 秒）は未対応（代用弾丸が確率のきっかけで付くため）: 根拠なし
  - notes[2] 未対応: 代用弾丸が適用される時の、味方全体のクリティカルダメージ▲（5 秒）は未対応（代用弾丸が確率のきっかけで付くため）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 自分が応急改造のフルスタック状態の時のみの、味方全体のクリティカル確率▲（持続）は未対応（基礎版の応急改造は S1 の代用弾丸（攻撃した時の確率）から付き、確率のきっかけの付与は書けないので、モデルでは付かない。形は宝物版と同じ while で書ける。plan/design-skill-stage9.md 論点 7）: 根拠なし
  - notes[1] 未対応: 自分が応急改造のフルスタック状態の時のみの、ショットガンを所持する味方全体の攻撃速度▲（持続）は未対応（基礎版の応急改造は S1 の代用弾丸（攻撃した時の確率）から付き、確率のきっかけの付与は書けないので、モデルでは付かない。形は宝物版と同じ while で書ける。plan/design-skill-stage9.md 論点 7）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 味方全体の、スキル発動者基準の攻撃力▲（応急改造スタックコピー・10 秒）は未対応（スタック数で決まる値）: 根拠なし
  - notes[1] 未対応: ショットガンを所持する味方全体の、スキル発動者基準の攻撃力▲（応急改造スタックコピー・10 秒）は未対応（スタック数で決まる値）: 根拠なし
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
  - effects[1] damage・normalHit・additional: C-0163（確定）、C-0257（仮説）、C-0251（確定）
  - effects[2] ammoRefill・normalHit: C-0257（仮説）、C-0251（確定）、C-0256（確定）
- **skill2**: supported
  - effects[0] damage・coreHit・additional: C-0249（仮説）、C-0251（確定）
  - effects[1] timed・fullBurstStart・critRate: C-0249（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0250（仮説）、C-0252（確定）、C-0510（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-0250（仮説）、C-0252（確定）

## 225 紅蓮：ブラックシャドウ

- **skill1**: supported
  - effects[0] cycle・fullChargeShot: C-0047（確定）、C-0085（確定）、C-0651（確定）、C-0661（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・maxAmmo: C-0490（確定）
  - effects[1] ammoRefill・fullBurstStart: C-0490（確定）
- **burst**: supported
  - effects[0] cycleEvery・burstUse: C-0492（確定）
  - effects[1] timed・burstUse・attack: C-0491（確定）、C-0524（仮説）
  - effects[2] timed・burstUse・chargeDamage: C-0491（確定）

## 226 ラプンツェル：ピュアグレイス

- **skill1**: unsupported
  - notes[0] 間接（バリア）: 戦闘開始時とバースト使用時の共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
  - notes[1] 未対応（読む: バリア）: フルチャージ状態を 1 秒以上維持した時、自分がバリア適用状態なら味方全体の攻撃ダメージ▲（持続）は未対応（きっかけ「フルチャージ状態を 1 秒以上維持した時」が語彙に無い。バリア適用状態の条件は書ける）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時の自分の HP 回復は、ダメージに関係しない（自分にだけ付き、ラプンツェル：ピュアグレイスに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
  - notes[1] 間接（HP）: バリア適用状態の時の自分の現在のHP▼は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[2] 計算に無関係: バリア適用状態の時のバリアHP回復はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0685（確定）
  - notes[0] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 231 イサベル

- **skill1**: supported
  - effects[0] timed・burstUse・critRate: C-0160（確定）
  - effects[1] timed・burstUse・critDamage: C-0160（確定）
  - effects[2] timed・burstUse・attack: C-0160（確定）
- **skill2**: supported
  - effects[0] damage・15 秒ごと・skill: C-0402（確定）、C-0102（確定）、C-0453（確定）
  - effects[1] burstGaugeHit・15 秒ごと: C-0404（仮説）、C-0402（確定）、C-0453（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0160（確定）、C-0165（確定）
  - effects[1] timed・burstUse・damageTaken: C-0160（確定）、C-0161（確定）、C-0162（確定）、C-0165（確定）、C-0153（確定）
  - effects[2] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - effects[3] damage・burstUse・additional: C-0160（確定）、C-0163（確定）、C-0165（確定）
  - notes[0] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

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

- **skill1**: noEffect
  - notes[0] 間接（貫通）: フルチャージ攻撃時の貫通特化は、それ自体は与ダメージを変えない（貫通ダメージ▲のある編成でだけ効く。敵 1 体に乗るかは確かめていない）: C-0088（確定）
  - notes[1] 前提の外: 2 機以上に同時に命中した時の追加ダメージは、敵 1 体では起きない: C-0088（確定）
  - notes[2] 前提の外: フルチャージ攻撃時の貫通範囲の拡張は、敵 1 体ではダメージに関係しない: C-0088（確定）
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
  - effects[0] passive・attack（読む: HP）: C-0020（確定）
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
- **skill2**: partial
  - effects[0] damage・13 秒ごと・skill: C-0405（確定）、C-0102（確定）、C-0453（確定）
  - effects[1] burstGaugeHit・13 秒ごと: C-0409（仮説）、C-0405（確定）、C-0453（確定）
  - notes[0] 未対応: フルバーストタイム持続中に発動した時の、同じ敵への防御力▼は未対応（語彙と効きの確かめが要るため）: 根拠なし
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
  - effects[0] heal・lastShot: C-0591（確定）、C-0254（確定）、C-0650（仮説）
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
  - notes[0] 未対応: 最終攻撃力が最も高い敵 2 機への防御力▼（5 秒）は未対応: 根拠なし

## 308 I-DOLL・サン

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 通常攻撃が 10 回命中した時の自分の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: C-0275（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時（確率）の自分の攻撃力▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: C-0275（確定）
- **burst**: supported
  - effects[0] timed・burstUse・maxAmmo: C-0364（確定）、C-0616（確定）、C-0017（確定）、C-0275（確定）

## 311 ココア

- **skill1**: noEffect
  - notes[0] 間接（遮蔽物）: 味方全体の遮蔽物 HP 回復は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: C-0092（確定）
  - notes[1] 計算に無関係: デバフのかかった味方のデバフ解除はダメージに関係しない: C-0092（確定）
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルチャージ攻撃時に自分に付くプロケチャップ（受けるダメージ▼）は、ダメージに関係しない: C-0092（確定）
- **burst**: noEffect
  - notes[0] 計算に無関係: 味方全体のデバフ解除と、プロケチャップがフルスタックのときの敵全体の攻撃力▼は、ダメージに関係しない: C-0092（確定）

## 313 プリバティ：アンカインド・メイド

- **skill1**: supported
  - effects[0] damage・pelletHit・skill: C-0408（確定）、C-0659（確定）
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
  - notes[0] 未対応: フルバーストタイム中の通常攻撃 3 回ごとの、自分と自分を除く最終攻撃力が最も高い味方 1 機への攻撃ダメージ▲（2 秒）は未対応: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: バースト 3 段階突入時の、ゴールデンチップのスタック量別のフルバーストタイムの持続時間▲は未対応: 根拠なし
  - notes[1] 未対応: フルバーストタイム中の通常攻撃ごとの、時間延長状態別のダメージは未対応: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0572（確定）、C-0581（確定）、C-0582（確定）、C-0615（確定）
  - effects[1] timed・burstUse・hitRate: C-0573（確定）
  - effects[2] timed・burstUse・attack: C-0573（確定）、C-0582（確定）
  - effects[3] stackChange・burstUse・goldenChip（減少）: C-0573（確定）、C-0574（確定）

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

## 450 ナガ

- **skill1**: supported
  - effects[0] timed・barrier が適用された時・coreDamage（読む: バリア）: C-0671（確定）
  - notes[0] 間接（遮蔽物）: 通常攻撃 12 回ごとの味方全体の遮蔽物 HP 回復は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] timed・normalShot・coreDamage: C-0592（確定）、C-0593（確定）、C-0653（確定）
  - effects[1] heal・normalShot: C-0673（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0672（確定）
  - effects[1] timed・burstUse・attack（読む: バリア）: C-0672（確定）
  - notes[0] 間接（貫通）: 自分の貫通特化（10 秒）は、それ自体は与ダメージを変えない（貫通ダメージ▲のある編成でだけ効く）: 根拠なし

## 471 スノーホワイト：ヘビーアームズ

- **skill1**: supported
  - effects[0] state・チャージ中の 0.2 秒ごと・autoFireReady: C-0757（確定）
  - effects[1] removeState・normalShot・autoFireReady: C-0757（確定）
  - effects[2] timed・チャージ中の 0.2 秒ごと・damageTaken: C-0758（確定）
  - effects[3] damage・fullChargeShot・skill: C-0757（確定）、C-0426（確定）
  - effects[4] damage・fullChargeShot・skill: C-0757（確定）、C-0426（確定）、C-0761（確定）
  - effects[5] stackChange・fullChargeShot・sevenDwarvesFullyActive（減少）: C-0760（確定）
  - effects[6] removeState・normalShot・sevenDwarvesFullyActive: 根拠なし
  - notes[0] 間接（防御力）: オートファイア準備の中身の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く。装填数は effects[0]）: 根拠なし
- **skill2**: supported
  - effects[0] timed・battleStart・fixedChargeTime: 根拠なし
  - effects[1] timed・フルチャージした時・attack: C-0758（確定）
  - effects[2] timed・burstStage3Enter・attack: C-0762（確定）
  - effects[3] timed・フルチャージした時・chargeDamage: C-0760（確定）
  - effects[4] timed・フルチャージした時・sequentialAttackDamage: C-0760（確定）
  - notes[0] 間接（貫通）: フルチャージした時の貫通特化は、それ自体は与ダメージを変えない（貫通ダメージ▲のある編成でだけ効く。敵 1 体に乗るかは確かめていない）: C-0443（範囲外）
  - notes[1] 前提の外: フルチャージした時のパーツダメージ▲は、パーツの無い射撃場の的ではダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0762（確定）
  - effects[1] state・burstUse・sevenDwarvesFullyActive（fixedChargeTime・maxStacksUp）: C-0760（確定）
  - notes[0] 前提の外: 破壊可能な発射体全体へのダメージは、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）

## 472 紅蓮：神殺

- **skill1**: supported
  - effects[0] state・battleStart・intoTheFraySereneMind: 根拠なし
  - effects[1] timed・battleStart・normalCritRate: 根拠なし
  - effects[2] damage・normalShot・additional: 根拠なし
  - effects[3] damage・normalShot・additional: 根拠なし
  - effects[4] timed・fullBurstStart・critDamage: 根拠なし
  - notes[0] 間接（貫通）: 臨戦：明鏡止水の貫通特化は、それ自体は与ダメージを変えない（貫通を読む効果のある編成でだけ効く）: C-0443（範囲外）
  - notes[1] 前提の外: 通常攻撃が広範囲の攻撃になることは、敵 1 体の前提では的の数を変えない（要件 5.2 節）。射撃場の的でコアに当たる割合が変わるかは録画で読む: C-0443（範囲外）
- **skill2**: supported
  - effects[0] ammoRefill・critHit: 根拠なし
  - effects[1] state・burstUse・intoTheFrayAtOneWithTheSword（normalCritRate・attackDamage）: 根拠なし
- **burst**: supported
  - effects[0] weaponChange・burstUse: 根拠なし
  - effects[1] timed・burstUse・attack: 根拠なし
  - effects[2] damage・burstUse・additional: 根拠なし
  - notes[0] 前提の外: 通常攻撃の範囲 100%▲ は、敵 1 体の前提では的の数を変えない（要件 5.2 節）: C-0443（範囲外）

## 473 ラプンツェル：サンクチュアリ

- **skill1**: partial
  - effects[0] heal・fullChargeShot: 根拠なし
  - effects[1] timed・fullBurstStart・attackDamage: C-0719（確定）、C-0750（確定）
  - notes[0] 前提の外: ナノ粒子投与（バーストの、戦闘不能の味方が 3 機以上の分岐）を使用した時の、バーストスキルのクールタイム▲とナノ粒子消耗：防御力▲は、味方が倒れない前提では起きない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: フルチャージした時からの、自分へのチャージ速度▲▼の無効（持続）は未対応（効果の無効の語彙が無い。自分にチャージ速度▲▼を付ける味方のいる編成でだけ効く。plan/design-new-chars-1029.md 論点 F）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attack: C-0719（確定）、C-0750（確定）
  - effects[1] damage・fullChargeShot・additional: C-0720（確定）、C-0721（確定）
  - notes[0] 間接（バリア）: フルチャージ状態を 1 秒以上維持した時の自分への共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。きっかけ「フルチャージ状態を N 秒以上維持した時」は語彙に無い）: 根拠なし
  - notes[1] 間接（防御力）: フルチャージ状態を 1 秒以上維持した時の味方全体のゴッデスブレッシング（発動者基準の防御力▲）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く。きっかけは上と同じく語彙に無い）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-0722（確定）
  - notes[0] 前提の外: 戦闘不能状態の味方が 3 機以上の分岐（ナノ粒子投与の復活と、発動者基準の攻撃力▲・防御力▲。戦闘中 1 回）は、味方が倒れない前提では起きない（要件 5.2 節）: C-0443（範囲外）

## 500 エレグ

- **skill1**: unsupported
  - notes[0] 前提の外: 戦闘開始時の、敵の発射体を攻撃する時の発射体に与えるダメージ▲は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
  - notes[1] 未対応: 通常攻撃 100 回命中ごとの、ブームインストール状態の対象と周囲の敵への分配ダメージは未対応。命中は戦闘中ずっと通算で数え、100 の倍数に届いた命中の時に敵がブームインストール状態なら起き、届いた発の 8f 後から同じ値の 3 ヒット（頭・+24f・+36f）で出る（V-0524）。1 ヒットの値は、説明文の値の全額・3 分の 1・それぞれ全額のどの形とも合わない（式が分からない）: C-0697（確定）
- **skill2**: supported
  - effects[0] burstGauge・battleStart: C-0662（確定）
  - effects[1] timed・normalHit・attack: C-0696（確定）、C-0697（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0689（確定）
  - effects[1] state・burstHit・boomInstall（enemyDefenseDown）: C-0690（確定）
  - effects[2] timed・burstUse・distributedDamage: C-0691（確定）

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

## 811 A2

- **skill1**: partial
  - effects[0] timed・burstUse・chargeDamage: 根拠なし
  - notes[0] 未対応: バーストスキルを使用した時の爆発範囲▲は未対応（爆発範囲はダメージの式に無い。コアに当たる割合への効きは確かめていない）: 根拠なし
- **skill2**: supported
  - effects[0] damage・fullChargeShot・additional: C-0407（仮説）
  - notes[0] 前提の外: パーツダメージ▲はパーツを扱わないので効かない: C-0443（範囲外）
- **burst**: unsupported
  - notes[0] 未対応（読む: HP）: B モード（1 秒ごとに現在の HP▼、攻撃力▲・チャージ速度▲。HP 40% 以下で解除）は未対応（HP を持たないので解除の時刻が決まらない）: 根拠なし

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
  - notes[0] 間接（貫通）: 貫通特化は、それ自体は与ダメージを変えない（貫通ダメージ▲のある編成でだけ効く。敵 1 体に乗るかは確かめていない）: C-0076（確定）
  - notes[1] 補足: 命中率▲は、条件が自動の枠ではバースト中のコア命中率を 1 にする（N ≥ 1。持続の▲も常時の▲と同じ式で効かせる）。AR の弾丸命中率にも同じ式で効かせる（確かめたのは SMG だけ）。バーストゲージにも同じ N で効かせるが、▲の窓（10 秒）はフルバーストの窓に収まり、ゲージの溜まる時間と重ならない（きっかけの遅れは未測定で 0）: C-0037（確定）、C-0192（確定）、C-0011（確定）、C-0264（仮説）、C-0362（確定）、C-0363（仮説）

## 833 ミサト

- **skill1**: supported
  - effects[0] timed・normalShot・hitRate: C-0183（確定）、C-0184（仮説）
  - effects[1] heal・normalShot: C-0567（確定）、C-0180（確定）、C-0652（確定）
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

## 851 レイヴン

- **skill1**: supported
  - effects[0] dot・fullChargeShot: C-0181（確定）、C-0182（確定）、C-0111（確定）、C-0112（確定）、C-0661（確定）
  - effects[1] timed・fullBurstStart・attack: C-0185（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: 戦闘開始時とフルバーストタイム発動時の自分のパーツダメージ▲（急所攻略）は、射撃場の的にパーツが無いので効かない: C-0365（確定）
  - notes[1] 前提の外: 味方がパーツを破壊した時の、自分の持続ダメージ▲（一点集中）は、射撃場の的にパーツが無いので起きない: C-0365（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0185（確定）、C-0233（確定）、C-0234（確定）
  - effects[1] timed・burstUse・sustainedDamage: C-0332（確定）、C-0421（確定）
  - notes[0] 補足: A.N.モードの一点集中の解除は、一点集中（S2。パーツの破壊で付く）が射撃場の的では起きないので何もしない: C-0365（確定）

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
  - effects[0] damage・normalHit・additional: C-0276（確定）、C-0277（確定）
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-0138（確定）、C-0152（確定）、C-0153（確定）、C-0494（確定）、C-0517（確定）

## 870 クイーン（真）

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-0270（確定）
  - effects[1] timed・fullBurstEnd・attack: C-0392（確定）
  - effects[2] state・battleStart・persona（elementDamage）: C-0354（確定）
    - contents[0] elementDamage: C-0296（確定）
  - effects[3] damage・burstUse・distributed: C-0310（確定）
  - effects[4] damage・followUp が適用された時・distributed: C-0429（仮説）
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
  - effects[0] timed・battleStart・attack: C-0347（確定）
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
