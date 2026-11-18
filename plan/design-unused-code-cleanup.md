# 設計書: 使われていないコードを消し、型だけの import 文と値の写しを直す

- 何のための文書か: どこからも読まれない宣言と再公開を消し、型の名前だけを並べた import 文を `import type` に直し、循環を避けるために写していた定数を 1 つにする変更の、今の状態・案・論点・段・確かめ方
- 対象: `packages/core/src`・`apps/web/src`・`tools` の、読まれない宣言（3.1 節の表）と再公開、`eslint.config.js` の規則 1 つと、それで直る import 文、`skills/chance.ts` と `skills/timeline.ts` の桁の定数。計算の中身と結果は変えない
- 状態: 承認待ち（4 節）
- 関連: [design-import-cycle.md](design-import-cycle.md) 2.4 節・8 節（型の名前だけを並べた import 文を扱わないとした）、[design-workflow-simplification-17.md](design-workflow-simplification-17.md) 10 節（コードを測る道具 `npm run code:survey`）
- 作成日: 2026-11-18
- 調べた時点: main の f7d095d2

## 1. 背景と目的

- `npm run code:survey -- --only unused` で測ると、どこからも読まれず、ファイルの中でも使わない export が 22 個ある（2.1 節）。使っていた所が無くなった後に残ったもので、読む人には「どこかで使っている」ように見える。
- 型の名前だけを並べた import 文（`import { type A, type B } from …`）が 43 個ある。この形は実行時に中身が空の import として残り、読み込みが起きる（[design-import-cycle.md](design-import-cycle.md) 2.4 節）。循環を見る検査はこの文も辺に数えるので、型だけの参照で循環ができると検査が落ちる。
- `skills/chance.ts` の `CHANCE_VALUE_DIGITS` は、`skills/timeline.ts` の `KEY_DIGITS` の写しで、同じ値であることをテストで突き合わせている。写した理由（循環する import を避ける）は、いまは当たらない（2.3 節）。
- 目的は、**使っていないものを消して、読む量と「使っているように見える」ものを減らすこと**と、**型だけの参照を実行時の読み込みから外すこと**。どれも小さく、計算の結果は変えない。

## 2. 今の状態

### 2.1 読まれない宣言

`npm run code:survey -- --only unused` の「どこからも・ファイルの中でも使わない」22 個。コードと文書（`plan/`・`README.md`・`AGENTS.md`）を名前で探して確かめた。

<!-- prettier-ignore -->
| 宣言 | 場所 | 中身 | 扱い |
| --- | --- | --- | --- |
| `formatNumber`（と、これだけが使う `formatters`） | `apps/web/src/format.ts` | 数の書式 | 消す |
| `NO_BUILD_EFFECTS` | `buildEffects.ts` | 空の効果の定数（`skills/timeline.ts` は同じ名前の別の定数を自分で持つ） | 消す |
| `extractGeneratedSection` | `records/recordings.ts` | 台帳の生成の節を取り出す | 消す |
| `SUSTAINED_DAMAGE_PLACEMENTS` | `skills/burstDamage.ts` | 型 `SustainedDamagePlacement` の値の一覧（型は使っている） | 消す |
| `isWhileEffect` | `skills/resolve.ts` | while の効果かどうか | 消す |
| `trackTriggerFrames` | `skills/triggers.ts` | `trackTriggerFires` の結果からフレームだけを取る | 消す |
| `resolveTeamBuffs`（と、これだけが使う型 `SlotBuffs`） | `team.ts` | 常時のパッシブを配った合計 | 消す |
| `AR_SEGMENTS` | `tools/captures/recipes/ar-cores.ts` | 区間の名前の一覧 | 消す |
| 型 `Accumulate`・`FrameEventsLayer`・`Instants`・`Shooters`・`Summons` | `frame/firstPass/` の 5 ファイル | `ReturnType<typeof create…>` の別名 | 消す |
| 型 `Register` | `skills/holders/register.ts` | 同上 | 消す |
| 型 `ObservationUse` | `records/observations/types.ts` | `OBSERVATION_USES` の要素の型 | 消す |
| `ENEMY_CONTENT_LABEL`・`ENEMY_EVENT_KIND_LABEL` | `enemies.ts` | コンテンツと敵の出来事の、画面の名前の表 | 論点 1 |
| `counterName`・`summonName` | `skills/counters.ts`・`skills/summons.ts` | カウンタ・召喚の画面の名前を引く | 論点 1 |
| `VERSION` | `index.ts` | `'0.0.0'` | 論点 1 |
| `WEAPON_CHANGE_RESTORE`・`WEAPON_CHANGE_CORE` | `frame/shooter.ts`・`skills/resolve.ts` | 決めたモデルの名前（値は 1 つ） | 残す |

- `WEAPON_CHANGE_RESTORE`・`WEAPON_CHANGE_CORE` は残す。結論と検証の文書（[claims.md](claims.md)・[verification.md](verification.md)・[design-stage11-modernia.md](design-stage11-modernia.md) ほか）が、決めたモデルをこの名前で指している。
- 消す宣言を指している文書は、設計書（記録）だけ（`trackTriggerFrames` は [design-stage11.md](design-stage11.md)、`resolveTeamBuffs` は [design-stage5.md](design-stage5.md)・[design-stage6.md](design-stage6.md)）。記録は書いた時点の版を指すので、直さない。

### 2.2 読む所の無い再公開

名前つきの再公開のうち、その再公開を通って読む所が無いものが 10 個ある（`code:survey` は出さないので、import を辿って数えた）。

<!-- prettier-ignore -->
| ファイル | 再公開している名前 |
| --- | --- |
| `skills/holders.ts` | `isEnemyEffect`・型 `HeldStage`・`AmplifierSource`・`AmplifiedPiece`・`HpRatioSteps`・`RemoveDebuffGuess`・`HeldItemFilter` |
| `frame/plan.ts` | `DOT_LATER_TICK_DELAY_SECONDS`・型 `DotTick`・`DotTickTracker` |

- 元の宣言（`skills/holders/` の下・`frame/dot.ts`）は使われている。読む側は、元のファイルから直に読んでいる。

### 2.3 型の名前だけを並べた import 文

- `@typescript-eslint/no-import-type-side-effects` を当てると 43 個（27 ファイル。`packages/core/src` に 30、テストに 12、`tools` に 1）。
- lint の `consistent-type-imports`（`fixStyle: 'inline-type-imports'`）は、値と型が混ざった文を `import { a, type B }` の形に直す。値の名前を後で消すと、型の名前だけの文が残る。
- 試しに自動修正を当てた（確かめた後に戻した）: 27 ファイル・52 行が `import type { … }` に変わり、lint・書式・型の検査が通った。実行時に残る import の辺は 3,302 本から 3,260 本に減る。循環は、どちらも 0 組。
- 型の名前だけを並べた再公開（`export { type A } from …`）は無い。

### 2.4 桁の定数の写し

- `skills/timeline.ts` の `KEY_DIGITS`（区間の鍵に入れる値の桁）と、`skills/chance.ts` の `CHANCE_VALUE_DIGITS`（確率の窓の小片の値を丸める桁）は、どちらも 6。`chance.ts` の注記は「循環 import を避けて写す。テストで突き合わせる」。
- いまは、`chance.ts` は何も読み込まず、`timeline.ts` から `chance.ts` へ辿る道も無い。どちらがどちらを読んでも循環にならない。

### 2.5 export が要らない宣言

- どこからも読まれないが、ファイルの中では使っている export が 417 個ある（`packages/core/src` に 201、`tools` に 177、`apps/web/src` に 24、`packages/core/scripts` に 13、`apps/web/scripts` に 2）。`export` を外せば足りる。
- `export` が付いている間は、ファイルの中で使わなくなっても lint（`no-unused-vars`）が気づかない。2.1 節の宣言が残ったのは、このため。
- テストだけが読む export は 302 個ある。テストのための公開と、比べ用に残した実装（`burst/dynamic.ts` の `planDynamicSchedule` など。注記に「本番の計算は呼ばない」とある）なので、この設計では扱わない。

## 3. 案

### 3.1 読まれない宣言と再公開

- 2.1 節の「消す」の宣言と、2.2 節の再公開を消す。消した後に使わなくなった import と、その宣言だけが使っていたもの（`formatters`・`SlotBuffs`）も消す（lint と型の検査が出すものに従う）。
- 論点 1 の 5 つ（画面の名前の表と関数・`VERSION`）は、判断に従う。

### 3.2 型の名前だけを並べた import 文

- `eslint.config.js` の `.ts`・`.tsx` の規則に `'@typescript-eslint/no-import-type-side-effects': 'error'` を足し、自動修正（`eslint --fix`）で 43 個を直す。依存は増えない（導入済みの typescript-eslint にある規則）。
- 足した後は、型の名前だけの文を書くと lint が落ち、自動修正で直る。`consistent-type-imports` とは一緒に使える（値と型が混ざった文は今のまま）。
- 課題 `records/backlog/import-type-side-effects.json` を閉じる。

### 3.3 桁の定数

- `timeline.ts` が `chance.ts` の定数を読む: `export const KEY_DIGITS = CHANCE_VALUE_DIGITS;`。`chance.ts` は何も読み込まないままにする。`chance.ts` の注記から「写す」「テストで突き合わせる」を消し、突き合わせの 1 行（`skills/__tests__/chance.test.ts` の `expect(CHANCE_VALUE_DIGITS).toBe(KEY_DIGITS)`）を消す。
- 逆向き（`chance.ts` が `timeline.ts` の `KEY_DIGITS` を読む）は採らない。何も読み込まない `chance.ts` が、多くを読み込む `timeline.ts` に寄りかかる形になる。

### 3.4 export が要らない宣言と、再発の検査

<!-- prettier-ignore -->
| 論点 | 案 | 得失 |
| --- | --- | --- |
| 417 個の `export` を外すか | a: この変更では外さない | 差分が小さい。使わなくなった宣言に lint が気づかないのは今のまま |
| | b: 外す | 使わなくなった宣言に lint が気づく。126 ファイルに 1 語ずつの差分が出て、並行する PR と衝突しやすい。関数の引数や戻り値の型まで export を外すので、読む側が型を名前で使いたくなったら付け直す |
| 再発の検査 | a: 置かない（`npm run code:survey -- --only unused` で時々見る） | 手間が無い。段を分けた作業（先の段で export を足し、後の段で使う）を止めない |
| | b: テストで「どこからも・ファイルの中でも使わない export が無い」ことを見る（残すものは一覧に書く） | 残らない。使う前の export を足した PR が落ちる |

## 4. 論点（オーナーの判断）

<!-- prettier-ignore -->
| # | 論点 | 案 | 推奨 |
| --- | --- | --- | --- |
| 1 | 先で使うかもしれないもの（`ENEMY_CONTENT_LABEL`・`ENEMY_EVENT_KIND_LABEL`・`counterName`・`summonName`）と `VERSION` を消すか | 案 a（5 つとも消す）・案 b（名前の表と関数の 4 つは消し、`VERSION` は残す）・案 c（5 つとも残す） | **推奨: 案 b**。名前の表と関数は、使う画面ができた時に足せる（git の履歴にも残る）。`VERSION` はパッケージの入口の決まった名前で、1 行 |
| 2 | export が要らない宣言 417 個の `export` を外すか | 案 a（外さない）・案 b（外す） | **推奨: 案 a**。効果（lint が気づく）に比べて、差分と衝突が大きい |
| 3 | 読まれない export が戻らないようにする検査 | 案 a（置かない。道具で時々見る）・案 b（テストで見る） | **推奨: 案 a**。たまる速さは遅く（いま 22 個）、測る道具がある。テストにすると、段を分けた作業を止める |

## 5. 段

1 つの PR で行う。

1. 2.1 節の宣言と 2.2 節の再公開を消す（論点 1 の判断に従う）。
2. lint の規則を足し、自動修正で import 文を直す。課題を閉じる。
3. 桁の定数を 1 つにする。

## 6. 確かめ方

- `npm run typecheck`・`npm run lint`・`npm test`・`npm run build` が通る。
- `npm run code:survey -- --only unused`: 「どこからも・ファイルの中でも使わない」が、残すと決めたものだけになる。
- `@nikke/core` の公開面: `packages/core/src/index.ts` が出す名前の一覧が、main から消した名前の分だけ減り、ほかは同じ。
- 循環の検査が通る（0 組）。辺の数が 2.3 節の見込みどおりに減る。
- 読み込みの結果・解決の結果・`runSimulation` の結果の JSON が、main と文字列で一致する。
- 差分: lint の自動修正で変わったファイルは、import 文だけが変わっている。

## 7. リスク

- **消した名前を、並行する PR が使い始める**: マージの後の main で型の検査が落ちる。出す前に、開いている PR とブランチを見る。直しは、その宣言を戻すだけ。
- **lint の規則が、並行する PR を止める**: 型の名前だけの import 文を書いた PR は、次の `npm run pr:prep` の lint で落ちる。自動修正で直る。
- **`import type` にして動きが変わる**: 型だけの文の読み込みが起きなくなるので、その読み込みの副作用（モジュールの最上位の処理）に頼っている所があれば、動きが変わる。直す 27 ファイルの import の先は、どれもほかの文か、ほかのファイルから値で読まれているかを確かめる。6 節の JSON の突き合わせでも見る。
- **見直しの重さ**: `packages/core/src/frame/` のファイルに触る（型の別名と再公開を消す・import 文を直す）ので、バグの見直しは `high` で行う。

## 8. 扱わないもの

- テストだけが読む export（2.5 節）。
- 持ち越しの候補（`styles.css` の整理・`catalogDoc.ts`・`sim-run.ts`・解決の決まり文句）と、引数の多い関数、録画の解析レシピの重なり。

## 9. 経過

- 2026-11-18: 起案。
