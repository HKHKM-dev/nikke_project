# キャラのスキルを定義する手順

- キャラ 1 体のスキルを `packages/core/data/skills/{resourceId}.json` に定義し、撮影で確かめるまでの手順。2026-09-28 にオーナーが決めた方針（0 節）でまとめた。
- Stage 11 の手順（[design-stage11.md](design-stage11.md) 1・8 節）を、Stage 20 の記録の構造（検証記録・観測値・結論）に合わせて書き直したもの。以後はこちらに従う。
- DSL の語彙と検証の規則は `packages/core/src/skills/types.ts`、原則は [design-stage4.md](design-stage4.md) 2 節。

## 0. 方針

- **撮影で確かめるキャラだけ定義する**。説明文だけで解釈が一意に決まる効果（等級のデータ明記）でも、撮影で確かめる。語彙の実装が正しいかは撮影でしか分からないため。
- **1 体 1 PR**。語彙の追加・定義・予測・撮影の結果・結論を 1 本の PR にまとめる。
- **足す語彙はそのキャラに要るものだけ**。ただし、同じ言い回しの他のキャラにもそのまま使える形にする（対象を武器種で絞れる、別のトリガーでも使える、など）。
- **根拠は効果ごとに結論の ID で持つ**。定義のどの効果も、`claims` の欄で結論を指す（3 節）。
- **完了条件**
  - そのキャラの撮影と、定義の予測が合う。
  - そのキャラを含む実戦的な編成で、sim と calc が整合する。
- **既存の定義（Stage 11 までの 15 体）** には、さかのぼって結論を作らない。そのキャラの定義を次に触るときに作る。

## 1. 手順

### 1.1 選ぶ

- 所持・育成の状況は `D:\nikke_project\private\owner.md`（worktree には無い）で見る。
- 単騎か最小構成で撮れるかを見る。確かめたい効果のほかに、未確定の要素（定義の無い味方のバフ・被弾・確率発動）が混ざらない編成を組めるか。

### 1.2 説明文を分解する

- `packages/core/data/characters/{resourceId}.json` の `skills.{skill1|skill2|burst}` を読む。説明文の 1 行ずつを、次の 4 つに分ける。
  - **語彙にある**: そのまま定義に書ける
  - **語彙を足す**: 足す語彙の案を書く
  - **ダメージに関係しない**: notes に書く（防御力▲・挑発など）
  - **未対応**: notes に書く。語彙に無く、今回は足さないもの（被弾トリガー・敵デバフ・確率発動など）
- 語彙に無い効果の見込みは [design-stage16.md](design-stage16.md) 10.0.2 節（乱数を起点にする効果）と [requirements.md](requirements.md)（スコープ外）にもある。

### 1.3 検証記録を起こす

- `npm run records:new -- verification --title "<題名>" --name <短い名前> --topic "スキル・キャラ固有" --question "<問い>"` で、次の空き番号の `records/verifications/V-NNNN-<短い名前>.md` を状態 `調査中` で作る（[design-records-automation.md](design-records-automation.md) 3.1 節）。書式は [records/verifications/README.md](../records/verifications/README.md)。
- 問いは「<キャラ> のスキルを <解釈> と読んで、モデルは実測と合うか」。解釈が割れる行ごとに仮説を分ける。
- 「予測」は 1.6 で埋める。「次に撮るもの」には撮影計画を書く（編成・操作枠・的・モード・スペック固定、どの仮説を見分けるか）。

### 1.4 設計書（語彙を足すときだけ）

- `plan/design-<短い名前>.md` を起案する。書くのは、足す語彙・既存の語彙との関係・退化の見込み・リスク。
- オーナーの承認は対話で得てから実装する（設計書だけの PR は出さない）。
- 大きさは 50KB を目安にする。実測値は書かず、検証記録と観測値を ID で指す。
- 語彙が足りているなら設計書は作らず、検証記録だけで進める。

### 1.5 実装する

- **語彙を足すとき**。sim → calc の順で、1 段ごとに `npm test` を通す。
  1. `skills/types.ts` の型と `parseSkillDefinition` の検証、その単体テスト。
  2. 解決（`skills/resolve.ts` ほか）と、共通のフレームループ（`frame/`）。
  3. **既存のテストが数値を変えずに通る**ことを確かめる（退化）。
  4. calc（`calc/model.ts`）。
  5. 画面のラベル（`apps/web/src/components/SkillSection.tsx` など）と、CLI の表示（`packages/core/scripts/sim-run.ts`）。
- **定義を書く**
  - `data/skills/{resourceId}.json` と `index.json`。
  - 数値は書かず、`ref` で説明文の値を指す。
  - スロットごとに `support` を付ける。`unsupported` のときは `effects: []` と notes が要る。
  - いつも満たすとみなした条件は、効果の `assumes` に書く。
  - 根拠の結論の ID は、効果と notes の `claims` に書く（3 節）。結論を作るのは 1.6 なので、そのときに書き足す。
  - `checkedAt` は説明文を読んだ日。
- **テスト**
  - DSL の単体テストは `skills/__tests__/<名前>.test.ts`。定義の検証エラーと、Lv ごとの解決値を見る。
  - 編成のテストは `__tests__/<名前>Team.test.ts`。そのキャラを含む実戦的な編成で、sim と calc が整合することを見る（`describe.each`。例は `stage11ScarletBsTeam.test.ts`）。
  - **テストに実測値を直書きしない**。実測との比較は観測値と照合ランナーで行う（1.8）。
- **キャラ固有の分岐をコアに置かない**。実測でしか決まらない値（紅蓮BS の射撃の較正の `MEASURED_CHARGE_CADENCE` など）は、表の 1 行にして結論の ID を添える。

### 1.6 予測を出す

- 予測ファイル `records/predictions/V-NNNN.json` に、撮影と同じ編成・仮説（`setup` の上書き）・比べる指標を書き、`npm run records:predict -- V-NNNN` で仮説 × 指標の値を書き込む（書式は [records/predictions/README.md](../records/predictions/README.md)。設計書 3.2 節）。細かく見たいときは `npm run sim -- --ids <編成> --fixed-spec --controlled <操作枠> ...`（オプションは `sim-run.ts` の冒頭）。
- **撮る前に**、予測ファイルをブランチに commit し（PR は出さない）、検証記録の「予測」に仮説ごとの見え方・見分け方・合わなかったときに効く大きさを書く（数値は予測ファイルを指す）。定義の解釈をコードで切り替える仮説は、予測ファイルの範囲外なので検証記録に手で書く。探索の撮影なら「予測」に「探索」と書く（予測ファイルは無くてよい）。
- 解釈の結論を、`仮説`・等級 `推論` で作り（`npm run records:new -- claim --from V-NNNN --text "<解釈>"`。観測値が無いので仮説・推論になる）、定義の効果の `claims` に ID を書く（3 節）。

### 1.7 撮って読む

- 撮影プロトコルは [captures/index.md](captures/index.md)「撮影プロトコル」、読み取りの落とし穴は [captures/guide.md](captures/guide.md)。
- 撮り終えたら、すぐに取り込む: `node tools/captures/intake.ts <元ファイル> --id NNN --name <識別子> --rid ... --controlled ... --target BigArms --element Fire --mode range-3min --fixed-spec on|off ...`（リネーム・移動・素性・`records/recordings/<録画 id>.json`）。空いた項目を埋めて `npm run records:table`。
- 読み取りはレシピで: `npm run records:read -- <録画 id> --recipe <名前> --source V-NNNN --write`（`--list` でレシピと `--opt` の一覧。`hud-jumps`・`sg-pellets`・`reload-segments`。[captures/index.md](captures/index.md)「解析ツール」）。観測値が `records/observations/<録画 id>.json` に足され、`source` に検証記録の ID、`method.tool` にレシピ名と版が入る。
- レシピに無い値は、ほかの解析ツールか目で読み、同じファイルに手で書く（`method.note` に読み方）。
  - 比べる指標は照合ランナー（`packages/core/src/records/observations.ts` の `METRICS`）から選ぶ。予測ファイルの指標と `metric`・`args`・`setup` を同じにすると、予測と自動で結び付く（違うときは予測ファイルの `observations` で明示）。
  - 要る指標が無ければ `METRICS` に足す。これも語彙の追加と同じ PR に入れる。繰り返し使う読み方はレシピにする（`tools/captures/recipes/`）。

### 1.8 比べて結論を出す

- `npm run records:check` で残差の一覧（`plan/residuals.md`）を作り直す。予測ファイルがあれば、[verifications.md](verifications.md) の検証記録の項に「予測との比べ」（仮説ごとに許容内の指標の数と、合う仮説）が出、検証記録の「結果」の印の中に表が書き込まれる（設計書 3.5・3.6 節）。
- **合ったとき**: `npm run records:new -- claim --from V-NNNN --text "<結論の文>"` で結論を作る。根拠（この検証記録の観測値）と等級の候補が埋まり、確定にできる条件（等級の候補が厳密一致か反復実測、最小構成の警告なし、失効・許容外なし、予測を撮る前に出している、合う仮説が 1 つ）が全部そろえば `確定`、欠ければ `仮説` と理由が出る。人は理由を確かめて書き換えてよい。`model`（モデル側）を書く。
  - 等級は、合わせ込みの定数なしで端数まで合えば `厳密一致`、値を決めるのに使っていない録画でも再現すれば `反復実測`（機械の候補はこの規則で出る。`データ明記` は人が書く）。
  - `確定` の結論に結び付いた観測値は、以後 `npm test` で自動的に比べられる。
- **合わなかったとき**
  - 根拠のある別の解釈があれば、定義を直して撮り直すか、既存の録画で比べ直す。
  - 古い結論は消さずに `棄却` にし、新しい結論の「置き換え」に古い ID を書く。定義の `claims` の古い ID は新しい ID に差し替える（棄却の結論を指すと `npm run records:check` が落ちる）。
  - 未解明のまま残るなら、その効果を定義から外すか、スロットを `partial` にして notes に書く。根拠の無い合わせ込みはしない。
- 検証記録の「結果」（表の下の散文）「分かったこと・分からないこと」「次に撮るもの」を書き、冒頭の「結論」に ID を足し、`npm run records:close -- V-NNNN --mark` で閉じる前の検査を通して状態を `完了` にする（設計書 3.7 節。CI と同じ確認も回る。急ぐときは `--no-ci`）。
- [roadmap.md](roadmap.md) を更新する（Stage にしたときはその節、そうでなければ今後の課題）。

### 1.9 PR を出す

- 手順は [AGENTS.md](../AGENTS.md)「コミット手順」。
- 題名は `スキル: <キャラ名>（V-NNNN、C-NNNN）`（`records:close` が案を出す）。

## 2. 撮影が先に済んでいるとき

- 既存の録画で確かめられるときは、順番が逆になる。1.5 の実装 → 1.6 の予測 → 既に読んだ観測値と比べる。合わない点だけを追加で撮る（紅蓮BS の例は [design-stage11-scarlet-bs.md](design-stage11-scarlet-bs.md) 1 節）。
- このときも、予測は観測値を見る前に検証記録に書く。

## 3. 結論の書き方

- 結論は `records/claims/C-NNNN.json`。話題は `スキル・キャラ固有` にする。
- 1 件に書く解釈は 1 つ（例: 「クラウンの S2 の回復は、HP が満タンでも適用されたことになる」）。1 件で同じスロットの複数の効果を指してよい。
- **効果との対応は定義の側に書く**（2026-09-28 に決めた）。効果と notes の `claims` に、根拠の結論の ID を並べる（例: `"claims": ["C-0077", "C-0087"]`）。
  - 正は定義の `claims`。効果を並べ替えたり足したりしても、ID は効果と一緒に動くので古くならない。結論の側からは生成物で引く: [claims.md](claims.md) の「定義」の行と、キャラ × スロットの一覧 [skills.md](skills.md)（どちらも `npm run records:check` で作り直す）。
  - 結論の `model` には、定義のファイル（`data/skills/830.json`）と、定義の外の置き場所（コード・定数）を書く。効果の場所（`skill1 の effects[0]`）は書かなくてよい。2026-09-28 より前の結論のように書いたときは、下の検査で突き合わせる。
  - notes にも `claims` を書ける（「ダメージに関係しない」「同じ部隊の味方がいない編成では起きない」などの判断の根拠）。`assumes` は効果の `claims` で指す。
  - 1 つの効果を複数の結論が裏付けてよい（1 tick の値の結論と、tick の時刻の結論など）。
  - notes・assumes の文には、説明に要るとき（値の出どころなど）のほかは ID を書かない。結び付きは `claims` で持つ。
- **検査**（`npm run records:check` と `npm test`。`packages/core/src/records/skills.ts`）
  - `claims` の形（`C-` と 4 桁以上の数字・1 つ以上・重複なし）は、定義の読み込み（`parseSkillDefinition`）で弾く。
  - 指した結論が無い・`棄却` なら落ちる。棄却したら、置き換えた結論の ID に差し替える。
  - `棄却` でない結論の `model` が定義の場所（`skill1 の effects[0]`・`treasureSkills.burst の effects[1]`・`skill1 の notes`・`全スロットの notes`）を書いていれば、その場所が定義にあり、その `claims` がその結論を指していないと落ちる。ファイルだけを書いていれば、そのファイルのどこかの `claims` が指していないと落ちる。
  - `claims` の無い効果は落とさない（Stage 11 までの定義。0 節）。skills.md に「根拠なし」と出る。
  - skills.md は丸ごと生成するファイル。リベースで衝突したら、ほかの生成物と同じく main の版に戻して作り直す（[design-stage20.md](design-stage20.md) 3.6 節）。
- 説明文をそのまま読んだだけの効果（倍率・秒数・トリガー・対象が一意なもの）は、1 件にまとめてよい（例: 「<キャラ> の burst の効果は説明文どおり」）。この場合も撮影で確かめてから `確定` にする（0 節）。

## 4. PR の前の確かめ

- [ ] 説明文の全行が、定義の効果か notes のどちらかに入っている
- [ ] 効果の `assumes` と、スロットの `support` が実態と合っている
- [ ] 定義のどの効果にも `claims` がある（[skills.md](skills.md) のそのキャラに「根拠なし」の効果が残っていない）
- [ ] 検証記録の「予測」が、撮る前（観測値を見る前）に書かれている（予測ファイルの commit が録画より前）
- [ ] `npm run records:close -- V-NNNN --mark` が通っている（結論の根拠・等級の候補・予測の日付・本文の節）
- [ ] 既存のテストの数値が変わっていない（変わったなら、その理由と根拠の ID を PR に書く）
- [ ] 実戦的な編成で sim と calc が整合するテストがある
- [ ] `npm run records:check` と `npm run records:table` の生成物がコミットされている
- [ ] CI と同じ確認が通る（`npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`）
