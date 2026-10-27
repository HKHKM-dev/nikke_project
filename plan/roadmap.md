# ロードマップ

- 関連: [requirements.md](requirements.md)
- 番号規則: Stage・バージョンはすべて 1 始まりの整数。
- 各 Stage は前段が動いて検証済みであることを前提にする。Stage 名は仮。
- **基本原則（2026-10-27 改定）**: 計算のモデルは共通のフレームループ（1 パス目）と 2 パス目の集計の 1 本（[design-unify-sim-calc.md](design-unify-sim-calc.md)）。メカニクスは 1 パス目に足し、UI は最小限にとどめ、ヘッドレスなコアと自動テストで小規模な PDCA サイクルを回す。2026-09-22〜10-27 は「各 Stage とも sim → calc の順で並行開発する」だった
- 書き方（2026-10-25 から。[design-workflow-simplification.md](design-workflow-simplification.md) 1 節）: Stage も課題も 1 つを 1 行にし、状態と設計書と残りの行き先だけを書く。V-/C- の ID と経過は書かない（設計書・[claims.md](claims.md)・[verifications.md](verifications.md)・[backlog.md](backlog.md) が持つ）。行は状態が変わったときだけ直す。
- 表は詰めた形（`| a | b |`）で書き、前に `<!-- prettier-ignore -->` を置く（列幅をそろえ直すと 1 行の変更で表の全部の行が差分に出て、並行するブランチと衝突するため。[design-workflow-simplification-2.md](design-workflow-simplification-2.md) 4 節）。
- 2026-10-25 までの中身（各 Stage の成果物と節、閉じた課題を含む「今後の課題」の全項目と経過）は [roadmap-archive.md](roadmap-archive.md)（凍結）。

## 一覧

<!-- prettier-ignore -->
| Stage | 内容 | 状態 | 設計書 |
| --- | --- | --- | --- |
| 1 | core 最小版 — キャラの素のステータス | 完了（2026-09-22） | — |
| 2 | calc v1 — 通常攻撃のみの静的 DPS（1体） | 完了（2026-09-22） | [verification.md](verification.md) |
| 3 | calc v2 — 5人編成の合算 | 完了（2026-09-22） | [design-stage3.md](design-stage3.md) |
| 4 | スキルモデル段階 A — 常時発動パッシブ | 完了（2026-09-22） | [verification.md](verification.md) |
| 5 | フルバースト基礎とシンプルバースト（sim先行 → calc） | 完了（2026-09-22） | [design-stage5.md](design-stage5.md) |
| 6 | スキルモデル段階 B — バースト時トリガーの持続バフ | 完了（2026-09-22） | [design-stage6.md](design-stage6.md) |
| 7 | バーストゲージ蓄積と動的サイクル | 完了（2026-09-23） | [design-stage7.md](design-stage7.md) |
| 8 | スキルモデル段階 C — 回数トリガーと倍率ダメージ | 完了（2026-09-23） | [design-stage8.md](design-stage8.md) |
| 9 | 宝物（お気に入りアイテム）版スキル | 完了（2026-09-23） | [design-stage9.md](design-stage9.md) |
| 10 | スキルモデル段階 D — 射撃が変わるバフ・CT短縮・最終弾トリガー | 完了（2026-09-23） | [design-stage10.md](design-stage10.md) |
| 11 | 主力キャラの定義（1 体ずつ） | 完了（2026-09-23〜24） | [design-stage11.md](design-stage11.md)・[design-stage11-modernia.md](design-stage11-modernia.md)・[design-stage11-scarlet-bs.md](design-stage11-scarlet-bs.md) |
| 12 | 育成入力の拡張 A — ステータス層 | 実装済み（2026-09-24） | [design-stage12.md](design-stage12.md) 2・10 節 |
| 13 | 育成入力の拡張 B — 効果層 | 実装済み（2026-09-24） | [design-stage12.md](design-stage12.md) 3・12・13 節 |
| 14 | 公開準備 | 完了（2026-09-24） | [design-stage12.md](design-stage12.md) 4・14・15 節 |
| 15 | 実戦との突き合わせ（公開後） | 完了（2026-10-25） | [design-stage12.md](design-stage12.md) 5・16・17 節 |
| 16 | calc と sim の 2 モデル化 | 16-A 完了・16-B 実装・16-C 凍結（2026-09-25〜26） | [design-stage16.md](design-stage16.md) |
| 17 | 射撃場の条件の既定値（AI のコア命中率・距離ボーナス） | 承認（2026-09-26）。既定の変更は保留（backlog 7 節） | [design-stage17.md](design-stage17.md) |
| 18 | 命中率と距離ボーナス（照準円・距離帯・コア命中率） | 完了（2026-09-26） | [design-stage18.md](design-stage18.md) |
| 19 | 検証記録の構造化（録画・観測値・結論） | 完了（2026-09-26） | [design-stage19.md](design-stage19.md) |
| 20 | 検証記録の構造（検証が増えても耐えられる形） | 完了（2026-09-27） | [design-stage20.md](design-stage20.md) 12 節 |
| 21 | 時間の単位をゲーム内の時計にそろえる | 完了（2026-09-27） | [design-stage21.md](design-stage21.md) |
| 22 | チャージ武器の部分チャージと、待ちからの 1 発目 | 完了（2026-09-29） | [design-stage22.md](design-stage22.md) |
| 23 | チャージの秒をゲーム内の時計にそろえる | 完了（2026-09-30） | [design-weapon-seconds.md](design-weapon-seconds.md) 10.4 節 |
| 24 | リロードの秒をゲーム内の時計にそろえる | 完了（2026-10-01） | [design-weapon-seconds.md](design-weapon-seconds.md) 10.5 節 |

## 残タスクの棚卸し

- いま残っている仕事を種類ごとに 1 行ずつ並べた一覧は [backlog.md](backlog.md)（開いている検証・未解明の機構・許容外の残差・オーナーの判断待ち・道具の整備・スキル定義の未対応・Stage の未完了部分）。課題ごとの経過は設計書と検証記録に置き（2026-10-25 までは [roadmap-archive.md](roadmap-archive.md) にも）、roadmap.md と backlog.md には書かない。課題が閉じたら backlog.md の行を消し、下の行の状態を変える。

## 今後の課題

- 1 行の形: 題名（起票日）→ 状態・設計書（あれば）・残りの行き先（backlog の行）。題名は変えない（検証記録・設計書が題名で指す）。
- 2026-10-25 までに閉じた課題（完了・打ち切り）は [roadmap-archive.md](roadmap-archive.md)「今後の課題」にある。

- sim と calc の一本化とレスポンス保証（2026-10-27 起票）→ 承認（2026-10-27）。(A) 一本化は完了（2026-10-27。段 A-1〜A-3）。残りの (B) レスポンスは backlog 5 節: [design-unify-sim-calc.md](design-unify-sim-calc.md) 8 節
- 語彙はあるのに撮っていない効果の撮影（2026-10-26 起票）→ 完了（2026-10-27。フォルクヴァンの回復の定義は backlog 6 節）: [design-skill-unrecorded.md](design-skill-unrecorded.md)
- エレグ（500）の定義（2026-10-26 起票）→ 段 1（S2 のターゲット出現時のゲージ 100%）・段 2（バースト）・段 3 の S2（ブームインストール中の攻撃力▲）は実装した。S1 の分配ダメージは値の式が分からず未対応（別の検証で乗数を分ける）: [design-elegg.md](design-elegg.md)・[design-elegg-s3.md](design-elegg-s3.md)
- 録画の番号を 4 桁にそろえる（2026-10-25 起票）→ 完了（2026-10-25）: [design-recording-id-4digit.md](design-recording-id-4digit.md)
- 回数トリガーで付く持続の効果の付き始めの遅れ（2026-10-24 起票）→ 第 1 段（ナガ・ミサト・モラン）と第 2 段（プリバティ・ドレイク・紅蓮BS・レイヴン）は実装した（[design-shot-count-trigger-frame.md](design-shot-count-trigger-frame.md)）。残りは backlog 2-38
- クラウド環境（2026-10-23 起票）→ 実装済み（2026-10-23）: [design-cloud-environment.md](design-cloud-environment.md)・手引き [cloud-guide.md](cloud-guide.md)
- スキルのバフ・状態・回復の分類と、2 段目の語彙の段階（2026-10-14 起票）→ 段 1〜10 を閉じた。段 11 以降は未定: [design-skill-catalog.md](design-skill-catalog.md)・[design-skill-stages.md](design-skill-stages.md)（段ごとの設計書はそこから）
- 効果を持ち主ごとの一覧で持つ組み直し（2026-10-15 起票）→ 段 A〜E 実装済み（2026-10-15）: [design-holder-effects.md](design-holder-effects.md)
- 単騎の与ダメージの許容外（2026-09-28 起票）→ 一部完了: [design-stage22.md](design-stage22.md) 8 節。残りは backlog 3 節
- 持続の命中率▲をコア命中率に効かせる（2026-09-28 起票）→ 一部完了: [design-sustained-hit-rate-core.md](design-sustained-hit-rate-core.md)。残りは backlog 1.2 節
- ヘルムの残り（2026-09-28 起票）→ 一部完了: [design-helm.md](design-helm.md)・[design-heal-vocabulary.md](design-heal-vocabulary.md)。backlog の行（2-12）は閉じた
- calc のハイブリッド（[design-stage10.md](design-stage10.md) 5 節）の限界（2026-09-28 起票）→ 完了（2026-10-27。全グループを射撃の列から数える形に一本化。[design-unify-sim-calc.md](design-unify-sim-calc.md)）: [design-calc-hybrid.md](design-calc-hybrid.md) 10 節
- SG の命中率（2026-10-01）→ 一部完了: [design-sg-hit-rate.md](design-sg-hit-rate.md)。残りは backlog 2-1
- 命中率▲が弾丸命中率に効く式（2026-10-03 起票）→ 一部完了: [design-hit-rate-up-bullet-h2.md](design-hit-rate-up-bullet-h2.md)。残りは backlog 2-1
- バーストの効果の着弾の遅れと、同じ発動の中の効果の順（2026-10-01 起票）→ 一部完了: まとめは [burst-effect-delay-candidates.md](burst-effect-delay-candidates.md)「まとめ」、[design-burst-landing.md](design-burst-landing.md)・[design-burst-split-hits.md](design-burst-split-hits.md)・[design-burst-effect-window-end.md](design-burst-effect-window-end.md)。残りは backlog 2-4
- 検証の自動化（2026-10-01 起票）→ 一部完了: [design-records-automation.md](design-records-automation.md) 8 節。backlog の行（4-1）は閉じた
- アニス：スター（17）の S1（2026-10-03）→ 一部完了: [design-anis-star-s1.md](design-anis-star-s1.md)・[design-anis-star-s2-burst.md](design-anis-star-s2-burst.md)・[design-anis-star-ally-gauge.md](design-anis-star-ally-gauge.md)。残りは backlog 6 節
- 防御力無視ダメージ・有利コードの攻撃ダメージ等の語彙（2026-10-05）→ 一部完了: [design-true-damage-element.md](design-true-damage-element.md)・[design-delayed-skill-hit.md](design-delayed-skill-hit.md)。残りは backlog 6 節
- 対象の語彙（2026-10-05）→ 一部完了: [design-target-vocab.md](design-target-vocab.md)・[design-ranked-shot-duration.md](design-ranked-shot-duration.md)。残りは backlog 6 節
- アニス：スター（17）のバーストのコアの経路（2026-10-05）→ 一部完了: [design-anis-star-core-path.md](design-anis-star-core-path.md)。残りは backlog 6 節
- 押下チャージ型（DOWN_Charge）の発の刻み（2026-10-04 起票）→ 一部完了: [design-anis-star-gauge-timing.md](design-anis-star-gauge-timing.md)。残りは backlog 3 節
- エーテルの S2 の防御力▼（2026-10-07）→ 一部完了（設計書なし）。残りは backlog 1.3 節
- ミハラ：ボンディングチェーン（162）の S1（2026-10-07）→ 一部完了（設計書なし。定義は未）。残りは backlog 1.3 節
- 射撃場の SMG の中近の弾丸命中率（2026-10-05 起票）→ 一部完了: [design-far-landings.md](design-far-landings.md)。backlog の行（2-25）は閉じた
- 点検で仮説にした結論の再現（backlog 2-33。2026-10-11）→ 一部完了。残りは backlog 2-33・1.2 節
