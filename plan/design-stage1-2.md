# Stage 1 + Stage 2 設計書

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`, `plan/references.md`）
- 状態: 承認済み（2026-09-21）。実装はこの文書に従う
- 関連: [requirements.md](requirements.md)、[roadmap.md](roadmap.md)、[references.md](references.md)
- 作成日: 2026-09-21

## Context

要件定義（2026-09-21 確定）で「core → calc → sim の順、通常攻撃のみから始めるスモールステップ」が決まり、次のアクションとして Stage 1（core 最小版）と Stage 2（calc v1: 通常攻撃のみの静的 DPS）の設計が求められている。本プランは、リポ構成・データ取得スクリプト・計算式・テスト・検証手順を実装可能な粒度で定める。

このセッションで確認した事実（プランの前提）:

- **環境**: Node.js 未インストール（winget 1.29 / Python 3.13 / git 2.55 / gh はあり）。`D:\nikke_project` は git 未初期化。`nikke_calc` / `nikke_sim` は空。
- **Blablalink CDN**: 難読化アルゴリズム（後述）を Python で再現し、キャラ一覧（202 体）と全 202 体の roledata（ja/en、1 体 74〜117 KB）の取得に成功。失敗 0、6 並列で約 24 秒。
- **roledata に武器パラメータが入っている**: `shot_detail` にキャラ別の武器倍率・装弾数・リロード時間・発射レート・チャージ時間・チャージ倍率・コア倍率がある。ロードマップ Stage 1 の「武器種ごとの基本パラメータを手書き定義」は不要になり、**キャラごとに CDN 値を使う**。
- **レベル曲線は共通曲線 × Lv1 値では再現できない**（丸め誤差が最大 18）。曲線は全キャラ分（1400 レベル × 3 ステータス）をそのまま保存する。
- **ユーザー決定**: モノレポ / 正規化データはリポにコミット / ゲーム内実測値を提供できる。

---

## 1. リポジトリ構成（モノレポ、npm workspaces）

```
D:\nikke_project\
├─ package.json                # private, workspaces: packages/*, apps/*
├─ tsconfig.base.json          # strict, moduleResolution: bundler, erasableSyntaxOnly, noEmit
├─ vitest.config.ts            # test.projects: ['packages/*', 'apps/*']
├─ .gitignore  .nvmrc(24)  LICENSE(MIT)  README.md
├─ plan/                       # 既存ドキュメント
├─ packages/core/              # @nikke/core（ビルドしない。exports: "./src/index.ts"）
│  ├─ scripts/
│  │  ├─ fetch-data.ts         # エントリ。`node scripts/fetch-data.ts`（Node 24 の型ストリッピング、tsx 不要）
│  │  ├─ blablalink/path.ts    # 難読化パス（djb2 + md5）
│  │  ├─ blablalink/client.ts  # fetch + User-Agent + 並列 4〜6 + リトライ 3 回
│  │  └─ normalize.ts          # 生 JSON → 正規化型
│  ├─ data/characters/index.json        # 軽量一覧（コミット）
│  ├─ data/characters/{resourceId}.json # 曲線 + 武器 + 強化係数（コミット、1 体 約 25 KB）
│  ├─ .cache/                  # CDN 生 JSON（.gitignore）
│  └─ src/
│     ├─ index.ts  types.ts  stats.ts  weapons.ts  element.ts  load.ts
│     ├─ damage.ts  cadence.ts          # Stage 2
│     └─ __tests__/*.test.ts
└─ apps/calc/                  # @nikke/calc（Vite + React 19）
   ├─ index.html  vite.config.ts  tsconfig.json
   └─ src/ main.tsx  App.tsx  components/CharacterForm.tsx  EnemyForm.tsx  ResultPanel.tsx
```

- 既存の空ディレクトリ `nikke_calc` / `nikke_sim` は削除。`apps/sim` は Stage 7 まで作らない。
- core は **ビルドせず TS ソースを直接 exports**。Vite は workspace ジャンクション経由で `packages/core/src` を解決する（`optimizeDeps.exclude: ['@nikke/core']` を保険で入れる）。相対 import は `./foo.ts` と拡張子付きで統一（Node 直接実行 / Vite / Vitest で同じコードが動く）。
- **Node 型ストリッピングの前提**（root と core の `package.json` に `"type": "module"`、`tsconfig.base.json` に `"allowImportingTsExtensions": true` + `"noEmit": true` + `"erasableSyntaxOnly": true`）。`erasableSyntaxOnly` により **`enum` / `namespace` / クラスのパラメータプロパティは使用禁止**。型は Union 型（`type WeaponType = 'AR' | ...`）と `as const` オブジェクトで書く。
- `apps/calc/tsconfig.json`: エディタの補完・定義ジャンプ用に `paths` を書く（`"@nikke/core": ["../../packages/core/src/index.ts"]`, `"@nikke/core/*": ["../../packages/core/src/*"]`）。
- `apps/calc/vite.config.ts`: `publicDir: '../../packages/core/data'`（`/characters/...` で静的配信、`dist/` にコピーされる）、`server.fs.allow: ['../..']`（プロジェクトルート外の core を参照するため）、`base: process.env.VITE_BASE_PATH ?? '/'`（GitHub Pages 用、今は使わない）。
- 依存: root devDeps `typescript`, `vite`, `vitest`, `@types/node`。calc: `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`。**メジャー番号は固定せず、`npm install -D vite vitest ...` で入る最新安定版を採用**し、peer 不整合が出た場合だけ調整する。lint は後回し。
- root scripts: `fetch-data`, `test`, `typecheck`, `dev`, `build`。

---

## 2. Stage 1: core 最小版

### 2.1 データ取得スクリプト（`packages/core/scripts/`）

**難読化パス**（参考 OSS の実装を読んで仕様として再実装。コードは流用しない）:

- 先頭 `/` を除いたフルパス `full`（例 `roledata/90-v2-ja.json`）を `/` で分割。
- 最後以外の各セグメント i は `"<2文字>-<2桁>"`。`h = djb2(full, PRIME[i])`（初期値 = PRIME[i]、`acc = (acc*33 + charCode) | 0` で int32 に切り詰め）、`r = ((h % p) + p) % p`。2 文字 = `chr(97 + floor(r/26) % 26) + chr(97 + r % 26)`、2 桁 = `String(r % 99).padStart(2,'0')`。
- 最後のセグメントは `md5(full) + "." + 元の拡張子`。
- `PRIME = [224737, 1000639, 2654435761, 2654435769, 1000621, 4294967291]`。
- 検証済み例: `character/ja/nikke_list_ja_v2.json` → `jl-75/xw-80/26ff66bb02287f79acf7b47a9b79161c.json`、`character/en/nikke_list_en_v2.json` → `yl-57/hd-03/1bf030193826e243c2e195f951a4be00.json`。この 2 例を `path.test.ts` の固定値にする。
- ヘッダ `User-Agent: Mozilla/5.0` 必須。ベース `https://sg-tools-cdn.blablalink.com`。

**取得対象**: 一覧 `/character/{ja,en}/nikke_list_{loc}_v2.json`、詳細 `/roledata/{resourceId}-v2-{ja,en}.json`（202 体 × 2 = 404 リクエスト）。ステータス・武器値は ja/en で同一（確認済み）なので、数値は en から、名前は両方から取る。オプション `--limit N`（動作確認用）、`--locale`。出力はキー順ソートで決定的にし、git diff を読めるようにする。生 JSON は `.cache/` に置いて再実行時はキャッシュ優先（`--refresh` で再取得）。

### 2.2 正規化データ型（`src/types.ts`）

`index.json`（全体で数十 KB）:

```ts
type CharacterIndexEntry = {
  resourceId: number;
  name: { ja: string; en: string };
  rarity: 'SSR' | 'SR' | 'R';
  class: 'Attacker' | 'Defender' | 'Supporter';
  corporation: string;
  element: 'Fire' | 'Water' | 'Wind' | 'Electronic' | 'Iron';
  weaponType: 'AR' | 'SMG' | 'SR' | 'RL' | 'SG' | 'MG';
  burstStep: 'Step1' | 'Step2' | 'Step3' | 'AllStep';
};
```

`{resourceId}.json`:

```ts
type CharacterData = CharacterIndexEntry & {
  levelCurve: { attack: number[]; hp: number[]; defence: number[] }; // index = level-1、長さ 1400
  statEnhance: {
    gradeRatio: number;
    gradeAttack: number;
    gradeHp: number;
    gradeDefence: number;
    coreAttack: number;
    coreHp: number;
    coreDefence: number;
  }; // CDN 生値（1e-4 単位）
  crit: { rate: number; damage: number }; // 0.15, 1.5（全キャラ共通と確認済み。将来差分に備え保持）
  bonusRange: { min: number; max: number } | null; // RL は (0,0) → null
  shot: {
    damage: number; // 1e-4 単位（557 = 5.57%、SG は全ペレット合計）
    shotCount: number; // SG ペレット数（通常 10）
    muzzleCount: number;
    maxAmmo: number;
    reloadTime: number /*秒*/;
    reloadBullet: number /*0..1、1 未満は分割リロード*/;
    rateOfFire: number;
    endRateOfFire: number;
    rateOfFireChangePerShot: number;
    rateOfFireResetTime: number; // rpm
    chargeTime: number /*秒*/;
    fullChargeDamage: number /*倍率、1.0 or 2.5 等*/;
    coreDamageRate: number; // 倍率、通常 2.0（Miranda 等 2.5）
    inputType: 'DOWN' | 'UP' | 'DOWN_Charge';
    fireType: string;
    penetration: number;
    maintainFireStance: number;
    uptypeFireTiming: number;
  };
  skills: { skill1: SkillRaw; skill2: SkillRaw; burst: SkillRaw }; // 説明文 + description_value_list（Stage 4 用に保持のみ）
};
```

単位変換は normalize.ts で 1 箇所に集約（`reload_time 250 → 2.5`、`damage 557 → そのまま 557 を保持し計算側で /10000`、`full_charge_damage 25000 → 2.5`、`core_damage_rate 20000 → 2.0`、`critical_ratio 1500 → 0.15`、`critical_damage 15000 → 1.5`）。**方針: 曲線と武器倍率は生の整数のまま保持し、倍率化は計算関数で行う**（丸め誤差の持ち込みを防ぐ）。

### 2.3 ステータス算出（`src/stats.ts`）

Blablalink（ShiftyPad）が表示する値と同じ式。参考記事（bodoge-intl）の「凸ごとに無凸基礎値 × 2% + 固定値、コアは 3 凸値 × 2%」と一致する。

```
levelStat = levelCurve[stat][level - 1]
base      = floor( levelStat × (1 + grade × gradeRatio / 10000) + grade × grade_<stat> )
stat      = round( base × (1 + core × core_<stat> / 10000) )
```

- `computeStat(char, 'attack'|'hp'|'defence', level, grade, core)` と `computeBaseStats(char, {level, grade, core})`。
- 入力検証: level 1..曲線長、grade は SSR 0..3 / SR 0..2 / R 0、core は SSR のみ 0..7。範囲外は例外。
- 係数は SSR (2%, +20 / +3000 / +100)、SR (+18 / +2300 / +90)、R (+16 / +2300 / +80) の 3 パターンのみ（全 202 体で確認済み）。
- OL 装備・キューブ・好感度・リサイクルルームは含めない（要件どおり）。

### 2.4 武器モデル定数（`src/weapons.ts`）と属性（`src/element.ts`）

CDN にない「解釈ルール」だけを置く小さな表:

- 60 fps 前提のフレーム量子化: 発射間隔 `frames = ceil(3600 / rpm)`（AR 720→5f=12/s、SMG 1440→3f=20/s、SG 90→40f、SR/RL 60→60f、MG 上限 1f=60/s）。参考 OSS の検証結果と一致。
- チャージ武器（SR/RL, inputType UP）: 1 発の所要 = `max(frames, chargeTime×60) + chargeReleaseFrames`。`chargeReleaseFrames` は既定 0（Stage 2 の実測で較正。参考 OSS は約 22f）。
- MG スピンアップ: i 発目のレート `min(3600, rateOfFire + i × rateOfFireChangePerShot)` rpm、`rateOfFireResetTime`（1 秒）以上の中断で初期化（リロード 2.5 秒 > 1 秒なので毎マガジン再スピンアップ）。コミュニティ値「約 3.75 秒で最大」と照合する。
- 属性相性サイクル: 炎→風→鉄→電撃→水→炎（`isAdvantage(attacker, enemy)`）。

### 2.5 読み込み（`src/load.ts`）

`loadCharacterIndex({baseUrl, fetch})`, `loadCharacter(resourceId, {baseUrl, fetch})`。calc は `import.meta.env.BASE_URL` を渡す。Node のテストからは `fs` で読む薄いアダプタを用意。

### 2.6 Stage 1 のテスト・検証

- `path.test.ts`: 上記 2 例の固定値。
- `normalize.test.ts`: `.cache/` の実 JSON 1 体（Emma, id 90）を fixture 化して単位変換を確認（reloadTime 2.5、maxAmmo 300、coreDamageRate 2.0、crit 0.15/1.5）。
- `stats.test.ts`: (a) Emma Lv1 = 500、Lv200 = 17576（CDN 生値）、(b) **ユーザー提供のゲーム内実測値 3〜5 体**（Lv・凸・コアを添えて。ゲーム内表示は装備・キューブ・好感度込みなので「基本攻撃力」または装備を外した値で）、(c) Blablalink の ShiftyPad スライダー表示値との一致。
- 完了条件: `npm run fetch-data` が 202 体・失敗 0 で完走し、`npm test` が緑。

---

## 3. Stage 2: calc v1 — 通常攻撃のみの静的 DPS

### 3.1 入力

| 区分  | 項目                                                                      | 既定                                           |
| ----- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| ニケ  | キャラ（index から選択）、レベル、限界突破、コア                          | Lv 200 / 3 / 0                                 |
| 敵    | 防御力、属性（5 種 + なし）、コア有無                                     | 射撃場プリセット: 防御 100、属性なし、コアあり |
| 条件  | コア命中率（0〜1）、距離ボーナス（on/off、RL は常に off）、戦闘時間（秒） | 1.0 / on / 180（射撃場照合時は 90）            |
| SR/RL | フルチャージ前提（v1 は常に on）                                          | on                                             |

### 3.2 計算（`src/damage.ts`, `src/cadence.ts`）— すべて純関数

```
atk        = computeStat(char, 'attack', level, grade, core)
baseHit    = max(1, atk − enemyDef)                                // 減算式（吟味.net 検証）
weaponMult = shot.damage / 10000                                    // SG は全ペレット合計
chargeMult = (SR/RL かつフルチャージ) ? shot.fullChargeDamage : 1
boost      = 1 + coreRate × (shot.coreDamageRate − 1)               // 通常 +1.0 × 命中率
                 + crit.rate × (crit.damage − 1)                    // 0.15 × 0.5
                 + (distanceBonus ? 0.3 : 0)
element    = isAdvantage(char.element, enemy.element) ? 1.1 : 1.0
perTrigger = baseHit × weaponMult × chargeMult × boost × element     // 1 トリガー（SG は 1 引き金＝全ペレット）
```

秒間発射数（マガジン 1 周期の平均、フレーム単位で離散化）:

```
shotFrames[i]   = 2.4 節のルール（固定レート / チャージ / MG スピンアップ）
magazineFrames  = Σ_{i<maxAmmo} shotFrames[i]
reloadFrames    = ceil(reloadTime × 60) × chunks    (chunks = ceil(1 / reloadBullet)、通常 1)
cycleFrames     = magazineFrames + reloadFrames
triggersPerSec  = maxAmmo / (cycleFrames / 60)
DPS             = perTrigger × triggersPerSec
total           = DPS × duration
```

出力: 1 トリガー期待ダメージ、秒間発射数、DPS、総ダメージ、内訳（atk、baseHit、boost の各項、周期秒数）。

`DPS` は「無限時間の定常平均」であり、`total = DPS × duration` は初弾が即時に出ること・終了時点がマガジン周期のどこかを無視する。有限時間との離散誤差は仕様として許容し、3.4 節の照合観点に含める。

**対応外の明示**（計算はするが結果に「近似」「未対応」バッジを出す）:

- 未対応: `muzzleCount ≠ 1`（二丁持ち SMG 6 体、Zwei、Noah）、`inputType === 'DOWN_Charge'`（Liberalio、RL 5 体）、`maintainFireStance ≠ 0`（A2、Raven、Scarlet: Black Shadow）、`fireType === 'ProjectileCurve'`（Cinderella）、`penetration > 0`。
- 近似: 分割リロード `reloadBullet < 1`（SG 9 体、RL 5 体、Grave。実機は「開始モーション + 1 発装填 × N + 終了モーション」の多段構造の可能性があり、`chunks = ceil(1 / reloadBullet)` は v1 近似）、MG スピンアップ、チャージ解放遅延。
- スコープ外（無視することを UI に明記）: スキル・バースト・バフ、弾数増加、ヒット率、SG のペレット命中率（全弾命中前提）。

### 3.3 UI（`apps/calc`）

1 画面。左にフォーム（キャラ選択は ja 名 + en 名で検索可）、右に結果と内訳。キャラ選択時に `{resourceId}.json` を lazy fetch。状態は React の `useState` のみ（ルーティング・状態ライブラリなし）。数値入力は `<input type=number>` と範囲バリデーション（core の検証関数を再利用）。

### 3.4 Stage 2 のテスト・検証

- `cadence.test.ts`: AR 60 発 + 1.0 秒 → 周期 300f + 60f = 6.0 秒、10 発/秒。SMG 120 発 3f + 60f → 20 発/秒相当。SR 6 発 60f + 2.0 秒。MG 300 発のスピンアップ合計が約 3.75 秒 + 残りは 1f。
- `damage.test.ts`: 極端値（防御 0、コア率 0 と 1、属性有利あり/なし、距離 on/off）で手計算値と一致。ginmy.net の公開実測（Lv140 AR、防御 100 ダミー）を再現できるかを 1 ケース。
- **射撃場照合**（完了条件）: 武器種 6 種で、通常攻撃に影響するスキルを持たないキャラ（R/SR キャラや、通常攻撃に自己バフが乗らないキャラを優先）を 1 体ずつ選び、90 秒の与ダメ合計と `duration=90` の計算値を比較。差分と原因（チャージ遅延・スピンアップ・ペレット命中・分割リロードのモーション構造）を `plan/verification.md` に記録し、`chargeReleaseFrames` 等の定数を較正する。
- 照合観点として `plan/verification.md` に明記: 定常 DPS × 90 秒と実測には、初弾即時発射と終了時点の周期端数による **数%〜数発分の離散誤差が原理的に生じる**（装弾数が少なく周期が長い SR/RL で顕著）。この範囲のズレは異常ではない。厳密比較が必要なら「90 秒内の発射数を周期から数え上げる」補助計算を出力に加える。
- calc の smoke テスト（任意）: jsdom で App が描画され index.json 読み込み後にセレクトが埋まる。

---

## 4. 実装手順（各ステップに検証コマンド）

**Stage 1**

1. Node 24 LTS を導入: `winget install OpenJS.NodeJS.LTS` → 新シェルで `node --version`（v24.x）/ `npm -v`。
2. `git init`、`nikke_calc` / `nikke_sim` 削除、root `package.json`（`"type": "module"` 必須）/ `tsconfig.base.json`（`allowImportingTsExtensions` 必須）/ `vitest.config.ts` / `.gitignore` / `.nvmrc` / `LICENSE` / `README.md` → `npm install` 成功。
3. `packages/core` 骨格（`package.json` exports + `"type": "module"`、`tsconfig.json`、`src/index.ts`）→ `npm run typecheck`。
4. `scripts/blablalink/path.ts` + `path.test.ts` → `npm test`。djb2 の `| 0` による int32 オーバーフローが Python 再現値（固定 2 例）と一致することを確認。
5. `client.ts` + `fetch-data.ts --limit 3` → `data/characters/index.json` と 3 ファイル生成。
6. `normalize.ts` / `types.ts` 確定 → `npm run fetch-data` 全件（202 体、失敗 0）。`git status` で `data/characters/` がコミット対象、`.cache/` が無視されていることを確認。
7. `stats.ts` + `stats.test.ts`（CDN 値 + ゲーム内実測値）→ `npm test`。
8. `weapons.ts` / `element.ts` / `load.ts` → typecheck / test 緑。初回コミット。

**Stage 2**

9. `cadence.ts` + `damage.ts` + テスト → `npm test`。
10. `apps/calc` 骨格（Vite + React、`publicDir` / `base`）→ `npm run dev` でブラウザから `/characters/index.json` が 200。
11. フォーム + 結果パネル + 未対応バッジ → 1 体を手計算と一致確認。
12. `VITE_BASE_PATH=/nikke_project/ npm run build` → `dist/characters/` と `index.html` のパスを確認、`npm run preview`。
13. 射撃場照合（6 武器種）→ `plan/verification.md` に記録、定数を較正。Stage 2 完了コミット。

---

## 5. 未決事項・リスク

- **ゲーム内攻撃力の実測**: 表示値に装備等が乗る。「基本攻撃力」欄または装備なし状態で測る必要がある。ShiftyPad の値との一致を第一の判定にし、ゲーム内は補助にする。
- **チャージ武器の実発射間隔**と **MG スピンアップの実測**は射撃場照合で決める（定数化して差し替えやすくする）。
- **Blablalink データの再配布可否**は公開準備（Stage 8 以降）で確認。不可なら `data/` を `.gitignore` に移し、README に `npm run fetch-data` 手順を書く（スクリプトは最初からその前提で動く）。
- Vite / Vitest の組み合わせで peer 不整合が出た場合は、`npm install` 時点の最新安定版同士の組み合わせに揃える（メジャー番号は固定しない）。
- 曲線データ 5 MB はキャラ単位の lazy fetch で回避。将来必要なら「変化点のみ保存」に圧縮。
