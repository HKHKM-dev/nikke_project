# 設計書: 戦闘力による一覧の並び替え

- 対象: 戦闘力の計算（`packages/core/src/combatPower.ts`）、育成のマスタの戦闘力の値（`packages/core/data/masters/` の `cubes.json`・`collections.json`・`overload.json`）、オーナーの育成データでの突き合わせ（`tools/builds/combat-power.ts`）
- 状態: 一部完了（段 1 は実装済み。段 2 以降は未起案。4 節）
- 関連: C-0981・C-0982（式。根拠は V-0685）、[design-build-snapshot.md](design-build-snapshot.md)（育成データのスナップショット）、[design-cdn-refresh.md](design-cdn-refresh.md)（CDN の取り直し）
- 作成日: 2026-11-07

## 1. 背景

- キャラの一覧を戦闘力の降順で並べたい。実機の一覧の既定の並びが戦闘力の降順で、利用者が画面を直感的に扱える。
- 戦闘力の式は C-0981 で確定した（攻撃力・HP・防御力・会心・スキル Lv と、OL の行・キューブ・コレクション（宝物）の値）。

## 2. 決めたこと（2026-11-07、オーナー）

1. 個人の育成状況をコードに組み込まない。
2. 育成状況は、JSON で入出力できる機能にする。どのような機能にするかは未定。
3. ひとまず、オーナーの JSON を取り込み、実際の並びと合っているかを確かめる（段 1）。

## 3. 段 1: 計算と突き合わせ（実装済み）

### 3.1 データ

- キューブ・コレクション・宝物の値は CDN にある（`powers`）。`fetch-data` が正規化して `CubeData.powers`（index = Lv − 1）・`CollectionData.powers`（index = Lv）・`CollectionMaster.treasurePower`（段階 1〜3 で同じ値でなければ止める）に書く。
- OL の行の値（ゲームの `function_battlepower`）は CDN に無いので、`overload.json` に手書きする（`OverloadOptionData.powers`。index = Lv − 1）。ShiftyPad の `state_effects` に出た点はテストで固定し、出ていない Lv は C-0982 の規則の値。

### 3.2 計算

- `computeCombatPower(character, { growth, build, skillLevels, treasure }, masters)`。入力は `--build` の 1 件と同じ形（`BuildInput` と育成・スキル Lv）で、オーナーの育成は持たない。
- 攻撃力・HP・防御力は `computeCombatStat`（キャラ画面の値）。宝物は `treasure`（解放しているか）だけを見て、ステータスと値を足す（V-0685: ShiftyPad の Lv 0 も同じ。段階は戦闘力に効かないので、スナップショットの段階が未確定（`phase: null`）でも出せる）。
- アリーナの戦闘力は、`build.cube` をアリーナ用の欄のキューブにして同じ関数を呼ぶ。スナップショットはアリーナ用の欄を持たないので、段 1 では扱わない。

### 3.3 突き合わせ

- `npm run build:combat-power -- [<スナップショット>] [--actual <生の JSON>] [--list]`。育成データのスナップショット（`npm run build:import` が書く JSON）から戦闘力を出し、ShiftyPad の生のデータの `combat` と、値・降順の並び（高低が食い違う 2 体の組の数）を比べる。結果は画面に出すだけで、ファイルには書かない（オーナーのデータは `private/` から出さない）。
- 結果（2026-11-07）: 2026-09-24〜10-29 の 4 回の取得とも、全キャラの値が一致し、並びの食い違いは 0。ゲームの戦闘力が同じキャラの組があり、その組の一覧での順は式では決まらない（4 節）。

## 4. 残り

- 育成状況の JSON の入出力（2 節の 2）。形と画面は未定。スナップショット（`BuildSnapshot`）の形がそのまま使えるかも含めて、起案するときに決める。
- 一覧の画面の並び替え。
- 戦闘力が同じキャラの、実機の一覧での順（並べる 2 つ目の鍵）。実機の一覧のスクショと突き合わせれば分かる。
- 会心の項の形・取得に出ていない Lv（V-0685「分からないこと」）。次の育成データの取得で、`npm run build:combat-power` を回して確かめる。

## 5. 経過

- 2026-11-07: 起票。段 1（データ・計算・突き合わせの道具）を実装した。
