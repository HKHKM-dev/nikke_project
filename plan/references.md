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

### Moris-kr/nikke-calc

- URL: https://github.com/Moris-kr/nikke-calc
- 言語: TypeScript。ライセンス: MIT（著作権者は Jgaram）
- 内容: Jgaram/nikke-calc の 2026-08 の配布版から始めた移植（GitHub 上のフォークではない）。2026-09 に Python のエンジンを削除して TypeScript に一本化し、Web サイトと MCP サーバーを足した。上流の変更は手で取り込んでいる
- 参考になる点は下の「検証の記録の仕方」

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

## 検証の記録の仕方（2026-09-27 に調べた）

[design-stage20-reviews.md](design-stage20-reviews.md) 10 節（Stage 20 の設計の別紙）の材料。コードは流用しない。

### Jgaram/nikke-calc・Moris-kr/nikke-calc

- 回帰: `baseline/` に編成ごとの JSON を置く。4 層（数値・バフの発動回数・イベントの順序・サイクルの位相）で、絶対時刻は持たない。更新は、差分を人が確かめてからにする。「変化の検知であって正しさの検証ではない」と明記し、正しさはキャラごとのシナリオ文書のチェックリストが受け持つ（`docs/HARNESS.md`）
- 実測値の決まった置き場所は無い。`docs/DATA_VERIFY.md`（項目ごとの確認の有無と日付）、データ JSON の `_note`、スキル定義の `note` などに散っている。未確定の項目には「確定に必要な測定」と「外れた場合の影響」を書く
- 正本の宣言: AGENTS.md の表で問いごとの正本を決め、写しは文書の検査で正本と突き合わせる。件数は文書に書かず、生成する
- Moris-kr は、実測値を名前付きの単体テストに固定し、外から取ったデータに取得日・制約・エンジンのハッシュを付けている

### Infernal-Crack-LED/nikke-sim

- 未解決の問い・モデル化の前提・エンジンの表現力の抜けを、別々の文書に分ける（`docs/open-questions.md`・`docs/modeling-priors.md`・`docs/engine-modeling-gaps.md`）。問いには「何を撮れば決着するか」を書き、解決したら追記専用の `docs/answered-questions.md` へ移す
- 文書を「現状型（古い記述は消す）」と「変更履歴型（追記だけ）」に分ける（`docs/CONVENTIONS.md`）
- 回帰では、動画で数えた真の値（新しい測定なしに更新しない）と、スナップショット（意図した変更と同時にだけ更新する）を分ける（`scripts/regression.ts`）
- 検証度をキャラごとに 2 軸（構造の忠実さ・数値の実証）で持つ（`data/kit-status.json`）。モデル化していない説明文は原文のまま残し、画面に出す
- 注意: 番号は生涯固定という規則があるが、U37・U40・U41 が未解決と解決済みで別の問いに使われている（2026-09-27 に確認）

### 旧プロジェクト

- 数値の正は xlsx（単騎・編成・1 発などのシート）。1 発のシートは条件・日付・出典（録画と時刻）を列で持ち、いちばん扱いやすかった。ほかのシートは備考欄の自由記述で、日付の抜けが多かった
- 結論ごとに根拠の等級 A〜E を付ける（A は「1 発の実測の比が理論値と厳密に一致」、E は「説明文の読み・推論」）
- 無効になった実測は消さずに印を付けて、突き合わせから外す。乖離の一覧は生成物にし、版と日付を冒頭に書く
- 撮る前に、仮説ごとに何が見えるかを書く
- 困った点:
  - 時系列の記録が 1 本 47 万字まで育ち、開いて読めなくなった
  - 参照の連鎖と、古い数値の引き写し
  - 運用の規則・検査・hook の積み増し（規則の文書 74KB・機械検査 26 種・hook 11 本）

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
