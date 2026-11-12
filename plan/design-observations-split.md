# 設計書: 観測値の照合のコード（records/observations.ts）を役割ごとのファイルに分ける

- 対象: `packages/core/src/records/observations.ts` と、それを import するファイル（core の src・テスト・scripts、`tools/captures/`）
- 状態: 設計中（オーナーの承認待ち。8 節）
- 関連: [design-stage19.md](design-stage19.md) 2.3〜2.5 節（このファイルの元の設計）、[design-records-automation.md](design-records-automation.md) 3.4 節（観測値の形）、[design-workflow-simplification-8.md](design-workflow-simplification-8.md) 2 節（予測値の覚え）
- 作成日: 2026-11-12

## 1. いまの形（2026-11-12 の main）

### 1.1 中身

`observations.ts` は 3,346 行・約 195KB で、core で最も大きいファイルの 1 つ（ほかは `skills/holders.ts`・`skills/types.ts`）。中身は次の部分に分かれている。

<!-- prettier-ignore -->
| 部分 | 行 | 大きさ | 中身 |
| --- | --- | --- | --- |
| 観測値の型 | 1〜420 | 約 21KB | 語彙（`OBSERVATION_KINDS` など）・`Observation`・`CompareSpec`・`Tolerance`・`ObservationScope`・`validateScope`・`invalidReasonsOf` |
| 比べる設定 | 同上の中 | （上に含む） | `CompareSetup` と、その部品（遅れの上書き `burstDelayOverrideOf`・効果の足し `withAddedEffects`・着地点 `landingFixed` など） |
| 指標の補助関数 | 421〜1572 | 約 69KB | `Metric`・`MetricContext` と、指標が使う関数 |
| 指標の表 `METRICS` | 1573〜1888 | 約 20KB | 指標の名前 → 必須の引数と取り出し関数 |
| 指標の補助関数（表の後） | 1889〜2602 | 約 45KB | 表より後に書いた補助関数（関数の巻き上げで表から呼べる） |
| 検証 `validateObservations` | 2603〜2781 | 約 11KB | 1 関数・約 176 行 |
| 録画の設定の読み替え | 2782〜3052 | 約 15KB | `manualBurstsOf`・`jumpWindowsOf`・`withoutEffects`・`RecordsData`・`buildTeamInput` |
| 照合ランナー | 3053〜3196 | 約 6KB | `compareValue`・`predictionKey`・`runObservations` |
| 残差の描画 | 3197〜 | 約 7KB | `renderResidualRows`・`renderOtherRows`・`renderResiduals` |

### 1.2 部分どうしの依存

最上位の宣言の参照を数えると、依存は一方向で、循環は無い。

- 指標 → 観測値の型（`CompareSpec`）
- 録画の設定の読み替え → 観測値の型・比べる設定
- 検証 → 観測値の型・比べる設定・指標（名前と必須の引数）・設定の値の読み（`jumpWindowsOf`・`manualBurstsOf`・`holdFireRangesOf`）
- 照合ランナー → 観測値の型・指標・読み替え（`buildTeamInput`）
- 残差の描画 → 観測値の型・照合ランナー（`Residual`）

`METRICS` の名前を列挙する所は無い（どこも `METRICS[名前]` で引くだけ）ので、表の並びは出力に効かない。

### 1.3 使う側

45 ファイルが import している（core の src 8・テスト 23・scripts 7・`tools/captures/` 7）。多くは `type Observation` だけで、`METRICS`・`buildTeamInput` を使うのは照合の道具（`predictions.ts`・`sensitivity.ts`・`tools/captures/recipes/` の 2 つ）とテスト。

### 1.4 変わり方

新しい検証のたびに `METRICS` に指標と補助関数が足される（2026-11-10〜12 の 2 日で 6 commit）。並行するブランチが同じファイルの末尾付近に指標を足すので、衝突もここに集まる。

## 2. 目的とやらないこと

- 目的: 役割ごとに読む所・直す所を絞る。指標を足す PR の差分を、そのテーマのファイルに閉じる。
- やらないこと:
  - 振る舞いを変えない。関数の中身は移すだけ（`validateObservations` の中の分け方だけは 3.3 節で変えるが、出すメッセージの文と順は変えない）。
  - 指標の名前・引数、観測値と予測の JSON の形は変えない。
  - テストのファイルは分けない（3.4 節）。

## 3. 論点と案

### 3.1 論点 1: 分け方

#### 案 A（推奨）: `records/observations/` に役割ごとのファイルを置き、指標はテーマで分ける

<!-- prettier-ignore -->
| ファイル | 中身 | 大きさの見込み |
| --- | --- | --- |
| `observations/types.ts` | 観測値の型と語彙・`validateScope`・`invalidReasonsOf`・`recordingOrder` | 約 10KB |
| `observations/setup.ts` | `CompareSetup` とその部品（`BurstDelayOverrideSetup`・`burstDelayOverrideOf`・`AddedEffect`・`withAddedEffects`・`DroppedEffect`・着地点の語彙と `landingFixed`）と、設定が ID で指す観測値の値の読み（`jumpWindowsOf`・`manualBurstsOf`・`holdFireRangesOf`） | 約 17KB |
| `observations/metrics/context.ts` | `Metric`・`MetricContext` と、テーマをまたいで使う小さな補助（`slotOf`・`frameArgOf`・`eachOrOne`・`firstCount`・`withArgs`・`median`・`nthActivationOf`・`atShotFrame` など） | 約 5KB |
| `observations/metrics/skillHits.ts` | スキルのヒット・持続ダメージ・回復・出来事（`skillHit*`・`dot*` の時刻・`heal*`・`eventFrames`・`eventCount`・`eventTallies`） | 約 28KB |
| `observations/metrics/damage.ts` | 与ダメージと 1 ヒットの値・命中率（`teamTotalDamage`・`hitDamage`・`coreHitRate`・`burstHitDamage`・`dotHitDamage`・`skillHitDamage` など） | 約 15KB |
| `observations/metrics/firing.ts` | 射撃の刻み・マガジン・リロード・狙えない窓（`shotCount`・`shotIntervals`・`magazineShots`・`reload*`・`maxAmmoAt` など） | 約 29KB |
| `observations/metrics/burst.ts` | バーストの時刻表・ゲージ・CT（`fullBurst*`・`burstActivation*`・`gaugeFull*`・`cooldownCutFrames`・`burstEffectDelay` など） | 約 30KB |
| `observations/metrics/buffs.ts` | バフの区間・状態のスタック・確率（`buffWindow*`・`buffEdge*`・`chance*`・`stateStack*`・`counterAtBursts` など） | 約 28KB |
| `observations/metrics/index.ts` | テーマごとの表をつないだ `METRICS`（同じ名前が 2 つのテーマにあれば読み込みで止める） | 1KB 未満 |
| `observations/validate.ts` | `validateObservations` | 約 11KB |
| `observations/teamInput.ts` | `RecordsData`・`withoutEffects`・`buildTeamInput` と、その中だけで使う関数 | 約 13KB |
| `observations/run.ts` | `Residual`・`compareValue`・`Prediction`・`PredictionMemo`・`predictionKey`・`runObservations` | 約 6KB |
| `observations/render.ts` | 残差の一覧の描画 | 約 7KB |

- テーマのファイルは、指標の表の自分のぶん（`firingMetrics` など）と、その指標だけが使う補助関数を持つ。指標を足すときは、読むモデルの出力でテーマを選び、そのファイルの表と補助関数だけを直す。
- テーマのファイルどうしの import は `context` ← `skillHits` ← `damage` ← `firing` ← `buffs`、`damage` ← `burst` の向きだけにする（いまの参照を数えると、この向きで循環しない。2 つ以上のテーマが使う小さな補助は `context.ts` に置く）。
- ファイル名は、リポジトリの流儀（`burstDamage.ts`・`buildEffects.ts`）に合わせて camelCase にする。
- 置き場所の名前は、リポジトリの直下の観測値のデータ（`records/observations/<録画 id>.json`）と同じ `observations/` になる。設定や道具でパスの頭から当てている所（`.gitignore`・`.prettierignore`・`tools/git/`・`tools/drive/`）に、`packages/core/src/records/observations/` に当たる型は無い。
- 得: どのファイルも 30KB 前後に収まる。指標を足す PR の差分と衝突が、そのテーマのファイルに閉じる。検証・照合・描画を読むときに指標の 134KB を開かなくてよい。
- 失: ファイルが 1 つから 13 になる。テーマの境目にある指標（例: フルバーストの中のマガジンの発数は射撃とバーストのどちらにもとれる）は、置き場所を決めて 1 か所にするしかない（取り出す元の出力で決める。例の指標は射撃の列を数えるので `firing.ts`）。

#### 案 B: `METRICS` だけを外に出す（`records/metrics.ts`）

- 得: 差分が最も小さい。
- 失: `metrics.ts` が約 134KB で、いまの最も大きい部分がそのまま残る。`observations.ts` にも約 60KB が残る。

#### 案 C: 案 A のうち、指標を分けずに `observations/metrics.ts` 1 つにする

- 得: 指標のテーマの境目を決めなくてよい。
- 失: 指標のファイルが約 134KB。衝突の集まる所が分かれない。

### 3.2 論点 2: 公開する名前を元のファイルから再 export するか

#### 案 A（推奨）: import 先を直す（`observations.ts` は消し、再 export の入口を置かない）

- 45 ファイルの import を、名前の置き場所（3.1 節の表）に直す。型だけを使う所は `observations/types.ts` を指す。
- 得: 1 つの名前に import の道が 1 つ。何に依存しているかが import で分かる。ファイル `observations.ts` とディレクトリ `observations/` が同じ名前で並ばない。
- 失: 45 ファイルの書き換え（どれも import の行だけ）。並行するブランチが新しく `observations.ts` から import した所は、取り込んだ後に typecheck で落ちる（直し方は 5 節）。

#### 案 B: `observations.ts` を、分けたファイルの名前を再 export するだけの入口にして残す

- 得: 使う側の差分が無い。並行するブランチの import も落ちない。
- 失: 同じ名前に 2 つの道ができ、どちらで import するかが揃わない。公開する名前を足すたびに入口にも足す。前例の `skills/types.ts` → `skills/parse/` は、入口の 3 関数だけを再 export する形で、全部の名前を通す入口ではない。

### 3.3 論点 3: `validateObservations` を中で分けるか

#### 案 A（推奨）: 分ける（移す commit とは別の commit。同じ PR）

- 1 つの観測値の検査を、次の関数に分ける。`validateObservations` は観測値ごとにこれらを順に呼ぶだけにする。
  1. 観測値の欄（ID・録画・語彙・必須の文・複数の録画・単位と幅・日付・失効・`scope`・`use` と `compare` の組）
  2. 比べる指定（指標と必須の引数・`model`・敵のプリセットと出来事のセット・条件・着地点）
  3. 比べる設定が ID で指す観測値（`jumpWindows`・`obstacles`・`pelletHits`・`manualBursts`・`holdFire`）
  4. 遅れの上書き（`burstDelays`）・枠の並び（`noBurstSlots`・`noFireSlots`・`holdFire`）・許容幅
- 3 の 5 か所は同じ形の検査（有るか・同じ録画か・`use` が `input` か・失効していないか・値の形）を繰り返しているので、1 つの関数にまとめる（`jumpWindows` だけ `use` を見ない。いまのとおり）。
- 指す観測値を毎回 `observations.find` で探すのをやめ、始めに 1 回、ID → 観測値の Map を作る（同じ ID が 2 つあれば先のもの。いまの `find` と同じ）。
- 出すメッセージの文と、1 つの観測値の中での順は変えない。
- 得: 比べる設定の欄を足すとき（[design-compare-setup-extension.md](design-compare-setup-extension.md) の型）に、直す所が 3 か 4 の 1 つに決まる。
- 失: 移すだけの PR より見直す所が増える（commit を分けて、移す commit は中身が同じことだけを見ればよいようにする）。

#### 案 B: 分けずに移すだけにする

- 得: PR が移すだけになる。
- 失: 176 行の 1 関数と、5 か所の同じ形の検査が残る。

### 3.4 論点 4: テスト

- `records/__tests__/observations.test.ts`（1,245 行）は import を直すだけにし、分けない。中身は、全件の照合・結論の検査・指標の部品・Stage 20-E の形・`withoutEffects` が混ざっていて、どれをどこへ移すかは、この PR の「移すだけ」とは別の話になる。分けたくなったら別の課題にする。

## 4. 確かめ方

1. 変える前の main で、次を scratchpad に取っておく。
   - `NIKKE_NO_RESIDUAL_CACHE=1 npm run records:residual` の出力（全行。覚えを使わず、モデルを回し直す）
   - `npm run records:check` の後の生成物（作り直して差が無いこと）
   - `npm run records:minimal` の後の `records/minimal/`
   - `METRICS` の名前と必須の引数の一覧（JSON）と、`observations.ts` が export する名前の一覧
2. 変えた後に同じものを取り、1 と差が無いこと。生成物は `git diff` が空。export する名前の一覧は、分けたファイルの export を合わせたものが 1 と同じ（3.1 節で内部の関数を export するようになったぶん（`context.ts` の補助など）だけ増える）。
3. 移した関数の中身が同じこと: 古いファイルの最上位の宣言ごとに、同じ本文が分けたファイルのどこかにあるか（`export` の付け外しを除く）を、一時の script で比べる（コミットしない）。3.3 節の commit は、1 の出力と `npm test` で見る。
4. `npm test`・`npm run typecheck`・`npm run lint`。テーマのファイルの import が 3.1 節の向きだけであることを見直しで確かめる。
5. 見直しは AGENTS.md「コミット手順」のとおり `/simplify` → `/code-review medium`。

## 5. 並行するブランチへの影響

- 起案した時点（2026-11-12）で、開いている PR と origin のブランチに `observations.ts` を変えているものは無い。PR を出す直前にもう一度見て、あれば先にマージされるのを待つか、そのブランチの変更を取り込んでから分ける。
- この PR の後に、`observations.ts` を変えていたブランチを `npm run pr:prep` でリベースすると、「main で消したファイルを変えた」衝突で止まる。直し方: 足した指標と補助関数を 3.1 節の表のテーマのファイルに移し（指標の表は、そのテーマの `…Metrics`）、`git rm packages/core/src/records/observations.ts` してから続ける。`observations.ts` から import を足したファイルは typecheck で落ちるので、名前の置き場所に直す。
- 指標の置き場所は、ほかのセッションが読む現状の文書（`plan/verification-guide.md`。6 節）に書くので、衝突を直すときも新しく指標を足すときも、そこから辿れる。

## 6. 文書と注釈の直し

- 現状の文書: `plan/verification-guide.md` の 3 か所（観測値の形の置き場所、指標の置き場所と足し方、指標の全部の在りか）を新しい置き場所に直す。指標の足し方は「読むモデルの出力でテーマのファイルを選び、その表に足す」にする。
- コードの注釈: `records/observations.ts の …` と書いた所（`skills/types.ts`・`records/claims.ts`・`frame/shots.ts`・`types.ts`・`team.ts`・`scripts/residual-cache.ts`・`__tests__/sodaBurstTeam.test.ts`）を、その名前の新しい置き場所に直す。
- 記録（設計書・検証記録・結論の「モデル側」）は、書いた時点の版を指すので直さない（AGENTS.md「文書の書き方」）。
- 予測値の覚え（`scripts/residual-cache.ts`）は、`packages/core/src/` の全部のファイルのパスと中身の hash で分けるので、手を入れなくてよい（分けた後の初回は覚えが外れ、全部を回し直す）。

## 7. 段取り（1 PR）

1. commit 1: 3.1 節のとおりに移す（中身は変えない）。import を直し、6 節の文書と注釈を直す。4 節の 2・3 で、出力と中身が同じことを確かめる。
2. commit 2: 3.3 節のとおりに `validateObservations` を中で分ける。4 節の 2 をもう一度回す。
3. 見直し（4 節の 5）→ `npm run pr:prep -- --push` → PR → 自動マージの予約。課題（`records/backlog/observations-split.json`）を閉じる。

## 8. 決めてほしいこと

1. 分け方: 3.1 節の案 A（`records/observations/` に役割ごとのファイル、指標はテーマで 5 つ）
2. 公開する名前: 3.2 節の案 A（import 先を直し、再 export の入口を置かない）
3. `validateObservations`: 3.3 節の案 A（中で分ける。移す commit とは別の commit で、同じ PR）
4. テスト: 3.4 節のとおり分けない

## 9. 経過

- 2026-11-12: 起案。
