# Stage 6 設計書: スキルモデル段階 B — バースト時トリガーの持続バフ

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **完了（2026-09-22）**（経緯は末尾の「経過」）
- 関連: [design-stage5.md](design-stage5.md)、[design-stage4.md](design-stage4.md)、[verification.md](verification.md)、[roadmap.md](roadmap.md)
- 作成日: 2026-09-22

## Context

Stage 5 で「固定 20 秒サイクル（通常 10 秒 + フルバースト 10 秒）」の時刻表と、sim（フレーム逐次）→ calc（区間期待値）の 2 本立てが揃った。sim と calc は同じ式・同じ時刻表を共有し、違いは**発射サイクルの離散化だけ**という不変条件を `simCalc.test.ts` で固定してある。

Stage 6 の要求（[roadmap.md](roadmap.md)）:

- 「バースト発動時 / フルバースト時に N 秒間 攻撃力 +X%」型の**持続バフ**を扱う。
- **sim**: バースト発動・フルバースト突入時にバフを付与し、フレームタイマーで失効させる状態遷移を実装する。
- **calc**: バフ持続時間に応じた**区間分割**を導入する（固定サイクル前提なので静的に分割できる）。
- **検証**: sim のバフ中ダメージと calc の区間計算を自動テストで照合し、射撃場で持続バフ効果中の 1 ヒットを実測する。完了条件は「持続時間がサイクル長以上のとき常時バフと一致する」。

いまの定義ファイル（6 体）の `notes` には、Stage 6 で回収すべき効果（ラピ・エマ：TU のバーストの攻撃力▲、マナ S2 のフルバースト時の効果、クイーン（真）の戦闘開始時・フルバースト終了時の攻撃力など）が既に名指しで書いてある。

**Stage 6 は新しい `BuffStat` を 1 つも足さない。** 足すのは「いつ付いて、いつ切れるか」だけで、値の解決（`resolve.ts`）・合算（`buffs.ts`）・式への適用（`damage.ts`）は Stage 4 のまま使える。これが Stage 6 を小さく保てる理由。

---

## 1. 時間モデルと用語

Stage 5 の時間モデル（[design-stage5.md](design-stage5.md) 1 節）をそのまま使い、用語を 2 つ足す。

- **トリガー時刻**: 持続バフが付くフレーム。Stage 5 の固定サイクルでは次の 4 種類しかない。
  | トリガー         | 発火フレーム                      | 発火する枠                           |
  | ---------------- | --------------------------------- | ------------------------------------ |
  | `battleStart`    | `0`（1 回だけ）                   | 定義を持つ枠すべて                   |
  | `burstUse`       | 各 `schedule.activationFrames[k]` | **自分がその段階の割当枠のときだけ** |
  | `fullBurstStart` | 各 `schedule.activationFrames[k]` | 定義を持つ枠すべて                   |
  | `fullBurstEnd`   | 各 `fullBurstWindows[k].end`      | 定義を持つ枠すべて                   |
- **バフ窓（`BuffWindow`）**: 1 つの効果が 1 人に効いている `[start, end)` のフレーム区間。`end = start + durationFrames`、戦闘時間で切る。
- **区間（`TimelineSegment`）**: 編成全体で「誰にどのバフが効いているか」と「フルバースト中か」がどちらも変わらない最大のフレーム区間。バフ窓の端・フルバースト区間の端・発動フレーム・`0` / `frames` をすべて境界にして作る。

Stage 5 では `burstUse` と `fullBurstStart` が**同じフレーム**になる（段階間の遅延 0f、発動と同時にフルバースト開始）。それでも語彙としては分ける（8 節 4）。Stage 7 で段階の演出時間を入れると両者は数十フレームずれ、そのとき定義を書き直さずに済む。

`fullBurstEnd` は、戦闘時間で切られた最後のフルバースト窓では `frames` と一致して効果ゼロになる。

**スコープ外（引き続き「未対応」と表示する）**: スタック（クイーン（真）S2 のバトンタッチ 3 スタック、段階 C）、弾数・リロード速度・チャージ時間のバフ（発射サイクルが変わるもの。段階 C / D）、防御力無視・命中率・阻止部位ダメージ（語彙にない）、敵デバフ（受けるダメージ▲）、持続ダメージ（マナ）、条件付きトリガー（被弾 N 回・N 発ごと・HP 条件。段階 C）、CT・ゲージ（Stage 7）。

---

## 2. スキル定義 JSON の拡張（`skills/types.ts`）

`formatVersion` は 1 のまま語彙を足す（既存 6 ファイルはそのまま有効）。トリガーを `kind` に埋め込まず **`kind: 'timed'` + `trigger` フィールド**にする（種類が 4 つあり、今後さらに増えるため）。

```ts
/** 持続バフが付くきっかけ */
export type BuffTrigger = 'battleStart' | 'burstUse' | 'fullBurstStart' | 'fullBurstEnd';

/** Stage 6: 「（トリガー）時、（対象）に （stat） X%▲、Y 秒間維持」 */
export type TimedEffect = {
  kind: 'timed';
  trigger: BuffTrigger;
  target: BuffTarget; // self | allies（Stage 4 と同じ）
  stat: BuffStat; // attack | critRate | critDamage | attackDamage | chargeDamage（Stage 4 と同じ）
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ（Stage 4 と同じ規則） */
  scaling?: BuffScaling;
  /** 値の description_value_NN。% 表記を 100 で割るのは resolve の責務（Stage 4 と同じ） */
  ref: number;
  /** 維持秒数の description_value_NN。説明文が「10 秒間維持」と即値のときだけ durationSeconds を使う */
  durationRef?: number;
  /** durationRef の代わりに即値（秒）。両方省略・両方指定は Error */
  durationSeconds?: number;
  assumes?: LocalizedText;
};
```

`parseSkillDefinition` に足す規則:

- `timed` は **どのスロットにも書ける**。`skill1` / `skill2` の「バーストスキルを使用した時」「フルバーストタイムが発動した時」も、`burst` スロットの「自分に攻撃力▲ 10 秒間維持」も同じ `timed`。
- `burst` スロットに `passive` を書けない規則（Stage 5）はそのまま。`burst` の持続バフは `timed`（`trigger: 'burstUse'`）で書く。
- `durationRef` と `durationSeconds` は**ちょうど片方**。両方または両方なしは `Error`。
- `durationSeconds` は正の有限数。`durationRef` は正の整数（`ref` と同じ検証）。
- `scaling: 'casterAttack'` は `stat: 'attack'` のときだけ（Stage 4 と同じ）。

`resolve.ts` に `resolveTimed(def, character, levels): ResolvedTimedEffect[]` を足す。`ResolvedEffect`（Stage 4）に `trigger` と `durationFrames`（`durationToFrames(秒)`）が付いた形にして、`applyResolvedEffect`（`buffs.ts`）はそのまま使い回す。

### 2.1 Stage 6 で定義（更新）するキャラ

**新しいキャラは足さない。** 既存 6 体の `notes` に「Stage 6」と書いてある効果を `timed` に起こすだけにする（8 節 6）。ラピ・エマ：TU・マナ・クイーン（真）の 4 体 5 スロットに `timed` を書き、ノワール・ウンファ：TU の効果は語彙外なので据え置く。

マナ S2 の注意: 「フルバーストタイムが発動した時、**自分がマターシグマ状態なら**」で、発動と同時にマターシグマが解除され、「フルバーストタイム終了時、直前に自分がバーストスキルを使用していれば」再付与される。固定サイクルでマナが III の割当枠なら毎サイクル再付与されるので毎回発動する。そうでない編成では 1 回目だけになる。**`assumes`「毎サイクル自分がバーストする（マターシグマが再付与される）」を付けて毎サイクル発動として扱う**（8 節 8）。

---

## 3. core の共通部分（sim と calc が共有する純関数）

### 3.1 バフのタイムライン（新規 `skills/timeline.ts`）

Stage 6 の中身はほぼこの 1 ファイルに集まる。`planFixedCycle` と同じく、`TeamSlotInput` ではなく必要な情報だけ（キャラ・定義・Lv・発動者基準の固定加算に使うバフ前攻撃力）を受け取る純関数にして循環 import を避ける。

`planBuffTimeline(slots, schedule, frames)` が `BuffTimeline`（`[0, frames)` を隙間なく覆う区間の列と、表示・テスト用の窓の列）を返す。手順:

1. **発火フレームを集める**。枠 i の効果 e について、1 節の表のとおりにフレーム列を作る。`schedule === null`（バーストなし）なら `battleStart` だけが発火する。

   `burstUse` は**枠から段階を引いてから、その段階の発動フレーム列を取る**構造にする（`assignedStepOf(assignment, slotIndex)` と `activationFramesOfStep(schedule, step)`）。Stage 6 の固定サイクルでは 3 段階とも同一フレームなので `activationFramesOfStep` は `schedule.activationFrames` を返すだけだが、**Stage 7 で段階ごとの演出遅延を入れるときに、この関数の中身を差し替えるだけで済む**。`planBuffTimeline` 側には「段階を引いてフレーム列を取る」以上の知識を持たせない。

2. **窓を作る**。各発火フレーム f について `[f, min(f + e.durationFrames, frames))`。同じ (発動枠, スロット, 効果) から出た窓は **和集合をとる**（重ねずに延長する。8 節 2）。対象が `allies` なら全枠に同じ窓を配る（`isEffectTarget` を通す。Stage 4 と同じ）。
3. **境界を集める**。`{0, frames}` ∪ 全窓の `start` / `end` ∪ `schedule.fullBurstWindows` の `start` / `end` ∪ `schedule.activationFrames`。ソートして重複を除き、`[0, frames]` に収める。
4. **区間を作る**。隣り合う境界ごとに、その区間で有効な窓を集めて `applyResolvedEffect` で `BuffTotals` に足す（常時パッシブの `SlotBuffs` を出発点にする）。足す順は「窓の発生順」に固定して、浮動小数の加算順を決定的にする。
5. **`key` を作る**。`fullBurst` と `BuffTotals` の 6 フィールドを並べた文字列。

   **固定桁で文字列化する**。`casterAttack` の掛け算や比率の加算は経路によって最下位ビットがずれるので、生の数値を連結すると「同じバフ状態のはずの区間が別グループに分かれる」事故が起きる。`toFixed(6)` で丸めてから連結する。`attackFlat` は実数（数万のオーダー）なので `toFixed(6)` は小数 6 桁の丸めとして十分に細かく、意味のある差（1 未満の攻撃力差）を潰さない。**`key` はグループ化にしか使わず、ダメージ計算には丸める前の `BuffTotals` を渡す**（丸めが数値に混入しないようにする）。6.1 節に「丸め誤差だけ違う 2 区間が同じグループになる」テストを置く。

区間数は最悪でも数百なので、全区間を素直に列挙してよい。

### 3.2 区間のまとめ（同上ファイル）

calc は区間をそのまま足すのではなく、**`key` が同じ区間をまとめてから 1 回だけ計算する**（`groupTimeline`。8 節 5）。

これで **timed 効果が 1 つもない編成ではグループが「通常 90 秒」「フルバースト 90 秒」のちょうど 2 つに退化し、Stage 5 とまったく同じ `computeDamage` 呼び出しになる**（6.2 節の退化テスト）。区間を個別に足すと `9 × (rate × 10)` と `rate × 90` の差（相対 1e-16 程度）が出るので、まとめる方が不変条件を書きやすい。

---

## 4. sim（`packages/core/src/sim/engine.ts`）— 先に作る

フレームループは Stage 5 のままで、**区間をまたぐときに 1 トリガーの値を差し替えるだけ**にする。毎フレーム `computeTriggerDamage` を呼ぶことはしない（区間の境界でしか変わらないため）。

### 4.2 フレームループ

```
timeline = planBuffTimeline(...)
各枠 × 各区間の TriggerDamage を先に計算しておく（区間数 × 枠数 = 数百回の computeTriggerDamage）
segIndex = 0
for f in 0..frames-1:
  while timeline.segments[segIndex].end <= f: segIndex++      // 区間をまたいだ
  fb = timeline.segments[segIndex].fullBurst                  // isFullBurstFrame と一致することをテストで固定
  if f が発動フレーム:
      バースト I → II → III の順に burstHit を加算              // 使うバフは「f の直前の区間」（4.3 節）
  各枠: stepShooter → 撃ったら segments[segIndex] のトリガー値を加算
```

Stage 5 との差は `segIndex` の管理と、トリガー値を区間から引くところだけ。射手の状態機械（`shooter.ts`）は無変更なので、**発射フレーム列は Stage 5 と 1 フレームも変わらない**（6.2 節で固定する）。

### 4.3 バーストヒットが見るバフ

発動フレーム `f` で発生するバーストスキルダメージは、**`f` の直前の区間（`f` を終端に持つ区間）のバフ**で計算する。つまり「その発動で自分に付く攻撃力▲は、その発動のダメージには乗らない」。Stage 5 の `BURST_SKILL_FULL_BURST_BONUS = false`（フルバースト開始前のスナップショット）と同じ立場。実測で覆せるように定数で逃がす（8 節 3）:

```ts
/** バーストスキルダメージが「発動直前」のバフで計算されるか。false なら発動フレームの区間（その発動で付くバフ込み）を使う */
export const BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true;
```

---

## 5. calc — sim の期待値モデル

### 5.1 core（`team.ts`）の区間モデル

`TeamInput` は無変更。`TeamSlotResult` の Stage 5 の `result` / `fullBurstResult` を廃止し、バフ状態ごとにまとめた区間の配列（`segments: SlotSegmentResult[]`。区間の範囲・フルバーストか・`BuffTotals`・1 トリガーの値・トリガー数・ダメージ）に置き換える。区間に依らない値（バフ前攻撃力・平均レート・注記）は枠の直下に置く。

`computeTeamDamage` の処理: (1) `resolveTeamBuffs` で常時パッシブを配る（Stage 4）、(2) `planFixedCycle`（Stage 5）、(3) `planBuffTimeline` → `groupTimeline`、(4) グループごとに `computeDamage`（`condition.fullBurst` と `durationSeconds = group.seconds`、`buffs = group.slots[i].buffs`）、(5) バーストヒットは `burstSnapshotBuffs`（4.3 節の「発動直前の区間」。全発動で同じとは限らないので**発動ごと**に計算して合計する）、(6) 合計。

**バーストヒットが発動ごとに変わる例**: クイーン（真）の `fullBurstEnd` の 15 秒バフは次の発動フレームに間に合い、1 回目の発動には `battleStart` の 15 秒窓が乗る。結果として全発動で同じ値になるが、**一般には同じとは限らない**ので、`SlotBurstResult` は発動ごとの内訳（`activations: { seconds, hit }[]`）と、UI の代表値（1 回目の内訳）を持つ。

### 5.2 apps/calc の状態（`team.ts`）

**変更なし。** `burst: boolean` のトグルだけで、持続バフの ON/OFF は作らない（`burst: false` なら `battleStart` だけが効く。8 節 7）。保存キーも `v1` のまま。

### 5.3 UI（最小限）

- スキルの効果行に持続バフを足す（トリガー・対象・stat・値・秒数）。編成の内訳の表の列は Stage 5 のまま増やさない。
- 結果に「区間」セクション（折りたたみ、既定は閉）を足す。`groupTimeline` のグループ単位で、時間帯・FB・攻撃力・倍率グループ・1 トリガー・トリガー数・ダメージを出す。**時間帯の列は必須**（グループが複数の区間を含むときは列挙する）。
- バーストスキルの内訳は代表値（1 回目）のまま。発動ごとに値が違うときだけ「発動ごとに異なる」と注記する。

**代表値が `segments[0]` になることについて**: `battleStart` の持続バフを持つキャラ（クイーン（真）の 15 秒）では、`segments[0]` は「開幕 15 秒のバフ中」の値になる。これは「戦闘開始時点のステータス」として自然な読み方なので代表値としては問題にしないが、**区間表に時間帯を必ず出して、この行が平常時ではないと分かるようにする**。区間表を折りたたんだまま代表値だけを見て誤解する余地を残さないため、`battleStart` の窓が戦闘時間より短い枠では代表値の横に「開幕バフ中」の小さな注記を出す。

---

## 6. テスト・検証（PDCA）

### 6.1 タイムラインの単体テスト（`skills/__tests__/timeline.test.ts`）

| 確認               | 内容                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 発火フレーム       | 180 秒で `battleStart` = [0]、`fullBurstStart` = [600, 1800, …, 10200]（9 個）、`fullBurstEnd` = [1200, …, 10800 は出ない]（8 個）、`burstUse` = 割当枠だけ 9 個・非割当枠は 0 個    |
| 窓の和集合         | 持続 20 秒（1,200f）を 20 秒ごとに発火 → 窓は 1 個 `[600, frames)`。持続 30 秒でも同じ（重ねない）                                                                                   |
| 窓の切り落とし     | `fullBurstEnd` の 15 秒窓が `frames` を越えたら `end = frames`                                                                                                                       |
| 区間の被覆         | `segments` が `[0, frames)` を隙間・重なりなく覆い、`start < end` で単調増加                                                                                                         |
| `fullBurst` の一致 | 各区間の `fullBurst` が、その区間の全フレームで `isFullBurstFrame` と一致                                                                                                            |
| `allies` の配布    | `allies` の窓が全枠（発動者を含む）に付く。`self` は発動枠だけ                                                                                                                       |
| `casterAttack`     | 発動者のバフ前攻撃力 × 比率が `attackFlat` に入る（Stage 4 と同じ値）                                                                                                                |
| バーストなし       | `schedule === null` なら `battleStart` だけ効き、区間は「バフあり / なし」の 2 つ（持続が戦闘時間未満のとき）                                                                        |
| 段階の逆引き       | `assignedStepOf` が専任枠・`AllStep` の充当枠・空枠・非割当枠（同段階の 2 体目）で正しい `BurstStepKey` / `null` を返し、`burstUse` の発火がそれに従う                               |
| グループ化         | `key` が同じ区間がまとまり、`seconds` の合計が戦闘時間と一致                                                                                                                         |
| `key` の丸め       | 同じバフ状態を別経路で組んで最下位ビットだけ違う `BuffTotals` にしたとき、`key` が一致して 1 グループにまとまる（`toFixed(6)` の確認）。逆に意味のある差（0.001 の比率差）は分かれる |

### 6.2 退化テスト（Stage 5 との厳密一致）

Stage 6 の最大のリスクは「持続バフがない編成の数値が変わってしまう」こと。次を**厳密一致**（`toBe`）で固定する。

1. **timed 効果が 1 つもない編成**: `groupTimeline` が 2 グループ（通常 90 秒 / FB 90 秒）になり、`computeTeamDamage` の `totalDamage` が **Stage 5 の実装値と一致**する（Stage 5 の期待値をテストに直書きする）。
2. **sim の発射フレーム列が不変**: `shotFramesUpTo` と `engine` の `trigger` イベントのフレーム列が Stage 5 と一致（`shooter.ts` 無変更の確認）。
3. **`burst: false`**: Stage 4 と一致（`battleStart` の定義がない編成で）。

### 6.3 「持続 ≥ サイクル長なら常時バフと一致」（ロードマップの完了条件）

ロードマップの文言をテストで書ける形にする。

- **A（厳密）**: `battleStart` の `timed` 効果で `durationSeconds ≥ 戦闘時間` にすると、同じ値を `passive` として書いた定義と **`totalDamage` が厳密一致**する。これが「持続バフ ⊃ 常時バフ」の一番きれいな確認。
- **B（区間の形）**: `burstUse` / `fullBurstStart` の `timed` 効果で `durationSeconds ≥ 20`（サイクル長）にすると、1 回目の発動（600f）以降は途切れず、区間は「バフなし [0, 600)」「バフあり [600, frames)」の 2 状態だけになる（`fullBurst` の切り替わりで分かれる分を除く）。`totalDamage` は「最初の 10 秒だけ常時バフなし」で手計算した値と一致する。
- **C（ゼロ）**: `durationSeconds = 0` は効果なし（定義を消したのと同じ）。

### 6.4 sim と calc の整合（`src/__tests__/simCalc.test.ts` を拡張）

Stage 5 の 3 段構成を保ち、比較の粒度を**グループ単位**に上げる。

1. **厳密一致**: 区間の境界（`timeline.segments`）、各区間の `BuffTotals` と `TriggerDamage`（`attack` / `boost` / `perTrigger`）、バーストヒットの内訳と発動フレーム、フルバースト合計フレーム。**同じ関数を通るので完全一致する。**
2. **離散化誤差**: **グループ単位と編成合計で許容値を分ける**。区間が 5〜15 秒に細切れになると、1 マガジンが 10 秒級の SR / RL ではグループ単体の相対差が Stage 5（90 秒固定）より確実に大きくなる。そこを厳しく縛ると、モデルが正しくてもテストが落ちる。
   - グループごとのトリガー数: `|sim.triggers − calc.triggers| ≤ maxAmmo × (そのグループに含まれる区間数)`。グループが離れた複数の区間の寄せ集めで、各区間が独立に 1 マガジン未満の位相誤差を持つため。
   - グループごとの総ダメージ: 相対差は縛らず、振れ幅を記録するだけ。
   - 枠の総ダメージ: 相対差 **5% 以内**、編成の総ダメージ: 相対差 **3% 以内**（Stage 5 据え置き）。**ここが緩んだらモデルが壊れている**。
3. **収束**: 180 → 1,800 → 18,000 秒で編成合計の相対差が縮む。MG の位相ロック（Stage 5 の知見）はそのまま残る。

### 6.5 その他の単体テスト

- `timed` の定義の検証（`durationRef` の解決、即値、両方指定 / 両方なしが `Error`、`casterAttack` × `stat !== 'attack'` が `Error`、`burst` スロットの `timed` が通る）。
- 定義済みの `timed` の `ref` / `durationRef` が実在し、Lv で値が単調非減少、秒数が Lv で変わらない（NIKKE の維持時間は Lv 非依存のはず。崩れたら検知したい）。
- `segments` の `damage` の和 = `normalDamage`、`normalDamage + burst.totalDamage = totalDamage`、`share` の和 = 1。

---

## 8. 決めてほしいこと（推奨付き）

2026-09-22 に 9 点とも推奨案で承認された。

1. **`battleStart` を Stage 6 に入れるか** — 推奨: **入れる**。ロードマップの文言は「バースト時トリガー」だが、機構（発火フレーム + 持続 + 失効）はまったく同じで、クイーン（真）の「戦闘開始時 攻撃力 50.28%▲ 15 秒」は**録画 0014 で既に実測済み**（Stage 4 の `attackDamage` の切り分けに使った）。ここで拾えば新規撮影なしで回帰テストが 1 本増える。代替: `burstUse` / `fullBurstStart` / `fullBurstEnd` の 3 種だけにし、`battleStart` は Stage 8 に送る。

2. **同じ効果が持続中に再発火したときの扱い** — 推奨: **上書き延長（窓の和集合）**。NIKKE の「N 秒間維持」は同一ソースなら延長で、加算スタックは「{N}スタック」と明記された効果（クイーン（真）S2 のバトンタッチ）だけ。スタックは段階 C（Stage 8）で `stacks` を足して扱う。代替: 加算スタック（上限なし）。**これを間違えると持続 ≥ サイクル長のときに値が跳ねる**ので、6.3 の B で固定する。

3. **バーストスキルダメージが「その発動で付くバフ」を見るか** — 推奨: **見ない**（`BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true`、発動直前の区間のバフ）。Stage 5 の `BURST_SKILL_FULL_BURST_BONUS = false`（フルバースト開始前のスナップショット）と同じ立場で揃う。ラピで 1.6 倍の差になるので実測で確定できる。代替: 発動フレームの区間（バフ込み）。

4. **`burstUse` と `fullBurstStart` を別の語彙にするか** — 推奨: **分ける**。Stage 5 の固定サイクルでは同じフレームだが、意味が違う（前者は「自分が割当枠のときだけ」、後者は全員）。Stage 7 で段階の演出時間を入れれば数十フレームずれる。定義ファイルを書き直さずに済む。代替: 1 つの `onFullBurst` にまとめる。

5. **calc は区間をそのまま足すか、同一バフ状態をまとめてから足すか** — 推奨: **まとめる**（`groupTimeline`）。timed 効果ゼロの編成が Stage 5 とバイナリ一致し（6.2 の 1）、区間が細かくなっても `computeDamage` の呼び出し回数が増えない。代替: 区間ごとに足す（Stage 5 との一致が相対 1e-16 の近似になる）。

6. **定義するキャラ** — 推奨: **新規追加なし**。既存 6 体の notes に「Stage 6」と書いてある効果だけを起こす（2.1 節の 4 体 5 スロット）。代替: 主力（クラウン・レッドフード等）を先に足す → 段階 C の語彙（スタック・条件付き）が要るので Stage 8 向き。

7. **持続バフの ON/OFF トグルを UI に出すか** — 推奨: **出さない**。`burst` トグル 1 つのままにして、持続バフは常に有効にする（`burst: false` なら `battleStart` だけ効く）。比較したいときは定義ファイルを見ればよい。代替: 「持続バフを使う」チェックを足す。

8. **マナ S2 の「マターシグマ状態なら」条件** — 推奨: **`assumes`「毎サイクル自分がバーストする（マターシグマが再付与される）」を付けて、毎サイクル発動として扱う**。固定サイクルでマナが III の割当枠なら実際そうなる。DSL に「1 回だけ（`once`）」や状態フラグを足すのは段階 C。代替: マナ S2 を `unsupported` のまま据え置く。

9. **`durationSeconds` の即値を許すか** — 推奨: **許す**（`durationRef` とちょうど片方）。説明文に `{description_value_NN}` ではなく「維持時間：10 秒」と直書きされているスキルがある（エマ：TU の環境コントロール強化）。ただし**既定は `durationRef`** にして、即値を使った定義には `assumes` か `notes` で「説明文に直書きされた秒数」と残す。代替: `durationRef` だけ（即値が要るスキルは `unsupported`）。

---

## 9. リスク・留意点

- **区間が細かくなるほど calc の離散化誤差が効く**: calc は各区間を「秒間トリガー数 × 秒数」で置くので、区間が 10 秒 → 5 秒と短くなると、1 マガジンが 10 秒級の SR / RL ではその区間の相対誤差が倍増する。**総ダメージでは誤差が打ち消し合う**はずだが、そうならない場合は Stage 5 の 8 節 4 の代替案（窓内のトリガー数を周期から数え上げる補助関数）へ切り替える。テストの許容値はグループ単位（緩く・記録のみ）と枠 / 編成合計（Stage 5 据え置き）で分ける（6.4 の 2）。**グループ単位で振れたときに疑うのはモデルではなく位相**で、枠・編成合計が 5% / 3% を割ったときだけモデルを疑う。
- **浮動小数の加算順**: バフの合算順を「窓の発生順」、区間の合算順を「グループの出現順」、枠の合算順を「枠番号順」に固定する。Stage 3 以来の「各行の和 = 合計行」の手動確認はこの順序に依存している。
- **`burstUse` と割当枠**: Stage 5 で「定義に `burstDamage` があるすべての枠に 9 回を付ける」バグを整合テストが拾った。`burstUse` も同じ罠があるので、**発火するのは `schedule.assignment` に入っている枠だけ**という不変条件を 6.1 の「発火フレーム」テストで最初に固定する。
- **`fullBurstEnd` の最終サイクル**: 180 秒だと最後のフルバースト窓が `10,800f` で切れるので 9 回目の `fullBurstEnd` は発火しない。境界を `frames` で切る処理を間違えると窓が 1 個増える。
- **`assumes` の扱い**: クイーン（真）の「対象が風圧コードなら」やノワールの「HP 70% 以上」と同じく、条件は常に満たすとみなして UI に「仮定」バッジを出す（Stage 4 と同じ）。射撃場の的は属性が固定なので、実測時は `assumes` が成立する的を選ぶ。
- **「毎サイクル必ずフルバースト」の仮定（Stage 5 から継続）**: III が 1 体で CT 40 秒なら実サイクルは 40 秒になり、10 秒バフの稼働率は 50% → 25% になる。Stage 6 の数値は理想サイクルの値として読む。Stage 7 で CT・ゲージを入れてから較正する。
- **`TeamSlotResult` の形を変える影響**: Stage 5 で 1 度やった参照の付け替えをもう 1 度やる。ここで `segments` の形に落ち着けば Stage 7 以降（動的サイクル）でも形は変わらないはず。
- **sim の性能**: 区間数 × 枠数の `computeTriggerDamage` を先に計算しておくので、フレームループ自体は Stage 5 と同じ加算だけ。
- **Stage 7 への拡張余地**: `planBuffTimeline` は `FixedCycleSchedule` を受け取るだけなので、Stage 7 で動的サイクル（ゲージ・CT）の時刻表に差し替えれば、タイムラインの作り方は変えずに済む。sim はそのまま、calc は「区間の秒数が編成ごとに変わる」だけになる。

---

## 10. 実装時の差分と知見（2026-09-22）

設計書からずらした点と、実装して分かったこと。

- **`key` は編成全体ではなく枠ごとにした（3.1 節 手順 5 / 3.2 節からの変更）**: 設計では `fullBurst` + **全枠**の `BuffTotals` を 1 本の鍵にしていたが、それだと**ある枠のバフ切り替えが他の枠の区間まで刻む**。クイーン（真）の 15 秒バフを入れた編成では、ラピのフルバースト区間が 10 秒 → 5 秒 × 2 に割れ、離散化誤差がそのぶん増えた。`TimelineSegment.slotKeys[i]`（その枠の状態だけの鍵）にして `groupTimeline(timeline, slotIndex)` で枠ごとにまとめると、持続バフを持たない枠は Stage 5 と同じ 2 グループのまま保てる。退化テスト（6.2）もこの形で通る。
- **`key` に「効いている効果の出どころ」も入れた**: クイーン（真）の `battleStart` と `fullBurstEnd` はどちらも攻撃力 +50.28% なので、数値だけの鍵では戦闘開始時とフルバースト終了時のバフが同じグループにまとまり、**UI の「持続バフ」欄に誤ったトリガー名が出た**。鍵に `sourceSlotIndex.skill.effectIndex` を並べて、合計が同じでも出どころが違えば別グループにした。ダメージは同じなので総和は変わらない。
- **区間の `ranges` は隣接を畳んでから表示する**（`mergeAdjacentRanges`）。他の枠のバフ切り替えで割れた境界が UI に残らないようにするため。
- **sim にも区間ごとの結果（`SimSlotSegment`）を持たせた**。sim と calc をグループ単位で突き合わせるために `simGroupTotals(result, slotIndex)` も足した。
- **マナの 180 秒での sim と calc の差**は、区間モデルの誤差ではなく位相の偏りだった。発射の周期とサイクルの関係で通常区間とフルバースト区間の発数が偏り、戦闘時間を延ばすと縮む。9 節に書いた「区間が細かくなるほど誤差が効く」の実例に見えるが、原因は区間の細かさではなく**戦闘 180 秒が短いこと**だった（[verification.md](verification.md) Stage 6 節）。

---

## 11. 射撃場の実測の結果（2026-09-22）

録画 0018〜0022 で撮った。詳細と数値は [verification.md](verification.md) Stage 6 節。設計との関係だけ書く。

- **4.3 節の `BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true` は正しかった**。ラピのバーストが素の攻撃力基準で、自分に付く +60.75% は乗っていない。8 節 3 の推奨案が実測で裏付けられた。
- **Stage 5 から持ち越した `BURST_SKILL_FULL_BURST_BONUS = false` も確定**。
- **バフがフルバーストより先に切れることは起きなかった**。バースト使用と FB 開始のずれは 3 フレーム未満で、持続バフとフルバーストは同時に切れる。固定サイクルで `burstUse` と `fullBurstStart` を同じフレームに置く 1 節のモデルはこのままでよい。語彙を分けた判断（8 節 4）は Stage 7 で演出遅延を入れるときの保険として残る。
- **9 節の「`assumes` の扱い」が効いた**。マナの S2 は 2 回目のフルバーストでも発動し、定義ファイルの `assumes`「毎サイクル自分がバーストするのでマターシグマが再付与される」が成立した。
- **エマ：TU は単位まで合わせられなかった**。環境コントロール（未対応の敵デバフ）が乗るので、比でしか確認できなかった。
- **9 節に書いていないリスクが 2 つ出た**。(a) エーテルが「火力に触らない I」ではなかった（S2 が FB 中に防御力▼）、(b) 3 分モードは的が反撃するのでラピの S1（被弾トリガー、段階 C）が後半で発動する。どちらも**実測の編成と読み取り区間の選び方**の問題で、モデルには影響しない。
- **モデルに影響しうる副産物が 2 つ**。(a) 最終攻撃力は整数に丸められてから使われる（calc は小数のままなので 1 未満の差が出る。実用上は無視）、(b)「受けるダメージ▲」は加算グループではなく別枠の乗数らしい（[requirements.md](requirements.md) 5.1 の式は加算グループに入れているので、段階 C 以降で扱うときに再確認する）。
- **分配ダメージ（`distributed`）も `skill` と同じ扱いでよい**（録画 0021）。クイーン（真）のバーストは、倍率・攻撃ダメージは合っており、フルバースト補正・コア・距離・会心はどれも乗っていない。ただし **S2 の「バースト 3 段階突入時 分配ダメージ 90.01%▲」が未対応で、実測は予測の 1.9001 倍**だった。専用の stat と専用のトリガーが要るので段階 C（Stage 8）の語彙になる。`data/skills/870.json` の `burst` を `partial` に落とした。
- **`fullBurstEnd` の再付与も実機どおり**（録画 0021）。S1 の 15 秒バフがフルバースト終了直後に掛け直されている。
- **キャラの同定は必ずダメージ数値で行う**。録画 0021 を出撃画面のカードから別のキャラと読み違えた。`computeFixedSpecAttack` から予測値を出して突き合わせれば一意に決まる。
- **未確定**: バーストスキルダメージが会心するか。

## 経過

- 2026-09-26 まで冒頭の状態の行に書いていたもの: **完了（2026-09-22）**。レビュー 5 点を反映後、8 節の 9 点はいずれも推奨案で確定。実装での差分は 10 節、射撃場の実測は [verification.md](verification.md) Stage 6 節。`BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true` と `BURST_SKILL_FULL_BURST_BONUS = false` は実測で確定した
