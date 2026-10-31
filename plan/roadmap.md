# ロードマップ

- 何のための文書か: Stage の一覧。Stage ごとに 1 行（内容・状態・設計書）を書き、状態が変わったときだけ直す。
- 関連: [requirements.md](requirements.md)（目的と方針）、[backlog.md](backlog.md)（課題と、残っている仕事）、[roadmap-archive.md](roadmap-archive.md)（2026-10-25 までの各 Stage の中身と課題の経過。凍結）

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
