# 設計書: ロザンナ：シックオーシャン（283）の S2 の持続ダメージの付き始めの遅れ

- 手順: [skills-guide.md](skills-guide.md)（1.3 設計書 → 1.4 実装する）
- 関連: [design-shot-count-trigger-frame.md](design-shot-count-trigger-frame.md) 6.7 節（`tickDelayFrames`。レイヴンの S1）、[design-timer-ceil.md](design-timer-ceil.md)（周期の発動のフレーム）、[design-nihilister.md](design-nihilister.md) 2 節（持続ダメージ `dot`）
- 検証: V-0760、V-0847（7 節）
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
  - 読み込み: `parseShotCountDelay` の代わりに、射撃の回数のきっかけ（確率なし）か周期のきっかけを受ける検査にする。周期のきっかけのゲージは 7 節。`state` と組まないのは今のまま。
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

## 7. 周期のきっかけの dot のゲージ（V-0847）

- 何が要るか: 撃たない単騎の録画（V-0847）で、S2 の持続ダメージは、付いたとき（1 回目の tick と同じフレーム）と tick ごとに、射手の 1 ヒットぶんのゲージを溜めた（C-1504）。レイヴンの S1（C-0181）と同じ形だが、いまの語彙は `gaugeOnApply` を射撃の回数のきっかけに、`gaugeOnTick` を射撃の回数のきっかけか `burstUse` の `afterInterval` に限っている。
- 決定: dot の `gaugeOnApply`・`gaugeOnApplyDelayFrames`・`gaugeOnTick` を、周期のきっかけ（`{ everySeconds }`）にも書けるようにする。
  - 読み込み（`skills/parse/dot.ts` の `parseDotGauge`）: 周期のきっかけは、クールタイムの印・`since`・状態の名前（`state`）の無いものだけ（条件のある dot は、もとからゲージを書けない）。解決の「維持が間隔の整数倍」の検査は、周期のきっかけには当てない。`gaugeOnApplyDelayFrames` は 1 以上の整数。`gaugeOnTick` の刻みは `atApplication` か `afterInterval`。
  - 1 パス目（`frame/firstPass/gaugeEffects.ts`）: 発火のフレームを `timerFramesOf` で前もって出し、ループの中の発火のフレームの頭（`reserveTimerGauges`。周期の `burstGaugeHit` と同じ所）で、付けたときの分を `gaugeOnApplyDelayFrames` 後に、tick の分を `tickDelayFrames` 後を起点にした刻み（`dotTickTracker`。2 パス目と同じ規則）に予約する。時間で変わるゲージ速度は発火のフレームの速度で読む。
  - 照合: sim の結果に 1 パス目の `dotGauges` を出し、指標 `dotGauge`（枠の n 回目の付けた時・tick のゲージの %）で比べる。
- 理由: 周期の発火は射撃に依らないので、射撃の回数のきっかけのように 1 発ずつ追わなくてよく、発火のフレームに付け直しも含めて刻みが決まる。そのため、射撃の回数のきっかけで `afterInterval` に限った理由（付け直しで延びた tick がループの中で後から予約できる形だけ。[design-raven-s1.md](design-raven-s1.md) 8 節の 2）は当たらず、`atApplication` も書ける。クールタイムの印・`since` のある周期は、発火をループの中で追うので組まない。状態の名前のある dot は、同じ状態のほかの dot とのまとまり・解除・スタック量▲を 2 パス目だけが見るので組まない（どちらも使い手が出たら広げる）。
- 退化の見込み: 周期のきっかけでゲージを溜める dot の使い手はロザンナ：シックオーシャンだけ。ほかの定義の予測は変わらない（V-0847 の `records:residual -- --all`）。

## 6. 経過

- 2026-11-14: 起案（V-0760 の録画を読んだ後）。
- 2026-11-14: オーナーの承認（「承認」）で 2 節を実装し、遅れを 8f にした（V-0760、C-1196）。
- 2026-11-21: 7 節を実装した（オーナーの依頼の「未対応の notes を確かめて定義を直す」の中で。V-0847、C-1504）。
