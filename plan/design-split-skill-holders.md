# skills/holders.ts と skills/types.ts の型を分けるか（2026-11-07）

- 何のための文書か: backlog 5 節の行（`records/backlog/split-skill-holders.json`。`holders.ts` と `types.ts` に残る型の部分を、並行する PR の衝突を減らすために分ける）について、衝突の実態を履歴から数え、分け方の案を比べて決める。
- 関連: PR の衝突の頻度と原因のファイル（[design-pr-conflicts.md](design-pr-conflicts.md) 1・2 節。数え方もそこにならった）、読み込みの検査を `types.ts` から `skills/parse/` に分けた回（#911。設計書なし）。
- 状態: 承認待ち

## 1. 調べ方

- origin/main（334cdfaa、2026-11-07）の first-parent の履歴で、#801 以降に `holders.ts` か `types.ts` を書き換えた PR（スカッシュの commit）を拾った。35 本（`holders.ts` 13 本、`types.ts` 34 本）。
- 箇所: PR の変更（スカッシュの commit とその親の差、文脈 0 行）の塊ごとに、親の版でその塊を含むいちばん外の宣言を引いた。`holders.ts` の `createHolderLists`（約 1,500 行の 1 つの関数）は、中の 2 字下げの宣言まで引いた。
- 衝突: design-pr-conflicts.md 1 節の「作業の全体」と同じ数え方。PR の最後の head（`refs/pull/N/head`）の commit のいちばん早い author の時刻の main に PR の変更を置き、マージの直前の main と 3 方向で合わせて（`git merge-file`）、このファイルに衝突の印が出るかを見た。
  - 作業の始めは最初の commit より前にありうる（少なめに出る）ので、作業の始めを 2 時間・6 時間早めた見積もりも出した。早めると、同じ話題を続けて出した PR（前の PR のマージの後に始めたもの）も衝突に数えてしまうので、それは除いた（エレグの #803 → #808、段 17 の #863 → #867 → #869、蓄積爆破の #921 → #926 → #932 → #940）。

## 2. 書き換えた箇所

### 2.1 PR ごとの一覧

- 宣言の名前の並びは、ファイルの中の順。「（末尾）」は、和集合・一覧の末尾に値を足したもの（和集合の最後の行の `;` を付け替えたものを含む）。`createHolderLists` の括弧の中は、中の宣言。「返す物」は、`createHolderLists` が返すオブジェクト（問い合わせの関数の並び）。
- `types.ts` の読み込みの関数（`parse*`・`validate*` と、その一覧）は #911 で `skills/parse/` に移ったので、別の列にした。

<!-- prettier-ignore -->
| PR | holders.ts | types.ts の型 | types.ts の読み込み（#911 で `skills/parse/` へ） |
| --- | --- | --- | --- |
| #803 | — | `SKILL_SLOTS`・`DamageEffect` | `parseDamageEffect` |
| #805 | — | `SelfCounterCondition`・`SelfHpCondition` | `parseSelfCounterCondition`・`parseSelfHpCondition` |
| #808 | `HolderLists`・`createHolderLists`（返す物） | `DamageEffect` | `parseDamageEffect` |
| #810 | `HolderLists`・`createHolderLists`（`cooldownViews`・返す物） | `TimedEffect`・`AllyGaugeAddEffect`・`SkillEffect`・`SKILL_EFFECT_KINDS` | `parseTimedEffect`・`parseBurstGaugeHitEffect`・`parseEffectBody`・`parseSkillDefinition` |
| #819 | — | `BurstDamageEffect`・`DamageEffect`・`HealEffect` | `parseTargetSquad`・`parsePersonaTargetFields`・`parseTimedDuration`・`parseDamageEffect`・`parseInstantEffect` |
| #823 | — | `isMaxHpStat` | — |
| #830 | — | — | `parseTrigger`・`parseCounterChangeEffect` |
| #836 | — | `isWeaponChangeEndTrigger`・`EffectTrigger`（末尾）・`isMaxHpStat`・`BurstDamageType` | `chargeTriggersOf`・`hasReloadEndEffect`・`parseTrigger`・`parseStateGrantEffect`・`parseRemoveStateEffect` |
| #838 | — | `_allEffectKinds`・`SkillEntry` | — |
| #843 | — | `isEnemyHeldStat` | `validateDamageTaken` |
| #847 | — | `ShotCountTrigger` | `validateChanceTimed` |
| #852 | `startOfFire`・`createHolderLists`（`register`）・`piecesOfTrack` | `StateGrantEffect` | `parseStateGrantEffect`・`STATE_GRANT_KEYS`・`contentAsTimed` |
| #863 | — | `isReloadEndTrigger`・`EffectTrigger`（末尾）・`TimedEffect`・`AllyGaugeAddEffect`・`CoverHealEffect` | `parseTrigger`・`parseTimedEffect`・`parseTimedFields`・`parseAppliedTrigger`・`parseBurstGaugeHitEffect`・`parseCoverHealEffect`・`parseSkillDefinition` |
| #864 | — | `TimedEffect` | `parseTimedFields` |
| #867 | — | `BUFF_TARGETS`・`AllyGaugeAddEffect`・`CoverHealEffect` | `parseTargetCount`・`parseCoverHealEffect` |
| #869 | — | `isWeaponChangeEndTrigger`・`EffectTrigger`・`DotEffect` | `chargeTriggersOf`・`hasReloadEndEffect`・`parseTrigger`・`parseTimedFields`・`CONDITION_KEYS_OF`・`parseDotEffect`・`parseInstantEffect` |
| #882 | `HolderListsOptions`・`HolderLists`・`createHolderLists`（`stage1Grants`・`register`・返す物） | import・`StateGrantEffect` | `parseStateGrantEffect` |
| #886 | — | `DamageEffect`・`PeriodShorten` | `parseDamageEffect` |
| #893 | import・`HeldTrack`・`stateItems`・`timedItems`・`TrackReads`・`trackReadsOf`・`ALL_READS`・`buildTrackItems`・`createHolderLists`（`counterFullAt`・`firesOf`・`timedSources`・`updateLengths`・`maxHpViews`・`finalMaxHpAt`） | `isFlagStat`・`BuffScaling`（末尾）・`BUFF_SCALINGS`（末尾）・`isChargeFullTrigger`・`EffectTrigger`（末尾）・`Amplifies`・`DurationUntil`・`DotEffect`・`StateGrantEffect` | `validateScaling`・`parseTimedFields`・`parseStateGrantEffect`・`parseAppliedTrigger`・`STATE_GRANT_KEYS`・`contentAsTimed`・`parseTimedDuration`・`parseDotEffect`・`validateFixedChargeTimeCount`・`hasSelfStackingGrant`・`validateDotStateRefs` |
| #894 | import・`insertSorted`・`createHolderLists`（`counterKey`・`shotCountEveryOf`・`counterSources`・`stateTracks`・`fireRemove`・`registerCounters`） | `TimerTrigger`・`DURATION_UNTILS`・`DotEffect`・`StateGrantEffect`・`TimedFields`・`TARGET_DEFENSES` | `parseTimedFields`・`parseStateGrantEffect`・`contentAsTimed`・`parseTimedDuration`・`hasCountingWindow`・`parseDotEffect`・`parseCounterChangeEffect`・`validateAppliedTriggers`・`durationFormOf`・`parseSkillDefinition` |
| #896 | import・`createHolderLists`（`firingBuffs`）・`passiveStatesOf` | `isFlagStat`・`BuffScaling`（末尾）・`BUFF_SCALINGS`（末尾） | `validateScaling` |
| #897 | — | `SHOT_COUNT_RESETS`・`EventCountTrigger`・`DamageEffect` | `parseTrigger`・`parseDamageEffect` |
| #902 | — | `DamageEffect`・`AmmoDecreaseEffect`・`InstantEffect`・`INSTANT_KINDS`（末尾） | `CONDITION_KEYS_OF`・`parseDamageEffect`・`parseInstantEffect`・`parseEffectBody` |
| #904 | — | import・`TimerTrigger`・`EffectTrigger`・`DamageEffect`・`StackChangeEffect`・`SkillEffect`（末尾）・`SKILL_EFFECT_KINDS`（末尾） | `parseDamageEffect`・`parseDamageTrigger`・`parseEffectBody`・`validateStateContentKinds`・`parseSkillDefinition` |
| #905 | import・`createHolderLists`（`holdsAt`・`usedBurstHolds`・`registerCounters`・`register`） | `SKILL_SLOTS`・`BuffStat`（末尾）・`BUFF_STATS`（末尾）・`StateEndUntil`・`EffectCondition`・`conditionReadsItems`・`CooldownReductionEffect`・`WeaponChangeEffect` | `parsePassiveEffect`・`parseDecrease`・`parseTimedEffect`・`parseTimedFields`・`CONDITION_KEYS_OF`・`parseCondition`・`parseWeaponChangeEffect`・`parseInstantEffect` |
| #908 | `HolderLists`・`createHolderLists`（返す物） | import | `parseStateGrantEffect` |
| #911 | `createHolderLists`（`stage1Grants`） | 冒頭のコメント・import・`isFlagStat`・`EXCLUDE_SELF`・`selfBuffedStatOf`・`SummonEffect`・`SkillSupportIndex` | — |
| #921 | — | `DamageEffect` | — |
| #926 | `HolderLists`・`createHolderLists`（`firingViews`・返す物） | `BuffStat`（末尾）・`BUFF_STATS`（末尾）・`DamageEffect`・`AccumulateSpec` | — |
| #932 | — | `DamageEffect`・`AccumulateSpec` | — |
| #937 | — | `BurstGaugeHitEffect`・`ShotPauseEffect` | — |
| #940 | — | `DamageEffect`・`AccumulateSpec` | — |
| #948 | — | `WeaponChangeEffect`・`StateGrantEffect` | — |
| #951 | `HeldTrack`・`whileItems`・`buildTrackItems`・`stageOfTimed`・`createHolderLists`（`fireTimed`） | `SHOT_COUNT_RESETS`・`EventCountKind`・`TimedEffect`・`ShotPauseEffect` | — |
| #954 | `createHolderLists`（返す物） | — | — |

### 2.2 集まり方

- `types.ts` の型の部分で、3 本以上が書き換えた宣言は `DamageEffect` 11 本・`EffectTrigger` 5 本・`StateGrantEffect` 5 本・`TimedEffect` 4 本・`AllyGaugeAddEffect`・`DotEffect`・`AccumulateSpec`・`isFlagStat` 各 3 本。ほかの約 50 の宣言は 1〜2 本。
- `types.ts` の型の部分の書き換え（塊）は約 120。和集合・一覧の末尾に値を足すものは 10（`EffectTrigger` 3・`BUFF_SCALINGS`・`BuffScaling` 各 2・`BUFF_STATS`・`BuffStat` 各 2・`SkillEffect`・`SKILL_EFFECT_KINDS`・`INSTANT_KINDS` 各 1）で、残りは効果の型に欄を足すもの（約 40）と、既にある欄の型・注記を書き換えるもの（約 65）。同じ和集合・同じ一覧の末尾に足し合うより、同じ効果の型（とくに `DamageEffect`）の中を書き換え合うほうが多い。
- `holders.ts` の書き換え（塊）は約 75 で、約 30 の宣言に散らばる。2 本以上が書き換えたのは、`HolderLists` の型と `createHolderLists` の返す物（新しい問い合わせの関数を足す。6 本）、`createHolderLists` の中の `register`（3 本）・`registerCounters`（2 本）、`HeldTrack`・`buildTrackItems`（2 本）だけ。末尾に足す並び・switch の末尾に足すもの（`trackReadsOf` の `case` が 1 つ）はほとんど無く、関数の中身を変えるものが多い。

## 3. 衝突

### 3.1 実際の衝突

35 本のうち 3 本。どれも `types.ts` で、#911 より前。`holders.ts` は 0 本。

<!-- prettier-ignore -->
| PR | 相手 | 箇所 | 中身 |
| --- | --- | --- | --- |
| #867 | #863 | `AllyGaugeAddEffect` の注記と `target` の型、`parseCoverHealEffect` | 段 17 の続きの PR どうし（同じ話題） |
| #869 | #863 | `parseTimedFields` の `parseTrigger` の引数 | 読み込み（#911 で `parse/timed.ts` へ） |
| #904 | #902 | `parseEffectBody` のエラーの文の「expected …」の種類の並び | 読み込み。いまは `SKILL_EFFECT_KINDS` から文を作る（`parse/effect.ts`） |

- #911 の後に `types.ts`・`holders.ts` を書き換えた 8 本（#921〜#954）と、`skills/parse/` を書き換えた 8 本は、どれも衝突していない。

### 3.2 作業の始めを早めた見積もり

同じ話題を続けて出した PR（1 節）を除く。

<!-- prettier-ignore -->
| 早め | PR | 相手 | 箇所 | 中身 |
| --- | --- | --- | --- | --- |
| 2 時間 | #896 | #893 | `BuffScaling`（1 行の和集合）と `BUFF_SCALINGS` の末尾 | 別の値（`copyTopAttack` と `casterDefence`）を同じ末尾に足し合った |
| 2 時間 | #902 | #897 | `DamageEffect` の `valueDelayFrames` の後 | 別の欄（`perTrigger` と `valueBeforeFire`）を同じ所に足し合った |
| 6 時間 | #951 | #937 | `BurstGaugeHitEffect` の `trigger` の行 | 同じ行を別の形に書き換え合った |
| 6 時間 | #808 | #790 | `HolderLists` と返す物 | 別の問い合わせの関数を同じ所に足し合った |

- 読み込みの関数（いまは `skills/parse/`）でも、2 時間で 4 本・6 時間でさらに数本が出たが、どれも #911 より前。#911 の後の `skills/parse/` は、6 時間で #951 ↔ #937（`parseShotPauseEffect`）の 1 本。
- 衝突は、どれも同じ宣言の中（同じ型の同じ所への足し合い・同じ行の書き換え）。隣り合う別の宣言を書き換えて衝突したものは無い。

## 4. 案

### 4.1 案 0: 分けない

- backlog の行を閉じ、調べた結果をこの文書に残す。

### 4.2 案 1: types.ts の型を話題ごとのファイルに分ける

- `skills/types/` に、`skills/parse/` と同じ話題で分けたファイル（stat の語彙・トリガー・条件・ダメージ・状態・timed・即時効果・攻撃・持続ダメージなど）を置き、`types.ts` は `export *` で再公開する。読む側の import は変えない。
- 和集合と一覧（`SkillEffect` と `SKILL_EFFECT_KINDS` など）は、各ファイルの型を集める形で `types.ts`（か集めるファイル）に残る。新しい効果の種類を足すと、ここに 1 行ずつ足すのは今と同じ。
- 見積もり: 3 節の衝突はどれも同じ宣言の中なので、1 本も減らない。
- 変更: 約 2,400 行の移動。型どうしの参照（`TimedEffect` が `BuffStat`・`EffectTrigger`・`EffectCondition` を読むなど）で、ファイルの間の import が増える（型だけの参照なので、実行時の循環は起きない）。
- 読みやすさ: 型と読み込みが同じ分け方になり、効果の種類から型を探しやすくなる。

### 4.3 案 2: 和集合と一覧を 1 か所にし、名前の順に並べる

- いま約 20 組の語彙が、和集合（`type BuffStat = | 'attack' | …`）と一覧（`BUFF_STATS = [...] as const satisfies readonly BuffStat[]`）を両方書き、値を足すたびに 2 か所の末尾に足す。和集合を一覧から導き（`type BuffStat = (typeof BUFF_STATS)[number]`。`INDIRECT_PATHS` など 4 組はすでにこの形）、一覧を 1 行 1 項目・名前の順にして、順をテストで保つ。新しい値は名前で決まる所に入るので、別の値を足す PR どうしは同じ所に足さない。
- `DamageEffect` などの効果の型の欄は名前の順にしない（意味のまとまりと注記で読む）。オブジェクトの型の和集合（`EffectTrigger`・`SkillEffect`）は一覧から導けないので、そのまま。
- 見積もり: #896 ↔ #893 が無くなる（3.2 の 4 本のうち 1 本）。ほかの 3 本は残る。
- 変更: 約 20 組の書き換え（型は同じ）。並べ替えは、一覧の順が外に出る所（読み込みのエラーの文の「expected …」など）を変えうる。出るなら振る舞いの変更なので、移動とは別の PR にする。
- 読みやすさ: 値を足す所が 1 か所になる。`BUFF_STATS` の意味のまとまり（射撃に効く stat・状態の stat など）と、和集合の側の注記の置き場所は、名前の順で崩れる（注記は一覧の項目に寄せる）。

### 4.4 案 3: holders.ts を段ごとに分ける

- `createHolderLists`（約 1,500 行）は、件の列・記録・判定を閉包で共有する 1 つの関数。件の作り方・発火・判定・返す物の段ごとにファイルを分けるには、共有する状態を 1 つの文脈のオブジェクトにして渡す形に書き換えることになり、純粋な移動にならない。
- 純粋な移動で分けられるのは、`createHolderLists` の前の件の作り方の関数（`stateItems`・`timedItems`・`buildTrackItems` など。約 800 行）と、後の小片への写し方（`itemsOf`・`valuePiecesOf`・`amplify`・`buffTimelineOf`。約 330 行）。`holders.ts` は約 1,600 行になる。
- 見積もり: `holders.ts` の衝突は実際には 0 本、早めた見積もりで 1 本（`HolderLists` と返す物）。純粋な移動ではその所は動かないので、1 本も減らない。

### 4.5 比べる

<!-- prettier-ignore -->
| 案 | 減る衝突（3.2 の 4 本のうち） | 変更の大きさ | 読みやすさ |
| --- | --- | --- | --- |
| 0 | 0 | なし | 今のまま |
| 1 | 0 | 約 2,400 行の移動 | 効果の種類から型を探しやすい。ファイルの間の import が増える |
| 2 | 1 | 約 20 組の書き換え。並べ替えでエラーの文が変わりうる | 足す所が 1 か所。意味のまとまりが崩れる |
| 3 | 0 | 移動だけなら約 1,100 行。段ごとなら書き換え | `holders.ts` が短くなる |

- どの案も、分ける PR そのものが、開いているスキルの PR とほぼ必ず衝突する（移した宣言を書き換えた PR は、移した先へ手で写し直す）。分けた後は、`git log -L`・`git blame` で前の履歴をたどりにくくなる。

## 5. 推奨

案 0（分けない）。

- 実際の衝突は 35 本のうち 3 本で、2 本は読み込みの関数、1 本は同じ話題の続きの PR どうし。読み込みの関数は #911 で `skills/parse/` に分けてあり、その後の 16 本（`types.ts`・`holders.ts` の 8 本と `skills/parse/` の 8 本）は衝突していない。
- 残る見込みの衝突（3.2）は、どれも同じ宣言の中なので、ファイルを分けても減らない。減らせるのは案 2 の 1 本だけで、そのために語彙の意味のまとまりを崩し、エラーの文を変えるほどの値は無い。
- 同じ所への足し合いの衝突は、両方を残すだけで直せる（`pr:prep` が止めた所を直す手間は小さい）。

## 6. 経過

- 2026-11-07: 起案。
