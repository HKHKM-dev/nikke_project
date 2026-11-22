# 設計書: 分岐の多い関数・長い関数の作り替えの候補

- 何のための文書か: `npm run code:survey` の分岐の多さ（`branch`）・長い関数（`long`）・同じ形の文の並び（`dup`）・一緒に変わるファイル（`cochange`）・読まれない export（`unused`）の結果から、作り替えの候補を選び、候補ごとのいまの形・読みにくさ・分け方・効果・危うさ・規模と、どれをするかの論点を書く
- 対象: 3 節の候補（`frame/firstPass/shooters.ts`・`frame/firstPass/gaugeEffects.ts`・`skills/holders/views.ts`・`skills/holders/fire.ts`・`skills/burstDamage.ts`・`tools/captures/aim-lib.ts`・`tools/captures/` の重なり）。計算の中身と結果は変えない
- 状態: 起案（5 節の論点がオーナーの判断待ち）
- 関連: [design-split-first-pass.md](design-split-first-pass.md)（1 パス目の分割。確かめ方の 6 節をこの文書の段でも使う）、[design-split-long-functions.md](design-split-long-functions.md)（パーサと画面の分割）、[design-catalog-doc-split.md](design-catalog-doc-split.md)、[design-unused-code-cleanup.md](design-unused-code-cleanup.md)（読まれない export の決定）、[design-workflow-simplification-17.md](design-workflow-simplification-17.md) 10 節（`code:survey`）
- 作成日: 2026-11-22
- 調べた時点: main の ad1a288d に、分岐の多さの節を足したブランチ（`claude/survey-complexity`）の道具で測った。行番号はその時点のファイルの行

## 1. 背景と目的

- オーナーの要望は「コードが複雑になっているところを調べたい」。`code:survey` に分岐の多さ（ESLint の complexity と同じ数え方の循環的複雑度）の節を足し、ほかの節と合わせて候補を選んだ。
- 数字だけでは決めず、候補ごとにコードを読み、何が読みにくいかを確かめた。数字が高くても、独立した検査や欄の写しが並ぶだけの関数（4 節）は候補にしていない。
- 前に作り替えた回（1 パス目の分割・パーサと画面の分割・`renderSkillCatalog` の分割・使われないコードの片付け）と重ねない。3 節の作り手（`createViews`・`createGaugeEffects`・`createFire`・`createShooters`）は、1 パス目の分割で `createHolderLists`・`runFirstPassOnce` の文をそのまま写して作ったもので、作り手の中は分けていない（[design-split-first-pass.md](design-split-first-pass.md) 9.2〜9.4 節）。

## 2. 測った結果

`npm run code:survey -- --top 30`（浅い clone では一緒に変わるファイルが少なく出るので、`git fetch --unshallow` の後に測った）。

### 2.1 分岐の多い関数（40 を超えるもの 20 個）

<!-- prettier-ignore -->
| 複雑度 | 関数 | 場所 | 3 節 |
| --- | --- | --- | --- |
| 93 | `slots.forEach` の引数（`stepShooters` の枠ごと） | `frame/firstPass/shooters.ts:180` | 案 A |
| 71 | `findTarget` | `tools/captures/aim-lib.ts:838` | 案 F |
| 67 | `findCore` | `tools/captures/aim-lib.ts:542` | 案 F |
| 59 | `validatePredictions` | `records/predictions.ts:118` | 4 節 |
| 55 | `validateMinimalFields` | `records/claims.ts:187` | 4 節 |
| 51 | `entry.effects.forEach` の引数（`resolveDotEffects`） | `skills/burstDamage.ts:673` | 案 E |
| 48 | `applyInstants` | `frame/firstPass/instants.ts:219` | 4 節 |
| 48 | `parsePassiveEffect` | `skills/parse/timed.ts:935` | 4 節 |
| 47 | `collectFrameEvents` | `frame/firstPass/frameEvents.ts:64` | 4 節 |
| 46 | `damageEffectHits` | `frame/plan.ts:711` | 4 節 |
| 46 | `registerStage15` | `skills/holders/register.ts:333` | 4 節 |
| 46 | `run` | `tools/captures/recipes/smg-mags.ts:75` | 4 節 |
| 44 | `registerStage1`・`resolveWeaponChange`・`readModule` | `register.ts:210`・`resolve.ts:1678`・`tools/code/survey-lib.ts` | 4 節 |
| 43〜41 | `buildTeamInput`・`entry.effects.forEach` の引数（`resolveDamageEffects`）・`parseWeaponChangeEffect`・`parseTeamFields` | `teamInput.ts:133`・`burstDamage.ts:409`・`parse/weapon.ts:20`・`apps/web/src/team.ts:532` | 案 E・4 節 |

### 2.2 長い関数（中に置いた関数の行を除いた行数の上位）

<!-- prettier-ignore -->
| 行数 | 全体 | 関数 | 場所 | 3 節 |
| --- | --- | --- | --- | --- |
| 252 | 523 | `createViews` | `skills/holders/views.ts:48` | 案 C |
| 202 | 513 | `createGaugeEffects` | `frame/firstPass/gaugeEffects.ts:145` | 案 B |
| 195 | 505 | `createFire` | `skills/holders/fire.ts:41` | 案 D |
| 192 | 192 | `slots.forEach` の引数 | `frame/firstPass/shooters.ts:180` | 案 A |
| 183・172 | 251・184 | `ModernView`・`App` | `apps/web/src/` | 4 節 |

### 2.3 同じ形の文の並び・一緒に変わるファイル・読まれない export

- 同じ形の並びの上位は、テストの編成の組み立て（8 行が 8 か所など）と、3 節の案 G（`tools/captures/` の 19 行が 3 か所・35 行が 2 か所）。返すオブジェクトの名前の並び（`gaugeEffects.ts:634` と `holders/records.ts:131`）と `rejectUnknownKeys` の欄の名前の並び（`parse/attack.ts`・`parse/state.ts`）は、名前を区別しない数え方で同じ形に見えるだけで、まとめるものではない。
- 一緒に変わるファイルの上位は、`skills/types.ts` と `frame/firstPass.ts`（77 回）・`skills/holders.ts`（67）・`apps/web/src/skillLabels.ts`（57）・`skills/catalogDoc.ts`（56）。どれも語彙を足す PR が、型・1 パス目・画面の名前・効果の分類の一覧を一緒に変える形（4 節）。
- 読まれない export は、どこからも 416（うち 413 はファイルの中で使う）・テストだけ 319。4 節。

## 3. 候補

効きの大きい順。効果の数は、分けた後の各部分を同じ道具で測った見積もり（区切りの行を関数で包んで数えた）。

### 3.1 案 A: `shooters.ts` の `stepShooters` の枠ごとの手順を、段ごとの関数に分ける

**いまの形**

- `createShooters` の返す `stepShooters` が `slots.forEach((slot, i) => { … })` の 1 つの無名関数（192 行・複雑度 93）で、1 フレームの枠ごとに次を順に行う。途中の `return` が 3 か所ある。

<!-- prettier-ignore -->
| 行 | 段 | 複雑度 | 行数 |
| --- | --- | --- | --- |
| 185〜215 | 使用武器の変更の始まりと終わり（変更後の射手の待ちを 3 通りで決める・戻りの待ち） | 12 | 31 |
| 216〜242 | 枠の撃たない区間（hide・unhide・狙えない窓の部分チャージ） | 19 | 27 |
| 243〜262 | 状態で止まる射撃（`appliedPauses`）と、止まりの数え（ここで `return`） | 8 | 20 |
| 263〜291 | 射手を進める・チャージの見張り・クールタイムの待ち・リロードの込め終わり（撃たなければ `return`） | 22 | 29 |
| 292〜311 | 発の記録（射撃の列・最後の弾丸・使用武器の変更の終わり・部分チャージ） | 16 | 20 |
| 312〜361 | 命中・クリティカル・ペレット・`shotEvents`・最後の弾丸（二丁持ち）・装弾数無限 | 16 | 50 |
| 362〜370 | 発のゲージ | 4 | 9 |

**何が読みにくいか**

- 段どうしが渡すのは数個の値（`state`・`shot`・`slotBlocked`・`partial`・`fired`・`uncharged`）なのに、1 つの関数の中にあるので、どの段がどの値を読むかを 192 行を追って探すことになる。
- 武器の語彙（使用武器の変更・チャージ・二丁持ち・ペレット）を足す PR が、この関数の決まった所に分岐を足してきた（`shooters.ts` は 2026-11-12 からの 1 か月で 12 回変わった）。どの段に足すかが見出しで分からない。
- `partial` と `windowShot` が同じ値の 2 つの名前で、`return` が段の終わりを兼ねている。

**分け方**

- `createShooters` の閉包の中に、段ごとの関数（`switchWeapon(i, slot, params, f)`・`stepBlock(i, state, shot, params, f): { slotBlocked, partial }`・`stepPause(i, state, shot, params, f): boolean`・`recordShot(…)`・`shotGauge(…)`）を置き、枠ごとの手順は段を順に呼ぶだけにする。閉包の状態（`changedShooters`・`heldWeapon`・`slotNextBlock` など）は今の閉包のまま読むので、受け渡しは増えない。
- 発の記録の 50 行（312〜361）は、クリティカルのペレットの式を `critPelletsOf` にして、`recordShot` を 40 行ほどに収める。
- 文の本文は変えない（変えるのは段の頭と、`return` を戻り値にする所だけ）。

**効果**

- 枠ごとの手順: 複雑度 93 → 10 前後、192 行 → 40 行前後。いちばん大きい段は 22（射手を進める段）。

**危うさ**

- 1 パス目の毎フレーム・枠ごとに回る所で、関数の呼び出しが枠ごとに 5〜6 回増える。[design-split-first-pass.md](design-split-first-pass.md) 9.4 節の段 F2 では同じ形（閉包の手順の関数）で遅くならなかったが、6.3 節の別のプロセスで交互に回す測り方で確かめる。
- `return` を戻り値にする所で、段の順（止まりの間はリロードを進めない・撃たなければ記録しない）を崩すと結果が変わる。[design-split-first-pass.md](design-split-first-pass.md) 6.1 節（テストの全件・生成物の差分なし・最小構成の感度・残差の出力・4 編成と観測値の入力の `SimResult` の JSON の一致）で確かめる。

**規模**: 1 ファイル（約 200 行を動かす）。PR 1 本。

### 3.2 案 B: `gaugeEffects.ts` の `createGaugeEffects` を、仕組みごとの作り手に分ける

**いまの形**

- 1 つの閉包（513 行、中の関数を除いて 202 行）に、ゲージを溜める 4 つの仕組みの準備と、フレームごとの手順が入っている。

<!-- prettier-ignore -->
| 行 | 中身 | 行数（中の関数を除く） |
| --- | --- | --- |
| 160〜237 | 持続ダメージのゲージ（射撃で数える追跡と、周期で付く分の発火の表） | 32 |
| 238〜299 | 味方のゲージ（`allyAdders`・予約）と、着地で足す `landingGauge`・持続ダメージの tick の予約 | 28 |
| 300〜360 | クールタイムの印のある周期（縮める状態・即時に縮める効果・待たせる終わり） | 31 |
| 361〜436 | 周期のゲージ・倍率ダメージのゲージ | 40 |
| 437〜633 | フレームごとの手順（`countCooldownTimers`・`countDamageHitGauges`・`countCycles`・`reserveTimerGauges`・`addShotGauges`・`addAllyGauge` ほか） | 42 |

**何が読みにくいか**

- 4 つの仕組みは互いの状態をほとんど読まない（共有するのは予約の表 `pendingGauge` と `landingGauge`）のに、1 つの閉包にあるので、手順の関数がどの仕組みの状態を書くかを 500 行の中から探すことになる。
- 冒頭の JSDoc（139 行「ゲージを溜める効果を追い…」）が型の宣言の上にあり、`createGaugeEffects` に付いていない。

**分け方**

- [design-split-first-pass.md](design-split-first-pass.md) 9.3 節と同じ作り手の形で、`frame/firstPass/gaugeEffects/` に `dot.ts`・`ally.ts`・`cooldown.ts`・`timer.ts` を置き、予約の表と `landingGauge` は先に作る小さな作り手（`reserve.ts`）にする。入口は前の作り手までを積んだオブジェクトを次に渡し、返す名前は今と同じにする（`firstPass.ts` と読み手は変えない）。
- 準備の中の検査が投げる順を変えないため、作り手は今の文の順に呼ぶ。
- JSDoc の位置を直す。

**効果**: いちばん長い作り手が 202 行 → 45 行前後。複雑度は今も 25 以下で変わらない。

**危うさ**: 準備の順（投げる順・`tracks` の並び）。手順の関数の中身は変えないので、フレームの中の順は変わらない。確かめ方は案 A と同じ（6.1 節・6.2 節のエラーの一致・6.3 節）。

**規模**: 1 ファイルを 5 つに分ける（約 500 行を動かす）。PR 1 本。

### 3.3 案 C: `views.ts` の `createViews` から、HP の系を分ける

**いまの形**

- 1 つの閉包（523 行、中の関数を除いて 252 行。リポジトリでいちばん長い）に、見る側の読み口が並ぶ: stat の和（61〜209 行、55 行）・状態と段（210〜284 行、53 行）・HP（最大 HP・HP の減り・回復・余り・割合。285〜476 行、91 行）・防御力と順位（477〜560 行、38 行）。

**何が読みにくいか**

- 一つひとつの読み口は短く分岐も少ない（いちばん多い `surplusAt` で 14）。読みにくいのは、HP の系の 190 行が stat の和と同じ閉包にあり、HP の系の中で読み合う状態（`hpDowns`・`restores`・`maxHpOnlyMoves`）がどこから書かれるかを全体から探すこと。
- 冒頭の JSDoc（44 行「stat ごとの見る列…」）が `HP_RATIO_EPS` の JSDoc と重なり、`createViews` に付いていない。

**分け方**

- HP の系を `skills/holders/hpViews.ts` の作り手 `createHpViews` にする。stat の和の読み口（`viewsOf`・`sumAt`）を受け、`selfHpRatioAt`・`selfHpAtMostAt`・`applyHeal`・`lowerCurrentHp` などを返す。`createViews` はそれを積んで返す（返す名前は今と同じ）。
- 状態と段・防御力と順位は、HP を分けた後に 200 行を切るので分けない。
- JSDoc の位置を直す。

**効果**: `createViews` 252 行 → 160 行前後、`createHpViews` 90 行前後。

**危うさ**: `late` の口（`selfHpRatioAt` などを前の層が後で読む。[design-split-first-pass.md](design-split-first-pass.md) 9.2 節）の埋め方が変わらないこと。入口の `satisfies` と 6.1 節で確かめる。HP の系は毎フレーム読まれるが、閉包の関数を呼ぶ形は今と同じ。

**規模**: 2 ファイル（約 200 行を動かす）。PR 1 本。

### 3.4 案 D: `fire.ts` の `createFire` から、{ applied } の配りを分ける

**いまの形**: 1 つの閉包（505 行、中の関数を除いて 195 行）に、発火を件の列に入れる関数（`fireTimed`・`fireGrant`・`fireRemove`・`fireRemoveDebuff`・`fireStackChange` ほか。93〜380 行）と、{ applied } の出どころの組み立てと配り（381〜545 行、中の関数を除いて 101 行）が入っている。

**何が読みにくいか**: 配りの部分は出どころの表を組む文が長く、発火の関数と状態（`appliedFrom`・`buffFrom`）を分け合う。分けても配りの部分が 100 行近く残る。

**分け方**: 配りを `skills/holders/applied.ts` の作り手にする（案 C と同じ形）。

**効果**: `createFire` 195 行 → 95 行前後。配りの作り手は 100 行前後で、長さの上位からは消えない。

**危うさ**: 配りの順（同じフレームの { applied } の順）が件の並びに効く。確かめ方は案 A と同じ。

**規模**: 2 ファイル。PR 1 本。

### 3.5 案 E: `burstDamage.ts` の `resolveDamageEffects`・`resolveDotEffects` の欄の写しを関数に分ける

**いまの形**: 効果ごとの無名関数が、前半で組み合わせを検査して投げ（`resolveDamageEffects` で複雑度 11）、後半で定義の欄を解決した効果へ 1 つずつ写す（同 32。`if (effect.x !== undefined) r.x = effect.x` が 20 余り並ぶ）。`resolveDotEffects` も同じ形（前半 15・後半 1。後半は `...(!auto && … ? { … } : {})` の並び）。

**何が読みにくいか**: 数字ほどは読みにくくない。並ぶのは独立した 1 行ずつの写しで、語彙を足すときは末尾に 1 行足せばよい（`burstDamage.ts` は 1 か月で 56 回変わったが、多くはこの 1 行）。検査と写しが同じ関数にあり、どこまでが検査かが見出しで分からない程度。

**分け方**: 検査を `checkDamageEffect`、写しを `copyDamageFields` にする。

**効果**: 51・42 → 15・32 ほど。写しの 32 は残る。

**危うさ**: 小さい（純粋な関数で、テストが効果の形を見る）。ただし語彙を足す PR がこのファイルを頻繁に変えるので、並行する PR と衝突しやすい。

**規模**: 1 ファイル。PR 1 本。

### 3.6 案 F: `aim-lib.ts` の `findTarget`・`findCore` を、手順の関数に分ける

**いまの形**: 録画のこまから的とコアを探す画像の処理で、冒頭の注記に番号つきの手順（`findCore` は 4 段）を書き、本文は 1 つの関数に二重のループが続く（`findTarget` 157 行・複雑度 71、`findCore` 142 行・67）。

**何が読みにくいか**: 手順は注記で追えるが、本文のどこが何番の手順かは、注記の言葉とコメントを照らして探すことになる。分岐の多くは画素のループと閾値の比べ。

**分け方**: 注記の手順ごとに関数にする（`coreMasks`・`coreBlobs`・`coreRadius`・`coreRejects` など）。

**効果**: 71・67 → 各手順 20 以下。

**危うさ**: 出力が変わらないことを録画で確かめる必要がある（録画の実体は手元に無く、クラウドでは Drive から取り寄せる）。`aim-lib.ts` のテストは無い。1 か月の変更は 5 回で、作り替えの効きが小さい。

**規模**: 1 ファイル。PR 1 本と、確かめの録画の取り寄せ。

### 3.7 案 G: `tools/captures/` の重なりを 1 つにする

- `ncc`（正規化相互相関、19 行）が `hud.ts:163`・`hud-interception.ts:113`（export している）・`reticle-ammo.ts:173` に 3 つある。`hud-interception.ts` の版だけ `n` を 2 つの長さの短いほうにしている（ほかは `a.length`）。`hud-interception.ts` の版を共有にして、ほか 2 つを消す。
- `recipes/far-landing.ts:80〜114` と `recipes/midfar-landing.ts:33〜67` の 35 行（`intOption` と測りの組み立て。違うのは派生物の名前の頭 `far-`・`midfar-` だけ）を、名前の頭を引数にした 1 つの関数にする。

**効果**: 約 75 行が消える。数字の上位には効かない。

**危うさ**: ほとんど無い。`n` の違いは、2 つの長さが同じなら結果が同じなので、`hud.ts:238`・`reticle-ammo.ts:262` で渡す 2 つの長さが同じことを確かめてから寄せる（違えば、今の `a.length` の形を残す）。

**規模**: 5 ファイル・数十行。PR 1 本。

## 4. 候補にしなかったもの

- **検査の関数**（`validatePredictions` 59・`validateMinimalFields` 55・`buildTeamInput` 43・`parseTeamFields` 41 ほか）: 欄ごとの独立した 1 行の検査が並ぶ形で、分岐が多いのは欄が多いから。欄を足すときは 1 行足すだけで、分けても読む量は減らない。
- **1 パス目の手順の関数**（`applyInstants` 48・`collectFrameEvents` 47・`damageEffectHits` 46・`registerStage15` 46・`registerStage1` 44）: 1 パス目の分割で手順ごとに切った後の単位で（[design-split-first-pass.md](design-split-first-pass.md) 9.2・9.4・9.5 節）、中は語彙ごとの分岐の並び。いま分ける理由は案 A ほど強くない。案 A の効きを見てから決める。
- **パーサ**（`parsePassiveEffect` 48・`parseWeaponChangeEffect` 42）と `resolveWeaponChange`（44）: パーサの分割（[design-split-long-functions.md](design-split-long-functions.md)）で決めた形のまま、欄の検査が並ぶ。
- **画面**（`ModernView`・`App`）: 分岐は少なく（11・10）、長いのは JSX。モダン UI の作業（[design-modern-ui.md](design-modern-ui.md)）の中で扱う。
- **録画の脚本**（`recipes/smg-mags.ts` の `run` 46 ほか）: 1 本の録画の読み方を上から書いた使い捨てに近い脚本で、ほとんど変わらない。
- **`tools/code/survey-lib.ts` の `readModule`**（44）: import と export の種類ごとの分岐の並びで、1 か所で読める。
- **一緒に変わるファイル**（`skills/types.ts` と `catalogDoc.ts`・`skillLabels.ts`・`firstPass.ts`・`holders.ts`）: 語彙を足すと、型・1 パス目・画面の名前・効果の分類の一覧が一緒に変わる。`catalogDoc.ts` の表は、語彙の行が無ければ一覧を作るときに投げる（`infoIn`）ので、一緒に変わるのは足し忘れを止める決まりの結果。作り替えでは減らない。
- **読まれない export**: ファイルの中で使う 413 個の `export` を外すかは、[design-unused-code-cleanup.md](design-unused-code-cleanup.md) 4 節の論点 2 で「外さない」と決めた。どこからも・中でも使わない 3 個（`VERSION`・`WEAPON_CHANGE_RESTORE`・`WEAPON_CHANGE_CORE`）も同じ文書で残すと決めた。テストだけが読む 17 個は、多くがテストの基準として残す関数（`computeCadence`・`simulateShotFrames` など。注記に書いてある）か、道具のテストのための口で、消すものは見当たらなかった。
- **テストの編成の組み立ての重なり**（8 行が 8 か所など）: テストの本文の外の補助の並びで、テストを分ける作業（[design-split-first-pass.md](design-split-first-pass.md) 8 節で扱わないとした）と一緒に見るもの。

## 5. 論点（オーナーの判断）

<!-- prettier-ignore -->
| # | 論点 | 案 | 推奨 |
| --- | --- | --- | --- |
| 1 | どの候補をするか | 3 節の案 A〜G から選ぶ | **推奨: 案 A・B・C・G**（この順に PR を分ける）。A は分岐も行数も上位で、語彙を足す PR が毎月触る所。B・C は閉包が長いだけで分岐は少ないが、仕組みの境目がはっきりしていて、分けると読む範囲が半分以下になる。G は小さく危うさがほとんど無い。D は分けても 100 行近く残り、E は数字ほど読みにくくなく衝突が増え、F は確かめに録画が要るわりに変更が少ないので見送る |
| 2 | 案 A〜C の確かめ方 | a: [design-split-first-pass.md](design-split-first-pass.md) 6 節と同じ（結果の一致・エラーの一致・速さ・移したことの確かめ）・b: テストの全件と生成物の差分なしだけ | **推奨: 案 a**。1 パス目の毎フレームの所を動かすので、`SimResult` の JSON の一致と速さを見る。脚本はコミットせず、結果を PR の本文に書く |

## 6. 段

承認された候補ごとに PR を 1 本ずつ出す（5 節の論点 1 の順）。各 PR の始めに、並行する PR とブランチを見て、同じファイルを書き換えている PR が無いかを確かめる。

## 7. 確かめ方

- 案 A〜D: [design-split-first-pass.md](design-split-first-pass.md) 6.1 節（結果の一致）・6.2 節（エラーの一致）・6.3 節（速さ。案 A は必ず、B〜D は準備だけを動かすので 6.1 節の一致で足りるが、念のため測る）・6.4 節（移したことの確かめ）。
- 案 E・G: テストの全件と生成物の差分なし。
- 各 PR の後に `npm run code:survey -- --only long,branch --path <ファイル>` で、3 節の効果の見積もりと比べ、経過に書く。

## 8. 経過

- 2026-11-22: 起案した。
