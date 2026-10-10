# 検証の手順

- 1 つの問いを、撮って（か既存の録画を読み直して）、読んで、モデルと比べ、結論にするまでの共通の流れ。キャラのスキルの定義に固有の手順は [skills-guide.md](skills-guide.md)、機構（射撃・ゲージ・バーストの段・時計・的・1 発の式・的の表）の検証は付録 A。
- 2026-10-11 に skills-guide.md の 1.3・1.6〜1.9・2 節をここに移し、機構の検証にも当てはまる形に書き直した（[design-investigation-review.md](design-investigation-review.md) 6 節）。
- 規則の出どころ: [AGENTS.md](../AGENTS.md)「事実と記録」、[design-investigation-review.md](design-investigation-review.md) 1 節（確定の条件と予測の扱い。2026-10-10 のオーナーの決定）、[design-records-automation.md](design-records-automation.md)（道具）、[design-minimal-relevance.md](design-minimal-relevance.md)（最小構成の検査）。

## 1. 問いと最小構成

- 1 回の検証は 1 つの問いで、検証記録 1 ファイルにする（書式は [records/verifications/README.md](../records/verifications/README.md)）。
- 問いは「<事象> を <仮説> と読んで、モデルは実測と合うか」。解釈が割れるなら、仮説を分ける。
- 編成は、観測したい事象に効きうる未確定の要素が最も少ないものにする（最小構成。AGENTS.md「事実と記録」）。単騎で観測できる事象は単騎で確かめる。多人数でも、観測したい事象のほかが機構の確定したキャラだけなら、機構の根拠にしてよい。未確定の要素が 2 つ以上混ざる録画は、残差の推移の記録と仮説の出どころにとどめる。
- 新しく撮る前に、既にある結論・観測値・録画で答えられないかを探す（[claims.md](claims.md)・[residuals.md](residuals.md)・[captures/recordings.md](captures/recordings.md)）。過去の録画の読み直しでも確定にできる（2.2 節）。

## 2. 検証の型と、確定にできる条件

### 2.1 検証の型

| 型                 | すること                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| 撮る               | 新しく撮って読む                                                             |
| 読み直し           | 既存の録画を読む（読む前の予測は要らない）                                   |
| 撮影なしの絞り込み | 既にある観測値と記録だけで仮説を絞る                                         |
| 探索               | 仮説を立てるために読む（ここで立てた仮説の確定には、別の再現が要る。2.2 節） |

### 2.2 確定にできる条件（この節が正）

- 確定にするのは、根拠の等級が厳密一致・反復実測・データ明記のときだけ（AGENTS.md。等級の決め方は [claims.md](claims.md) の冒頭）。
  - 厳密一致: 合わせ込みの定数を持たない式やデータから計算した値と、実測が端数まで一致した。
  - 反復実測: 値を決めるのに使っていない実測でも再現した。**仮説・値・読み方を決めるのに使った録画（結論の `decidedOn`）は再現に数えない**。それらのほかに、別の録画で 1 回以上の再現が要る。同じ録画でも、決めた回より後の回が合えば再現に数える（回で数える。機械は録画で数えるので、人が `gradeReason` に、どの回で決めてどの回で再現したかを書く）。
- **撮る前の予測は確定の条件にしない**（読み直しも、読む前の予測は要らない）。予測は撮影計画の道具（4 節）。
- 1 つの値を多くの録画にまとめて合わせたときは、値を決めるのに要った録画（決めた組）と再現を分け、決めた組だけの値で残りの録画が合うことを検証記録に書く。
- 結論の一部にだけ再現が無いときは、その部分を別の結論（仮説）に分ける。
- 結論の下書き（`records:new -- claim`）が `確定` にするのは、次が全部そろうとき（欠ければ `仮説` と理由を出す。人は理由を確かめて書き換えてよい）:
  - 等級の候補（機械）が厳密一致か反復実測。反復実測なら `decidedOn` がある（無ければ `[]` と書く）
  - 結論の対象（`subject`）がある
  - 最小構成の警告（効きうる未確定の要素が残った組）が無い。効かない理由がはっきりしていれば、結論の `minimal` に印として書く
  - `compare` の無い根拠の観測値に `scope` がある
  - 失効・許容外の観測値が無い
  - 予測ファイルを使ったなら、合う仮説が 2 つ以上でない

## 3. 起案

- `npm run records:new -- verification --title "<題名>" --name <短い名前> --topic "<話題>" --question "<問い>"` で、次の空き番号の `records/verifications/V-NNNN-<短い名前>.md` を状態 `調査中` で作る（ほかのブランチが使っている番号は避ける）。
- 読み直しなら、冒頭の「録画」に録画を挙げる。別の検証の途中で出た問いなら「派生元」を書く。
- 仮説の出どころ（どの録画のどの値・残差から立てたか）を書いておく。結論の `decidedOn` のもとになる（8 節）。

## 4. 撮影計画

- 検証記録の「次に撮るもの」に、編成・操作枠・的・モード・スペック固定・本数と、見分け方（窓の中の発の数・既存の録画での読みの揺れ）を書く。
- 反復実測を狙うなら、2 本以上を 1 回の撮影で撮る（仮説を立てた録画は再現に数えないため）。
- 予測は任意。見分けられる録画かをモデルで確かめたいときは、予測ファイル `records/predictions/V-NNNN.json` に、撮影と同じ編成・仮説（`setup` の上書き）・比べる指標を書き、`npm run records:predict -- V-NNNN` で仮説 × 指標の値を書き込む（書式は [records/predictions/README.md](../records/predictions/README.md)）。細かく見たいときは `npm run sim -- --ids <編成> --fixed-spec --controlled <操作枠> ...`（オプションは `packages/core/scripts/sim-run.ts` の冒頭）。予測ファイルにできない仮説は、検証記録の「予測」に手で書いてよい。使わなければ「予測」は「なし」。
- 撮影の手順と注意は [captures/index.md](captures/index.md)「撮影プロトコル」と [captures/guide.md](captures/guide.md)。

## 5. 撮る・取り込む

- 撮り終えたら、すぐに取り込む: `node tools/captures/intake.ts <元ファイル> --id NNN --name <識別子> --rid ... --controlled ... --target BigArms --element Fire --mode range-3min --fixed-spec on|off ...`（リネーム・移動・素性・`records/recordings/<録画 id>.json`・Drive への同期と sha256 の突き合わせ・backup-log.md への記録。オプションは `intake.ts` の冒頭）。
- 空いた項目を埋めて `npm run records:table`（録画の一覧 [captures/recordings.md](captures/recordings.md)）。命名規約は [captures/index.md](captures/index.md)「命名規約」。

## 6. 読む

- 読み取りはレシピで: `npm run records:read -- <録画 id> --recipe <名前> --source V-NNNN --write`。レシピと `--opt` の一覧は `npm run records:read -- --list`。観測値が `records/observations/<録画 id>.json` に足され、`source` に検証記録の ID、`method.tool` にレシピ名と版が入る。
- レシピに無い値は、解析ツール（[captures/tools.md](captures/tools.md)）か目で読み、同じファイルに手で書く（`method.note` に読み方）。観測値の形は `packages/core/src/records/observations.ts` の型（[design-records-automation.md](design-records-automation.md) 3.4 節）。
- モデルと比べる値は、比べる指定（`compare`。指標は照合ランナー `observations.ts` の `METRICS`）を書く。要る指標が無ければ `METRICS` に足す（足した PR に入れる）。予測ファイルの指標と `metric`・`args`・`setup` を同じにすると、予測と自動で結び付く。
- 繰り返し使う読み方はレシピにする（`tools/captures/recipes/`）。読み取りの落とし穴は [captures/guide.md](captures/guide.md)。

## 7. 比べる

- `npm run records:check` で、残差の一覧（[residuals.md](residuals.md)）・結論の一覧（[claims.md](claims.md)）・検証記録の一覧（[verifications.md](verifications.md)。予測ファイルがあれば「予測との比べ」）・対応状況（[skills.md](skills.md)）・最小構成の検査（[minimal.md](minimal.md)）を作り直す。
- スキル定義・録画の台帳・観測値の比べる指定を変えたら、`npm run records:minimal` で感度を計算し直す（[design-minimal-relevance.md](design-minimal-relevance.md) 10.6 節）。
- 合わないときは、まず読み取りと条件を疑う。機構の話にするのは、未確定の要素を 1 つにした編成で切り分けてから。残差を係数で埋めない（AGENTS.md）。

## 8. 結論

- `npm run records:new -- claim --from V-NNNN --text "<結論の文>"` に、結論の対象（定義の効果なら `--subject "data/skills/<rid>.json の <スロット> の effects[<番号>]"`、定義に結び付かない機構なら `--mechanism <機構>`。付録 A）と、`--decided-on <録画>:<仮説|値|読み方>`（無ければ `--decided-on none`）を付ける。根拠（この検証記録の観測値）と等級の候補が埋まり、2.2 節の条件で状態が決まる。`model`（モデル側）は人が書く。
- `decidedOn` の役割: `仮説の出どころ`（その録画の観測値や残差を見て仮説を立てた）・`値を合わせた`（値をその録画に合わせて決めた）・`読み方を合わせた`（その録画を見てから読み方を組んだ・替えた）。予測の前に値を見ていただけの録画と、読めなさを理由に読み方を替えた録画は入れない（[design-investigation-review.md](design-investigation-review.md) 1.4.2 節の後）。
- 定義に結び付く結論の書き方（効果の `claims` に ID を書く）は [skills-guide.md](skills-guide.md) 3 節。
- `確定` の結論に結び付いた観測値は、以後 `npm test` で比べられる（許容外なら落ちる）。
- 人の判断で確定にするとき（機械の確定の条件の一部をオーナーの判断で上書きする）は、結論の `judgment` に、判断の日（`decided`）・上書きした条件（`overrides`: `指標なし`・`最小構成の警告`・`許容外`・`合う仮説が 2 つ以上`）・理由を書く（claims.md に「人の判断」と出る）。等級を機械の候補より上にした理由は `gradeReason`、最小構成の要素ごとの効かない理由は `minimal` の印に書く。判断は PR の前に対話で受け、検証と同じ PR に入れる（判断だけの PR は出さない）（[design-investigation-review.md](design-investigation-review.md) 3 節）。
- **合わなかったとき**
  - 根拠のある別の解釈があれば、定義やモデルを直して撮り直すか、既存の録画で比べ直す。
  - 古い結論は消さずに `棄却` にし、新しい結論の「置き換え」に古い ID を書く。スキル定義の `claims`・コードの注記の古い ID は新しい ID に差し替える（棄却の結論を `claims` が指すと `npm run records:check` が落ちる）。
  - 未解明のまま残るなら、「未実装」などと明記したプレースホルダーにする（スキル定義なら効果を外すか、スロットを `partial` にして notes に書く）。根拠の無い合わせ込みはしない。

## 9. 閉じる・PR

- 検証記録の「結果」「分かったこと・分からないこと」「次に撮るもの」を書き、冒頭の「結論」に ID を足し、`npm run records:close -- V-NNNN --mark` で閉じる前の検査を通して状態を `完了` にする。検査は、結論がこの記録の観測値を根拠にしている・等級が機械の候補より上でない（上なら `gradeReason`）・確定の反復実測に `decidedOn` がある・この記録の観測値の組に最小構成の警告が無い・確定の結論に指標がある（等級の候補が出る）・この記録の根拠の観測値が許容内・予測と合う仮説が 2 つ以上でない（この 4 つは `judgment` で上書きできる。データ明記は指標を問わない）・確定の結論の根拠の観測値に `scope` がある・本文の節が空でない（[design-records-automation.md](design-records-automation.md) 3.7 節）。CI と同じ確認も回る（急ぐときは `--no-ci`）。
- 閉じた記録にも、録画・観測値・表・結果を書き足してよい（[design-investigation-review.md](design-investigation-review.md) 4.2 節）。結論の根拠が変わったら `records:close` を回し直す。
- [roadmap.md](roadmap.md) を更新し（Stage にしたときはその節、そうでなければ今後の課題）、[AGENTS.md](../AGENTS.md)「コミット手順」で PR を出す。題名の案は `records:close` が出す。

## 付録 A. 機構の検証

結論の対象の `--mechanism` の語彙（`claims.ts` の `CLAIM_MECHANISMS`）ごとに、見るものと置き場所をまとめる。指標の全部は `observations.ts` の `METRICS`、レシピの全部は `records:read -- --list`、解析ツールの全部は [captures/tools.md](captures/tools.md)。

| 機構            | 見るもの                                          | モデル側の主な置き場所                                              | 代表の指標                                                                                | 読む道具                                                                                                    | 手引き（[captures/guide.md](captures/guide.md)） |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `firing`        | 発の間隔・リロード・チャージ・ハイドからの 1 発目 | `cadence.ts`・`weapons.ts`・`frame/shooter.ts`・`frame/firing.ts`   | `shotCount`・`shotIntervals`・`magazineShots`・`reloadFramesAt`・`reloadToNextShotAt`     | レシピ `reload-segments`・`hud-jumps`、`reload.ts`・`ammo.ts`・`hud.ts`                                     | 画面の読み方・動画と道具                         |
| `gauge`         | バーストゲージの溜まり方と満タン                  | `burst/controller.ts`・`frame/firstPass.ts`                         | `gaugeFullFrame`・`gaugeFullShotIndex`・`shotGauge`                                       | `gauge.ts`（BURST バーの px）                                                                               | 画面の読み方                                     |
| `burstChain`    | バーストの段・CT・フルバーストの入り              | `burst/schedule.ts`・`burst/controller.ts`・`burst/dynamic.ts`      | `fullBurstStarts`・`fullBurstStartIntervals`・`burstActivationSlots`・`cooldownCutFrames` | `hud.ts`。右のバースト欄は ffmpeg で切り出して目で読む（道具は未整備。design-investigation-review.md 5 節） | 画面の読み方                                     |
| `clock`         | ゲーム内の時計と動画のフレーム・止まり            | `time.ts`・`burst/schedule.ts`（`videoFrameOf`）                    | `videoFramesBetween`                                                                      | `timer.ts`・`timer-ticks.ts`                                                                                | 動画と道具                                       |
| `target`        | 的のジャンプ・着地点・狙えない時間                | `data/enemies.json` の出来事・`frame/events.ts`・`frame/landing.ts` | （時刻は記録の観測値が多い）                                                              | レシピ `near-landing`・`smg-mags`（中遠の着地点の注記）、`aim.ts`・`coverage.ts`                            | 射撃場の条件                                     |
| `damageFormula` | 1 ヒットの値（バフの掛かり方・会心・コア・距離）  | `damage.ts`                                                         | `hitDamage`・`perShotHitDamage`・`burstHitDamage`・`dotHitDamage`・`skillHitDamage`       | レシピ `hud-jumps`、`hud.ts`。スキルの帯は `banner.ts`                                                      | 画面の読み方                                     |
| `targetTable`   | 的の表のコア命中率・弾丸命中率                    | `data/enemies.json` の `range-bigarms`                              | `coreHitRate`・`bulletHitRate`                                                            | レシピ `sg-pellets`・`smg-mags`・`smg-cores`                                                                | 射撃場の条件                                     |

## 付録 B. 機構を変えたとき

- 機構の変更に合わせて既存の観測値の比べ方（比べるフレーム・`setup`）を直すときは、変更と同じ PR で直し、理由に結論の ID を書く。
- 既存のテストの数値が変わったら、その理由と根拠の ID を PR に書く。根拠のある変更なら、実測との乖離が広がっても行う（AGENTS.md）。
- 確定の結論の根拠の観測値が許容外になれば `npm test` が落ちる。比べ方の誤りなら直し、結論が誤りなら棄却して置き換える。
- スキル定義・録画の台帳・観測値の比べる指定を変えたら `npm run records:minimal` を回す（7 節）。
