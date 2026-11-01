# 設計書: マスト（350）のスキルの定義

- 手順: [skills-guide.md](skills-guide.md)（1 体 1 PR）・[verification-guide.md](verification-guide.md)
- 計画の上の位置: [design-skill-stage17.md](design-skill-stage17.md) 4 節の候補 6 のマストの分。段の番号を使わない段の外で進める（段の一覧 [design-skill-stages.md](design-skill-stages.md) には書かない）
- 前提の語彙: [design-skill-stage2.md](design-skill-stage2.md)（敵の防御力▼ `enemyDefenseDown`。式は C-0556、丸めは C-0790）、[design-skill-stage13.md](design-skill-stage13.md) 2.5 節（dot の `stacksFrom: { enemyState }`。C-0746）、[design-elegg.md](design-elegg.md)（敵に付く状態の付与 `target: "enemy"`）、[design-new-chars-1029.md](design-new-chars-1029.md) 5.7 節（回数の種類 `critHit`）、[design-target-vocab.md](design-target-vocab.md) 2.1 節（`topAttack` の `excludeSelf`）
- 作成日: 2026-11-01
- 状態: 起案（論点 1〜6 をオーナーに諮っている）

## 0. 範囲

マスト（350。SSR・支援・エリシオン・電撃・SMG・バースト II・CT 20 秒）の全スロット（S1・S2・バースト）を定義する。マスト：ロマンチックメイド（354）は別のキャラで、ここでは扱わない。宝物は無い。

[skill-catalog.md](skill-catalog.md) の段 15・段 17 の棚卸し（[design-skill-stage15-inventory.md](design-skill-stage15-inventory.md)・[design-skill-stage17-inventory.md](design-skill-stage17-inventory.md)）は「いまの語彙で書ける見込み（未確認）」としていた。コードと照らすと、次の 3 つが足りない（2 節）。

1. 敵に付く状態の**スタック**（海風: 50 スタック・3 秒）。敵に付く状態の付与は `maxStacks`・`maxStacksRef` を書けない（`skills/types.ts` の `parseStateGrantEffect`）。
2. **発動者基準の防御力▼**（「スキル発動者基準で防御力 X%▼」）。いまの `enemyDefenseDown` は敵の防御力の割合（防御力 × (1 − Σ)。C-0556）だけで、発動者の防御力に比例して引く形が無い。使い手はマストだけ（全キャラの説明文で 1 件）。
3. **状態のスタックを写す周期のダメージ**（暴風: 「最終攻撃力の X% のダメージ」「海風スタックコピー」「1 秒間隔」「7 秒間維持」）。dot の `stacksFrom: { enemyState }` は、同じ定義の **dot** のスタック（プリング・チェーンがチェーンバインドを写す）だけを写せる（`frame/plan.ts`）。海風は dot ではなく stat の状態。また暴風は「持続ダメージ」ではなく「ダメージ」と書かれている（全キャラの説明文で、周期の「ダメージ」はこの 1 件）。

語彙が足りないので、定義に進む前にこの設計書で諮る（依頼の手順 2）。

## 1. 説明文の分解（スキル Lv10。スペック固定 ON の撮影の値）

<!-- prettier-ignore -->
| スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| S1 | 通常クリティカル攻撃が 2 回命中した時、対象に「海風：スキル発動者基準で防御力 1.9%▼」「50 スタック」「3 秒間維持」 | 語彙を足す（2.1・2.2） | 敵に付く状態の付与（`state: "seaBreeze"`・`target: "enemy"`・`trigger: { count: "critHit", everyRef: 1 }`・`maxStacksRef: 3`・`durationRef: 4`）と、中身 `enemyDefenseDown`・`scaling: "casterDefence"`・`ref: 2` |
| S1 | 自分の HP が 70% 以下である限り、自分と自分を除く最終攻撃力が最も高い味方 2 機に「クリティカルダメージ 50.94%▲」「持続」 | 前提の外（`outOfScope`） | notes。被弾が無い前提（[requirements.md](requirements.md) 4.2 節）では HP が 70% 以下にならない。`effect`: timed・`critDamage`・対象 `topAttack`・きっかけ `damaged` |
| S2 | 戦闘開始時、自分と自分を除く最終攻撃力が最も高い味方 2 機に「クリティカル確率 23.56%▲」「30 秒間維持」 | 語彙にある | timed 2 つ（`battleStart`・`self`／`topAttack`・`excludeSelf: "always"`・`targetCountRef: 1`・`critRate`・`ref: 2`・`durationRef: 3`） |
| バースト | 自分と自分を除く最終攻撃力が最も高い味方 2 機に「スキル発動者基準で最大HP のみ 86.2%▲」「7 秒間維持」 | 間接に効く（`indirect`・`path: "hp"`） | notes（[skills-guide.md](skills-guide.md) 1.4 節の表の「最大HP▲」の行: 「最大HP のみ▲」は形を足すまで notes） |
| バースト | 同じ対象に「クリティカルダメージ 25.19%▲」「7 秒間維持」 | 語彙にある | timed 2 つ（`burstUse`・`self`／`topAttack`・`excludeSelf: "always"`・`targetCountRef: 1`・`critDamage`・`ref: 4`・`durationRef: 5`） |
| バースト | 海風状態の対象に「暴風：最終攻撃力の 4.52% のダメージ」「海風スタックコピー」「1 秒間隔」「7 秒間維持」 | 語彙を足す（2.3） | dot（`burstUse`・`ref: 6`・`intervalSeconds: 1`・`durationRef: 7`・`stacksFrom: { enemyState: "seaBreeze" }`・`sustained: false`） |

- S1 の「2 回」は `description_value_01`（Lv によらず 2）なので `everyRef: 1`。数えるのは通常攻撃のクリティカルの命中の期待値（`critHit`。紅蓮：神殺の S2 と同じ）。
- 「自分と自分を除く最終攻撃力が最も高い味方 2 機」は、自分（`self`）と、自分を外した順位の 2 機（`topAttack`・`excludeSelf: "always"`）の 2 つの効果に分ける。射撃場の 2 人の編成（4 節）では、`topAttack` は相方 1 機になる。
- 状態の id は英語版の名前から `seaBreeze`（Sea Breeze）・`storm`（Storm）。暴風は dot の `state` にも書ける（ほかから参照されないが、名前を目録に置く。[design-skill-catalog.md](design-skill-catalog.md) の論点 4）。

## 2. 語彙

### 2.1 敵に付く状態のスタック（論点 1）

- 敵に付く状態の付与（`target: "enemy"`）に `maxStacks`・`maxStacksRef` を開く。いまは「敵の付与に書けない欄」に入っている。
- スタックの件は、味方の状態のスタックと同じ `skills/stacks.ts` の `stackItems`（段 k の件 = スタック数が k 以上の区間）で作り、持ち主を敵（`skills/holders.ts` の `ENEMY`）にする。中身の値は 1 スタックあたりで、区間の値は k × 1 スタックの値（味方と同じ）。
- 維持の数え方は、いまの既定 `STACK_REFRESH: 'all'`（付けるたびに 1 スタック足し、全スタックの維持を数え直す。切れたら全部消える）を使う。スタックごとに独立に切れる `'each'` の形もコードにある。どちらかは撮影で見分ける（4 節の H-S1）。
- 条件 `enemyState: "seaBreeze"`（「海風状態の」）は、段 k ≥ 1 の件がある間に当たる（いまの敵の状態と同じ見え方）。

### 2.2 発動者基準の防御力▼ `scaling: "casterDefence"`（論点 2・3）

- 説明文「スキル発動者基準で防御力 X%▼」を、**敵の防御力から、発動者の防御力（バフ前）× X% を引く**と読む。攻撃力の「スキル発動者基準で攻撃力 X%▲」（`casterAttack` = 発動者のバフ前攻撃力 × 比率）と同じ言い回しで、▲▼の向きと stat が違うだけ。
- `BuffScaling` に `casterDefence` を足し、stat が `enemyDefenseDown` のときだけ許す。発動者の防御力は、その枠の戦闘中の防御力（バフ前。`computeCombatStat` の `defence`、スペック固定なら `computeFixedSpecDefence`。段 7 の `targetDefense` が読む値と同じ）。
- **式**: 割合の▼（いまの `enemyDefenseDown`）の和 Σr と、発動者基準の▼の和 Σf（防御力の値）を別に持ち、防御力を `max(0, round(防御力 × (1 − Σr) − Σf))` にしてから引く（`damage.ts` の `defenceAfterDown`）。0 で止めるのと、割合の後に引く順は、マストだけの編成では見分けられない（射撃場の敵の防御力は 100 で、発動者基準の 1 スタックで 0 になる。下の見積もり）。順と丸めの位置は、仮の形として定義と `defenceAfterDown` の注記に「未確定」と書く（論点 3）。
- 値の見積もり: スペック固定のマストの防御力は 17,782（`computeFixedSpecDefence`）。1.9% で 1 スタック 338 なので、射撃場の敵（防御力 100）は最初のスタックで防御力 0 になる。割合と読んだとき（1 スタック 1.9%。50 スタックで 95%）は、0 に近づくのに 26 スタック以上かかる。
- 区間の鍵（`skills/timeline.ts` の `BUFF_FIELDS`）と `BuffTotals` に、Σf の欄（`enemyDefenseDownFlat`）を足す。画面のラベルは「敵の防御力 −N」。最小構成の検査の分類は、いまの `enemyDefenseDown` と同じ与ダメージの値。

### 2.3 状態のスタックを写す周期のダメージ（論点 4・5）

- dot の `stacksFrom: { enemyState }` の元に、**敵に付く状態の付与のスタック**（2.1 節）も指せるようにする。元が dot のとき（プリング・チェーン）は今の `dotStacksAt` のまま、元が状態の付与のときは、敵の件の段の数（`stackItems` の件のうち、そのフレームに入っている段の最大）を読む。
  - 元の件は 1 パス目（持ち主ごとの一覧）で決まり、暴風の tick は倍率ダメージと同じく 2 パス目で値を出す（`frame/plan.ts` は件の一覧 `enemySpans` を既に受け取っている）。
- **写す時刻（論点 4）**: 説明文の「海風スタックコピー」「1 秒間隔」は、付けた時に 1 回写す（プリング・チェーンと同じ。C-0746）とも、tick ごとに写し直す（英語版は "Mirrors the stack count of Sea Breeze every second"）とも読める。dot に印 `copyEachTick: true` を足し、どちらでも書けるようにして、撮影で決める（4 節の H-B1）。付けた時に 0 なら付かない（「海風状態の対象に」。今の `stacksFrom` と同じ）。
- **ダメージの種類（論点 5）**: 暴風は「持続ダメージ」でなく「ダメージ」と書かれている。dot に印 `sustained: false` を足し、tick に持続ダメージ▲（`sustainedDamage`）を掛けない（`skills/burstDamage.ts` の `sustained` を立てない）。ほかの式（倍率ダメージの 1 ヒット）は dot の tick と同じ。マストの撮影の編成には持続ダメージ▲が無いので確かめられず、印は説明文の言い回しを根拠にする（notes の補足 `modeling` に書く）。
- tick の時刻（付いた瞬間からか、1 間隔後からか。`firstTick`）、tick の数（7 秒で 7 回か 8 回か）、ゲージを溜めるか（`gaugeOnTick`）、会心の扱いは、今の dot の欄で書けるので、録画で読んで決める。

### 2.4 足さないもの

- 「自分の HP が 70% 以下である限り」の条件: 前提の外（1 節）。
- 最大HP のみ▲: notes（1 節）。

## 3. 定義の案（`data/skills/350.json`）

1 節の表のとおり。数値は書かず `ref` で指す。効果と notes の `claims` は、4 節の検証で作る結論の ID を書く。

## 4. 検証の案（承認の後に V の番号を取る）

最小構成: S1・S2 はマスト単騎で見える。バーストはバースト II なので、I が要る。I には機構が確定したキャラを置き、III は置かない（フルバーストにしない。フルバーストの補正とほかの III の効果が混ざらない）。モデルで、リター（82。I）+ マスト（操作）の編成は、14.8 秒・41.8 秒にマストのバーストを使う（`npm run sim -- --ids 82,350 --fixed-spec --controlled 2`。チェーンは II で時間切れ）。撮影の依頼の編成は、承認の後に、相方の I が確定したキャラか（[skills.md](skills.md)）と所持を確かめて決める。

- **撮影 A（マスト単騎・2 本）**: S1 の海風と S2 のクリティカル確率▲。
  - H-S1a（発動者基準）と H-S1b（割合）: マストの通常攻撃の 1 ヒットは、最初の 2 回のクリティカルの前は防御力 100、その後は H-S1a なら 0、H-S1b なら 100 × (1 − 1.9% × スタック数)。1 ヒットで防御力 100 の差は約 1,300（攻撃力 99,925 の SMG の 1 ヒットの倍率 873% と補正）、1 スタックぶんの割合の差は約 25 で、どちらも 1 ヒットの値で見分けられる。
  - H-S1（`all` か `each`）: 射撃場の防御力 100 では、海風のスタック数は防御力に出ない（H-S1a なら 1 スタックで飽和）。スタック数は、撮影 B の暴風の tick の値で読む。
  - S2 のクリティカル確率▲: 30 秒の前後のクリティカルの割合（期待値）と、ゲージの溜まり方は、既存の結論の式で比べる。
- **撮影 B（I + マスト・2 本）**: バーストの暴風・クリティカルダメージ▲。
  - 暴風の 1 tick = 4.52% × 写したスタック数 × マストの最終攻撃力（防御力は H-S1a なら 0）。値からスタック数が読める。
  - H-B1（付けた時に写す）と H-B2（tick ごとに写し直す）: 7 秒の間に海風のスタック数が変わると、H-B2 だけが tick ごとに値が変わる。`all` の形でスタックが 50 で止まっているなら、どちらも同じ値になり、見分けられない（そのときは結論を分け、写す時刻は仮説に残す）。
  - クリティカルダメージ▲: 相方（`topAttack` で選ばれる 1 機）とマストの、窓の中のクリティカルの 1 ヒット。
- 予測: 語彙を実装した後に、予測ファイル（`records/predictions/V-NNNN.json`）に H-S1a/b・`all`/`each`・H-B1/2 を `setup` の上書きで書いて出す（読む前に固定する）。
- 撮影を待つ間は、このブランチを保持して PR を出さない（AGENTS.md「コミット手順」）。

## 5. 実装の順（1 段ごとに `npm test`）

1. 型と検証: 敵の付与の `maxStacks`・`maxStacksRef`、`scaling: "casterDefence"`、dot の `stacksFrom` の元に状態の付与、`copyEachTick`、`sustained: false`。単体テスト。
2. 解決と 1 パス目: 敵の件のスタック（`skills/holders.ts`）、Σf の区間の値（`skills/timeline.ts`・`skills/buffs.ts`）、`defenceAfterDown`。
3. 2 パス目: 暴風の tick（`frame/plan.ts`）。
4. 退化: 既存のテストと観測値の残差が変わらないこと（`npm run records:check`・`npm run records:minimal`）。
5. 定義 `data/skills/350.json` と、マストを含む編成のテスト（`__tests__/mastTeam.test.ts`。`partitions every shot`）。
6. CLI の表示（`scripts/sim-run.ts`）。

## 6. リスク・留意点

- 発動者基準の▼は、射撃場の敵（防御力 100）では 1 スタックで飽和する。防御力の高い敵（手入力）での値は、0 で止める・割合との順の仮の形のまま（論点 3）。
- クリティカルの回数は期待値で数える（`critHit`）。実際の発火は乱数で揺れるので、海風の付き始めのフレームは録画とずれうる。比べるのは、付き始めの前後で十分離れた発の値と、暴風の tick の値にする。
- 暴風の `copyEachTick` は、海風のスタックの件（1 パス目）を 2 パス目で読む。1 パス目の結果だけで決まるので、パスの間の循環は無い。

## 7. 論点（オーナーに決めてもらうこと）

1. **敵に付く状態のスタック**
   - 推奨: 敵の付与に `maxStacks`・`maxStacksRef` を開き、味方の状態のスタックと同じ件の作り方（`stackItems`）にする。維持の数え方は撮影で決める。
   - 代わりの案: 状態にせず、timed の `enemyDefenseDown` に `maxStacksRef` を書く（timed は今でも書ける）。ただし「海風状態の対象に」（暴風の対象）を条件 `enemyState` で見られず、2.3 節の写す元にもできない。
2. **「スキル発動者基準で防御力 X%▼」の読み方**
   - 推奨: 敵の防御力から発動者の防御力（バフ前）× X% を引く（`casterDefence`）。攻撃力の「スキル発動者基準」（`casterAttack`）と同じ言い回しの読み方。撮影 A の H-S1a。
   - 代わりの案: 割合の▼（いまの `enemyDefenseDown`）と同じ。撮影 A の H-S1b。撮影の前に決めず、両方を予測に書いて録画で選ぶ（推奨の形で実装し、H-S1b は `setup` の上書きで出す）。
3. **発動者基準の▼の 0 で止めることと、割合の▼との順**
   - 推奨: `max(0, round(防御力 × (1 − Σr) − Σf))` にし、順と 0 の扱いは未確定と注記する（マストの撮影では見分けられない。射撃場の防御力 100 は 1 スタックで 0 になる）。
   - 代わりの案: 割合の▼と同時に付く編成を撮って決める（割合の▼の使い手は確定のルドミラ・エレグ。防御力の高い敵は射撃場に無い）。
4. **暴風が海風のスタックを写す時刻**
   - 推奨: 印 `copyEachTick` で両方を書けるようにし、撮影 B で決める。見分けられなければ、付けた時に写す形（プリング・チェーンと同じ。C-0746）を仮説として使う。
   - 代わりの案: 付けた時に写す形だけを実装する（英語版の "every second" の読みを捨てる）。
5. **暴風のダメージの種類**
   - 推奨: 説明文の「ダメージ」（「持続ダメージ」でない）に従い、持続ダメージ▲を掛けない（`sustained: false`）。確かめるには持続ダメージ▲の使い手を混ぜる必要があり、マストの撮影の最小構成から外れるので、補足の notes に書いて撮らない。
   - 代わりの案: いまの dot のまま（持続ダメージ▲を掛ける）。
6. **PR の範囲**
   - 推奨: 1 体 1 PR（[skills-guide.md](skills-guide.md) 0 節）。2.1〜2.3 節の語彙・定義・撮影 A・B の結論を 1 本にする。
   - 代わりの案: 撮影 A（単騎）だけで S1・S2 を先に出し、バーストを後の PR にする。

## 経過

- 2026-11-01: 起案。説明文とコードを照らし、語彙が 3 つ足りないと分かった（0 節）。論点 1〜6 をオーナーに諮る。
