# Stage 9 設計書: 宝物（お気に入りアイテム）版スキル

- 対象: `D:\nikke_project`（要件は `plan/requirements.md`, `plan/roadmap.md`）
- 状態: **完了（2026-09-23）。実装での差分は 12 節、検証は [verification.md](verification.md) Stage 9 節**。承認は 2026-09-23。宝物の段階の既定値は 0（宝物なし、ユーザー指定）。11 節の 7 点はいずれも推奨案で承認。レビューの 3 点（解決済みの効果への `targetWeapon` の伝播、`applyTreasure` の非破壊性、`applyTreasureToTeam` で 1 か所にまとめる）は 3 節・4.2 節に反映済み
- 関連: [design-stage8.md](design-stage8.md)、[verification.md](verification.md) Stage 8 節（録画 36〜38）、[roadmap.md](roadmap.md)
- 作成日: 2026-09-23

## Context

録画 36・37 のドレイク（resourceId 101）は宝物持ちで、射撃場のスペック固定でも宝物によるスキル変更が反映されていた。ところが `fetch-data.ts` が取り込む `roledata-{id}.json` は基礎スキルだけで、Stage 8 のドレイクの定義（`data/skills/101.json`）も基礎版で書いてある。このため、実測したドレイクと計算のドレイクは別物になっている（S1 の SG 向け攻撃力 63.88%、S2 の「5 回攻撃 201.6%」、バーストの 3009.6% と攻撃ダメージ 31.68% が抜ける）。

Stage 9 では、宝物版のスキルを CDN から取り込み、編成の枠ごとに「宝物の段階」を選べるようにし、ドレイクの宝物版を定義する。Stage 10（射撃が変わるバフ）の前に入れる小さな Stage で、sim・calc の時間モデルには触らない。

**設計の芯は「宝物は、スキル 3 枠のどれを別の SkillRaw・別の定義に差し替えるかだけ」であること。** 差し替えは `computeTeamDamage` / `runSimulation` の最上位で 1 回だけ行い（引数は書き換えず、差し替えた枠だけ浅いコピーを作る）、その先の解決（`resolvePassives` / `resolveTimed` / 倍率ダメージ / 時刻表）は Stage 8 のまま触らない。段階 0 の計算は Stage 8 と厳密に一致する。

ロードマップは、この Stage を 9 に挿入し、旧 Stage 9〜11+ を 10〜12+ に繰り下げる（番号規則「1 始まりの整数」のため。11 節 1）。

---

## 0. 設計前に分かったこと（2026-09-23）

### 0.1 データの出どころ

宝物のデータは roledata ではなく、装備系の別ファイルにある。論理パスはユーザーの別プロジェクト（`D:\NIKKE_Damage_Calculator\scripts\build_misc_masters_from_cdn.py`。Blablalink の JS バンドルから抜き出したもの）に記録があった。難読化は roledata と同じで、既存の `obfuscatePath` がそのまま使える。

| 論理パス                                    | 中身                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/equip/favorite_rare_map.json`             | 宝物 ID の一覧。`{"R": [6 件], "SR": [6 件], "SSR": [21 件]}`                                                    |
| `/equip/{ja,en}/favorite_{favoriteId}.json` | 宝物 1 個分。SSR（`2xxx01`）だけが `favoriteitem_skill_group_data` を持つ。R / SR は人形（スキルの差し替えなし） |

- ドレイクの宝物は `200801`「ヴィランのフィギュア」。取得した値は、ユーザーが Blablalink の画面から写した数値（S1 の 63.88% / 50.14%、S2 の 5 回攻撃 201.6%、バースト 3009.6% / 最大装弾数 72.18% / 攻撃ダメージ 31.68%）と Lv10 で全部一致した。
- Blablalink の画面の通信は直接見ていない。パスは JS バンドル由来の記録、中身は画面の数値との一致で確かめた。

### 0.2 `favorite_{id}.json` の形（SSR）

```jsonc
{
  "id": 200801,
  "name_localkey": "ヴィランのフィギュア",
  "favorite_rare": "SSR",
  "weapon_type": "SG",
  "name_code": 5024, // roledata の name_code と同じ値でキャラに結び付く
  "max_level": 2, // 段階は 3 つ（0.4 節）
  "atk": [9688, 9688, 9688], // 宝物のステータス（0.5 節。取り込まない）
  "collection_skill_group_data": [], // 人形のコレクションスキル（取り込まない）
  "favoriteitem_skill_group_data": [
    { "skill_change_slot": 1, "info": {} }, // info は roledata の skill1_detail と同じ形
    { "skill_change_slot": 2, "info": {} },
    { "skill_change_slot": 3, "info": {} },
  ],
}
```

- `info` は `RawSkillDetail`（`id` / `name_localkey` / `description_localkey` / `description_value_list`）と同じ形で、既存の `toSkill()` がそのまま使える。
- `skill_change_slot` は差し替え先（1 = スキル 1、2 = スキル 2、3 = バースト）。SSR 21 種とも 3 スロットが揃っている。ja と en でスロットと ID の並びは一致した。
- バーストの `info` には `skill_cooltime` などが**無い**。CT は基礎版の roledata から取る（宝物で CT が変わるかは未確認。10 節）。

### 0.3 キャラとの対応付け

- `name_code` で対応付けられる。いまの roledata では 21 種すべてが 1 体だけに当たる: 72 ディーゼル、210 エクシア、142 プリム、100 ラプラス、112 バイパー、32 ミランダ、352 ヘルム、101 ドレイク、141 ミルク、30 ポリ、192 トーブ、150 ジュリア、550 ベイ、170 プリバティ、390 ツバイ、80 センチ、281 モラン、580 ファントム、411 フローラ、280 ロザンナ、140 シュガー。
- 裏取りとして、スキル ID の下 6 桁が「基礎版 + 50」になっている（ドレイク 2101101 → 2101151、1101301 → 1101351）。先頭の桁は基礎版と違うことがある（ミルク 1141101 → 2141151）ので、下 6 桁で比べる。
- 主力 3 体（リター・クラウン・アリス）は対象外。スキル定義のあるキャラ（10, 93, 95, 101, 231, 271, 290, 870）で宝物を持つのはドレイクだけ。

### 0.4 解放の段階と順序

- `max_level: 2` で段階は 3 つ。**1 段階ごとに 1 スキルずつ**差し替わる。
- どのスロットが何段階目かを示すフィールドは無く、`favoriteitem_skill_group_data` の**配列の順が解放順**。ユーザーの別プロジェクトで、シュガー（配列順 1,2,3）・ロザンナ（2,3,1）の実機と一致を確かめてある。21 種の配列順は 5 通り（123 / 132 / 213 / 231 / 321）に分かれるので、スロット番号順に並べているだけではない。
- ドレイクの配列順は 1,2,3。録画 36・37 では 3 スキルとも宝物版だったので、3 段階目まで解放済み。

### 0.5 宝物のステータスは乗らない（スペック固定）

宝物自体は攻撃力などのステータス（ドレイクは攻撃力 9,688）を持つが、録画 36 のドレイクの最終攻撃力 119,796 は宝物なしの計算値のまま一致した。スペック固定では、スキルの差し替えだけが反映される。ステータスもコレクションスキルも、この Stage では取り込まない。

### 0.6 基礎版の ref はそのまま使えない

宝物版の `description_value_NN` は、基礎版の番号を前に残して後ろに足す形とは限らない。照合できた 19 体 57 スキルのうち 30 スキルで、同じ番号の値が基礎版と違っていた。

- ドレイク S1: 基礎は `[命中率 11.85, 10, 攻撃力 11.85, 10]`、宝物版は `[命中率 20.09, 10, 攻撃力 11.85, 10, SG 攻撃力 63.88, 10, SG 最大装弾数 50.14, 10]`
- ドレイク バースト: 基礎は `[1254, 72.18, 10]`、宝物版は `[3009.6, 最大装弾数 72.18, 10, 攻撃ダメージ 31.68, 10]`

したがって、宝物版には**別の効果定義（ref の振り直し）が要る**（2 節）。

### 0.7 「〜を所持する味方」の語彙

ドレイクの宝物版 S1 は「ショットガンを所持する味方全体に 攻撃力 63.88%▲」で、いまの対象（`self` / `allies`）では書けない。基礎版の説明文（203 体、Lv10）でも 10 体が同じ言い回しを持つ（ネオン、シュガー、トーブ、ノワール、ミランダ、レオナ、D：キラーワイフ、アルカナ：フォーチュンメイト、姫野、レム。SG 9・SR 2・SMG 1・RL 2 件）。うち 1 件は「最終攻撃力が最も高いロケットランチャーを所持する味方 N 機」で、Stage 11（アリス）の語彙と重なるので扱わない。

---

## 1. データの取り込み（`scripts/fetch-data.ts`・`scripts/normalize.ts`）

### 1.1 型（`src/types.ts`）

```ts
/** Stage 9: 宝物（SSR のお気に入りアイテム）。スキルの差し替えだけを持つ（ステータスはスペック固定で乗らない） */
export type TreasureData = {
  favoriteId: number; // 200801
  name: LocalizedText; // ヴィランのフィギュア / Villain Figurine
  /** 解放順（favoriteitem_skill_group_data の配列順）。段階 N では先頭 N 個が宝物版になる */
  unlockOrder: SkillSlot[]; // ドレイクは ['skill1', 'skill2', 'burst']
  /** 宝物版のスキル。形は基礎版と同じ SkillRaw */
  skills: Record<SkillSlot, SkillRaw>;
};

export type CharacterData = CharacterIndexEntry & {
  // ...既存...
  skills: { skill1: SkillRaw; skill2: SkillRaw; burst: SkillRaw };
  /** Stage 9: 宝物がないキャラは null */
  treasure: TreasureData | null;
};
```

- `skills` と並べた `favoriteSkills` にしないのは、段階（どのスロットが何段階目で変わるか）がないと選べないため。`unlockOrder` と 1 つにまとめる。
- `burstSkill.cooldownSeconds` は基礎版のまま（0.2 節）。
- `SkillSlot` は今 `skills/types.ts` にあるので、`types.ts` から参照できるよう `types.ts` 側へ移す（`skills/types.ts` は再エクスポート）。

### 1.2 取得と正規化

1. `favorite_rare_map.json` を取得し、`SSR` の ID だけを対象にする（R / SR はスキルの差し替えがない）。
2. SSR の ID ごとに `favorite_{id}.json` を ja / en で取得する。キャッシュは `.cache/{ja,en}/favorite-{id}.json`、一覧は `.cache/favorite_rare_map.json`（`--refresh` の扱いは roledata と同じ）。
3. `RawRoleData` に `name_code` と `skill*_detail.id` を足し、`name_code` で宝物をキャラに対応付ける。照合（0.3 節）:
   - `name_code` が 2 体以上に当たる → **失敗**（取り込みを止める）
   - 下 6 桁のスキル ID が「基礎版 + 50」でない → **失敗**
   - どのキャラにも当たらない（一覧に無い未実装キャラなど） → 警告して飛ばす
   - `favoriteitem_skill_group_data` が 3 スロットちょうどでない → **失敗**
4. `normalize.ts` に `toTreasureData(en, ja, character)` を足し、`toCharacterData(en, ja, treasure)` の第 3 引数で受ける（無ければ `null`）。
5. `packages/core/data/characters/*.json` を再生成する。宝物のない 180 体余りは `"treasure": null` が 1 行増えるだけ。

`CharacterIndexEntry`（`index.json`）には足さない（UI はキャラデータを読み込んでから判定する）。

---

## 2. スキル定義（`data/skills/{id}.json`・`skills/types.ts`）

### 2.1 形

宝物版のスロットごとの定義 `treasureSkills` を任意で足す。中の ref は宝物版の `SkillRaw` を指す。

```jsonc
{
  "formatVersion": 1,
  "resourceId": 101,
  "checkedAt": "2026-09-23",
  "skills": { "skill1": {}, "skill2": {}, "burst": {} }, // 基礎版（いまのまま）
  "treasureSkills": { "skill1": {}, "skill2": {}, "burst": {} }, // 宝物版（任意。スロットごとに任意）
}
```

```ts
export type SkillDefinition = {
  formatVersion: 1;
  resourceId: number;
  checkedAt: string;
  skills: Record<SkillSlot, SkillEntry>;
  /** Stage 9: 宝物版の定義。ref は CharacterData.treasure.skills を指す。無いスロットは宝物版で未定義 */
  treasureSkills?: Partial<Record<SkillSlot, SkillEntry>>;
};
```

- `formatVersion` は 1 のまま（任意フィールドの追加なので、既存の 8 体の定義はそのまま通る）。
- `parseSkillDefinition` の検証: `treasureSkills` のキーは `SKILL_SLOTS` のどれか、中身は `skills` と同じ規則（`parseEntry`）。
- キャラデータとの突き合わせ（ref の範囲、`treasure` が無いのに `treasureSkills` がある）は、既存と同じく解決時（`skillValue`）と定義テスト（`definitions.test.ts`）で見る。

### 2.2 宝物版の定義が無いスロット

段階で宝物版になるスロットに `treasureSkills[slot]` が無い場合は、そのスロットを **`unsupported`（効果なし）** とし、`notes` に「宝物版は未定義」を入れる。基礎版の定義には黙って戻さない（0.6 節のとおり数値がずれるため）。UI には「未対応」として出る。

---

## 3. 語彙の追加: 武器種で絞る対象

`passive` / `timed` に任意の `targetWeapon` を足す。

```ts
export type PassiveEffect = {
  kind: 'passive';
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。target が 'allies' のときだけ書ける */
  targetWeapon?: WeaponType;
  // ...既存...
};
// TimedEffect も同じ
```

- `timeline.ts` が対象を判定するときに見るのは、定義の効果ではなく解決済みの `ResolvedEffect`（`ResolvedTimedEffect` はこれを拡張した型）。そこで `resolve.ts` の `ResolvedEffect` にも `targetWeapon?: WeaponType` を足し、`resolvePassives` / `resolveTimed` が定義から写す（`assumes` と同じ扱い。無ければキーごと省く）。
- `isEffectTarget` は効果の対象と、対象の枠の武器種を受け取る形にする。対象の枠の武器種は**省略できない引数**にする（省略できると、渡し忘れたときに黙って全員へ掛かってしまうため）。

```ts
/** sourceSlotIndex の枠が発動した効果が、targetSlotIndex の枠（武器種 targetSlotWeapon）に掛かるか */
export function isEffectTarget(
  effect: Pick<ResolvedEffect, 'target' | 'targetWeapon'>,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlotWeapon: WeaponType,
): boolean;
```

- 呼び出しは `timeline.ts` の 2 か所（`resolvePassiveStates` と持続バフの窓を配るところ）で、どちらも対象の枠の `character` を持っているので `character.weaponType` を渡すだけ。
- `target: 'self'` と `targetWeapon` の組み合わせは検証でエラー（意味がない）。
- calc の効果のラベル（「味方全体」など）は、`targetWeapon` があれば「SG の味方」のように出す。
- 既存の 10 体（0.7 節）の定義はこの Stage では足さない（ノワールは録画はあるが定義がない。Stage 11 以降で必要になったら使う）。

---

## 4. core: 宝物の段階の入力と差し替え（`team.ts`・`skills/treasure.ts` 新設）

### 4.1 入力

```ts
export type TeamSlotSkills = {
  definition: SkillDefinition | null;
  levels: SkillLevels;
  /** Stage 9: 宝物の段階（0..3）。省略 0 = 宝物なし。character.treasure が null なら 0 だけ許す */
  treasurePhase?: TreasurePhase;
};
export type TreasurePhase = 0 | 1 | 2 | 3;
```

`treasurePhase` を `growth` ではなく `skills` に置くのは、効くのがスキルだけ（0.5 節）で、スペック固定でも所持状況がそのまま反映されるため（スペック固定が上書きする `growth` とは別の扱い）。

### 4.2 差し替え（`skills/treasure.ts`）

```ts
/** 段階 phase で宝物版になるスロット（unlockOrder の先頭 phase 個） */
export function treasureSlots(character: CharacterData, phase: TreasurePhase): SkillSlot[];

/**
 * 宝物版を当てた CharacterData と SkillDefinition を返す。phase 0 はそのまま（同じオブジェクト）返す。
 * phase 1 以上では引数を書き換えず、差し替えたスロットだけを入れ替えた浅いコピーを返す
 * （{ ...character, skills: { ...character.skills, [slot]: treasure.skills[slot] } }、定義も同様）。
 * definition.skills[slot] は treasureSkills[slot]（無ければ unsupported）になる
 */
export function applyTreasure(
  character: CharacterData,
  definition: SkillDefinition | null,
  phase: TreasurePhase,
): { character: CharacterData; definition: SkillDefinition | null };

/** 各枠に applyTreasure を当てた新しい TeamInput。返す入力の treasurePhase は 0（適用済み）にするので、2 回通しても結果は同じ */
export function applyTreasureToTeam<T extends TeamInput>(input: T): T;
```

- **引数を書き換えない。** キャラデータと定義は calc のキャッシュ（`useCharacterCache` / `useSkillDefinitions`）やテストで共有されていて、同じキャラを 2 枠に置くこともあるため。テストで `Object.freeze` した入力を渡して確かめる。
- **`applyTreasureToTeam` を通す場所は `computeTeamDamage` と `runSimulation` の最上位**（`planTeamRun` を呼ぶ前）。`planTeamRun` の中だけでは足りない。どちらの関数も `planTeamRun` の外で `slot.character` と `slot.skills.definition` を読んでいる（`team.ts` の `skillSupportOf`、`sim/engine.ts` のバーストのダメージ計算）ため。
- `planTeamRun` の冒頭でも `applyTreasureToTeam` を通す。テスト（`stage8Team.test.ts`）が `planTeamRun` を直接呼んでいるので、直接呼ばれても宝物の段階が無視されないようにする。最上位で適用済みの入力は段階 0 になっているので、ここでは何もしない（同じオブジェクトが返る）。
- 以降の `resolvePassives` / `resolveTimed` / 倍率ダメージ / 時刻表は、差し替え後の `character` と `definition` を読むだけなので変更しない。
- 定義ファイルが無い（`definition: null`）枠は、宝物の段階を選んでも効果なし（基礎版と同じ）。
- 段階 0 は同じオブジェクトを返すので、Stage 8 の結果と厳密に一致する（退化テスト 8.2 節）。
- 結果の `TeamSlotResult.character` は差し替え後のもの（UI が宝物版の説明文を出せる）。あわせて `treasurePhase` と `treasureSlots` を添え、UI が「宝物版で計算した」ことを出せるようにする。どちらも元の入力（適用前）から取る。
- 検証: `treasurePhase` が 0..3 の整数でない、または `treasure` が null なのに 1 以上 → `RangeError`。

---

## 5. calc

### 5.1 状態（`apps/calc/src/team.ts`）

- `SlotState` に `treasurePhase: TreasurePhase` を足す。**既定 0**（ユーザー指定）。キャラを選び直したら 0 に戻す。
- アクション `setTreasurePhase` を足す。
- localStorage の復元（`deserializeTeamState`）は、`treasurePhase` が無ければ 0 とする（既存の保存データはそのまま読める）。宝物の無いキャラに 1 以上が入っていたら 0 に直す。
- スペック固定でも `treasurePhase` は上書きしない（4.1 節）。

### 5.2 UI（最小限。`SkillSection.tsx`）

- `character.treasure` があるキャラだけ、スキル欄の見出しに「宝物: なし / 1 段階 / 2 段階 / 3 段階」の選択を出す。各段階のラベルに差し替わるスロットを添える（ドレイクなら「1 段階（スキル 1）」「2 段階（+スキル 2）」「3 段階（+バースト）」）。
- 宝物版になったスロットは、説明文を宝物版で出し、バッジ「宝物版」を付ける（差し替え後の `character` と `definition` をそのまま描画する）。

### 5.3 CLI（`scripts/sim-run.ts`）

`--treasure 101:3,140:2` を足す（`resourceId:段階`。省略は全員 0）。録画 36・37 の再現に使う。

---

## 6. キャラ定義: ドレイクの宝物版（`data/skills/101.json`）

`skills`（基礎版）は Stage 8 のまま残し、`treasureSkills` を 3 スロットとも足す。

| スロット | 宝物版の説明文（Lv10）                                                                                                                          | 定義                                                                                                                                                | support     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| スキル 1 | フルバーストタイム発動時、味方全体に命中率 20.09%▲・攻撃力 11.85%▲（10 秒）。SG を所持する味方全体に攻撃力 63.88%▲・最大装弾数 50.14%▲（10 秒） | `timed` fullBurstStart / allies / attack ref 3・durationRef 4。`timed` fullBurstStart / allies + `targetWeapon: "SG"` / attack ref 5・durationRef 6 | `partial`   |
| スキル 2 | 10 回攻撃した時、HP が最も低い敵 3 機に最終攻撃力の 98.55% のダメージ。5 回攻撃した時、HP が最も低い敵 1 機に最終攻撃力の 201.6% のダメージ     | `damage` normalShot everyRef 1 / skill ref 3。`damage` normalShot everyRef 4 / skill ref 6                                                          | `supported` |
| バースト | 攻撃範囲内の敵に最終攻撃力の 3009.6% のダメージ。自分に最大装弾数 72.18%▲・攻撃ダメージ 31.68%▲（10 秒）                                        | `burstDamage` ref 1 / skill。`timed` burstUse / self / attackDamage ref 4・durationRef 5                                                            | `partial`   |

- `partial` の notes: 命中率▲（全弾命中の前提なので効かない）、最大装弾数▲ 2 件（射撃が変わるバフは Stage 10）。
- 基礎版の notes にある「Stage 9」は「Stage 10」に直す（繰り下げのため）。
- `checkedAt` を更新する。

---

## 7. 数値への影響（見込み）

- 段階 0（既定）: すべての編成で Stage 8 と厳密一致。宝物を持つキャラで定義があるのはドレイクだけなので、ほかのキャラは段階を選んでも定義なしのまま（取り込んだ説明文が UI に出るだけ）。
- ドレイク段階 3: S2 の発動が「10 回ごと」に「5 回ごと 201.6%」が加わる（倍率ダメージは 1 回あたり約 2 倍・発動 2 倍で、S2 の合計はおよそ 5 倍）。バーストは 1254% → 3009.6%（×2.4）。フルバースト中の通常攻撃に攻撃力 +63.88%（SG の味方にも）と、バースト後 10 秒の攻撃ダメージ +31.68% が乗る。最大装弾数▲が抜けるので、実機より射撃の回数（と S2 の発動回数）は少なめに出る。

## 8. テスト・検証（PDCA）

### 8.1 取り込み（`scripts/normalize.test.ts`）

- `toTreasureData` が `unlockOrder`・宝物版の `SkillRaw` を作ること（ドレイクの Lv10 値が 0.1 節の数値と一致）。
- 照合の失敗（`name_code` が 2 体、スキル ID が合わない、スロットが 3 つでない）がエラーになること。
- 再生成した `data/characters/` で、宝物を持つのが 0.3 節の 21 体だけであること。

### 8.2 core

- `parseSkillDefinition`: `treasureSkills` の正常系と異常系、`targetWeapon` の検証（`self` と組むとエラー）。
- `applyTreasure`: 段階 0 は同じオブジェクト、段階 N で `unlockOrder` の先頭 N 個だけ差し替わる、定義の無いスロットは `unsupported`。`Object.freeze` したキャラデータと定義を渡しても例外にならず、元のオブジェクトが変わらない。
- `applyTreasureToTeam`: 2 回通しても 1 回と同じ結果。同じキャラを 2 枠に置き、片方だけ段階 3 にしても、もう片方は基礎版のまま。
- `planTeamRun` を直接呼んでも（`computeTeamDamage` を通さなくても）宝物の段階が効く。
- `resolvePassives` / `resolveTimed`: `targetWeapon` が解決済みの効果に写る（無ければキーが無い）。
- `isEffectTarget`: `targetWeapon` が武器種の一致する枠にだけ掛かる。
- **退化テスト**: 段階 0（省略）で、既存のテスト（Stage 4〜8 の全編成）が 1 件も変わらない。
- sim と calc の整合（`simCalc.test.ts`）: ドレイク段階 3 を含む編成で、倍率ダメージの発動列と合計が厳密一致、総ダメージは既存の許容差内。

### 8.3 録画 36・37 の回帰（新規撮影なし）

録画 36・37 はすでに宝物版の数値で読み取ってある（[verification.md](verification.md) Stage 8 節）。ドレイク段階 3 で次を固定する。

| 項目                               | 期待値                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| S2「5 回攻撃」（フルバーストの外） | 119,796 × 201.6% = 241,509（実測 241,509）                                       |
| S2「5 回攻撃」（フルバースト中）   | 838,582（実測）                                                                  |
| フルバースト中のペレット（非会心） | 89,141（実測。S1 宝物版の攻撃力と、バースト宝物版の攻撃ダメージ +31.68% が乗る） |
| S2「10 回攻撃」                    | 118,059 / 409,932（Stage 8 と同じ）                                              |

- バースト 3009.6% は録画 36 で 1,201,793（= 3009.6% の 1/3）と表示された（10 節 3）。実装時に録画 36 のバースト前後のフレームを読み直し、1,201,793 が 3 回出ているかを確かめる。3 回なら合計 3009.6% を 1 回のダメージとして扱うモデルのままでよい（合計は一致する）。1 回だけなら仮定を見直して報告する。
- 録画 37（ラム SR + デルタ SR + ドレイク）で、SG 向けの攻撃力 +63.88% がラム・デルタに乗っていないことを、フルバースト中の 2 体のダメージ数値から確かめる（読めなければ未確認として残す）。

### 8.4 完了条件

1. 21 体の宝物版スキルが `data/characters/` に入り、8.1 のテストが通る。
2. 段階 0 で既存のテストがすべて変わらない（退化テスト）。
3. ドレイク段階 3 で 8.3 の 4 項目が一致する。
4. calc で宝物の段階を選べ、宝物版の説明文とバッジが出る（ブラウザで確認）。
5. `npm test` / `npm run typecheck` / `npm run lint` / `npm run format:check` が通る。

## 9. 実装手順（各ステップに検証コマンド）

1. 型（`TreasureData`、`SkillSlot` の移動）と `normalize.ts` の `toTreasureData`、テスト → `npx vitest run packages/core/scripts`
2. `fetch-data.ts` の取得・照合、`data/characters/` の再生成 → `npm run fetch-data`、差分が `treasure` だけであることを `git diff --stat` で確認
3. `skills/types.ts` の `treasureSkills`・`targetWeapon` と検証、`targets.ts` → `npx vitest run packages/core/src/skills`
4. `skills/treasure.ts` の `applyTreasure` / `applyTreasureToTeam` と、`computeTeamDamage`・`runSimulation`・`planTeamRun` の冒頭での適用 → 退化テスト `npm test`
5. `data/skills/101.json` の `treasureSkills`、録画 36・37 の回帰テスト → `npm test`
6. `sim-run.ts` の `--treasure` → `npm run sim -- --ids 101 --fixed-spec --controlled 0 --treasure 101:3`
7. calc の状態・UI → `npm test`、ブラウザで確認
8. verification.md・roadmap.md・本書の実装差分を更新

## 10. リスク・未確認の点

1. **解放順が配列順であること**は、シュガー・ロザンナの 2 体でしか実機と照合していない。ドレイクは 3 段階目まで解放済みで区別できない。違っていたら `unlockOrder` の作り方だけを直す。
2. **宝物でバーストの CT が変わるか**（宝物版の `info` に `skill_cooltime` が無い）。基礎版の CT を使う。
3. **ドレイクの宝物版バースト 3009.6% が 1/3 の値で表示された件**（8.3 節）。データ上は 1 つの値しかない。
4. スペック固定の外（通常のコンテンツ）で宝物のステータスがどう乗るか。この Stage では扱わない（要件のスコープもスペック固定が中心）。
5. CDN のパスは JS バンドル由来で、Blablalink の変更で変わりうる。変わったら取得が HTTP エラーで止まる（キャッシュがあれば再生成はできる）。

## 11. 決めてほしいこと（推奨付き）

**決定済み**（2026-09-23、ユーザー指定）: 宝物は Stage 10（射撃が変わるバフ）の前の小さな Stage として入れる。宝物の段階の既定値は 0（宝物なし）。

1. **Stage の番号** — 推奨: **この Stage を 9 にし、旧 Stage 9〜11+ を 10〜12+ に繰り下げる**。ロードマップの番号規則（1 始まりの整数）に合わせるため。完了済みの設計書（design-stage7.md・design-stage8.md）の本文は書き換えず、design-stage8.md の冒頭とロードマップに「旧番号」の注記を足す。今も使われている箇所（requirements.md、コードのコメント 3 か所、`101.json` の notes）は新しい番号に直す。代替: 番号を変えず「Stage 8.1」などにする（規則から外れる）。
2. **データの持ち方** — 推奨: **`CharacterData.treasure`（キャラの JSON に同居）**（1.1 節）。対象は 21 体だけで、読み込み側で結合する手間が要らない。代替: `data/treasures/{id}.json` に分ける。
3. **差し替えの場所** — 推奨: **`computeTeamDamage` / `runSimulation` の最上位で `applyTreasureToTeam` を 1 回だけ通す**（`planTeamRun` の冒頭でも通すが、適用済みなら何もしない。4.2 節）。解決の関数を 1 つも変えずに済み、段階 0 の厳密一致が構造的に保てる。代替: 各解決関数に段階を渡して、スロットごとに版を選ぶ（変更箇所が 5 か所以上に散る）。
4. **宝物版の定義が無いスロット** — 推奨: **`unsupported` にして「未対応」と出す**（2.2 節）。代替: 基礎版の定義に戻す（ref がずれて誤った数値になる）。
5. **SG 向けの対象** — 推奨: **`targetWeapon` を足す**（3 節）。ドレイクの宝物版 S1 の主な効果（攻撃力 63.88%）がこれで、基礎版でも 10 体が使う。代替: `allies` のまま `assumes` に「味方は全員 SG」と書く（ドレイク単騎では合うが、録画 37 の編成では過大）。
6. **ブランチ** — 推奨: **PR #11（Stage 8）のブランチの上に積む**（`claude/stage-9-treasure`）。Stage 8 の定義・語彙に依存するため。PR #11 のマージ後に main 向けの PR を作る。
7. **ほかの宝物持ちキャラの定義** — 推奨: **この Stage では作らない**。データの取り込み（説明文が UI に出る）だけにし、定義は必要になった Stage で足す。

---

## 12. 実装時の差分と知見（2026-09-23）

1. **ドレイクの宝物版バーストは 3 回に分けて当たる**（10 節 3 を解決）。録画 37 の総ダメージ表示が f1286・f1314・f1342 に 1,201,793（= 1003.2%）ずつ増え、合計 3,605,379 が 119,796 × 3009.6% = 3,605,381 と丸めの範囲で一致した。単体ボスでは合計だけが効くので、1 回の `burstDamage` のまま扱い、`101.json` の assumes に書いた。
2. **同じキャラは 2 枠に置けない**（既存の `validateTeamSlots`）。4.2 節の「同じキャラを 2 枠に置く」は編成では起きないので、テストは「スキルと宝物のオブジェクトを共有する別 ID のキャラ」で非破壊性を確かめた。calc のキャッシュでの共有は起きるので、非破壊の方針はそのまま。
3. **定義テストは宝物版のスロットが揃っていることを求めない**。2.2 節のとおり、定義が無いスロットは unsupported で動くため。宝物版があるなら `treasure` があることだけを見る。
4. **宝物のないキャラの段階は calc 側で 0 にする**（`effectiveTreasurePhase`）。保存データの復元時にはキャラデータが無く宝物の有無が分からないため、5.1 節の「復元時に 0 に直す」は計算に渡すときに行う形にした。
5. モデルは最終攻撃力を整数に丸めないので、フルバースト中の「5 回攻撃」は 838,583（実測 838,582）と 1 だけずれる。回帰テストは ±1 で比べる（Stage 8 の録画 21 と同じ扱い）。
6. `sim-run.ts` の表に宝物の段階の列を足し、持続バフのラベルに `(SG)` を付けた。
7. 8.3 節の「SG 向けの攻撃力がラム・デルタに乗っていないこと」は録画からは確かめていない（未確認として verification.md に記録）。
