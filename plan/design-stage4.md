# Stage 4 設計書: スキルモデル段階 A — 常時発動パッシブ

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **承認済み（2026-09-22）**。第 7 節の 6 点はいずれも推奨案で確定
- 関連: [design-stage3.md](design-stage3.md)、[verification.md](verification.md)、[roadmap.md](roadmap.md)
- 作成日: 2026-09-22

## Context

Stage 1〜3 は 2026-09-22 に完了した。calc v2 は 5 枠の編成を合算するが、スキル・バフは一切扱っていない。ロードマップの Stage 4 は「無条件・常時の自己/味方ステータス上昇だけを扱うスキル DSL の最小語彙を設計し、数体分の定義を書き、calc に反映する」。バースト（Stage 5）、フルバースト時トリガー（Stage 6）、発射数トリガー・HP 条件（段階 C）は扱わない。

設計の前提となる現状:

- **データ**: 202 体の `CharacterData.skills` に `skill1` / `skill2` / `burst` の説明文（ja/en）と `values` が入っている。`values[NN-1]` が説明文の `{description_value_NN}` に対応し、各要素は Lv1〜10 の 10 要素の文字列配列（全 202 体で確認済み。文字列はすべて `"20.1"` のような数値表記で、単位は説明文側に「％」「秒」「発」として書かれている）。
- **core**: `computeDamage` は攻撃力を `computeStat` または `attackOverride` から取り、`boost = 1 + core + crit + distance`、`chargeMultiplier = fullChargeDamage`、`element` を掛ける。バフを差し込む口はない。`computeTeamDamage` は枠ごとに独立に `computeDamage` を呼ぶだけで、枠間の相互作用はない。
- **calc**: `SlotState` は `resourceId` / `growth` / `condition`。`SlotCard` は「ニケ / 育成 / 条件 / 結果」のセクション構造で、スキル Lv のセクションを足せる（Stage 3 設計 7 節の想定どおり）。永続化は `nikke-calc.team.v1`。
- **スキル説明文の語彙**（202 体 606 スキルを走査）: 効果の持続は「{N}秒間維持」（798 件）、「{N}発間維持」（28 件）、「持続」（163 件）の 3 種。「持続」は条件が満たされている限り続く常時効果で、これが段階 A の対象になる。「戦闘開始時、自分に『攻撃力 X％▲』『持続』」型が最も単純で、「自分が生存している限り、味方全体に…『持続』」型が味方対象の代表例。

---

## 1. 用語と範囲

- **常時発動パッシブ（段階 A）**: 戦闘開始から終了まで無条件で効き続けるステータス上昇。説明文では「戦闘開始時、〜に『X％▲』『持続』」「自分が生存している限り、〜に『X％▲』『持続』」「〜に『X％▲』『持続』」の形。
- **スキル Lv**: 1〜10。数値は `values[ref-1][lv-1]` を参照する。
- **対象**: `self`（自分）と `allies`（味方全体。自分を含む）の 2 種だけ。「自分を除く味方全体」「最終攻撃力が最も高い味方 N 機」「同じ武器種の味方」は段階 B 以降。
- **ステータス種別（語彙）**: 既存のダメージ式に直接差し込めるものだけ。「何が上がるか」（`stat`）と「どう算出するか」（`scaling`）は直交させる。

  | stat           | 説明文の表現              | 式への入り方                                                                                                                                                                                                                      |
  | -------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `attack`       | 攻撃力 X％▲               | `attack = base × (1 + Σ attackRatio) + Σ attackFlat`                                                                                                                                                                              |
  | `critRate`     | クリティカル確率 X％▲     | `boostCrit = (crit.rate + Σ critRate) × (crit.damage − 1 + Σ critDamage)`                                                                                                                                                         |
  | `critDamage`   | クリティカルダメージ X％▲ | 同上                                                                                                                                                                                                                              |
  | `attackDamage` | 攻撃ダメージ X％▲         | `attackDamageMultiplier = 1 + Σ attackDamage`（倍率グループ `1 + core + crit + distance` とは別枠で乗算。**2026-09-22 訂正**: 当初は加算項としていたが、射撃場の実測で別枠と判明。[verification.md](verification.md) Stage 4 節） |
  | `chargeDamage` | チャージダメージ X％▲     | `chargeMultiplier = charge ? fullChargeDamage + Σ chargeDamage : 1`（フルチャージ時だけ効く）                                                                                                                                     |

  | scaling（既定 `ratio`） | 説明文の表現                  | 意味                                                                                   |
  | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
  | `ratio`                 | 攻撃力 X％▲                   | 対象自身の基礎値に対する比率。`attackRatio` などに加算                                 |
  | `casterAttack`          | スキル発動者基準で攻撃力 X％▲ | 発動者のバフ前攻撃力 × X を固定加算（`attackFlat`）。`stat: 'attack'` のみ許す。7 節 3 |

- **スコープ外（段階 A では「未対応」と表示する）**: 上記以外のステータス（最大装弾数、リロード速度、チャージ速度、コアダメージ、有利コードの攻撃ダメージ、貫通・分配・パーツダメージ、防御力、HP、命中率、バーストゲージ）、条件付き効果（HP 条件は 7 節 2 の扱いに従う）、スタック、モード切り替え（バニーモード、ペルソナ等）、バーストスキル全般。
- **重複規則**: 同じ stat のバフは発動元が違えばすべて加算する（NIKKE の一般則。同一スキルの重ね掛けは段階 A では発生しない）。

---

## 2. スキル定義 JSON（DSL）

### 2.1 置き場と配信

`packages/core/data/skills/{resourceId}.json` に手書きし、`packages/core/data/skills/index.json` に定義済み id の一覧を持つ。`data/` は calc の `publicDir` なのでキャラデータと同じ経路（`/skills/271.json`）で配信され、`loadSkillIndex` / `loadSkillDefinition` を `load.ts` に足すだけで済む。`fetch-data` は `skills/` に触らない。

`index.json` があるのは「定義がないキャラで 404 を出さない」ためと、「どのキャラが対応済みか」を UI の選択肢に出すため。整合性（一覧と実ファイルの一致）はテストで固定する。

### 2.2 形式

```jsonc
// ノワール（271）の例。skill1「自分の HP が 70% 以上なら味方全体に『スキル発動者基準で攻撃力 {02}％▲』『持続』」
{
  "formatVersion": 1,
  "resourceId": 271,
  "checkedAt": "2026-09-22", // 説明文を確認した日（データ更新で説明文が変わったときの目印）
  "skills": {
    "skill1": {
      "support": "supported", // supported | partial | unsupported
      "effects": [
        {
          "kind": "passive",
          "target": "allies",
          "stat": "attack",
          "scaling": "casterAttack",
          "ref": 2,
          "assumes": { "ja": "HP 70% 以上", "en": "HP 70% or above" },
        },
      ],
    },
    "skill2": {
      "support": "unsupported",
      "effects": [],
      "notes": [{ "ja": "フルバースト時の効果は Stage 6", "en": "Full Burst effects are Stage 6" }],
    },
    "burst": {
      "support": "unsupported",
      "effects": [],
      "notes": [{ "ja": "バーストスキルは Stage 5", "en": "Burst skills are Stage 5" }],
    },
  },
}
```

型（`packages/core/src/skills/types.ts`）:

```ts
export type SkillSlot = 'skill1' | 'skill2' | 'burst';
/** 何が上がるか */
export type BuffStat = 'attack' | 'critRate' | 'critDamage' | 'attackDamage' | 'chargeDamage';
/** どう算出するか。ratio = 対象自身の基礎値に対する比率、casterAttack = 発動者のバフ前攻撃力 × 比率の固定加算 */
export type BuffScaling = 'ratio' | 'casterAttack';
export type BuffTarget = 'self' | 'allies';
export type SkillSupport = 'supported' | 'partial' | 'unsupported';

export type PassiveEffect = {
  kind: 'passive'; // 段階 A はこれだけ。段階 B で 'onFullBurst' 等を足す
  target: BuffTarget;
  stat: BuffStat;
  /** 省略時 'ratio'。'casterAttack' は stat が 'attack' のときだけ許す（parseSkillDefinition で検証） */
  scaling?: BuffScaling;
  /** description_value_NN の NN（1 始まり）。値は % 表記（"20.1"）。100 で割るのは resolvePassives の責務 */
  ref: number;
  /** 常に満たすとみなした条件。UI に「仮定」として出す */
  assumes?: LocalizedText;
};

export type SkillEntry = { support: SkillSupport; effects: PassiveEffect[]; notes?: LocalizedText[] };

export type SkillDefinition = {
  formatVersion: 1;
  resourceId: number;
  checkedAt: string;
  skills: Record<SkillSlot, SkillEntry>;
};
```

規則:

- `support` は「そのスキルの効果のうち段階 A で扱えたもの」を表す。すべて扱えたら `supported`、一部なら `partial`、ゼロなら `unsupported`。`partial` / `unsupported` は `notes` に扱わなかった効果を書く。
- 数値は必ず `ref` で参照する。説明文に直書きの数値（ミルクの「80％」など）は段階 A では参照しない（条件にしか出てこないため）。将来必要になったら `const` を足す。
- `scaling: 'casterAttack'` は `stat: 'attack'` 以外と組み合わせない（`parseSkillDefinition` が `Error`）。将来 `defence` などに発動者基準が出たら `BuffStat` を足すだけで済む。
- 人が読む文字列（`assumes` / `notes`）は `LocalizedText`（既存の `ModelNote.message` と同じ）。UI は今は `ja` だけ出す。
- `formatVersion: 1` では `burst` は常に `unsupported`（Stage 5 で語彙を足す）。
- 検証は純関数 `parseSkillDefinition(json): SkillDefinition`（不正なら `Error`）で行い、calc の読み込みとテストの両方で使う。

### 2.3 最初に定義するキャラ（候補）

説明文の走査で「持続」型の常時効果を持つキャラのうち、段階 A の語彙で書けるものを挙げる。数値は Lv1→Lv10。**どれを定義するかは 7 節 1 で決める**（使っているキャラから順に、が要件）。

| resourceId | ニケ                           | 武器/クラス/バースト | 段階 A で扱える効果                                                                                        | 扱えない効果（notes に書く）                                                |
| ---------- | ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 405        | シン：スウィフトバニー         | SR / 火力 / III      | S1: 自分 攻撃力 9.07→15.35%                                                                                | S1 のバニーモード、S2 全部。**未実装（2026-09-22 時点）のため候補から外す** |
| 404        | ギルティ：マイティバニー       | SR / 火力 / III      | S1: 自分 攻撃力 11.88→20.1%                                                                                | 同上                                                                        |
| 872        | アイギス（SR レア）            | SMG / 支援 / II      | S1: 自分 攻撃力 12.48→21.12%                                                                               | S1 防御力、S2（バースト使用時）                                             |
| 290        | マナ                           | AR / 火力 / III      | S1: 自分 攻撃力 34.32→58.08%                                                                               | S1 回復・復活、S2 全部                                                      |
| 95         | ウンファ：タクティカル・アップ | SR / 火力 / II       | S2: 味方全体 クリティカル確率 4.82→8.16%、味方全体 チャージダメージ 24.71→41.81%、自分 攻撃力 24.96→42.24% | S2 の LT 併用時の追加効果、S1 全部                                          |
| 93         | エマ：タクティカル・アップ     | MG / 支援 / I        | S2: 味方全体 クリティカルダメージ 13.89→23.51%                                                             | S2 発射体爆発ダメージ・AS 併用時、S1 全部                                   |
| 271        | ノワール                       | SG / 火力 / III      | S1: 味方全体 発動者基準攻撃力 8.32→14.08%（HP 70% 以上を仮定）                                             | —                                                                           |
| 141        | ミルク                         | SR / 火力 / I        | S2: 味方全体 クリティカルダメージ 6.12→11.13%（HP 80% 以上を仮定）                                         | S1（10 秒間維持型）                                                         |
| 71         | ソリン                         | SMG / 火力 / III     | S2: 自分 クリティカル確率 12.77→21.62%、クリティカルダメージ 36.79→62.27%（HP 最大を仮定）                 | S1 全部                                                                     |
| 870        | クイーン（真）                 | SG / 火力 / III      | S2: 自分 攻撃ダメージ 17.72→30%                                                                            | S1・S2 の残り（有利コード・防御力・ペルソナ）                               |
| 871        | 雪子                           | MG / 火力 / III      | S2: 自分 攻撃ダメージ 32.68→55.31%                                                                         | 同上                                                                        |
| 850        | イヴ                           | AR / 火力 / III      | S1: 自分 クリティカル確率 35.45→60%、S2: 自分 発動者基準攻撃力 29.55→50%                                   | S2 最大装弾数 14.77→25%（cadence に効く。段階 C）                           |
| 515        | シンデレラ：クリスタルウェーブ | MG / 火力 / III      | S2: 自分 攻撃力 15.95→29%                                                                                  | S2 コアダメージ・デコイ、S1 全部                                            |

推奨の初期セット（5 体）: **マナ**（最も単純な自己攻撃力。「戦闘中 1 回発動」「味方戦闘不能時に解除」は静止ボス前提では起きない）、**ウンファ：タクティカル・アップ**（味方対象 3 種、チャージダメージの検証に使える）、**エマ：タクティカル・アップ**（味方対象 1 種、MG）、**ノワール**（発動者基準の固定加算）、**クイーン（真）**（攻撃ダメージ）。語彙 6 種と対象 2 種をすべて 1 回ずつ通せる組み合わせで、射撃場の 1 ヒット実測（4.2 節）でも確認できる。所持していないキャラは実測できないので、所持状況に合わせて入れ替える。

---

## 3. core の追加（`packages/core/src/skills/`）

Stage 3 の API は壊さない。`computeDamage` / `computeTeamDamage` は引数を足すだけで、バフなしのときの結果は Stage 3 と同一になる。

### 3.1 値の解決（`skills/resolve.ts`）

```ts
export const SKILL_LEVEL_MAX = 10;
export type SkillLevels = Record<SkillSlot, number>; // 各 1..10

/**
 * values[ref-1][level-1] を Number() した生の値を返す（"20.1" → 20.1）。単位変換はしない。
 * 段階 B 以降で「秒」「発」を参照するときもこの関数を使う。無ければ RangeError
 */
export function skillValue(skill: SkillRaw, ref: number, level: number): number;

export type ResolvedEffect = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  target: BuffTarget;
  stat: BuffStat;
  scaling: BuffScaling; // 省略を 'ratio' に埋めた後の値
  /** 比率。0.201 のように 100 で割った後の値（段階 A の stat はすべて % 表記なので resolvePassives が一律に割る） */
  value: number;
  assumes?: LocalizedText;
};

/** 定義の各 effect を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
export function resolvePassives(def: SkillDefinition, character: CharacterData, levels: SkillLevels): ResolvedEffect[];

/** 説明文の {description_value_NN} を Lv の値に置き換え、<color> / <word_group> タグを除いた文字列（UI の確認用） */
export function renderSkillDescription(skill: SkillRaw, level: number, locale: Locale): string;
```

### 3.2 バフの合算と式への適用（`skills/buffs.ts`、`damage.ts`）

```ts
/** 1 体が受けるバフの合計。attackFlat 以外はすべて比率の加算（0.2 = +20%） */
export type BuffTotals = {
  /** 攻撃力の比率加算。Σ(stat attack, scaling ratio) */
  attackRatio: number;
  /** 攻撃力の固定加算（実数）。Σ(発動者のバフ前攻撃力 × value) */
  attackFlat: number;
  /** 会心率の加算。crit.rate に足す */
  critRate: number;
  /** 会心ダメージ倍率の加算。crit.damage − 1 に足す */
  critDamage: number;
  /** 攻撃ダメージの加算。倍率グループとは別の乗数 (1 + attackDamage)（2026-09-22 訂正） */
  attackDamage: number;
  /** チャージダメージ倍率の加算。fullChargeDamage に足す（フルチャージ時のみ） */
  chargeDamage: number;
};
export const ZERO_BUFFS: BuffTotals;

/** base × (1 + attackRatio) + attackFlat */
export function applyAttackBuffs(baseAttack: number, buffs: BuffTotals): number;
/** { rate: crit.rate + critRate, damage: crit.damage + critDamage } */
export function applyCritBuffs(crit: CharacterData['crit'], buffs: BuffTotals): CharacterData['crit'];
/** charge ? fullChargeDamage + chargeDamage : 1 */
export function applyChargeBuffs(fullChargeDamage: number, charge: boolean, buffs: BuffTotals): number;
/** 1 + attackDamage（2026-09-22 追加。倍率グループとは別に掛ける） */
export function applyAttackDamageBuffs(buffs: BuffTotals): number;
```

`computeDamage` は攻撃力・会心・チャージの 3 箇所でこれらの純関数を呼ぶだけにし、式の単体テストは `buffs.ts` 側で行う（`damage.ts` を肥大化させない）。`DamageInput` に `buffs?: BuffTotals` を足す。`DamageResult` は `baseAttack`（バフ前）を追加し、`attack` はバフ後になる。`buffs` 未指定は `ZERO_BUFFS` と同じで、Stage 2・3 のテストは `boost` に `attackDamage` が増えた分の期待値を足すだけで通る。

### 3.3 編成への適用（`team.ts`）

`TeamSlotInput` に `skills?: { definition: SkillDefinition | null; levels: SkillLevels }` を足す。

- `skills` 省略 = `{ definition: null, levels: 全部 10 }` と同じ。つまり「自分のスキルは発動しないが、**味方からの `allies` 効果は受ける**」。Stage 3 のテスト（全枠が `skills` 省略）は定義がどこにもないので結果が変わらない。
- `definition: null` は「定義ファイルなし（未定義）」。UI では「スキル定義なし」と出す。

```ts
export type AppliedEffect = ResolvedEffect & {
  /** 発動元の枠（slots 内の位置）。UI で「枠 1 のノワールから」と出すため */
  sourceSlotIndex: number;
  /** 実際に BuffTotals へ足した量。ratio なら value そのもの（0.1535）、casterAttack なら攻撃力の実数 */
  appliedAmount: number;
};

export type TeamSlotResult = {
  // …Stage 3 のまま
  buffs: BuffTotals;
  appliedEffects: AppliedEffect[];
  /** null = 定義ファイルなし（未定義） */
  skillSupport: Record<SkillSlot, SkillSupport> | null;
};
```

`computeTeamDamage` の処理:

1. 定義のある枠ごとに `resolvePassives` を呼ぶ。
2. 各枠の `BuffTotals` を作る: 自分の `self` 効果 + 全枠（自分を含む）の `allies` 効果。`scaling: 'casterAttack'` は「発動者のバフ前攻撃力（`attackOverride ?? computeStat`）× value」を `attackFlat` に加える。発動者の攻撃力にバフを乗せないので循環参照がなく、枠の順序に依存しない。
3. `computeDamage({ ..., buffs })` を呼ぶ。
4. `TeamSlotResult` に `buffs` / `appliedEffects` / `skillSupport` を詰める。

不変条件（テストで固定）: 定義を渡さない編成は Stage 3 と同じ結果。`allies` 効果は自分にも、`skills` を省略した枠にも掛かる。ある枠を外すと、その枠が配っていた `allies` 効果だけが他枠から消える。

---

## 4. calc の変更

### 4.1 状態（`apps/calc/src/team.ts`）

- `SlotState` に `skillLevels: SkillLevels` を足す。既定は全部 10。
- `TeamAction` に `{ type: 'setSkillLevels'; index; skillLevels }` を足す。
- `parseTeamState` は `skillLevels` が無い・不正なときは既定値 10 に落とす（保存キーは `v1` のまま。Stage 3 の保存データを壊さない）。
- スペック固定 ON のときはスキル Lv も 10 に固定する（7 節 5）。入力は disabled にし、計算には 10 を渡す。

### 4.2 読み込み（`apps/calc/src/useSkillDefinitions.ts`）

起動時に `skills/index.json` を読み、枠のニケが一覧にあれば `skills/{id}.json` を取得して `parseSkillDefinition` でキャッシュする。一覧にないニケは `definition: null`（未定義）として即座に確定する。取得中の枠は Stage 3 の「読み込み中」と同じ扱い（スキルなしで計算し、注記を出す）。

### 4.3 UI

```
SlotCard
  ├ …（Stage 3 のまま: ニケ / メタ行 / 育成 / 枠条件）
  ├ [スキル] セクション
  │   ├ Lv 入力 × 3（スキル 1 / スキル 2 / バースト。1〜10。スペック固定時 disabled）
  │   ├ 各スキルの状態バッジ: 対応 / 一部対応 / 未対応 / 未定義
  │   └ <details> で説明文（Lv の値を埋め込んだもの）と notes を展開
  ├ [受けているバフ] 一覧: 「攻撃力 +42.2%（ウンファ：TU スキル 2）」「攻撃力 +3,105（ノワール スキル 1・発動者基準）」。仮定付きは「仮定: HP 70% 以上」を添える
  └ 小結果（Stage 3 のまま）
TeamBreakdown
  └ 行の展開内容（ResultPanel）に「攻撃力（バフ前 → バフ後）」と boost の内訳に「攻撃ダメージ」「会心（バフ込み）」を追加
```

「未定義」のニケには「スキル定義なし（通常攻撃のみで計算）」と明示する（要件「未対応は明示」）。`CharacterPicker` の選択肢に定義済みの印（★など）を付けると探しやすいが、必須ではない。

---

## 5. テスト・検証

### 5.1 自動テスト

- core `src/skills/__tests__/resolve.test.ts`
  - `skillValue` が `values[ref-1][lv-1]` を生の数値（20.1）で返し、Lv1 と Lv10 で説明文の両端の値になる。範囲外の `ref` / `level` は `RangeError`。
  - `resolvePassives` が `self` / `allies`、5 種の stat、2 種の scaling を `ResolvedEffect` にし、`value` は 100 で割った比率になる。`scaling` 省略は `'ratio'` に埋まる。`unsupported` のスキルは効果ゼロ。
  - `parseSkillDefinition` が `scaling: 'casterAttack'` と `stat: 'critRate'` の組み合わせ、`assumes` が文字列（`LocalizedText` でない）、`formatVersion` 違いを `Error` にする。
  - `renderSkillDescription` がプレースホルダを置換し、タグを除く。
- core `src/skills/__tests__/buffs.test.ts`
  - `applyAttackBuffs`: `attackRatio` 0.2 で 1.2 倍、`attackFlat` は加算、両方あれば `base × 1.2 + flat`。
  - `applyCritBuffs`: `critRate` / `critDamage` が加算される。
  - `applyChargeBuffs`: `charge = false` なら `chargeDamage` があっても 1。
- core `src/__tests__/damage.test.ts`（追加）
  - `buffs` 未指定は `ZERO_BUFFS` と同一で既存テストがそのまま通る（`boost` の形が広がった 1 行だけ更新）。`baseAttack` がバフ前、`attack` がバフ後。`attackDamage` は `attackDamageMultiplier`（= 1 + Σ）として `boost.total` とは別に掛かる（2026-09-22 訂正）。`chargeDamage` はチャージ武器のフルチャージ時だけ効く。
- core `src/__tests__/team.test.ts`（追加）
  - 定義なし編成は Stage 3 と同一。`allies` 効果が全枠（自分含む、`skills` 省略の枠も含む）に乗る。`casterAttack` が発動者のバフ前攻撃力を基準にする（発動者に `attack` バフがあっても変わらない）。枠を外すとその枠の `allies` 効果だけ消える。`appliedEffects` の `sourceSlotIndex` / `appliedAmount` が正しい。`skillSupport` は定義なしで `null`。
- core `src/skills/__tests__/definitions.test.ts`（データの整合性）
  - `data/skills/*.json` がすべて `parseSkillDefinition` を通る。ファイル名と `resourceId` が一致し、`index.json` と過不足がない。各 `ref` がそのキャラの `values` に存在し、10 要素の数値である。`burst` は `unsupported`。
- calc `src/team.test.ts`（追加）
  - `setSkillLevels` の反映。`parseTeamState` が `skillLevels` 欠落を既定 10 に落とし、範囲外（0、11、小数）は null にする。

### 5.2 手動確認（射撃場・スペック固定・1 ヒット実測）

Stage 2-A と同じ方法（非コア・非会心の 1 ヒットを読む。[verification.md](verification.md) の測定条件）。スペック固定なら攻撃力が既知（Stage 2-A で一致確認済み）なので、バフの効き方だけを切り出せる。

| 確認したいこと                   | 編成                   | 予測                                                                                        |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `attack`（自己）                 | マナ 1 体              | `(attack × 1.5808 − 100) × 武器倍率 × …` が 1 ヒットと一致                                  |
| `attack`（発動者基準・固定加算） | ノワール + AR 1 体     | AR 側の 1 ヒットが `attack + ノワールの攻撃力 × 0.1408` で一致                              |
| `attackDamage`                   | クイーン（真）1 体     | 1 ヒットが `× (1 + 0.30)` で一致（2026-09-22 訂正: 当初の「`boost` に +0.30」は実測で否定） |
| `chargeDamage`                   | ウンファ：TU + SR 1 体 | SR 側のフルチャージ 1 ヒットが `fullChargeDamage + 0.4181` で一致                           |
| スキル Lv 追従                   | 任意の定義済みキャラ   | UI で Lv 1↔10 を変えると「受けているバフ」の値が Blablalink の表示と一致                    |
| 未定義キャラ                     | 定義のないニケ         | 「スキル定義なし」が出て、結果は Stage 3 と同じ                                             |

会心系（`critRate` / `critDamage`）は 1 ヒットで切り出せない（会心の有無は表示で分かるが確率は測れない）ので、式の妥当性は参考資料（吟味.net）に拠り、実測は総ダメージの目安（Stage 2-C 方式、±10%）に留める。

所持していないキャラがある場合は 7 節 1 の選定で差し替える。実測できない stat は「式は参考資料どおり、未実測」と verification.md に書く。

### 5.3 完了条件

- 5.1 のテストと CI（format / lint / typecheck / test / build）が緑。
- 5.2 のうち `attack`（自己）・`attack`（発動者基準）・`attackDamage` の 3 つは実測で一致（`chargeDamage` は所持キャラ次第）。
- [roadmap.md](roadmap.md) の Stage 4 を完了に更新し、[verification.md](verification.md) に Stage 4 節を追加。[requirements.md](requirements.md) の未決事項 4・6 を解決済みにする。

---

## 6. 実装手順（各ステップに検証コマンド）

1. core `skills/types.ts` + `parseSkillDefinition` + `definitions.test.ts`（空の `data/skills/index.json` で通す）→ `npm test`。
2. core `skills/resolve.ts`（`skillValue` / `resolvePassives` / `renderSkillDescription`）+ テスト → `npm test`。
3. core `damage.ts` に `buffs` を追加（`baseAttack` を結果に足す）+ テスト → `npm test`。既存テストが無変更で通ることを確認。
4. core `team.ts` に `skills` 入力と `BuffTotals` の合算を追加 + テスト → `npm test`。
5. `data/skills/` に 7 節 1 で決めたキャラの定義を書く → `definitions.test.ts` が緑。
6. calc `team.ts`（`skillLevels`・`setSkillLevels`・`parseTeamState`）+ テスト → `npm test`。
7. calc `useSkillDefinitions.ts` + `load.ts` の `loadSkillIndex` / `loadSkillDefinition` → `npm run typecheck`。
8. UI: `SlotCard` のスキルセクション → 受けているバフ一覧 → `ResultPanel` の攻撃力（バフ前→後）→ `npm run dev` で 1 体の数値が手計算と合うことを確認。
9. `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`。
10. 射撃場で 5.2 を実測し、verification.md に記録。roadmap / requirements を更新し、`claude/` ブランチから PR。

---

## 7. 決めてほしいこと（推奨付き）

2026-09-22 のレビューで 6 点とも推奨案に賛成をもらった（レビュー指摘の型・命名の修正は本文に反映済み）。「承認」の一言で実装に入る。

1. **最初に定義するキャラ** — 推奨: 2.3 節の 5 体（マナ、ウンファ：タクティカル・アップ、エマ：タクティカル・アップ、ノワール、クイーン（真））。所持していないものがあれば表の他の候補と入れ替える。所持キャラを教えてほしい。
2. **HP 条件付きの「持続」効果の扱い**（ノワール「HP 70% 以上」、ミルク「HP 80% 以上」、ソリン「HP 最大」）— 推奨: 常に満たすとみなして計算に入れ、UI に「仮定: HP 70% 以上」と出す。ボスは静止・被弾なしの前提（要件 5.1）なので整合する。代替は「未対応」扱い。
3. **「スキル発動者基準で攻撃力 X％▲」の基準値** — 推奨: 発動者の**バフ前**攻撃力（`attackOverride ?? computeStat`）。コミュニティの解説では発動者のステータス画面の攻撃力（装備込み、戦闘中バフは含まない）とされ、循環参照も避けられる。ノワール + AR の実測（5.2）で確かめ、ずれたら段階 B で見直す。
4. **定義ファイルの置き場** — 推奨: `packages/core/data/skills/{id}.json` + `index.json` をランタイムで取得（キャラデータと同じ経路）。代替は TS モジュールに同梱（型チェックは効くが、要件の「手書き JSON」から外れ、定義を足すたびにビルドが要る）。
5. **スペック固定時のスキル Lv** — 推奨: 10 に固定して入力を disabled にする（ユニオン射撃場のスペック固定はスキル Lv も最大になる認識。違っていれば教えてほしい）。
6. **語彙に `chargeDamage` を含めるか** — 推奨: 含める。式の差し込み口（`chargeMultiplier`）が既にあり、ウンファ：タクティカル・アップの定義に必要。`maxAmmo`（イヴ）は cadence に効くので段階 C に回す。

---

## 8. リスク・留意点

- **説明文の更新**: Blablalink のデータ更新でスキル説明文や `values` の並びが変わると `ref` がずれる。`checkedAt` と `definitions.test.ts` の「`ref` が存在する」チェックで検知するが、並び替え（存在はするが意味が変わる）は検知できない。`fetch-data` を回したら定義済みキャラの説明文を目視する運用にする。
- **「同じ部隊の味方全体」**: ウンファ：TU / エマ：TU の一部効果は「同じ部隊の味方全体」。ソロレイドでは 5 人編成 = 部隊なので `allies` と同じに扱う。
- **会心率の上限**: バフで 100% を超える組み合わせは段階 A の候補にはないので clamp しない。段階 B 以降で必要になったら足す。
- **UI の情報量**: 枠ごとに Lv 入力 3 つとバッジ 3 つが増える。説明文は `<details>` に畳み、既定で閉じる。
- **`scaling` の構造化（PR #4 レビュー）**: `casterAttack` は「発動者の攻撃力」に特化した名前で、発動者の最大 HP 基準（ラプラス：アルティメットヒーロー、2B など）や自分の防御力基準が出てくると列挙が肥大化する。段階 B で「基準値の参照先（caster / target）× ステータス × 計算方式（ratio / flat）」に分ける案を検討する。段階 A では定義が 5 体なので `parseSkillDefinition` の変換で吸収できる。
- **対象判定の拡張**: `isEffectTarget`（`skills/targets.ts`）に述語を足すだけで「自分以外」「最終攻撃力が最も高い味方 N 機」に広げられる。`computeTeamDamage` は触らない。
- **段階 B への拡張余地**: `PassiveEffect.kind` を判別子にしてあるので、`'onFullBurst'`（持続時間付き）を足すだけで区間分割に進める。`BuffTotals` は区間ごとに作り直せる純データにしておく。
