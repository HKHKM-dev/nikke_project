# 繰り返しの業務の簡素化の案・第 7 回（2026-10-30 の定期の見直し）

- 何のための文書か: 検証 1 件ごと・PR ごと・セッションごとに繰り返す手順のうち、要らない手順や重なりを洗い出し、簡素化の案を出す。オーナーの判断を待つ。
- 前の回: [design-workflow-simplification.md](design-workflow-simplification.md)（2026-10-24）・[-2](design-workflow-simplification-2.md)・[-3](design-workflow-simplification-3.md)・[-4](design-workflow-simplification-4.md)・[-5](design-workflow-simplification-5.md)（どれも実施済み）。第 6 回（2026-10-29）はブランチ `claude/pensive-curie-t57dsa` にあり、main に入っていない。その 1（クラウドの始めの取得）は #770 で別の形で直り、2（段の進み具合の書く先）は文書の役割の見直し（ブランチ `claude/youthful-maxwell-9jvumc` の `plan/design-doc-roles.md`。決定済み）と重なり、3（宝物の段階の既定）は判断待ち。ここではどれも繰り返さない。
- 文書の書き方・手引きの短縮は、文書の役割の見直しが扱っているので、この回では見ない。
- 調べた範囲: 観測値（`records/observations/`）の `method.tool`、比べる指標（`records/observations.ts` の `METRICS`）、解析ツールとレシピ（`tools/captures/`）、origin のブランチ。
- 調べ方: origin/main（a0a0a1a）で、観測値の `method.tool` を道具の名前ごとに数え、指標を使う検証の数を数えた（使い捨てのスクリプト。コミットしない）。クローンは浅く、履歴は直近 50 件（#722 から）しか見ていない。

## 0. 案の一覧

<!-- prettier-ignore -->
| # | 案 | 減るもの | 判断してほしいこと |
| --- | --- | --- | --- |
| 1 | レシピ `buff-edge` の格子に、スキルのヒット・持続ダメージの tick と、同じフレームの 2 つの和を足す | 直近 20 件の検証のうち 5 件（観測値 114 個）で書き直している「増分を 1 ヒットの格子に当てる」使い捨てのスクリプト | 進めてよいか |
| 2 | 「出来事の動画のフレームを、基準からの差の列にする」指標を 1 つ足し、新しい検証はそれを使う | 検証の PR ごとの、指標の関数とテストの書き足し（#722 の後の検証の PR 21 件で 9 個） | 進めてよいか。今の 8 個の指標を薄い包みに直すか（値は変えない） |
| 3 | 使われていない道具を消す（`charge-shots` と `charge-lattice`・`fb-window-k`・`diff.ts`） | 約 37KB の道具とテスト、tools.md の 3 行と較正の表 | 消してよいか（`charge-shots` は第 1 回で「次の SR・RL の検証まで残す」とした） |
| 4 | この定期の見直しを週 1 回にし、前の回が判断待ちなら新しい回を起こさない。マージした PR のブランチを GitHub で自動で消す | 毎日の案の文書と、判断待ちの案のブランチ、並行の作業の確かめのたびに見る古いブランチ | 間隔を変えてよいか（ルーティンの設定はオーナー）。GitHub の設定を変えてよいか |

推奨は 1〜4 を全部進める。1 と 2 は検証 1 件ごとに効き、3 と 4 は一度きりの片付け。

## 1. `buff-edge` の格子にスキルのヒットと和を足す

**いま**

- V-0525〜V-0547 で観測値を書いた検証 20 件のうち 5 件が、観測値の `method.tool` に「使い捨てのスクリプトで 1 ヒットの格子に当てた」と書いている: V-0525（8 個）・V-0536（20 個）・V-0538（62 個）・V-0546（9 個）・V-0547（15 個）。
- 第 3 回の 1 で、何人かの格子に当てる形を `buff-edge` の版 2（`--opt grid`・`pair`）にした。ところが版 2 の格子は、枠ごとの**通常攻撃の** `hitDamage`（コア × 会心 × 距離の 8 通り）だけ。上の 5 件が当てたのは、それに入らない値だった:
  - スキルのヒット（V-0538 の槍 151,357・V-0546 のキャプチャーチェーンの攻撃 60,369・V-0536 のフルチャージの追加ダメージ）
  - 持続ダメージの tick（V-0546・V-0547 のチェーンバインドの 1 スタック 30,245・10 スタック 302,450、プリング・チェーン）
  - 同じフレームの和（V-0538 の 244,677 = 槍の会心 227,036 + 通常攻撃のコア・会心 17,641）
  - その場しのぎの奇跡の 0〜3 スタック（V-0525。▲のスタックの数ごとの格子）
- そのたびに、V-0546 の読み方を V-0547 が「V-0546 と同じく使い捨てのスクリプトで」と書いて、また書いている。値はモデルの指標（`skillHitDamage`・`dotHitDamage`・`dotStackTickDamage`）に既にあり、スクリプトは毎回それを手で組んでいる。

**案**

- 版 2 の `grid` の 1 項目に、値の出どころを書けるようにする（版 3）:
  - `<名前>=<枠>@<フレーム>`（今のまま。通常攻撃の 8 通り）
  - `<名前>=<枠>@skill:<スキル>[:<n>]`（`skillHitDamage`。会心あり・なしの 2 通り）
  - `<名前>=<枠>@dot:<n>` と `<名前>=<枠>@dot@<フレーム>:<スタック数>`（`dotHitDamage`・`dotStackTickDamage`。会心あり・なし）
  - `<名前>=<格子>+<格子>`（2 つの格子の値の組の和。3 つ以上の和は作らない。外れが増えるだけなので）
  - `/*<倍率>` は今のとおりどの形にも付けられる（▲のスタックの数ごとの格子は倍率の並びで書く）
- 増分ごとに合う格子の名前を出すこと、境を挟むこと（`pair`）、観測値の形は版 2 のまま。
- 実装の PR で、V-0538 の録画 1 本（0738）と V-0546 の録画 1 本で、使い捨てのスクリプトと同じ観測値が出ることを確かめる（観測値は書き換えない）。
- [verification-guide.md](verification-guide.md) 6 節の `buff-edge` の行に、スキルのヒット・tick・和も格子にできる、と足す。

**効果**: スキルや持続ダメージのあるキャラの語彙の検証（直近の 5 件。今の段 13 のミハラ：ボンディングチェーンもこの形）で、読みのスクリプトを書かずに済む。読み方が `recipe:buff-edge@3` と書けて、次の検証が同じ読みをそのまま回せる。

**気をつけること**: 格子が増えると、同じ増分に 2 つ以上の格子が合う（区別できない）ことが増える。版 2 と同じく、区別できない増分は境に使わず、格子ごとの数を標準エラーに出して見せる。

## 2. 出来事の動画のフレームの列の指標を 1 つにする

**いま**

- 比べる指標は 85 個。#722 の後の検証の PR 21 件で 9 個を足した（`dotHitVideoFrames`・`skillHitVideoFrameList`・`activationToCtEnd`・`skillHitFramesFromFullBurst`・`steadyPauseShots`・`lastShotGapMedians`・`gaugeFullToWeaponChangeShot`・`burstActivationCount`・`skillHitFromBurstHit`）。足さない PR でも、既にある指標に引数を足している（V-0547 で `skillHitFramesFromFullBurst` に `after`・`kind`・`skip`）。
- 85 個のうち 32 個は、使う検証が 1 件以下。
- 動画のフレームを返す指標の関数は 21 個あり、そのうち次の 8 個は同じ形をしている: 「枠のスキルのヒット（か持続ダメージの付与・tick、バーストのヒット、回復）を選ぶ → 基準（戦闘の始まり・n 回目のフルバーストの始まり・n 回目の発動・直前のバーストのヒット）を決める → 範囲で絞る → 頭から count 個を、基準からの動画のフレームの差にする」。
  - `skillHitVideoFrame`・`skillHitVideoFrameList`・`skillHitFramesFromFullBurst`・`skillHitFromBurstHit`・`dotHitVideoFrames`・`dotTickOffsets`・`burstHitOffsets`・`healVideoFrame`
- 違うのは選ぶ出来事と基準だけなのに、新しい組み合わせが要るたびに関数とテストを足している。

**案**

- 指標 `eventFrames` を 1 つ足す。引数:
  - `event`: `skillHit`・`dotApply`・`dotTick`・`burstHit`・`activation`・`heal`
  - `slot`・`skill`（今の `hitMatches` と同じ絞り方）
  - `anchor`: `start`（戦闘の始まり）・`fullBurst:<n>`・`fullBurstEnd:<n>`・`activation:<n>`・`prevBurstHit`（ヒットごとに直前のバーストのヒット）
  - `until`: `next`（次の同じ基準まで。省けば終わりまで）
  - `skip`・`count`
- 新しい検証で、上の形の比べが要るときは `eventFrames` を使い、指標を足さない。[verification-guide.md](verification-guide.md) 付録 A の指標の表に 1 行足す。
- 今の 8 個の指標は残す（観測値が名前で指している）。推奨は、中身を `eventFrames` の薄い包みに直す（どの観測値の残差も変わらないことを `records:check` で確かめる）。直さなくても 1 の効き目は変わらないので、オーナーが「残すだけ」なら今のまま。
- 1 ヒットの値の指標（`METRIC_SOURCE` にある 7 個）は対象にしない（最小構成の判定が名前で出どころを決めている。`relevance.ts`）。

**効果**: 時刻の列を比べる検証の PR で、指標の関数とテストを書く手間が無くなる（直近の 9 個のうち 4 個がこの形）。指標の一覧が伸びにくくなる。

**気をつけること**: 引数の組み合わせで意味の無い指定（`event: heal` と `anchor: prevBurstHit` など）ができる。組み合わせの表をテストで持ち、意味の無い組は誤りにする。

## 3. 使われていない道具を消す

**いま**（観測値の `method.tool` と検証記録の「読み方」で数えた）

<!-- prettier-ignore -->
| 道具 | 大きさ（テスト込み） | 使った検証 | 最後 |
| --- | --- | --- | --- |
| レシピ `charge-shots` と `charge-lattice.ts` | 22.7KB | 0 件 | 2026-10-17 に作ってから無い |
| `fb-window-k.ts` と `fb-window-k-lib.ts` | 10.2KB | V-0492 の 1 件（観測値 2 個） | 2026-10-25 |
| `diff.ts` | 4.0KB | 観測値は 0 個。読み方に挙げたのは V-0011・V-0151・V-0296 | 2026-10-05 ごろ |

- `charge-shots` は第 1 回の 6 で「次の SR・RL の検証まで残す」とした。その後のチャージ武器の検証（V-0528 ラプラス：アルティメットヒーロー、V-0536 ラプンツェル：サンクチュアリ）は、`reticle-ammo.ts`・`hud.ts` と使い捨てのスクリプトで読み、このレシピは使わなかった（単騎で撃ち続ける録画の形でなかった）。
- `fb-window-k.ts` は V-0492 の判定のためだけの道具（冒頭の説明も「V-0492 の判定の指標」）。V-0492 は完了。
- `diff.ts` は 2026-09-22 の較正の道具。今は同じことを `hud.ts --mode jumps`・`reticle-ammo.ts`・`reload.ts` が読む。[captures/tools.md](captures/tools.md) に、使う人のいない較正の領域の表（4 行）と手の読み方の段落が残っている。

**案**

- 3 つを消す（ファイル・テスト・`recipes/index.ts` の登録、[captures/tools.md](captures/tools.md) の表の行と `diff.ts` の較正の表、[verification-guide.md](verification-guide.md) 付録 A の `charge-shots` の 2 か所）。
- 消した道具は git の履歴に残る。要るときは戻せる。消したことと戻し方（コミット）を、[design-charge-shots.md](design-charge-shots.md) の末尾に 1 行書く（設計書は凍結に近いが、道具が無くなったことは読む人が困るので）。
- 残すもの: `result-screen.ts`（迎撃戦の段で使う。2026-10-25 に作ったばかり）、`probe.ts`（写しの突き合わせ。観測値には出ない）、`ammo.ts`（AI の味方の射撃はこれでしか読めない。V-0465）、`dups.ts`（V-0534 でも使った）。

**効果**: 道具の一覧とテストが約 37KB 減り、手引きの表が読む人に「これで読む」と誤らせなくなる。

## 4. 定期の見直しの間隔と、古いブランチ

**いま**

- この見直しは 2026-10-24 から毎日回り、7 回目になる。案の数は 7・8・4・4・5・3 と減っている。第 6 回は判断が出ないまま、次の回（この文書）が来た。案の文書は 1 回 16〜26KB で、判断を待つあいだブランチに残る。
- origin に、中身が main に入ったブランチが 2 本（`claude/admiring-gauss-f3dqt2` は #740、`claude/upbeat-wright-qrya62` は #752）と、main と共通の祖先の無いブランチが 1 本（`claude/skill-stage11`）残っている。次の PR の前に origin のブランチで並行の作業を確かめる手順（Claude Code のメモリ `check-parallel-work`）のたびに、これを見分けている。

**案**

- **(a) 間隔**: この見直しを週 1 回にする。前の回に判断待ちの案があるときは、新しい回を起こさず、前の回の文書の判断待ちの案を今の main で数え直して追記する（判断の材料を新しくするだけ）。ルーティンの設定はオーナーが変える。
- **(b) 古いブランチ**: GitHub のリポジトリの設定で「Automatically delete head branches」を有効にする（マージした PR のブランチを GitHub が消す）。いまの 3 本は、オーナーが消してよいと言えば消す（`claude/skill-stage11` は段 11 の起案の枝で、段 11 は閉じている）。
- 自動で消しても、クラウドのセッションが同じ名前のブランチを main から作り直す流れ（マージ済みのブランチの後の作業）は変わらない。`sync-after-merge` は手元のブランチを origin/main に揃えるだけなので、origin のブランチが無くても困らない。

**効果**: 判断を待つ案の文書が毎日 1 本ずつ増えることが無くなる。並行の作業の確かめで見るブランチが、動いているものだけになる。

## 5. 見たが案にしなかったもの

- **クラウドの始めの取得をサービスアカウントで読む**: 受け口は中身を 1 件 1 秒で読むので、今日のセッションでも始めのフックの取得が 1 件 45 秒で切れた。サービスアカウントなら Drive API で速く読めるが、`nikke_sync/`（`private`・`scratch`・メモリ）をサービスアカウントに共有しないことは、鍵が VM から見えるのでオーナーが決めた（[design-cloud-environment.md](design-cloud-environment.md) 11 節の 5・6.3 節）。手間より守りの判断なので、案にしない。
- **使われていない指標を消す**: 観測値の比べに使われていない指標は 7 個あるが、うち 5 個は予測が使い、残りの 2 個（`teamTotalDamage`・`burstCount`）はテストが使う。どれも数行で、消しても手間は減らない。
- **生成物をコミットしない**: 検証の PR は生成物を 8 つ（`plan/claims.md`・`minimal.md`・`residuals.md`・`skills.md`・`skill-catalog.md`・`verifications.md`・`captures/recordings.md`・`records/minimal/sensitivity.json`）書き換える。衝突は `pr:prep` が main の版を取って作り直すので、手間にはなっていない。GitHub で読むためにも要る。
- **`sync-after-merge` の 3 か所のフック**: 第 1 回の 7 で見送った。変わっていない。

## 6. 実施の分け方（承認されたら）

- PR 1: 1（`buff-edge.ts` とテスト、[design-buff-edge-recipe.md](design-buff-edge-recipe.md) に版 3 の節、verification-guide.md の 1 行）。クラウドでは録画 0738 と V-0546 の録画 1 本を `fetch.ts` で取り寄せて確かめる。
- PR 2: 2（`observations.ts` の `eventFrames` とテスト、verification-guide.md 付録 A の 1 行。包みに直すなら同じ PR で、`records:check` の残差が変わらないことを PR に書く）。
- PR 3: 3（消すだけ。`npm run ci` が通ることを確かめる）。
- 4 はオーナーの設定。(b) の 3 本を消すのは、オーナーが言ってから。
