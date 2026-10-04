# ラム（822）の S1: 同じ部隊の味方がいるときのバーストスキルクールタイム▼

- 関連: [design-anis-star-s1.md](design-anis-star-s1.md) 2.1 節（部隊構成の条件。この設計で `squad` から `burstStepMix` に改名）、[design-stage10.md](design-stage10.md)（バーストスキルクールタイム▼ `cooldownReduction`）、[backlog.md](backlog.md) 6 節
- 作成日: 2026-10-04
- 根拠: C-0080（同じ部隊の味方がいない編成では起きない）、C-0202（フルバースト終了時の CT▼ の当て方）、CDN の roledata の `squad`
- 状態: オーナーの承認（2026-10-04。5 節の論点 1 は代案の「既存を改名」、論点 2・3 は推奨どおり）で実装した

## 1. 何を足すか

S1（フーラ）の説明文を 1 行ずつ分ける（{NN} は description_value_NN。値は Lv10）。

| 行                                                                                                | 分け                   | 定義                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| 通常攻撃 {01} 回命中で、対象に攻撃力 {02}%▼（{03} 秒）                                            | ダメージに関係しない   | notes（いまのまま）                                                          |
| フルバーストタイムが終了した時、同じ部隊の味方がいれば、自分のバーストスキルクールタイム {04} 秒▼ | **語彙を足す**（条件） | `cooldownReduction`・`fullBurstEnd`・`self` + 同じ部隊の味方の条件（2.1 節） |

- S2（最大HP▲・防御力▲）とバースト（バリア）はダメージに関係しないので、いまの notes のまま。
- これで S1 のダメージに効く効果はすべて定義に入るので、skill1 の `support` を `supported` にする。

**分かっていること**

- 同じ部隊の味方がいない編成（ラム + デルタ + 紅蓮BS）では CT▼ は起きない（C-0080。厳密一致で確定）。
- CDN の roledata には全キャラに `squad`（部隊の ID）と `squad_detail.squad_name`（部隊名）がある。ラムは `CE003`（エミリア陣営）で、同じ部隊はレム（820）・エミリア（821）・ラム（822）の 3 体。
- フルバースト終了時の CT▼ を「同じフレームの発動の後に、残りの CT から引く（0 未満にしない）」ことは、アニス：スターの S1 で実装済み（C-0202）。

**分かっていないこと**

- 同じ部隊の味方がいる編成で、本当に CT が縮むか（レム・エミリアは手元に無く、撮れない）。「同じ部隊」を CDN の `squad` が同じことと読むのは推論なので、新しい結論 C-0235 を `仮説`（推論）で立てる（論点 2）。

## 2. 語彙

### 2.1 編成の条件: `burstStepMix`（改名）と `squad`（新設）

既存の部隊構成の条件（アニス：スター。バースト段階で見る）の欄 `squad` を `burstStepMix`（バースト段階の構成の条件）に改名し、空いた `squad` をゲーム内の部隊の条件に使う（論点 1）。

```json
"burstStepMix": { "otherBurstStep": "Step1", "present": false },
"squad": { "present": true }
```

- `squad` の意味: 自分を除く編成の枠（空枠を除く）に、`CharacterData.squad` が自分と同じキャラが 1 体以上いる（`present: true`）/ 1 体もいない（`false`）ときだけ、その効果を持つ。形は `burstStepMix` にそろえた。
- どちらも書ける効果は `passive`・`timed`・`cooldownReduction`・`burstReentry`（いままでの `squad` と同じ）。両方を持つ効果は、両方を満たすときだけ残す。
- 判定は静的（編成で決まる）。最上位の `applyCompositionToTeam` で満たさない効果を外す。モジュールは `skills/squad.ts` から `skills/composition.ts` に改名し、関数は `burstStepMixAllows`・`squadAllows`・`compositionAllows`・`applyComposition`・`applyCompositionToTeam`。型は `BurstStepMixCondition`・`BasicBurstStep`（旧 `SquadBurstStep`。`burstReentry` の段階にも使う）・`SquadCondition`（新しい形）。
- 改名の範囲: `data/skills/17.json`、アニス：スターのテスト、結論の「モデル側」（C-0189・C-0201〜C-0204・C-0209）。アニス：スターの設計書 3 本は本文をそのままにし、冒頭に改名の注記を足した。

### 2.2 キャラのデータ: `squad`・`squadName`

`CharacterData` に 2 欄を足す（`scripts/normalize.ts` の `toCharacterData`）。

```json
"squad": "CE003",
"squadName": { "ja": "エミリア陣営", "en": "Emilia's Faction" }
```

- `squad` は roledata の `squad`、`squadName` は `squad_detail.squad_name`（ja/en）。全キャラにある（キャッシュの 202 体で欠けは無い）ので null は許さない。
- `npm run fetch-data`（キャッシュから）で全キャラを作り直した。差分は各キャラの 2 欄だけ。

### 2.3 表示

- 画面（`SkillSection.tsx`）: 編成の条件の注記を `CompositionNote` にまとめ、「段階構成」（`burstStepMix`）と「部隊」（`squad`。例「同じ部隊（エミリア陣営）の味方がいるとき。この編成では効く / 効かない（計算に入れない）」）を出す。
- 画面は結論の状態を出さないので、仮説であることは効果の `assumes`（「仮定」の注記）に書く（論点 2）。
- CLI（`scripts/sim-run.ts`）: 編成の条件の表に、両方の条件を出す。

## 3. 定義（`data/skills/822.json` の skill1）

```json
{
  "support": "supported",
  "effects": [
    {
      "kind": "cooldownReduction",
      "trigger": "fullBurstEnd",
      "target": "self",
      "ref": 4,
      "squad": { "present": true },
      "assumes": {
        "ja": "同じ部隊の味方は、ゲームのデータの部隊（エミリア陣営: レム・エミリア）が同じキャラと読んだ（仮説。…）",
        "en": "…"
      },
      "claims": ["C-0080", "C-0235"]
    }
  ],
  "notes": [{ "ja": "通常攻撃 5 回命中で対象に付く攻撃力▼は、敵の攻撃力を下げるだけでダメージに関係しない", "en": "…" }]
}
```

- いままでの notes[1]（部隊を扱わないので未対応）は消した。C-0080 の「モデル側」を、この効果の `squad` に書き換えた。

## 4. テスト

- `ramTeam.test.ts`: 同じ部隊の味方がいない 2 編成で CT▼ が起きないこと（C-0080）はそのまま。レム（820）・エミリア（821）を入れた 2 編成を足し、フルバースト終了のたびにラムの枠に 20.16 秒の CT▼ が入ること、sim と calc の予定・即時効果が一致することを確かめる。
- `skills/__tests__/composition.test.ts`: `squad` が自分を数えないこと、空枠を数えないこと、自分の部隊と比べること、`burstStepMix` と両方あるときの判定、読み込みの検査。
- `definitions.test.ts`: 即時効果だけの定義（ラム）も「ダメージに効く効果がある」と数える。

## 5. 論点（推奨を先に書く）

1. **欄の名前**: 既存の `squad` は「バースト段階で見る部隊構成」（アニス：スター）の意味で使っている。
   - 推奨: 新しい欄 `sameSquad` を足し、既存の `squad` は変えない（定義・画面・CLI の改名が要らない）。
   - 代案: 既存の `squad` を `burstStepMix` などに改名して、`squad` をゲームの部隊に使う（名前は正確になるが、アニス：スターの定義と画面に差分が出る）。
   - **決定（2026-10-04）: 代案**。2.1 節のとおり改名した。
2. **結論の状態**: 「同じ部隊 = CDN の `squad` が同じ」は推論（C-0080 で読みとして書いた）。同じ部隊の味方がいる編成の実測は無く、手元のキャラでは撮れない。
   - 推奨: C-0235 を `仮説`（推論）で立てて実装する。効果には `claims` で C-0080・C-0235 を付け、画面には `assumes` で仮説と出す。
   - 代案: 実測が取れるまで実装しない（いまのまま notes）。
   - **決定（2026-10-04）: 推奨どおり**。
3. **キャラのデータを全員分作り直すか**: ラムの判定だけなら 820〜822 に欄を足せば足りるが、条件は「自分を除く枠のキャラの部隊」を見るので、どのキャラにも欄が要る。
   - 推奨: 全キャラを作り直す（2 欄だけの差分）。
   - **決定（2026-10-04）: 推奨どおり**。
