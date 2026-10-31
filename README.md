# NIKKE ダメージ計算ツール

『勝利の女神：NIKKE』のソロレイド / ユニオンレイド（単体ボス・180 秒）を対象に、5 人編成の総ダメージの期待値を算出するツール群です。

- **Web 版**: https://hkhkm-dev.github.io/nikke_project/ （GitHub Pages）
- `packages/core` … データの取得（Blablalink 公開 CDN）、キャラと育成のマスタ、ダメージの計算（射撃・バースト・バフをフレームで回し、区間ごとに集計する）
- `apps/web` … Web アプリ。計算は Web Worker で回す
- `plan/`・`records/` … 要件定義・設計書・手引きと、検証の記録（文書の地図は [AGENTS.md](AGENTS.md)「記録の置き場所」）

## できること

- 5 人編成の通常攻撃（武器種ごとの発射の間隔・チャージ・MG のスピンアップ・リロード）と、コア・会心・距離・属性・フルバーストの補正
- スキルの効果（バフ・デバフ・状態・スタック・回数のきっかけ・倍率ダメージなど）、バーストゲージと CT で回るフルバースト、宝物（お気に入りアイテム）版のスキル
- 育成の入力（シンクロレベル・限界突破・コア強化・スキル Lv・好感度・装備・OL・キューブ・コレクション）と、ユニオン射撃場のスペック固定のプリセット。リサイクルルームの研究は、編成共通の「コンソール」で入れる（キャラのクラスと企業に合う研究 Lv が効く）
- 射撃場の条件: 射撃場の的の表（実測）から、武器種ごとのコア命中率・弾丸命中率と、3 分モードの的の着地点ごとの距離ボーナスを決める。画面の敵は射撃場の的（属性だけ選べる）。属性の右の「詳細設定」で、3 分モードの的のジャンプ（撃てない時間。既定は入れる）・戦闘時間（既定 180 秒）・バースト・操作キャラを変えられる
- 実戦向けの入力（コア命中率・弾丸命中率・距離ボーナスの手入力）は CLI の `npm run sim` だけ。画面は条件を自動・HP を満タンとして計算する
- 結果: 画面は総ダメージと枠ごとのダメージ。右上の設定で「詳細情報表示」を入れると、内訳（1 秒ごとのタイムライン・通常攻撃・バーストスキル・スキルダメージ・DPS・ニケごとの受けているバフと計算式の区間・検証用の詳細）も出す。CLI の `npm run sim` でも出せる。編成はブラウザに保存し、JSON で書き出し / 取り込みできる

## 精度と未対応

- **確かめたのは主にユニオン射撃場の録画です。** 結論ごとの根拠と状態（確定・仮説）は [plan/claims.md](plan/claims.md)、モデルとの残差は [plan/residuals.md](plan/residuals.md) にあります。実戦（迎撃戦・ソロレイド・ユニオンレイド）の総ダメージとは合わせていません。
- スキルを定義したキャラと、スロットごとの対応状況は [plan/skills.md](plan/skills.md) にあります。定義の無いニケは通常攻撃だけで計算します（味方からのバフは受けます）。
- 前提（静止した単体ボス・被弾しない・味方は倒れない など）は [plan/requirements.md](plan/requirements.md) 4.2 節にあります。
- モデル全体と編成ごとの未対応・近似・仮定は、画面の「未対応・近似・仮定の一覧」にまとめて出します。

## 開発

Node.js 24 以上が必要です。

```bash
npm install
npm run fetch-data   # Blablalink CDN からキャラデータと育成のマスタを取得して packages/core/data に書き出す
npm run records:check    # 記録とデータから生成物（plan/claims.md・plan/skills.md・plan/skill-catalog.md ほか）を作り直す
npm test
npm run dev          # apps/web を起動
npm run sim -- --ids 82,330 --build builds.json   # 内訳を CLI で出す（条件は既定で自動。--condition manual で手入力）
npm run artifact:build   # Web 版を claude.ai の Artifact として出せる形に dist/artifact/ へ作り直す（公開の手順は tools/artifact/build.ts の冒頭）
```

`main` への push で GitHub Pages に配信します（`.github/workflows/pages.yml`）。リポジトリが公開のときだけ配信し、非公開のあいだはビルドとサブパスの確認だけ行います。

## ライセンスとデータの扱い

- ソースコードは MIT ライセンスです（`LICENSE`）。
- ゲーム内データ・キャラクター名・画像などは SHIFT UP / Level Infinite の権利物であり、本リポジトリのライセンスの対象外です。検証に使った録画とその切り出しはリポジトリに含めません。本ツールは非公式のファンメイドで、SHIFT UP / Level Infinite とは関係ありません。
- `packages/core/data` は Blablalink 公開 CDN（認証不要）から取得したデータを正規化したもので、Web アプリが同梱して配信します（ブラウザから CDN へは直接アクセスしません）。権利者から要請があれば同梱をやめ、利用者が `npm run fetch-data` で取得する形に切り替えます。
- 装備の強化 Lv 別の値（`data/masters/gear.json` の Lv1〜5）と OL オプションの Lv 別の上昇値（`data/masters/overload.json`）は CDN に無いため、コミュニティの検証値を転記しています（装備の Lv0 は CDN、T9 Lv5 の合計は射撃場の実測で確認。OL の値はゲームの実データの観測点と突き合わせた。確かめ方は各ファイルの `source`）。
- スキルの効果の定義（`data/skills`）は、スキルの説明文と射撃場の録画から手書きしたものです。
