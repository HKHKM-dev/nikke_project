# V-0642: 防御力▼の効き方がキャラで違うわけを CDN のデータで比べる

- 問い: 説明文の値どおりに効く防御力▼（エーテル S2・エレグ バースト・ルドミラ S1）と、的の防御を 0 にする形で効く▼（トロニー S2・プロダクト23 バースト）は、公開 CDN のデータ（効果の関数の種類・値の種類など）で書き方が違うか
- 話題: スキル・キャラ固有
- 日付: 2026-11-03
- 状態: 保留
- 待ち: スキルの効果の関数の定義（`function_standard` など）の取得元。公開の取得元は無く、ゲームの StaticData を使うかはオーナーの判断待ち（「分かったこと・分からないこと」）

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

### 関数の定義の取得元を探した（2026-11-03）

<!-- prettier-ignore -->
| 取得元 | スキルの関数 | 中身 |
| --- | --- | --- |
| Blablalink の画面の JS の全部（`index-*.js` と、そこから読む分割ファイル 196 個） | 無い | CDN のパスは「読み方」の 15 個だけ。Game の API の一覧にも、スキルの関数を返すものは無い |
| GitHub のコード検索（`function_value_type`・`StateEffectTable`・`function_standard` など） | 型だけ | `d34d633f/nikke-einkk`（MIT。NIKKE の戦闘シミュレータ）と `SharpnelXu/nikke-mpk-json-converter` が関数の表（`FunctionData`）を扱う。どちらもデータは入っていない |
| ゲームの StaticData | ある（einkk の型による） | einkk はゲームのロビーのサーバーから StaticData を落として復号し、関数の表を読む。converter の README は、復号を伴うので開発を非公開に移したと書く。この検証では取っていない |

- einkk の関数の表の型の欄: `function_type`・`function_value_type`（None・Integer・Percent）・`function_standard`（User・FunctionTarget）・`function_target`・`function_value`・`duration_type`・`delay_type` など。
- 防御に関わる `function_type`（einkk の列挙）: `StatDef`・`DefIgnoreDamage`・`DefIgnoreDamageRatio`・`ChangeNormalDefIgnoreDamage`・`DefIgnoreSkillDamageInstant` など。
- einkk のコードの割合の効果は、`function_standard` の持ち主の値に掛ける（User は効果を付けた側、FunctionTarget は付けられた側。`lib/model/battle/buff.dart` の `getFunctionStandardId`・`battle_entity.dart` の `getBuffValueOfTypes`）。ゲームの挙動の根拠ではなく、einkk の作者の読み。
- `function_standard` の欄はゲームのデータにある（ShiftyPad の API の装備の `state_effects` にも `function_standard: "User"` が入っている）。

## 分かったこと・分からないこと

- 公開 CDN のデータの見えている欄は、説明文どおりに効く 3 体と、防御 0 で効く 2 体を分けない。
- 「防御 0」になる説明は、データから立たない。説明文の値を 10 倍にしても、2 機分の和にしても 0 にならないことは C-0851・C-0777 にある。関数の値の種類（割合か実数か）が違うという読みは、公開データに値の種類の欄が無いので、確かめも否定もできない。
- 違いがあるとすれば、公開データに無い関数の中身。スキルの関数の定義は、公開の取得元には無い。ゲームの StaticData にあるが、取るには復号が要る。使うかどうかはオーナーの判断（冒頭の「待ち」）。
- 仮説（推論。外の OSS のコードの読みから立てた。5 体の欄は見ていない）: トロニーの S2 とプロダクト23 のバーストの▼は `function_standard` が User で、付けた側の防御力 × X を敵の防御から引き、0 で止まる。エーテル・エレグ・ルドミラの▼は FunctionTarget で、敵の防御力 × X を引く（C-0556）。どのキャラの防御力も、ふつうの育成ではトロニー・プロダクト23 の X を掛けて 100 を超えるので、防御 100 の的では 0 になる（C-0851・C-0777 と矛盾しない）。
- 射撃場の的（防御 100）でこの仮説を見分けるには、付ける側の防御力 × X を 100 未満にする必要がある。説明文の値からは、トロニーは防御力がおよそ 1,043 未満（S2 Lv10）か 1,764 未満（Lv1）、プロダクト23 は 205 未満（バースト Lv10）か 2,053 未満（Lv1）。スペック固定 ON では届かない。スペック固定 OFF でも、Lv1・装備なしでの防御力（リサイクルルームの研究・好感度を含む）がこれを下回らないと見分けられない。

## 次に撮るもの

なし（射撃場で見分けるには上の防御力の条件が要り、撮影の案は起案していない）
