# 参考資料

- 関連: [requirements.md](requirements.md)
- 方針: 既存 OSS はコードを流用せず、仕様・検証の参考としてのみ使う。

## 類似 OSS

### Jgaram/nikke-calc

- URL: https://github.com/Jgaram/nikke-calc
- 言語: Python。ライセンス: MIT（コードのみ。ゲームアセットは対象外）
- 内容: 180 秒ボス戦を 1/60 秒刻みで再現する決定論的シミュレータ。乱数シード固定モードと期待値モードの両方あり
- 参考になる点:
  - `calculator/damage.py`（純粋なダメージ式）、`buff_manager.py`（スキルトリガーとバフのライフサイクル）、`timeline.py`（フレーム進行）の分離
  - `data/parsed_skills.json`: 韓国語スキル説明文を手動で機械可読化したもの。DSL 設計の参考
  - `data/boss_presets.json`: ボスのステータス・係数
  - `baseline/`: 数値・バフ発動回数・イベント順序・サイクル位相の 4 層でゴールデンスナップショット回帰テスト
- 多数のフォークあり（Tizmaos-crypto, farly6966, Swiftstar, dino02021 など）

### Infernal-Crack-LED/nikke-sim

- URL: https://github.com/Infernal-Crack-LED/nikke-sim
- 言語: TypeScript（Vite + React、Vitest、Hono）。ライセンス: README に記載なし（流用不可として扱う）
- 内容: ソロレイド 180 秒の 60fps フレームシミュレータ。CLI と Web が同じエンジンを使う
- 参考になる点:
  - `scripts/blablalink-stats.mjs`: Blablalink CDN のパス難読化（djb2 + MD5）の実装例
  - `src/data/sync-skill-levels.ts`: `skill1_detail` / `skill2_detail` / `ulti_skill_detail` から Lv1〜10 の数値配列を抜き出して `data/skill-levels.json` に保存
  - `docs/engine-modeling-gaps.md`, `docs/modeling-priors.md`, `docs/open-questions.md`: モデル化の抜けや前提の整理
  - 説明文パーサ + 手動検証オーバーライド JSON のハイブリッド方式。未実装効果は「モデリングノート」として表示
- 既知の制限（v1）: 敵デバフなし、常に有効射程内、敵 DEF とコア命中率は入力値、貫通・パーツ未対応

### その他

- ExiaProject/ExiaInvasion: https://github.com/ExiaProject/ExiaInvasion
  - Blablalink にログインして所持ニケの育成データを取得する Chrome 拡張（GPL-3.0）。アカウント連携を検討する際の参考。規約違反の可能性を README で明記している
- NKAS Data: https://nkas.pages.dev/data/
  - Blablalink / Prydwen 由来の JSON を再配布しているページ。データ同梱可否の判断材料
- fuwaguwa/NikkeAPI: https://github.com/fuwaguwa/NikkeAPI
  - prydwen.gg のデータを返す API

## Blablalink 公開 CDN

- ベース: `https://sg-tools-cdn.blablalink.com`
- キャラ一覧: `/character/{locale}/nikke_list_{locale}_v2.json`
- キャラ詳細: `/roledata/{resourceId}-v2-{locale}.json`
- 認証不要。`User-Agent` ヘッダは必要
- パスは各セグメントを djb2 ハッシュ + MD5 で `ab-01/cd-02/hash.json` 形式に変換する難読化あり。実装例は上記 nikke-sim のスクリプト
- 取得できる内容: レベル別 攻撃/HP/防御曲線、ステータス強化、会心率/会心ダメ、属性、武器種、スキル説明文と Lv 別数値

## ダメージ計算式の解説

- 吟味.net 防御力の影響と計算方法: https://ginmy.net/nikke_def_test
- 吟味.net 攻撃力増加バフの検証: https://ginmy.net/nikke_atkbuff_test
- 吟味.net 攻撃ダメージ増加の検証: https://ginmy.net/nikke_atkdamagebuff_test
- DayWrite ダメージ計算式とダメージの種類: https://www.daywrite.space/archives/2063
- NIKKE wiki JP ゲームシステム: https://wiki3.jp/nikke/page/26
- 射撃場の敵の防御力（はぴくろ）: https://note.com/hapiclo_leaves/n/nc37e129024a7
- NIKKE 覚え書き「武器」（anaut）: https://note.com/unifla/n/nfcdb98ee9226

## 要点メモ（設計フェーズで再検証する）

- コアヒット: ダメージ 2 倍（加算項 +1.0）
- 会心: 基礎会心率 15%、基礎会心ダメージ +50%
- フルバースト: 1.5 倍（加算項 +0.5）
- 距離ボーナス: +0.3
- 属性有利: 1.1 倍
- 防御力: `(攻撃力 − 敵防御力)` の減算方式。小数点以下は四捨五入
- 攻撃ダメージ増加バフは、コア・会心・距離・フルバースト・チャージ倍率と同じ乗算グループ内の加算項
