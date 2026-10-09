# 名前の付いた状態の語彙 別紙: 計算の道と退化の確かめ方

- 本体: [design-named-state.md](design-named-state.md)
- 本体が 50KB を超えるので、2026-10-09 の組み直しで分けた。「3.2 節」のように節の番号だけを書いたものは本体の節を指す。
- 内部の形は、状態の窓（1 層目）と、その窓を参照する中身（2 層目）に分ける。JSON の入れ子は書き方だけで、解いた後は平らになる。

## 1. 計算の道

### 1.1 型

```ts
// skills/states.ts
type NamedStateInfo = { name: LocalizedText; holder: 'ally' | 'enemy' }; // 後の拡張で group?: string
// skills/types.ts（JSON の形）
type StateContentItem = Pick<TimedEffect, 'stat' | 'ref' | 'scaling' | 'decrease'> & ClaimRefs;
type StateGrantEffect = Omit<TimedEffect, 'kind' | 'stat' | 'ref' | 'scaling' | 'decrease' | 'name' | 'amplifies'> & {
  kind: 'state';
  state: NamedStateId;
  contents?: StateContentItem[];
};
// skills/resolve.ts（解いた後）
type ResolvedStateGrant = Omit<ResolvedTimedEffect, 'stat' | 'scaling' | 'value' | 'weapon' | 'amplifies' | 'name'> & {
  state: NamedStateId;
};
type ResolvedStateContent = ResolvedEffect & {
  effectIndex: number; // 付与の位置
  subIndex: number; // 中身の番号
  whileState: NamedStateId;
  maxStacks?: number;
};
type WindowEffect = ResolvedTimedEffect | ResolvedStateContent; // BuffWindow.effect と AppliedTimedEffect の元
// skills/timeline.ts。BuffTimeline.namedStateWindows: NamedStateWindow[]
type NamedStateWindow = {
  state: NamedStateId;
  slotIndex: number; // 持ち主
  sourceSlotIndex: number; // 出どころ
  start: number;
  end: number;
  stack?: number;
  grants: number[]; // この窓に発火を足した付与の effectIndex
};
```

- 中身はトリガーと維持を持たない。窓の効果の型を `WindowEffect` に広げ、トリガーを読む所を型の検査で洗い出す（1.6・1.7 節）。中身を `ResolvedTimedEffect` の形に偽装しない（付与の 1 つのトリガーを写すと、calc の判定と表示が黙って誤る）。

### 1.2 解決

- 付与は新しい `resolveStateGrants`、中身は新しい `resolveStateContents` で取り出す。`resolveTimed` は今のまま（`timed` と `weaponChange`）。`resolveTimed` の結果はどれもトリガーを持つ前提で多くのコードとテストが使っているので、付与も中身も混ぜない。
- 付与の維持は `timed` と同じに解く（`battleEnd` は `BATTLE_END_FRAMES`。`burstWindowTrimOf` の印のあるキャラは、`burstUse` の付与の維持を縮める）。同じ定義の同じ状態の付与の維持・スタックの上限が Lv で食い違えば、ここで落とす（本体 5.2 節）。
- `resolvePassives` は、`passive` に加えて静的な付与の中身も集める（移したペルソナの効果 1 が消えないように）。

### 1.3 編成の段

- `applyCompositionToTeam` の順を「編成の条件で効果を外す → 外した後の定義から静的な状態を集める → 対象の枠（`fixedTargets`）を決める」にする（静的な付与に編成の条件が書かれても、持ち主の判定が食い違わない）。
- `fixedTargetsOf`・`hasPersonaTargetFilter`・`compositionAllows` は今 `passive`・`timed` だけを見るので、`kind: 'state'` も受けるようにする。受けないと、バトンタッチ（`allies` + `targetState`）の付与に `fixedTargets` が付かず、`skills/targets.ts` の `fixedTargetOk` が例外を投げる。

### 1.4 時刻表の段

- 1 層目（状態の窓）は「付与の発火 → 和集合・スタック → 解除で切る → 窓」の順の関数にする。窓の作り方の分かれ（発数・`fullBurstEnd`・発火で対象の変わる付与）は `planBuffTimeline` の `distribute` と同じで、同じ状態の付与の発火をまとめてから当てる。解除で切る段は今回は空で、後の拡張の `removeOn`・`group` をここに足す（窓を途中で閉じる処理は、今も `closeWeaponChange` と `durationUntil: "fullBurstEnd"` にある）。
- 付与は本体 5.2 節の段に置き、状態が確定した段で中身の窓を作って `windows`（命中率なら `stateWindows`）に入れる。区間の鍵（`keyOf`）と表示の出どころは `sourceSlotIndex.skill.effectIndex.subIndex` で分ける。`effectIndex` の大小で順を見る今の処理（`frame/plan.ts` の `withEarlierSequentialEffects`）はそのまま使える。
- `BuffTimeline` に `namedStateWindows` を足す（命中率の `stateWindows` とは名前を分ける。あちらは stat の状態）。`applications`（`{ applied }` の材料）は、名前の付いた `timed` の代わりに、どの段の付与からも作る（静的な付与はフレーム 0）。
- 最初の案（中身を付与ごとの `timed` に展開し、同じ識別子を持たせて和集合を取る）は採らない。和集合は 1 つの効果の中（`frame/firstPass.ts` の `register`・`planBuffTimeline` の `distribute`）でしか取られず、区間の鍵も効果ごとに分かれるので、識別子を重ねても付与をまたぐ和集合にならず、表示の出どころが混ざる。

### 1.5 1 パス目

- 1 パス目でも、中身の窓は同じ stat の `timed` の窓と同じ列に入れ、同じフレームの判定（条件・順位）に同じように入れる（本体 3.2 節）。追うのは、中身に 1 パス目で追う stat（射撃に効く stat・当たりの stat・条件の stat・順位が要るときの攻撃力）がある付与だけ。状態の窓の列は `namedStateTrack`（今の `stateTrack` は条件の stat の窓で、別物）。
- 中身の窓は、状態の窓の列を写さずに同じ列を参照する（解除で窓を切ったときも中身が揃う）。窓を作る関数は `planBuffTimeline` と同じものを使う（今の `register` と `unionWindows`・`stackWindows` の関係と同じ）。
- フレームごとの登録は、条件なしの付与を回復の直後、条件つきの付与を今の `stateTrack` の直後に置く。どちらも攻撃力の窓・射撃に効く窓より前なので、同じフレームの順位と射撃の判定に中身が入る（今の `timed` と同じ）。条件つきの付与の中身は、ほかの条件の判定に使わない（連鎖の禁止）。
- 今回の 4 体で 1 パス目で追うのは、順位の要る編成での追撃・バトンタッチの攻撃力▲だけ（カモフラージュの中身は 1 パス目で追う stat でない）。

### 1.6 倍率ダメージと calc

- `frame/plan.ts`: `{ applied }` の `damage` は `applications` から（今と同じ）。`enemyState` は dot の状態の区間（本体 5.5 節）で見る。`frame/dot.ts` の `groupDotsByStatus` は `groupDotsByState` に改める。
- calc（`calc/model.ts`）の `hasOwnShotCountWindow` は、区間の効果のトリガーが自分の射撃の回数かを見ている（窓の中と外の発数の割合が時間の割合と大きく違うので、その枠の全グループを射撃の列で数える。[design-ludmilla-wo.md](design-ludmilla-wo.md) 2.5 節）。中身はトリガーを持たないので、判定を「その枠に、自分の射撃の回数で開いた窓（効果の窓か、`grants` に自分の射撃の回数の付与を含む状態の窓）があるか」に改める。今の効果だけの編成では同じ判定になる（区間の効果は窓から作るので 1 対 1。`stateWindows` は区間の効果に入らないので外す）。ウンファ：TU はバーストの受けるダメージ▲（`weaponChangeShot`）の窓でもこの判定が立つので、移し替えで calc の値は変わらない見込み。

### 1.7 表示と CLI

- 画面（`SkillSection.tsx`・`skillLabels.ts`・`SlotCard.tsx`）: 付与は「〈名前〉を付与（対象・維持）」、その下に中身を今の `timed` と同じ文言で並べる。窓の一覧で、中身のきっかけの欄は「〈名前〉の間」。トリガー「〈名前〉が適用された時」・対象「〈名前〉状態の味方」・条件「対象が〈名前〉状態なら」の〈名前〉は目録の `name`。
- CLI（`scripts/sim-run.ts`）: トリガー `applied:<id>` は今のまま。付与の行に状態の id を出す。効果のまとめ（`compactTimed`）の鍵に `subIndex` を足す。

### 1.8 記録と照合

- `records/skills.ts`: `kind: 'state'` を効果として数える（スロットの対応状況）。中身の項目の `claims` の場所を `effects[i].contents[j]` と書けるようにする。
- 結論の `subject.places`・`model` のうち、移した効果を指すもの（C-0354 など）を新しい場所に直す（結論の文・状態・等級は変えない）。
- `records/relevance.ts`（最小構成の検査）: 付与の要素の分類は中身の stat の分類（中身の無い付与は分類の決まらない `unknown`）。中身の項目に `claims` があれば、項目を 1 つの要素として扱う。効果の場所が動くので、`npm run records:minimal` で感度を計算し直す。
- 型: `SKILL_EFFECT_KINDS` に `state` を足す（足し忘れは型の検査で落ちる）。notes の効く先（`NoteEffect.kind`）にも `state` が書けるようになる。

## 2. 退化の見込みと確かめ方

- 本体 7.1 節の移し替えは、どれも中身を展開した後の窓・常時パッシブ・dot が今の定義と同じになる（本体 3.2 節の対応）。次で確かめる。
  - 展開の単体テスト: 移し替えた定義を解いた効果と窓が、今の定義のものと（識別子と出どころの表示を除いて）同じ。
  - 編成のテスト: `personaTeam.test.ts`・`kurumiTeam.test.ts`・`kurumiS2Vocab.test.ts`・`eunhwaTuWeaponChange.test.ts`・`trueDamageElement.test.ts` などが、sim と calc の両方で値を変えずに通る。順位の要る編成（`topAttack` の効果を持つ味方を足す）で、追撃・バトンタッチの攻撃力▲が 1 パス目の順位に今と同じに入る。
  - calc の射撃の数え方（1.6 節）が、移し替えの前後で同じグループを射撃の列で数える。
  - `npm run records:check` の残差の一覧（`plan/residuals.md`）と、観測値の指標（窓の始まり・終わり）が変わらない。
  - `npm run records:minimal` の感度が変わらない（効果の場所が動くので計算し直す）。
- 新しく足す振る舞いは、同じ状態の中身の窓を付与をまたいで和集合にすること（本体 5.3 節）だけ。いまの定義で付与の窓が重なる編成は無い（本体 2.2 節の 2）ので、移し替えで値は変わらない。重なる場合の振る舞いは単体テストで固定する。
- 付与の制限を `timed` にそろえること（本体 3.6 節）は、今の定義に使う所が無いので値に効かない。組めるようになった組み合わせ（条件つき・順位の対象の付与と `{ applied }`）は、単体テストで窓と適用の記録を確かめる。
- 論点 8 が推奨どおりなら、条件の型をそろえた後も `kurumiS2Vocab.test.ts` の条件の組み合わせ（フルバーストの中・ハッキングの区間）が同じ発火を出すことを見る。
