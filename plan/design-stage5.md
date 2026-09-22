# Stage 5 設計書: 固定サイクルのフルバースト

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **案（レビュー待ち）**。第 7 節の「決めてほしいこと」に答えてもらってから実装に入る
- 関連: [design-stage4.md](design-stage4.md)、[verification.md](verification.md)、[roadmap.md](roadmap.md)
- 作成日: 2026-09-22

## Context

Stage 1〜4 は 2026-09-22 に完了した。calc v3 は 5 枠の通常攻撃に常時発動パッシブを乗せて合算するが、時間の概念はまだ無い（180 秒ずっと同じ DPS）。ロードマップの Stage 5 は「バーストサイクル長（手入力、既定 20 秒）とフルバースト時間を入力にし、サイクルを『フルバースト区間 / 非区間』の 2 区間に分けて期待値化する。バーストスキルの倍率ダメージ（1 回分）をサイクルごとに加算する。CT 短縮はスコープ外」。フルバースト時トリガーの持続バフ（「フルバースト時に N 秒間 攻撃力 +X%」）は Stage 6 で、Stage 5 では扱わない。

設計の前提となる現状（2026-09-22 に調べた事実）:

- **CDN 生データ**（`packages/core/.cache/ja/roledata-*.json`）には、いま正規化で捨てているバースト関連の数値がある。
  - `burst_duration`: フルバースト時間（1/100 秒）。202 体中 198 体が 1000（10 秒）、ミハラ・イサベル・ベスティーが 500（5 秒）、モダニアが 1500（15 秒）。
  - `ulti_skill_detail.skill_cooltime`: バーストの再使用時間（1/100 秒）。バースト III は 82 体すべて 4000（40 秒）。バースト II は 2000 が 47 体・4000 が 16 体・6000 が 2 体、バースト I は 2000 が 36 体・4000 が 17 体・6000 が 1 体。`skill_cooltime_list`（Lv 別）は全 202 体で Lv によらず一定。
  - `burst_apply_delay` は全員 1 で情報がない。
- **バースト III の説明文**（82 体）: 「最終攻撃力の X％の バーストスキルダメージ」型 16 体、「〜のダメージ」型 6 体、「バーストスキルダメージ + 追加ダメージ」7 体、「分配ダメージ」4 体（クイーン（真）、雪子、ファントム、クエンシー：EQ）、「持続ダメージ」3 体（マナ、ミハラ：BC、アークレンジャー・ブラック）、「防御力無視」少数、倍率ダメージなし（バフのみ）30 体。対象は「敵全体」29 体、「〜な敵 N 機」14 体で、**単体ボスならどちらも 1 ヒット**になる。
- **スキルダメージの式**（参考資料。実測で確かめる）:
  - 「このダメージは適正距離、コアダメージバフも基本的に参照しない」（深淵？ note）。Jgaram/nikke-calc も、距離ボーナスは通常攻撃だけ・コアは「コアヒット扱い」と書かれたスキルだけに掛け、会心はスキルにも掛ける。
  - フルバーストの +0.5 は Jgaram/nikke-calc では全ヒットに掛けるが、nikke-sim の modeling-priors は「バースト発動時の即時ダメージはフルバースト補正の対象外（フルバースト開始前のスナップショット）」としている。**両説あるので実測で決める**（7 節 1）。
  - 攻撃ダメージ▲は「有利コード／コア／クリティカル／適正距離／フルバースト／チャージ倍率と乗算の関係」（吟味.net）で、Stage 4 の実測（別枠の乗数）と整合する。スキルダメージにも掛かる（Jgaram/nikke-calc の ⑤）。
  - ore-game.com の検証メモ: 通常攻撃で「フルバーストかつクリティカルの場合は加算」（45,565 × 2.0）。フルバースト +0.5 は会心・コア・距離と同じ加算グループ。
- **core**: `computeDamage` は 1 区間の静的 DPS。`DamageResult.totalDamage = dps × durationSeconds`。`computeTeamDamage` は枠ごとに 1 回呼ぶだけ。`ConditionInput` に「フルバースト中か」はない。
- **calc**: `TeamState` は `slots` / `enemy` / `durationSeconds` / `fixedSpec`。編成共通の設定は `TeamSettingsForm`。永続化は `nikke-calc.team.v1`（欠落キーは既定値に落とす方針が Stage 4 で確立）。
- **スキル定義**: `formatVersion: 1` では `burst` は常に `unsupported`（`parseSkillDefinition` が弾く）。定義済み 5 体のバーストは、ノワール（バーストスキルダメージ 351.64%）、クイーン（真）（分配ダメージ 1421.69% + 1more 攻撃力▲）、マナ（持続ダメージ 396% × 1 秒間隔 10 秒）、エマ：TU（味方攻撃力▲ 10 秒 = Stage 6）、ウンファ：TU（武器変更 = 未対応）。

---

## 1. 用語と時間モデル

- **バーストサイクル**: バーストゲージが溜まってバースト I → II → III が発動し、フルバーストが終わるまでの 1 周期。長さ `cycleSeconds` は手入力（既定 20 秒）。CT 短縮・ゲージ蓄積速度は扱わず、**すべてのサイクルが同じ長さで、毎サイクル必ずフルバーストに到達する**と仮定する。
- **フルバースト区間**: 各サイクルの末尾 `fullBurstSeconds` 秒（既定 10 秒）。サイクル k（0 始まり）のフルバーストは `t = k × cycle + (cycle − fb)` に始まり `(k + 1) × cycle` に終わる。最初のフルバーストは 10 秒から（ゲージが溜まる時間）。戦闘時間 `duration` を超える部分は切り捨てる。**バーストスキルはフルバースト開始時刻に 1 回発動する**（バースト III が発動した瞬間にフルバーストが始まる）。
- **非区間**: それ以外。Stage 4 までの計算そのもの。
- **2 区間の期待値化**: 通常攻撃の発射サイクルはバーストと独立と仮定し（マガジン・リロードの位相は無視）、

  ```
  fbTotal   = Σ_k overlap([k·cycle + cycle − fb, (k+1)·cycle), [0, duration))
  normalDmg = triggersPerSecond × ( perTrigger × (duration − fbTotal) + perTriggerFB × fbTotal )
  perTriggerFB = perTrigger の boost.total を (1 + core + crit + distance + 0.5) にしたもの
  ```

  `fb = 0` なら Stage 4 と同一（稼働率 0%）、`fb = cycle` なら全時間フルバースト（稼働率 100%）で、ロードマップの検証条件をそのまま満たす。

- **バーストスキルダメージ**（Stage 5 の語彙）: 「最終攻撃力の X％の（バーストスキル）ダメージ」「追加ダメージ」（即時 1 ヒット）と「分配ダメージ」（単体ボスなら全額 1 ヒットと仮定。7 節 3）。式は

  ```
  burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100
             × (1 + 会心期待値 [+ 0.5 フルバースト補正: 7 節 1])   ← コア・距離は乗らない
             × (1 + Σ attackDamage) × 属性有利
  ```

  武器倍率・チャージ倍率は掛けない。攻撃力・会心・攻撃ダメージのバフは Stage 4 の常時パッシブ分だけ（Stage 6 のフルバースト時バフはまだ乗らない）。

- **発動回数**: 各サイクルで**バースト段階（I / II / III）ごとに 1 体だけ**発動する。同じ段階が複数いるときはローテーション（7 節 2）。バーストの再使用時間（CT）が明けていない枠は飛ばす。発動回数 × `burstHit` の合計を「バーストスキルダメージ」として通常攻撃に足す。
- **スコープ外（Stage 5 では「未対応」と表示する）**: 持続ダメージ（マナ）、防御力無視ダメージ、コアヒット扱いのスキルダメージ、バースト使用時・フルバースト時のバフ/デバフ（Stage 6）、武器変更（ウンファ：TU）、フルバーストタイム▼（ミハラ）、CT 短縮、ゲージ蓄積、バースト I/II のヒットによるゲージ回転の差。

---

## 2. データの追加（`fetch-data` / `normalize.ts`）

`CharacterData` に次を足す。生データの 1/100 秒を秒にする。

```ts
export type BurstParams = {
  /** バーストの再使用時間（秒）。ulti_skill_detail.skill_cooltime / 100。Lv によらず一定（全 202 体で確認） */
  cooldownSeconds: number;
  /** このニケがバースト III として発動したときのフルバースト時間（秒）。burst_duration / 100。通常 10 */
  fullBurstSeconds: number;
};
export type CharacterData = CharacterIndexEntry & {
  // …Stage 4 のまま
  burst: BurstParams;
};
```

- `formatVersion` は 1 のまま（フィールド追加は互換）。`data/characters/*.json` を `fetch-data` で再生成する（`.cache/` は main チェックアウト側にあるので、worktree では `.cache` をコピーするか `--refresh` なしで CDN から取り直す）。
- `normalize.test.ts` に `skill_cooltime: 4000 → 40`、`burst_duration: 1000 → 10` を足す。
- `CharacterIndexEntry`（一覧）には足さない。CT はキャラ詳細を読んでからで足りる。

---

## 3. スキル定義 JSON の拡張（`skills/types.ts`）

`formatVersion` は 1 のまま語彙を足す（既存 5 ファイルはそのまま有効）。`burst` スロットに限って `kind: 'burstDamage'` を許し、「`burst` は常に `unsupported`」の規則を外す。

```ts
export type BurstDamageType = 'skill' | 'distributed';

export type BurstDamageEffect = {
  kind: 'burstDamage';
  /** 「最終攻撃力の {NN}％の…ダメージ」の NN。値は % 表記。100 で割るのは resolveBurstDamage の責務 */
  ref: number;
  /** skill = バーストスキルダメージ / ダメージ / 追加ダメージ（即時 1 ヒット）、distributed = 分配ダメージ（単体ボスでは全額と仮定。UI に近似バッジ） */
  damageType: BurstDamageType;
  /** 常に満たすとみなした条件（「対象が風圧コードなら」等）。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

export type SkillEffect = PassiveEffect | BurstDamageEffect;
export type SkillEntry = { support: SkillSupport; effects: SkillEffect[]; notes?: LocalizedText[] };
```

規則（`parseSkillDefinition` で検証）:

- `burstDamage` は `burst` スロットにだけ書ける。`skill1` / `skill2` に書いたら `Error`。
- `burst` スロットに `passive` は書けない（バースト使用時のバフは Stage 6 の別 kind になる）。
- 1 つの `burst` に `burstDamage` を複数書ける（「バーストスキルダメージ + 追加ダメージ」型。ミハラの 399.6% + 266.4%）。合計が 1 回の発動分。
- 「敵全体」「最終攻撃力が最も高い敵 N 機」はどちらも単体ボスに 1 ヒットなので、対象は書かない。
- 説明文に直書きの数値（「1more：」等）は Stage 4 と同じく参照しない。

ノワール（271）の `burst` の例:

```jsonc
"burst": {
  "support": "partial",
  "effects": [{ "kind": "burstDamage", "ref": 1, "damageType": "skill" }],
  "notes": [
    { "ja": "SG 味方の命中率・阻止部位の攻撃ダメージ（10 秒 / 30 秒維持）は Stage 6", "en": "…" }
  ]
}
```

### 3.1 Stage 5 で定義（更新）するキャラ

既存 5 体のバーストを埋め、バースト III の単体ダメージを 1 体足す。**どれを定義するかは 7 節 4 で決める。**

| resourceId | ニケ                       | 段階 / CT | Stage 5 で扱える効果                                | 扱えない効果（notes）                                          |
| ---------- | -------------------------- | --------- | --------------------------------------------------- | -------------------------------------------------------------- |
| 271        | ノワール                   | III / 40s | 敵全体に 351.64% のバーストスキルダメージ → `skill` | SG 味方の命中率▲・阻止部位の攻撃ダメージ▲（Stage 6）           |
| 870        | クイーン（真）             | III / 40s | 敵全体に 1421.69% の分配ダメージ → `distributed`    | 対象が風圧なら 1more 攻撃力▲（Stage 6）                        |
| 290        | マナ                       | III / 40s | —（`unsupported`）                                  | 持続ダメージ 396% × 1 秒間隔 × 10 秒、自分に持続ダメージ▲      |
| 93         | エマ：タクティカル・アップ | I / 20s   | —（`unsupported`）                                  | 味方全体に発動者基準攻撃力▲ 10 秒（Stage 6）、環境コントロール |
| 95         | ウンファ：TU               | II / 20s  | —（`unsupported`）                                  | 武器変更（1 発のみ）、受けるダメージ▲ 10 秒（Stage 6）         |
| 10         | ラピ                       | III / 40s | 最終攻撃力が最も高い敵 1 機に 657.72% → `skill`     | 自分に攻撃力 60.75%▲ 10 秒（Stage 6）                          |
| 170        | プリバティ                 | III / 40s | 敵全体に 457.87% → `skill`                          | 気絶（ボスには無効）                                           |

発動回数の検証用に、バースト I/II で火力に触らないニケ（攻撃力・ダメージ・受けるダメージ・会心・命中率・弾数に一切触れない説明文）を挙げておく: **I**: エーテル、I-DOLL・オーシャン、ミサト、サクラ、ノイズ、ティア、ソラ、レーベル、パスカル、ラム、クレア、メアリー、アビスタ、ソリン：フロストチケット。**II**: デルタ、ノア、ソルジャーF.A.、マルチャーナ、シラツル。

---

## 4. core の追加

Stage 4 の API は壊さない。`computeDamage` は 1 区間の関数のまま `fullBurst` フラグが増えるだけで、既存の呼び出し（フラグ省略）は結果不変。

### 4.1 フルバースト区間の通常攻撃（`damage.ts`）

- `ConditionInput` に `fullBurst?: boolean`（省略 false）を足す。true なら `boost.fullBurst = 0.5` を加算グループに足す。
- `DamageResult.boost` に `fullBurst: number`（0 か 0.5）を足す。`total = 1 + core + crit + distance + fullBurst`。
- `FULL_BURST_BOOST = 0.5` を定数で公開する。

### 4.2 バーストの時刻表（`burstCycle.ts`、純関数）

```ts
export type BurstCycleInput = {
  /** サイクル長（秒）。> 0 */
  cycleSeconds: number;
  /** フルバースト時間（秒）。0 ≤ fb ≤ cycle */
  fullBurstSeconds: number;
};
export const DEFAULT_BURST_CYCLE: BurstCycleInput = { cycleSeconds: 20, fullBurstSeconds: 10 };

export type BurstCandidate = { burstStep: BurstStep; cooldownSeconds: number } | null; // null = 空枠

export type BurstSchedule = {
  /** 各サイクルのフルバースト開始時刻（duration 未満のものだけ） */
  fullBurstStarts: number[];
  /** duration 内のフルバースト時間の合計（秒） */
  fullBurstSecondsTotal: number;
  /** 枠ごとのバースト発動時刻 */
  activations: number[][];
  /** 段階 I/II/III のどれかを埋められなかったサイクル数（0 なら毎サイクル成立） */
  unfilledCycles: Record<'Step1' | 'Step2' | 'Step3', number>;
};

export function scheduleBursts(
  candidates: readonly BurstCandidate[],
  cycle: BurstCycleInput,
  durationSeconds: number,
): BurstSchedule;
```

アルゴリズム（決定的。枠の順序にだけ依存）:

1. `k = 0, 1, …` について `start = k × cycle + (cycle − fb)`。`start ≥ duration` で終了。
2. 段階 I → II → III の順に、その段階の候補（`burstStep` が一致する枠。`AllStep` は 7 節 2 の扱い）のうち **CT が明けている**（`start − 前回発動 ≥ cooldownSeconds`、未発動なら常に可）枠から、**前回発動が最も古い枠**（同点なら枠番号が小さい方）を 1 体選び `activations[slot].push(start)`。誰も選べなければ `unfilledCycles[step]++`（フルバースト自体は起きると仮定して続行。UI に注記）。
3. `fullBurstSecondsTotal += min(start + fb, duration) − start`。

`cycle = 20`、`fb = 10`、`duration = 180` なら開始時刻は 10, 30, …, 170 の 9 回、合計 90 秒。バースト III が 1 体（CT 40 秒）なら発動は 10, 50, 90, 130, 170 の 5 回で、残り 4 サイクルは `unfilledCycles.Step3 = 4`。バースト III が 2 体なら交互に 5 回・4 回。

### 4.3 バーストスキルダメージ（`skills/burstDamage.ts`）

```ts
export type ResolvedBurstDamage = {
  source: { resourceId: number; skill: 'burst'; name: LocalizedText };
  damageType: BurstDamageType;
  /** X/100。3.5164 など */
  multiplier: number;
  assumes?: LocalizedText;
};
/** burst スロットの burstDamage 効果を Lv の数値に解決する。unsupported なら空 */
export function resolveBurstDamage(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedBurstDamage[];

/** 実測で決める（7 節 1）。false = バースト発動時の即時ダメージにフルバースト +0.5 は乗らない */
export const BURST_SKILL_FULL_BURST_BONUS = false;

export type BurstHitInput = {
  attack: number; // バフ後
  enemy: EnemyInput;
  crit: CharacterData['crit']; // バフ後
  attackDamageMultiplier: number;
  elementMultiplier: number;
  effects: ResolvedBurstDamage[];
};
export type BurstHitResult = {
  baseHit: number;
  boost: { crit: number; fullBurst: number; total: number };
  /** 効果ごとの 1 発動あたり期待ダメージ */
  perEffect: { effect: ResolvedBurstDamage; expected: number }[];
  /** 1 発動あたりの合計 */
  perActivation: number;
};
export function computeBurstHit(input: BurstHitInput): BurstHitResult;
```

### 4.4 編成への適用（`team.ts`）

`TeamInput` に `burstCycle?: BurstCycleInput | null` を足す。省略・`null` は「バーストなし」= Stage 4 と同一の結果（不変条件）。

```ts
export type TeamSlotResult = {
  // …Stage 4 のまま（result は非区間の DamageResult。durationSeconds = duration − fbTotal）
  /** フルバースト区間の通常攻撃。バーストなしなら null */
  fullBurstResult: DamageResult | null; // durationSeconds = fbTotal
  burst: {
    activations: number[];
    hit: BurstHitResult | null; // 定義がない・unsupported なら null
    totalDamage: number; // activations.length × hit.perActivation
  };
  /** 通常攻撃（両区間）+ バーストスキル */
  totalDamage: number;
  dps: number; // totalDamage / duration
  share: number;
};
export type TeamResult = {
  // …
  schedule: BurstSchedule | null;
};
```

`computeTeamDamage` の処理: Stage 4 の手順で `buffs` を作った後、(1) `scheduleBursts` で時刻表を作る、(2) `computeDamage` を非区間・フルバースト区間の 2 回呼ぶ（`condition.fullBurst` と `durationSeconds` だけ違う）、(3) 定義に `burstDamage` があれば `computeBurstHit` を呼び、`activations.length` を掛ける、(4) 合計する。`share` と合計は新しい `totalDamage` で取る。

不変条件（テストで固定）: `burstCycle` なしは Stage 4 と同一。`fb = 0` は Stage 4 の通常攻撃 + バーストスキルだけ。`fb = cycle` は全区間が `boost + 0.5`。バースト定義のない枠はフルバースト区間の増分だけ受ける。

---

## 5. calc の変更

### 5.1 状態（`apps/calc/src/team.ts`）

- `TeamState` に `burstCycle: { enabled: boolean; cycleSeconds: number; fullBurstSeconds: number }` を足す。既定 `{ enabled: true, cycleSeconds: 20, fullBurstSeconds: 10 }`。
- `TeamAction` に `{ type: 'setBurstCycle'; burstCycle }` を足す。
- `parseTeamState` は `burstCycle` 欠落を既定値に落とす（保存キーは `v1` のまま）。`cycleSeconds ≤ 0`、`fullBurstSeconds < 0`、`fb > cycle` は null。
- スペック固定は関係しない（射撃場もバーストは撃てる）。

### 5.2 UI

```
TeamSettingsForm
  └ [バーストサイクル] 有効チェック / サイクル長（秒、既定 20）/ フルバースト時間（秒、既定 10）
      編成のバースト III の burst_duration が入力と違うときは「ミハラは 5 秒」の注記
SlotCard
  ├ スキルセクションのバースト行: 対応バッジに「1 発動 X ダメージ」「発動 N 回（CT 40 秒）」
  └ 小結果: 通常攻撃 / バーストスキル / 合計
TeamBreakdown
  ├ 表の列: 攻撃力（素）/ 攻撃力（バフ後）/ 通常攻撃 / バースト回数 / バーストスキル / 総ダメージ / 寄与率
  ├ 段階が埋まらないサイクルがあれば「バースト III が 4 サイクルで発動できません（CT 40 秒 > サイクル 20 秒）」
  └ ResultPanel: 内訳を「非区間 / フルバースト区間」の 2 列（boost の行に「フルバースト +0.5」）、
      その下に「バーストスキル」の内訳（倍率・会心期待値・攻撃ダメージ・1 発動・回数・合計）
```

`分配ダメージ` は「近似」バッジ（単体ボスでは全額と仮定）。`unfilledCycles` は「近似」ではなく注記（ユーザーがサイクル長を変えるための情報）。

---

## 6. テスト・検証

### 6.1 自動テスト

- core `scripts/normalize.test.ts`: `burst.cooldownSeconds` / `fullBurstSeconds` の変換。
- core `src/__tests__/burstCycle.test.ts`
  - 20/10/180 で開始時刻 10, 30, …, 170、合計 90 秒。duration が端数（175）なら最後は 5 秒。`fb = 0` で 0 秒・開始時刻は残る。`fb = cycle` で全時間。
  - III 1 体（CT 40）は 5 回で `unfilledCycles.Step3 = 4`。III 2 体は交互で 5 回・4 回。I（CT 20）は 9 回。CT 60 の II は 10, 70, 130 の 3 回。
  - 空枠・段階なしは飛ばす。`AllStep` の扱い（7 節 2）。`cycleSeconds ≤ 0`、`fb > cycle` は RangeError。
- core `src/__tests__/damage.test.ts`（追加）: `fullBurst: true` で `boost.total` が +0.5、省略は Stage 4 と同一。
- core `src/skills/__tests__/burstDamage.test.ts`: `resolveBurstDamage` が `burst` の `ref` を Lv で解決し 100 で割る。`computeBurstHit` が武器倍率・コア・距離を掛けず、会心と攻撃ダメージ・属性を掛ける。`BURST_SKILL_FULL_BURST_BONUS` の真偽で `boost.fullBurst` が変わる。複数効果の合計。
- core `src/skills/__tests__/resolve.test.ts`（追加）: `parseSkillDefinition` が `burstDamage` を `skill1` に書いたもの、`burst` に `passive` を書いたもの、`damageType` 不正を `Error` にする。
- core `src/__tests__/team.test.ts`（追加）: `burstCycle` なし = Stage 4。`fb = 0` / `fb = cycle` の極端値。バースト定義ありの枠の `burst.totalDamage = 回数 × perActivation`。`share` が新しい合計で計算される。
- core `definitions.test.ts`: `burst` の `burstDamage` の `ref` が存在する。`unsupported` な `burst` に `notes` がある。
- calc `team.test.ts`: `setBurstCycle`、欠落の既定値、範囲外の null。

### 6.2 手動確認（射撃場・スペック固定・1 ヒット実測）

Stage 2-A / 4 と同じ方法（HUD 総ダメージの差分と的の上の数値）。自動バースト ON で撮り、HUD の「FULL BURST」表示と時刻も読む。

| 確認したいこと                                            | 編成（案）                                                         | 予測                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通常攻撃のフルバースト +0.5                               | クルミ（AR、スキルなし）+ I: エーテル + II: デルタ + III: ノワール | クルミの非コア非会心が 1.3x → 1.8x に、コア会心が 2.8x → 3.3x に切り替わる（Stage 2-A の x = 10,798 相当。スペック固定値で再計算）。ノワールの S1 で +16,881 が乗る点は Stage 4 どおり              |
| バーストスキルダメージ（`skill`）とフルバースト補正の有無 | 上と同じ録画のノワール                                             | 攻撃力 136,777.4 → `(136,677.4) × 3.5164 × {1, 1.5}` = 480,612 / 720,919。**+0.5 が乗るなら** `× {1.5, 2.0}` = 720,919 / 961,225。会心の有無で値が二重に読めるので、複数回の発動で分布を見る        |
| 分配ダメージ（`distributed`、単体なら全額）               | クイーン（真）+ I/II（火力に触らない 2 体）                        | `119,796 × 14.2169 × (1 + 0.30) × {1, 1.5}` = 2,214,066 / 3,321,099（+0.5 が乗るなら 3,321,099 / 4,428,132）。S1 の戦闘開始時攻撃力▲（15 秒）が切れてから                                           |
| CT とサイクル長                                           | 上の録画の時刻                                                     | 1 回目のフルバースト開始が 10 秒前後、2 回目が 30 秒前後、III 1 体なら 3 回目（50 秒）は III の CT 40 秒明けで発動する。ずれれば `DEFAULT_BURST_CYCLE` と「末尾 fb 秒」の置き方（7 節 5）を較正する |
| 極端値                                                    | 任意                                                               | UI で `fb = 0` にすると Stage 4 の総ダメージ + バーストスキルだけ、`enabled` OFF で Stage 4 と同一                                                                                                  |

会心期待値・攻撃ダメージ▲がバーストスキルに掛かるかは、クイーン（真）（攻撃ダメージ +30%）の 1 発動で `× 1.3` の有無として同時に確認できる。

### 6.3 完了条件

- 6.1 のテストと CI（format / lint / typecheck / test / build）が緑。
- 6.2 のうち「通常攻撃の +0.5」「バーストスキルダメージ（skill）」の 2 つは実測で一致し、`BURST_SKILL_FULL_BURST_BONUS` の真偽が決まっている。`distributed` は所持キャラ次第。
- [roadmap.md](roadmap.md) の Stage 5 を完了に更新し、[verification.md](verification.md) に Stage 5 節を追加。[requirements.md](requirements.md) 5.1 の式に「フルバースト(0.5) はスキルダメージには（乗る / 乗らない）」を追記。

---

## 7. 決めてほしいこと（推奨付き）

1. **バーストスキルダメージにフルバースト +0.5 を乗せるか** — 推奨: **乗せない**（`BURST_SKILL_FULL_BURST_BONUS = false`）。nikke-sim は「バースト発動時の即時ダメージはフルバースト開始前のスナップショット」とし、深淵？ note も「使用時点」の計算と書く。Jgaram/nikke-calc は乗せているので両説あり、定数 1 つで切り替えられるようにしておいて 6.2 の実測で確定する。
2. **同じ段階が複数いるとき・`AllStep` の扱い** — 推奨: 段階ごとに毎サイクル 1 体、CT が明けた中で前回発動が最も古い枠（ローテーション）。`AllStep`（レッドフード）は「その段階の専任がいない最も低い段階」に充てる。代替: CT を無視して全員毎サイクル 1 回（ロードマップの当初案。III 1 体・20 秒サイクルで 2 倍に過大評価するので勧めない）。
3. **分配ダメージを Stage 5 に含めるか** — 推奨: 含める（`damageType: 'distributed'`、単体ボスでは全額と仮定して「近似」バッジ）。クイーン（真）で実測できる。代替: 未対応。
4. **定義するキャラ** — 推奨: 既存 5 体のバーストを埋める（ノワール・クイーン（真）が `skill` / `distributed`、マナ・エマ：TU・ウンファ：TU は `unsupported` + notes）+ **ラピ**（バースト III 単体ダメージの最も単純な例。所持していれば）。プリバティは任意。所持キャラを教えてほしい。
5. **フルバーストの位置** — 推奨: 各サイクルの**末尾** fb 秒（最初のフルバーストは 10 秒から。ゲージが溜まる時間を先に置く）。代替: サイクル先頭（0 秒から）。180 秒が 20 の倍数なので合計時間は同じで、違いは「最後のサイクルが途中で切れるとき」と「バーストスキルの発動時刻」だけ。録画の時刻で較正する。
6. **フルバースト時間の入力** — 推奨: 手入力（既定 10 秒）。編成のバースト III の `burst_duration` が違うとき（ミハラ・イサベル・ベスティー 5 秒、モダニア 15 秒）は注記だけ出す。代替: バースト III の値から自動（III が 2 体で値が違うときの規則が要る）。
7. **持続ダメージ（マナ）** — 推奨: Stage 5 では未対応（`notes` に書く）。「1 秒間隔 × 10 秒」の tick 数（10 か 11 か）と持続ダメージ▲の扱いが未検証で、段階 C（発射数・条件トリガー）と一緒に扱う。代替: tick 数 = 維持秒 / 間隔 で即時ダメージ扱い。

---

## 8. リスク・留意点

- **「毎サイクル必ずフルバースト」の仮定**: III が 1 体で CT 40 秒なら実際のサイクルは 40 秒になる。Stage 5 はサイクル長を手入力にしているので、`unfilledCycles` を UI に出してユーザーが直せるようにする。CT 短縮（リター等）は Stage 8 以降。
- **発射サイクルとの独立性**: フルバースト区間の通常攻撃を「稼働率 × DPS」で期待値化しているので、フルバースト 10 秒がリロード中に重なる分は見ない。sim v1（Stage 7）で差を見る。
- **バーストスキルダメージの式は未実測**: コア・距離が乗らないこと、会心・攻撃ダメージが乗ることは参考資料の一致で置いているが、6.2 で確かめるまでは「参考資料どおり、未実測」。フルバースト +0.5 は両説あるので定数で逃がした。
- **分配ダメージの単体ボス仕様**: 「敵の数で除算」が単体で全額になるかは実測で決める。パーツ持ちボスでの分配は Stage 5 の対象外。
- **`burst_duration` の意味**: 「そのニケがバースト III として発動したときのフルバースト時間」と解釈している（ミハラの「フルバーストタイム 5 秒▼」と 500 が整合）。バースト I/II の 1000 は使わない。
- **説明文の更新**: Stage 4 と同じく `checkedAt` と `definitions.test.ts` で検知する。
- **Stage 6 への拡張余地**: `scheduleBursts` が返す発動時刻・フルバースト区間があれば、「フルバースト時に N 秒間」型のバフは区間分割（開始時刻 + 持続時間）で静的に置ける。`BuffTotals` を区間ごとに作り直す設計は Stage 4 で済んでいる。
