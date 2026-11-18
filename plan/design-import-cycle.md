# 設計書: skills/types.ts と skills/parse/ の循環する import を解消する

- 何のための文書か: スキル定義の型（`skills/types.ts`）と読み込みの検査（`skills/parse/`）が互いを読み込んでいる循環を解消し、循環が戻らないようにする変更の、今の構造・案と得失・論点・段・確かめ方
- 対象: `packages/core/src/skills/types.ts` の末尾の再公開、入口（`parseSkillDefinition`・`parseSkillIndex`・`parseSkillSupportIndex`）を読む側の import 文、`packages/core/src/index.ts`、循環を見る検査（新しく足す）。読み込みの検査の中身と、型・語彙は変えない
- 状態: 完了（9 節）
- 関連: [design-vocab-dedup.md](design-vocab-dedup.md) 9.2 節（この循環のために、表を読み込みの時に組む形を見送った）、[design-split-skill-holders.md](design-split-skill-holders.md)（`types.ts` を話題ごとのファイルに分けないと決めた）、[skills-guide.md](skills-guide.md) 1.4 節（語彙を足すときの手順）
- 作成日: 2026-11-18
- 調べた時点: main の 325dbd6e

## 1. 背景と目的

- `skills/types.ts` は、末尾の 1 行で読み込みの検査の入口を再び公開している（`export { parseSkillDefinition, parseSkillIndex, parseSkillSupportIndex } from './parse/definition.ts'`）。`skills/parse/` の各モジュールは `types.ts` の値（語彙の一覧と、型まわりの小さな関数）を読むので、2 つは互いを読み込む。
- この形は、読み込みの検査を `types.ts` から `skills/parse/` に分けた変更（#911。2026-11-02）で、読む側の import 文を変えないために残した。
- 循環があるので、`skills/parse/` には「モジュールの最上位（関数の外）で `types.ts` の値を読まない」という決まりがある。決まりは注記 2 か所（`types.ts` の末尾と `parse/effect.ts` の `EFFECT_BODY_PARSERS`）にあるだけで、型の検査も lint もテストも見ていない。
- 決まりを破ると、動かす道具によって違う壊れ方をする（2.3 節で再現した）。node で動かすスクリプトは読み込みの時に落ちる。テスト（vitest）は落ちずに、表が空になる。
- [design-vocab-dedup.md](design-vocab-dedup.md) の段 A では、`skills/buffs.ts` に「読み込みの時に `BUFF_STATS` から組む表」を置く案を、見直しの指摘で見送った（`buffs.ts` がこの循環に入ると読み込みの順で落ちるため）。循環が、書き方を選ぶ理由になっている。
- 目的は、**循環を無くして、読み込みの順に頼る決まりを無くすこと**と、**循環が戻ったら検査で止まるようにすること**。読み込みの検査の結果と計算の結果は変えない。

## 2. 今の構造

### 2.1 循環の形

- 実行時に残る import（2.4 節）で数えると、リポジトリの循環は 1 組だけで、17 ファイルが入る: `skills/types.ts` と、`skills/parse/` の 17 モジュールのうち 16（`parse/common.ts` は `types.ts` を読まないので入らない）。
- `types.ts` が値で読み込む先は `parse/definition.ts` の 1 つだけ（末尾の再公開）。この 1 本を消すと、循環は 0 組になる（辺を消して数え直した）。`skills/parse/` の中のモジュールどうしには循環が無い。
- `skills/parse/` を外から読み込むのは、`types.ts`（入口）と、`parse/common.ts` を読む 4 ファイル（`buildJson.ts`・`buildSnapshot.ts`・`combatTable.ts`・`filterTable.ts`）と、テスト 1 つ（`parse/timed.ts` を読む）。入口へは、どの道具も `types.ts` を通って着く。

### 2.2 何を読み合っているか

<!-- prettier-ignore -->
| 向き | 中身 |
| --- | --- |
| `types.ts` → `parse/definition.ts` | 入口の関数 3 つの再公開（`types.ts` 自身は使わない） |
| `parse/` → `types.ts` | 値 75 種類（定数 33・関数 42）。`types.ts` が出す値は 102 個（定数 43・関数 59）で、型は 119 個 |

- `parse/` のモジュールごとの、`types.ts` から値で読む名前の数: `timed` 31・`crossChecks` 16・`trigger` 13・`damage` 11・`state` 11・`target` 7・`notes` 6・`condition` 5・`instant` 5・`dot` 4・`cycle` 3・`definition` 3・`effect` 3・`gauge` 3・`attack` 2・`weapon` 1。
- いまは、`parse/` のどのモジュールも、最上位では `types.ts` の値を使っていない（全部が関数の中）。だから今の main は正しく動いている。

### 2.3 決まりを破ったときの壊れ方（再現）

`parse/timed.ts` の最上位に、仮の 1 行 `const PROBE_STATS = new Set(BUFF_STATS)` を足して動かした（確かめた後に戻した）。

<!-- prettier-ignore -->
| 動かし方 | 結果 |
| --- | --- |
| node で `skills/types.ts` を先に読み込む | `ReferenceError: Cannot access 'BUFF_STATS' before initialization` で落ちる |
| node で `skills/parse/definition.ts` を先に読み込む | 落ちない |
| vitest で、`types.ts` を読み込むテストから `PROBE_STATS` の大きさを見る | 落ちない。大きさは 0（`BUFF_STATS` は 46 個） |

- `types.ts` を先に読み込むと、`types.ts` の中身より先に `parse/` のモジュールが動く。その時点では `types.ts` の定数はまだ出来ていない。
- 入口へはどの道具も `types.ts` を通って着く（2.1 節）ので、node で動かす道具（`npm run sim`・`npm run records:check` など）は読み込みの時に落ちる。気づきやすい。
- テストは落ちずに、空の表で検査が走る。この再現では、足した 1 行のほかのテスト（`teamHelpers.test.ts` の 8 個）は通った。表の使い方によっては、検査が緩くなったまま通る。
- 画面の束（vite の build）での動きは確かめていない。

### 2.4 実行時に残る import

- このリポジトリは `verbatimModuleSyntax` で、スクリプトは node が型を消して動かす。消えるのは `import type …`・`export type …` の文だけで、`import { type A, type B } from …` のように型の名前だけを並べた文は、中身が空の import として残る（読み込みは起きる）。
- 2.1 節の数は、この決まりで数えた（`import type` の文だけを辺から外す）。型の名前だけを並べた import 文は 43 個あるが、循環には入っていない。
- 型だけの参照まで辺に数えると、循環は 8 組ある（`frame/firstPass/` と `team.ts` の 15 ファイルなど）。実行時には消えるので、読み込みの順には効かない。この設計では扱わない。

### 2.5 入口を読む側

- 入口の名前を `skills/types.ts` から import している文は 176 個: 本体 4 ファイル（`src/load.ts`・`src/records/observations/setup.ts`・`scripts/records-data.ts`・`scripts/sim-run.ts`）と、テスト 172 ファイル。
- そのうち、入口の名前だけの文が 121 個、ほかの名前（型・語彙）と一緒の文が 55 個。
- 画面（`apps/web`）は `@nikke/core`（`packages/core/src/index.ts` の `export * from './skills/types.ts'`）から読む。`types.ts` を直接は読まない。

## 3. 案

### 3.1 守ること

- 読み込みの検査の中身・エラー文・結果を変えない。型と語彙を変えない。
- `@nikke/core` が出す名前を変えない（画面の import は変えない）。
- テストの期待値を変えない。変えるのは import 文だけ。

### 3.2 案

<!-- prettier-ignore -->
| 案 | 中身 | 変える所 | 得失 |
| --- | --- | --- | --- |
| 0 | 変えない。注記の決まりで守る | なし | 手間は無い。決まりを見るものが無く、破るとテストが黙って緩む（2.3 節） |
| 1 | `types.ts` の再公開を消す。入口は `skills/parse/definition.ts` から読む。`index.ts` に入口の再公開を足す | import 文 176 個（機械的に書き換える）・`types.ts` の 1 行・`index.ts` の 1 行・注記 | 循環が無くなる。`types.ts` の中身は動かさない。書き換えるファイルは多いが、1 ファイルに 1〜2 行 |
| 2 | `types.ts` の値（102 個）を別のファイルに移し、`types.ts` は型と再公開だけにする。`parse/` は移した先を読む | `types.ts` の値 102 個とその注記を移す・`parse/` の 16 ファイルの import 文 | 読む側の import 文は変えない。`types.ts` を大きく動かすので、並行する PR と衝突する |

- **案 2 を採らない理由**: `types.ts` は、コードを変える PR の約 3 分の 1 が触る（[design-vocab-dedup.md](design-vocab-dedup.md) 1 節）。値を移すと、その間に出ている PR の多くと衝突する。`types.ts` を話題ごとに分けることは、[design-split-skill-holders.md](design-split-skill-holders.md) で分けないと決めている。
- **案 1 の書き換え**: 入口の名前を `types.ts` の import 文から外し、`…/skills/parse/definition.ts` からの import 文を足す。入口の名前だけの文（121 個）はパスを替えるだけ、ほかの名前と一緒の文（55 個）は 2 つの文に分ける。書き換えは使い捨ての道具（TypeScript の構文木で import 文を直す）で行い、道具はコミットしない。
- **案 1 の後の形**: `types.ts` は値を 1 つも読み込まない（型だけを読む）。`parse/` → `types.ts` の一方向になり、`types.ts` はいつも `parse/` より先に全部出来ている。`parse/` の最上位で `types.ts` の値を使ってよくなる（語彙の一覧から組む表を置ける）。

### 3.3 入口の import 先（案 1 の中の選び方）

<!-- prettier-ignore -->
| 案 | 中身 | 得失 |
| --- | --- | --- |
| a | `skills/parse/definition.ts` を直接読む | ファイルを足さない。`definition.ts` の冒頭の注記は、すでに「読み込みの入口」と書いている |
| b | 再公開だけの薄いファイル `skills/parse.ts` を足し、そこから読む | import 文が短い。入口のファイルの名前を後で変えても、読む側は変わらない。ファイルが 1 つ増え、入口が 2 か所に見える |

### 3.4 循環が戻らないようにする検査

<!-- prettier-ignore -->
| 案 | 中身 | 得失 |
| --- | --- | --- |
| a | テストで、実行時に残る import のグラフに循環が無いことを確かめる（`tools/code/import-cycles.ts` と、そのテスト。`npm test` で回る） | 全部の循環を止める。TypeScript の構文木で読むので依存は増えない。755 ファイルを読んで約 1 秒 |
| b | lint（`no-restricted-imports`）で、`skills/types.ts` が `./parse/` を読むことだけを止める | 設定の数行で済む。ほかの所に出来る循環は見ない |
| c | 置かない | 手間は無い。戻っても気づかない |

- 案 a の検査は、2.4 節の決まり（`import type` の文だけを外す）で辺を数える。対象は `packages/core/src`・`packages/core/scripts`・`apps/web/src`・`apps/web/scripts`・`tools`。循環があれば、入っているファイルを並べて落ちる。
- 案 a の道具は、`pr:prep` や CI の手順には足さない（`npm test` がすでに両方で回る）。`tools/vitest.config.ts` の `include` に `code/**/*.test.ts` を足す。
- `eslint-plugin-import` の `import/no-cycle` は使わない（依存が増える。型だけを並べた import 文の扱いを 2.4 節に合わせられるか分からない）。

## 4. 論点（オーナーの判断）

<!-- prettier-ignore -->
| # | 論点 | 案 | 推奨 |
| --- | --- | --- | --- |
| 1 | 循環を解消するか、どの形にするか | 案 0（変えない）・案 1（再公開を消し、入口を直接読む）・案 2（`types.ts` の値を移す） | **推奨: 案 1**。`types.ts` の中身を動かさずに循環が無くなる。書き換えは機械的で、結果が同じことを確かめやすい |
| 2 | 入口の import 先 | 案 a（`skills/parse/definition.ts` を直接）・案 b（薄い `skills/parse.ts` を足す） | **推奨: 案 a**。ファイルを足さず、入口が 1 か所のままになる |
| 3 | 循環が戻らないようにする検査 | 案 a（全部の循環を見るテスト）・案 b（この 1 本だけを止める lint）・案 c（置かない） | **推奨: 案 a**。この循環のほかに出来る循環も止まる。重さは `npm test` に約 1 秒 |

## 5. 段

1 つの PR で行う（循環を消す変更と、循環を見る検査は、互いの確かめになる）。

1. 循環を見る道具とテストを足す。この時点では、今の循環 1 組（17 ファイル）を見つけて落ちることを確かめる。
2. 入口の import 文を書き換える（176 個）。`index.ts` に入口の再公開を足す。
3. `types.ts` の末尾の再公開を消す。検査が通る（循環 0 組）。
4. 注記を今の形に直す: `types.ts` の冒頭（入口はこのファイルが公開する）と末尾、`parse/definition.ts` の冒頭（`types.ts` が再び公開する）、`parse/effect.ts` の `EFFECT_BODY_PARSERS`（最上位で `types.ts` の値を読まない）。[skills-guide.md](skills-guide.md) 1.4 節の入口の所に、import 先を書く。

## 6. 確かめ方

- `npm run typecheck`・`npm run lint`・`npm test`・`npm run build` が通る。
- 循環の検査: main では 1 組（17 ファイル）、段の後は 0 組。
- 2.3 節の裏返し: `parse/timed.ts` の最上位に仮の表を足し、node でも vitest でも 46 個になることを確かめて戻す。
- 差分: テストと本体 4 ファイルの差分が import 文だけであること（import 文のほかの行に差分が無いことを道具で数える）。
- `@nikke/core` の公開面: `packages/core/src/index.ts` を読み込んで出る名前の一覧が、main と同じ。
- 読み込みの結果（全部の定義）と、`runSimulation` の結果（4 編成）の JSON が、main と文字列で一致する。中身は変えないが、モジュールの読み込みの順が変わるので見る。

## 7. リスク

- **並行する PR との衝突**: 176 ファイルの import 文に触る。書き換えは道具で作り直せるので、PR を出す直前に main に合わせて作り直し、出したらすぐ自動マージを予約する。出す前に、開いている PR とブランチを見る。
- **並行する PR が、入口を `types.ts` から読む新しいテストを足す**: その PR の CI がこの変更のマージより前に通っていると、両方がマージされた後の main で型の検査が落ちる。落ち方ははっきりしていて、直しは import 文の 1 行。マージの後に main の CI を見る。
- **読み込みの順が変わる**: 段の後は、`types.ts` が `parse/` より先に全部出来る（今は逆）。`parse/` の最上位は `types.ts` の値を使っていない（2.2 節）ので、動きは変わらない。6 節の JSON の突き合わせで確かめる。
- **検査が遅くなる・誤って落ちる**: 構文木を読むだけで、型の検査はしない（約 1 秒）。`import()`（動的な読み込み。4 ファイルにある）は辺に数えない。読み込みの時の順に効かないため。

## 8. 扱わないもの

- `types.ts`（約 3,000 行）を分けること（[design-split-skill-holders.md](design-split-skill-holders.md) で分けないと決めた）。
- 型だけの参照の循環 8 組（2.4 節。実行時には無い）。
- 型の名前だけを並べた import 文 43 個を `import type` に直すこと。実行時に空の import として残るが、いまは循環に入っていない。入ったら 3.4 節の検査が落ちるので、その時にその文を `import type` に直す。
- `skills/parse/` の表を、語彙の一覧から読み込みの時に組む形に直すこと（この変更の後に出来るようになるが、ここではしない）。

## 9. 作り（2026-11-18）

論点は 3 つとも推奨の案で承認された（論点 1 は案 1、論点 2 は案 a、論点 3 は案 a）。

- **循環を見る道具**: `tools/code/import-cycles.ts` に、ソース 1 つの実行時に残る import を読む `runtimeImportsOf`、リポジトリのグラフを作る `readImportGraph`（範囲は `REPO_IMPORT_GRAPH`）、循環の組を返す `findImportCycles` を置いた。テストは `tools/code/import-cycles.test.ts`（`tools/vitest.config.ts` の `include` に `code/**/*.test.ts` を足した）。再公開を消す前は、2.1 節の 1 組（17 ファイル）を並べて落ちた。
- **import 文の書き換え**: 176 個（入口の名前だけの文 121 個・ほかの名前と一緒の文 55 個）。一緒の文は 2 つに分け、残りが型の名前だけになった 36 個は `import type` にした。足す文の置き場所は、相対パスの import がパスの順に並んでいるファイル（48）ではその順の所、並んでいないファイル（128）では元の文の所。
- **再公開**: `skills/types.ts` の末尾の再公開を消し、`packages/core/src/index.ts` に入口の 3 つの再公開を足した。`types.ts` は値を 1 つも読み込まない。
- **注記**: `types.ts` の冒頭・`parse/definition.ts` の冒頭・`parse/effect.ts` の `EFFECT_BODY_PARSERS` を今の形に直し、[skills-guide.md](skills-guide.md) 1.4 節に入口のファイルを書いた。

**確かめた結果**（6 節。基の版は main の 23b428e4）:

- `npm test`（409 ファイル）・`npm run typecheck`・変えたファイルの lint・`npm run build` が通る。
- 循環の検査: 基の版は 1 組（17 ファイル）、後は 0 組。
- 2.3 節の裏返し: `parse/timed.ts` の最上位に仮の表を足すと、node で `skills/types.ts`・`skills/parse/definition.ts`・`index.ts` のどれを先に読み込んでも 46 個、vitest でも 46 個になった（確かめた後に戻した）。
- 差分: 書き換えた 176 ファイルで、import 文を除いた本文と、import する名前（型かどうかを含む）が基の版と同じ。
- `@nikke/core` の公開面: `index.ts` が出す名前（682 個）と、その種類（関数・定数）が基の版と同じ。
- 読み込みの結果・編成を通さない解決の結果・`runSimulation`（`trace` あり）の `SimResult` と `TeamResult`（4 編成と、比べる指定のある観測値の入力）の JSON が、基の版と文字列で一致した（3,553 行の要約が全部同じ）。

## 10. 経過

- 2026-11-18: 起案。
- 2026-11-18: 承認。実装した（9 節）。
