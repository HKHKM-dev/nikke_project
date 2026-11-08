# 設計書: バッジの六角形の枠を書き出しで合成する

- 対象: バッジの元の SVG（`apps/web/badges-src/`）と、書き出しのコマンド（`apps/web/scripts/badges.ts`）・その検査（`apps/web/scripts/badges.test.ts`）
- 状態: 実装した（案 A。5・6 節）
- 関連: [design-modern-ui.md](design-modern-ui.md) 2.5 節（バッジの置き場所・書き出し・命名規則。決定 4・5・8）
- 作成日: 2026-11-09

## 1. 背景

- 枠のあるバッジは、130×150 の六角形の枠を元の SVG ごとに持っている。新しいバッジは、ある 1 つを写して中身を描き替えて作っている。
- オーナーは、枠を流用して中身だけを変えられるようにしたい（2026-11-09）。流用の仕方は、画面で枠と中身を重ねる案ではなく、`npm run badges:build` の書き出しで合成する案を選んだ（同日）。書き出したファイルの名前と形は今と同じなので、画面のコードは変わらない。

## 2. 調べたこと（`badges-src/` の 57 個）

- 枠: 外側の黒い線（`hex-out`。polygon）と、内側の暗い六角形に色の縁（`hex-in`。path）の 2 つの要素。40 個が持つ。枠の無い 17 個は `rarity_R`・`rarity_SR`・`rarity_SSR`（120×60）、`ui_main`（100×150）、100×100 のアイコン 13 個。`burstStep_*` だけラベルが大文字で始まる（`Hex-out`・`Hex-in`）。
- 枠の違い:

<!-- prettier-ignore -->
| 違い | バッジ |
| --- | --- |
| 同じ枠（中は `#1a1a1a`、縁は `#ffffff`） | `burst_*`・`class_Defender`・`corporation_ELYSION`・`PILGRIM`・`TETRA`・`weaponType_*`（SMG 以外）・`rarity_*-badge`・`ui_main-badge`・`ui_blank`・`ui_delete`・`ui_ring` |
| 縁が属性の色 | `element_*`（Electronic `#f70ad8`・Fire `#ff0000`・Iron `#feb902`・Water `#007dfd`・Wind `#00ff00`）。単位が mm（`viewBox` 34.395833×39.6875）で描いてあるが、130/34.395833 = 3.7795（96dpi の px/mm）倍すると形も位置も同じ |
| 中がバースト段階の色 | `burstStep_*`（Step1 `#008000`・Step2 `#b27800`・Step3 `#cc0000`・AllStep `#8b00cc`）。`burstStep_Step3` は `hex-in` に 0.00005 ほどの平行移動が付く |
| 縁がレア度の色、中が白か暗い色 | `collection_R`・`SR`・`SSR`（縁は `#00a8ff`・`#df20df`・`#ff8000`、中は `#ffffff`）と `-max`（中は `#1a1a1a`）。`collection_plain` は同じ枠の色。どれも `hex-in` が 0.25 上にある |
| 小さなずれ | `corporation_MISSILIS`（`hex-in` が 0.09 下）・`weaponType_SMG`（0.00004）・`corporation_ABNORMAL` と `element_Electronic`・`Iron`・`Water`（`hex-out` が塗りつぶし）・`class_Attacker`・`class_Supporter`（`hex-in` の形は同じで、パスの書き方だけ違う） |

- 構造: どの元も、枠の 2 つの要素が本体の最初にあり（`corporation_ABNORMAL` だけ `g[hexagon]` に包む）、中身はその後にある。中身のマスク（`corporation_*`・`weaponType_*`・`collection_*` の Inkscape の powermask）は中身の図形を切るもので、枠を参照しない。→ 枠の要素を外せば中身だけが残り、合成は枠の後に中身を置けばよい。
- `hex-out` の塗り: `hex-in` が縁の外端まで `hex-out` の内側を覆うので、`hex-out` を塗っても見た目は変わらないと見込む（4 節の画素の比べで確かめる）。
- `-badge` 版の中身は、元の版を動かしただけではない。`rarity_R-badge` は `rarity_R` を (5, 45) 動かしたうえで、陰の 2 色を変えている。`ui_main-badge` は形も違う（帯が短く、円が増える）。→ `-badge` 版も自分の中身の元を持つ（元の版から作らない）。

## 3. 案

### 3.1 元の形

- **案 A（推奨）: 元から枠を外す。** 枠を `badges-src/frame/hex.svg` に 1 つだけ置き、枠のあるバッジの元は中身だけにする（画面の大きさは今のまま。130×150、`element_*` は mm）。枠の事実が 1 か所になり、枠を直すときは `frame/hex.svg` だけを直す。
  - Inkscape での描き方: 新しいバッジは `frame/hex.svg` を写して開き、枠を見ながら中身を描き、枠の 2 つの要素を消して保存する。既にあるバッジを直すときは、中身だけの元を開く（枠を見たいときは `frame/hex.svg` を読み込んで、保存の前に消す）。
  - 元に枠が残っていたら `badges.test.ts` が落とす（消し忘れで枠が二重になるのを防ぐ）。
- **案 B: 元に枠を残し、書き出しで枠を正規の 1 つに置き換える。** 色は元の枠から読む。Inkscape で枠を見ながら描けるが、枠が 40 か所に残り、`frame/hex.svg` を直しても元には古い形が残る。

### 3.2 どのバッジに、どの枠を付けるか

- `badges.ts` に表を 1 つ置く。キーはファイル名（グループごとにまとめて書ける形）、値は枠の縁の色と中の色。表に載らないバッジには枠を付けない（今の枠の無い 17 個）。
- 表の中身は 2 節の今の色をそのまま写す: 既定は中 `#1a1a1a`・縁 `#ffffff`。`element_*` は値ごとの縁の色。`burstStep_*` は値ごとの中の色。`collection_<レア度>` はレア度の縁の色と中 `#ffffff`、`collection_<レア度>-max` は同じ縁の色と中 `#1a1a1a`。
- 枠を付けるもの: グループ `element`・`burstStep`・`class`・`weaponType`・`corporation`・`burst`・`collection`、変種 `-badge`、`ui_blank`・`ui_delete`・`ui_ring`。`ui_blank` の元は空の SVG になる（書き出しは枠だけ）。

### 3.3 合成の仕方

- 書き出しは `viewBox="0 0 130 150"` の SVG に、枠の 2 つの要素（表の色）を置き、その後に中身の元の本体を置く。中身の元の `viewBox` が 130×150 でないもの（`element_*` の mm）は、`viewBox` を 130×150 に合わせる拡大縮小（`<g transform>`）で包む。縦横の比が違う中身は今は無い（`-badge` 版の中身も 130×150 で描いてある）ので、置く位置の表は作らない。比が違う元があれば書き出しが止まる。
- 中身の元の `defs`（マスク・フィルタ）はそのまま持ってくる。枠の要素には `id` を付けないので、中身の `id` と重ならない。
- そのあと、今と同じ設定（`preset-default` から `convertTransform` を切る）で svgo にかける。

### 3.4 枠の小さなずれ

- 合成すると枠は 1 つになるので、2 節の「小さなずれ」と `collection_*` の 0.25 上のずれは消える（`collection_*` 7 個・`corporation_MISSILIS`・`weaponType_SMG`・`corporation_ABNORMAL`・`element_*` 3 個・`class_*` 2 個・`burstStep_Step3`）。見た目の差は縁の数画素のアンチエイリアス程度と見込む。
- `collection_*` の 0.25 上のずれが意図したもの（中の白を見せる幅を変えるなど）なら、`collection` の行に「上に 0.25 ずらす」を持たせる。

## 4. 確かめ方

- 画素の比べ: 合成した書き出しを、今の書き出し（main の版）と、白・`#0b0f17`・灰の背景で 260×300 に描いて比べる（design-modern-ui.md 2.5 節の「小さくする」と同じ）。3.4 節のずれをそろえたもの以外は差が縁のアンチエイリアスだけ、そろえたものは差の場所が枠の縁だけであることを確かめる。描くのは playwright-core と手元の Chrome（使い捨てのスクリプト。コミットしない）。
- `badges.test.ts`: 書き出しが、元と枠を合成して小さくしたものと同じこと（今の検査を合成に置き換える）、元と書き出しの顔ぶれが同じこと（今のまま）、案 A なら枠のある元が残っていないこと、表のキーに当たるファイルがあること。
- 画面: 書き出しのファイルの名前と形（1 枚の SVG）が変わらないので、上の画素の比べで足りる。画面では確かめない。

## 5. 決めてほしいこと

1. 元の形: 案 A（元から枠を外す）か、案 B（元に枠を残し、書き出しで置き換える）か（3.1 節）
2. 枠の小さなずれをそろえてよいか。`collection_*` の 0.25 上のずれは意図したものか（3.4 節）

- 決定 1（2026-11-09、オーナー）: 案 A。
- 決定 2（2026-11-09、オーナー）: 枠の小さなずれはそろえる。`collection_*` の 0.25 のずれも意図したものではなく、そろえる。

## 6. 実装と確かめた結果

- 枠: `badges-src/frame/hex.svg`（`ui_blank` の元を写した Inkscape の SVG）。`frame/` は `badges-src/` の直下でないので、書き出しの対象にならない。
- 元: 40 個から枠の 2 つの要素（と `corporation_ABNORMAL` の `g[hexagon]`）を外した。中身は 1 文字も変えていない。`ui_blank` の元は中身の無い SVG になった。
- `badges.ts`: 枠を付けるバッジと色の表 `FRAMES`（3.2 節。キーはファイル名か、`<グループ>_*`・`*-<変種>`）を引く `frameOf`・`parseFrame`・`composeBadge`（3.3 節）・`buildBadge`。
- 書き出し: 57 個のうち 31 個は前とバイト単位で同じ。
- 画素の比べ（4 節）: 変わった 26 個のうち 9 個は画素も同じ（`burstStep` の 3 個・`burst_auto`・`class_Attacker`・`class_Supporter`・`corporation_PILGRIM`・`weaponType_SG`・`weaponType_SR`）。残る 17 個は、差の図を見て、差のある画素がどれも枠の縁の線の上だけで、中身には無いことを確かめた。差の大きさ（3 つの背景での最大、0〜255）:
  - `collection_*` 7 個: 最大 111。`hex-in` の 0.25 のずれが消えたため、白い中と色の縁の境が 1 画素ほど動く。
  - `element_*` 5 個: 最大 29（`Electronic`・`Iron` は白の背景で 76。`hex-out` の塗りが消えたため、外側の線と縁の間の継ぎ目のアンチエイリアスが変わる）。mm で描いた枠が px の枠に置き換わったため、縁の全周で丸めの差が出る。
  - `corporation_ABNORMAL`（68）・`corporation_MISSILIS`（40）・`weaponType_SMG`（18）・`weaponType_AR`（17）・`burstStep_Step3`（17）: `hex-out` の塗り・`hex-in` の小さなずれ・`hex-out` の頂点の書き始めの位置の違いによる、縁のアンチエイリアス。
- `badges.test.ts`: 書き出しが元を合成して小さくしたものと同じこと・元と書き出しの顔ぶれ・元に枠が残っていないこと・色の表の値ごとにファイルがあること・`frameOf` と `composeBadge` の振る舞い。

## 経過

- 2026-11-09: 起案。
- 2026-11-09: 案 A で実装した（6 節）。
