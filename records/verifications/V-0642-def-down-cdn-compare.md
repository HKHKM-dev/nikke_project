# V-0642: 防御力▼の効き方がキャラで違うわけを CDN のデータで比べる

- 問い: 説明文の値どおりに効く防御力▼（エーテル S2・エレグ バースト・ルドミラ S1）と、的の防御を 0 にする形で効く▼（トロニー S2・プロダクト23 バースト）は、公開 CDN のデータ（効果の関数の種類・値の種類など）で書き方が違うか
- 話題: スキル・キャラ固有
- 日付: 2026-11-03
- 状態: 保留
- 待ち: スキルの効果の関数の定義（`function_type`・`function_value_type` など）が取れる取得元

## 条件

- 型: 撮影なしの絞り込み（撮らない。CDN のデータだけを比べる）。
- 比べる▼（どれも定義と結論は各結論のファイル）:
  - 説明文の値の式（C-0556・C-0790）で合う: エーテル（291）の S2（C-0832）・エレグ（500）のバースト（C-0690）・ルドミラ（190）の S1（C-0556）。
  - 的（防御 100）の防御を 0 にした式と合う（仮説・定義に入れていない）: トロニー（501）の S2（C-0851。V-0613）・プロダクト23（307）のバースト（C-0777。V-0565）。
- 見たいこと: 効果の関数の種類・値の種類（割合か実数か、何の値に掛けるか）・対象・スタックなどの欄で、合う 3 体と合わない 2 体が分かれるか。値の種類が違うなど、「防御 0」になる説明がデータから立つか。

## 予測

なし

## 読み方

- 取得元: Blablalink の公開 CDN の roledata（`/roledata/{resourceId}-v2-{ja,en}.json`。`packages/core/scripts/blablalink/` の取り方で、`fetch-data.ts` と同じ）。5 体の ja・en を取り、生のまま比べた（生のデータはリポジトリに入れていない）。
- あわせて見たもの:
  - ShiftyPad の画面の JS（`www.blablalink.com/shiftyspad` が読む `index-*.js`）が CDN から取るパスの全部（`getGameJsonResource` の呼び出し）。
  - そのうち fetch-data.ts が取っていない `/character/character_skill_map.json`（キャラごとのスキルのアイコン）と `/character/character_id_map.json`。
  - ShiftyPad の API（`GetUserCharacterDetails`）の応答の `state_effects`（plan/design-stage12.md の取り方）。

## 結果

### 関数の定義は公開データに無い

- S1・S2（`skill1_detail`・`skill2_detail`）の欄は、ID・アイコン・名前・説明文・`description_value_list` だけで、効果の関数の ID も無い。
- バースト（`ulti_skill_detail`）は、`skill_type`・`skill_value_data`・`duration_type`・関数の ID の列（`before_use`・`before_hurt`・`after_use`・`after_hurt` の `function_id_list`）まで。関数の中身（`function_type`・`function_value`・`function_value_type`・`function_standard`・`function_target`）は無い。
- ShiftyPad の画面が CDN から取るのは、roledata・キャラ一覧・顔とアイコンの表・好感度・レベル・リサイクルルーム・装備・OL のオプション・宝物・キューブ・好感度の場面だけで、関数の表は無い。
- 関数の中身（`function_details`）を返すのは ShiftyPad の API の `state_effects` だけで、装備の OL の 9 種（`StatAtk`・`StatDef` など）のぶんしか返さない。スキルの関数は返さない。
- 問いの「値の種類」は、公開データでは比べられない。

### 見えている欄の比べ

ja と en の `description_value_list` は、5 体とも同じ。

<!-- prettier-ignore -->
| 欄 | エーテル S2 | エレグ バースト | ルドミラ S1 | トロニー S2 | プロダクト23 バースト | 分けるか |
| --- | --- | --- | --- | --- | --- | --- |
| 効き方（結論） | 説明文の値（C-0832） | 説明文の値（C-0690） | 説明文の値（C-0556） | 防御 0（C-0851） | 防御 0（C-0777） | — |
| スロットの表 | CharacterSkill（ID 1291201） | バースト（1500301） | StateEffect（2190101） | StateEffect（2501201） | バースト（1307301） | 分けない（StateEffect にもバーストにも両方がある） |
| `skill_type` | — | InstantNumber | — | — | InstantNumber | 分けない |
| ▼の関数の置き場所 | — | `after_hurt` 150030102（`after_use` 150030101 は、説明文の順から分配ダメージ▲と読む） | — | — | `after_hurt` 130730101 | 分けない（どちらもヒットの後） |
| `skill_value_data` | — | Percent 18709・Integer 1 | — | — | Percent 0・Integer 2・Integer 0 | バースト 2 体では違う。S2 のトロニーには無い欄で、合わない 2 体を一緒には分けない |
| `duration_type` | — | None | — | — | TimeSec（値 0） | 同上 |
| 説明文（ja） | 「防御力{v03}％▼」「{v04}秒間維持」 | 「ブームインストール：防御力{v04}％▼」「{v05}秒間維持」 | 「防御力{v01}％▼」「{v02}秒間維持」 | 「防御力{v05}％▼」「{v06}秒間維持」 | 「防御力{v02}％▼」「{v03}秒間維持」 | 分けない（状態名が付くのはエレグだけ） |
| 説明文（en） | DEF ▼ X% for Y sec. | BOOM Install: DEF ▼ X% for Y sec. | DEF ▼ X% for Y sec. | DEF ▼ X% for Y sec. | DEF ▼ X% for Y sec. | 分けない |
| 対象 | 同じ敵（S2 の当たった敵 3 機） | 照準線に最も近い敵 1 機 | 対象 | 対象 | 最終攻撃力が最も高い敵 2 機 | 分けない |
| Lv10 の値（%） | 9.38 | 35.64 | 8.4 | 9.59 | 48.75 | 分けない（同じくらいの 9.38 は説明文どおり、9.59 は防御 0） |
| Lv1 ÷ Lv10 | 7/16 | 13/22 | 11/20 | 13/22 | 1/10 | 分けない（トロニーはエレグと同じ形） |
| 持続（秒） | 6 | 10 | 10 | 10 | 5 | 分けない |
| スキルのアイコン（`character_skill_map`） | atkup | — | atkdown | sharedamageincrease | — | 分けない（▼のアイコンの付いたスロットは 5 体とも無い） |

## 分かったこと・分からないこと

- 公開 CDN のデータの見えている欄は、説明文どおりに効く 3 体と、防御 0 で効く 2 体を分けない。
- 「防御 0」になる説明は、データから立たない。説明文の値を 10 倍にしても、2 機分の和にしても 0 にならないことは C-0851・C-0777 にある。関数の値の種類（割合か実数か）が違うという読みは、公開データに値の種類の欄が無いので、確かめも否定もできない。
- 違いがあるとすれば、公開データに無い関数の中身。比べるには、スキルの関数の定義が取れる取得元が要る（冒頭の「待ち」）。

## 次に撮るもの

なし（撮影で見分ける案は起案していない）
