# 設計書: 語彙の定義の重なりを減らす（stat の一覧と対象の絞り込みの欄）

- 何のための文書か: スキルの語彙を足すたびに、同じ中身を何か所にも書いている所（stat の一覧と、対象の絞り込みの欄）を、動きを変えずに 1 か所へ寄せる変更の、今の構造・案と得失・論点・段・確かめ方
- 対象: A = `skills/types.ts` の `BuffStat`・`BUFF_STATS` と、`skills/buffs.ts` の `RATIO_FIELD`。B = `skills/targets.ts` の `TargetedEffect`、`skills/resolve.ts` の解決済みの効果の型と対象の欄を写す所、「編成で決まる対象か」の判定（`skills/targets.ts`・`skills/composition.ts`）
- 状態: 承認待ち（4 節の論点）
- 関連: [design-split-skill-holders.md](design-split-skill-holders.md)（4.3 節の案 2 が和集合を一覧から導く案。衝突を減らす目的で比べ、見送った）、[design-split-long-functions.md](design-split-long-functions.md)・[design-split-first-pass.md](design-split-first-pass.md)（動きを変えない分割と、その確かめ方）、[design-first-pass-perf.md](design-first-pass-perf.md)（速さの測り方）、[design-target-vocab.md](design-target-vocab.md)（対象の語彙）、[skills-guide.md](skills-guide.md) 1.4 節（語彙を足す手順）
- 作成日: 2026-11-17
- 調べた時点: main の fc71c712。行番号はその時点のファイルの行

## 1. 背景と目的

- 2026-10-17 からの 1 か月で、コード（`packages/`・`apps/`・`tools/` のテストでないファイル）を変えた PR は 404 本、そのうち `skills/types.ts` を変えた PR は 138 本。その 138 本が一緒に変えた本体のファイルは、中央値で 9 個（4 分の 3 の所で 14 個）。
- 同じ 1 か月で、`BuffStat` の値は 25 個から 46 個に、対象の絞り込みの欄の名前は 9 個から 15 個に増えた（足した欄: `targetClass`・`includeSelf`・`targetAdjacent`・`targetDefense`・`targetStateHeld`・`targetLeftmost`）。
- 足すたびに触る所のうち、中身のある所（型の注記・検査・計算）は減らせない。減らせるのは、**同じ名前を写すだけの所**。2 節のとおり、stat は 2 つ、対象の絞り込みの欄は型の書き写しが 3 つと写す行が約 40 行ある。
- 目的は、**語彙を 1 つ足すときに書く所を減らし、写す所どうしの食い違いを 1 か所で見えるようにすること**。動き（定義の読み込みの結果・エラー文・計算の結果・速さ）は変えない。

## 2. 今の構造

### 2.1 stat（A）

stat を 1 つ足すときに書く所（`allEnemiesBurstDamage` を足した #1190 で数えた）:

<!-- prettier-ignore -->
| # | 所 | 中身 | 書き忘れたとき |
| --- | --- | --- | --- |
| 1 | `skills/types.ts` の `BuffStat`（72 行目〜） | 型の和集合。上に、stat ごとの決まりの注記のまとまりがある | 型の検査が止める（使う所で） |
| 2 | 同 `BUFF_STATS`（122 行目〜） | 読み込みが使う一覧。項目に注記の付くものがある | 型は通る（`satisfies` は一覧 ⊂ 和集合しか見ない）。定義を読む時に `expected one of …` で落ちる |
| 3 | `skills/buffs.ts` の `BuffTotals` | 合計の欄と、効き方の注記 | 型の検査が止める（4・5 から） |
| 4 | 同 `ZERO_BUFFS` | 欄ごとの始めの値（`fireStanceScale` だけ 1、ほかは 0） | 型の検査が止める |
| 5 | 同 `RATIO_FIELD`（327 行目〜） | stat → 合計の欄の名前 | 型の検査が止める |
| 6 | `records/relevance.ts` の `STAT_CLASS` | stat → 最小構成の検査の区分 | 型の検査が止める |

- 1 と 2 は同じ 46 個の値を同じ順で 2 回書いている。
- 5 は 46 行のうち 41 行が同じ名前を返す（`critRate: 'critRate'`）。名前の違うのは 5 行（`attack` → `attackRatio`、`maxAmmo` → `maxAmmoRatio`、`maxHp`・`maxHpOnly` → `maxHpRatio`、`defense` → `defenseRatio`）。
- `BUFF_STATS` の並びは、読み込みのエラー文に出る（`skills/parse/common.ts` の `oneOf` が `expected one of ${allowed.join(', ')}` を作る。一覧を渡すのは `parse/timed.ts`・`parse/condition.ts`・`parse/trigger.ts`・`parse/notes.ts` の 5 か所）。
- stat の性質の一覧（`FIRING_STATS`・`STATE_STATS`・`FLAG_STATS`・`LOCK_STATS` など 11 個）は、stat ごとに入れるかを決める中身のある所で、書き写しではない。
- 説明文の分類の表（`skills/catalog.ts` の `STAT_NAMES`・`skills/catalogDoc.ts` の `STAT_INFO`）は、鍵が説明文の名前から決めた別の語彙（49 個）で、`BuffStat` の 15 個を持たず、`BuffStat` でない鍵を 18 個持つ（`spinUp` と `spinUpSpeed`、`healGiven` と `healDealt` のように名前も違う）。stat を足す PR が触るのは、説明文の言い回しが「語彙あり」に変わるからで、書き写しではない。

### 2.2 対象の絞り込みの欄（B）

対象の絞り込みの欄は 14 個（`targetWeapon`・`targetElement`・`targetClass`・`targetCount`・`targetSquad`・`excludeSelf`・`targetState`・`targetStateHeld`・`includeSelf`・`targetAdjacent`・`targetBurstStep`・`targetLeftmost`・`targetDefense`・`fixedTargets`）。

**型**。解決した後の形を、4 か所が欄を 1 つずつ書いて持つ:

<!-- prettier-ignore -->
| 所 | 持つ欄 |
| --- | --- |
| `skills/targets.ts` の `TargetedEffect`（対象の判定 `isEffectTarget` が見る形） | 14 個の全部 |
| `skills/resolve.ts` の `ResolvedEffect`（366 行目〜。常時・timed・付与・状態の中身） | 14 個の全部 |
| 同 `ResolvedInstantEffect`（1731 行目〜） | `targetWeapon`・`targetElement`・`targetClass`・`targetCount`・`fixedTargets`・`targetBurstStep` |
| 同 `ResolvedAllStackableChange`（1421 行目〜） | `targetWeapon`・`targetElement`・`targetClass` |

`isEffectTarget` には、この 3 つの解決済みの型をそのまま渡している（構造が合うので通る）。欄を足すと、`TargetedEffect` と、渡す側の型の両方に同じ行を足す。

定義の側（`skills/types.ts`）でも、`targetWeapon`・`targetElement`・`targetClass` の 3 つ組を 9 つの効果の型が 1 つずつ書いている（`PassiveEffect`・`TimedEffect`・`CooldownReductionEffect`・`AmmoRefillEffect`・`HealEffect`・`BurstGaugeEffect`・`AmmoDecreaseEffect`・`FullBurstExtendEffect`・notes の効果）。

**写す所**。`skills/resolve.ts` に、`if (effect.x) r.x = effect.x` の形の行が 63 行あり、46 行は同じ名前をそのまま写す。対象の欄を写す所は 6 つで、写す欄が所ごとに違う（○ = 写す、解 = Lv の値に解いて書く、— = 書かない）:

<!-- prettier-ignore -->
| 欄 | `passiveValueOf`（常時） | `resolveItemFields`（timed・付与） | `resolveStateContents`（状態の中身） | `resolveAllStackableChanges` | `resolveInstant`（即時効果） | `resolveCoverHeals` |
| --- | --- | --- | --- | --- | --- | --- |
| `targetWeapon`・`targetElement`・`targetClass` | ○ | ○ | ○ | ○ | ○ | — |
| `targetCount` | — | 解 | ○ | — | 解 | 解 |
| `targetSquad` | ○ | ○ | ○ | — | — | — |
| `excludeSelf`・`targetState`・`includeSelf`・`targetAdjacent` | — | ○ | ○ | — | — | — |
| `targetBurstStep` | — | ○ | ○ | — | ○（heal だけ） | — |
| `targetStateHeld`・`targetLeftmost`・`targetDefense` | — | ○ | — | — | — | — |
| `fixedTargets` | ○ | ○ | ○ | — | ○（heal だけ） | — |

- 所ごとの違いが、元の型に欄が無いためか、要らないので写さないのか、書き漏れかは、コードからは読み取りにくい（表は 6 つの関数を並べて読んで作った）。
- 写す順も所ごとに違う（`targetCount` を書く位置、`fixedTargets` と `targetBurstStep` の前後）。解決済みの効果は `SimResult` に入るので、順は JSON にした文字列に出る。
- 真偽で見る行（`if (effect.targetWeapon)`）と `undefined` と比べる行（`if (effect.targetWeapon !== undefined)`）が混ざる。値はどれも空でない文字列・`true`・配列・1 以上の数なので、結果は同じ。

**判定**。「編成で決まる対象か」（`fixedTargets` が要るか）を 2 か所が別々に書く:

- `skills/composition.ts` の `fixedTargetsOf`（定義の効果を見て、`fixedTargets` を書くかを決める）: `targetSquad`・`longestChargeTime`・heal の `lowestHpRatio` と、`hasPersonaTargetFilter`（`targetState`・`targetAdjacent`・`targetBurstStep`・timed の `targetLeftmost`・allies の `excludeSelf`。heal は `targetAdjacent`・`targetBurstStep`）。
- `skills/targets.ts` の `needsFixedTargets`（解決済みの効果を見て、`fixedTargets` の無い呼び出しを落とす守り）: 同じ条件を 1 つの式に並べたもの。

欄を足すと両方に 1 行ずつ足す（#1190 の `targetLeftmost`）。片方だけに足すと、`composition.ts` の側の書き漏れは守りが落とすが、`targets.ts` の側の書き漏れは、最上位の `applyCompositionToTeam` を通さない呼び出しで黙って全員に掛かる。

- いま、heal の `targetAdjacent`（「両隣の味方」の回復。`data/skills/411.json`）は、`resolveInstant` が `targetAdjacent` を写さないので、守りが働かない（`targetBurstStep` は「`fixedTargets` の無い呼び出しを落とす印」として写している）。最上位を通す呼び出し（画面・CLI・records 層）では `fixedTargets` が必ず書かれるので、計算の結果には出ていない。コードを読んで分かったことで、動かして確かめてはいない。

**読み込み**。`skills/parse/` には、対象の欄の名前の一覧が 5 か所ある（`timed.ts` の `targetLeftmost`・`targetDefense` と組めない欄、`target.ts` の `validateDamageTaken`、`state.ts` の `ENEMY_GRANT_FORBIDDEN_KEYS`・`STATE_GRANT_KEYS`、`instant.ts` の種類ごとの書ける欄）。どれも「この欄とは組めない」「この種類に書ける」という検査の中身で、一覧の順がエラー文の出る順を決める。

## 3. 案

### 3.1 守ること

- **定義の読み込みの結果とエラー文が同じ**。`skills/parse/` の検査と、その順は変えない。`BUFF_STATS` の並びも変えない（エラー文に出る）。
- **解決の結果が同じ**。解決済みの効果の欄・値・**欄の順**が変わらない（`SimResult` を JSON にした文字列が変わらない）。
- **計算の結果と速さが同じ**（6 節）。
- 型の注記（stat ごとの決まり・欄ごとの説明）は消さない。寄せた先に 1 つ残す。

### 3.2 A の案

- **案 A0: 変えない**。
- **案 A1: 書き写しの 2 つをやめる**。
  - `BuffStat` を一覧から導く（`export type BuffStat = (typeof BUFF_STATS)[number]`）。和集合の上の注記のまとまりは、`BUFF_STATS` の上にそのまま移す。一覧の並びと項目の注記は変えない。`INDIRECT_PATHS` などがすでにこの形。
  - `RATIO_FIELD` を、名前の違う 5 行の表（`RENAMED_RATIO_FIELD`）と「無ければ同じ名前」に分け、46 行の表は読み込みの時に 1 回だけ組む（`statTotal`・`addRatioBuff` が引く表の形は今と同じ）。同じ名前の stat が `BuffTotals` の数の欄に無ければ、型の検査で止める。
  - stat を足すときに書く所は、6 つから 4 つになる（一覧・`BuffTotals`・`ZERO_BUFFS`・`STAT_CLASS`）。
- **案 A2: A1 に足して、`ZERO_BUFFS` も一覧から組む**。書く所は 3 つになる。`ZERO_BUFFS` の欄の順が変わり（一覧の順になる）、区間の値と件の履歴の値は `ZERO_BUFFS` を写して作る（`skills/timeline.ts`・`skills/holders/history.ts`）ので、`SimResult` の JSON の欄の順が変わる。写す元のオブジェクトの作り方が変わるので、速さも測り直す。
- **案 A3: stat ごとに 1 行の表にまとめる**（合計の欄の名前・11 個の性質・`STAT_CLASS` の区分を 1 行に）。書く所は 2 つ（表の 1 行と `BuffTotals`）になる。`types.ts` の 60〜330 行目を書き換えるので、stat を足す PR（1 か月に 21 個）とほぼ必ず衝突し、性質の一覧の並びが変わるとエラー文も変わる（`LOCK_STATS`・`CONSTANT_VALUE_STATS` は文に出る。`FLAG_STATS`・`LOCK_STATS` は今 `BUFF_STATS` と違う順）。区分は records 層の型なので、`skills/` が `records/` の型を読むことになる。

<!-- prettier-ignore -->
| 案 | 足すときに書く所 | 変更の大きさ | 変わりうるもの |
| --- | --- | --- | --- |
| A0 | 6 | なし | なし |
| A1 | 4 | 約 100 行（消す行が多い） | なし（型と、読み込みの時に組む表だけ） |
| A2 | 3 | A1 と約 60 行 | `SimResult` の JSON の欄の順・速さ |
| A3 | 2 | `types.ts`・`buffs.ts`・`relevance.ts` で約 400 行 | エラー文・層の向き・並行する PR との衝突 |

### 3.3 B の案

- **案 B0: 変えない**。
- **案 B1: 解決した後の形を 1 つの型にし、写す所と判定を 1 つにする**。
  - 型: `skills/targets.ts` の `TargetedEffect` を、対象の欄の正の型にする。`ResolvedEffect`・`ResolvedInstantEffect`・`ResolvedAllStackableChange` は、欄を書き並べる代わりに `TargetedEffect` から取る（`Pick<TargetedEffect, …>` との交わり）。欄の説明の注記は `TargetedEffect` の側に寄せる。型の中身は今と同じ。
  - 写す所: 対象の欄を写す関数を 1 つ（`copyTargetFields(from, to, keys)`）にし、6 つの所は「どの欄をどの順で写すか」の一覧（名前の付いた定数）を渡す。一覧は 1 つのファイルに並べて置くので、2.2 節の表がそのままコードになる。順は所ごとに今のまま（3.1 節）。`targetCount` のように解いて書く欄と、heal だけの欄の条件は、今の所に残す。
  - 判定: `needsFixedTargets` を、定義の効果と解決済みの効果の両方が渡せる形（要る欄だけの型）にして `skills/targets.ts` から出し、`composition.ts` の `fixedTargetsOf` もこれを使う。`hasPersonaTargetFilter` を呼ぶのは `fixedTargetsOf` だけなので、寄せた判定に置き換える。
  - 定義の側の型（9 つの効果の型の 3 つ組）と `skills/parse/` は変えない。
  - 欄を足すときに書く所は、解決の側で、型 1 つ（`TargetedEffect`）と、写す所の一覧に 1 語になる（今は型 2〜3 つと、写す行 1〜3 行と、判定 2 行）。
- **案 B2: B1 に足して、定義の側の 3 つ組も 1 つの型（`TargetFilterFields`）にする**。9 つの効果の型が交わりで持つ。型の中身は同じだが、効果の型ごとに違う注記（「heal だけ」「target が self 以外」など）を 1 つにまとめ直すことになる。`types.ts` の 9 か所を書き換える。
- **案 B3: 対象の欄を入れ子にする**（`effect.targeting.weapon`）。写すのは 1 行になるが、定義の JSON の形か、解決済みの形を読む全部の所（`isEffectTarget` の呼び出し 11 か所と、`timeline.ts`・`ranking.ts`・`holders/`・画面・CLI の表示）が変わる。`SimResult` の形も変わる。

<!-- prettier-ignore -->
| 案 | 欄を足すときに解決の側で書く所 | 変更の大きさ | 変わりうるもの |
| --- | --- | --- | --- |
| B0 | 型 2〜3・写す行 1〜3・判定 2 | なし | なし |
| B1 | 型 1・一覧に 1 語 | `targets.ts`・`resolve.ts`・`composition.ts` で約 150 行 | なし（6 節で確かめる） |
| B2 | B1 と同じ（定義の側は型 1） | B1 と `types.ts` の 9 か所 | 注記のまとめ直し・並行する PR との衝突 |
| B3 | 1 | 読む所の全部 | `SimResult` の形 |

## 4. 論点（オーナーの判断）

<!-- prettier-ignore -->
| # | 論点 | 推奨 | ほかの案 |
| --- | --- | --- | --- |
| 1 | A の範囲 | **推奨: 案 A1**。書き写しだけをやめ、動きと並びに触らない。得るものは小さい（書く所が 6 → 4）が、変えるものも小さい | 案 A0（変えない。残る 2 つの書き写しは、どちらも書き忘れを型か読み込みが止めている）・案 A2・案 A3 |
| 2 | [design-split-skill-holders.md](design-split-skill-holders.md) の決定（和集合と一覧を 1 か所にする案 2 を見送った）との関係 | **推奨: A1 はその決定に当たらないものとして進める**。見送った理由は「衝突が 4 本のうち 1 本しか減らない」「名前の順に並べ替えるとエラー文が変わり、意味のまとまりが崩れる」で、A1 は並べ替えをしない。目的も衝突でなく書く所の数 | 決定を保ち、A は案 A0 にする |
| 3 | B の範囲 | **推奨: 案 B1**。解決の側の型・写す所・判定だけを寄せる | 案 B0・案 B2・案 B3 |
| 4 | 写す欄の所ごとの違い（2.2 節の表の —）の扱い | **推奨: 今の違いをそのまま保つ**。段の始めに、— の 1 つずつを「元の型に欄が無い」「要らない」「書き漏れ」に分けて、この文書の 9 節に表で残す。書き漏れと分かったものは、動きが変わるので直さず、課題に起票する | 違いを無くし、元にある欄は全部写す（解決済みの効果に欄が増え、`SimResult` の JSON が変わる） |
| 5 | heal の `targetAdjacent` の守り（2.2 節） | **推奨: この変更では直さず、課題に起票する**。直すと、最上位を通さない呼び出しが落ちるようになる（動きの変更） | B の PR で一緒に直す |
| 6 | `skills/parse/` の欄の名前の一覧（5 か所） | **推奨: 触らない**。検査の中身で、順がエラー文の出る順を決める | 一覧を定数に寄せる（順を保てば文は変わらないが、得るものが小さい） |
| 7 | 段と PR | **推奨: A と B で 1 PR ずつ**（5 節）。独立なので、どちらからでもよい | 1 PR にまとめる |
| 8 | 速さの許し | **推奨: [design-split-first-pass.md](design-split-first-pass.md) の論点 6 と同じ**（4 編成で、段の後 ÷ main の中央値が 1.05 以下） | 測らない（A1 は表を引く形が同じ、B1 は解決の時だけ呼ぶ関数なので、変わらない見込み） |

## 5. 段

<!-- prettier-ignore -->
| 段 | 中身 | 見直し |
| --- | --- | --- |
| A | 案 A1（`BuffStat` を一覧から導く・`RATIO_FIELD` を名前の違う 5 行から組む） | `/code-review medium`（構造は変わらず、足す行が 100 行に届かないので `/simplify` は当たらない見込み） |
| B | 案 B1（型・写す所・判定）。始めに論点 4 の表を作る | `/simplify` → `/code-review medium` |

- この設計書と課題（`records/backlog/vocab-dedup.json`）は、最初の段の PR に入れる。
- どちらの段も、stat か対象の欄を足す PR が開いている間は出さない（同じ行を書き換える）。始める前に、開いている PR と origin のブランチを見る。

## 6. 確かめ方

- `npm test`・`npm run typecheck`・`npm run lint` が通る。期待値の書き換えは無い。
- `npm run records:minimal -- --all` の後、生成物（`plan/`・`records/minimal/sensitivity.json`）に差分が無い。
- 残差: `npm run records:residual -- --all --base origin/main` で、予測と判定の変わる観測値が無い。
- **読み込みの結果の一致**: `packages/core/data/skills/` の全部の定義を `parseSkillDefinition` で読み、`JSON.stringify` した文が main と一致する。
- **エラー文の一致**（段 A）: `BUFF_STATS` の並びが main と同じ（一覧を JSON にして比べる。並びが同じなら、一覧を渡す読み込みの 5 か所の文は変わらない）。
- **解決の結果の一致**（段 B）: 全部の定義について、4 編成（[design-unify-sim-calc.md](design-unify-sim-calc.md) 3.1 節）と、比べる指定のある全部の観測値の入力で、`runSimulation`（`trace` あり）の `SimResult` と `TeamResult` の JSON が、main と**文字列で**一致する（欄の順も同じ）。
- **判定の一致**（段 B）: 全部の定義の全部の効果で、今の `fixedTargetsOf` が枠を書くか（`undefined` でないか）と、寄せた後の判定が一致する。
- 速さ: 論点 8。
- 比べる脚本は使い捨てで、コミットしない。結果を PR の本文に書く。

## 7. リスク

- **型を導くと、エディタの表示が変わる**: `BuffStat` にカーソルを置いたときの表示は和集合のまま（一覧が `as const` なので）。注記のまとまりは `BUFF_STATS` の上に移るので、`BuffStat` の側からは 1 つ飛ぶ。`BuffStat` の宣言に「決まりは `BUFF_STATS` の注記」と 1 行書く。
- **写す順が変わる**: 所ごとの一覧の順を今と違えると、`SimResult` の JSON の欄の順が変わる。6 節の文字列の一致で拾う。
- **真偽と `undefined` の比べをそろえる**: 写す関数は `undefined` と比べる。空の文字列・0・`false` の値が来ると今と結果が違うが、型の上でどの欄も取りえない（2.2 節）。6 節の一致で拾う。
- **判定を寄せて条件が変わる**: 定義の側は効果の種類で見ていて（timed の `targetLeftmost`）、解決の側は欄だけで見る。欄を書ける種類は読み込みが決めているので同じになる見込み。6 節の判定の一致で拾う。
- **並行するスキルの PR との衝突**: 段 A は `types.ts` の `BuffStat` の和集合（約 50 行）を消すので、stat を足す PR と衝突する（その PR の和集合の 1 行を捨てるだけで直る）。段 B は `resolve.ts` の写す行を書き換えるので、対象の欄を足す PR と衝突する。5 節のとおり、開いている PR が無い時に短く出す。

## 8. 扱わないもの

- 動きの変更（語彙・検査・エラー文・計算）。論点 4・5 で見つけた書き漏れも直さない。
- stat の性質の一覧（11 個）をまとめること（案 A3）と、`BuffTotals` の形を変えること。
- 説明文の分類の表（`STAT_NAMES`・`STAT_INFO`）。別の語彙の表（2.1 節）。
- `skills/parse/` と、定義の側の効果の型（案 B2）。
- `resolve.ts` の、対象の欄でない写す行（`burstStepMode`・`assumes`・`condition` など）。

## 9. 経過

- 2026-11-17: 起案。
