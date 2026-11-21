# 設計書: クールタイムの印のある周期の timed に遅れ（delayFrames）を許す

- 課題: `records/backlog/cooldown-timed-delay.json`（backlog.md 5 節）
- 関連: [design-centi.md](design-centi.md) 2.2・2.3 節（きっかけ `{ skillFired }`・timed の印 `cooldown`）、[design-arcana-magician.md](design-arcana-magician.md) 2.2 節（印のある周期）、[design-new-chars-1029.md](design-new-chars-1029.md) 10.2 節の e（時間の周期のきっかけの遅れ）、[design-snow-white.md](design-snow-white.md) 8.3 節の論点 7（印のある周期の発動の待ち）
- 結論: C-1448（ノベルの S1 の防御力▼）
- 作成日: 2026-11-21
- 状態: 完了

## 0. 範囲

- クールタイムの印（`TimerTrigger` の `cooldown: true`）のある周期の `timed` に、遅れ（`delayFrames`）を書けるようにする。
- ノベルの S1 の防御力▼（`data/skills/212.json` の skill1 の effects[1]）を、印のある周期 + 遅れの形に書き直す。
- 実装・PR は、承認の後に同じブランチで続ける（AGENTS.md「コミット手順」）。

### 0.1 コードで確かめた、いまのモデル（2026-11-21）

- 印のある周期の timed は、解決で自分のスロットのきっかけ `{ skillFired }` に置き換わる（`skills/resolve.ts` の `resolveTimedTrigger`）。1 パス目（`frame/firstPass/gaugeEffects.ts` の `countCooldownTimers`）がフレーム f の終わりに発動を決め、次のフレーム f + 1 の出来事（`FrameEvents.skillFired`）に出す。1 パス目の件の登録（`skills/holders/register.ts`）がその出来事で件を作り、窓の始まりは `startOfFire` で f + 1（遅れを見ない）。
- 印のある timed の遅れは、読み込みで止めている（`skills/parse/crossChecks.ts` の `validateCooldownTimers`）。
- ノベルの S1 は、倍率ダメージを印のある周期 + 遅れ 64 で書き（ヒットは発動 F の 64f 後）、防御力▼を印の無い同じ 10 秒の周期 + 遅れ 65 で書く（窓は F + 65。印の無い周期の遅れは、周期の発火からのフレーム。`startOfFire`）。CT を縮めない編成では、印のある周期と印の無い周期の発火は同じフレーム（589 の倍数）なので、窓はヒットの次のフレームに合う（`novelTeam.test.ts`）。

### 0.2 課題の文の確かめ

- 仕組みは課題の文のとおり。ノベルの S2 に仮の即時の▼（`skillCooldownReduction`・`slot: "skill1"`）を足した単騎では、S1 のヒットは早まるが、防御力▼の窓は 589 の倍数 + 65 のまま残る（`__tests__/novelCooldownCut.test.ts`。実装の前は落ちる）。
- ただし、いまの定義で、ノベルの S1 を縮める編成は無い。定義済みの CT を縮める効果は 2 つで、どちらも持ち主の S2 だけを縮める。
  - センチ（80）の S1 の `skillCooldownReduction`: `target: "self"`・`slot: "skill2"`。
  - アルカナ（581）の魔術師のカード（状態の中身の `skillCooldownDown`）: `slot: "skill2"`（付いた味方の S2）。
- なので、いまの数値は変わらない（潜在の不具合）。ノベルの S1 を縮める効果（サクラなど、未定義）や、印のある周期の発動の待ち（スノーホワイトの `returnCooldownFrames`。いまはノベルに掛からない）が入ると表に出る。テストは仮の効果で組む。

## 1. 案

### 案 A: 遅れを発動のフレームから数える（推奨）

- 印のある周期の timed に `delayFrames: d`（1 以上の整数）を書ける。窓は、印のある周期の発動のフレーム F の d 後（F + d）から。
- 印の無い周期の timed の遅れ（周期の発火の d 後）と、同じスロットの印のある倍率ダメージの遅れ（発動の d 後にヒット）と、同じ基準になる。ノベルの防御力▼は、いまの値 65 のまま `cooldown: true` を足すだけで書ける。
- 実装:
  - 読み込み: `validateCooldownTimers` の「timed は遅れを書けない」を外す。きっかけは時間の周期なので、`parseTimedDelay` の時間の周期の枝がそのまま効く（1 パス目で窓を追う stat には書けない。付与は印を組まない）。
  - 解決: `{ skillFired }` に置き換えた件に、定義の `delayFrames` を載せたまま渡す（いまも写している）。
  - 窓の始まり（`skills/holders/items.ts` の `startOfFire`）: きっかけ `{ skillFired }` は、出来事のフレーム（F + 1）から `d − 1` 後（= F + d）。遅れが無ければ出来事のフレーム（いまと同じ）。遅れ 1 は遅れ無しと同じ窓になる。
- 発火の条件（`condition`）は、ほかの遅れのあるきっかけ（射撃の回数）と同じく、出来事のフレーム（F + 1）で見る。ノベルの▼は条件を持たない。

### 案 B: 遅れを出来事のフレームから数える

- 窓は F + 1 + d から。`startOfFire` の射撃の回数の形（`frame + d`）と同じ式になる。
- 同じスロットの倍率ダメージの遅れ（発動から数える）と 1 ずれるので、ノベルの▼は 64 と書くことになり、「ヒットの次のフレーム」が `damage` の 64 と `timed` の 64 で表れる。印の無い周期で書いていたときの値とも変わる。

### 推奨と理由

- 推奨: 案 A。同じスロットの倍率ダメージ・印の無い周期の timed と遅れの基準がそろい、ノベルの値（65）を書き換えずに印だけ足せる。

## 2. 1 パス目・2 パス目への影響

- 1 パス目（`frame/`）: 変えない。発動の決め方（`countCooldownTimers`）と出来事（`FrameEvents.skillFired`）はそのまま。件の登録（`skills/holders/register.ts`）は、すでに `startOfFire(trigger, f, delayFrames)` で始まりを出しているので、`startOfFire` の 1 行で未来の始まりになる（射撃の回数のきっかけの遅れ・時間の周期の付与の遅れと同じく、未来の始まりの件は登録で扱える）。
- 2 パス目（`sim/`）: 変えない。2 パス目は 1 パス目が作った件を読むだけ。
- 流し直し（`replayEvents`）は `{ skillFired }` を作らない（いまと同じ。印のある timed は 1 パス目が件を登録するものだけ）。
- 戦闘の終わりを越える始まり: 発動が戦闘の終わりの d 前より後なら、窓は戦闘の外から始まる。件の登録は射撃の回数の遅れと同じ扱い（戦闘の外の件は窓に出ない）。テストで確かめる。

## 3. 既存の定義との関係（退化の見込み）

- 印のある timed に遅れを書いた定義はいまは無い（読み込みで止めていた）ので、ノベルを書き直す前の数値は変わらない。
- ノベルの▼を `{ "everySeconds": 10, "cooldown": true }` + `delayFrames: 65` に書き直しても、CT を縮めない編成では、印のある周期の発動は印の無い周期と同じフレーム（589 の倍数）なので、窓の始まり（F + 65）・終わりは変わらない。`novelTeam.test.ts` の 3 編成（窓はヒットの次のフレームから 5 秒）がそのまま通ることで確かめる。
- 印の無い周期の timed（エーテルの S2 など。C-0453・C-0832）は変えない。
- 書き直しで定義の照合が変わる所: 同じスロットの印のある周期は同じ秒（10 秒どうしでそろう）。`skillFired` で指す相手の印は増えるだけ。

## 4. 確かめ方（実装の後）

- 読み込み: 印のある timed の遅れを通す。1 パス目で窓を追う stat には書けない（時間の周期の遅れと同じ）。`skillCooldownReduction.test.ts` の「遅れを書けない」の行を直す。
- `__tests__/novelCooldownCut.test.ts`: 仮の即時の▼のある単騎で、防御力▼の窓が S1 のヒットの次のフレームから付く。
- `__tests__/novelTeam.test.ts`: CT を縮めない編成で、ヒットの時刻と窓の時刻（C-1448）が書き直しの前と同じ。
- 遅れ 1 は遅れ無しと同じ窓（`startOfFire` の単体）。

## 5. 書き直す文書

- `data/skills/212.json` の skill1 の effects[1] の `assumes`（「印と遅れを組めない」の文を消し、窓が S1 のヒットの次のフレームで、CT を縮める効果でもヒットに付いて動くと書く）。
- `skills/types.ts`・`skills/parse/crossChecks.ts`・`skills/holders/items.ts` のコメント（現状の型で）。
- `plan/skill-phrases.md` 37 行目の印の行に、遅れを書けることを足すかは実装で見る（手順の文書に「印と遅れを組めない」の記述は無い）。

## 6. 論点

1. **遅れの基準**: 推奨: 案 A（発動のフレームから数える。1 節）。
2. **明示の `{ skillFired }` のきっかけ（ほかのスロットから発動を指す形）にも遅れを開くか**: 推奨: 開かない（使い手がいない。センチの S1 は遅れ無し）。印のある周期の timed だけに許す。

## 経過

- 2026-11-21: 起案した。
- 2026-11-21: 6 節の論点を推奨のとおりに決めた（オーナー）。印のある timed の遅れを実装し、ノベルの S1 の防御力▼を印のある周期 + 遅れ 65 に書き直した。
