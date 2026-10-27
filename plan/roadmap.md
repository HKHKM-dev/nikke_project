# ロードマップ

- 関連: [requirements.md](requirements.md)
- 番号規則: Stage・バージョンはすべて 1 始まりの整数。
- 各 Stage は前段が動いて検証済みであることを前提にする。Stage 名は仮。
- **基本原則（2026-10-27 改定）**: 計算のモデルは共通のフレームループ（1 パス目）と 2 パス目の集計の 1 本（[design-unify-sim-calc.md](design-unify-sim-calc.md)）。メカニクスは 1 パス目に足し、UI は最小限にとどめ、ヘッドレスなコアと自動テストで小規模な PDCA サイクルを回す。2026-09-22〜10-27 は「各 Stage とも sim → calc の順で並行開発する」だった
- 書き方（2026-10-25 から。[design-workflow-simplification.md](design-workflow-simplification.md) 1 節）: Stage の 1 つを 1 行にし、状態と設計書と残りの行き先だけを書く（課題は [backlog.md](backlog.md) 8 節。2026-10-27 から）。V-/C- の ID と経過は書かない（設計書・[claims.md](claims.md)・[verifications.md](verifications.md)・[backlog.md](backlog.md) が持つ）。行は状態が変わったときだけ直す。
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

- 課題（設計書のあるもの）は [backlog.md](backlog.md) 8 節に置く（2026-10-27 から。[design-workflow-simplification-4.md](design-workflow-simplification-4.md) 3 節）。2026-10-25 までに閉じた課題は [roadmap-archive.md](roadmap-archive.md)「今後の課題」にある。ほかの文書が「roadmap.md「今後の課題」の「題名」」で指す項目は、この 2 か所で引ける。
