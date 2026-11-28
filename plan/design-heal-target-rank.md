# 設計書: 回復の対象の語彙（自分を除く・最終防御力の順位・HP の値の順位・対象の HP の割合の閾値）

- 手順: [skills-guide.md](skills-guide.md)（1.2 説明文を分解する → 1.3 設計書 → 1.4 実装する）
- 関連: [design-heal-vocabulary.md](design-heal-vocabulary.md) 3.2 節（`lowestHpRatio`）、[design-hp-ratio-readers.md](design-hp-ratio-readers.md) 2.2 節（回復の発火のフレームで並べる）、[design-hp-heal-restore.md](design-hp-heal-restore.md) 2.5 節、[design-heal-amount-up.md](design-heal-amount-up.md) 2.3 節、[design-target-vocab.md](design-target-vocab.md) 2.1 節（`excludeSelf`）、[design-lowest-attack.md](design-lowest-attack.md) 2.3 節（順位の同値）、[design-skill-stage7.md](design-skill-stage7.md) 1.4 節（最終防御力の比べ）、V-0897
- 検証: V-0902
- 作成日: 2026-11-28
- 状態: 完了（8 節）

## 0. 範囲

- [skills.md](skills.md) の未対応の notes のうち、回復の対象の語彙が無いために残っている 4 行を、語彙を足して効果にする。
  - ベイ（550）宝物版 S1: フルチャージして攻撃した時、自分を除く味方全体の回復。
  - パスカル（812）S1: 10 回射撃した時、最終防御力が最も高い味方 1 機の回復。
  - パスカル バースト: 残りの HP の値が最も低い味方 3 機の回復。
  - トリナ（412）S1: フルチャージ攻撃時、残りの HP の割合が最も低い味方 2 機が HP 30% 以下・50% 以下の時の回復。
- どれも回復量でなく「回復効果が適用された時」（トリガー `healed`）の発動を通してだけダメージに効く。いま定義にある、ダメージに効く受け手は、クラウンの S2（味方全体の攻撃ダメージ▲・7 秒。C-0050）とアスカの S1（自分の攻撃力▲・25 秒。C-0464）の 2 つ。ネロ・シラツルの S1 の「回復効果が適用された時」は防御系で、ダメージに効かない。
- backlog 6 節の `skill-hp-heal-restore`（持続回復・吸収回復で HP の割合が戻る分と、受けるHP回復量▲）は、この設計では片付けない（2.5 節）。
- コードで確かめた、いまのモデル（2026-11-28）:
  - `heal` の対象は `BuffTarget`。`lowestHpRatio` は、発火のフレームの HP の割合（`skills/holders/hpViews.ts` の `selfHpRatioAt`）の低い順・同値は枠の若い順に並べ（`skills/holders/views.ts` の `rankContext` が発火の文脈 `hpRank` を作る）、先頭 `targetCount` 枠に掛ける。
  - 「自分を除く」（`excludeSelf`）は timed・付与・passive の `allies` にだけ書ける。編成で決まる枠（`skills/composition.ts` の `fixedTargetsOf`）で自分の枠を外す。
  - 最終防御力は `views.ts` の `finalDefenceAt`（バフ前の防御力 × (1 + 防御力▲ の和)）。いまは「自分と自分より最終防御力が低い味方」（`targetDefense: "lowerThanSelf"`）だけが読む。
  - HP は、枠ごとに想定の割合（`TeamSlotInput.hpRatio`。省略は満タン）・最大HP▲・最大HP のみ▲・現在の HP▼・量で追う 1 回の回復（`scaling: "casterFinalMaxHp"`）で動く。最終最大HP は `finalMaxHpAt`。残りの HP の値は、割合 × 最終最大HP で出せる。
  - スペック固定では、バフ前の最大HP と防御力はクラスとレア度で決まる（`fixedSpec.ts`）。同じクラス・レア度の味方は同値になる。

## 1. 説明文の分解（回復の行だけ。スキル Lv10）

<!-- prettier-ignore -->
| キャラ・スロット | 説明文の行 | 分類 | 書き方 |
| --- | --- | --- | --- |
| ベイ 宝物版 S1 | フルチャージして攻撃した時、自分を除く味方全体に「スキル発動者の最終最大HP の X% 回復」 | 語彙を足す（2.1 節） | `heal`（`fullChargeShot`・`allies`・`excludeSelf: "always"`・`scaling: "casterFinalMaxHp"`） |
| パスカル S1 | 10 回射撃した時、最終防御力が最も高い味方 1 機に「スキル発動者の最終最大HP の X% 回復」 | 語彙を足す（2.2 節） | `heal`（`{ count: "normalShot", every: 10 }`・`topDefense`・`targetCountRef: 2`・`casterFinalMaxHp`） |
| パスカル S2 | バースト I 段階突入時、残りの HP の値が最も低い味方 3 機に受けるHP回復量▲ | 間接（HP）のまま | 受けるHP回復量▲は語彙に無い（2.5 節） |
| パスカル バースト | 残りの HP の値が最も低い味方 3 機に「スキル発動者の最終最大HP の X% 回復」 | 語彙を足す（2.3 節） | `heal`（`burstUse`・`lowestHp`・`targetCountRef: 1`・`casterFinalMaxHp`） |
| トリナ S1 | フルチャージして攻撃した時、残りの HP の割合が最も低い味方 2 機が HP 30% 以下なら、対象に「スキル発動者の最終最大HP の X% 回復」 | 語彙を足す（2.4 節） | `heal`（`fullChargeShot`・`lowestHpRatio`・`targetCountRef: 4`・`targetHpAtMostRef: 3`・`casterFinalMaxHp`） |
| トリナ S1 | 同じく HP 50% 以下なら、対象に「…X% 回復」 | 語彙を足す（2.4 節） | 上と同じ形で `targetCountRef: 7`・`targetHpAtMostRef: 6` |

- パスカルの「10 回」「1 機」「3 機」は値の欄にあるが、Lv1 でも同じ値（説明文に Lv1 の値が添えられていない）。

## 2. 語彙

### 2.1 heal の「自分を除く」（論点 1）

- `heal` に `excludeSelf?: "always"` を足す。`target` が `allies` のときだけ書ける（passive と同じ制約。`unlessShort` は書けない）。
- 枠の決め方は timed・passive の `allies` と同じ（`fixedTargetsOf` で自分の枠を外す）。`fixedTargetsOf` の `excludeSelf` の判定に `heal` を足すだけで、`skills/targets.ts` の判定は変えない。
- ダメージへの効き方: ベイ自身には回復を受けた時の効果が無いので、ベイを外すかどうかは、ベイの HP の割合（ほかの味方の `lowestHpRatio` の並びが読む）にしか効かない。それでも、説明文どおりに外す方が意味が 1 通りに保てる。

### 2.2 対象「最終防御力が最も高い味方 N 機」: `topDefense`（論点 2）

- `BuffTarget` に `topDefense` を足す。`isCountedTarget` に入れ、`targetCount` / `targetCountRef` で N を書く。書ける効果は `heal` だけ（ほかの効果に使うキャラが出たら広げる）。
- 判定: 発火のフレームの最終防御力（`finalDefenceAt`。`lowerThanSelf` と同じ時点）の高い順に並べ、先頭 N 枠に掛ける。並びは `rankContext` が作り、発火の文脈の `targetRank` に入れる（heal にだけ書ける 3 つの対象で 1 つの欄を共用し、並べる値だけが違う）。同じフレームに始まる防御力▲ の件も入る（`lowerThanSelf` と同じ。HP の側は前のフレームまでに始まった件）。自分も候補。
- 同値: 枠の若い順（`topAttack`・`lowestHpRatio` と同じ。確かめていない）。スペック固定では同じクラス・レア度の味方が同値になるので、たとえば SSR の防御型が 2 体以上の編成では、同値の選び方で対象が決まる。ソーダの S1 の「自分を除く最終攻撃力が最も高い味方」は同値で後ろの枠に付いた（C-0882）ので、`topDefense` の同値の規則は `assumes` に「確かめていない」と書く。
- `canEverTarget`: 候補の枠（武器種などで絞った後）のどれにも付きうる（`lowestHpRatio` と同じ）。

### 2.3 対象「残りの HP の値が最も低い味方 N 機」: `lowestHp`（論点 3）

- `BuffTarget` に `lowestHp` を足す。`isCountedTarget` に入れる。書ける効果は `heal` だけ。
- 判定: 発火のフレームの残りの HP の値（`selfHpRatioAt` × `finalMaxHpAt`。どちらも発火のフレームより前に付いた件。`lowestHpRatio` と同じ時点）の低い順に並べ、先頭 N 枠に掛ける。発火の文脈の `targetRank` を `lowestHpRatio`・`topDefense` と共用する（並べる値だけが違う）。自分も候補。
- 同値: 枠の若い順（確かめていない）。スペック固定では同じクラス・レア度の味方が同値になる。
- 被弾の無い射撃場では、HP の値の順位は最終最大HP の順位とほぼ同じになる。最大HP のみ▲ は最大HP を上げても残りの HP を上げないので、HP の値の並びは動かない。最大HP▲ は残りの HP も上げるので並びを動かす。
- 枠の HP の割合の想定を読むので、`hpRatioReadersOf` の `lowestHpRatioTarget` に `lowestHp` も入れる（画面に想定の欄を出す）。
- 「HP の割合」の `lowestHpRatio` と 1 つの対象にまとめて、並べる値を欄で切り替える形もあるが、`lowestAttack`・`topAttack` が対象を分けているのに合わせて、対象を分ける。

### 2.4 heal の対象の HP の割合の閾値: `targetHpAtMostRef`（論点 4）

- `heal` に `targetHpAtMostRef?: number`（閾値 % の `description_value_NN`）を足す。`target` が `lowestHpRatio` のときだけ書ける。
- 意味: 「残りの HP の割合が最も低い味方 N 機が HP X% 以下なら、対象に」を、**選んだ N 機のうち、発火のフレームの HP の割合が X% 以下の枠だけに回復する**と読む（読み P）。
  - 先に X% 以下の枠に絞ってから低い順に N 機を取っても、同じ枠になる（閾値の絞り込みは割合の順を崩さない）。だから `rankContext` が並び（`targetRank`）を作るときに閾値で絞ればよい。
  - 採らない読み B: N 機が**どちらも** X% 以下のときだけ、2 機に回復する。「対象に」は選んだ味方を指すだけで、条件が 2 機そろってかは説明文から決まらない。P の方が「対象に」を自然に読める。
  - 録画 1221・1222 では、割合が 50% を下回ったソルジャーE.G. にだけ 50% の行の回復が付き、もう 1 機は 50% を下回っていなかった（C-1311）。B なら回復は起きないので、P に合う。
- 文脈が無い呼び出し（`targetRank` が無い）では誰にも掛けない（閾値を見ずに全員へ掛けない）。`lowestHp`・`topDefense` も、文脈が無ければ並びが決まらないので掛けない。
- 30% の行と 50% の行は別の効果なので、30% 以下の枠は同じフレームに 2 回回復を受ける（どちらも `healed` を起こす）。
- 前提の中で割合が閾値を下回るのは、最大HP のみ▲・現在の HP▼・想定の割合の入力だけ。トリナの S2・バーストの最大HP のみ▲ は電撃コードの AR だけに付くので、いまの受け手（クラウン・アスカ）にトリナの回復が届くのは、想定の割合を入れたときか、ほかのキャラの最大HP のみ▲ か現在の HP▼ を受けたときだけ。
- 回復が割合を戻すと閾値を上回り、回復が止まる（量で追う回復。上限は想定の割合。[design-hp-heal-restore.md](design-hp-heal-restore.md) 2.4 節）。

### 2.5 足さないもの・`skill-hp-heal-restore` を残す理由（論点 5）

- パスカル S2 の受けるHP回復量▲は、間接の notes のまま。[design-heal-amount-up.md](design-heal-amount-up.md) 2.3 節のとおり、与える▲との重ね方を確かめていない。対象の語彙（`lowestHp`）は 2.3 節で入るが、▲の量を回復に掛ける形が無い。
- `skill-hp-heal-restore` は残す。持続回復の刻みの時刻と、受けるHP回復量▲の量・重ね方は、どれも撮影で決めるもので、この 4 行の対象の語彙とは独立している。4 行の回復はどれも 1 回の回復（量で追える）なので、`skill-hp-heal-restore` が無くても書ける。
  - ただし、トリナの S1 の 1 行目（フルバーストの終わりの持続回復）が割合を戻さないので、モデルではトリナの閾値の回復が実機より長く続きうる（6 節）。これを課題の「対象」の欄に足す。

## 3. 定義の案

- ベイ 宝物版 S1: `notes[2]`（未対応）を外し、`heal`（`trigger: "fullChargeShot"`・`target: "allies"`・`excludeSelf: "always"`・`ref: 2`・`scaling: "casterFinalMaxHp"`）を足す。
- パスカル S1: `notes[0]` を外し、`heal`（`trigger: { "count": "normalShot", "every": 10 }`・`target: "topDefense"`・`targetCountRef: 2`・`ref: 3`・`scaling: "casterFinalMaxHp"`）を足す。射撃の回数のきっかけなので、回復はきっかけの射撃の次のフレームに起きる（いまの `heal` の決まり）。
- パスカル バースト: `notes[0]` を外し、`heal`（`trigger: "burstUse"`・`target: "lowestHp"`・`targetCountRef: 1`・`ref: 2`・`scaling: "casterFinalMaxHp"`）を足す。
- トリナ S1: `notes[0]` を外し、`heal` を 2 つ（2.4 節）足す。
- 説明文の言い回しと語彙の対応を [skill-phrases.md](skill-phrases.md) に 3 行（自分を除く味方全体への回復・最終防御力が最も高い味方・残りの HP の値が最も低い味方）と、閾値の 1 行を足す。分類（`skills/catalog.ts`・`catalogDoc.ts`）の対象の言い回しにも足す。

## 4. 検証（論点 6）

撮影は V-0902（編成・予測・撮影の依頼はそちら）。狙い:

- **撮影 1（ベイ 宝物版 S1）**: ベイ（宝物）とアスカの 2 体で、ベイのフルチャージの発のたびにアスカの S1 が付くか。「自分を除く」はダメージに出ない（2.1 節）ので見分けない。
- **撮影 2（パスカル S1・バースト）**: クラウン・パスカル・ラピ・アスカで、S1 の回復がクラウン（最終防御力が最も高い）に付いてクラウンの S2 を起こすか、バーストの回復がアスカ（HP の値の読みでは対象・HP の割合の読みでは対象の外）に付いてアスカの S1 を起こすか。
- **トリナ S1**: 前提の中で受け手の割合を閾値の下に下げられない（2.4 節）ので撮らず、C-1311 を根拠に仮説で入れる。
- 結論: 撮影 1 → ベイの回復、撮影 2 → パスカルの回復（S1・バースト）を、それぞれ 1 件ずつ。トリナの閾値の回復は C-1311（仮説）に結び付ける。

## 5. 退化の見込み

- 定義を書かない効果の値は変わらない。足す欄・対象は、書かない定義では読まれない。
- 変わるのは、ベイ（宝物）・パスカル・トリナと、クラウンかアスカを組んだ編成だけ。回復を受けた時の▲が付くので、その編成のダメージは上がる。
- `lowestHpRatio` の並びに閾値の絞り込みを足すのは、`targetHpAtMostRef` を書いた効果だけ。いまのメアリー・ミサトなどの回復の並びは変わらない。

## 6. リスク

- 順位の同値（2.2・2.3 節）: スペック固定では同じクラス・レア度の味方が同値になり、枠の若い順の仮定が対象を決める。撮影 2 は同値の起きない編成にする。
- トリナの閾値の回復: 持続回復で割合が戻る分が無い（2.5 節）ので、最大HP のみ▲ で割合が下がった電撃 AR の味方には、モデルでは実機より長く回復が付きうる。いまの受け手は電撃 AR でないので、ダメージには出ない。
- `rankContext` は発火のたびに枠の割合・値を読むので、回復の多い編成で 1 パス目が少し重くなる。対象の効果のときだけ読む。

## 7. 論点（2026-11-28 に推奨どおり決まった）

1. ベイの「自分を除く」: `heal` に `excludeSelf: "always"` を足す（推奨: 足す。2.1 節）。代わりの案は `allies` のまま書き、`assumes` に自分にも付くと書く（ダメージは変わらないが、説明文と食い違う）。
2. パスカル S1 の「最終防御力が最も高い」: 新しい対象 `topDefense`（推奨。同値は枠の若い順・未確認と `assumes` に書く。2.2 節）。
3. パスカル バーストの「残りの HP の値が最も低い」: 新しい対象 `lowestHp`（推奨。同値は枠の若い順。2.3 節）。代わりの案は `lowestHpRatio` に並べる値の欄を足す形。
4. トリナの閾値: 読み P（選んだ 2 機のうち閾値以下の枠だけに回復。推奨。2.4 節）。読み B（2 機そろって閾値以下のときだけ）は採らない。
5. `skill-hp-heal-restore`: この設計では片付けず、課題の「対象」の欄にトリナの閾値の回復への効き方を足す（推奨。2.5 節）。
6. 検証: 撮影 1・2 を撮って確定にし、トリナは撮らずに仮説で入れる（推奨。4 節）。代わりの案は、V-0897 と同じく 4 行とも撮らずに仮説で入れる（撮影待ちが無くなるが、新しい対象の語彙の実装を録画で確かめられない。[skills-guide.md](skills-guide.md) 0 節は撮って確かめる決まり）。

## 8. 撮った後に分かったこと（V-0902）

- ベイの宝物版 S1・パスカルの S1・バーストは、2.1〜2.3 節の語彙のまま録画と合った（C-1631・C-1629・C-1630）。定義も語彙も変えない。
- 回復は、射撃の回数のきっかけでは弾の命中でなく射撃のフレームに付く（いまの `heal` の決まり）。ベイの RL の弾の命中より前に、受けた味方の▲が乗った。
- パスカルのバーストの対象は、HP の割合で並べる読み（`lowestHpRatio` と同じ。満タンなら枠の若い順）と合わない。HP の値の読みを採る。
- 順位の同値の選び方は、撮影の編成に同値が無いので確かめていない（2.2・2.3 節の `assumes` のまま）。

## 経過

- 2026-11-28: 起案。論点 1〜6 は推奨どおりに決まった。語彙と定義を入れ、撮影 1・2 を頼んだ（V-0902）。
- 2026-11-28: 撮影 1・2（録画 1453・1454）を読み、ベイとパスカルの回復を確定にした（8 節）。
