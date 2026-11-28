# スキル定義の対応状況

- **このファイルは生成する（手で書かない）**。定義は `packages/core/data/skills/{resourceId}.json` に置き、`npm run records:check` で作り直す（[skills-guide.md](skills-guide.md) 3 節）。
- キャラ × スロットごとに、対応状況と、効果・notes と、その根拠の結論（定義の `claims`。後ろの括弧は結論の状態）を並べる。結論の中身は [claims.md](claims.md)。
- 対応状況は効果と notes の種類から決まる（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）: `supported`（効果あり・未対応なし）・`partial`（効果あり・未対応あり）・`unsupported`（効果なし・未対応あり）・`noEffect`（前提の中でダメージに効く効果なし）。宝物を持つキャラで宝物版の定義が無いスロットは、計算と同じく `unsupported`（画面のキャラの選択肢の「（未）」も同じ判定。`data/skills/support.json`）。
- notes の種類（同 2.1 節）: 未対応（前提の中でダメージに効くのに定義していない）・前提の外（静止単体ボス・被弾なしなどの前提では起きない）・計算に無関係・補足・間接（それ自体は与ダメージを変えず、経路（HP・防御力・バリアなど）を読む効果のある編成でだけ効く。括弧は経路。[design-indirect-notes.md](design-indirect-notes.md)）。「読む:」は、その経路を読む効果・notes の印。
- 「根拠なし」は、まだ結論に結び付けていない効果・notes。Stage 11 までの定義は、最小構成の録画の読み直しか新しい撮影で結論を作ったときに結び付ける（凍結の記録からは写さない。[skills-guide.md](skills-guide.md) 0 節）。

件数: キャラ 203・効果 1330（根拠あり 1308）・notes 485（根拠あり 186）

notes の種類: 未対応 45・前提の外 168・計算に無関係 104・補足 45・間接 123

スロット: supported 547・partial 17・unsupported 18・noEffect 90

## 10 ラピ

- **skill1**: noEffect
  - notes[0] 前提の外: 被弾 N 回で自分に攻撃力▲（維持型）は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] damage・20 秒ごと・skill: C-0403（確定）、C-0102（確定）、C-0453（確定）、C-1509（確定）
  - effects[1] burstGaugeHit・20 秒ごと: C-0409（仮説）、C-0403（確定）、C-0453（確定）
  - notes[0] 計算に無関係: 挑発はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-0227（確定）
  - effects[1] timed・burstUse・attack: C-0457（確定）、C-0469（確定）、C-0513（仮説）、C-0611（確定）

## 11 ネオン

- **skill1**: noEffect
  - notes[0] 前提の外: 敵を倒した時の、最終攻撃力が最も高い味方 2 機へのクリティカル確率▲（5 秒）は、射撃場の的が倒れないので起きない（敵 1 体の前提。要件 4.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・critRate: C-1522（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1520（確定）
  - effects[1] timed・burstUse・maxAmmo: C-1521（確定）

## 12 アニス

- **skill1**: noEffect
  - notes[0] 前提の外: 40 回攻撃を受けた時の、自分の防御力▲（10 秒）は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは的の攻撃で数えられうる（C-0551）: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（防御力）: 自分と、自分を除く最終攻撃力が最も高い味方 2 機への防御力▲（5 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く。説明文にきっかけが無く、この付与は定義していない）: 根拠なし
  - notes[1] 計算に無関係: 自分と、自分を除く最終攻撃力が最も高い味方 2 機への受けるダメージ均等分配（10 秒）は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1615（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1617（確定）

## 14 ネオン：ブルーオーシャン

- **skill1**: noEffect
  - notes[0] 前提の外: バーストスキルを使用した時の開始回数別のパーツダメージ▲（1〜3 回目の段）は、射撃場の的にパーツが無いので効かない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・burstStage3Enter・elementDamage: C-1409（確定）
  - effects[1] timed・burstStage3Enter・elementDamage: C-1409（確定）
  - effects[2] timed・burstStage3Enter・elementDamage: C-1409（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1411（確定）、C-1413（仮説）、C-1414（仮説）
  - effects[1] damage・weaponChangeShot・additional: C-1412（確定）

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
  - effects[7] allyGaugeAdd: C-0244（確定）、C-0245（確定）、C-0246（確定）、C-0620（確定）、C-0627（確定）、C-0998（確定）、C-1186（確定）
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
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-0665（確定）
  - effects[1] state・burstUse・firepowerCharge: C-0667（確定）
  - effects[2] counterChange・burstUse・firepowerGauge: C-0667（確定）
  - effects[3] state・burstUse・superFirepower（attackDamage）: C-0667（確定）、C-0665（確定）
  - effects[4] counterChange・burstUse・firepowerGauge（減少）: C-0667（確定）

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

## 22 シグナル

- **skill1**: supported
  - effects[0] timed・normalHit・enemyDefenseDown: C-1404（確定）
  - notes[0] 計算に無関係: 通常攻撃で 60 回命中した時の対象の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: フルバーストタイムが発動した時の自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、シグナルに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1402（確定）
  - effects[1] timed・burstHit・enemyDefenseDown: C-1403（確定）、C-1405（確定）

## 23 デルタ：ニンジャシーフ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・damageTaken: C-1580（確定）
  - effects[1] timed・burstUse・attack: C-1580（確定）
  - effects[2] timed・burstUse・damageTaken: C-1580（確定）
- **skill2**: unsupported
  - notes[0] 計算に無関係: 戦闘開始時、味方に自分を除く防御型がいない場合の、自分へのヘイト（敵全体を挑発・持続）はダメージに関係しない（付けた時にゲージを溜めない。ティアの S2 と同じ形）: C-1583（確定）
  - notes[1] 間接（バリア）: 戦闘開始時、味方に自分を除く防御型がいない場合の自分へのバリア（10 秒）と、通常攻撃で 200 回攻撃した時、ヘイト状態なら自分に付くバリア（10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは自分がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: 根拠なし
  - notes[2] 前提の外: 味方に自分を除く防御型がいる場合の忍法カモフラージュ（単一攻撃対象から除外・直接攻撃を受けると解除）は、被弾しない前提では除外も解除も起きない（10 秒続く）: 根拠なし
  - notes[3] 未対応: 味方に自分を除く防御型がいる場合の、忍法注射器（自分の吸収回復）と、4 秒ごとに注射器状態なら自分に付く忍法救急キット（4 秒の間に受けた回復を蓄積し、終わった後に味方全体を蓄積量に応じて回復）は定義していない。蓄積した回復を放出する語彙が無い。味方全体の回復は、回復を受けた時の効果を持つ味方の発動を変えうる: 根拠なし
- **burst**: partial
  - effects[0] timed・burstUse・distributedDamage: C-1581（確定）
  - effects[1] timed・burstUse・attack: C-1581（確定）
  - effects[2] burstDamage・distributed: C-1582（確定）
  - notes[0] 間接（バリア）: ヘイト状態の時の、自分の次のバリアの HP▲（10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 未対応: 忍法注射器状態の時の、忍法救急キットの最大蓄積量▲（10 秒）は、S2 の救急キット（未対応）の回復の量だけを変える: 根拠なし

## 30 ポリ

- **skill1**: supported
  - effects[0] timed・normalShot・attack: C-1211（確定）
- **skill2**: noEffect
  - notes[0] 間接（防御力）: 自分と、自分を除く残りの HP の値が最も低い味方 2 機への防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 自分と、自分を除く残りの HP の値が最も低い味方 2 機への受けるダメージ均等分配（10 秒）は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1212（確定）
  - notes[0] 間接（バリア）: 自分に張る味方共用バリア（最終最大HP の X%・10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] timed・normalShot・attack: C-1211（確定）
  - notes[0] 間接（バリア）: 戦闘開始時に自分に付くポリスバッジ（最終最大HP の X% のバリア・10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは自分がバリア適用状態にならない。バリアの量は要件 5.2 節の外）。ポリスバッジを読むのは、バーストの不屈と、S2 の終了時の持続回復だけ（どちらもダメージに関係しない）: 根拠なし
- **宝物版 skill2**: noEffect
  - notes[0] 間接（防御力）: 20 秒ごとの、自分と、自分を除く HP が最も低い味方 2 機への防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 20 秒ごとの、自分と、自分を除く HP が最も低い味方 2 機への受けるダメージ均等分配（10 秒）は防御系でダメージに関係しない: 根拠なし
  - notes[2] 計算に無関係: ポリスバッジ状態が終了した時の自分の持続回復（最終最大HP の X%・1 秒間隔・5 秒）は、ダメージに関係しない（自分にだけ付き、ポリに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
- **宝物版 burst**: supported
  - effects[0] timed・burstUse・attack: C-1212（確定）
  - notes[0] 計算に無関係: 自分がポリスバッジ状態の時の、自分への不屈（5 秒）とポリスバッジ解除はダメージに関係しない（解除で早く終わったポリスバッジは S2 の持続回復を起こすだけ）: 根拠なし
  - notes[1] 間接（バリア）: 自分に張る味方共用バリア（最終最大HP の X%・10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: 根拠なし

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

## 33 キリ

- **skill1**: supported
  - effects[0] timed・fullChargeShot・attack: C-1568（確定）、C-1579（仮説）
  - notes[0] 計算に無関係: フルチャージ攻撃が命中した時の、対象への攻撃力▼（3 秒）はダメージに関係しない: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（HP）: 戦闘開始時の、防御型の味方 2 機への最大HP▲（持続）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1571（仮説）
  - effects[1] timed・burstUse・critRate: C-1570（確定）

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

## 41 K

- **skill1**: supported
  - effects[0] state・lastShotOnce・tiltedScale（critRate）: C-1498（確定）
  - effects[1] stackChange・lastShotOnce・tiltedScale: C-1498（確定）
  - effects[2] damage・critPelletHit・additional: C-1499（確定）、C-1501（仮説）
  - effects[3] removeState・fullBurstEnd・tiltedScale: C-1502（仮説）
- **skill2**: supported
  - effects[0] state・tiltedScale が適用された時・fulfillmentOfRighteousness（maxAmmo・attackDamage）: C-1497（確定）
  - effects[1] removeState・fullBurstEnd・fulfillmentOfRighteousness: C-1502（仮説）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1500（確定）、C-1510（仮説）
  - effects[1] timed・burstUse・attack: C-1500（確定）
  - effects[2] timed・burstUse・attackDamage: C-1500（確定）

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

- **skill1**: noEffect
  - notes[0] 前提の外: フルチャージ攻撃時の自分の爆発範囲▲（5 秒）は、敵 1 体では複数の敵へのヒットを増やすだけで起きない: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 4 機以上に同時に命中した時の防御力▼と追加ダメージは、敵 1 体では起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0676（確定）、C-0677（確定）
  - effects[1] timed・burstUse・chargeSpeed: C-0678（確定）

## 61 ミカ

- **skill1**: noEffect
  - notes[0] 前提の外: 攻撃を 20 回受けた時の自分の防御力▲（10 秒）は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）。起きても防御力▲で、それ自体は与ダメージを変えない: 根拠なし
- **skill2**: supported
  - effects[0] timed・20 秒ごと・maxAmmo: C-1517（確定）
  - notes[0] 間接（防御力）: 最終攻撃力が最も高い味方 2 機の防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1516（確定）、C-0795（確定）
  - effects[1] timed・burstHit・enemyDefenseDown: C-1518（確定）、C-1519（確定）、C-0556（確定）、C-0790（確定）

## 62 ミカ：スノーバディ

- **skill1**: supported
  - effects[0] state・normalHit・tidyingUp: C-1599（確定）
  - effects[1] passive・tidyingUp のフルスタックの間・maxAmmo: C-1599（確定）
  - notes[0] 計算に無関係: 整理整頓の受けるダメージ▼は、ダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] stackChange・normalHit・スタック可能バフの全部: C-1599（確定）
  - effects[1] passive・burstGaugeSpeed: C-1600（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1601（確定）
  - notes[0] 間接（デバフ）: 味方全体の「デバフ効果解除 1 個」は、それ自体は与ダメージを変えない（味方にデバフ（ほろ酔い・時間の▼）を付ける効果のいる編成でだけ効く。ミカ：スノーバディでは外す数え方・時刻を確かめていないので、モデルでは外さない）: 根拠なし

## 63 ベロータ：パンプキンウィッチ

- **skill1**: supported
  - effects[0] state・fullBurstStart・ghostCostume: C-1536（確定）
  - effects[1] timed・fullBurstStart・attack: C-1537（確定）
  - notes[0] 前提の外: おばけの仮装の単一攻撃の対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）: 根拠なし
  - notes[1] 間接（HP）: フルバーストタイムが発動した時の自分の最大HP▲（イタズラ準備）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・fullChargeShot・ghostlyPrank（damageTaken）: C-1536（確定）
  - effects[1] timed・fullChargeShot・sustainedDamage: C-1537（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1537（確定）
  - effects[1] timed・burstUse・sustainedDamage: C-1537（確定）

## 70 ブリッド

- **skill1**: supported
  - effects[0] timed・normalShot・attack: C-1406（確定）
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-1407（確定）、C-1535（確定）
  - effects[1] burstGaugeHit・10 秒ごと: C-1431（確定）、C-1407（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1408（確定）
  - effects[1] damage・burstUse・additional（読む: HP）: C-1410（確定）

## 71 ソリン

- **skill1**: supported
  - effects[0] timed・normalShot・attackSpeed: C-1110（確定）
- **skill2**: supported
  - effects[0] passive・critRate（読む: HP）: C-1111（確定）、C-1112（確定）
  - effects[1] passive・critDamage（読む: HP）: C-1111（確定）、C-1112（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1113（確定）
  - effects[1] damage・burstUse・additional（読む: HP）: C-1114（確定）、C-1115（仮説）

## 72 ディーゼル

- **skill1**: noEffect
  - notes[0] 間接（防御力）: フルバーストタイムが発動した時の自分の防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 前提の外: フルバーストタイム持続中に撃たれた時の自分の回復は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] state・normalHit・strawberryCandy（maxAmmo）: C-1185（確定）
  - effects[1] ammoRefill・strawberryCandy のフルスタック: C-1184（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1185（確定）
  - notes[0] 計算に無関係: 同じ敵への挑発はダメージに関係しない（付けるのはチェーンの間）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] stackChange・normalHit・スタック可能バフの全部: C-1180（確定）、C-1182（確定）、C-1508（確定）
  - notes[0] 間接（防御力）: フルバーストタイムが発動した時の自分の防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 前提の外: 攻撃を受けた時（自分がヘイト状態なら）の自分の回復は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは敵の攻撃で起きうる（C-0551）: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] state・normalHit・strawberryCandy（maxAmmo）: C-1179（確定）
  - effects[1] ammoRefill・strawberryCandy のフルスタック: C-1184（仮説）
  - effects[2] timed・strawberryCandy のフルスタック・pierceDamage（読む: 貫通）: C-1184（仮説）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1183（確定）
  - effects[1] state・burstUse・attract: C-1181（確定）
  - notes[0] 間接（HP）: 自分の最大HP のみ▲（10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: ヘイト（敵全体を挑発）そのものはダメージに関係しない（ティアの S2 と同じ自分にヘイトの形で、付けた時にゲージを溜めない。C-0505）。宝物版 S1 の条件が読むので、状態として付ける: 根拠なし

## 73 ブリッド：サイレントトラック

- **skill1**: supported
  - effects[0] timed・fullBurstStart・damageTaken: C-1041（確定）
  - effects[1] damage・fullBurstStart・skill: C-1041（確定）
- **skill2**: supported
  - effects[0] timed・normalShot・damageTaken: C-1039（確定）
  - effects[1] damage・normalShot・skill: C-1039（確定）、C-1040（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1042（確定）

## 74 ソリン：フロストチケット

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-1302（確定）
  - notes[0] 間接（HP）: 戦闘開始時とバーストスキル使用時に味方全体に発券する乗車券（最大 2 枚・持続。1 枚ごとにスキル発動者基準で最大HP のみ▲）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）。被弾の無い前提では乗車券は減らず、1 回目のバーストで 2 枚になると、以後は変わらない。1 回目のバーストの 2 枚目は同じバーストの回復の後に付くので、ほかの回復を受けなければ、HP の割合は戦闘開始から 2 回目のバーストの回復まで下がっている: C-1304（仮説）
  - notes[1] 前提の外: フルバーストタイムの発動時の、味方全体の早期割引の解除は、S2 の乗車券の減少（HP が 15% 以下になった時）にしか効かないので、被弾を扱わない前提では効かない（要件 4.2 節）: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 味方の HP が 15% 以下になった時の、乗車券を持つその味方への回復（スキル発動者の最終最大HP の X%）と乗車券 1 枚▼は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードの敵の攻撃は操作キャラにだけ当たる（C-0551）ので、操作キャラの HP が 15% 以下になった時だけ起きうる: 根拠なし
  - notes[1] 前提の外: 戦闘開始時の味方全体の早期割引（6 秒。S2 による乗車券の減少が起きない）は、S2 の乗車券の減少にしか効かないので、被弾を扱わない前提では効かない（要件 4.2 節）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1303（確定）

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
- **burst**: supported
  - effects[0] timed・burstUse・damageTaken: C-1018（確定）
  - effects[1] dot・burstUse: C-1018（確定）
  - effects[2] dot・burstUse: C-1018（確定）
  - effects[3] state・burstUse・noisePollution（hitRate）: C-1558（確定）
  - notes[0] 前提の外: 自分がクライマックス状態なら、味方全体の消音スタック量 1 個▼は、消音がパーツの破壊でしか付かず射撃場では無いので、何もしない: C-0443（範囲外）

## 80 センチ

- **skill1**: noEffect
  - notes[0] 間接（バリア）: フルチャージ攻撃が命中した時の自分の S2 のクールタイム▼は、S2 のバリアの間隔を縮めるだけで、それ自体は与ダメージを変えない（基礎版の S2 はバリアだけ。バリアを読む効果のある編成でだけ効く。宝物版では S2 の攻撃力▲の回数を通して効くので効果として書く）: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（バリア）: クールタイムごとの味方共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1221（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1221（確定）
- **宝物版 skill1**: supported
  - effects[0] skillCooldownReduction・fullChargeShot: C-1219（確定）
  - effects[1] timed・skill2 を発動した時・elementDamage: C-1220（確定）
  - effects[2] heal・battleStart: 根拠なし
  - notes[0] 前提の外: 戦闘開始時の資材備蓄（最大HP を超える回復量を保存）は、貯めた分を HP が減った時に使うもので、被弾を扱わないので起きない（要件 4.2 節）: 根拠なし
  - notes[1] 前提の外（読む: HP）: 自分を含む味方の HP が 100% 以下になった時（資材備蓄状態なら）の味方全体の回復は、HP が満タンから減るのが被弾の時だけなので起きない（要件 4.2 節）: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] timed・9 秒ごと・attack: C-1218（確定）
  - notes[0] 間接（バリア）: クールタイムごとの味方共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1221（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1221（確定）
  - effects[2] heal・burstUse: 根拠なし

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

## 91 ベスティー

- **skill1**: noEffect
  - notes[0] 前提の外: フルチャージ攻撃時の自分の爆発範囲▲（10 秒）は、敵 1 体では複数の敵へのヒットを増やすだけで起きない: 根拠なし
- **skill2**: supported
  - effects[0] state・burstUse・survivalInstinct1（attack）: C-1442（確定）
  - effects[1] state・burstUse・survivalInstinct2（critDamage）: C-1442（確定）
  - effects[2] state・burstUse・survivalInstinct3（critRate）: C-1442（確定）
- **burst**: supported
  - effects[0] damage・burstUse・additional: C-1441（確定）
  - effects[1] damage・burstUse・additional: C-1441（確定）
  - effects[2] damage・burstUse・additional: C-1441（確定）
  - notes[0] 前提の外: ミサイルコンテナ 2 機の攻撃（最終攻撃力の 15.56% のダメージ・攻撃間隔 1 秒・18 秒）は、ヒットの数が射撃場の的の着地点とコンテナが出てからの時刻で決まり、説明文の 1 秒に 2 回にならない。1 回の攻撃のミサイルの数が分からず、静止した単体ボスでの数を決められないので、モデルに入れない（1 ヒットの値は式どおり。V-0825）: C-1555（確定）、C-1556（確定）
  - notes[1] 補足: フルバーストタイム 5 秒▼は burst_duration（5 秒）から時刻表に入る: C-0011（確定）

## 92 ウンファ

- **skill1**: supported
  - effects[0] timed・lastShot・chargeDamage: C-1367（確定）、C-1378（確定）
  - effects[1] timed・lastShot・chargeSpeed: C-1378（確定）
- **skill2**: supported
  - effects[0] timed・lastShot・enemyDefenseDown: C-1367（確定）、C-1378（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1379（確定）、C-1380（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1380（確定）
  - effects[2] timed・burstUse・critRate: C-1381（確定）

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
- **burst**: supported
  - effects[0] timed・burstUse・trueDamage: C-0808（確定）
  - effects[1] burstDamage・true: C-0807（確定）

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

## 100 ラプラス

- **skill1**: supported
  - effects[0] state・fullChargeShot・heroVision: C-1202（確定）、C-1206（確定）
- **skill2**: supported
  - effects[0] damage・lastShot・additional: C-1203（仮説）
  - notes[0] 前提の外: 対象のパーツに命中した時の本体への追加ダメージは、射撃場の敵にパーツが無いので起きない（要件 4.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1200（確定）、C-1202（確定）
  - effects[1] burstDamage・skill: C-1202（確定）、C-1204（確定）
  - effects[2] damage・weaponChangeShot・true: C-1202（確定）、C-1205（確定）
  - effects[3] damage・burstUse・true: C-1202（確定）、C-1205（確定）
  - effects[4] damage・burstUse・true: C-1202（確定）、C-1205（確定）
  - notes[0] 計算に無関係: バーストスキル発動中はハイド不可は、ダメージに関係しない（被弾を扱わない）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] state・fullChargeShot・heroVision: C-1206（確定）
- **宝物版 skill2**: supported
  - effects[0] damage・fullChargeShot・additional: C-1201（確定）
  - notes[0] 前提の外: 対象のパーツに命中した時の本体への追加ダメージは、射撃場の敵にパーツが無いので起きない（要件 4.2 節）: C-0443（範囲外）
- **宝物版 burst**: supported
  - effects[0] weaponChange・burstUse: C-1200（確定）
  - effects[1] weaponChange・burstUse: C-1200（確定）
  - effects[2] burstDamage・skill: C-1204（確定）
  - effects[3] damage・weaponChangeShot・true: C-1205（確定）
  - effects[4] damage・burstUse・true: C-1205（確定）
  - effects[5] damage・burstUse・true: C-1205（確定）
  - notes[0] 計算に無関係: バーストスキル発動中はハイド不可は、ダメージに関係しない（被弾を扱わない）: 根拠なし

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

## 102 マクスウェル

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeSpeed: C-1432（確定）
  - effects[1] timed・fullBurstStart・attack: C-1432（確定）
- **skill2**: noEffect
  - notes[0] 前提の外: ニケを除いた敵が 5 機以上の時だけの自分の会心率▲・会心ダメージ▲は、敵 1 体では起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1433（確定）、C-1598（確定）

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

## 104 ドレイク：グレイトヴィラン

- **skill1**: supported
  - effects[0] weaponChange・fullBurstStart: C-1427（確定）、C-1566（確定）
  - effects[1] ammoDecrease・使用武器の変更が終了した時: C-1428（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstEnd・maxHpOnly: C-1429（確定）
  - effects[1] timed・battleStart・attack（読む: HP）: C-1429（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1430（確定）
  - effects[1] burstDamage・skill: C-1430（確定）

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

## 110 クロウ

- **skill1**: noEffect
  - notes[0] 計算に無関係: フルバーストタイムが発動した時の、敵全体の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] damage・lastShot・additional: C-1400（確定）
  - notes[0] 間接（防御力）: 最後の弾丸が命中した時の、自分の防御力▲（5 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1401（確定）

## 111 ジャッカル

- **skill1**: noEffect
  - notes[0] 前提の外: 10 回攻撃を受けた時の、最終最大HP が最も高い敵 1 機の受けるダメージ▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは、操作キャラが的の攻撃を受けると起きる（C-0551）: 根拠なし
  - notes[1] 計算に無関係: 10 回攻撃を受けた時の、敵の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 戦闘開始時の、自分と最終攻撃力が最も高い味方 1 機の受けるダメージ均等分配（120 秒）は、被弾で HP が減った時だけ働く（被弾なしの前提の外）: 根拠なし
  - notes[1] 間接（防御力）: 戦闘開始時の、自分と最終攻撃力が最も高い味方 1 機の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・oneEnemyBurstDamage: C-1229（確定）、C-1230（仮説）
  - notes[0] 補足: 「〜敵1機に」で終わるバーストスキルダメージ▲は、バーストスキルダメージ（burstDamage）にだけ乗せる。行の対象の句が「敵1機に」で終わっても、バーストの追加ダメージ・持続ダメージには乗らない（マナの持続ダメージ・紅蓮：神殺の追加ダメージで確かめた）: C-1553（確定）
  - notes[1] 間接（防御力）: 味方全体の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし

## 112 バイパー

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-1618（確定）
  - effects[1] timed・battleStart・hitRate: C-1614（仮説）
- **skill2**: supported
  - effects[0] passive・hitRate: C-1614（仮説）
  - notes[0] 前提の外: フルバーストタイムが発動した時の愛嬌（単一攻撃対象から除外。直接攻撃を受けると解除。10 秒）は、被弾しない前提では起きない。基礎版には愛嬌を読む効果が無い: C-0551（仮説）
  - notes[1] 計算に無関係: フルバーストタイムが発動した時の自分の無敵（1 秒）はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1613（確定）、C-0795（確定）
  - effects[1] timed・burstHit・enemyDefenseDown: C-1613（確定）、C-0556（確定）、C-0790（確定）
- **宝物版 skill1**: supported
  - effects[0] timed・battleStart・attack: C-1614（仮説）、C-1618（確定）
  - effects[1] timed・battleStart・hitRate: C-1614（仮説）
  - effects[2] timed・normalShot・sustainedDamage: C-1614（仮説）
  - effects[3] timed・normalShot・hitRate: C-1614（仮説）
- **宝物版 skill2**: supported
  - effects[0] state・fullBurstStart・vamp: C-1614（仮説）
  - effects[1] passive・hitRate: C-1614（仮説）
  - effects[2] burstReentry: C-1614（仮説）
  - notes[0] 前提の外: 愛嬌の単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）。射撃場の 3 分モードでは的が攻撃してくるので、解除が起きうる: C-0551（仮説）
  - notes[1] 計算に無関係: フルバーストタイムが発動した時の自分の無敵（1 秒）はダメージに関係しない: 根拠なし
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1614（仮説）、C-1613（確定）
  - effects[1] timed・burstHit・enemyDefenseDown: C-1614（仮説）、C-1613（確定）
  - effects[2] dot・burstUse: C-1614（仮説）

## 113 E.H.

- **skill1**: supported
  - effects[0] counterChange・scrap が最大になった時・scrap（減少）: C-1387（確定）
  - effects[1] counterChange・scrap が最大になった時・homemadeMagazine: C-1387（確定）
  - effects[2] passive・homemadeMagazine 1 以上の間・attack: C-1387（確定）
  - notes[0] 前提の外: 自家製弾倉の 2〜4 本目と、その分の攻撃力▲は、廃品が戦闘開始時の 10 個のほかに増えない前提（発射体・パーツ・敵の破壊が起きない。要件 4.2 節）では起きない: C-1387（確定）
- **skill2**: supported
  - effects[0] counterChange・battleStart・scrap: C-1387（確定）
  - effects[1] timed・battleStart・elementDamage: C-1387（確定）
  - notes[0] 前提の外: 味方が破壊可能な発射体を破壊した時（1 個）・パーツを破壊した時（5 個）・敵が破壊された時（2 個）の廃品▲と、その回収の有利コードの攻撃ダメージ▲は、敵の発射体・パーツ・敵の破壊を扱わない前提（要件 4.2 節）の外: C-1387（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1388（確定）、C-1389（仮説）、C-1390（確定）
  - effects[1] timed・burstUse・attack: C-1391（確定）
  - notes[0] 前提の外: 自家製弾倉が 2 本以上のときの最大装弾数（2 発以上）は、弾倉が 1 本で止まる前提（S1 の notes）の外: C-1387（確定）

## 120 N102

- **skill1**: supported
  - effects[0] timed・fullChargeShot・maxAmmo: C-1512（確定）
  - effects[1] timed・fullChargeShot・critDamage: C-1513（確定）
- **skill2**: supported
  - effects[0] timed・15 秒ごと・chargeDamage: C-1514（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1515（確定）

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

## 130 メアリー

- **skill1**: supported
  - effects[0] heal・lastShot: C-1610（仮説）、C-0567（確定）
- **skill2**: noEffect
  - notes[0] 間接（HP）: フルバーストタイムが発動した時の、味方全体の受けるHP回復量▲（15 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1610（仮説）
  - notes[0] 間接（防御力）: 自分の HP が 50% 以上の時の、味方全体の防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）。被弾なしの前提では、条件はいつも満たす: 根拠なし

## 131 ペッパー

- **skill1**: supported
  - effects[0] heal・lastShot: C-1465（仮説）
  - effects[1] state・lastShot・refreshHeart: C-1465（仮説）
  - notes[0] 間接（HP）: リフレッシュハートの中身の、味方全体の受けるHP回復量▲（5 スタック・15 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く。受けるHP回復量▲は語彙に無い。plan/design-heal-amount-up.md 2.3 節）: 根拠なし
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-1462（確定）
  - notes[0] 計算に無関係: 敵の攻撃力▼（5 秒）はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1463（確定）
  - effects[1] stackChange・burstUse・スタック可能バフの全部: C-1464（確定）
  - effects[2] heal・burstUse: C-1465（仮説）

## 132 メアリー：ベイゴッデス

- **skill1**: supported
  - effects[0] heal・fullBurstStart: C-1534（仮説）
  - effects[1] heal・fullBurstStart: C-1534（仮説）
  - effects[2] heal・fullBurstStart: C-1534（仮説）
- **skill2**: supported
  - effects[0] timed・burstUse・elementDamage: C-1532（確定）
  - effects[1] timed・burstUse・elementDamage: C-1532（確定）
  - effects[2] timed・burstUse・elementDamage: C-1532（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1533（確定）
  - effects[1] timed・burstUse・maxHp: C-1534（仮説）

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

## 142 プリム

- **skill1**: supported
  - effects[0] timed・normalHit・enemyDefenseDown: C-1461（仮説）
- **skill2**: noEffect
  - notes[0] 間接（HP）: フルチャージして攻撃した時の味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1461（仮説）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1461（仮説）
  - notes[0] 間接（HP）: 味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 skill1**: supported
  - effects[0] state・fullChargeShot・sleepy（enemyDefenseDown）: C-1459（確定）
  - effects[1] state・fullChargeShot・wakeUp（trueDamageConversion）: C-1459（確定）
- **宝物版 skill2**: supported
  - effects[0] timed・fullChargeShot・trueDamage: C-1458（確定）
  - notes[0] 間接（HP）: フルチャージして攻撃した時の味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1460（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1461（仮説）
  - effects[2] timed・burstUse・trueDamage: C-1460（確定）
  - notes[0] 間接（HP）: 味方全体の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 143 ミルク：ブルーミングバニー

- **skill1**: supported
  - effects[0] timed・fullChargeShot・pierce: C-1244（確定）
  - notes[0] 前提の外: フルチャージを 0.5 秒以上維持した時の「羞恥心」の効果 1（敵全体に最終攻撃力の 290% の分配ダメージ）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）、C-1247（確定）
  - notes[1] 前提の外: 羞恥心の効果 2・4（自分の残弾数 100% 減少・強制リロード）は、羞恥心が起きないので起きない（要件 4.2 節）: C-0839（確定）、C-1247（確定）
  - notes[2] 前提の外: 羞恥心の効果 3（自分のリロード速度 50% 低下で固定・リロード 1 回）は、羞恥心が起きないので起きない（要件 4.2 節）: C-0839（確定）、C-1247（確定）
  - notes[3] 前提の外: 羞恥心の効果 5（自分に攻撃力 118.7%▲・40 秒）は、羞恥心が起きないので起きない（要件 4.2 節）: C-0839（確定）、C-1247（確定）
- **skill2**: supported
  - effects[0] damage・2 秒ごと・distributed: C-1245（確定）、C-1243（確定）
  - notes[0] 補足: モデルは、何見てんだよお前ら！！の付いた次のフレームからの周期の刻みに出す。録画では、III のタイマーの 00.00 の約 15f 後の刻みに出なかった回が 1 回あり（00.00 の 5f 以内の発には同じバーストの攻撃力▲が乗っていた）、原因は分からない。そうした回の窓では、モデルが 1 ヒット多い: C-1246（仮説）
  - notes[1] 前提の外（読む: 貫通）: 羞恥心状態の時のみの自分の貫通ダメージ 64.7%▲（持続）は、羞恥心がオートの射撃では起きない（S1 の notes）ので効かない（要件 4.2 節）: C-0839（確定）、C-1247（確定）
- **burst**: supported
  - effects[0] state・burstUse・overconfidentHuh: C-1245（確定）
  - effects[1] timed・burstUse・pierceDamage（読む: 貫通）: C-1244（確定）
  - effects[2] timed・burstUse・attack: C-1244（確定）
  - notes[0] 前提の外: 何見てんだよお前ら！！の羞恥心免疫（10 秒）は、羞恥心がオートの射撃では起きない（S1 の notes）ので効かない（要件 4.2 節）: C-0839（確定）、C-1247（確定）

## 150 ジュリア

- **skill1**: unsupported
  - notes[0] 未対応: 基礎版の S1 は説明文にきっかけの無いクールタイムごとのアクティブで、クールタイムは録画で読むもの。宝物を外せないので基礎版を撮れず、未対応（宝物版の S1 と同じクールタイムとは限らない）: 根拠なし
- **skill2**: supported
  - effects[0] state・lastShot・crescendo（critDamage）: C-1326（確定）、C-1330（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1331（仮説）
  - effects[1] damage・burstUse・additional: C-1329（確定）、C-1331（仮説）
- **宝物版 skill1**: supported
  - effects[0] timed・20 秒ごと・critRate: C-1325（確定）
  - effects[1] timed・20 秒ごと・attack: C-1325（確定）
  - effects[2] timed・20 秒ごと・normalCritRate: C-1325（確定）
  - effects[3] timed・battleStart・critRate: C-1325（確定）
  - effects[4] timed・battleStart・attack: C-1325（確定）
  - effects[5] timed・battleStart・normalCritRate: C-1325（確定）
- **宝物版 skill2**: supported
  - effects[0] state・critHit・crescendo（critDamage）: C-1326（確定）
  - effects[1] damage・critHit・additional: C-1327（確定）
  - effects[2] damage・critHit・additional: C-1328（確定）
  - notes[0] 補足: 「戦闘開始時、自分にスキル 1 強制使用」は、宝物版 S1 の戦闘開始時の効果（treasureSkills.skill1 の effects[3]〜[5]）で入れた。S1 が基礎版の段階（宝物の段階 1）では、基礎版の S1 が未対応なので入らない: C-1325（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1329（確定）
  - effects[1] damage・burstUse・additional: C-1329（確定）

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
  - effects[2] damage・restraintChains が最大になった時・skill: C-0411（確定）、C-0745（確定）、C-0747（確定）、C-1197（仮説）
  - effects[3] counterChange・restraintChains が最大になった時・restraintChains（減少）: C-0411（確定）
  - effects[4] dot・restraintChains が最大になった時: C-0411（確定）、C-0745（確定）、C-0747（確定）、C-1197（仮説）
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

## 171 ユルハ

- **skill1**: noEffect
  - notes[0] 前提の外: 30 回攻撃を受けた時の、自分の平常心（クリティカル確率▲・20 秒）は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは、操作キャラが的の攻撃を受けると数えられうる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] timed・30 秒ごと・attack: C-1436（確定）
  - notes[0] 計算に無関係: 味方全体の受けるダメージ均等分配（10 秒）は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1437（確定）
  - notes[0] 前提の外: 自分が平常心状態のときの追加ダメージ（最終攻撃力の X%）は、平常心が被弾でしか付かない（S1）ので起きない（要件 4.2 節）: 根拠なし

## 172 アドミ

- **skill1**: noEffect
  - notes[0] 前提の外: 「20 回攻撃を受けた時」のチャージダメージ倍率▲は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きる（C-0551）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 最終攻撃力が最も高い味方 2 機の受けるダメージ▼は防御系でダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・reloadSpeed: C-0456（確定）、C-0479（確定）
  - effects[1] timed・burstUse・critDamage: C-0463（確定）、C-0479（確定）

## 180 ギロチン

- **skill1**: supported
  - effects[0] timed・normalHit・critRate: C-1369（確定）
  - effects[1] currentHpDown・normalHit: C-1368（確定）
- **skill2**: supported
  - effects[0] timed・normalHit・critDamage: C-1370（確定）
  - effects[1] timed・自分の HP が閾値以下に下がった時・attack: C-1371（確定）、C-1368（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1372（確定）
  - effects[1] damage・burstUse・additional: C-1373（確定）、C-1368（確定）、C-1372（確定）

## 181 メイデン

- **skill1**: noEffect
  - notes[0] 前提の外: 20 回攻撃を受けた時の、自分の復讐（攻撃力▲・20 秒）は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは、操作キャラが的の攻撃を受けると数えられうる（C-0551）: 根拠なし
- **skill2**: supported
  - effects[0] timed・30 秒ごと・critDamage: C-1484（確定）、C-0506（確定）
  - effects[1] burstGaugeHit・30 秒ごと: C-0506（確定）
  - notes[0] 計算に無関係: 敵全体への挑発（10 秒）そのものはダメージに関係しない（ゲージは effects[1]）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1485（確定）
  - notes[0] 前提の外: 自分が復讐状態のときの、同じ敵への追加ダメージ（最終攻撃力の X%）は、復讐が被弾でしか付かない（S1）ので起きない（要件 4.2 節）: 根拠なし

## 182 ギロチン：ウィンタースレイヤー

- **skill1**: supported
  - effects[0] counterChange・battleStart・heroLevel: C-1393（確定）
  - effects[1] counterChange・exp の値 01 スタックごと・heroLevel: C-1393（確定）
  - effects[2] ammoRefill・heroLevel が上がった時: C-1394（確定）
  - effects[3] heal・heroLevel が上がった時: C-1395（仮説）
  - effects[4] timed・heroLevel が上がった時・elementDamage: C-1396（確定）
  - effects[5] timed・heroLevel が上がった時・attack: C-1396（確定）
- **skill2**: supported
  - effects[0] state・nonCoreHit・exp（attack）: C-1392（確定）
  - effects[1] state・coreHit・exp: C-1392（確定）
  - effects[2] passive・heroLevel 2 以上の間・elementDamage: C-1396（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1397（確定）
  - effects[1] timed・burstUse・elementDamage: C-1397（確定）
  - effects[2] dot・burstUse: C-1398（確定）

## 183 メイデン：アイスローズ

- **skill1**: supported
  - effects[0] counterChange・burstStage1Enter・mp: C-1343（確定）
  - effects[1] counterChange・fullBurstStart・mp: C-1343（確定）
  - effects[2] counterChange・burstUse・mp（減少）: C-1343（確定）
  - effects[3] timed・fullChargeShot・maxHpOnly: C-1349（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・elementDamage: C-1347（確定）、C-1350（確定）
  - effects[1] timed・fullBurstStart・attack: C-1347（確定）
  - effects[2] timed・burstUse・elementDamage: C-1350（確定）
  - effects[3] timed・burstUse・attack: C-1346（確定）
  - effects[4] damage・fullChargeShot・skill: C-1348（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1343（確定）、C-1344（確定）、C-1496（確定）

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

## 193 ネヴェ

- **skill1**: supported
  - effects[0] damage・10 秒ごと・skill: C-1492（確定）、C-1511（確定）
  - effects[1] burstGaugeHit・10 秒ごと: C-1547（確定）、C-1548（仮説）、C-1492（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・pierce: C-1494（確定）
  - effects[1] timed・fullBurstStart・attack: C-1493（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critRate: C-1495（仮説）
  - effects[1] timed・burstUse・hitRate: C-1495（仮説）

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

- **skill1**: supported
  - effects[0] heal・normalShot: C-1166（確定）
  - effects[1] state・normalShot・carrotParty: C-1166（確定）
  - effects[2] stackChange・normalShot・スタック可能バフの全部: C-1505（確定）、C-1507（仮説）
  - notes[0] 前提の外: ニンジンパーティーの阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・fullBurstEnd・burstGaugeSpeed: C-1168（仮説）
  - effects[1] timed・fullBurstStart・maxAmmo: C-1167（確定）
  - effects[2] ammoRefill・fullBurstStart: C-1167（確定）
- **burst**: supported
  - effects[0] burstReentry: C-1169（確定）
  - effects[1] heal・burstUse: C-1170（仮説）
  - notes[0] 間接（HP）: 自分がニンジンパーティーのフルスタック状態の時の、味方全体の受ける HP 回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 200 ルピー

- **skill1**: supported
  - effects[0] stackChange・normalHit・スタック可能バフの全部: C-1423（確定）
  - effects[1] timed・normalHit・critRate: C-1467（仮説）
- **skill2**: supported
  - effects[0] state・normalShot・mileage（attack）: C-1422（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1421（確定）
  - effects[1] timed・burstUse・attack: C-1424（確定）

## 201 ヤン

- **skill1**: supported
  - effects[0] timed・fullBurstStart・chargeDamage: C-1456（確定）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・attack: C-1455（確定）
  - effects[1] timed・fullChargeShot・critRate: C-1455（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1457（確定）
  - notes[0] 前提の外: 攻撃範囲の中心への強制移動（2 秒）は、静止した単体ボスの前提では与ダメージを変えない（敵が複数のとき、範囲攻撃に入る敵の数が変わりうる）: 根拠なし

## 202 ドラー

- **skill1**: supported
  - effects[0] timed・10 秒ごと・attack: C-1213（確定）
- **skill2**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-1214（確定）
  - effects[1] cooldownReduction・fullBurstStart: C-1214（確定）
  - effects[2] cooldownReduction・fullBurstStart: C-1214（確定）
  - effects[3] timed・burstUse・attack: C-1215（確定）、C-1217（確定）
  - effects[4] timed・burstUse・critRate: C-1216（仮説）、C-1217（確定）
  - effects[5] timed・burstUse・critDamage: C-1215（確定）、C-1217（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1217（確定）

## 203 ルピー：ウィンターショッパー

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 最後の弾丸が命中した時の、味方全体への防御力▲（5 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・allyBurstUse・shopping（defense）: C-1575（確定）
  - effects[1] timed・fullBurstEnd・burstGaugeSpeed: C-1575（確定）
- **burst**: supported
  - effects[0] burstReentry: C-1576（確定）
  - effects[1] timed・burstUse・reloadSpeed: C-1577（確定）
  - notes[0] 計算に無関係: 自分への「ヘイト：敵全体を挑発」（5 秒）はダメージに関係しない（ティアの S2・シンの S1 の「自分にヘイト：敵全体を挑発」はゲージを溜めない。この挑発はチェーンの間に付き、その間はバーが見えないので、ゲージを溜めないかは確かめていない）: 根拠なし
  - notes[1] 計算に無関係: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、ルピー：ウィンターショッパーに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし

## 210 エクシア

- **skill1**: supported
  - effects[0] timed・lastShot・enemyDefenseDown: C-1189（確定）、C-1193（仮説）
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の対象の攻撃力▼はダメージに関係しない: 根拠なし
- **skill2**: supported
  - effects[0] state・lastShot・collectHackingCode（attack）: C-1187（確定）、C-1193（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1190（確定）、C-1193（仮説）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1190（確定）、C-1193（仮説）
  - effects[2] damage・burstUse・additional: C-1190（確定）、C-1193（仮説）
- **宝物版 skill1**: supported
  - effects[0] timed・lastShot・enemyDefenseDown: C-1189（確定）
  - effects[1] timed・fullBurstStart・reloadSpeed: C-1192（確定）、C-1339（確定）
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の対象の攻撃力▼はダメージに関係しない: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] state・fullChargeShot・collectHackingCode（attack）: C-1187（確定）
  - effects[1] timed・lastShot・attack: C-1188（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1190（確定）、C-1191（確定）
  - effects[1] timed・burstUse・enemyDefenseDown: C-1190（確定）
  - effects[2] damage・burstUse・additional: C-1190（確定）
  - effects[3] timed・burstUse・damageTaken: C-1190（確定）

## 212 ノベル

- **skill1**: supported
  - effects[0] damage・10 秒ごと・skill: C-1448（確定）
  - effects[1] timed・10 秒ごと・enemyDefenseDown: C-1448（確定）、C-0556（確定）、C-0790（確定）
  - effects[2] burstGaugeHit・10 秒ごと: C-1503（確定）、C-1448（確定）
- **skill2**: supported
  - effects[0] state・normalHit・collectEvidence（defense）: C-1449（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1450（確定）、C-0795（確定）
  - effects[1] timed・burstUse・damageTaken: C-1449（確定）

## 220 スノーホワイト

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-1415（確定）
  - effects[1] timed・normalHit・attack: C-1415（確定）
- **skill2**: supported
  - effects[0] damage・15 秒ごと・skill: C-1416（確定）、C-1417（仮説）、C-1420（確定）
  - effects[1] timed・15 秒ごと・critRate: C-1418（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1419（確定）、C-1420（確定）

## 221 ラプンツェル

- **skill1**: supported
  - effects[0] heal・fullChargeShot: C-1611（仮説）、C-0567（確定）
- **skill2**: noEffect
  - notes[0] 間接（HP）: 最終攻撃力が最も高い味方 2 機への最大HP▲と受けるHP回復量▲（どちらも 15 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）。説明文にきっかけが無い: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1611（仮説）
  - notes[0] 前提の外: 戦闘不能状態の、最終攻撃力が最も高い味方 1 機の復活は、味方が倒れないので起きない（要件 4.2 節）: C-0443（範囲外）
  - notes[1] 計算に無関係: 自分の HP が 30% 以下の時の、敵全体の気絶（1 秒）はダメージに関係しない: 根拠なし

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

## 224 スノーホワイト：イノセントデイズ

- **skill1**: supported
  - effects[0] timed・normalHit・maxAmmo: C-1363（確定）
  - effects[1] damage・normalHit・skill: C-1363（確定）
- **skill2**: supported
  - effects[0] damage・normalHit・skill: C-1364（確定）、C-1365（確定）
  - effects[1] timed・burstUse・attackDamage: C-1366（確定）
- **burst**: supported
  - effects[0] cycleEvery・burstUse: C-1366（確定）
  - effects[1] timed・burstUse・attack: C-1366（確定）
  - effects[2] timed・burstUse・infiniteAmmo: C-1366（確定）

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

## 230 ハラン

- **skill1**: supported
  - effects[0] dot・normalShot: C-1539（確定）、C-1540（確定）
  - notes[0] 前提の外: 敵が撃破された時の、最も近い敵へのウイルス転移の広がりは、射撃場の敵が倒れないので起きない（敵 1 体の前提。要件 4.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・fullChargeShot・pierce: C-1541（仮説）
  - effects[1] timed・fullChargeShot・critRate: C-1541（仮説）
  - notes[0] 前提の外: 敵を倒した時の自分の攻撃力▲（スタック）は、射撃場の敵が倒れないので起きない（敵 1 体の前提。要件 4.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1542（確定）、C-1543（確定）

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

## 241 エピネル

- **skill1**: noEffect
  - notes[0] 前提の外: 敵を倒した時の自分のスーパールーキー（攻撃力▲・5 スタック・15 秒）は、射撃場の的が倒れないので起きない（敵 1 体の前提。要件 4.2 節）: C-0443（範囲外）、C-1362（確定）
- **skill2**: supported
  - effects[0] timed・lastShot・critRate: C-1360（確定）、C-1359（確定）
  - effects[1] timed・lastShot・critDamage: C-1359（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1361（確定）
  - notes[0] 前提の外: スーパールーキーのフルスタック状態の時の、同じ敵への追加ダメージは、スーパールーキーが付かない（S1 は射撃場の的が倒れないので起きない）ので出ない（要件 4.2 節）: C-0443（範囲外）、C-1362（確定）

## 242 フォルクヴァン

- **skill1**: noEffect
  - notes[0] 間接（バリア）: 最終攻撃力が最も高い味方 2 機へのバリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
  - notes[1] 間接（HP）: 最終攻撃力が最も高い味方 2 機への受けるHP回復量▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] burstGaugeHit・20 秒ごと: C-0422（確定）
  - notes[0] 計算に無関係: 最終攻撃力が最も高い敵 1 機への挑発はダメージに関係しない: 根拠なし
  - notes[1] 間接（HP）: 自分の最大HP▲は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
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
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-0102（確定）、C-0401（確定）、C-0453（確定）
  - effects[1] burstGaugeHit・10 秒ごと: C-1486（確定）、C-0401（確定）、C-0453（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-0089（確定）、C-0219（確定）
  - effects[1] dot・burstUse: C-0100（確定）、C-0101（確定）、C-0111（確定）、C-0112（確定）、C-0129（確定）、C-0219（確定）
  - effects[2] timed・burstUse・maxAmmo: C-0089（確定）

## 262 リバーレリオ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-1241（確定）
  - effects[1] timed・coreHit・attackDamage: C-1237（確定）
  - effects[2] damage・fullChargeShot・additional: C-1238（確定）、C-1239（確定）
  - effects[3] damage・fullChargeShot・additional: C-1238（確定）、C-1239（確定）
  - effects[4] damage・fullChargeShot・additional: C-1238（確定）、C-1239（確定）
  - effects[5] damage・fullChargeShot・additional: C-1238（確定）、C-1239（確定）
  - effects[6] damage・fullChargeShot・additional: C-1238（確定）、C-1239（確定）
  - effects[7] timed・fullBurstStart・chargeSpeed: C-1578（確定）
- **skill2**: supported
  - effects[0] state・fullChargeShot・ragingCurrent（attackDamage）: C-1237（確定）
  - effects[1] timed・battleStart・chargeSpeed: C-1242（仮説）、C-1342（確定）
  - notes[0] 前提の外: フルチャージ攻撃が「ターゲット」でないラプチャーに命中した時の緩流（チャージ時間 1 秒で固定・持続。激流解除）は、敵が「ターゲット」の単体ボスだけの前提では起きない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1241（確定）
  - effects[1] damage・burstUse・additional: C-1240（確定）

## 270 ブラン

- **skill1**: noEffect
  - notes[0] 間接（バリア）: 通常攻撃 120 回ごとの味方共用バリアは、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] heal・fullBurstEnd: C-0694（確定）
  - effects[1] cooldownReduction・fullBurstEnd: C-1551（確定）、C-1552（確定）
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

## 272 ルージュ

- **skill1**: supported
  - effects[0] cooldownReduction・fullChargeShot: C-1228（確定）
  - notes[0] 間接（HP）: フルチャージ 8 回ごとの、味方全体へのスキル発動者基準の最大HP のみ▲（5 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・battleStart・swordCoin（attackDamage）: C-1226（確定）
  - notes[0] 計算に無関係: フルチャージ 30 回ごとの、ソードコイン状態なら自分と両隣へのシールドコイン（受けるダメージ▼・持続）は、ダメージに関係しない: 根拠なし
  - notes[1] 間接（HP）: バースト 5 回の使用時の、シールドコイン状態なら味方全体へのダブルソードコイン（スキル発動者基準で最大HP▲・持続）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1227（確定）
  - notes[0] 間接（HP）: 自分のコインの状態（ソードコイン・シールドコイン・ダブルソードコイン）ごとの、味方全体へのスキル発動者基準の最大HP（のみ）▲（10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし

## 280 ロザンナ

- **skill1**: supported
  - effects[0] state・normalHit・concealment: C-1209（確定）
  - effects[1] timed・normalHit・critRate: C-1209（確定）
  - notes[0] 前提の外: 隠れ身の単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）。射撃場の 3 分モードでは的が攻撃してくるので、解除が起きうる（次の命中 120 回目でまた付く）: C-0551（仮説）
  - notes[1] 前提の外: 通常攻撃 10 回で、最終攻撃力が最も高い敵のバフ効果を解除する（戦闘中 1 回）。敵はバフを持たない前提なので効かない: 根拠なし
- **skill2**: supported
  - effects[0] state・battleStart・concealment: C-1210（仮説）
  - notes[0] 前提の外: 隠れ身の単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）: C-0551（仮説）
  - notes[1] 前提の外: ニケの誰かが戦闘不能の時の狂気（攻撃力▲・10 スタック・30 秒）とバーストゲージのチャージは、味方が倒れないので起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1210（仮説）
  - effects[1] damage・burstUse・additional: C-1210（仮説）
- **宝物版 skill1**: supported
  - effects[0] state・normalHit・concealment: C-1210（仮説）、C-1209（確定）
  - effects[1] timed・normalHit・critRate: C-1210（仮説）、C-1209（確定）
  - effects[2] passive・elementDamage: C-1210（仮説）
  - notes[0] 前提の外: 隠れ身の単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）。射撃場の 3 分モードでは的が攻撃してくるので、解除が起きうる（次の命中 120 回目でまた付く）: C-0551（仮説）
  - notes[1] 前提の外: 通常攻撃 10 回で、最終攻撃力が最も高い敵のバフ効果を解除する（戦闘中 1 回）。敵はバフを持たない前提なので効かない: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] state・battleStart・concealment: C-1210（仮説）
  - effects[1] state・normalHit・frenzy（attack）: C-1208（確定）
  - notes[0] 前提の外: 隠れ身の単一攻撃対象からの除外と、直接攻撃を受けた時の解除は起きない（被弾しない前提）: C-0551（仮説）
  - notes[1] 前提の外: ニケの誰かが戦闘不能の時の狂気（攻撃力▲・10 スタック・30 秒）とバーストゲージのチャージは、味方が倒れないので起きない: C-0443（範囲外）
  - notes[2] 前提の外: 味方の誰かが戦闘不能の時の、優先的に火力型の敵 1 機への最終攻撃力の 値 11 % のダメージは、味方が倒れないので起きない: C-0443（範囲外）
- **宝物版 burst**: supported
  - effects[0] burstDamage・skill: C-1207（確定）
  - effects[1] damage・burstUse・additional: C-1207（確定）
  - effects[2] timed・burstUse・damageTaken: C-1207（確定）

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

## 282 サクラ

- **skill1**: noEffect
  - notes[0] 間接（防御力）: 通常攻撃 3 回ごとの、味方全体への桜茶（防御力▲・10 スタック・15 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く。フルスタックはバーストの阻止部位の行の条件で、その行は前提の外）: 根拠なし
- **skill2**: supported
  - effects[0] cooldownReduction・fullBurstStart: C-1468（確定）
  - notes[0] 前提の外: 味方全体の、敵の発射体に与えるダメージ▲（持続）は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1469（確定）、C-1470（確定）
  - notes[0] 計算に無関係: 味方全体への、風圧コードの敵から受けるダメージ▼（30 秒・戦闘中 1 回）はダメージに関係しない: 根拠なし
  - notes[1] 前提の外: 自分が桜茶のフルスタックの時の、味方全体への阻止部位の攻撃ダメージ▲は、射撃場の敵に阻止部位が無いのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）

## 283 ロザンナ：シックオーシャン

- **skill1**: noEffect
  - notes[0] 前提の外: 戦闘開始時の味方全体のパーツダメージ▲は、射撃場の的にパーツが無いので効かない: C-0443（範囲外）
  - notes[1] 前提の外: 味方の誰かがパーツを破壊した時の、味方全体へのスキル発動者基準の攻撃力▲（5 スタック・30 秒）は、射撃場の的にパーツが無いので起きない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] dot・30 秒ごと: C-1196（確定）、C-1504（確定）
  - notes[0] 前提の外: 味方全体のパーツダメージ▲は、射撃場の的にパーツが無いので効かない: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・sustainedDamage: C-1198（確定）
  - effects[1] timed・burstUse・damageTaken: C-1198（確定）

## 284 サクラ：ブルーム・イン・サマー

- **skill1**: noEffect
  - notes[0] 補足: 「戦闘開始時、自分にスキル 2 強制使用」は、S2 の戦闘開始時の効果（skill2 の effects[2]・[3]）で入れた: C-1584（確定）
  - notes[1] 前提の外: 味方の誰かがパーツを破壊した時の、自分への持続ダメージ▲（30 秒）は、敵がパーツを持たない前提（要件 4.2 節）の外: 根拠なし
  - notes[2] 前提の外: 味方の誰かがパーツを破壊した時の、花の舞の維持時間▲は、敵がパーツを持たない前提（要件 4.2 節）の外: 根拠なし
  - notes[3] 前提の外: 味方の誰かがパーツを破壊した時の、桜かんむり状態の敵への桜かんむりの維持時間▲は、敵がパーツを持たない前提（要件 4.2 節）の外: 根拠なし
- **skill2**: supported
  - effects[0] timed・30 秒ごと・attackDamage: C-1584（確定）
  - effects[1] dot・30 秒ごと: C-1585（確定）
  - effects[2] timed・battleStart・attackDamage: C-1584（確定）
  - effects[3] dot・battleStart: C-1585（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1586（確定）
  - effects[1] dot・burstUse: C-1587（確定）

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

## 303 プロダクト12

- **skill1**: supported
  - effects[0] timed・normalShot・attack: C-1523（確定）
- **skill2**: supported
  - effects[0] damage・10 秒ごと・skill: C-1524（確定）、C-1525（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1526（確定）

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

## 306 ソルジャーO.W.

- **skill1**: supported
  - effects[0] damage・normalShot・additional: C-1544（確定）
- **skill2**: noEffect
  - notes[0] 間接（遮蔽物）: 最終攻撃力が最も高い味方 3 機への遮蔽物防御力▲は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・maxAmmo: C-1545（確定）、C-0017（確定）

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

- **skill1**: supported
  - effects[0] timed・自分の HP が閾値以下に下がった時・attack: C-1025（確定）
  - notes[0] 間接（デバフ）: 戦闘開始時に味方全体に付く「完璧なメイド：デバフ効果免疫 1 個」は、それ自体は与ダメージを変えない（味方にデバフを付ける味方（マスト：ロマンチックメイドのほろ酔い）のいる編成でだけ効く。防ぐ数え方・自分で付けるデバフを防ぐかは確かめていないので、モデルでは防がない）: 根拠なし
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

## 312 ソーダ

- **skill1**: supported
  - effects[0] state・normalShot・maidSpirit（maxHp）: C-1474（仮説）
- **skill2**: supported
  - effects[0] heal・12 秒ごと: C-1471（確定）
  - effects[1] heal・12 秒ごと: C-1471（確定）、C-1474（仮説）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1472（確定）
  - effects[1] stackChange・burstUse・スタック可能バフの全部: C-1473（仮説）、C-1474（仮説）
  - notes[0] 計算に無関係: 敵の気絶（1 秒）はダメージに関係しない: 根拠なし

## 313 プリバティ：アンカインド・メイド

- **skill1**: supported
  - effects[0] damage・pelletHit・skill: C-0408（確定）、C-0659（確定）、C-0830（確定）、C-0831（確定）
- **skill2**: supported
  - effects[0] timed・normalShot・reloadSpeed: C-1549（確定）
  - effects[1] ammoRefill・pelletHit: C-1561（確定）
  - effects[2] timed・pelletHit・attack: C-1560（確定）、C-1561（確定）
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
  - effects[1] state・fullChargeShot・spyLens（minEffectiveRange）: C-1043（確定）、C-1033（確定）
  - notes[0] 未対応: 近（帯の外）でも、隠しレンズがフルスタック（貫通特化）の間は、攻撃力▲がときどき付き直す（距離ボーナスの乗らない発がきっかけになる）。きっかけの規則が分からないので未対応（plan/design-agent-bunny.md 10 節の 6）: C-1104（確定）、C-1332（仮説）
- **skill2**: partial
  - effects[0] timed・fullChargeShot・pierceDamage（読む: 貫通）: C-1031（確定）、C-1034（確定）
  - effects[1] passive・spyLens のフルスタックの間・pierce: C-1031（確定）
  - effects[2] passive・spyLens のフルスタックの間・attack: C-1034（確定）
  - notes[0] 未対応: 近（帯の外）でも、貫通特化の間は貫通ダメージ▲がときどき付き直す。S1 の攻撃力▲と同じく未対応（plan/design-agent-bunny.md 10 節の 6）: C-1104（確定）、C-1332（仮説）
- **burst**: supported
  - effects[0] timed・burstUse・minEffectiveRange: C-1043（確定）、C-1033（確定）
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

## 321 マルチャーナ

- **skill1**: supported
  - effects[0] heal・lastShot: C-1156（確定）
  - notes[0] 間接（HP）: 最後の弾丸が命中した時の、最終攻撃力が最も高い味方 2 機への受けるHP回復量▲（3 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] heal・burstUse: C-1195（確定）、C-1194（仮説）
- **burst**: noEffect
  - notes[0] 間接（HP）: 保存（超過した回復量を発動者の最大HP の X% まで保存・10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 間接（防御力）: 味方全体への、スキル発動者の防御力に比例した防御力▲（10 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし

## 322 マルチャーナ：マリンスタディ

- **skill1**: supported
  - effects[0] damage・fullBurstStart・additional: C-1292（確定）、C-1301（仮説）
  - effects[1] damage・normalHit・additional: C-1293（確定）
  - notes[0] 計算に無関係: 警戒対象指定の効果 2（対象が生存している時、警戒対象：攻撃力▼・10 秒）は、敵の攻撃力▼なのでダメージに関係しない: 根拠なし
  - notes[1] 前提の外: 敵が破壊された時、対象が警戒対象状態なら、ランダムな敵 1 機に警戒対象指定（追加ダメージ・攻撃力▼）は、敵 1 体の前提では敵が破壊されないので起きない（要件 4.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] state・battleStart・whistle（attack）: C-1291（確定）
  - effects[1] stackChange・battleStart・whistle: C-1291（確定）
  - effects[2] timed・battleStart・elementDamage: C-1291（確定）
  - notes[0] 補足: ラプチャーが 3 機以下の状態を 5 秒維持するたびのホイッスルは、敵 1 体の前提では 5 秒ごとに起きるが、戦闘開始時に上限の 5 スタックで持続して付いているので、値を変えない: C-1291（確定）
  - notes[1] 前提の外: ラプチャーが 6 機以上の状態を 1 秒維持するたびのペンくん緊急出動（敵全体への追加ダメージ・ホイッスルのスタック量 1 個▼）は、敵 1 体の前提では起きない（要件 4.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・elementDamage: C-1294（確定）
  - effects[1] timed・burstUse・attackDamage: C-1294（確定）
  - effects[2] state・burstUse・highRiskTarget（enemyDefenseDown）: C-1294（確定）

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

- **skill1**: supported
  - effects[0] passive・attack: C-1527（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・normalAttackDamage: C-1528（確定）
- **burst**: supported
  - effects[0] burstReentry: C-1529（確定）
  - effects[1] timed・burstUse・maxAmmo: C-1530（確定）
  - effects[2] timed・burstUse・attackDamage: C-1531（確定）

## 350 マスト

- **skill1**: supported
  - effects[0] state・critHit・seaBreeze（enemyDefenseDown）: C-0858（確定）
  - effects[1] timed・自分の HP が閾値以下に下がった時・critDamage: C-0862（確定）
  - effects[2] timed・自分の HP が閾値以下に下がった時・critDamage: C-0862（確定）
  - notes[0] 補足: 海風は通常攻撃のクリティカルの命中 2 回ごとに付き、最後の付与から約 3 秒で全スタックが切れる。実機では会心が 3 秒の間に 2 回無いと途切れて 0 から積み直すが、モデルはクリティカルを期待値で数えるので途切れず、暴風が写すスタックを多めに出す（V-0623）: 根拠なし
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

## 351 アンカー

- **skill1**: noEffect
  - notes[0] 計算に無関係: 最後の弾丸が命中した時の、対象への挑発（5 秒）はダメージに関係しない。付けた時にバーストゲージを溜めない（モランの S2 の、敵に付ける挑発とは違う）: C-1573（確定）
  - notes[1] 間接（防御力）: 最後の弾丸が命中した時の、自分の防御力▲（5 秒）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 戦闘開始時の、敵の発射体を攻撃する時の発射体に与えるダメージ▲（持続）は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 4.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1574（確定）

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

## 361 キロ

- **skill1**: supported
  - effects[0] state・battleStart・nanoCoating: C-1383（確定）
  - notes[0] 前提の外（読む: バリア）: バーストを使った時、ナノコーティング状態でなければ自分に付くナノコーティングは、被弾でナノコーティングが切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）: C-1383（確定）
- **skill2**: noEffect
  - notes[0] 前提の外（読む: バリア）: 通常攻撃 200 回ごとの、ナノコーティング状態の時のバリアの HP 回復は、被弾で減ったバリアを戻してナノコーティングを保つだけで、被弾を扱わないモデルでは何も変えない（要件 4.2 節）: C-1383（確定）
  - notes[1] 前提の外（読む: バリア）: バーストを使った時、ナノコーティング状態でなければ自分に付く使用回数別の次のバリアの HP▲（持続）は、被弾でナノコーティングが切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）: C-1383（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1382（確定）、C-1383（確定）
  - notes[0] 前提の外（読む: バリア）: ナノコーティング状態でなければ自分に付く最大HP▲（20 秒）は、被弾でナノコーティングが切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）: C-1383（確定）

## 380 ネロ

- **skill1**: noEffect
  - notes[0] 計算に無関係: 回復効果が適用された時の、その対象への受けるダメージ▼（5 秒）は防御系でダメージに関係しない: 根拠なし
  - notes[1] 計算に無関係: 回復効果が適用された時の、自分へのネコの恩返し（受けるダメージ▼・5 スタック・5 秒）は防御系でダメージに関係しない。説明文でフルスタックかを読むのは、バーストの受ける HP 回復量▲の条件だけ: 根拠なし
- **skill2**: noEffect
  - notes[0] 前提の外: 攻撃を受けた時、30% の確率の、対象への受けるダメージ▲（5 秒）は、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: 根拠なし
  - notes[1] 前提の外: 大きくて乱暴なネコ状態で攻撃を受けた時、30% の確率の、対象への追加ダメージは、被弾を扱わないので起きない（要件 4.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: 根拠なし
  - notes[2] 間接（HP）: 戦闘開始時の、自分の最大HP▲（持続）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1616（確定）
  - notes[0] 計算に無関係: 自分への「ヘイト：敵全体を挑発」（15 秒）はダメージに関係しない（ティアの S2・シンの S1 の「自分にヘイト：敵全体を挑発」はゲージを溜めない）: 根拠なし
  - notes[1] 間接（HP）: 自分がネコの恩返しのフルスタック状態の時の、自分への大きなネコ（受ける HP 回復量▲・15 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く。ネコの恩返しは回復を受けた時に付くので、回復の無い編成では付かない）: 根拠なし

## 381 ビスケット

- **skill1**: supported
  - effects[0] timed・fullBurstEnd・normalCritRate: C-1222（確定）
  - effects[1] heal・fullBurstEnd: C-1224（仮説）
- **skill2**: noEffect
  - notes[0] 前提の外: 防御型の味方の HP が 50% 以下の時の、その味方への無敵と回復（戦闘中 2 回）は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードの的の攻撃は操作キャラにだけ当たる（C-0551）ので、防御型の味方を操作しなければ起きない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attack: C-1223（確定）
  - effects[1] heal・burstUse: C-1225（仮説）
  - notes[0] 前提の外: 遮蔽物が破壊された味方ランダムに 2 機への遮蔽物の復活は、被弾を扱わないので遮蔽物が壊れず、起きない（要件 5.2 節）: 根拠なし

## 382 レオナ

- **skill1**: supported
  - effects[0] state・normalShot・roar（critRate）: C-1443（確定）
  - effects[1] timed・normalShot・maxEffectiveRange: C-1447（確定）、C-1451（仮説）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・hitRate: C-1466（仮説）
  - effects[1] timed・fullBurstStart・pelletCount: C-1444（確定）
- **burst**: supported
  - effects[0] timed・burstUse・critDamage: C-1445（確定）
  - effects[1] timed・burstUse・critRate: C-1446（確定）

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

## 392 ライ

- **skill1**: supported
  - effects[0] burstGauge・normalShot: C-1572（確定）
  - notes[0] 計算に無関係: デコイが存在する時の自分へのデコイ回復は、デコイの HP を回復するだけで、与ダメージを変えない: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（デコイ）: 戦闘開始時のデコイ（分身）は、それ自体は与ダメージを変えない（デコイを読む効果のある編成でだけ効く）: 根拠なし
- **burst**: noEffect
  - notes[0] 計算に無関係: 自分へのヘイト（敵全体を挑発）と受けるダメージ▼はダメージに関係しない。挑発はバースト使用時のチェーンの中で付くので、ゲージを入れたとしても、ゲージの溜まらない間で効かない（入れるかは確かめていない）: 根拠なし
  - notes[1] 計算に無関係: デコイが存在する時の自分へのデコイ持続回復は、デコイの HP を回復するだけで、与ダメージを変えない: 根拠なし

## 400 ギルティ

- **skill1**: supported
  - effects[0] state・normalShot・mindIfIBorrowThis（attack）: C-0873（確定）
- **skill2**: supported
  - effects[0] stackChange・normalShot・スタック可能バフの全部: C-0873（確定）、C-1506（確定）、C-1507（仮説）
  - effects[1] timed・normalShot・attack: C-0873（確定）
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

## 404 ギルティ：マイティバニー

- **skill1**: supported
  - effects[0] timed・battleStart・attack: C-1608（確定）
  - effects[1] state・battleStart・bunnyModeStance: C-1608（確定）
  - notes[0] 前提の外: フルチャージ状態を 1 秒以上維持した時のバニーモードの切り替え（スタンスならエンゲージ、でなければスタンス）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）。エンゲージは付かない: C-0839（確定）、C-1608（確定）
  - notes[1] 前提の外: 自分にエンゲージが付いた時の、スタンス状態の味方全体へのエンゲージと、自分にスタンスが付いた時の、エンゲージ状態の味方全体へのスタンスは、どちらも起きない（エンゲージはどの枠にも付かず、エンゲージ状態の味方がいない）: C-0839（確定）、C-1608（確定）
- **skill2**: supported
  - effects[0] timed・battleStart・attackDamage: C-1608（確定）
  - effects[1] timed・battleStart・chargeDamage: C-1608（確定）
  - effects[2] damage・fullChargeShot・additional: C-1608（確定）、C-1609（確定）
  - notes[0] 前提の外: エンゲージ状態の時のチェーンリリースの効果 1・2（通常攻撃とマイティストンプを防御力無視ダメージにする）は、エンゲージが付かないので起きない: C-0839（確定）、C-1608（確定）
  - notes[1] 前提の外: エンゲージ状態の時のチェーンリリースの効果 3（フルチャージ攻撃が命中した時の防御力無視ダメージ）は、エンゲージが付かないので起きない: C-0839（確定）、C-1608（確定）
- **burst**: supported
  - effects[0] weaponChange・burstUse: C-1609（確定）
  - effects[1] timed・burstUse・chargeDamage: C-1609（確定）
  - effects[2] timed・burstUse・attackDamage: C-1609（確定）

## 405 シン：スウィフトバニー

- **skill1**: unsupported
  - notes[0] 未対応: 戦闘開始時の、自分への攻撃力▲（持続）は未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: フルチャージした時、スウィフトキャロット状態でなければ自分に付く通常攻撃ダメージ倍率▲（1 発間）は未対応（撮影の機会が無い）: 根拠なし
  - notes[2] 未対応: 同じきっかけの自分へのチャージダメージ▲（1 発間）は未対応（撮影の機会が無い）: 根拠なし
  - notes[3] 前提の外: フルチャージ状態を 1 秒以上維持した時のバニーモードの切り替えは、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）。戦闘開始時にバニーモード：スタンスが付き、戦闘の終わりまでスタンスのまま: C-0839（確定）
  - notes[4] 前提の外: 自分にバニーモード：エンゲージ（スタンス）が適用された時に、スタンス（エンゲージ）状態の味方全体へ同じ状態を広げる 2 行は、エンゲージへの切り替えが起きず、エンゲージ状態の味方が現れないので起きない（要件 4.2 節）: C-0839（確定）
- **skill2**: unsupported
  - notes[0] 未対応: バニーモード：スタンス状態の時のみの、自分へのエンハンスバレットのクリティカル確率▲（持続・解除不可）は未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: 同じエンハンスバレットのクリティカルダメージ▲（持続・解除不可）は未対応（撮影の機会が無い）: 根拠なし
  - notes[2] 未対応: バーストスキル使用時の、自分へのスウィフトキャロット（使用武器変更・5 秒）は未対応（撮影の機会が無い。S2 のスロットからの変更で、変更後の武器のレートがデータに無い）: 根拠なし
  - notes[3] 前提の外: バニーモード：エンゲージ状態の時のみの、自分へのノイズバレット（通常攻撃とスウィフトキャロットを防御力無視ダメージにする）は、エンゲージにならない（S1 の notes）ので効かない（要件 4.2 節）: C-0839（確定）
- **burst**: unsupported
  - notes[0] 未対応: 自分への攻撃力▲（5 秒）は未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: 敵全体へのバーストスキルダメージは未対応（撮影の機会が無い）: 根拠なし
  - notes[2] 未対応: 自分がバニーモード：スタンス状態の時の、同じ敵への追加ダメージは未対応（撮影の機会が無い）: 根拠なし
  - notes[3] 前提の外: 自分がバニーモード：エンゲージ状態の時の、同じ敵への防御力無視ダメージは、エンゲージにならない（S1 の notes）ので起きない（要件 4.2 節）: C-0839（確定）

## 411 フローラ

- **skill1**: supported
  - effects[0] heal・battleStart: C-1236（仮説）
  - effects[1] stackChange・normalShot・スタック可能バフの全部: C-1236（仮説）
  - notes[0] 間接（HP）: 自分と両隣の味方の受けるHP回復量▲（5 スタック・持続）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] state・両隣の味方のうち 1 機の HP が閾値以下に下がった時・barrier: C-1236（仮説）
  - effects[1] timed・両隣の味方のうち 1 機の HP が最大になった時・trueDamage: C-1236（仮説）
  - notes[0] 前提の外: 被弾で減った両隣の味方の HP が持続回復で最大に戻った時の防御力無視ダメージ▲と、被弾で両隣の味方の HP が 90% 以下になった時のバリアは、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは、操作キャラ（両隣にいれば）が的の攻撃を受けると起きる（C-0551。V-0776）: 根拠なし
- **burst**: supported
  - effects[0] heal・burstUse: C-1236（仮説）
  - effects[1] timed・burstUse・trueDamage: C-1236（仮説）
- **宝物版 skill1**: supported
  - effects[0] state・battleStart・heartOfPeace: C-1232（確定）
  - effects[1] heal・battleStart: C-1234（仮説）
  - effects[2] stackChange・normalShot・スタック可能バフの全部: C-1231（確定）
  - effects[3] timed・burstStage2Enter・maxHpOnly: C-1232（確定）
  - notes[0] 間接（HP）: 自分と両隣の味方の受けるHP回復量▲（5 スタック・持続）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **宝物版 skill2**: supported
  - effects[0] state・両隣の味方のうち 1 機の HP が閾値以下に下がった時・barrier: C-1232（確定）
  - effects[1] timed・両隣の味方のうち 1 機の HP が最大になった時・trueDamage: C-1234（仮説）
  - effects[2] timed・barrier が適用された時・attack（読む: バリア）: C-1232（確定）
  - notes[0] 前提の外: 被弾で減った両隣の味方の HP が持続回復で最大に戻った時の防御力無視ダメージ▲と、被弾で両隣の味方の HP が 90% 以下になった時のバリアは、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは、操作キャラ（両隣にいれば）が的の攻撃を受けると起きる（C-0551。V-0776）: 根拠なし
- **宝物版 burst**: supported
  - effects[0] heal・burstUse: C-1235（仮説）
  - effects[1] timed・burstUse・trueDamage: C-1235（仮説）
  - effects[2] timed・burstUse・attack: C-1233（確定）

## 412 トリナ

- **skill1**: partial
  - effects[0] heal・fullBurstEnd: C-1310（確定）
  - notes[0] 未対応: フルチャージ攻撃時の、残りの HP の割合が最も低い味方 2 機が HP 30% 以下・50% 以下の時の回復は未対応（対象の HP の割合の閾値の条件の語彙が無い）。被弾が無くても、最大HP のみ▲ で割合が下がった味方に起きうる（S2 とバーストの最大HP のみ▲ を受けた電撃 AR のアタッカーは 50% を下回りうる）。回復で、回復を受けた時を読む味方がいなければダメージに効かない: C-1311（仮説）
- **skill2**: supported
  - effects[0] timed・battleStart・maxHpOnly: C-1309（仮説）
  - effects[1] timed・burstUse・attackDamage: C-1305（確定）
  - effects[2] timed・burstUse・reloadSpeed: C-1305（確定）
  - notes[0] 計算に無関係: 戦闘開始時の、部隊の一番左側にいる電撃コードの AR の味方 1 機への無敵（2 秒）はダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・maxHpOnly: C-1309（仮説）
  - effects[1] timed・burstUse・attackDamage: C-1306（確定）
  - effects[2] timed・burstUse・allEnemiesBurstDamage: C-1306（確定）
  - effects[3] timed・burstUse・hitRate: C-1308（仮説）
  - effects[4] timed・burstUse・maxAmmo: C-1307（確定）
  - notes[0] 前提の外: ニケを除いた敵が 2 機以上の時の、根張りから根腐れへの変化（『敵全体に』で終わるバーストスキルダメージ▲が値 10 に下がる）は、敵 1 体では起きない: 根拠なし

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

## 432 アリア

- **skill1**: supported
  - effects[0] timed・fullBurstStart・critDamage: C-1452（確定）
- **skill2**: supported
  - effects[0] timed・lastShot・critRate: C-1453（確定）
- **burst**: supported
  - effects[0] timed・burstUse・hitRate: C-1554（確定）、C-1557（確定）
  - notes[0] 間接（バリア）: 味方全体へのバリア（スキル発動者の最終最大HP の X%・10 秒）は、それ自体は与ダメージを変えない（バリアを読む効果のある編成でだけ効く。この付与は定義していないので、モデルでは味方がバリア適用状態にならない。バリアの量は要件 5.2 節の外）: 根拠なし

## 441 アビスタ

- **skill1**: supported
  - effects[0] state・fullBurstEnd・aftershow（attack）: C-1593（確定）
  - effects[1] removeState・fullBurstStart・aftershow: C-1593（確定）
  - effects[2] removeState・fullBurstEnd・stargazer: C-1592（確定）
  - notes[0] 計算に無関係: フルバーストタイムの終わりの、自分の HP の持続回復（スキル発動者の最終最大HP の X%・1 秒間隔・10 秒）は、ダメージに関係しない（自分にだけ付き、アビスタに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullBurstStart・projectileExplosionDamage: C-1592（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-1592（確定）
  - notes[0] 間接（HP）: フルバーストタイムの発動の時、自分の HP が 25% 以上でスターゲイザー状態なら自分に付く現在の HP 20%▼は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く。アビスタに HP を読む効果は無く、S1 の回復で戻る）: 根拠なし
- **burst**: supported
  - effects[0] burstReentry: C-1591（確定）
  - effects[1] state・burstUse・stargazer（maxHp）: C-1592（確定）

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
  - effects[6] weaponChange・burstUse: C-0896（確定）、C-0897（確定）、C-1566（確定）
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

- **skill1**: supported
  - effects[0] heal・fullChargeShot: C-0913（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-0719（確定）、C-0750（確定）
  - effects[2] timed・fullChargeShot・chargeSpeed: C-1341（確定）
  - notes[0] 前提の外: ナノ粒子投与（バーストの、戦闘不能の味方が 3 機以上の分岐）を使用した時の、バーストスキルのクールタイム▲とナノ粒子消耗：防御力▲は、味方が倒れない前提では起きない（要件 5.2 節）: C-0443（範囲外）
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

## 502 エレグ：ブーム・アンド・ショック

- **skill1**: supported
  - effects[0] state・battleStart・ghostPossession: C-1312（確定）
  - effects[1] state・6 秒ごと・ghostPossession: C-1312（確定）
  - effects[2] counterChange・teamHit・ghostCapture: C-1312（確定）
  - effects[3] removeState・teamHit・ghostPossession: C-1312（確定）
  - effects[4] passive・ghostCapture 1 以上の間・attack: C-1313（確定）
  - effects[5] passive・ghostCapture 4 以上の間・elementDamage: C-1313（確定）
  - notes[0] 補足: 憑依は説明文では敵（ランダムな 1 機）に付く。モデルが要るのはキャプチャーの命中を数える窓だけなので、敵 1 体の前提で自分の状態として持つ: C-1312（確定）
- **skill2**: supported
  - effects[0] timed・burstUse・attack: C-1314（確定）
  - effects[1] damage・teamHit・skill: C-1314（確定）
- **burst**: supported
  - effects[0] damage・burstUse・skill: C-1315（確定）
  - effects[1] counterChange・burstUse・ghostCapture（減少）: C-1315（確定）
  - effects[2] damage・burstUse・skill: C-1315（確定）
  - effects[3] counterChange・burstUse・ghostCapture（減少）: C-1315（確定）
  - notes[0] 補足: S2 のダメージとバーストの順番の攻撃がバーストゲージを溜めるかは確かめていない（溜めない形で回す）: 根拠なし

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

## 513 リトルマーメイド

- **skill1**: supported
  - effects[0] cooldownReduction・fullBurstEnd: C-1274（確定）
  - effects[1] timed・fullBurstStart・attackDamage: C-1274（確定）
  - effects[2] burstGauge・teamAmmo: C-1271（確定）
  - notes[0] 前提の外: フォーカス状態（操作キャラ）の時の、味方全体の射撃集中は、敵 1 体の前提では与ダメージを変えない（狙う敵をそろえる効果。敵の構造に関わる）: 根拠なし
- **skill2**: supported
  - effects[0] state・battleStart・bubble（damageTaken）: C-1270（確定）
  - effects[1] damage・1 秒ごと・skill: C-1273（確定）
  - effects[2] damage・teamAmmo・skill: C-1272（確定）
  - notes[0] 補足: バブルバースト（通常攻撃が 50 回命中した時、対象がバブル状態なら、受けるダメージ▲・持続とバブル解除）は、バブルと同じ値の受けるダメージ▲に替わるだけなので、敵の受けるダメージ▲の窓は effects[0] のまま変わらない: C-1270（確定）
  - notes[1] 計算に無関係: バブルバーストの気絶（3 秒）は、それ自体は与ダメージを変えない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1275（確定）
  - effects[1] ammoRefill・burstUse: C-1275（確定）
  - effects[2] timed・burstUse・attack: C-1275（確定）

## 514 グレイブ

- **skill1**: supported
  - effects[0] ammoDecrease・prediction が終了した時: C-1120（確定）
  - effects[1] state・prediction が終了した時・heatEmission（reloadRatio）: C-1120（確定）
  - effects[2] passive・heatEmission の間・pierceDamage（読む: 貫通）: C-1121（確定）
  - effects[3] allyGaugeAdd: C-1154（確定）、C-1120（確定）、C-0244（確定）、C-1186（確定）
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

## 515 シンデレラ：クリスタルウェーブ

- **skill1**: supported
  - effects[0] timed・battleStart・attackDamage: C-1248（確定）
  - effects[1] damage・5 秒ごと・skill: C-1249（確定）
  - effects[2] burstGauge・teamAmmo: C-1250（確定）
  - notes[0] 前提の外: 最大弾数のリロードが完了した時、変更準備状態なら、狙撃モード（チャージ時間 1 秒・最大装弾数 15 発・フルチャージで弾薬消費 40 発・貫通特化）への使用武器変更は、オートの射撃では狙撃モードに入らない（変更準備は撃ち切りのリロードの前に最後の弾丸で外れるか 6 秒で切れ、弾が残ったまま始まるハイドのリロードは的のジャンプの明けで止まって込め終わらない）ので起きない（要件 4.2 節）。モデルではずっと基礎の武器（MG）で撃つ: C-1253（確定）
  - notes[1] 前提の外: 最大弾数のリロードが完了した時の変更準備（リロード時間を 3 秒に固定・6 秒・最後の弾丸で攻撃時に解除）は、オートの射撃では効く回が無い（撃ち切りのリロードは最後の弾丸で外れるか 6 秒で切れた後に始まり、ハイドのリロードは込め終わらずに止まる）ので、モデルでは付けない（要件 4.2 節）: C-1253（確定）
- **skill2**: supported
  - effects[0] timed・battleStart・attack: C-1248（確定）
  - effects[1] timed・battleStart・coreDamage: C-1248（確定）
  - effects[2] damage・fullBurstStart・skill: C-1252（確定）
  - notes[0] 間接（デコイ）: 戦闘開始時とバースト使用時のデコイ（分身）は、それ自体は与ダメージを変えない（デコイを読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 前提の外: 狙撃モード適用時のデストロイ（パーツダメージ▲）は、パーツを扱わず（要件 4.2 節）、オートの射撃では狙撃モードにもならない（skill1 の notes）ので効かない: C-1253（確定）
  - notes[2] 前提の外: フルバーストタイムが発動した時、直前に自分がバーストを使っていて狙撃モードなら、敵全体（パーツ含む）への倍率ダメージは、オートの射撃では狙撃モードにならない（skill1 の notes）ので起きない（要件 4.2 節）: C-1253（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1251（確定）
  - effects[1] timed・burstUse・attack: C-1251（確定）
  - effects[2] burstDamage・skill: C-1251（確定）

## 520 ブレッディ

- **skill1**: supported
  - effects[0] timed・fullBurstStart・attack: C-1279（確定）
  - effects[1] state・sustainedDamage 増加効果が適用された時・lingeringTaste（chargeSpeed）: C-1276（確定）
  - effects[2] state・distributedDamage 増加効果が適用された時・recommendedTaste（chargeSpeed）: C-1277（確定）、C-1278（仮説）、C-1280（仮説）
  - notes[0] 補足: オススメの味の間にやみつきの味が付いた時のオススメの味の消去は撮っていない（オススメの味が付くのはやみつきの味の外だけで、その後に持続ダメージ▲が付く編成）。説明文どおり、切り替えの組で書いた: 根拠なし
- **skill2**: supported
  - effects[0] timed・fullChargeShot・damageTaken: C-1281（確定）
  - effects[1] dot・fullChargeShot: C-1281（確定）
  - effects[2] timed・fullChargeShot・attackDamage: C-1282（確定）
  - effects[3] damage・fullChargeShot・distributed: C-1282（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1283（確定）
  - effects[1] timed・burstUse・dotEffect: C-1283（確定）
  - effects[2] timed・burstUse・attack: C-1283（確定）

## 521 クラスト

- **skill1**: supported
  - effects[0] state・partialChargeShot・maillard（attack）: C-1594（確定）、C-1001（確定）
  - effects[1] stateExtend・fullChargeShot: C-1595（確定）
  - notes[0] 前提の外: フルチャージ状態を 1 秒以上 3 回維持した時の味方全体のブランチング（スキル発動者基準の攻撃力▲・メイラード解除）と、フルチャージして攻撃した時のブランチングの維持時間▲・メイラードの付与に付いたブランチング解除は、オートの射撃ではフルチャージを保たず、ブランチングが付かないので起きない（要件 4.2 節）: C-0839（確定）
- **skill2**: supported
  - effects[0] removeDebuff・partialChargeShot・デバフ 1 個: C-1594（確定）、C-0979（確定）
  - effects[1] timed・fullBurstStart・attack: C-1596（確定）、C-0839（確定）
  - notes[0] 間接（防御力）: たっぷりクッキングのスキル発動者基準の防御力▲は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 前提の外: フルチャージ状態を 1 秒以上維持して 3 回攻撃した時のたっぷりクッキング（防御力▲・デバフ効果解除 1 個）は、オートの射撃ではフルチャージを保たないので起きない（要件 4.2 節）: C-0839（確定）
- **burst**: supported
  - effects[0] timed・burstUse・attackDamage: C-1597（確定）
  - effects[1] timed・burstUse・distributedDamage: C-1597（確定）
  - notes[0] 前提の外: ブランチング状態の時の味方全体の持続ダメージ▲は、ブランチングが付かない（フルチャージ状態を 1 秒以上維持するきっかけがオートの射撃で起きない）ので起きない（要件 4.2 節）: C-0839（確定）

## 532 ソラ

- **skill1**: supported
  - effects[0] passive・healDealt: C-1612（仮説）
- **skill2**: noEffect
  - notes[0] 前提の外: 自分を含む味方の誰かがパーツを破壊した時の、味方全体の超過HP回復量保存（5 スタック・15 秒）とスキル発動者基準の攻撃力▲（15 秒）は、パーツなしの前提では起きない（要件 4.2 節）: C-0443（範囲外）
- **burst**: supported
  - effects[0] heal・burstUse: C-1612（仮説）
  - effects[1] removeDebuff・burstUse・デバフ 1 個: C-1612（仮説）、C-0979（確定）

## 550 ベイ

- **skill1**: noEffect
  - notes[0] 計算に無関係: バーストスキル使用時の、味方全体の受けるダメージ偏差分配（自分が生存している限り持続）は、防御系でダメージに関係しない: 根拠なし
  - notes[1] 間接（防御力）: バーストスキル使用時の、味方全体のスキル発動者基準の防御力▲（自分が生存している限り持続）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: バーストスキル使用時の、自分の遮蔽物の受けるダメージ偏差分配（自分が生存している限り持続）は、防御系でダメージに関係しない: 根拠なし
  - notes[1] 間接（遮蔽物）: フルバーストタイムが終了した時の、自分の遮蔽物の HP 持続回復（1 秒間隔・5 秒）は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: noEffect
  - notes[0] 間接（遮蔽物）: 自分の遮蔽物の最大 HP▲（20 秒）は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 味方全体の受けるダメージ▼（10 秒）は防御系でダメージに関係しない: 根拠なし
- **宝物版 skill1**: unsupported
  - notes[0] 計算に無関係: バーストスキル使用時の、味方全体の受けるダメージ偏差分配（自分が生存している限り持続）は、防御系でダメージに関係しない: 根拠なし
  - notes[1] 間接（防御力）: バーストスキル使用時の、味方全体のスキル発動者基準の防御力▲（自分が生存している限り持続）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
  - notes[2] 未対応: フルチャージして攻撃した時の、自分を除く味方全体の回復（スキル発動者の最終最大HP の X%）は未対応（回復の対象に「自分を除く」の語彙が無い）。受けた味方の「回復効果が適用された時」を起こすので、その効果を持つ味方のいる編成では与ダメージに効きうる: 根拠なし
- **宝物版 skill2**: noEffect
  - notes[0] 計算に無関係: バーストスキル使用時の、自分の遮蔽物の受けるダメージ偏差分配（自分が生存している限り持続）は、防御系でダメージに関係しない: 根拠なし
  - notes[1] 間接（遮蔽物）: フルバーストタイムが終了した時の、自分の遮蔽物の HP 持続回復（1 秒間隔・5 秒）は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
  - notes[2] 前提の外: バースト 1 段階突入時に自分の遮蔽物が破壊された状態なら自分に付く回復は、被弾を扱わないので遮蔽物が壊れず、起きない（要件 4.2 節）: 根拠なし
- **宝物版 burst**: noEffect
  - notes[0] 前提の外: 自分の遮蔽物が破壊された状態の時の遮蔽物の復活（戦闘中 1 回）は、被弾を扱わないので遮蔽物が壊れず、起きない（要件 4.2 節）: 根拠なし
  - notes[1] 間接（遮蔽物）: 自分の遮蔽物の最大 HP▲（20 秒）は、それ自体は与ダメージを変えない（遮蔽物を読む効果のある編成でだけ効く）: 根拠なし
  - notes[2] 計算に無関係: 味方全体の受けるダメージ▼（10 秒）は防御系でダメージに関係しない: 根拠なし

## 551 クレイ

- **skill1**: supported
  - effects[0] state・normalShot・victoriousBattleCry（trueDamage）: C-1602（確定）
  - notes[0] 前提の外: ヴィクトリークライと同時に付く、敵の発射体を攻撃する時の発射体に与えるダメージ▲は、敵の発射体を撃つ場面を扱わないのでダメージに関係しない（要件 5.2 節）: C-0443（範囲外）
- **skill2**: supported
  - effects[0] passive・victoriousBattleCry の間・attack: C-1603（確定）
  - notes[0] 計算に無関係: バースト 1 段階突入時の、味方全体へのデバフ効果免疫は、ダメージに関係しない: 根拠なし
- **burst**: supported
  - effects[0] timed・burstUse・trueDamage: C-1604（確定）
  - effects[1] timed・burstUse・trueDamageConversion: C-1604（確定）

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

## 580 ファントム

- **skill1**: supported
  - effects[0] state・normalHit・callingCard（enemyDefenseDown）: C-1480（仮説）
  - effects[1] state・normalHit・thiefsDagger（hitRate）: C-1480（仮説）
  - effects[2] timed・normalHit・attackDamage: C-1480（仮説）
- **skill2**: supported
  - effects[0] damage・thiefsDagger のフルスタック・additional: C-1480（仮説）
  - effects[1] removeState・thiefsDagger のフルスタック・callingCard: C-1480（仮説）
  - effects[2] state・thiefsDagger のフルスタック・thiefsVision（distributedDamage）: C-1480（仮説）
  - effects[3] removeState・burstUse・thiefsVision: C-1480（仮説）
  - effects[4] timed・normalShot・attack: C-1480（仮説）
  - effects[5] timed・normalShot・distributedDamage: C-1480（仮説）
- **burst**: supported
  - effects[0] burstDamage・distributed: C-1479（確定）
- **宝物版 skill1**: supported
  - effects[0] state・normalHit・callingCard（enemyDefenseDown）: C-1477（確定）
  - effects[1] state・normalHit・thiefsDagger（hitRate）: C-1477（確定）
  - effects[2] state・normalHit・thiefsDagger: C-1477（確定）
  - effects[3] timed・normalHit・attackDamage: C-1477（確定）
- **宝物版 skill2**: supported
  - effects[0] damage・thiefsDagger のフルスタック・additional: C-1478（確定）
  - effects[1] removeState・thiefsDagger のフルスタック・callingCard: C-1478（確定）
  - effects[2] state・thiefsDagger のフルスタック・thiefsVision（distributedDamage）: C-1478（確定）
  - effects[3] removeState・burstUse・thiefsVision: C-1480（仮説）
  - effects[4] damage・thiefsDagger のフルスタック・distributed: C-1478（確定）
  - effects[5] timed・normalShot・attack: C-1478（確定）
  - effects[6] timed・normalShot・distributedDamage: C-1478（確定）
- **宝物版 burst**: supported
  - effects[0] burstDamage・distributed: C-1480（仮説）
  - effects[1] timed・burstUse・damageTaken: C-1480（仮説）
  - effects[2] timed・burstUse・maxAmmo: C-1480（仮説）

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

## 583 アルカナ：フォーチュンメイト

- **skill1**: supported
  - effects[0] timed・fullBurstEnd・attack: C-1287（確定）
  - effects[1] state・happyMemory が適用された時・youthRecord（normalAttackDamage）: C-1285（確定）
  - effects[2] removeState・fullBurstEnd・memoryMaking: C-1286（確定）
  - effects[3] removeState・fullBurstEnd・youthRecord: C-1286（確定）
- **skill2**: supported
  - effects[0] ammoRefill・normalShot: C-1284（確定）
  - effects[1] state・normalShot・happyMemory（pelletCount）: C-1284（確定）、C-1285（確定）
  - effects[2] state・normalShot・preciousMemory（attack）: C-1284（確定）、C-1285（確定）
  - effects[3] removeState・fullBurstEnd・happyMemory: C-1286（確定）
  - effects[4] removeState・fullBurstEnd・preciousMemory: C-1286（確定）
  - effects[5] timed・burstUse・attackDamage: C-1288（確定）
- **burst**: supported
  - effects[0] state・burstUse・memoryMaking（critRate・attackDamage）: C-1289（確定）、C-1290（仮説）
  - effects[1] ammoRefill・burstUse: C-1289（確定）
  - effects[2] burstDamage・skill: C-1289（確定）

## 590 モリー

- **skill1**: supported
  - effects[0] state・battleStart・struggle: C-1590（仮説）
  - notes[0] 前提の外（読む: バリア）: バーストを使った時、必死の抵抗状態でなければ自分に付く必死の抵抗は、被弾で必死の抵抗が切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）: C-1590（仮説）
  - notes[1] 前提の外（読む: バリア）: 必死の抵抗が終了した時の自分の最大HP▲（5 スタック・持続）は、被弾で必死の抵抗が切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）。起きても、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: C-1590（仮説）
- **skill2**: noEffect
  - notes[0] 計算に無関係: 通常攻撃が 60 回命中した時の、必死の抵抗状態なら対象に付く挑発（4 秒）は、ダメージに関係せず、付けたときにもバーストゲージを溜めない: C-1589（確定）
  - notes[1] 前提の外: 味方（自分を含む）がパーツを破壊した時の、味方全体への持続ダメージ▲（5 スタック・15 秒）と、攻撃力が最も高い敵 1 機への持続ダメージ（1 秒間隔・15 秒）は、射撃場の敵にパーツが無いので起きない: C-0443（範囲外）
- **burst**: supported
  - effects[0] timed・burstUse・sustainedDamage: C-1588（確定）
  - notes[0] 前提の外（読む: バリア）: 必死の抵抗状態の時の、自分のバリアの HP の回復は、被弾で減ったバリアを戻して必死の抵抗を保つだけで、被弾を扱わないモデルでは何も変えない（要件 4.2 節）: C-1590（仮説）
  - notes[1] 前提の外（読む: バリア）: 必死の抵抗状態でなければ自分に付く最大HP▲（10 秒）は、被弾で必死の抵抗が切れたときだけ起きるので、被弾を扱わないモデルでは起きない（要件 4.2 節）: C-1590（仮説）

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

## 800 マキマ

- **skill1**: noEffect
  - notes[0] 前提の外: 20 回攻撃を受けた時の、味方全体のリロード速度▲・防御力▲（10 秒）は、被弾を扱わないので起きない（要件 5.2 節）。射撃場の 3 分モードでは的の攻撃で起きうる（C-0551）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 通常攻撃で 120 回攻撃した時の、自分へのヘイト（敵全体を挑発・3 秒）は未対応（付けた時にバーストゲージを溜めるかを撮っていない。撮影の機会が無い。同じ形のティアの S2・デルタ：ニンジャシーフの S2 は溜めない（C-0505・C-1583））: 根拠なし
  - notes[1] 前提の外: 戦闘不能に至る攻撃を受けた時の、自分への不屈（7 秒・戦闘中 1 回）とバーストスキルのクールタイム▼は、被弾を扱わず味方が倒れない前提なので起きない（要件 4.2 節）: 根拠なし
- **burst**: noEffect
  - notes[0] 間接（貫通）: 自分への貫通特化（10 秒）は、それ自体は与ダメージを変えない（貫通を読む効果のある編成でだけ効く）: 根拠なし
  - notes[1] 計算に無関係: 自分の吸収回復（攻撃ダメージの X% 回復・10 秒）は、ダメージに関係しない（自分にだけ付き、マキマに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない）: 根拠なし
  - notes[2] 前提の外: 自分が不屈状態の時の、自分の受ける HP 回復量▲（10 秒）は、不屈が起きない（S2 の notes）ので効かない（要件 4.2 節）: 根拠なし

## 801 パワー

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージして攻撃した時の、自分への血の魔人（攻撃力▲・5 スタック・3 秒）は未対応（撮影の機会が無い）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: 通常攻撃で 18 回攻撃した時、血の魔人のフルスタック状態なら自分に付く弾丸チャージ（100%・戦闘中 1 回）は未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 前提の外: 同じきっかけの自分の爆発範囲▲（10 秒）は、敵 1 体では複数の敵へのヒットを増やすだけで起きない: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 最終攻撃力が最も高い敵 1 機へのバーストスキルダメージは未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: 自分が血の魔人のフルスタック状態の時の、同じ敵への追加ダメージは未対応（撮影の機会が無い）: 根拠なし

## 802 姫野

- **skill1**: unsupported
  - notes[0] 未対応: フルチャージ攻撃が命中した時の、対象への防御力▼（3 秒）は未対応（撮影の機会が無い）: 根拠なし
- **skill2**: unsupported
  - notes[0] 未対応: スナイパーライフルを持つ味方全体への攻撃力▲（10 秒）は未対応（きっかけの書かれていないクールタイムごとのアクティブで、周期を録画で読んでいない。撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: 同じ発動の、スナイパーライフルを持つ味方全体への最大装弾数▲（10 秒）は未対応（攻撃力▲と同じ理由）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 自分を除く最終攻撃力が最も高い味方 1 機への、チャージダメージ▲（10 秒）は未対応（撮影の機会が無い）: 根拠なし
  - notes[1] 未対応: 同じ味方へのクリティカル確率▲（10 秒）は未対応（撮影の機会が無い）: 根拠なし

## 810 2B

- **skill1**: supported
  - effects[0] timed・burstUse・maxHp: C-1374（確定）
  - effects[1] timed・burstUse・maxHp: C-1374（確定）
  - effects[2] timed・burstUse・maxHp: C-1374（確定）
- **skill2**: supported
  - effects[0] damage・normalShot・skill: C-1377（確定）、C-1439（確定）
  - effects[1] timed・battleStart・attack（読む: HP）: C-1374（確定）
- **burst**: supported
  - effects[0] burstDamage・distributed: C-1375（確定）
  - effects[1] damage・burstUse・additional: C-1376（確定）

## 811 A2

- **skill1**: supported
  - effects[0] timed・burstUse・chargeDamage: C-1102（確定）
- **skill2**: supported
  - effects[0] damage・fullChargeShot・additional: C-0407（仮説）
  - notes[0] 前提の外: パーツダメージ▲はパーツを扱わないので効かない: C-0443（範囲外）
- **burst**: supported
  - effects[0] state・burstUse・modeB（attack・chargeSpeed・fireStanceScale）: C-1100（確定）
    - contents[2] fireStanceScale: C-1155（仮説）
  - effects[1] currentHpDown・modeB の間 1 秒ごと（付いた時から）: C-1101（確定）

## 812 パスカル

- **skill1**: unsupported
  - notes[0] 未対応: 10 回射撃した時の、最終防御力が最も高い味方 1 機の回復（スキル発動者の最終最大HP の X%）は未対応（最終防御力の順位で回復の対象を選ぶ語彙が無い）。受けた味方の「回復効果が適用された時」を起こすので、その効果を持つ味方のいる編成では与ダメージに効きうる: 根拠なし
- **skill2**: noEffect
  - notes[0] 間接（HP）: バースト I 段階突入時の、残りの HP の値が最も低い味方 3 機への受けるHP回復量▲（10 秒）は、それ自体は与ダメージを変えない（HP を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: unsupported
  - notes[0] 未対応: 残りの HP の値が最も低い味方 3 機の回復（スキル発動者の最終最大HP の X%）は未対応（HP の値（割合ではない）の順位で回復の対象を選ぶ語彙が無い）。受けた味方の「回復効果が適用された時」を起こすので、その効果を持つ味方のいる編成では与ダメージに効きうる: 根拠なし

## 820 レム

- **skill1**: supported
  - effects[0] timed・normalHit・attack: C-1490（確定）
  - notes[0] 前提の外: バーストスキルを使用した時の、味方全体への HP 回復均等分配（10 秒）は、被弾で HP が減った時に効く（被弾なしの前提の外）: 根拠なし
- **skill2**: noEffect
  - notes[0] 計算に無関係: 戦闘開始時の自分の吸収回復（攻撃ダメージの X% 回復・持続）は、ダメージに関係しない（自分にだけ付き、レムに回復を受けた時の効果は無いので、どの味方のスキルの発動も変えない。味方への分け合いは notes[1] で、前提の外）: 根拠なし
  - notes[1] 前提の外: 戦闘開始時の、自分と最終攻撃力が最も高い RL の味方 2 機への HP 回復均等分配（持続）は、被弾で HP が減った時に効く（被弾なしの前提の外）: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・demonsBreath（critRate）: C-1489（確定）
  - effects[1] timed・burstUse・attack: C-1487（確定）
  - effects[2] timed・burstUse・maxAmmo: C-1488（確定）、C-1491（仮説）

## 821 エミリア

- **skill1**: supported
  - effects[0] timed・fullChargeShot・chargeSpeed: C-1254（確定）
  - effects[1] timed・fullChargeShot・chargeDamage: C-1254（確定）
- **skill2**: supported
  - effects[0] damage・fullChargeShot・fixedShare: C-1255（確定）、C-1333（確定）
  - effects[1] timed・fullBurstStart・maxAmmo: C-1256（確定）
- **burst**: supported
  - effects[0] state・burstUse・freezingWitch（chargeSpeed・chargeDamage）: C-1257（確定）

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

## 832 マリ

- **skill1**: supported
  - effects[0] timed・coreHit・pierceDamage（読む: 貫通）: C-1482（確定）
  - notes[0] 前提の外: フルチャージして攻撃した時の味方全体のバリアに与えるダメージ▲（3 秒）は、射撃場の敵にバリアが無いのでダメージに関係しない: C-0443（範囲外）
- **skill2**: supported
  - effects[0] timed・10 秒ごと・pierce: C-1481（確定）
  - effects[1] timed・10 秒ごと・attack: C-1481（確定）
  - effects[2] timed・10 秒ごと・attack: C-1481（確定）
- **burst**: supported
  - effects[0] burstDamage・skill: C-1483（確定）
  - effects[1] timed・burstUse・attackDamage: C-1483（確定）

## 833 ミサト

- **skill1**: supported
  - effects[0] state・normalShot・shootingManual（hitRate）: C-0183（確定）、C-0184（仮説）、C-1334（確定）
  - effects[1] heal・normalShot: C-0567（確定）、C-0180（確定）、C-0652（確定）、C-1116（確定）、C-1316（確定）、C-1335（確定）
- **skill2**: supported
  - effects[0] passive・shootingManual のフルスタックの間・healDealt: C-1334（確定）、C-0180（確定）
  - notes[0] 前提の外: 射撃マニュアル状態の間の味方全体のバリアに与えるダメージ▲は、バリアの無い敵（射撃場の的）では効かない: C-0180（確定）
- **burst**: supported
  - effects[0] heal・burstUse: C-0646（仮説）、C-0180（確定）

## 834 レイ（仮称）

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-1297（確定）、C-1296（仮説）
  - effects[1] stackChange・normalHit・antiATField: C-1297（確定）、C-1296（仮説）
  - effects[2] damage・normalHit・additional: C-1300（確定）、C-1296（仮説）
  - effects[3] timed・fullBurstStart・attack: C-1298（確定）
  - notes[0] 前提の外: フルバーストタイムが発動した時の、殲滅態勢の追加効果の適用対象 1▲・攻撃範囲 500%▲は、敵 1 体の前提ではダメージに関係しない（追加効果は射撃場の敵 1 体に毎回当たる）: C-1265（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・spinUpSpeed: C-1299（確定）
  - effects[1] timed・fullBurstStart・attack: C-1299（確定）
- **burst**: supported
  - effects[0] state・burstUse・attackState（attackDamage・attack）: C-1295（確定）
  - effects[1] burstDamage・skill: C-1295（確定）

## 835 アスカ：WILLE

- **skill1**: supported
  - effects[0] damage・normalHit・additional: C-1264（確定）
  - effects[1] damage・normalShot・skill: C-1265（確定）、C-1266（仮説）
  - effects[2] state・normalShot・antiATField（damageTaken）: C-1265（確定）、C-1266（仮説）
  - notes[0] 補足: 殲滅態勢の追加効果の対象「照準線に最も近い攻撃範囲内の敵 2 機」は、敵 1 体の前提で 1 機（ダメージ・アンチA.T.フィールドとも）: C-1265（確定）
- **skill2**: supported
  - effects[0] timed・fullBurstStart・attackDamage: C-1263（確定）
  - effects[1] timed・annihilationState が終了した時・spinUpSpeed: C-1269（確定）
  - effects[2] ammoDecrease・annihilationState が終了した時: C-1268（確定）
  - effects[3] timed・annihilationState が終了した時・reloadSpeed: C-1268（確定）、C-1340（確定）
  - notes[0] 計算に無関係: 緊急修復の持続回復（自分の最終最大HP の 3.77%・1 秒間隔・3 秒）は、ダメージに関係しない（自分にだけ付き、アスカ：WILLE に回復を受けた時の効果は無い）: 根拠なし
- **burst**: supported
  - effects[0] state・burstUse・annihilationState: C-1262（確定）、C-1267（確定）
  - effects[1] timed・burstUse・normalAttackDamage: C-1262（確定）
  - effects[2] ammoRefill・burstUse: C-1262（確定）
  - effects[3] timed・burstUse・attack: C-1262（確定）
  - effects[4] timed・burstUse・attackDamage: C-1262（確定）
  - effects[5] damage・annihilationState が終了した時・additional: C-1267（確定）
  - effects[6] cancelState・annihilationState が終了した時: C-1267（確定）

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

## 850 イヴ

- **skill1**: supported
  - effects[0] passive・critRate: C-1319（確定）
  - effects[1] damage・critHit・skill: C-1324（確定）
  - effects[2] damage・critHit・skill: C-1321（確定）
  - effects[3] timed・critHit・damageTaken: C-1320（確定）
- **skill2**: supported
  - effects[0] passive・attack: C-1318（確定）
  - effects[1] passive・maxAmmo: C-1318（確定）
  - effects[2] passive・exospineMk2 の間・attack: C-1321（確定）
  - effects[3] ammoRefill・normalHit: C-1322（確定）
  - notes[0] 補足: 「下位効果のスタック適用」は、イーグルアイエグゾスパインMk2 の間も元の攻撃力▲が残り、Mk2 の分が重なることと読む（effects[2] は effects[0] に足す形）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・skill: C-1323（確定）
  - effects[1] state・burstUse・exospineMk2: C-1321（確定）

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

## 872 アイギス

- **skill1**: supported
  - effects[0] state・battleStart・persona（attack）: C-1605（確定）
  - notes[0] 間接（防御力）: 防御力▲（ペルソナ - パラディオンのラクカジャ）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **skill2**: supported
  - effects[0] timed・burstUse・attack: C-1606（確定）
  - notes[0] 間接（防御力）: 防御力▲（パピヨンハートのマハラクカジャ）は、それ自体は与ダメージを変えない（防御力を読む効果のある編成でだけ効く）: 根拠なし
- **burst**: supported
  - effects[0] burstDamage・distributed: C-1607（確定）
