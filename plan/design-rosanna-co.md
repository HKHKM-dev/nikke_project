# 設計書: ロザンナ：シックオーシャン（283）の S2 の持続ダメージの付き始めの遅れ

- 手順: [skills-guide.md](skills-guide.md)（1.3 設計書 → 1.4 実装する）
- 関連: [design-shot-count-trigger-frame.md](design-shot-count-trigger-frame.md) 6.7 節（`tickDelayFrames`。レイヴンの S1）、[design-timer-ceil.md](design-timer-ceil.md)（周期の発動のフレーム）、[design-nihilister.md](design-nihilister.md) 2 節（持続ダメージ `dot`）
- 検証: V-0760
- 作成日: 2026-11-14
- 状態: 実装（6 節）

## 0. 範囲

- ロザンナ：シックオーシャンの S2（説明文にきっかけの無い、CT ごとの持続ダメージ）を `data/skills/283.json` に書くのに、いまの語彙で足りないのは 1 つ。発動から持続ダメージが付くまでの遅れ（2 節）。
- 周期（30 秒）・tick の形（`atApplication`）・1 tick の値・バーストの 2 つの▲は、いまの語彙で書けて、録画と合った（V-0760。観測値は記録が指す）。
- コードで確かめた、いまのモデル（2026-11-14）:
  - dot の `tickDelayFrames` は、tick の刻み（とスタックの数・効果の帰属）を発火の d フレーム後を起点に数える（`frame/plan.ts` の `dotHits`）。2 パス目はきっかけの種類を問わずに効く。
  - 読み込み（`skills/parse/dot.ts` の `parseDotGauge`）が `parseShotCountDelay` で、射撃の回数のきっかけ（確率なし）にだけ許している。使い手はレイヴンの S1（`851.json`。5f）だけ。
  - 1 パス目のゲージの追跡（`frame/firstPass/gaugeEffects.ts`）も `tickDelayFrames` を読むが、ゲージを溜める dot（射撃の回数のきっかけか `burstUse`）だけを扱う。
  - 周期のきっかけ（`{ everySeconds }`）の遅れは、damage の `delayFrames`（C-0453）・timed の `delayFrames`・`coverHeal`・`removeDebuff` の `delayFrames`（`parseTimerDelayFrames`）で書ける。dot には無い。

## 1. 何が困っているか

- 録画（1150・1151・1152）で、S2 の持続ダメージのまとまりの最初の tick（付いた瞬間）は、戦闘開始から 1765k ティック（周期の発動。C-0502）の約 7〜8 ティック後に出る。左の「スキル2」の帯も tick の数 f 前に出ていて、発動から付くまでの遅れとみられる（C-0453 の倍率ダメージの遅れと同じ形）。
- いまの語彙では、モデルは発動のフレームに付けて tick を出すので、どの tick も約 8f 早い。与ダメージの合計はほぼ変わらないが、バーストの窓（10 秒）の端の tick と、tick の時刻の観測値がモデルと合わない。

## 2. 語彙の案

- **dot の `tickDelayFrames` を、周期のきっかけ（`{ everySeconds }`）にも書けるようにする**。意味は今と同じ（発火の d フレーム後を起点に刻みを数える。`atApplication` なら起点に最初の tick）。
  - 読み込み: `parseShotCountDelay` の代わりに、射撃の回数のきっかけ（確率なし）か周期のきっかけを受ける検査にする。周期のきっかけで `gaugeOnApply`・`gaugeOnTick` とは組まない（いまも周期のきっかけの dot はゲージを溜められない）。`state` と組まないのは今のまま。
  - 解決・2 パス目: 変えない（既に `tickDelayFrames` を発火のフレームに足している）。
  - 型の注記（`skills/types.ts` の `DotEffect.tickDelayFrames`）の「トリガーは射撃の回数トリガーだけ」を直す。手順書（skills-guide.md 1.4 節の表）に 1 行足す。
- 新しい欄を足さず既存の欄を広げるのは、意味（刻みの起点を発火から遅らせる）が同じで、2 パス目がもう対応しているため。damage の `delayFrames` と名前がそろわないが、dot の `delayFrames` は `{ counterFull }` の付与の遅れ（perCount と組む）に使っていて、意味が違う。

## 3. 退化の見込み

- 既存の定義で周期のきっかけの dot は無く、`tickDelayFrames` の使い手はレイヴンだけ。読み込みの検査を広げるだけなので、既存のテストの数値は変わらない。

## 4. 論点

1. 遅れ d の値: 止まりを除いたティック（timer.ts）で決める。動画のフレームは、発動の前の残り時間の止まり（モデルに無い 1〜2f）だけ後ろにずれるので、d に入れない。決めたのは 8f（V-0760、C-1196）。
2. 帯から tick までは数 f で、帯の立ち上がりは発動の約 2 ティック後（C-0453）。発動を 1765k に置くのは C-0502 の形どおりで、ずれは付き始めの遅れだけに置く。

## 5. 撮って確かめる問い

- 撮影は V-0760（撮った: 録画 1150〜1152）。追加の撮影は要らない見込み。

## 6. 経過

- 2026-11-14: 起案（V-0760 の録画を読んだ後）。
- 2026-11-14: オーナーの承認（「承認」）で 2 節を実装し、遅れを 8f にした（V-0760、C-1196）。
