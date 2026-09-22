# Stage 3 設計書: calc v2 — 5 人編成の合算

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **承認済み（2026-09-22）**。第 6 節の 4 点はいずれも推奨案で確定。実装はこの文書に従う
- 関連: [design-stage1-2.md](design-stage1-2.md)、[verification.md](verification.md)、[roadmap.md](roadmap.md)
- 作成日: 2026-09-22

## Context

Stage 1（core 最小版）と Stage 2（calc v1: 通常攻撃のみの静的 DPS）は 2026-09-22 に完了した（[verification.md](verification.md)）。ロードマップの Stage 3 は「Stage 2 の計算を 5 体分行い合算し、キャラ別内訳と合計を出す」。スキル・バースト・バフは引き続き扱わない。

設計の前提となる現状:

- **core**: `computeDamage` は 1 体分の純関数。入力の `ConditionInput` に `durationSeconds` が含まれているが、編成では戦闘時間は共通にしたい。`computeFixedSpecAttack` / `fixedSpecGrowth` で射撃場スペック固定の攻撃力が出せる。
- **calc**: `App.tsx` の `useState` 群が単一キャラ前提。`CharacterForm`（検索 + `size=8` のリスト）、`EnemyForm`（敵と条件が同居）、`ResultPanel`（1 体の内訳）。スペック固定トグルは 1 体に対して働く。
- **テスト**: core 49 件が緑。calc はテスト 0 件（`passWithNoTests`）。calc の vitest は `environment: node` なので、React に依存しない純関数ならそのままテストできる。
- **データ**: 202 体（AR 36 / SMG 31 / SR 39 / RL 42 / SG 28 / MG 26）。`index.json` に `burstStep` がある（編成カードの表示に使える）。
- **Stage 2 の積み残し**: SG の発射サイクルは未計測（蓄積モデルでも切り上げでも 40f で同じなので Stage 3 の妨げにはならない）。

---

## 1. 用語と範囲

- **編成（team）**: 最大 5 枠（`TEAM_SIZE = 5`）。空枠を許す。**同じニケの重複は不可**（ゲーム仕様）。
- **枠ごとの入力**: ニケ、育成 3 項目（レベル・限界突破・コア）、枠条件（コア命中率・距離ボーナス・フルチャージ）。
- **編成共通の入力**: 敵（防御力・属性・コア有無）、戦闘時間、スペック固定。
- **出力**: 枠ごとの `DamageResult`（Stage 2 と同じ内訳）、編成の合計 DPS・合計総ダメージ、各枠の寄与率。
- **スコープ外**: スキル・バースト・バフ（Stage 4〜）、バーストステップ構成の妥当性チェック（Stage 5 で扱う。v2 はカードに表示だけする）、枠の並び順の意味（合算には無関係）、味方間の相互作用すべて。

---

## 2. core の追加（`packages/core/src/team.ts`）

Stage 2 の API は変えない（`ConditionInput` はそのまま）。編成用の型と純関数を 1 ファイル追加し、`index.ts` から export する。

```ts
export const TEAM_SIZE = 5;

/** 枠ごとの条件。戦闘時間は編成共通なので含まない */
export type SlotCondition = Omit<ConditionInput, 'durationSeconds'>;

export type TeamSlotInput = {
  character: CharacterData;
  growth: GrowthInput;
  condition: SlotCondition;
  /** スペック固定などで戦闘中攻撃力を直接指定する場合 */
  attackOverride?: number;
};

export type TeamInput = {
  /** 長さ 1..TEAM_SIZE。null は空枠 */
  slots: (TeamSlotInput | null)[];
  enemy: EnemyInput;
  durationSeconds: number;
  model?: WeaponModel;
};

export type TeamSlotResult = {
  index: number;
  character: CharacterData;
  result: DamageResult;
  /** 総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
};

export type TeamResult = {
  slots: (TeamSlotResult | null)[];
  filledCount: number;
  totalDps: number;
  totalDamage: number;
};

export function computeTeamDamage(input: TeamInput): TeamResult;
```

処理:

- 各枠について `computeDamage({ character, growth, enemy, condition: { ...slot.condition, durationSeconds }, model, attackOverride })` を呼ぶ。
- `totalDps` / `totalDamage` は枠 0 から順に加算する（加算順を固定し、テストの「個別の和と一致」を再現可能にする）。
- `share = result.totalDamage / totalDamage`（`totalDamage === 0` なら 0）。

入力検証（`RangeError`）:

- `slots.length` が 1..`TEAM_SIZE` の範囲外。
- 同じ `resourceId` が 2 枠以上にある。
- `durationSeconds < 0`（既存の `computeDamage` の検証に任せる）。

不変条件（テストで固定）: `TeamResult.totalDamage` は各枠に `computeDamage` を個別に呼んだ `totalDamage` の和と一致する。1 枠だけの編成は `computeDamage` の結果と同一。

---

## 3. calc の変更

### 3.1 状態（`apps/calc/src/team.ts`、React 非依存の純関数）

`useState` の寄せ集めから `useReducer` に移し、reducer 本体を React に依存しないファイルに置く（node 環境の vitest でそのままテストできる）。

```ts
export type SlotState = {
  resourceId: number | null;
  growth: GrowthInput; // 既定 { level: 200, grade: 3, core: 0 }。キャラ選択時に上限へ clamp
  condition: SlotCondition; // 既定 { coreHitRate: 1, distanceBonus: true, fullCharge: true }
};

export type TeamState = {
  slots: SlotState[]; // 長さ TEAM_SIZE 固定
  enemy: EnemyInput; // 既定 射撃場プリセット（防御 100・属性なし・コアあり）
  durationSeconds: number; // 既定 180
  fixedSpec: boolean; // 編成共通
};

export type TeamAction =
  | { type: 'selectCharacter'; index: number; resourceId: number }
  | { type: 'clearSlot'; index: number }
  | { type: 'setGrowth'; index: number; growth: GrowthInput }
  | { type: 'setSlotCondition'; index: number; condition: SlotCondition }
  | { type: 'setEnemy'; enemy: EnemyInput }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setFixedSpec'; fixedSpec: boolean }
  | { type: 'replace'; state: TeamState }; // 永続化からの復元

export function teamReducer(state: TeamState, action: TeamAction): TeamState;
export const INITIAL_TEAM_STATE: TeamState;
```

reducer の規則:

- `selectCharacter`: 他の枠に同じ `resourceId` があれば **何もしない**（UI 側でも選択肢から除外するので二重防御）。
- `setFixedSpec(true)`: v1 と同じく敵防御を 100、戦闘時間を 90 に切り替える。OFF にしても戻さない（v1 と同じ）。
- 育成値の clamp はキャラデータが必要なので reducer では行わず、派生値の計算時に既存の `clampGrowth` 相当で行う（v1 と同じ方針）。

### 3.2 データ読み込み（`apps/calc/src/useCharacterCache.ts`）

`Map<resourceId, CharacterData>` のキャッシュと、枠ごとの「読み込み中 / エラー」を返すフック。同時に複数枠を読み込むので、v1 の「選択中の id と一致するデータだけ使う」ガードをキャッシュ照合に置き換える。一度選んで外したキャラは再取得しない。

### 3.3 派生値

- 枠ごとに `character` がキャッシュに揃っているものだけ `TeamSlotInput` を作る。読み込み中の枠は `null` として合計から除外し、その枠に「読み込み中」を出す。
- `fixedSpec` が ON の枠は `growth = fixedSpecGrowth(character)`、`attackOverride = computeFixedSpecAttack(character).attack`。
- `computeTeamDamage` を `useMemo` で呼び、`RangeError` は v1 と同じく `{ ok: false, error }` に包んで表示する。

### 3.4 UI 構成

```
header        NIKKE calc v2 — 5 人編成の通常攻撃合算（Stage 3）
[編成共通]     TeamSettingsForm: 防御力 / 属性 / コアあり / 戦闘時間 / スペック固定
[枠 1〜5]      SlotCard × 5（グリッド。900px 以上で 2 列、1300px 以上で 3 列）
  ├ CharacterPicker: 検索ボックス + <select>（1 行）。他枠で選択中のニケは選択肢から除外。「外す」ボタン
  ├ メタ行: 武器 / 属性 / クラス / バーストステップ / 装弾数 / リロード / 武器倍率
  ├ 育成 3 項目（1 行に横並び。スペック固定時は disabled）
  ├ 枠条件: コア命中率 / 距離ボーナス（bonusRange なしは disabled）/ フルチャージ（チャージ武器のみ）
  ├ 注記バッジ（未対応 / 近似。v1 の notes をそのまま）
  └ 小結果: DPS / 総ダメージ / 寄与率
[内訳]         TeamBreakdown: 表（枠 / ニケ / 攻撃力 / 1 トリガー / 秒間トリガー / DPS / 総ダメージ / 寄与率）+ 合計行
               各行は <details> で展開でき、中に既存 ResultPanel（1 体の内訳）を出す
```

コンポーネントの対応:

| v1              | v2                                                                             |
| --------------- | ------------------------------------------------------------------------------ |
| `CharacterForm` | `SlotCard`（枠 1 つ分）+ `CharacterPicker`（検索 + select を分離）             |
| `EnemyForm`     | `TeamSettingsForm`（敵・戦闘時間・スペック固定）と `SlotCard` 内の枠条件に分割 |
| `ResultPanel`   | そのまま残し、`TeamBreakdown` の行の展開内容として再利用                       |
| （なし）        | `TeamBreakdown`（表 + 合計行）                                                 |

### 3.5 永続化（推奨: 入れる）

`localStorage` に `TeamState` を保存する（キー `nikke-calc.team.v1`）。読み戻し時は形を検証し（`slots` の長さ、数値の型、`resourceId` が index に存在するか）、不正なら初期値に落とす。理由: 5 枠分の育成値を毎回入れ直すのは手間で、Stage 4 以降はスキル Lv も増える。要件の「状態ライブラリなし」は維持し、`useEffect` で保存するだけにする。検証は純関数 `parseTeamState(json, index)` に切り出してテストする。

---

## 4. テスト・検証

### 4.1 自動テスト

- core `src/__tests__/team.test.ts`
  - 合計 = 各枠に `computeDamage` を個別に呼んだ和（`toBeCloseTo`）。
  - 空枠は無視され、全枠空なら合計 0・`filledCount` 0・`share` 0。
  - 寄与率の合計が 1（枠が 1 つ以上あるとき）。
  - 1 枠だけの編成は `computeDamage` と同一の `DamageResult`。
  - 同じ `resourceId` の重複で `RangeError`。`slots.length` 6 で `RangeError`。
  - `attackOverride` が枠ごとに独立して効く。
- calc `src/team.test.ts`（node 環境、React 不要）
  - `selectCharacter` の重複は無視される。`clearSlot` で `resourceId` が null になり育成値は保持される。
  - `setFixedSpec(true)` で敵防御 100・戦闘時間 90。
  - `parseTeamState` が不正 JSON・長さ違い・存在しない `resourceId` を初期値に落とす。

### 4.2 手動確認（ブラウザ、`npm run dev`）

- 5 体を入力し、内訳表の合計が各行の和と一致する（表示桁での一致）。
- 1 枠を外すと合計がその行の分だけ減る。
- スペック固定 ON で全枠の攻撃力ラベルが「スペック固定」に変わり、敵防御 100・90 秒になる。
- 他枠で選択中のニケが選択肢に出ない。
- リロードしても編成が復元される（永続化を入れた場合）。
- 幅 375px（スマホ）で横スクロールが出ない。
- 確認時のスクリーンショットは PR に添付する（`plan/captures/` はゲーム映像の証拠用なので混ぜない）。

### 4.3 射撃場の実測は使わない

5 体で射撃場に入ると味方のスキル・バフが通常攻撃に乗るため、「通常攻撃のみ」のモデルと比較できない。Stage 3 の検証は合算の数学的な正しさ（4.1）に限る。実測は Stage 2-C と同じ「±10% の目安」に留め、較正には使わない。

### 4.4 完了条件

- 4.1 のテストと CI（format / lint / typecheck / test / build）が緑。
- 4.2 を確認済み。
- [roadmap.md](roadmap.md) の Stage 3 を完了に更新し、[verification.md](verification.md) の Stage 3 節に確認結果を記録。

---

## 5. 実装手順（各ステップに検証コマンド）

1. core `team.ts` + `team.test.ts` → `npm test`。
2. calc `team.ts`（reducer・初期値・`parseTeamState`）+ `team.test.ts` → `npm test`。
3. calc `useCharacterCache.ts` → `npm run typecheck`。
4. UI の分解: `CharacterPicker` → `SlotCard` → `TeamSettingsForm` → `TeamBreakdown`。`App.tsx` を `useReducer` 化。旧 `CharacterForm` / `EnemyForm` は削除 → `npm run dev` で 1 体入力が v1 と同じ数値になることを確認。
5. 永続化（`useEffect` で保存、起動時に `parseTeamState`）。
6. `styles.css`（カードグリッド、育成 3 項目の横並び、内訳表）。
7. `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`。ブラウザで 4.2 を確認しスクリーンショットを取る。
8. roadmap / verification を更新し、`claude/` ブランチから PR を作る（Stage 1・2 と同じ流れ）。

---

## 6. 決めてほしいこと（推奨付き）

1. **永続化（localStorage）を Stage 3 に含めるか** — 推奨: 含める。小さく、Stage 4 以降で入力項目が増えるほど効く。
2. **ニケ選択 UI** — 推奨: 枠ごとに「検索ボックス + 1 行の select」。代替は「共通のピッカーパネルを開くボタン」（画面は締まるが実装が増える）。
3. **重複選択の扱い** — 推奨: 他枠で選択中のニケは選択肢から除外し、core は例外を投げる（二重防御）。代替の「選ぶと元の枠から移動する」は挙動が読みにくい。
4. **スペック固定を編成共通にするか** — 推奨: 共通。射撃場の仕様がそうであり、枠ごとに切り替える理由がない。

---

## 7. リスク・留意点

- **画面の縦長化**: フォームが 5 個並ぶ。カードを 2〜3 列のグリッドにし、育成 3 項目を 1 行に収めて対処する。
- **Stage 4 への拡張余地**: スキル Lv 入力（3 つ）と「未対応」表示が枠に増える。`SlotCard` は「ニケ / 育成 / 条件 / 結果」のセクション構造にして、セクションの追加で済むようにする。
- **読み込み中の枠**: 合計から除外すると一瞬合計が小さく見える。内訳の合計行に「読み込み中の枠があります」を出す。
- **`ConditionInput` の二重定義**: `SlotCondition` を `Omit` で導出するので、Stage 2 の型を触らずに済む。将来 `ConditionInput` を分割したくなったら、そのとき `computeDamage` の引数も一緒に整理する。
