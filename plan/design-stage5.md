# Stage 5 設計書: フルバースト基礎とシンプルバースト（sim 先行 → calc）

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **完了（2026-09-22）**（経緯は末尾の「経過」）
- 関連: [design-stage4.md](design-stage4.md)、[verification.md](verification.md)、[roadmap.md](roadmap.md)
- 作成日: 2026-09-22（同日、改定前の「固定サイクルのフルバースト（calc のみ）」案を全面改訂）

## Context

Stage 1〜4 は 2026-09-22 に実装・実測まで完了した。同日にロードマップが改定され、Stage 5 以降は **sim 先行（sim → calc の順）** の小規模 PDCA サイクルで進めることになった。改定後の Stage 5 の要求は次のとおり。

- 固定 20 秒サイクル（通常 10 秒 + フルバースト 10 秒）を前提に、フルバースト補正（+0.5）と「ダメージだけを与えるバーストスキル」を扱う。
- **sim 先行**: `packages/core/src/sim/` に最小フレームシミュレータ（60fps、180 秒 = 10,800f）を新設し、通常射撃・リロード・チャージ・常時パッシブをフレーム進行で再現する。20 秒ごと（1,200f ごと）にバースト I → II → III を発火してフルバースト区間（600f）に入り、発動時にスキル倍率ダメージを発生させ、区間中の全射撃に +0.5 を加算する。
- **calc**: 180 秒を「通常区間 90 秒」と「フルバースト区間 90 秒」の 2 区間に分けて通常攻撃の期待値を合算し、各サイクルのバーストスキルダメージ（9 回分）を加算する。
- **UI は最小限**（バーストスキルの表示枠・フルバーストのトグル程度）。
- **検証（PDCA）**: sim と calc の総ダメージが端数差を除いて一致することを自動テストで固定し、射撃場（スペック固定）で「フルバースト中の通常攻撃 1 ヒット（+0.5）」と「バーストスキルの倍率ダメージ」を実測する。

改定前の案からの主な変更: (a) sim を Stage 5 で新設し、calc の 2 区間モデルは sim の期待値化として位置づける、(b) バースト CT・`burst_duration` の扱い（改定前の 4.2 節 `scheduleBursts`）は Stage 7「バーストゲージ蓄積と動的サイクル」に送り、Stage 5 は**毎サイクル必ず I → II → III が発動する固定サイクル**だけを扱う、(c) サイクル長・フルバースト時間の手入力をやめて定数にする。スキル定義 JSON の `burstDamage` 語彙とバーストスキルの式は改定前の案をそのまま引き継ぐ。

設計の前提となる現状（2026-09-22 に調べた事実。改定前の案から再掲）:

- **core**: `computeDamage` は「1 トリガーの期待ダメージ × 秒間トリガー数 × 秒数」の静的 DPS で、式は `max(1, 攻撃力 − 防御) × 武器倍率 × チャージ倍率 × (1 + コア + 会心 + 距離) × (1 + Σ attackDamage) × 属性`。`ConditionInput` に「フルバースト中か」はない。`computeCadence` は 1 マガジン周期（初弾遅延 + 発射フレーム列 + リロード）をフレームで離散化済みで、録画 4 本で較正されている（[verification.md](verification.md) Stage 2-B）。`computeTeamDamage` は常時パッシブを枠間で配ってから枠ごとに `computeDamage` を 1 回呼ぶ。
- **スキル定義**: `formatVersion: 1` では `burst` は常に `unsupported`（`parseSkillDefinition` が弾く）。定義済み 5 体のバーストは、ノワール（バーストスキルダメージ 351.64%）、クイーン（真）（分配ダメージ 1421.69% + 1more 攻撃力▲）、マナ（持続ダメージ 396% × 1 秒間隔 10 秒）、エマ：TU（味方攻撃力▲ 10 秒 = Stage 6）、ウンファ：TU（武器変更 = 未対応）。
- **バースト III の説明文**（82 体）: 「最終攻撃力の X％の バーストスキルダメージ」型 16 体、「〜のダメージ」型 6 体、「バーストスキルダメージ + 追加ダメージ」7 体、「分配ダメージ」4 体、「持続ダメージ」3 体、倍率ダメージなし（バフのみ）30 体。対象は「敵全体」「〜な敵 N 機」がほとんどで、**単体ボスならどちらも 1 ヒット**。
- **スキルダメージの式**（参考資料。実測で確かめる）: 「適正距離・コアダメージは参照しない」（深淵？ note、Jgaram/nikke-calc）。会心・攻撃ダメージ▲は掛かる。**フルバーストの +0.5 がバースト発動時の即時ダメージに乗るかは両説ある**（Jgaram/nikke-calc は乗せる、nikke-sim の modeling-priors は「フルバースト開始前のスナップショット」で乗せない）ので、定数で切り替えて実測で決める。
- **CDN 生データ**の `burst_duration`（フルバースト時間。202 体中 198 体が 10 秒、ミハラ・イサベル・ベスティー 5 秒、モダニア 15 秒）と `skill_cooltime`（バースト III は全 82 体 40 秒、I/II は 20 / 40 / 60 秒）は、Stage 5 では使わない（8 節 2）。
- **calc**: `TeamState` は `slots` / `enemy` / `durationSeconds` / `fixedSpec`。永続化は `nikke-calc.team.v1`（欠落キーは既定値に落とす方針が Stage 4 で確立）。

---

## 1. 時間モデルと用語

すべての時間はフレーム（`FPS = 60`）で定義し、calc は秒に換算して使う。

- **戦闘時間**: `durationSeconds`（既定 180 秒 = 10,800f）。
- **固定バーストサイクル**: 長さ `CYCLE_FRAMES = 1,200f`（20 秒）。サイクル k（0 始まり）は `[1200k, 1200(k+1))`。前半 `NORMAL_FRAMES = 600f` が**通常区間**、後半 `FULL_BURST_FRAMES = 600f` が**フルバースト区間**。最初のフルバーストは 10 秒（600f）から始まる（ゲージが溜まる時間を先に置く。改定前の案 7 節 5 の推奨と同じ）。
- **バースト発動**: 各サイクルの `1200k + 600` フレームに **I → II → III の順で同一フレームに発動**し、そのフレームからフルバースト区間が始まる（段階間の遅延は Stage 5 では 0f。Stage 7 でゲージと一緒に較正する）。段階ごとに発動するのは **1 体**（複数いれば枠番号が小さい方。`AllStep` は専任がいない最も低い段階に充てる）。その段階のニケがいなければ発動なしで、フルバースト自体は起きると仮定する（UI に注記）。**CT は見ない**（8 節 2）。
- **バーストスキルダメージ**: 発動フレームに 1 回発生する即時ダメージ。式は

  ```
  burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100
             × (1 + 会心期待値 [+ 0.5: BURST_SKILL_FULL_BURST_BONUS が true のとき])   ← コア・距離は乗らない
             × (1 + Σ attackDamage) × 属性有利
  ```

  武器倍率・チャージ倍率は掛けない。攻撃力・会心・攻撃ダメージのバフは Stage 4 の常時パッシブ分だけ（Stage 6 のバースト時バフはまだ乗らない）。

- **フルバースト補正**: 区間中の通常攻撃の倍率グループに `FULL_BURST_BOOST = 0.5` を足す: `1 + コア + 会心 + 距離 + 0.5`（ore-game.com の検証メモ「フルバーストかつクリティカルの場合は加算」と整合）。
- **sim と calc の関係**: sim はこの時間モデルをフレームごとに逐次実行する。calc は同じ時間モデルの**期待値**で、通常攻撃を「秒間トリガー数 × 区間の秒数」で置く。両者は同じ式（1 トリガーのダメージ、バーストヒット）と同じ時刻表（3.3 節）を共有し、違いは「発射をフレームで数えるか、平均レートで置くか」だけになる。
- **スコープ外（「未対応」と表示する）**: 持続ダメージ（マナ）、防御力無視、コアヒット扱いのスキルダメージ、バースト使用時・フルバースト時のバフ/デバフ（Stage 6）、武器変更（ウンファ：TU）、CT・ゲージ・フルバーストタイム▼（Stage 7）、乱数（会心・コア命中の抽選。sim も期待値で計算する。8 節 3）。

---

## 2. スキル定義 JSON の拡張（`skills/types.ts`）

改定前の案と同じ。`formatVersion` は 1 のまま語彙を足す（既存 5 ファイルはそのまま有効）。`burst` スロットに限って `kind: 'burstDamage'` を許し、「`burst` は常に `unsupported`」の規則を外す。

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
- バースト I / II のダメージ効果も同じ語彙で書ける（段階は `CharacterData.burstStep` から取る）。

### 2.1 Stage 5 で定義（更新）するキャラ

既存 5 体のバーストを埋め、バースト III の単体ダメージを 1 体足す。**どれを定義するかは 8 節 6 で決める。**

| resourceId | ニケ                       | 段階 | Stage 5 で扱える効果                                | 扱えない効果（notes）                                          |
| ---------- | -------------------------- | ---- | --------------------------------------------------- | -------------------------------------------------------------- |
| 271        | ノワール                   | III  | 敵全体に 351.64% のバーストスキルダメージ → `skill` | SG 味方の命中率▲・阻止部位の攻撃ダメージ▲（Stage 6）           |
| 870        | クイーン（真）             | III  | 敵全体に 1421.69% の分配ダメージ → `distributed`    | 対象が風圧なら 1more 攻撃力▲（Stage 6）                        |
| 290        | マナ                       | III  | —（`unsupported`）                                  | 持続ダメージ 396% × 1 秒間隔 × 10 秒、自分に持続ダメージ▲      |
| 93         | エマ：タクティカル・アップ | I    | —（`unsupported`）                                  | 味方全体に発動者基準攻撃力▲ 10 秒（Stage 6）、環境コントロール |
| 95         | ウンファ：TU               | II   | —（`unsupported`）                                  | 武器変更（1 発のみ）、受けるダメージ▲ 10 秒（Stage 6）         |
| 10         | ラピ                       | III  | 最終攻撃力が最も高い敵 1 機に 657.72% → `skill`     | 自分に攻撃力 60.75%▲ 10 秒（Stage 6）                          |
| 170        | プリバティ                 | III  | 敵全体に 457.87% → `skill`                          | 気絶（ボスには無効）                                           |

実測用に、バースト I/II で火力に触らないニケ（攻撃力・ダメージ・受けるダメージ・会心・命中率・弾数に一切触れない説明文）: **I**: ~~エーテル~~、I-DOLL・オーシャン、ミサト、サクラ、ノイズ、ティア、ソラ、レーベル、パスカル、ラム、クレア、メアリー、アビスタ、ソリン：フロストチケット。**II**: デルタ、ノア、ソルジャーF.A.、マルチャーナ、シラツル。

> **訂正（2026-09-22、録画 18〜21）**: **エーテルは火力に触る**。S2「副反応実験」に「フルバーストタイム持続中に発動した時、同じ敵に防御力 9.38%▼（6 秒間維持）」があり、フルバースト中だけ敵の防御力が 100 → 90.62 に下がる。録画 18 でラピの 1 ヒットが 37,510（防御 100）と 37,512（防御 90.62）の 2 系列に割れて出たのはこれが原因。**実測の I にエーテルを使わない。** デルタ（II）は説明文どおり火力に触らないことを録画 18〜22 で確認した。

---

## 3. core の共通部分（sim と calc が共有する純関数）

Stage 4 の API は壊さない。`computeDamage` / `computeTeamDamage` は引数が増えるだけで、既存の呼び出し（バーストなし）の結果は不変。

### 3.1 1 トリガーの式を切り出す（`damage.ts`）

sim がフレームごとに使えるように、`computeDamage` から「発射サイクルに依らない部分」を純関数に分ける。

```ts
export type TriggerDamageInput = Omit<DamageInput, 'condition'> & {
  condition: Omit<ConditionInput, 'durationSeconds'> & {
    /** フルバースト区間中か。省略 false。true なら倍率グループに FULL_BURST_BOOST を足す */
    fullBurst?: boolean;
  };
};
export type TriggerDamage = {
  baseAttack: number;
  attack: number;
  buffs: BuffTotals;
  baseHit: number;
  weaponMultiplier: number;
  chargeMultiplier: number;
  /** 加算グループ 1 + コア + 会心 + 距離 + フルバースト */
  boost: { core: number; crit: number; distance: number; fullBurst: number; total: number };
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** 1 トリガー（SG は全ペレット）あたりの期待ダメージ */
  perTrigger: number;
};
export const FULL_BURST_BOOST = 0.5;
export function computeTriggerDamage(input: TriggerDamageInput): TriggerDamage;

/** 従来どおり。内部で computeTriggerDamage → computeCadence → dps × durationSeconds */
export function computeDamage(input: DamageInput): DamageResult; // DamageResult = TriggerDamage & { cadence, dps, totalDamage, notes }
```

`ConditionInput` に `fullBurst?: boolean` を足し、`DamageResult.boost` に `fullBurst`（0 か 0.5）が増える。既存テストは `boost` の形が広がった分だけ更新する。

### 3.2 常時パッシブの配布を切り出す（`team.ts`）

`computeTeamDamage` の「全枠の `resolvePassives` を集めて枠ごとの `BuffTotals` を作る」部分を `resolveTeamBuffs(slots): { buffs: BuffTotals; appliedEffects: AppliedEffect[] }[]` にして公開する。sim は戦闘開始時に 1 回呼び、Stage 6 で区間ごとに作り直せるようにしておく。

### 3.3 固定サイクルの時刻表（`burst/fixedCycle.ts`）

```ts
export const FIXED_BURST_CYCLE = { cycleFrames: 1200, normalFrames: 600, fullBurstFrames: 600 } as const;

export type BurstCandidate = { burstStep: BurstStep } | null; // null = 空枠

export type BurstAssignment = Record<'Step1' | 'Step2' | 'Step3', number | null>; // 発動する枠番号

export type FixedCycleSchedule = {
  /** 各サイクルの発動フレーム（duration 未満のものだけ）。180 秒なら 600, 1800, …, 10200 の 9 個 */
  activationFrames: number[];
  /** duration 内のフルバースト区間 [start, end) の列（末尾は duration で切る） */
  fullBurstWindows: { start: number; end: number }[];
  /** duration 内のフルバースト時間の合計（フレーム）。180 秒なら 5,400 */
  fullBurstFramesTotal: number;
  /** 段階ごとに発動する枠（2.1 節の規則。null = その段階のニケがいない） */
  assignment: BurstAssignment;
};

export function assignBurstSteps(candidates: readonly BurstCandidate[]): BurstAssignment;
export function planFixedCycle(candidates: readonly BurstCandidate[], durationFrames: number): FixedCycleSchedule;
/** フレーム f がフルバースト区間か */
export function isFullBurstFrame(f: number): boolean; // (f mod 1200) >= 600
```

`assignBurstSteps` は決定的（枠の順序にだけ依存）: 段階 I / II / III ごとに `burstStep` が一致する最小の枠番号。埋まらない段階があれば `AllStep` の枠（若い順）を低い段階から充てる。

### 3.4 バーストスキルダメージ（`skills/burstDamage.ts`）

改定前の案の 4.3 節と同じ。

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

/** 実測で決める（8 節 1）。false = バースト発動時の即時ダメージにフルバースト +0.5 は乗らない */
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
  perEffect: { effect: ResolvedBurstDamage; expected: number }[];
  /** 1 発動あたりの合計 */
  perActivation: number;
};
export function computeBurstHit(input: BurstHitInput): BurstHitResult;
```

---

## 4. sim（`packages/core/src/sim/`）— 先に作る

ヘッドレスの純関数群。React にも DOM にも依存せず、node の vitest で回す。入力は calc と同じ `TeamInput`（3.2 節の共通化により、パッシブの配布も同じコードを通る）。

### 4.1 入出力（`sim/engine.ts`）

```ts
export type SimInput = TeamInput & {
  /** 固定 20 秒サイクルのバーストを回すか。false なら Stage 4 相当（バーストなし・フルバーストなし） */
  burst: boolean;
  /** true なら全イベントを events に残す（テスト・デバッグ用。既定 false） */
  trace?: boolean;
};

export type SimEvent =
  | { frame: number; kind: 'trigger'; slot: number; fullBurst: boolean; damage: number }
  | { frame: number; kind: 'burst'; slot: number; step: 'Step1' | 'Step2' | 'Step3'; damage: number }
  | { frame: number; kind: 'fullBurstStart' | 'fullBurstEnd' };

export type SimSlotResult = {
  index: number;
  character: CharacterData;
  buffs: BuffTotals;
  appliedEffects: AppliedEffect[];
  /** 通常攻撃。区間ごとにトリガー数とダメージ */
  normal: { nonFullBurst: { triggers: number; damage: number }; fullBurst: { triggers: number; damage: number } };
  /** バーストスキル。activations は発動フレーム */
  burst: { activations: number[]; perActivation: number; damage: number };
  totalDamage: number;
  notes: ModelNote[];
};

export type SimResult = {
  frames: number; // = durationSeconds × 60（切り上げ）
  schedule: FixedCycleSchedule | null;
  slots: (SimSlotResult | null)[];
  totalDamage: number;
  events: SimEvent[]; // trace: false なら空
};

export function runSimulation(input: SimInput): SimResult;
```

### 4.2 射手の状態機械（`sim/shooter.ts`）

1 体の通常射撃をフレームごとに進める。**`cadence.ts` と同じ規則**（レート蓄積、チャージ + 解放遅延 22f、リロード = 回数 × リロード時間、MG の初弾遅延 20f）を状態機械で書き直したもので、`cadence.ts` の定数・関数（`rateAfterShots`、`firstShotFrames`、`reloadChunks`、`secondsToFrames`）をそのまま使う。

```ts
export type ShooterState = {
  ammo: number; // 残弾
  shotsInMagazine: number; // このマガジンで撃った数（レート上昇と 1 発目判定に使う）
  wait: number; // 次に撃てるまでのフレーム（初弾遅延・チャージ・リロード）
  acc: number; // レート蓄積（非チャージ武器）
  reloading: boolean;
};
export function initialShooter(shot: ShotParams, model?: WeaponModel): ShooterState;
/** 1 フレーム進め、このフレームに発射したら true */
export function stepShooter(state: ShooterState, shot: ShotParams, model?: WeaponModel): boolean;
```

規則（`computeCadence` と 1 フレームもずれないこと をテストで固定する）。`wait` は「撃てないフレームがあと何個残っているか」で、`stepShooter` は**先に判定してから減らす**: `if (wait > 0) { wait -= 1; return false; }` を通過したフレームだけが発射候補になる（オフバイワン防止のため、境界は下記の絶対フレームで固定する。2026-09-22 レビュー反映）:

1. **戦闘開始**: `wait = firstShotFrames`。非チャージ武器（AR 等）は 0 なので f = 0 に 1 発目を撃ち、f = 1 から `acc` を積む。MG は 20 なので f = 0..19 で消化して f = 20 に 1 発目、チャージ武器は 82（チャージ 60f + 解放 22f）なので f = 82 に 1 発目。
2. **マガジンの 1 発目**は `wait` が 0 になった最初のフレームに撃つ（`shotFrames[0] = 0` に対応）。
3. **2 発目以降（非チャージ）**: `wait` は 0 のまま。前の発射の**翌フレームから**毎フレーム `acc += rateAfterShots(shot, shotsInMagazine) / MAX_RPM`、`acc ≥ 1` で撃って `acc -= 1`。マガジンが変わったら `acc = 0`（`simulateShotFrames` と同じ）。
4. **チャージ武器**: 発射したフレーム S で `wait = chargeFrames + chargeReleaseFrames − 1`（S 自身を 1 フレームと数える）。次弾は S + 82。
5. **リロード**: 最終弾を撃ったフレーム L で `reloading = true`、`wait = reloadFrames × reloadChunks + firstShotFrames − 1`。`wait` が 0 になったフレームで `ammo = maxAmmo`、`shotsInMagazine = 0`、`acc = 0` にして 1 発目を撃つ。つまり次のマガジンの 1 発目は **L + リロード + 初弾遅延** で、`computeCadence` の `cycleFrames = firstShotFrames + magazineFrames + reloadFrames` と同じ位置になる（−1 は「L の翌フレームから数えて reloadFrames + first 個目のフレームに撃つ」ため。例: AR は最終弾 295 → リロード 60 → 355 に撃つので、消化するのは 296..354 の 59 フレーム）。

絶対フレームの契約（`shooter.test.ts` はこの列と `k × cycleFrames + firstShotFrames + shotFrames[i]` の両方に一致することを見る）:

| 武器（フィクスチャ）                   | 1 マガジン目                         | 2 マガジン目の 1 発目   | cadence    |
| -------------------------------------- | ------------------------------------ | ----------------------- | ---------- |
| AR 720rpm・60 発・リロード 1s          | 0, 5, 10, …, 295                     | 355（= 295 + 60 + 0）   | cycle 355f |
| SR チャージ 1s・6 発・リロード 1.5s    | 82, 164, 246, 328, 410, 492          | 664（= 492 + 90 + 82）  | cycle 582f |
| MG スピンアップ・300 発・リロード 2.5s | 20, …, 410（1 発目 → 300 発目 390f） | 580（= 410 + 150 + 20） | cycle 560f |

### 4.3 エンジンのフレームループ（`sim/engine.ts`）

```
準備:
  buffs[i]        = resolveTeamBuffs(slots)[i]             （3.2）
  trigger[i]      = computeTriggerDamage(slot i, fullBurst: false).perTrigger
  triggerFB[i]    = computeTriggerDamage(slot i, fullBurst: true).perTrigger
  burstHit[i]     = computeBurstHit(...)                    （定義に burstDamage があれば。なければ null）
  schedule        = burst ? planFixedCycle(candidates, frames) : null
  shooter[i]      = initialShooter(shot)

for f in 0 .. frames-1:
  fb = schedule !== null && isFullBurstFrame(f)
  if schedule と f が activationFrames にある:
    for step in I, II, III: i = assignment[step]; if i !== null && burstHit[i]: 加算 burstHit[i].perActivation を slots[i].burst に
  for i in 枠順:
    if stepShooter(shooter[i], shot): 加算 (fb ? triggerFB[i] : trigger[i]) を slots[i].normal.(fb ? fullBurst : nonFullBurst) に
```

- 加算順は枠 0 から固定（Stage 3 の「個別計算の和と一致」と同じ流儀）。
- 通常攻撃の 1 トリガーは期待値（会心・コア命中を確率で均した値）で、乱数は使わない（8 節 3）。
- バーストの発動フレームは「そのフレームの通常攻撃より先」。同一フレームに複数の段階が発動する順は I → II → III。
- 射撃は 180 秒の最後のフレームまで続ける（戦闘終了で打ち切り。マガジンの端数はそのまま捨てる）。

### 4.4 ヘッドレスの実行口（任意、`packages/core/scripts/sim-run.ts`）

`node scripts/sim-run.ts --ids 271,870 --fixed-spec --duration 180` で、sim と calc（5.1 節）の枠別・区間別の内訳を表で出す。UI を作らずに PDCA を回すための最小 CLI で、検証記録（[verification.md](verification.md)）に貼る数値もここから出す。`npm run sim` をルートに足す。テストは不要（純関数の組み合わせだけ）。

### 4.5 sim のテスト（`src/sim/__tests__/`）

- `shooter.test.ts`: AR（720rpm・60 発・リロード 1 秒）、SMG（1440rpm）、SR（チャージ 1 秒・6 発）、RL（チャージ 1.5 秒）、MG（スピンアップ・300 発）の各フィクスチャで、3 マガジン分の発射フレーム列が `k × cycleFrames + firstShotFrames + shotFrames[i]` と**完全一致**する。
- `fixedCycle.test.ts`: 10,800f で `activationFrames` が 600, 1800, …, 10200 の 9 個、`fullBurstFramesTotal = 5,400`。duration が端数（10,500f）なら最後の区間が `[10200, 10500)` に切れる。`isFullBurstFrame(599) = false`、`(600) = true`、`(1199) = true`、`(1200) = false`。`assignBurstSteps` の優先規則（枠順、`AllStep` の充当、空枠・段階なし）。
- `engine.test.ts`:
  - `burst: false` は全トリガーが `nonFullBurst` で、トリガー数が cadence の周期から数えた値（`⌊(frames − first) / cycle⌋ × maxAmmo + 端数`）と一致する。
  - `burst: true` で AR 1 体の `fullBurst.triggers + nonFullBurst.triggers` は `burst: false` と同じ（フルバーストは発射サイクルに影響しない）。`fullBurst.damage / fullBurst.triggers` は `nonFullBurst` の 1 トリガー × `(boost + 0.5) / boost`。
  - バースト定義のある枠は `activations.length = 9`、`burst.damage = 9 × perActivation`。定義のない枠・`unsupported` は 0。III が 2 体なら枠番号の若い方だけ発動。
  - `trace: true` で `fullBurstStart` が 600 に、`burst` イベントが同フレームに I → II → III の順で並ぶ。
  - `totalDamage` = 全枠の和。空枠は `null`。

---

## 5. calc — sim の期待値モデル

### 5.1 core（`team.ts`）の 2 区間モデル

`TeamInput` に `burst?: boolean`（省略 false = Stage 4 と同一）を足す。

```ts
export type TeamSlotResult = {
  // …Stage 4 のまま（result は通常区間の DamageResult。durationSeconds = duration − fbSeconds）
  /** フルバースト区間の通常攻撃（fullBurst: true、durationSeconds = fbSeconds）。バーストなしなら null */
  fullBurstResult: DamageResult | null;
  burst: {
    /** 発動時刻（秒）。schedule.activationFrames / 60 */
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
  schedule: FixedCycleSchedule | null;
};
```

`computeTeamDamage` の処理: Stage 4 の手順で `buffs` を作った後（3.2 節）、(1) `planFixedCycle` で時刻表を作る、(2) `computeDamage` を通常区間・フルバースト区間の 2 回呼ぶ（`condition.fullBurst` と `durationSeconds` だけ違う）、(3) 定義に `burstDamage` があれば `computeBurstHit` を呼び `activations.length` を掛ける、(4) 合計する。`share` と合計は新しい `totalDamage` で取る。

不変条件（テストで固定）: `burst` なしは Stage 4 と同一。`burst` ありで定義のない枠はフルバースト区間の増分だけ受ける。sim との関係は 6.1 節。

### 5.2 apps/calc の状態（`team.ts`）

- `TeamState` に `burst: boolean` を足す。既定 `true`。
- `TeamAction` に `{ type: 'setBurst'; burst: boolean }`。
- `parseTeamState` は `burst` 欠落を `true` に落とす（保存キーは `v1` のまま）。
- サイクル長・フルバースト時間は定数（`FIXED_BURST_CYCLE`）で、入力欄は作らない（8 節 7）。

### 5.3 UI（最小限）

```
TeamSettingsForm
  └ [バースト] チェック「固定 20 秒サイクル（通常 10 秒 + フルバースト 10 秒）でバーストを回す」
      段階 I / II / III のどれかが埋まらないときは「バースト II のニケがいません（フルバーストは起きると仮定）」の注記
SlotCard
  ├ スキルセクションのバースト行: 対応バッジに「1 発動 X ダメージ × 9 回」
  └ 小結果: 通常攻撃 / バーストスキル / 合計
TeamBreakdown
  ├ 表の列: 攻撃力（素）/ 攻撃力（バフ後）/ 通常攻撃 / バーストスキル / 総ダメージ / 寄与率
  └ ResultPanel: 内訳を「通常区間 / フルバースト区間」の 2 列（boost の行に「フルバースト +0.5」）、
      その下に「バーストスキル」の内訳（倍率・会心期待値・攻撃ダメージ・1 発動・回数・合計）
```

`distributed` は「近似」バッジ（単体ボスでは全額と仮定）。sim の結果は UI に出さない（CLI と自動テストで見る）。

**参照先の変更（2026-09-22 レビュー反映）**: 5.1 節で `TeamSlotResult.result` は「通常区間だけの `DamageResult`」になるので、いま `s.result.totalDamage` / `s.result.dps` を枠の合計として読んでいる箇所は、枠全体の `s.totalDamage` / `s.dps` に付け替える。2026-09-22 時点の該当箇所は `SlotCard.tsx` の小結果（DPS・総ダメージ）、`TeamBreakdown.tsx` の表の DPS・総ダメージ列と展開行の見出し、core `team.test.ts` の `share` の検算（`result.totalDamage` 基準 → `totalDamage` 基準）。`result.baseAttack` / `result.attack` / `result.perTrigger` / `result.boost` は通常区間の値として読んで問題ないので据え置く（`ResultPanel` はフルバースト区間の列を `fullBurstResult` から足す）。付け替え漏れは「`burst` ON のとき表の各行の和が合計行と一致しない」形で現れるので、Stage 3 の手動確認項目（各行の和 = 合計）を `burst` ON で再度行う。

---

## 6. テスト・検証（PDCA）

### 6.1 sim と calc の整合テスト（`src/__tests__/simCalc.test.ts`）

calc は sim の期待値なので、差は**発射サイクルの離散化（マガジンの位相と端数）だけ**になるはず。それを次の 3 段で固定する。

1. **厳密一致するもの**: 同じ `TeamInput` で、バーストスキルの合計（`burst.totalDamage`）と発動回数、フルバースト区間の合計フレーム、1 トリガーのダメージ（`perTrigger`、`boost`）は sim と calc で**完全一致**（同じ関数を通るため）。
2. **離散化誤差の上限**: `burst: false` で、枠ごとの `|sim.triggers − calc.triggersPerSecond × duration| ≤ maxAmmo`（端数は 1 マガジン未満）。`burst: true` の総ダメージは 5 体編成（AR / SMG / SR / RL / MG の各 1 体）で相対差 **3% 以内**。SR / RL は 1 マガジンが 6 発で 10 秒窓に対する位相の影響が大きいので、武器種別に差を出しておき、実際の値を verification.md に記録する。
3. **収束**: `durationSeconds` を 180 → 1,800 → 18,000 と伸ばすと相対差が単調に縮み、18,000 秒で **0.5% 以内**（calc が sim の長時間平均であることの確認）。

代替案（8 節 4）: calc 側で「窓内のトリガー数を周期から数え上げる」補助関数を持ち、sim と厳密一致させる。

### 6.2 core / calc の単体テスト

- core `skills/__tests__/resolve.test.ts`（追加）: `parseSkillDefinition` が `burstDamage` を `skill1` に書いたもの、`burst` に `passive` を書いたもの、`damageType` 不正を `Error` にする。
- core `skills/__tests__/burstDamage.test.ts`: `resolveBurstDamage` が `burst` の `ref` を Lv で解決し 100 で割る。`computeBurstHit` が武器倍率・コア・距離を掛けず、会心と攻撃ダメージ・属性を掛ける。`BURST_SKILL_FULL_BURST_BONUS` の真偽で `boost.fullBurst` が変わる。複数効果の合計。
- core `__tests__/damage.test.ts`（追加）: `computeTriggerDamage` と `computeDamage` の内訳が一致する。`fullBurst: true` で `boost.total` が +0.5、省略は Stage 4 と同一。
- core `__tests__/team.test.ts`（追加）: `burst` なし = Stage 4。`burst` ありで定義ありの枠の `burst.totalDamage = 9 × perActivation`。定義なしの枠はフルバースト区間の増分だけ。`share` が新しい合計で計算される。`resolveTeamBuffs` の切り出しで Stage 4 のテストがそのまま通る。
- core `skills/__tests__/definitions.test.ts`: `burst` の `burstDamage` の `ref` が存在する。`unsupported` な `burst` に `notes` がある。
- calc `team.test.ts`: `setBurst`、欠落の既定値 `true`。

### 6.3 射撃場の実測（スペック固定・1 ヒット）

Stage 2-A / 4 と同じ方法（HUD 総ダメージの差分と的の上の数値。[verification.md](verification.md)）。**自動バースト ON** で撮り、HUD の「FULL BURST」表示と時刻も読む。

| 確認したいこと                                            | 編成（案）                                                         | 予測                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通常攻撃のフルバースト +0.5                               | クルミ（AR、スキルなし）+ I: エーテル + II: デルタ + III: ノワール | クルミの非コア非会心が 1.3x → 1.8x、コア会心が 2.8x → 3.3x に切り替わる（x は calc のスペック固定値から。ノワールの S1 で +16,881.4 が乗る点は Stage 4 どおり）。ノワール自身の 1 ペレットは 136,677.4 × 0.2046 × {1, 1.5} → フルバースト中 {1.5, 2.0}      |
| バーストスキルダメージ（`skill`）とフルバースト補正の有無 | 上と同じ録画のノワール                                             | 攻撃力 136,777.4 → `136,677.4 × 3.5164 × {1, 1.5}` = 480,612 / 720,919。**+0.5 が乗るなら** `× {1.5, 2.0}` = 720,919 / 961,225。会心の有無で値が二重に読めるので、複数回の発動で分布を見る                                                                  |
| 分配ダメージ（`distributed`、単体なら全額）               | クイーン（真）+ I/II（火力に触らない 2 体）                        | `119,796 × 14.2169 × (1 + 0.30) × {1, 1.5}` = 2,214,066 / 3,321,099（+0.5 が乗るなら 3,321,099 / 4,428,132）。S1 の戦闘開始時攻撃力▲（15 秒）が切れてから                                                                                                   |
| 固定サイクルの妥当性（参考）                              | 上の録画の時刻                                                     | 1 回目のフルバースト開始が 10 秒前後か、フルバーストが 10 秒続くかを記録する。ずれても Stage 5 では定数を変えない（Stage 7 でゲージ・CT と一緒に扱う）。III 1 体なら 2 回目は CT 40 秒明けの 50 秒になるはずで、固定サイクルとの差を verification.md に書く |
| 極端値                                                    | 任意                                                               | UI で `burst` OFF にすると Stage 4 と同一                                                                                                                                                                                                                   |

会心期待値・攻撃ダメージ▲がバーストスキルに掛かるかは、クイーン（真）（攻撃ダメージ +30%）の 1 発動で `× 1.3` の有無として同時に確認できる。

### 6.4 完了条件

- 6.1・6.2 のテストと CI（format / lint / typecheck / test / build）が緑。sim と calc の差（武器種別・180 秒）が verification.md に記録されている。
- 6.3 のうち「通常攻撃の +0.5」「バーストスキルダメージ（skill）」の 2 つは実測で一致し、`BURST_SKILL_FULL_BURST_BONUS` の真偽が決まっている。`distributed` は所持キャラ次第。
- [roadmap.md](roadmap.md) の Stage 5 を完了に更新し、[verification.md](verification.md) に Stage 5 節を追加。[requirements.md](requirements.md) 5.1 の式に「フルバースト(0.5) はスキルダメージには（乗る / 乗らない）」を追記。

---

## 7. 実装手順（sim → calc の順。各ステップに検証コマンド）

1. core `skills/types.ts` に `burstDamage` を足し、`parseSkillDefinition` の `burst` 制限を外す + `resolve.test.ts` → `npm test`。
2. core `damage.ts` を `computeTriggerDamage` + `computeDamage` に分け、`fullBurst` を足す + `damage.test.ts` → `npm test`（既存テストは `boost.fullBurst` の追加だけで通る）。
3. core `team.ts` から `resolveTeamBuffs` を切り出す → `npm test`（Stage 4 のテストが無変更で通る）。
4. core `burst/fixedCycle.ts` + `fixedCycle.test.ts` → `npm test`。
5. core `skills/burstDamage.ts` + `burstDamage.test.ts` → `npm test`。
6. **sim** `sim/shooter.ts` + `shooter.test.ts`（cadence との完全一致）→ `npm test`。
7. **sim** `sim/engine.ts` + `engine.test.ts` → `npm test`。`data/skills/` に 8 節 6 のキャラ定義を書き、`definitions.test.ts` を通す。
8. `scripts/sim-run.ts`（任意）で 5 体編成の sim を流し、内訳が読めることを確認。
9. **calc** core `team.ts` の 2 区間モデル + `team.test.ts` → `simCalc.test.ts`（6.1）→ `npm test`。差の実測値を verification.md に控える。
10. **calc** apps `team.ts`（`burst`・`setBurst`・`parseTeamState`）+ テスト → `TeamSettingsForm` のトグル → `SlotCard` / `TeamBreakdown` / `ResultPanel` の最小変更。**チェックリスト**: (a) `SlotCard` と `TeamBreakdown` の `s.result.totalDamage` / `s.result.dps` を `s.totalDamage` / `s.dps` に付け替える（5.3 節）、(b) `TeamBreakdown` の合計行が各行の `totalDamage` の和と一致する、(c) `burst` OFF で Stage 4 と同じ表示になる → `npm run dev` で 1 体の数値が CLI（sim-run）の calc 列と合うことを確認。
11. `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`。
12. 射撃場で 6.3 を実測し、`BURST_SKILL_FULL_BURST_BONUS` を確定。verification.md に記録し、roadmap / requirements を更新して PR。

---

## 8. 決めてほしいこと（推奨付き）

2026-09-22 に 8 点とも推奨案で承認された。

1. **バーストスキルダメージにフルバースト +0.5 を乗せるか** — 推奨: **乗せない**（`BURST_SKILL_FULL_BURST_BONUS = false`）で実装し、6.3 の実測で確定する。→ **2026-09-22 の実測で「乗せない」と確定**（録画 18・19。[verification.md](verification.md) Stage 6 節）。コア・距離も乗らない。nikke-sim は「バースト発動時の即時ダメージはフルバースト開始前のスナップショット」とし、深淵？ note も「使用時点」の計算と書く。Jgaram/nikke-calc は乗せているので両説あり、定数 1 つで切り替えられるようにしておく。
2. **バースト CT とフルバースト時間のデータを Stage 5 で扱うか** — 推奨: **扱わない**。改定後のロードマップは CT 管理を Stage 7 に置いているので、Stage 5 は「毎サイクル I → II → III が必ず発動する」固定サイクルだけにし、`burst_duration` / `skill_cooltime` の `CharacterData` への追加（改定前の案 2 節）も Stage 7 に送る。III 1 体（CT 40 秒）の編成では発動回数が現実の約 2 倍になるが、それは固定サイクルという前提の限界として UI とドキュメントに明記する。代替: CT だけ先に入れる（改定前の `scheduleBursts`）。
3. **sim のダメージを期待値にするか、乱数で抽選するか** — 推奨: **期待値**（会心・コア命中を確率で均した 1 トリガー値をフレームごとに加算）。決定的なので sim と calc の整合テストが安定し、ロードマップの「端数差を除き高精度で一致」をそのまま判定できる。乱数版（分布・分散）は将来 `seed` 付きのオプションとして足す。
4. **sim / calc 整合テストの判定** — 推奨: 6.1 節の 3 段（厳密一致する量・離散化誤差の上限・長時間での収束）。calc は「レート × 秒数」の期待値モデルのままにする（ロードマップの「2 区間期待値モデル」どおり）。代替: calc に「窓内のトリガー数を周期から数え上げる」補助関数を持たせて sim と厳密一致させる（Stage 6 以降のバフ区間でも使えるが、calc が sim の再実装に近づく）。
5. **分配ダメージを Stage 5 に含めるか** — 推奨: 含める（`damageType: 'distributed'`、単体ボスでは全額と仮定して「近似」バッジ）。クイーン（真）で実測できる。代替: 未対応。
6. **定義するキャラ** — 推奨: 既存 5 体のバーストを埋める（ノワール・クイーン（真）が `skill` / `distributed`、マナ・エマ：TU・ウンファ：TU は `unsupported` + notes）+ **ラピ**（バースト III 単体ダメージの最も単純な例。所持していれば）。プリバティは任意。所持キャラを教えてほしい。
7. **UI の範囲** — 推奨: `TeamSettingsForm` のトグル 1 つ（既定 ON）と、結果表の「バーストスキル」列・内訳の 2 区間表示だけ。サイクル長・フルバースト時間の入力欄は作らない（定数。Stage 7 で動的サイクルになれば入力の意味が変わるため）。ミハラ等のフルバースト 5 秒は notes に書く。
8. **持続ダメージ（マナ）** — 推奨: Stage 5 では未対応（`notes` に書く）。「1 秒間隔 × 10 秒」の tick 数（10 か 11 か）と持続ダメージ▲の扱いが未検証で、sim にタイマー付きイベントが入る Stage 6 以降で扱う。代替: tick 数 = 維持秒 / 間隔 で即時ダメージ扱い。

---

## 9. リスク・留意点

- **「毎サイクル必ずフルバースト」の仮定**: III が 1 体で CT 40 秒なら実際のサイクルは 40 秒になり、バーストスキルの回数は約 2 倍に、フルバースト稼働率は 50% → 25% になる。Stage 5 の数値は「理想的な 20 秒サイクル」の値として読む。Stage 7 で CT・ゲージを sim に入れてから calc の稼働率を較正する。
- **バースト I → II → III の同一フレーム発動**: 実機では段階ごとに演出があり数十フレームずれるはず。Stage 5 ではダメージの合計に影響しない（発動フレームの位置が違うだけ）ので 0f にし、録画の時刻を verification.md に残して Stage 7 で較正する。
- **発射サイクルとの独立性**: フルバースト 10 秒とリロードの位相で、フルバースト区間の実トリガー数は sim ごとに変わり得る（マガジンが長い SR / RL / MG で顕著）。calc はこれを平均で置くので、6.1 節の上限を武器種別に記録して「どの程度ずれるか」を先に把握する。ずれが大きければ 8 節 4 の代替案に切り替える。
- **バーストスキルダメージの式は未実測**: コア・距離が乗らないこと、会心・攻撃ダメージが乗ることは参考資料の一致で置いているが、6.3 で確かめるまでは「参考資料どおり、未実測」。フルバースト +0.5 は両説あるので定数で逃がした。
- **分配ダメージの単体ボス仕様**: 「敵の数で除算」が単体で全額になるかは実測で決める。パーツ持ちボスでの分配は対象外。
- **`computeDamage` の分割**: 既存の calc UI は `DamageResult` の形に依存している（`boost` の内訳表示など）。`DamageResult = TriggerDamage & {…}` の形で互換を保ち、追加フィールド（`boost.fullBurst`）だけ表示に足す。枠の合計は `result.totalDamage` ではなく `TeamSlotResult.totalDamage` になるので、参照の付け替え（5.3 節）を実装手順 10 のチェックリストで拾う。
- **射手の状態機械のオフバイワン**: `wait` の「判定してから減らす」規則と、チャージ・リロード時の `− 1` を 4.2 節の絶対フレーム表で固定した。実装は表のとおりのフレーム列を返すことを `shooter.test.ts` で最初に確認してから、エンジンに組み込む。
- **sim の性能**: 5 体 × 10,800f のループは数万回の単純な加算で、テストで 18,000 秒（1,080,000f）を回しても数百 ms に収まる見込み。イベント記録は `trace: true` のときだけにして配列の肥大化を避ける。
- **説明文の更新**: Stage 4 と同じく `checkedAt` と `definitions.test.ts` で検知する。
- **Stage 6 への拡張余地**: sim はフレームループにバフのタイマーを足すだけ（`resolveTeamBuffs` を区間ごとに作り直す）。calc は `planFixedCycle` の `activationFrames` + 持続時間で区間分割できる。

---

## 10. 実装時の差分と知見（2026-09-22）

設計書からずらした点と、実装して分かったこと。

- **`SimInput.burst` は省略可**: `TeamInput` と同じ形（`burst?: boolean`、省略 false）にして、sim と calc に同じ入力オブジェクトをそのまま渡せるようにした（`simCalc.test.ts` と `sim-run.ts` はそうしている）。4.1 節の `burst: boolean`（必須）からの変更。
- **`slotBurstHit`**（`skills/burstDamage.ts`）: 「定義 + Lv + 通常攻撃の `TriggerDamage` + `BuffTotals` → `BurstHitResult | null`」の共通関数を足し、sim と calc の両方がこれを呼ぶ。バーストヒットの攻撃力・会心・攻撃ダメージは通常区間の 1 トリガーと同じバフ後の値。
- **calc の発動回数は割当枠だけ**: 実装当初、定義に `burstDamage` があるすべての枠に 9 回を付けていた（同段階の 2 体目にも付く）バグを `simCalc.test.ts` の厳密一致で検出し、`schedule.assignment` に含まれる枠だけにした。sim 先行の整合テストが calc のバグを拾った最初の例。
- **`hit` は割当に関係なく計算する**: 定義があれば `burst.hit`（1 発動の内訳）は常に出し、`activations` が空なら合計 0。UI で「1 発動 X × 0 回」と見せて、同段階の 2 体目や `burst` OFF でも値を確認できるようにした。
- **AR の 180 秒トリガー数は 1,830**: 30 マガジン（10,650f）+ 31 マガジン目の 30 発（10,650 + 5 × 29 < 10,800）。4.5 節に書いた 1,829 は数え間違い。
- **MG の位相ロック**: 周期 560f と 1,200f の gcd 80 が 600 を割り切らないので、フルバースト区間の割合が長時間でも 50.13% に張り付く（[verification.md](verification.md) Stage 5 節）。6.1 節の「収束」は 0.5% 以内で成立するが、厳密に 1/2 に収束するのは周期と 600 が通約しない武器だけ。
- **`resolvePassives` は `burstDamage` を読み飛ばす**: `SkillEntry.effects` が `SkillEffect`（`PassiveEffect | BurstDamageEffect`）の配列になったので、`kind` で分岐する。`definitions.test.ts` の「`burst` は unsupported」の固定は外し、代わりに `burstDamage` の値が 100% 以上（倍率ダメージ）であることを見る。
- **CLI**: `npm run sim -- --ids 271,870,10 --fixed-spec` で sim / calc の枠別の内訳表が出る（`packages/core/scripts/sim-run.ts`）。verification.md の数値はここから採った。

## 経過

- 2026-09-26 まで冒頭の状態の行に書いていたもの: **承認済み・実装完了（2026-09-22）**。2026-09-22 のロードマップ改定を反映した改訂版。レビュー 2 点（4.2 節の境界、5.3 節の参照先）を反映後、第 8 節の 8 点はいずれも推奨案で確定。実装での差分は 10 節
