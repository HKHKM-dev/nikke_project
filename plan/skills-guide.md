# キャラのスキルを定義する手順

- キャラ 1 体のスキルを `packages/core/data/skills/{resourceId}.json` に定義し、撮影で確かめるまでの手順。2026-09-28 にオーナーが決めた方針（0 節）でまとめた。
- Stage 11 の手順（[design-stage11.md](design-stage11.md) 1・8 節）を、Stage 20 の記録の構造（検証記録・観測値・結論）に合わせて書き直したもの。以後はこちらに従う。
- DSL の語彙と検証の規則は `packages/core/src/skills/types.ts`、原則は [design-stage4.md](design-stage4.md) 2 節。
- **検証の共通の流れ（起案・撮影計画・撮る・読む・比べる・結論・閉じる）と、確定にできる条件は [verification-guide.md](verification-guide.md)**。ここに残すのは、スキル定義に固有の手順（0・1.1・1.2・1.4・1.5・3・4 節）。2026-10-11 に 1.3・1.6〜1.9・2 節を移した（見出しは、閉じた記録が節の番号で指しているので残す）。

## 0. 方針

- **撮影で確かめるキャラだけ定義する**。説明文だけで解釈が一意に決まる効果（等級のデータ明記）でも、撮影で確かめる。語彙の実装が正しいかは撮影でしか分からないため。
- **1 体 1 PR**。語彙の追加・定義・予測・撮影の結果・結論を 1 本の PR にまとめる。
- **足す語彙はそのキャラに要るものだけ**。ただし、同じ言い回しの他のキャラにもそのまま使える形にする（対象を武器種で絞れる、別のトリガーでも使える、など）。
- **根拠は効果ごとに結論の ID で持つ**。定義のどの効果も、`claims` の欄で結論を指す（3 節）。
- **完了条件**
  - そのキャラの撮影と、定義の予測が合う。
  - そのキャラを含む実戦的な編成で、sim と calc が整合する。
- **既存の定義（Stage 11 までの 15 体）** には、凍結の記録（`plan/verification.md`）から結論を写さない。結論を作るのは、最小構成の録画の読み直し（2 節）か、新しい撮影のときだけ（2026-10-05 の決定。[design-skill-claims-5-2.md](design-skill-claims-5-2.md) 3 節）。機構の結論（stat の効き方）は、根拠の録画にそのキャラの効果が出ていなければ結び付けない。

## 1. 手順

### 1.1 選ぶ

- 所持・育成の状況は `D:\nikke_project\private\owner.md`（worktree には無い）で見る。
- 単騎か最小構成で撮れるかを見る。確かめたい効果のほかに、未確定の要素（定義の無い味方のバフ・被弾・確率発動）が混ざらない編成を組めるか。

### 1.2 説明文を分解する

- `packages/core/data/characters/{resourceId}.json` の `skills.{skill1|skill2|burst}` を読む。説明文の 1 行ずつを、次のどれかに分ける。notes は種類 `kind` を付けて書く（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.1 節）。1 行の notes に種類の違う中身を混ぜない。
  - **語彙にある**: そのまま定義に書ける
  - **語彙を足す**: 足す語彙の案を書く
  - **ダメージに関係しない**（`noDamage`）: どの編成・敵でも与ダメージを変えない（防御力▲・最大HP▲・敵の攻撃力▼など）。挑発は、付けたときにゲージを溜めることがある（C-0422・C-0480・C-0506。自分にヘイト：敵全体を挑発のティアの S2 は溜めない C-0505。キャラごとに確かめる）（[design-skill-claims-5-2.md](design-skill-claims-5-2.md) 7.2 節）
  - **前提の外**（`outOfScope`）: モデルの前提（静止単体ボス・被弾なし・味方が倒れない・パーツ／阻止部位／バリアなし。[requirements.md](requirements.md) 5.2 節）では起きない・効かない（被弾トリガー・貫通・阻止部位・バリアなど）
  - **未対応**（`unimplemented`）: 前提の中でダメージに効く（効きうる）のに、今回は定義しないもの。理由（語彙が無い・撮っていない・きっかけが説明文に無い など）を添える。味方の回復は、「回復を受けた時」の効果を持つ味方の発動を変えるので、`heal` で定義しないならここ
  - 扱い方の補足（`modeling`）: 扱っていない効果ではなく、どこから入っているか・近似などの説明
  - 未対応・前提の外の notes には、効いたとしたらどんな効果かを `effect`（`kind`・`stat`・`target`・`trigger`。語彙で書けない欄は `"unknown"`。被弾のきっかけは `damaged`。計算の語彙に無い敵の防御力▼は stat `enemyDefenseDown`・対象 `enemy`、最大HP▲は stat `maxHp`）で書く。補足は、指す効果を `refers`（`"effects[0]"` など）で書き、指す効果が無ければ `effect` を書く。計算は読まず、最小構成の検査が使う（[design-minimal-relevance.md](design-minimal-relevance.md) 3.3 節）
- 語彙に無い効果の見込みは [design-stage16.md](design-stage16.md) 10.0.2 節（乱数を起点にする効果）と [requirements.md](requirements.md)（スコープ外）にもある。

### 1.3 検証記録を起こす

- → [verification-guide.md](verification-guide.md) 1・3 節。スキルの検証では、話題を `スキル・キャラ固有` にし、問いを「<キャラ> のスキルを <解釈> と読んで、モデルは実測と合うか」にする（解釈が割れる行ごとに仮説を分ける）。

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
  - スロットの対応状況（`support`）は書かない。効果の有無と、未対応（`unimplemented`）の notes の有無から読み込みで決まる（`supported`・`partial`・`unsupported`・`noEffect`。[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）。効果の無いスロットには、理由の notes が要る。
  - いつも満たすとみなした条件は、効果の `assumes` に書く。
  - 名前の付いた状態（「〈名前〉」：機能…・〜状態なら・〜状態の味方・〜が適用された時）は、状態の付与（`kind: 'state'`）と中身（`contents`）で書き、名前は目録（`skills/states.ts`）の id で指す。目録に無い状態は id を足す（英語版の説明文の状態名の lowerCamelCase。[design-named-state.md](design-named-state.md) 5 節）。
  - 根拠の結論の ID は、効果と notes の `claims` に書く（3 節）。結論を作ったとき（[verification-guide.md](verification-guide.md) 8 節）に書き足す。解釈の結論を先に `仮説`・等級 `推論` で作って ID を書いてもよい。
  - `checkedAt` は説明文を読んだ日。
- **テスト**
  - DSL の単体テストは `skills/__tests__/<名前>.test.ts`。定義の検証エラーと、Lv ごとの解決値を見る。
  - 編成のテストは `__tests__/<名前>Team.test.ts`。そのキャラを含む実戦的な編成で、sim と calc が整合することを見る（`describe.each`。例は `stage11ScarletBsTeam.test.ts`）。
  - **テストに実測値を直書きしない**。実測との比較は観測値と照合ランナーで行う（[verification-guide.md](verification-guide.md) 6・7 節）。
- **キャラ固有の分岐をコアに置かない**。実測でしか決まらない値（紅蓮BS の射撃の較正の `MEASURED_CHARGE_CADENCE` など）は、表の 1 行にして結論の ID を添える。

### 1.6 撮影計画を立てる（予測は任意）

- → [verification-guide.md](verification-guide.md) 4 節。

### 1.7 撮って読む

- → [verification-guide.md](verification-guide.md) 5・6 節。

### 1.8 比べて結論を出す

- → [verification-guide.md](verification-guide.md) 7・8 節（確定にできる条件は 2.2 節）。スキルの効果が合わなかったときは、根拠のある別の解釈で定義を直すか、未解明のまま効果を定義から外す・スロットを `partial` にして notes に書く。

### 1.9 PR を出す

- → [verification-guide.md](verification-guide.md) 9 節。題名は `スキル: <キャラ名>（V-NNNN、C-NNNN）`（`records:close` が案を出す）。

## 2. 撮影が先に済んでいるとき

- → [verification-guide.md](verification-guide.md) 2 節（読み直しも確定にできる）。既存の録画で確かめられるときは、1.5 の実装 → 既に読んだ観測値か読み直した観測値と比べ、合わない点だけを追加で撮る（紅蓮BS の例は [design-stage11-scarlet-bs.md](design-stage11-scarlet-bs.md) 1 節）。

## 3. 結論の書き方

- 結論は `records/claims/C-NNNN.json`。話題は `スキル・キャラ固有` にする。
- 1 件に書く解釈は 1 つ（例: 「クラウンの S2 の回復は、HP が満タンでも適用されたことになる」）。1 件で同じスロットの複数の効果を指してよい。
- **効果との対応は定義の側に書く**（2026-09-28 に決めた）。効果と notes の `claims` に、根拠の結論の ID を並べる（例: `"claims": ["C-0413", "C-0461"]`）。
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
- [ ] 効果の `assumes` と、notes の種類（`kind`）が実態と合っている（[skills.md](skills.md) の対応状況が意図どおり）
- [ ] 定義のどの効果にも `claims` がある（[skills.md](skills.md) のそのキャラに「根拠なし」の効果が残っていない）
- [ ] 反復実測の結論に `decidedOn`（仮説・値・読み方を決めるのに使った録画。無ければ `[]`）が書いてある
- [ ] `npm run records:close -- V-NNNN --mark` が通っている（結論の根拠・等級の候補・反復実測の `decidedOn`・本文の節・確定の結論の根拠の観測値の `scope`）。この記録の観測値の組に最小構成の警告があると誤りになる（効かない理由を結論の `minimal` に印として書くか、仮説にする。[design-minimal-relevance.md](design-minimal-relevance.md) 11.3 節）
- [ ] 既存のテストの数値が変わっていない（変わったなら、その理由と根拠の ID を PR に書く）
- [ ] 実戦的な編成で sim と calc が整合するテストがある
- [ ] `npm run records:check` と `npm run records:table` の生成物がコミットされている。スキル定義・録画の台帳・観測値の比べる指定を変えたなら `npm run records:minimal` も回した
- [ ] CI と同じ確認が通る（`npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`）
