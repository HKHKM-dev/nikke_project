# 検証の手順

- 1 つの問いを、撮って（か既存の録画を読み直して）、読んで、モデルと比べ、結論にするまでの共通の流れ。キャラのスキルの定義に固有の手順は [skills-guide.md](skills-guide.md)、機構（射撃・ゲージ・バーストの段・時計・的・1 発の式・的の表）の検証は付録 A。
- 根拠の規則は [AGENTS.md](../AGENTS.md)「事実と記録」。道具の設計は [design-records-automation.md](design-records-automation.md)、最小構成の検査の設計は [design-minimal-relevance.md](design-minimal-relevance.md)。

## 1. 問いと最小構成

- 1 回の検証は 1 つの問いで、検証記録 1 ファイルにする（書式は [records/verifications/README.md](../records/verifications/README.md)）。
- 問いは「<事象> を <仮説> と読んで、モデルは実測と合うか」。解釈が割れるなら、仮説を分ける。
- 編成は最小構成にする（多人数の録画の扱いも含めて AGENTS.md「事実と記録」）。
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

- 確定にするのは、根拠の等級が厳密一致・反復実測・データ明記のときだけ（等級の定義は [claims.md](claims.md) の冒頭）。
  - 反復実測の再現には、**仮説・値・読み方を決めるのに使った録画（結論の `decidedOn`）を数えない**。同じ録画でも、決めた回より後の回が合えば再現に数える（回で数える。どの回で決めてどの回で再現したかを結論の `runs` に書くと、機械もその録画を 2 回と数える。[design-grade-runs.md](design-grade-runs.md) 2 節）。
  - 合わせ込みの定数を持たない仮説（式と定数を説明文・データ・確定の結論だけから決めた）は、仮説の出どころの録画も再現に数える。出どころを結論の `parameterFree` に書く（値を合わせた録画があれば書けない。同 3 節）。
- **撮る前の予測は確定の条件にしない**（読み直しも、読む前の予測は要らない）。予測は撮影計画の道具（4 節）。
- 1 つの値を多くの録画にまとめて合わせたときは、値を決めるのに要った録画（決めた組）と再現を分け、決めた組だけの値で残りの録画が合うことを検証記録に書く。
- 結論の一部にだけ再現が無いときは、その部分を別の結論（仮説）に分ける。
- 結論の下書き（`records:new -- claim`）が `確定` にするのは、次が全部そろうとき（欠ければ `仮説` と理由を出す。人は理由を確かめて書き換えてよい）:
  - 等級の候補（機械）が厳密一致か反復実測。反復実測なら `decidedOn` がある（無ければ `[]` と書く）
  - 結論の対象（`subject`）がある
  - 最小構成の警告（効きうる未確定の要素が残った組）が無い。効かない理由がはっきりしていれば、結論の `minimal` に印として書く（同じ理由の要素は `element` に並べて 1 つの印にする）。スキル定義の notes が並び替わると、`records:check` が印の notes の添字を文の一致で付け替え、対応先の無い notes や今の編成に無い要素を指す印は誤りにする（直すか外す。何も抑えていない印は [minimal.md](minimal.md) の「使われていない印」に出るが、消さなくてよい。[design-workflow-simplification-5.md](design-workflow-simplification-5.md) 1 節）。窓の端（付き始め・切れ目）の数 f だけを決める仮説は、印の代わりに仮説の結論に `edge`（端のずれうる範囲）を書けば、sim と比べる組は感度で自動で外れる（[design-minimal-edge.md](design-minimal-edge.md)）
  - `compare` の無い根拠の観測値に `scope` がある
  - 失効・許容外の観測値が無い
  - 予測ファイルを使ったなら、合う仮説が 2 つ以上でない

## 3. 起案

- `npm run records:new -- verification --title "<題名>" --name <短い名前> --topic "<話題>" --question "<問い>"` で、次の空き番号の `records/verifications/V-NNNN-<短い名前>.md` を状態 `調査中` で作る（ほかのブランチが使っている番号は避ける）。
- 番号を取ったら、すぐ push する（PR は出さない）。ほかのセッションに見えるのは origin のブランチだけで、push までの間に同じ番号を取られる（[design-workflow-simplification.md](design-workflow-simplification.md) 4 節）。`records:new` は、作ったファイルだけを commit して push する（`--no-push` でしない）。V-/C- の番号は `records:new` で取り、手で書かない。
- 番号がほかのブランチと重なったら、AGENTS.md「コミット手順」の 1 のとおり `records:renumber` で振り直し、すぐ commit して push する。
- 読み直しなら、冒頭の「録画」に録画を挙げる。別の検証の途中で出た問いなら「派生元」を書く。
- 仮説の出どころ（どの録画のどの値・残差から立てたか）を書いておく。結論の `decidedOn` のもとになる（8 節）。

## 4. 撮影計画

- 検証記録の「次に撮るもの」に、オーナーへの撮影の依頼（編成・操作するキャラ・本数・手動操作・敵・スペック固定・オート射撃・オートバースト）を書き、同じ文をチャットに出して検証記録を添える（型は [captures/protocol.md](captures/protocol.md)「撮影の依頼」）。見分け方（窓の中の発の数・既存の録画での読みの揺れ）は依頼に入れず、「条件」か「予測」に書く。
- 反復実測を狙うなら、2 本以上を 1 回の撮影で撮る（仮説を立てた録画は再現に数えないため）。
- 予測は任意。見分けられる録画かをモデルで確かめたいときは、予測ファイルの指標に許容の幅（`tolerance`。観測値の `compare.tolerance` と同じ形）を書くと、`records:predict` が、仮説どうしの予測の差がその幅の中の指標を「見分けられない」と出す。時刻の指標（フレーム）の幅は、動画とゲームの時刻のずれ（[captures/guide.md](captures/guide.md)「動画のフレームはゲーム内の時間とそろっていない」）を見込んで決める。そのうえで、予測ファイル `records/predictions/V-NNNN.json` に、撮影と同じ編成・仮説（`setup` の上書き）・比べる指標を書き、`npm run records:predict -- V-NNNN` で仮説 × 指標の値を書き込む（書式は [records/predictions/README.md](../records/predictions/README.md)）。細かく見たいときは `npm run sim -- --ids <編成> --fixed-spec --controlled <操作枠> ...`（オプションは `packages/core/scripts/sim-run.ts` の冒頭）。予測ファイルにできない仮説は、検証記録の「予測」に手で書いてよい。使わなければ「予測」は「なし」。予測の後にモデルが変わって値が古くなると、開いている検証なら `records:check` が「予測の後にモデルが変わった」と出す（[design-prediction-staleness.md](design-prediction-staleness.md)）。出し直すかどうかは撮影計画の都合で決め、古いわけを本文で説明しなくてよい。
- 撮影の手順と注意（編成と条件の選び方・撮る前の確かめ・映すもの・撮った後）は [captures/protocol.md](captures/protocol.md)。読み取りの注意は [captures/guide.md](captures/guide.md)。

## 5. 撮る・取り込む

- 撮り終えたら、1 回の撮影の録画をまとめて、すぐに取り込む: `node tools/captures/intake.ts <元ファイル>... --name <識別子>,... --rid ... --controlled ... [--treasure <枠>:<段階>（スナップショットで決まらない枠だけ）] --target BigArms --element Fire --mode range-3min --fixed-spec on|off ...`（番号の取得・リネーム・移動・素性・`records/recordings/<録画 id>.json`・Drive への同期と sha256 の突き合わせ・録画の JSON の `backup` への記録・録画の一覧 [captures/recordings.md](captures/recordings.md) の作り直し・番号を押さえる commit と push。オプションは `intake.ts` の冒頭）。
- 道具が埋めない項目（`人が埋める項目` に出る）を埋めたら、`npm run records:check` で一覧を作り直す。命名規約は [captures/index.md](captures/index.md)「命名規約」。

## 6. 読む

- 読み取りはレシピで: `npm run records:read -- <録画 id>[,<録画 id>...] --recipe <名前> --source V-NNNN --write`（録画は , で並べて 1 回で読める。クラウドで録画が手元に無ければ、道具が Drive から取り寄せる）。レシピと `--opt` の一覧は `npm run records:read -- --list`。観測値が `records/observations/<録画 id>.json` に足され、`source` に検証記録の ID、`method.tool` にレシピ名と版が入る。
- HUD の増分を何人かの 1 ヒットの格子（コア × 会心 × 距離 × ▲の有無。SG はペレットの和。倍率ダメージ・持続ダメージの tick と、それらの同じフレームの和も）に当て、誰のどの発か・▲が乗っているかを決め、事象の前後で窓の端を挟むのは、レシピ `buff-edge` の `--opt grid`・`pair`（格子はモデルのフレームで指す。事象の時刻は `burst-panel` の観測値の ID で渡せる）。使い捨てのスクリプトで書き直さない（[design-buff-edge-recipe.md](design-buff-edge-recipe.md) 8・9 節）。
- レシピに無い値は、解析ツール（[captures/tools.md](captures/tools.md)）か目で読み、同じファイルに手で書く（`method.note` に読み方）。観測値の形は `packages/core/src/records/observations.ts` の型（[design-records-automation.md](design-records-automation.md) 3.4 節）。
- モデルと比べる値は、比べる指定（`compare`。指標は照合ランナー `observations.ts` の `METRICS`）を書く。要る指標が無ければ `METRICS` に足す（足した PR に入れる）。予測ファイルの指標と `metric`・`args`・`setup` を同じにすると、予測と自動で結び付く。
- 繰り返し使う読み方はレシピにする（`tools/captures/recipes/`）。読み取りの落とし穴は [captures/guide.md](captures/guide.md)。

## 7. 比べる

- `npm run records:check` で、生成物を全部作り直す: 録画の一覧（[captures/recordings.md](captures/recordings.md)）・スキルの効果の分類（[skill-catalog.md](skill-catalog.md)）・残差の一覧（[residuals.md](residuals.md)）・結論の一覧（[claims.md](claims.md)）・検証記録の一覧（[verifications.md](verifications.md)。予測ファイルがあれば「予測との比べ」）・対応状況（[skills.md](skills.md)）・最小構成の検査（[minimal.md](minimal.md)）を作り直す。
- 残差の一覧には見る行（許容外・比べられない・失効）しか載らない。自分の観測値の残差は `npm run records:residual -- V-NNNN`（録画 id・観測値 ID でも引ける。許容内の行も同じ列で出す）。
- 最小構成の検査の感度（`npm run records:minimal`）は、閉じるとき（9 節）に `records:close` が計算し直す。それより前に見たいときと、検証でない PR でスキル定義・録画の台帳・比べる指定を変えたときは手で回す（[AGENTS.md](../AGENTS.md)「文書の書き方」）。既定は、鍵（スキル定義・録画の台帳・比べる指定）の変わった観測値だけを計算し直す（数秒）。鍵はモデルのコードを含まないので、モデルを大きく組み直す PR と、定期の見直しでは `npm run records:minimal -- --all` で全部を計算し直し、差が出ないことを見る（差が出たら鍵に足りない入力を足す。[design-workflow-simplification-5.md](design-workflow-simplification-5.md) 7.2 節）。
- 合わないときは、まず読み取りと条件を疑う。機構の話にするのは、未確定の要素を 1 つにした編成で切り分けてから。残差を係数で埋めない（AGENTS.md）。

## 8. 結論

- `npm run records:new -- claim --from V-NNNN --text "<結論の文>"` に、結論の対象（定義の効果なら `--subject "data/skills/<rid>.json の <スロット> の effects[<番号>]"`、定義に結び付かない機構なら `--mechanism <機構>`。付録 A）と、`--decided-on <録画>:<仮説|値|読み方>`（無ければ `--decided-on none`）を付ける。録画の中の反復は `--run "<録画>|<観測値,…>|<後の回>[|<決めた回>]"`、合わせ込みの定数を持たない仮説は `--parameter-free "<式と定数の出どころ>"`（[design-grade-runs.md](design-grade-runs.md)）。根拠（この検証記録の観測値）と等級の候補が埋まり、2.2 節の条件で状態が決まる。`model`（モデル側）は人が書く。番号は起案と同じく、道具が取ってすぐ push する（3 節）。
- `decidedOn` の役割: `仮説の出どころ`（その録画の観測値や残差を見て仮説を立てた）・`値を合わせた`（値をその録画に合わせて決めた）・`読み方を合わせた`（その録画を見てから読み方を組んだ・替えた）。予測の前に値を見ていただけの録画と、読めなさを理由に読み方を替えた録画は入れない（[design-investigation-review.md](design-investigation-review.md) 1.4.2 節の後）。
- 定義に結び付く結論の書き方（効果の `claims` に ID を書く）は [skills-guide.md](skills-guide.md) 3 節。
- `確定` の結論に結び付いた観測値は、以後 `npm test` で比べられる（許容外なら落ちる）。
- 人の判断で確定にするとき（機械の確定の条件の一部をオーナーの判断で上書きする）は、結論の `judgment` に、判断の日（`decided`）・上書きした条件（`overrides`: `指標なし`・`最小構成の警告`・`許容外`・`合う仮説が 2 つ以上`）・理由を書く（claims.md に「人の判断」と出る）。等級を機械の候補より上にした理由は `gradeReason`（録画の中の回は `runs` に書けば候補に入る）、最小構成の要素ごとの効かない理由は `minimal` の印に書く。判断は PR の前に対話で受け、検証と同じ PR に入れる（判断だけの PR は出さない）（[design-investigation-review.md](design-investigation-review.md) 3 節）。
- **合わなかったとき**
  - 根拠のある別の解釈があれば、定義やモデルを直して撮り直すか、既存の録画で比べ直す。
  - 古い結論は消さずに `棄却` にし、新しい結論の「置き換え」に古い ID を書く。スキル定義の `claims`・コードの注記の古い ID は新しい ID に差し替える（棄却の結論を `claims` が指すと `npm run records:check` が落ちる）。
  - 未解明のまま残るなら、「未実装」などと明記したプレースホルダーにする（スキル定義なら効果を外すか、スロットを `partial` にして notes に書く）。根拠の無い合わせ込みはしない。

## 9. 閉じる・PR

- 検証記録の「結果」「分かったこと・分からないこと」「次に撮るもの」を書き、冒頭の「結論」に ID を足し、`npm run records:close -- V-NNNN --mark` で閉じる前の検査を通して状態を `完了` にする。落ちた検査は道具が出す（検査の一覧は `packages/core/scripts/records-close.ts` の冒頭。`judgment` で上書きできるものは 8 節）。CI と同じ確認は PR の前の `npm run pr:prep` が回す（閉じるときにも回したければ `--ci`）。
- 閉じた記録にも、録画・観測値・表・結果を書き足してよい（[design-investigation-review.md](design-investigation-review.md) 4.2 節）。結論の根拠が変わったら `records:close` を回し直す。
- 課題の状態が変わったら [backlog.md](backlog.md) の行を直す（ID と経過は書かない。Stage の状態が変わったときだけ [roadmap.md](roadmap.md) の 1 行も）。commit して `npm run pr:prep -- --push` を回し、[AGENTS.md](../AGENTS.md)「コミット手順」で PR を出す。題名の案と本文の骨組みは `records:close` が出す。本文は骨組みに「変更」（コード・データ）を足し、値と読み方は検証記録にあるので書き写さない（結論は ID で指す。[design-workflow-simplification-5.md](design-workflow-simplification-5.md) 2 節）。

## 付録 A. 機構の検証

結論の対象の `--mechanism` の語彙（`claims.ts` の `CLAIM_MECHANISMS`）ごとに、見るものと置き場所をまとめる。指標の全部は `observations.ts` の `METRICS`、レシピの全部は `records:read -- --list`、解析ツールの全部は [captures/tools.md](captures/tools.md)。

| 機構            | 見るもの                                          | モデル側の主な置き場所                                              | 代表の指標                                                                                                | 読む道具                                                                                           | 手引き（[captures/guide.md](captures/guide.md)） |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `firing`        | 発の間隔・リロード・チャージ・ハイドからの 1 発目 | `cadence.ts`・`weapons.ts`・`frame/shooter.ts`・`frame/firing.ts`   | `shotCount`・`shotIntervals`・`shotIntervalMean`・`magazineShots`・`reloadFramesAt`・`reloadToNextShotAt` | レシピ `reload-segments`・`hud-jumps`、`reload.ts`・`ammo.ts`・`hud.ts`                            | 画面の読み方・動画と道具                         |
| `gauge`         | バーストゲージの溜まり方と満タン                  | `burst/controller.ts`・`frame/firstPass.ts`                         | `gaugeFullFrame`・`gaugeFullShotIndex`・`shotGauge`                                                       | `gauge.ts`（BURST バーの px）                                                                      | 画面の読み方                                     |
| `burstChain`    | バーストの段・CT・フルバーストの入り              | `burst/schedule.ts`・`burst/controller.ts`・`burst/dynamic.ts`      | `fullBurstStarts`・`fullBurstStartIntervals`・`burstActivationSlots`・`cooldownCutFrames`                 | `hud.ts`、レシピ `burst-panel`（右のバースト欄の替わり目・00.00・CT の明け）                       | 画面の読み方                                     |
| `clock`         | ゲーム内の時計と動画のフレーム・止まり            | `time.ts`・`burst/schedule.ts`（`videoFrameOf`）                    | `videoFramesBetween`                                                                                      | `timer.ts`・`timer-ticks.ts`                                                                       | 動画と道具                                       |
| `target`        | 的のジャンプ・着地点・狙えない時間                | `data/enemies.json` の出来事・`frame/events.ts`・`frame/landing.ts` | （時刻は記録の観測値が多い）                                                                              | レシピ `near-landing`・`midfar-landing`・`far-landing`・`smg-mags`（中遠の着地点の注記）、`aim.ts` | 射撃場の条件                                     |
| `damageFormula` | 1 ヒットの値（バフの掛かり方・会心・コア・距離）  | `damage.ts`                                                         | `hitDamage`・`perShotHitDamage`・`burstHitDamage`・`dotHitDamage`・`skillHitDamage`                       | レシピ `hud-jumps`・`buff-edge`、`hud.ts`。スキルの帯は `banner.ts`                                | 画面の読み方                                     |
| `targetTable`   | 的の表のコア命中率・弾丸命中率                    | `data/enemies.json` の `range-bigarms`                              | `coreHitRate`・`bulletHitRate`                                                                            | レシピ `sg-pellets`・`smg-mags`・`smg-cores`・`ar-cores`                                           | 射撃場の条件                                     |

出来事（倍率ダメージ・持続ダメージの付与と tick・バーストのヒット・発動・回復）の動画のフレームを、基準（戦闘の始まり・n 回目のフルバースト・n 回目の発動・直前のバーストのヒット）からの差の列で比べるときは、指標を足さずに `eventFrames` の引数（`event`・`anchor`・`within`・`skip`・`count`。冒頭の注記）で書く。

## 付録 B. 機構を変えたとき

- 機構の変更に合わせて既存の観測値の比べ方（比べるフレーム・`setup`）を直すときは、変更と同じ PR で直し、理由に結論の ID を書く。
- 既存のテストの数値が変わったら、その理由と根拠の ID を PR に書く。根拠のある変更なら、実測との乖離が広がっても行う（AGENTS.md）。
- 確定の結論の根拠の観測値が許容外になれば `npm test` が落ちる。比べ方の誤りなら直し、結論が誤りなら棄却して置き換える。
