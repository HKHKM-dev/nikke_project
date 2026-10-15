# 効果を持ち主ごとの一覧で持つ組み直し 経過

- [design-holder-effects.md](design-holder-effects.md) の経過を、2026-10-15（段 B の実装）にこのファイルに移した。本体が 50KB の目安に近いため。
- 設計のいまの形は本体。ここは当時の記録で、書き換えない（追記はしてよい）。

## 経過

- 2026-10-15: 起案。オーナーの問い（誰がどの効果を誰に付与するかは窓で管理されているか、実機のようにキャラごとに効果を管理する形に組み直せるか）への調べを元に書いた。同日、オーナーが論点 1・2 と段の構成を推奨どおりに決めた。
- 2026-10-15: オーナーの指示で、読む側を一つずつ一覧・履歴を直接読む形に移す段 D と、最後に窓の書き出しを消す段 E を足した（0・2.6・2.7・2.9・2.10・3〜5・7 節。論点 9〜11 を足した）。
- 2026-10-15: オーナーが論点 3（スキルによる効果は、常時の値であっても一覧に入れる）・論点 4（2 パス目の入口を消し、テストも 1 パス目から作る）・論点 5（時刻の順にする）を決めた。論点 3 で常時の件（2.2・2.4 節）を、論点 4 で段 A・B の組み替え（2.7・3 節）を、論点 5 で並びと許容（2.6・4・5 節）と論点 6 の推奨を直した。使用武器の変更が 1 体に 1 つしか無い（並びを変えても値が変わらない）ことを、定義で確かめた。
- 2026-10-15: 本体が 50KB の目安に達したので、1 節（いまの作り）を別紙 [design-holder-effects-current.md](design-holder-effects-current.md) に移し、本体には要点を残した（節の番号は本体と同じ）。
- 2026-10-15: オーナーが論点 6〜11 を推奨どおりに決めた（論点がすべて決まった）。オーナーの指示で、設計書を段 A の実装より先に PR にした。
- 2026-10-15: 段 A を実装した（`skills/holders.ts`・`frame/firstPass.ts`・`frame/plan.ts`）。旧の 1 パス目は `frame/legacyFirstPass.ts` に写して残し、新旧の比べは `frame/crossCheck.ts`（テストの準備 `crossCheck.setup.ts` と `records-check.ts`・`records-minimal.ts` から入れる。倍率ダメージの発動も比べる）。件の作り方を 2.2・2.7 節に、区間の鍵の並べ直しを 2.6 節に書き足した。吸収回復の件の列は、1 パス目が別に解決した効果と引き合わせるため、出どころの枠・スロット・効果の番号で引く。件の種類ごとの単体テストは `skills/__tests__/holders.test.ts`。
  - 新旧の比べを入れて、`npm test`（テストの期待値は変えず、許容つきにしたテストも無い）・`records:check`（生成物に差分なし）・`records:minimal`（感度に差分なし）が通った。比べで出た差は、区間の鍵の並び（上の 2.6 節）と、吸収回復の件の引き当て（効果のオブジェクトで引いていた）だけで、どちらも新しいコードの誤りとして直した。
  - 速さ（論点 7。同じ環境で main と比べた。比べは入れない）: コアのテスト 52 秒 → 50 秒、感度の計算（`records-minimal.ts`）15 秒 → 15〜16 秒。比べを入れると 61 秒・29 秒。
- 2026-10-15: 段 B を実装した。
  - テスト: `planBuffTimeline` を呼ぶテスト（`skills/__tests__/` の timeline・stage11・amplifies・stage8・rankedShotDuration・stage11Modernia・trueDamageElement と、`frame/__tests__/firstPass.test.ts`）と、1 パス目のテスト用の窓を読む編成のテスト（asuka・yuniAsuka・eunhwaTuWeaponChange・namedState・stage11Alice・stage11Modernia・sustainedHitRateGauge）を、1 パス目から作る形（テストの助け `__tests__/firstPassTimeline.ts`、`TeamPlan.history`）に書き直し、件（`itemsOf`）と判定の記録（`history.conditionSkips` など）で確かめる形にした。旧の実装との比べ（論点 6）を入れたまま書き直したテストと `records:check`・`records:minimal` を回し、同じ値になることを確かめてから旧の実装を消した。
  - 手で射撃の列を与えていたテスト（stage8 の回数トリガー、stage11Modernia の条件）は、1 パス目の射撃で数える形にした（遅い武器・長い命中率の件にして、確かめる規則は同じ）。2 つの実装の一致を見ていたテスト（1 パス目の窓と `planBuffTimeline` の窓の一致）は、件がトリガーの発火で付くこと、順位が見る段の件であることを見る形にした。
  - 消したもの: `planBuffTimeline` と中の作り（2 パス目）、`frame/legacyFirstPass.ts`、比べの仕掛け（`frame/crossCheck.ts`）、旧の実装だけが使う関数（`selfBuffedAt`・`untilFullBurstEndWindows`・`inFullBurstAt`・`buffStartFrames`・`buffStartFires`・`chanceOpportunities`・`planHeals`・`createHealWindow`・`hasHealEffects`）。`untilWeaponChangeEndWindows` は撃ち切りとフルバーストの終わりの両方に使うので、`untilNextEndWindows` に改めた。
  - 1 パス目の結果のテスト用の窓の欄（`firingWindows`・`rankAttackWindows`・`hitWindows`・`namedStateWindows`）は、読む所が無くなったので消した（段 E の 1 の一部を前倒しした）。
  - 強化（2.5 段目）の受け付けと値の小片は、書き出しから履歴を閉じる所（`amplify`）に移し、履歴（`amplified`・`conditionSkips`）に持たせた（値は同じ。比べで確かめた）。履歴を読む関数 `itemsOf`・`activeItemsAt` を足した（2.9 節。段 D の 7 の一部を前倒しした）。
  - 結論の「モデル側」の文が消した関数を指していたので、新しい置き場所に直した（C-0082・C-0087・C-0124・C-0251・C-0313・C-0315・C-0335・C-0336・C-0338。結論の中身・状態・根拠は変えない）。
  - 確かめ: `npm test`、`records:check`（生成物の差分は `plan/claims.md` の上の「モデル側」の文だけ）、`records:minimal`（感度に差分なし）。速さ（比べは入れない）: コアのテスト 51 秒、感度の計算 16〜17 秒（段 A の後と変わらない）。
- 2026-10-15: 段 C を実装した（2.8 節に実装の注記を足した）。
  - 敵の受けるダメージ▲（`damageTaken` の timed）を敵の件の列にし、書き出しで味方の各枠の窓に写す。強化（エマ：TU のバースト）の値の小片も敵が持つ（`amplifies.test.ts` は、小片が敵の件であることと、書き出しで味方の各枠に写ることを見る形にした）。
  - クルミのハッキングを敵の状態の件にし、damage の条件 `enemyState` は敵の状態の件を見る形にした（`frame/plan.ts` の `enemyStateSpans` を消した）。
  - 検証を足した（2.8 節）。常時の `damageTaken` は、観測値の比べる設定（録画 280・281 と V-0247 の予測）が使っていたので禁じず、いまのまま味方の各枠の常時の件にした（はじめに禁じた所、`records:check` で比べられない観測値が出て気づいた）。
  - 確かめ: `npm test`、`records:check`（生成物に差分なし）、`records:minimal`（感度に差分なし。16 秒）。
- 2026-10-15: 段 D の 1 を実装した。区間を、書き出した窓ではなく、履歴の値の小片（`skills/holders.ts` の `valuePiecesOf`。件・確率のきっかけの期待値・強化の小片から作り、敵の件は効果の対象の味方の各枠に写す。並びは時刻の順）から組む形にした（`skills/timeline.ts` の `buildSegments` の入力を小片にした）。窓（書き出し）も同じ小片から作るので、段 E で窓を消しても区間の作り方は変わらない。確かめ: `npm test`、`records:check`（生成物に差分なし）、`records:minimal`（感度に差分なし）。
- 2026-10-15: 段 D の 2 を実装した。`frame/plan.ts` の倍率ダメージの発動が、窓と記録ではなく履歴を読む形にした: 下位効果のスタック適用（`withEarlierSequentialEffects`）は値の小片（状態だけの stat を除く。受けるダメージ▲は敵の件から写った小片）、`{ applied }` のトリガー（`appliedFrames`）は履歴の付いた記録、段の循環の発（`cycleFires`）は間隔の変更の件。確かめ: `npm test`、`records:check`（生成物に差分なし）。
- 2026-10-15: 段 D の 3 を実装した。calc の射撃の数え方の判定（自分の射撃の回数で開いた件があるか）を、窓と状態の窓ではなく件の列から行う形にした（`skills/holders.ts` の `hasOwnShotCountItem`。timed と強化は自分の射撃の回数のトリガー、状態は件の列の印 `shotCount`、敵の件は効果の対象の味方の枠の件として見る。`calc/model.ts` の `hasOwnShotCountWindow` を消した）。確かめ: `npm test`、`records:check`（生成物に差分なし）。
- 2026-10-15: 段 D の 4 を実装した。sim の記録の出来事（`buffStart`・`buffEnd`）を、窓ではなく区間に足す値の小片の始まりと終わりから出す形にした（`sim/engine.ts`。状態だけの stat は、いまと同じく出さない）。比べ: 観測値の比べる設定の編成ごとに、記録の出来事を値の小片から出したものと窓から出したものが同じことを、一時のテストで確かめてから消した。`npm test`、`records:check`（生成物に差分なし）。
- 2026-10-15: 段 D の 5 を実装した。観測値の指標が、窓と記録ではなく履歴を読む形にした（`records/observations.ts`）: 効果の窓の始まり・終わり（`buffWindowStarts`・`buffWindowEnds`・`buffWindowEndFromFullBurstEnd`）は区間に足す値の小片（状態だけの stat を除く。窓と同じ区切り）、循環の指標（`cycleWindowResidues`）は間隔の変更の件、回復の指標（`healHitCounts`）は履歴の回復の記録。sim の結果（`SimResult`）に履歴（`history`）を足した。指標の名前は変えない（2.10 節）。指標の単体テストの作り物の sim の結果は、窓の列から件の列に直した。確かめ: `npm test`、`records:check`（生成物に差分なし。すべての観測値で、指標が窓を読んだ時と同じ値）。
