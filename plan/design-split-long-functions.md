# 設計書: 長い関数の分割（スキル定義のパーサと画面）

- 何のための文書か: スキル定義のパーサ（`packages/core/src/skills/parse/`）と Web 画面（`apps/web/src/`）の長い関数・コンポーネントを、動きを変えずに分ける変更の、今の構造・分け方・段・確かめ方
- 対象: パーサの `parseDamageEffect`・`parseTimedFields`・`parseTrigger`・`parseStateGrantEffect`・`parseInstantEffect`・`parseDotEffect` と、その間で繰り返している欄の検査。画面の `ModernView`・`App`・`BuildSection`・`CharacterTray`・`RosterEditModal`
- 状態: 進行中（4 節の決定。段は 5 節）
- 関連: [skills-guide.md](skills-guide.md) 1.4 節（語彙を足すときの手順。パーサの入口は `parseSkillDefinition`）、[design-roster-edit.md](design-roster-edit.md)（育成状況の編集。`RosterEditModal`・`useRoster` を足した）、[design-modern-ui.md](design-modern-ui.md)
- 作成日: 2026-11-12
- 調べた時点: main の 6884f8e1

## 1. 背景と目的

- パーサは、語彙を足すたびに、効果の種類ごとの関数の末尾へ欄の検査を書き足してきた。いちばん長い `parseDamageEffect` は約 300 行で、欄どうしの組み合わせの検査が読む順に散らばり、新しい欄をどこに足すか・どの欄と組めないかを、関数を通しで読まないと決められない。
- 画面も、モダン UI のドラッグ・置く・外す・飛ぶ絵の処理が `ModernView` の 1 つの関数に入り、`App` は読み込み・保存・全編成の合計を 1 つの関数で持つ。
- 目的は、**読む人が欄や操作の単位で関数を開けるようにすること**。動き（定義の読み込みの結果・エラー文・計算・画面の見た目と操作）は変えない。

## 2. 今の構造

行数は空行とコメントを除いたもの（ESLint の `max-lines-per-function` で測った）。

### 2.1 パーサ

| 関数                                  | 行  | 中のまとまり（上から順）                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `damage.ts` の `parseDamageEffect`    | 266 | 本体（きっかけ・ダメージの種類・ref）→ 召喚の攻撃（早い return）→ 蓄積して爆発（早い return）→ ゲージのヒットと条件 → 遅れ → ヒットの形（perBurstHit・perCount・hitsRef・hitIntervalFrames・hitOffsetFrames・valueDelayFrames）→ perTrigger・valueBeforeFire → 周期の短縮（periodShorten。約 40 行）→ ヒットごとのゲージ（gaugePerHit）→ coreHit・perCount の間隔・順番の攻撃 → 1 ヒットの印 |
| `timed.ts` の `parseTimedFields`      | 219 | きっかけ（読める形を順に試す）→ 対象と絞り込み（武器・コード・クラス・部隊・数・excludeSelf・ペルソナ・最終防御力）→ 値（scaling・amplifies・ref）→ 絞り込みの欄を写す・decrease → 維持と HP のきっかけの組 → スタック → 条件 → 遅れ → perCount → holderHit → stat ごとの検査                                                                                                                |
| `trigger.ts` の `parseTrigger`        | 188 | 名前 → 書ける所の決まった形（applied・ended・fullStack・charge・weaponChangeEnd・coverHealed・reloadEnd）→ 時間の周期 → 射撃の回数（数える窓 during・発火の窓 firesDuring・firesOutside・確率）→ 出来事の回数                                                                                                                                                                                |
| `state.ts` の `parseStateGrantEffect` | 155 | 値の欄と不明な欄 → 敵への付与で書けない欄 → timed の欄（`parseTimedFields`）→ 自分の状態を見る循環の禁止（約 45 行）→ 敵の印 → 解除不可・stacksFrom・スタックの欄 → leadFrames → 中身・維持 0 秒                                                                                                                                                                                             |
| `instant.ts` の `parseInstantEffect`  | 141 | 種類ごとの書ける欄 → 種類ごとのきっかけ → 種類ごとの対象の規則 → 値・絞り込み・維持・遅れ・条件 → CT の欄                                                                                                                                                                                                                                                                                    |
| `dot.ts` の `parseDotEffect`          | 152 | 書ける欄（25 個の一覧）→ 間隔・きっかけ・維持 → 条件 → 刻み（firstTick・maxStacksRef・halfAfterLatest・tickIntervalFrames・hitOnApply）→ perCount と遅れ → stacksFrom・copyEachTick・sustained → ゲージ・刻みの遅れ                                                                                                                                                                          |

どの関数も、出力の `effect` を作ってから欄を 1 つずつ足し、足した欄を後の検査が読む（例: `gaugePerHit` は先に読んだ `delayFrames`・`periodShorten` を見る）。

`parseTrigger` は位置の引数が 8 つ（うち真偽が 5 つ）で、呼ぶ側は `parseTrigger(v.trigger, path, false, false, false, false, false, true)` のように書く。

パーサの間で繰り返している形（`parse/` 全体）:

| 形               | 例                                                                                                        | 箇所                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 不明な欄を落とす | `for (const key of Object.keys(v)) if (!allowed.includes(key)) fail(\`${path}.${key}\`, 'unknown field')` | 約 45                                        |
| `assumes` を読む | `if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, \`${path}.assumes\`)`        | 25                                           |
| true だけの欄    | `if (v.x !== true) fail(\`${path}.x\`, \`expected true, got ${JSON.stringify(v.x)}\`)`                    | 20（ほかに文の違う `'expected true'` が 12） |
| 正の数           | `typeof n !== 'number' \|\| !Number.isFinite(n) \|\| n <= 0`                                              | 約 15（文が 3 通りに分かれる）               |

数・ref・列挙の読み込み（`parseRef`・`parsePositiveInt`・`oneOf`・`parseDuration` など）は、すでに `common.ts` にまとまっている。

### 2.2 画面

| 関数                                                     | 行  | 中のまとまり                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `views/ModernView.tsx` の `ModernView`                   | 329 | 状態（一覧で待っているニケ・育成のモーダル・ドラッグ中の 5 つの状態）→ スロットの印とバッジ → 置いたニケの飛ぶ絵（`arrivalsRef` と `useLayoutEffect`）→ 置く・外す（`sendToTray`・`clearSlot`・`placeFromTray`）→ ドラッグの始め・終わり・取りやめ → 一覧のクリック → JSX（設定・合計・タブ・スロット・一覧・育成のモーダル・未対応の一覧・持ち上げた絵 `DragOverlay` の約 50 行）。ファイルの冒頭には、離したときのアニメーション（`DROP_ANIMATION`・`dropState`）と左ボタンのセンサーが約 90 行ある |
| `App.tsx` の `App`                                       | 183 | マスタと敵のプリセットの読み込み → キャラ一覧の読み込みと保存の復元 → 編成と全編成の保存 → 育成状況・一覧の並び → スキル定義・計算の入力・今の編成の計算 → 全編成の合計 → 未対応の一覧の材料 → 画面に渡す props → JSX                                                                                                                                                                                                                                                                                 |
| `components/BuildSection.tsx` の `BuildSection`          | 216 | 計算に使えない入力の知らせ → 装備 4 部位（種類・Lv・OL の 3 行。約 95 行）→ キューブ → コレクション・宝物                                                                                                                                                                                                                                                                                                                                                                                             |
| `components/modern/CharacterTray.tsx` の `CharacterTray` | 153 | 絞り込みの状態 → 受け口 → 見出し（バッジの絞り込み・宝物・クリア・並べ替えのポップアップ・知らせ・未実装の絞り込み・形の切り替え）→ 一覧                                                                                                                                                                                                                                                                                                                                                              |
| `components/RosterEditModal.tsx` の `RosterEditModal`    | 139 | 一覧の固定・選択・絞り込み・狭い画面の切り替え・前後のニケ → 左の一覧（絞り込み・行）→ 右の欄 → 足元（全部を戻す・閉じる）                                                                                                                                                                                                                                                                                                                                                                            |

`ModernView` の 5 つのドラッグの状態は、始め（`handleDragStart`）が設定し、終わりと取りやめが同じ 4 行で消す。`slotGrowthMarks`・`slotCollectionBadge` は、スロットの描画と持ち上げた絵の両方が使う。

## 3. 分け方

### 3.1 守ること（パーサ）

- **定義の読み込みの結果が同じ**: どの定義も、出力の欄・値・**欄の順**が変わらない（`parseTimedEffect` の注のとおり、最小構成の感度の鍵が欄の順に依る）。
- **エラー文が同じ**: どの入力でも、最初に落ちる検査とその文（位置 `path` を含む）が変わらない。このため、検査の順を入れ替えない。分けた関数は、今の順のとおりに呼ぶ。
- 分けた関数は、今のコードと同じく、作りかけの `effect` を受けて欄を足す形（`(v, effect, path) => void`）にする。後の検査が先に足した欄を読むので、欄を返して呼ぶ側で合わせる形より、順を崩しにくい。
- 分けた関数は同じファイルに置く（ほかのファイルからは呼ばない）。ファイルを分けるのは、ファイルが 50KB を超えそうなときだけ（今はどれも 30KB 未満）。
- 目安は 1 つの関数が 80 行まで。超えても、まとまりが 1 つなら分けない。

### 3.2 共通の部品（`common.ts`）

- `rejectUnknownKeys(v, allowed, path, message = 'unknown field')`: 不明な欄を落とす。`'not allowed with a summon trigger ({ summon })'` のように文の違う所は `message` で渡す。
- `parseAssumes(v, effect, path)`: `assumes` があれば読んで足す。
- `parseTrue(value, path)`: true でなければ `expected true, got …` で落とす。文が `'expected true'` だけの 12 か所は変えない（4 節の論点 3）。
- 正の数の検査は、文が 3 通りに分かれていて、まとめると文が変わるので、部品にしない。
- 部品は `parse/` の全部のファイルで使う（4 節の論点 2）。

### 3.3 パーサの関数ごと

- **`parseTrigger`**: 引数を `parseTrigger(v, path, options)` にし、`options` は `{ timer?: boolean | 'withStart'; during?: boolean | 'withState'; chance?; fullStack?; weaponChangeEnd?; reloadEnd? }`（省いたら false。今の既定と同じ）。中身は、`parseTimerTrigger`（時間の周期）・`parseShotCountTrigger`（射撃の回数。中で `parseCountingWindow`（during・firesDuring・firesOutside）と `parseChanceFields` に分ける）・`parseEventCountTrigger`（出来事の回数）に分ける。書ける所の決まった形の 7 つは、`parseTrigger` の冒頭に残す（どれも数行）。
- **`parseDamageEffect`**: 早い return の 2 つを `parseSummonDamage`・`parseAccumulateDamage` にする。残りは `parseGaugeHitsAndCondition`（ゲージのヒットと条件）・`parseDamageDelay`・`parseHitShape`（perBurstHit・perCount・hitsRef・hitIntervalFrames・hitOffsetFrames・valueDelayFrames）・`parseValueTiming`（perTrigger・valueBeforeFire）・`parsePeriodShorten`・`parseDamageGaugePerHit`・`parsePerCountSplit`（perCount の間隔・順番の攻撃）・`validateGaugePerHitSplit`（ゲージと perCount の組）・`parseHitMarks`（1 ヒットの印）に分け、`parseDamageEffect` は順に呼ぶだけにする。
- **`parseTimedFields`**: `parseTimedTrigger`（読める形を順に試す所）・`parseTimedTarget`（対象と絞り込みと、stat と対象の組の検査。絞り込みの欄は値の後に足すので、ここでは読んで返し、足すのは呼ぶ側）・`parseTimedValue`（scaling の検査・amplifies・ref。scaling と decrease は絞り込みと数の後に足すので、呼ぶ側に残す）・`validateHpTrigger`（維持と HP のきっかけの組）・`parseTimedStacks`・`parseTimedCondition`・`parseTimedDelay`・`parseTimedPerCount`・`parseHolderHit` に分ける。今の欄の順（trigger・target・amplifies か ref・絞り込み・数・scaling・decrease・維持・スタック・条件・遅れ・perCount・holderHit・assumes）を呼ぶ側で守る。
- **`parseStateGrantEffect`**: `validateNoSelfReference`（循環の禁止）・`parseGrantStacks`（stacksFrom・stacksPerFireRef・stackRefresh・stackImmutable）・`parseLeadFrames`・`parseGrantContents`（中身と維持 0 秒）に分ける。敵への付与で書けない欄は、定数 `ENEMY_GRANT_FORBIDDEN_KEYS` にして呼ぶ側に残す（数行で、残りの欄を味方への付与として読み替える所と組なので）。
- **`parseInstantEffect`**: 種類ごとの書ける欄を表（`INSTANT_FIELDS_OF: Record<InstantKind, …>`）にし、`parseInstantTrigger`（種類ごとのきっかけ）・`parseInstantTarget`（種類ごとの対象の規則）・`parseInstantKindFields`（維持・遅れ・条件・CT の欄）に分ける。不明な欄の文の順（`Object.keys(v)` の順に見る）は変えない。
- **`parseDotEffect`**: 書ける欄を定数 `DOT_KEYS` にし、`parseDotCondition`・`parseDotIntervalAndFirstTick`・`parseDotTickShape`（刻み）・`parseDotCounter`（perCount と遅れ）・`parseDotStacks`（stacksFrom・copyEachTick・sustained）・`parseDotGauge`（ゲージと刻みの遅れ）に分ける。

### 3.4 守ること（画面）

- 見た目（DOM・クラス・文）と操作（クリック・ドラッグ・キー・フォーカス・アニメーション）が変わらない。
- 画面の状態の持ち主は変えない（`ModernView` の状態は `ModernView` か、その中で呼ぶフックが持つ。保存のキー・`dispatch` の動作は変えない）。
- フックとドラッグの部品は別のファイルに置き、1 か所でしか使わない小さな欄のコンポーネントは同じファイルに置く（4 節の論点 5）。

### 3.5 画面のコンポーネントごと

- **`ModernView`**:
  - `components/modern/dropAnimation.ts`: 冒頭の `dropState`・`setDropState`・`DROP_ANIMATION`・`slotCardAt`・`trayVisualAt` を移す。
  - `components/modern/useSlotPlacement.ts`: 置いたニケの飛ぶ絵（`arrivalsRef` と `useLayoutEffect`）と、`sendToTray`・`clearSlot`・`placeFromTray` を持つフック。
  - `components/modern/useSlotDrag.ts`: センサー（左ボタンのセンサーも）・ドラッグ中の 5 つの状態・`noScrollNodeRef`・`handleDragStart`・`handleDragEnd`・`handleDragCancel` を持つフック。状態を消す 4 行は 1 つの関数にまとめる。
  - `components/modern/SlotDragOverlay.tsx`: `DragOverlay` の中身（操作の印・スロットから持ち上げた絵・一覧から持ち上げた絵）。
  - `slotGrowthMarks`・`slotCollectionBadge` は、`calc`・`team`・`roster` を受ける関数にして `useSlotDrag` とスロットの描画で使う。
  - 残る `ModernView` は、状態 2 つ（待っているニケ・育成のモーダル）と、フックを呼んで部品を並べる JSX になる。
- **`App`**:
  - `useMasters()`: 育成のマスタと敵のプリセットの読み込み。
  - `useSavedTeam(...)`: キャラ一覧の読み込み・保存の復元・編成と全編成の保存（`restored` を中に持つ）。
  - `usePartyTotals(...)`: 共通の設定の比べ・全編成の入力・まとめての計算・合計・計算中の印。
  - 未対応の一覧の材料（`summarySlots`）は `calcView.ts` の関数にする。
- **`BuildSection`**: 同じファイルに `GearField`（1 部位の種類・Lv と OL の 3 行）・`OverloadLineField`（OL の 1 行）・`CubeField`・`CollectionField` を置く。計算に使えない入力の知らせは `combatErrorOf(...)` の関数にする。
- **`CharacterTray`**: 同じファイルに `TrayFilters`（バッジ・宝物・クリア）・`TraySortMenu`（並べ替えのポップアップと知らせ）・`TrayShapeToggle` を置く。
- **`RosterEditModal`**: 同じファイルに `RosterEditList`（左の一覧と絞り込み）と `RosterEditFooter`（全部を戻す・閉じる）を置き、選択・前後のニケ・狭い画面の切り替えは `useRosterEditSelection` のフック（同じファイル）にする。

## 4. 決めたこと（2026-11-12、オーナー）

論点を推奨の案で出し、オーナーがすべて推奨のとおり承認した。

| #   | 論点                                           | 決定                                                                                                                               | 選ばなかった案                                                                                     |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | 設計書と段                                     | 設計書は 1 本。段は 4 つ（5 節）で、段ごとに 1 PR                                                                                  | パーサと画面で設計書を 2 本に分ける（どちらも動きを変えない分割で、論点が共通なので 1 本で足りる） |
| 2   | 共通の部品を使う範囲                           | `parse/` の全部のファイル（対象の 6 関数のほかの `attack.ts`・`weapon.ts`・`condition.ts` なども）                                 | 対象の 6 関数だけ（差分は小さいが、同じ形が 2 通りの書き方で残る）                                 |
| 3   | エラー文                                       | 変えない（`'expected true'` の 12 か所は部品にしない）                                                                             | 文を `expected true, got …` にそろえる（文が変わる。テストは正規表現で見ているので落ちない）       |
| 4   | `parseTrigger` の引数                          | 名前の付いた `options` のオブジェクト                                                                                              | 位置の引数のまま、中だけ分ける                                                                     |
| 5   | 画面の部品の置き場                             | フックとドラッグの部品は別ファイル、1 か所でしか使わない小さな欄は同じファイル                                                     | 全部を別ファイル（ファイルが増える）・全部を同じファイル（`ModernView.tsx` が 500 行を超えたまま） |
| 6   | 長さの lint の規則（`max-lines-per-function`） | 入れない（範囲の外に、1 パス目の `runFirstPassOnce`・件の一覧の `createHolderLists` など、もっと長い関数があり、警告だけが増える） | 警告で入れる・この変更の対象のファイルだけに入れる                                                 |
| 7   | 対象                                           | 1 節の 11 の関数・コンポーネント（9 節の長い関数は扱わない）                                                                       | `useRoster`（153 行）も入れる                                                                      |

## 5. 段

| 段  | 中身                                                                                                                      | 見直し                              |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| P1  | 共通の部品（3.2 節）と `parse/` 全体への適用、`parseTrigger`・`parseDamageEffect`・`parseDotEffect`・`parseInstantEffect` | `/simplify` → `/code-review medium` |
| P2  | `parseTimedFields`・`parseStateGrantEffect`                                                                               | 同上                                |
| W1  | `ModernView`・`App`                                                                                                       | 同上                                |
| W2  | `BuildSection`・`CharacterTray`・`RosterEditModal`                                                                        | 同上                                |

- P と W は独立なので、どちらから始めてもよい。この設計書と課題（`records/backlog/split-long-functions.json`）は、最初の段の PR に入れる。
- `parseTimedFields` は `parseStateGrantEffect` も呼ぶので、2 つは同じ段にする。

## 6. 確かめ方

### 6.1 パーサ

- `npm test` が通る。
- `npm run records:check` と `npm run records:minimal` の後で、生成物に差分が無い（スキルの対応状況・最小構成の検査が変わらない）。
- **読み込みの結果の一致**: `packages/core/data/skills/` の全部の定義を `parseSkillDefinition` で読み、`JSON.stringify` した文（欄の順を含む）を main と段の後で比べ、全部が一致する。使い捨ての script で、コミットしない。
- **エラー文の一致**: 検査の `fail` に、一時的に文（`path` を含む）をファイルへ書き足す行を入れて `npm test` を回し、main と段の後で、書かれた文の列（テストの順）が一致する。テストには文を見ない `toThrow()` が 92 あるので、テストが通るだけでは文の変化を拾えないため。一時の行はコミットしない。

### 6.2 画面

- `npm test`（`RosterEditModal.test.tsx`・`SlotCard.test.tsx` ほか）・`npm run typecheck`・`npm run lint` が通る。
- 画面を起動し（`.claude/launch.json` の web）、Playwright で次の操作の列を main と段の後で同じように回し、各手の DOM（style の属性を除く）と入力欄の値が一致する（アニメーションは終わった後に写す）。スクリーンショットの画素は、同じ版を 2 回回しても絵の読み込みと計算の時刻で揃わないので比べない。写しとスクリーンショットはスクラッチパッドに置き、コミットしない。
  - モダン UI: 一覧のクリックで空き枠に置く・枠が埋まったときのクリックで待つ → スロットのクリックで置く・一覧からスロットへドラッグ・スロットどうしの入れ替え・スロットから一覧へ戻す・操作の印のドラッグ・育成のモーダルで装備・OL の行・キューブ・コレクション（宝物）を変える・一覧の絞り込み・並べ替え・形の切り替え
  - クラシック: 同じ育成の欄を変える
  - 育成状況の編集: 一覧の絞り込み・編集済みのみ・ニケの選択・前後のニケ・欄の確定・読み込んだ値に戻す・全部を戻す
- アニメーションの途中（飛ぶ絵・離したときの戻り）は、画素で比べず、目で見て同じことを確かめる。

## 7. リスク

- パーサの検査の順を入れ替えると、2 つ以上の誤りを持つ入力で最初の文が変わる。6.1 節のエラー文の一致で拾う。
- `effect` に欄を足す順を変えると、欄の順に依る生成物（最小構成の感度）が変わる。6.1 節の読み込みの結果の一致と生成物の差分で拾う。
- 画面のフックに状態を移すと、描画ごとに作り直していた関数（`handleDragEnd` など）の参照が変わる場面がある。今も描画ごとに作り直しているので、`useCallback` を新しく足さない（足すと古い値を読む誤りを入れうる）。

## 8. 作り

### 8.1 段 P1（2026-11-12）

- 共通の部品 `rejectUnknownKeys`・`parseTrue`・`parseAssumes` を `common.ts` に足し、`parse/` の全部のファイルの同じ形を置き換えた。文の違う不明な欄の検査（召喚の攻撃・蓄積して爆発）は `message` で渡した。不明な欄と許す欄を同じ式で見ていない時間の周期の検査は、許す欄を並べ直して部品にした（`everySeconds` と印）。
- `parseTrigger` は `TriggerOptions` を受け、`parseTimerTrigger`・`parseShotCountTrigger`（中で `parseCountingWindow`・`parseFiringWindow`・`parseChance`）・`parseEventCountTrigger` に分けた。true だけの形の 2 つ（weaponChangeEnd・reloadEnd）は `parseTrueOnlyTrigger` にまとめた。
- `parseDamageEffect` は 3.3 節のとおり。名前は `parseGaugeHitsAndCondition`（ゲージのヒットと条件）・`parseDamagePerCount`（perCount の値。`parseHitShape` から呼ぶ）にした。coreHit は今の順（ヒットごとのゲージの後、perCount の間隔の前）を守るため、`parseDamageEffect` に 1 行で残した。
- `parseDotEffect` は `parseDotCondition`・`parseDotFirstTick`（間隔と秒の維持の比べ・firstTick）・`parseDotTickShape`・`parseDotCounter`・`parseDotStacks`・`parseDotGauge` に分けた。敵の状態（state）は今の順（firstTick の後、maxStacksRef の前）を守るため、`parseDotEffect` に 1 行で残した。
- `parseInstantEffect` は、書ける欄を `INSTANT_COMMON_KEYS` と `INSTANT_KEYS_OF` の表にし、`parseInstantTrigger`・`parseInstantTarget`・`parseInstantKindFields` に分けた。heal の healed の検査は、残弾数減少・現在の HP▼ の対象の検査より前に移した（種類が違うので、同じ定義で両方が落ちることはない）。
- 見直し（`/simplify`）で足した直し: true だけのきっかけの 4 つ（weaponChangeEnd・reloadEnd・coverHealed・chargeFull）を `parseTrueOnlyTrigger` にそろえた。数える窓と発火の窓の組めない検査を `rejectWindowCombos` に、文が全く同じ「正の有限の数」の検査（8 か所）を `assertPositiveFinite` にまとめた（3.2 節で部品にしないとしたのは文の違う形）。`parseInstantKindFields`・`parseDotCondition`・`parseDotCounter` は、呼ぶ側の局所の値を引数で受けず、`effect.trigger` から読む。perCount と gaugePerHit の組の検査は `validateGaugePerHitSplit` に出した。`condition.ts`・`definition.ts`・`objectUntil` に残っていた不明な欄の検査も `rejectUnknownKeys` にした。
- 確かめ: 6.1 節のとおり。全部の定義の読み込みの結果と、`npm test` の間に出たエラー文の列（並べ替えて比べた）が main と一致した。

### 8.2 段 P2（2026-11-12）

- `parseTimedFields` は 3.3 節のとおり `parseTimedTrigger`・`parseTimedTarget`・`parseTimedValue`・`validateHpTrigger`・`parseTimedStacks`・`parseTimedCondition`・`parseTimedDelay`・`parseTimedPerCount`・`parseHolderHit` に分けた。`parseTimedTarget` は絞り込みの欄（`TimedNarrowing`）と数を読んで返し、足すのは `parseTimedFields`（値の欄・名前の検査の後に足す今の順を守る）。`parseTimedValue` は scaling を返し、足すのは絞り込みと数の後。
- `parseStateGrantEffect` は `validateNoSelfReference`（循環の禁止）・`parseGrantStacks`（中で `parseStacksFrom`）・`parseLeadFrames`・`parseGrantContents` に分け、敵への付与で書けない欄を定数 `ENEMY_GRANT_FORBIDDEN_KEYS` にした（検査は今のとおり定数の順に見る）。
- 確かめ: 6.1 節のとおり、読み込みの結果とエラー文の列が main と一致した。

### 8.3 段 W1（2026-11-12）

- `ModernView` は 3.5 節のとおり。`dropAnimation.ts`（離したときのアニメーションと `slotCardAt`）・`useSlotPlacement.ts`（置く・外すと飛ぶ絵。`trayVisualAt` もここ）・`useSlotDrag.ts`（センサー・持ち上げている間の状態・始め・終わり・取りやめ）・`SlotDragOverlay.tsx`・`slotBadges.ts`（`slotGrowthMarks`・`slotCollectionBadge`）に分けた。
- `App` は `useMasters`・`useSavedTeam`（キャラ一覧の読み込み・保存の復元と保存・読めなかった保存の退避）・`usePartyTotals` に分け、未対応の一覧の材料を `calcView.ts` の `notesSummarySlots` にした。effect の順（敵のプリセット・育成のマスタ・キャラ一覧・編成の保存・全編成の保存）は変えていない。
- 確かめ: 6.2 節のとおり、操作の列の 36 手の DOM と入力欄の値が main と一致した。`npm test` の画面のテストも通る。

## 9. 扱わないもの

- 対象の外の長い関数: `frame/firstPass.ts` の `runFirstPassOnce`、`skills/holders.ts` の `createHolderLists`、`frame/plan.ts` の `planSkillHits`、`sim/engine.ts` の `runSimulation`、`skills/catalogDoc.ts` の `renderSkillCatalog`、`records/observations.ts` の `validateObservations`、`apps/web/src/useRoster.ts` の `useRoster`、`skills/parse/weapon.ts` の `parseWeaponChangeEffect`。計算の中心（1 パス目・2 パス目）は、分けるときに速さと結果の一致の確かめ方が別に要る。
- 語彙・検査の規則・エラー文・画面の見た目の変更。
- テストの長い `describe` の分割。

## 10. 経過

- 2026-11-12: 起票。オーナーが 4 節の論点をすべて推奨の案で承認した。
- 2026-11-12: 段 P1 を実装した（8.1 節）。
- 2026-11-12: 段 P2 を実装した（8.2 節）。
- 2026-11-12: 段 W1 を実装した（8.3 節）。
