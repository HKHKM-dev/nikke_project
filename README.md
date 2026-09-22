# NIKKE ダメージ計算ツール

『勝利の女神：NIKKE』のソロレイド / ユニオンレイド（単体ボス・180 秒）を対象に、編成全体のダメージを算出するツール群です。

- `packages/core` … Blablalink 公開 CDN からのデータ取得、キャラデータ、ステータス・ダメージ計算（calc / sim で共有）
- `apps/calc` … 数式ベースの期待値計算 Web アプリ（5 人編成の通常攻撃を合算。編成はブラウザの localStorage に保存）
- `plan/` … 要件定義・ロードマップ・設計書

## 開発

Node.js 24 以上が必要です。

```bash
npm install
npm run fetch-data   # Blablalink CDN からキャラデータを取得して packages/core/data に書き出す
npm test
npm run dev          # apps/calc を起動
```

## ライセンスとデータの扱い

- ソースコードは MIT ライセンスです（`LICENSE`）。
- ゲーム内データ・キャラクター名・画像などは SHIFT UP / Level Infinite の権利物であり、本リポジトリのライセンスの対象外です。
- `packages/core/data` は Blablalink 公開 CDN から取得したデータを正規化したものです。
