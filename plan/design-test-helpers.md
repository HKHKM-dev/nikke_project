# 設計書: テストの道具の重なりを共通の道具に寄せる

- 何のための文書か: `packages/core` のテストが 1 ファイルずつ自前で持っている同じ道具（JSON を読む・枠を作る・編成を作る・敵を作る）を、共通の道具（`packages/core/src/__tests__/` のテストでないファイル）に寄せる変更の、今の構造・案と得失・論点・段・確かめ方
- 対象: `packages/core/src/` の下のテスト（`*.test.ts`）と、共通の道具（`__tests__/teamHelpers.ts` ほか）。本体のコードは変えない
- 状態: 進行中（5 節の段）
- 関連: [skills-guide.md](skills-guide.md) 1.4 節の「テスト」（編成のテストの書き方と例）、[design-vocab-dedup.md](design-vocab-dedup.md)（本体の側の重なりを寄せた変更）、[design-split-long-functions.md](design-split-long-functions.md) 9 節・[design-split-first-pass.md](design-split-first-pass.md) 8 節（テストの分割は扱わないとした）
- 作成日: 2026-11-18
- 調べた時点: main の 37de18db

## 1. 背景と目的

- テストは 404 ファイル・約 64,000 行で、本体（テストでない `.ts`・`.tsx`。約 78,000 行）に近い量がある。
- 同じ名前の道具を、多くのテストが 1 ファイルずつ自前で定義している（2.2 節）。JSON を読む 3 行の `readJson` は 132 ファイル、スペック固定の枠を作る `fixedSlot` は 57 ファイルにある。
- 入力の形を変えると、その写しを全部直すことになる。手入力の条件 `fullCharge` を消した #1194 は、テストを 128 ファイル変えた。変えた行は、ほぼ全部が枠を作る道具の中の同じ 1 行（`condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true }`）で、128 ファイルのうち 93 ファイルが自前の枠の道具を持っていた。
- 共通の道具（`__tests__/teamHelpers.ts`）は 2026-11-01 からあり、その後に足したテストはほぼこれを使っている（2.4 節）。重なりの大半は、その前に書いたテストに残っている。
- 目的は、**入力の形を変えたときに直す所を 1 か所にすること**と、テストごとの違い（条件・敵・宝物の段階）が、写しの中の 1 行でなく、呼び出しの引数に見えるようにすること。テストが確かめている中身（期待値）は変えない。

## 2. 今の構造

### 2.1 共通の道具

`packages/core/src/__tests__/` に、テストでないファイルが 6 つある。

<!-- prettier-ignore -->
| ファイル | 出すもの | 使うテスト |
| --- | --- | --- |
| `teamHelpers.ts` | `readJson`・`characterOf`・`rawDefinition`・`skillValueOf`・`fixedSlot(id, json?)`・`fixedTeam(ids, controlledSlot, extra?)`・`SHOOTING_RANGE_ENEMY`・`effectWindows`・`windowsFrom`・`fullBurstCooldownCuts`・`describeEveryShotInOneGroup` | 98 ファイル（`fixedSlot` を使うのは 32） |
| `fixtures.ts` | `makeCharacter`（作り物のキャラ） | 43 ファイル |
| `runTeam.ts`・`historyHelpers.ts`・`firstPassTimeline.ts`・`averageCadence.ts` | 計算を回す・履歴を読む道具 | — |

- `teamHelpers.ts` は `vitest`・`runSimulation`・`parseSkillDefinition` などを import する。JSON を読むだけのテストがこれを import すると、計算の本体まで読み込む。
- `teamHelpers.ts` の `readJson` は、渡した相対パスを `teamHelpers.ts` の場所から解く。テストの自前の `readJson` は、そのテストの場所から解く。テストは 5 つのフォルダ（`src/__tests__`・`src/skills/__tests__`・`src/records/__tests__`・`src/frame/__tests__`・`src/burst/__tests__`）にあり、データまでの相対パスがフォルダごとに違う。

### 2.2 繰り返している道具

テストの最上位で定義している、同じ名前の関数・定数（`packages/`・`apps/`・`tools/` の全部のテストで数えた。ほぼ全部が `packages/core`）:

<!-- prettier-ignore -->
| 名前 | 定義するファイル | 中身の種類 | 行の合計 | 中身 |
| --- | --- | --- | --- | --- |
| `readJson` | 132 | 3 | 396 | JSON を読む 3 行。128 ファイルは文字まで同じ |
| `character` | 95 | 40 | 176 | `data/characters/<id>.json` を読む 1 行が 55 ファイル（相対パスの違いで 2 通り）。残りは、そのテストの作り物のキャラ |
| `DEFINED` | 44 | 2 | 44 | `data/skills/index.json` の定義のあるキャラの集合 |
| `master`・`profile` | 37・36 | 4・2 | 約 75 | `data/enemies.json` の敵のプリセットと、射撃場の的 |
| `fixedSlot` | 57 | 29 | 882 | スペック固定・Lv 10 の枠（2.3 節） |
| `slotOf` | 28 | 20 | 322 | 同じ（名前だけ違う） |
| `team` | 72 | 39 | 361 | 枠と操作キャラから 180 秒の編成を作る 3〜7 行 |
| `enemy` | 65 | 11 | 約 65 | 敵（防御力・コード・コアの有無）の 1 行 |
| `rangeEnemy` | 31 | 11 | 約 250 | 射撃場の敵（出来事・的・着地点つき） |
| `definition`・`definitionWith`・`patched` | 27・9・19 | 24・9・13 | 約 320 | 定義を作る・読む・1 つの効果を書き換えて読む |

- 中身が文字まで同じ関数だけで、2 つ目からの行が約 1,350 行ある。
- 読む先は、`data/characters/<id>.json`・`data/skills/<id>.json`・`data/skills/index.json`・`data/enemies.json`・`data/masters/*.json` でほぼ全部（ほかは `records/observations/` の 2 か所など）。

### 2.3 枠・編成・敵の道具の中身の違い

`fixedSlot`（と `slotOf`）の 29 通りは、次の組み合わせの違い:

<!-- prettier-ignore -->
| 違い | 形 |
| --- | --- |
| 手入力の条件 | `{ coreHitRate: 1, distanceBonus: false }` が大半。`coreHitRate: 0` が 8 ファイル。引数で受けるものもある |
| 条件が自動か | `conditionMode: 'auto'` を付けるもの・引数で切り替えるもの |
| 宝物の段階 | `treasurePhase` を引数で受けるもの |
| 最大 HP・防御力 | `hpOverride`・`defenceOverride`（スペック固定の値）を付けるもの |
| 定義 | 定義のあるキャラにだけ付ける（`DEFINED` を見る）・いつも付ける・引数の JSON で差し替える・読んだ JSON を書き換える関数を受ける |
| その他 | `Partial<TeamSlotInput>` を受けて上書きするもの |

- 共通の `fixedSlot(id, json?)` は、条件が `{ coreHitRate: 1, distanceBonus: false }`、定義は定義のあるキャラにだけ（`json` があれば差し替え）。いちばん多い写し（17 ファイル）と中身が同じ。
- `enemy` は 3 通りで 54 ファイル（防御力はスペック固定の値で、コードが無し 30・`'Fire'` 17。防御力 100・`'Wind'` が 7）。共通の `SHOOTING_RANGE_ENEMY` はコード無しの形。
- `rangeEnemy` は 2 通りで 20 ファイル（防御力がスペック固定の値か 100 か。どちらも `'Fire'`・出来事 `range-3min-jump`・的 `range-bigarms`）。
- `team` は「枠の列と操作キャラを受けて、手元の `enemy` で 180 秒・バーストありの編成を返す」が 20 ファイルで同じ。残りは、枠でなくキャラの番号を受ける・バーストの有無を受けるなどの違い。

### 2.4 いつ増えたか

- 2026-11-10 からの 1 週間に足したテストは 105 ファイル。そのうち `readJson` を自前で持つのは 11、`fixedSlot`・`slotOf` を自前で持つのは 1。新しいテストは、ほぼ共通の道具を使っている。
- [skills-guide.md](skills-guide.md) の「テスト」が編成のテストの例に挙げる `deltaTeam.test.ts` は、自前の `readJson`・`character`・`DEFINED`・`fixedSlot`・`team` を持つ（共通の道具が出来る前の形）。

## 3. 案

### 3.1 守ること

- **テストが確かめる中身を変えない**。`expect(` の行・`it(`・`describe(` の題・期待値に差分を出さない。テストの数も同じ。
- **枠・編成・敵の中身を変えない**。置き換えた後の道具が返す値は、置き換える前の手元の道具が返す値と同じ（6 節で確かめる。テストが通るだけでは、条件が変わっても気付かないテストがある）。
- **本体のコードを変えない**。変えるのはテストと、テストの共通の道具と、手引きと、lint の設定だけ。
- **テストの時間を増やさない**。共通の道具の import で、軽いテストが計算の本体を読み込まないようにする。
- テストごとの違い（2.3 節）は、呼び出しの引数に書く。共通の道具の既定に隠さない。

### 3.2 道具の形

- **読む道具（軽い）**: `__tests__/data.ts` を足す。import は `node:fs` と型だけ。
  - `readData<T>(path)`: `packages/core/data/` からの相対パスで JSON を読む（`readData('masters/gear.json')`）。
  - `characterOf(id)`・`rawDefinition<T>(id)`・`DEFINED_IDS`（定義のあるキャラの集合）。
  - `teamHelpers.ts` の `readJson`・`characterOf`・`rawDefinition` は、これを再 export する形にする（今の 98 ファイルの import は変えない）。
- **枠**: `fixedSlot(id, options?)`。`options` は `{ definition?; edit?; treasurePhase?; condition?; conditionMode?; hp?; defence?; always? }`。
  - `definition` = 差し替える定義（JSON か読み込んだ定義）、`edit` = 読んだ JSON を書き換える関数、`hp`・`defence` = スペック固定の最大 HP・防御力を付ける、`always` = 定義の無いキャラでも落とさずに定義を読む（今の「いつも付ける」写しと同じに、無ければ読み込みで落ちる）。
  - 既定は今の共通の `fixedSlot` と同じ（条件は `{ coreHitRate: 1, distanceBonus: false }`、定義は定義のあるキャラにだけ）。
  - 今の 2 つ目の引数（差し替える JSON。9 ファイルが使う）は `{ definition: json }` に書き換える。
- **敵**: `SHOOTING_RANGE_ENEMY`（コード無し）に足して、`fixedEnemy(element)`（スペック固定の防御力・コアあり）と `rangeEnemy({ defence? })`（射撃場の出来事・的・着地点つき。`data/enemies.json` を 1 回だけ読む）。
- **編成**: `fixedTeam` を、枠の列も受けられる形にする（`fixedTeam(slots | ids, controlledSlot, extra?)`。`extra` で敵・バーストの有無を上書き）。
- 定義を作る道具（`definition`・`definitionWith`・`patched`）は、テストごとに形（日付・スロット・書き換え方）が違い、量も小さい。案 3 でだけ扱う。

### 3.3 案

- **案 0: 変えない**。手引きの例だけ、共通の道具を使うテストに替える。新しいテストはもう共通の道具を使っているので、重なりは増えない。入力の形を変えるたびに、古い写し（枠の道具は 85 ファイル）を直す手間は残る。
- **案 1: 読む道具だけ寄せる**（`readJson`・`character`・`DEFINED`・`master`・`profile`）。形がほぼ同じなので、機械的に置き換えられる。枠の写しは残るので、#1194 のような手間は減らない。
- **案 2: 案 1 に足して、枠・編成・敵を寄せる**（`fixedSlot`・`slotOf`・`team`・`enemy`・`rangeEnemy`）。違いを引数にする（3.2 節）。入力の形を変えたときに直す所が、共通の道具の 1 か所になる。
- **案 3: 案 2 に足して、定義を作る道具も寄せる**（`definition`・`definitionWith`・`patched`）。

<!-- prettier-ignore -->
| 案 | 変えるテスト | 消える行（見込み） | 入力の形を変えたときに直す所 | 変わりうるもの |
| --- | --- | --- | --- | --- |
| 0 | 0（手引きだけ） | 0 | 85 ファイルの写し | なし |
| 1 | 約 155 ファイル | 約 700 | 85 ファイルの写し | なし（読む先が同じことを 6 節で確かめる） |
| 2 | 約 175 ファイル | 約 2,600 | 共通の道具の 1 か所 | 枠・敵の中身（6 節の比べで拾う） |
| 3 | 約 190 ファイル | 約 2,900 | 同上 | 定義の JSON の形（テストごとに違うものを 1 つの道具に合わせる） |

## 4. 論点（オーナーの判断）

決定（2026-11-18、オーナー）: どの論点も推奨の案で承認。

<!-- prettier-ignore -->
| # | 論点 | 推奨 | ほかの案 |
| --- | --- | --- | --- |
| 1 | 範囲 | **推奨: 案 2**。手間の元（枠の写し）まで寄せる。定義を作る道具（案 3）は、形がテストごとに違い、寄せると引数が増えるだけなので入れない | 案 0（手引きの例だけ直す）・案 1・案 3 |
| 2 | `fixedSlot` の引数 | **推奨: `fixedSlot(id, options?)`**（3.2 節）。今の 2 つ目の引数（JSON）を使う 9 ファイルは `{ definition }` に書き換える | 今の `fixedSlot(id, json?)` を保ち、3 つ目に `options` を足す（書き換えは無いが、`fixedSlot(id, undefined, { … })` の呼び出しが増える） |
| 3 | 読む道具のファイル | **推奨: `__tests__/data.ts` に分ける**（`node:fs` だけを import）。軽いテストが計算の本体を読み込まない | `teamHelpers.ts` に置く（ファイルは増えないが、`skills/__tests__/` の単体テストも計算の本体を読み込む） |
| 4 | 写しがまた増えるのを防ぐ | **推奨: 手引きの例を替え、lint の規則を足す**。テストのファイルで `readJson`・`fixedSlot`・`slotOf` という名前の関数を定義したら落とす（`no-restricted-syntax`）。規則は、その名前の写しを寄せ終えた段で足す | 手引きの例を替えるだけ（今も新しいテストはほぼ共通の道具を使っている） |
| 5 | 置き換えの進め方 | **推奨: 使い捨ての脚本（構文木）で、形の合う写しを機械的に置き換え、合わない写しは手で直す**。脚本はコミットしない | 全部を手で直す |
| 6 | 段と PR | **推奨: 3 段で、1 段 1 PR**（5 節）。1 本が 100 ファイルを超えるので、段を分けて、開いている PR との衝突を短くする | 1 PR にまとめる |
| 7 | 対象の外 | **推奨: `apps/web`・`tools` のテストと、テストのファイルの名前・分割は扱わない**（8 節） | `apps/web`・`tools` も同じ道具に寄せる（フォルダが違い、読む先も違う） |

## 5. 段

<!-- prettier-ignore -->
| 段 | 中身 | 見直し |
| --- | --- | --- |
| T1 | `__tests__/data.ts` を足し、`readJson`・`character`・`DEFINED`・`master`・`profile` の写しを置き換える。手引きの例を替える | `/code-review medium`（`tools/`・`packages/` の本体は変えないが、テストの道具はコード） |
| T2 | `fixedSlot(id, options?)` にし、`fixedSlot`・`slotOf` の写しを置き換える | 同上 |
| T3 | `fixedEnemy`・`rangeEnemy`・`fixedTeam` を足し、`enemy`・`rangeEnemy`・`team` の写しを置き換える。lint の規則を足す | 同上 |

- この設計書と課題（`records/backlog/test-helpers.json`）は、最初の段の PR に入れる。
- どの段も、始める前に、開いている PR と origin のブランチを見る（テストのファイルを直す PR が開いていれば、その後にする）。

## 6. 確かめ方

- `npm test` が通り、テストのファイルの数とテストの数が main と同じ。`npm run typecheck`・`npm run lint` が通る。
- **期待値に差分が無い**: 段の差分のうち、`expect(`・`it(`・`describe(`・`toBe`・`toEqual` を含む行の足し引きが無いことを、差分を機械で見て確かめる（置き換えで呼び出しの名前が変わる行は、一覧にして目で見る）。
- **道具の返す値が同じ**（T2・T3）: 使い捨ての脚本で、置き換える前の手元の道具と、置き換えた後の呼び出しを、そのテストが実際に渡す引数で回し、返す枠・敵・編成が深い比べで一致することを確かめる。
- **読む先が同じ**（T1）: 置き換える前と後で、読むファイルの絶対パスの一覧がテストごとに同じ。
- **本体に差分が無い**: 差分は、テスト・`__tests__/` の道具・`plan/`・`eslint.config.js`・課題のファイルだけ。
- **テストの時間**: `npm test` を main と段の後で 3 回ずつ回し、中央値が増えていない（`packages/core` のテストは `isolate: false` で回るので、import の増え方は小さい見込み）。

## 7. リスク

- **中身の違う写しを同じと見て置き換える**: 条件（`coreHitRate` の 0 と 1）・敵のコード・最大 HP の有無は、テストによっては結果に出ない。6 節の「道具の返す値が同じ」で拾う。
- **相対パスの読み違い**: フォルダごとに `../` の数が違う。6 節の「読む先が同じ」で拾う。
- **並行する PR との衝突**: 1 段が 100 ファイルを超える。既存のテストを直す PR（スキルの定義を直す PR に多い）と衝突する。置き換えは道具の定義を消して import を足すだけなので、衝突は「消した行を消したまま、相手の変更を残す」で直せる。段を短く出す。
- **テストが読みにくくなる**: 手元の道具は、そのテストだけを読めば中身が分かる。共通の道具にすると、既定（条件・定義の付け方）を知らないと読めない。違いを引数に書く（3.1 節）ことと、既定を `teamHelpers.ts` の注記に書くことで補う。

## 8. 扱わないもの

- 本体のコードと、テストが確かめる中身。
- `apps/web`・`tools` のテスト（置き場所も読む先も違い、同じ名前の道具の写しは少ない）。
- テストのファイルの名前（`stage8Team.test.ts` など）・長い `describe` の分割・テストの数を減らすこと。
- 定義を作る道具（`definition`・`definitionWith`・`patched`。案 3）と、そのテストだけの作り物（`makeCharacter` を使う `character` など）。

## 9. 作り

### 9.1 段 T1（2026-11-18）

- `__tests__/data.ts` を足した（`readData`・`characterOf`・`rawDefinition`・`DEFINED_IDS`。import は `node:fs` と型だけ）。`teamHelpers.ts` の `characterOf`・`rawDefinition` は、これの再 export にした。`teamHelpers.ts` の `readJson`（`__tests__/` からの相対パスで読む）は、`data/enemies.json` を読む所が段 T3 まで使うので残した。
- 置き換えたもの（使い捨ての脚本で、構文木から書き換えた）: 手元の `readJson`（テストの場所から解く 3 行の形）とその呼び出し、`character` などの 1 行の読み手（`(id) => readJson<CharacterData>(…)`）、`DEFINED`、直に書いた `JSON.parse(readFileSync(new URL(…)))`。置き換えで中身が共通の道具を呼ぶだけになった包み関数は消した。
- 置き換える呼び出しは、書いてある相対パスをテストの場所から解いた先が `packages/core/data/` の下にあり、残りのパスが同じものだけ（読む先が同じことは、置き換えの条件で確かめている）。
- 残したもの: `records/observations/` を読む手元の `readJson`（`kurumiTeam.test.ts`・`ravenTeam.test.ts`）、絶対パスを受ける `readJson`（`skills/__tests__/definitions.test.ts`）、名前も形も違う読み手（`read`・`load` など数か所）。段 T3 の lint の規則を足すときに、残すか寄せるかを決める。
- 5 節から変えた所: `master`・`profile`（`data/enemies.json` の敵のプリセットと的）は段 T3 に回した。使う所の大半が `rangeEnemy` の写しの中で、`rangeEnemy` を寄せると使う所が減るため。
- 手引き（[skills-guide.md](skills-guide.md) の「テスト」）の例を、共通の道具を使う `a2Team.test.ts` に替え、道具の写しを作らないことを 1 行足した。

**確かめた結果**（基の版は main の 8148a615）:

- `npm test` が通り、テストのファイルの数とテストの数が main と同じ。`npm run typecheck`・lint が通る。
- 期待値の行（`expect(`・`it(`・`describe(`・`toBe`・`toEqual` を含む行）の差分は、呼び出しの名前の付け替え（`character(` → `characterOf(` など）だけ。付け替えを戻すと、足した行と引いた行が全部対になる。
- 本体（テストでないファイル）の差分は、`__tests__/data.ts`・`__tests__/teamHelpers.ts` と、文書と課題のファイルだけ。
- テストの時間（`npx vitest run` を main と段の後で交互に 3 回ずつ）: main は 70.9・73.1・77.4 秒、段の後は 71.0・76.2・76.9 秒。回ごとの揺れの中で、増えていない。

### 9.2 段 T2（2026-11-18）

- `teamHelpers.ts` の `fixedSlot` を `fixedSlot(id, options?)` にした。`options`（`FixedSlotOptions`）は `condition`・`conditionMode`・`hp`・`defence`・`treasurePhase`・`definition`（差し替える定義の JSON。`null` は定義を付けない）・`parsed`（読み込み済みの定義）・`edit`（読み込む前の JSON を書き換える）・`extra`（ほかの欄の上書き）。既定は前と同じ（条件は `{ coreHitRate: 1, distanceBonus: false }`、定義のあるキャラにだけ定義を付ける）。
- 3.2 節から変えた所: `always`（定義の無いキャラでも定義を読む）は足さなかった。「いつも付ける」写しは、渡すキャラがどれも定義のあるキャラで、既定と同じ枠になる（下の入力の比べで確かめた）。読み込み済みの定義を受ける写しがあったので `parsed` を、定義を付けない写しがあったので `definition: null` を足した。`edit` が受ける JSON の型は、`__tests__/data.ts` の `RawDefinition` にした。
- 置き換えたもの（使い捨ての脚本）: 手元の `fixedSlot`・`slotOf` の写し 77 個を消し、呼び出しを共通の `fixedSlot` に書き換えた。そのテストの枠が既定と違う所（最大 HP を付ける・条件が違うなど）は、ファイルの頭の定数 `SLOT_OPTIONS` に書き、呼び出しに渡す。前の形（2 つ目の引数が定義の JSON）で呼んでいた 12 か所は `{ definition }` にした。使わなくなった import と手元の定数・関数は消した。
- 残したもの: 主役のキャラにだけ宝物の段階を付ける `slotOf`（4 ファイル。中は共通の `fixedSlot` の 1 回の呼び出しにした）、キャラのデータを受ける・別の型（1 パス目の枠）を返す `slotOf`（4 ファイル）。ほかに、`solo`・`slot` などの名前でキャラのデータから枠を組む関数や、テストの中に直に書いた枠が約 20 ファイルに残る（番号でなくデータを受けるので、同じ形では寄せられない）。
- 見直し（`/code-review medium`）で直した所: 共通の `fixedSlot` に、黙って落ちる組み合わせの守りを足した（知らない欄 = 定義の JSON をそのまま 2 つ目の引数に渡した呼び出しを落とす・`parsed` と `definition`・`edit` の組を落とす・`edit` には渡された JSON の写しを渡す）。その動きのテスト（`__tests__/teamHelpers.test.ts`）を足した。前からあった `{ ...fixedSlot(id), conditionMode: 'auto' }` の形は、`fixedSlot(id, { conditionMode: 'auto' })` にした。同じ形の手元の型 `RawDefinition`（5 ファイル）は `data.ts` の型に寄せた。見送った指摘: 同じ options のリテラルの繰り返しをファイルの頭の定数にまとめること・既定と同じ定義を `parsed` で渡している 2 か所。

**確かめた結果**（基の版は main の d810b1e4）:

- `npm test` が通る。テストは、足した `teamHelpers.test.ts` の分だけ増え、ほかは main と同じ。`npm run typecheck`・lint が通る。
- **エンジンに渡る入力が同じ**: 計算の入口（`applyTreasureToTeam`。`runSimulation`・`planTeamRun`・`simTeamResult` が通る）に、入力の要約（鍵を並べ直した JSON の hash。`treasurePhase: 0` は無いのと同じに数える）をテストのファイルごとに書き出す行を一時的に入れ、全部のテストを main と段の後で回して比べた。要約の列が一致した（2,704 件。`records/__tests__/observations.test.ts` の分は、残差の覚えが効いて 2 回目は回らないので比べから外した。このテストは変えていない）。一時の行はコミットしていない。
- 期待値の行の差分は、枠の呼び出しの書き換え 3 か所だけ。
- 本体（テストでないファイル）の差分は、`__tests__/data.ts`・`__tests__/teamHelpers.ts` と、文書だけ。

## 10. 経過

- 2026-11-18: 起案。
- 2026-11-18: オーナーが、論点をすべて推奨の案で承認した。
- 2026-11-18: 段 T1 を実装した（9.1 節）。`master`・`profile` は段 T3 に回した。
- 2026-11-18: 段 T2 を実装した（9.2 節）。
