# バックアップの実行の記録

- 2026-09-27（Stage 20-C）に index.md「バックアップ」から移した。手順は [storage.md](storage.md)「バックアップ」にある（2026-10-11 に index.md から移した）。
- 2026-10-05 までの記録は [backup-log-old.md](backup-log-old.md)（凍結）。
- 同期したら、ここに足す（日付・足したもの・sha256 の突き合わせの結果）。`intake.ts` で取り込んで同期した録画は、`intake.ts` が 1 行足す（2026-10-11 から。sha256 の値は録画の JSON にある）。手で同期したときと、番号の振り直しなどは段落で書く。

2026-10-06 に、[backup-log-old.md](backup-log-old.md) の録画 228〜230 は取り込みのときに 213〜215 の番号で入れたが、別の作業の録画（`20261005-213`〜`215_smg_liter_auto.mp4`）と番号が重なったので、E: と I: の両方で 228〜230 に改名した（中身と sha256 は同じ）。

- 2026-10-06 00:13 録画 231（ウンファ：タクティカル・アップ単騎）: `range/20261005-231_sr_eunhwa-tu_crit-rate.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:13 録画 232（I-DOLL・フラワー + ウンファ：タクティカル・アップ）: `range/20261006-232_rl+sr_flower+eunhwa-tu_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:13 録画 233（I-DOLL・フラワー + ウンファ：タクティカル・アップ + I-DOLL・サン）: `range/20261006-233_rl+sr+ar_flower+eunhwa-tu+sun_full-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:58 録画 242（ウンファ：タクティカル・アップ単騎）: `range/20261006-242_sr_eunhwa-tu_crit-rate.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 234（リター単騎）: `range/20261006-234_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 236（リター単騎）: `range/20261006-236_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 237（リター単騎）: `range/20261006-237_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 238（リター単騎）: `range/20261006-238_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 239（リター単騎）: `range/20261006-239_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 240（リター単騎）: `range/20261006-240_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 241（リター単騎）: `range/20261006-241_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 235（リター単騎）: `range/20261006-235_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 01:03 録画 243（鈴原サクラ単騎）: `range/20261006-243_smg_sakura_skills.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:34 録画 244（ミランダ + デルタ）: `range/20261006-244_smg+sr_miranda+delta_burst.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 07:34 に録画 245（ミランダ + デルタ + I-DOLL・サン）を `intake.ts` で取り込み、この 1 本（`range/20261006-245_smg+sr+ar_miranda+delta+sun_full-burst.mp4`）だけを同期した。E: と I: で sha256 が一致（`c336fa3bc89a`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。
2026-10-06 07:35 に録画 246（鈴原サクラ + デルタ + ブラン + ノワール）を `intake.ts` で取り込み、この 1 本（`range/20261006-246_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4`）だけを同期した。E: と I: で sha256 が一致（`7247098dc40a`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 07:35 録画 247（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-247_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:35 録画 248（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-248_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:35 録画 249（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-249_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 07:45 に、上の 4 本（鈴原サクラ + デルタ + ブラン / ユニ + ノワール）を、別のセッションが同じ時刻に 244・245（ミランダ）を取り込んでいたため、撮った順に 246〜249 へ振り直した（E: と I: の両方でファイル名を替え、sha256 の先頭と大きさが替える前と一致することを確かめた）。

- 2026-10-06 08:03 録画 250（マナ単騎）: `range/20261006-250_ar_mana_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 251（マナ単騎）: `range/20261006-251_ar_mana_tboost-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 252（マナ単騎）: `range/20261006-252_ar_mana_bear-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 253（ノワール単騎）: `range/20261006-253_sg_noir_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:52 録画 258（ラム + デルタ + 雪子）: `range/20261006-258_sr+sr+mg_ram+delta+yukiko_wind_yukiko-auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 19:52 に録画 259（ココア + ユニ + クイーン（真） + 雪子）を `intake.ts` で取り込み、この 1 本（`range/20261006-259_sr+rl+sg+mg_cocoa+yuni+queen-makoto+yukiko_wind_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`374069528fa1`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 19:52 録画 260（ラム + デルタ + 雪子）: `range/20261006-260_sr+sr+mg_ram+delta+yukiko_fire_yukiko-auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 19:52 に録画 261（ココア + ユニ + クイーン（真） + 雪子）を `intake.ts` で取り込み、この 1 本（`range/20261006-261_sr+rl+sg+mg_cocoa+yuni+queen-makoto+yukiko_fire_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`50204838d085`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 19:59 録画 262（ミランダ + デルタ + I-DOLL・サン）: `range/20261006-262_smg+sr+ar_miranda+delta+idoll-sun_miranda-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:59 録画 263（エマ：タクティカル・アップ単騎）: `range/20261006-263_mg_emma-tu_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:08 録画 264（アスカ + ヘルム）: `range/20261006-264_ar+sr_asuka+helm_helm-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:08 録画 265（アスカ + ヘルム）: `range/20261006-265_ar+sr_asuka+helm_helm-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:12 録画 266（ミサト単騎）: `range/20261006-266_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:51 録画 274（ミサト単騎）: `range/20261006-274_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:51 録画 275（ミサト単騎）: `range/20261006-275_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 254（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-254_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 255（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-255_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 256（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-256_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 257（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-257_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:29 録画 267（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-267_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:29 録画 268（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-268_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:30 録画 269（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-269_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 270（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-270_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 271（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-271_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 272（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-272_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 22:46 録画 276（ソルジャーF.A.単騎）: `range/20261006-276_sg_soldier-fa.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 22:52 録画 277（I-DOLL・オーシャン + ソルジャーF.A.）: `range/20261006-277_sg_soldier-fa_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:10 録画 282（ソルジャーE.G.単騎。取り込んだときの番号は 276 で、main の録画と重なったので同じ日に 282 に振り直し、E: と I: のファイル名も替えた）: `range/20261006-282_ar_soldier-eg_s2-no-fire.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 283（ソルジャーE.G.単騎。取り込んだときの番号は 277 で、同じく 283 に振り直した）: `range/20261006-283_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 278（ソルジャーE.G.単騎）: `range/20261006-278_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 279（ソルジャーE.G.単騎）: `range/20261006-279_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 280（鈴原サクラ + デルタ + ソルジャーE.G.）: `range/20261006-280_smg+sr+ar_sakura+delta+soldier-eg_eg-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 281（鈴原サクラ + デルタ + ソルジャーE.G.）: `range/20261006-281_smg+sr+ar_sakura+delta+soldier-eg_eg-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:40 録画 284（I-DOLL・フラワー + ユニ + アスカ）: `range/20261006-284_ar_asuka_s1-extend.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:50 録画 285（ミランダ + デルタ + I-DOLL・サン）: `range/20261006-285_smg+sr+ar_miranda+delta+idoll-sun_delta-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:58 録画 286（I-DOLL・フラワー + エマ：タクティカル・アップ）: `range/20261006-286_rl+mg_flower+emma-tu_explosion.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:58 録画 287（I-DOLL・フラワー + ウンファ：タクティカル・アップ + エマ：タクティカル・アップ）: `range/20261006-287_rl+sr+mg_flower+eunhwa-tu+emma-tu_formation.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:39 録画 288（アニス：スター単騎）: `range/20261007-288_rl_anis-star_solo_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:39 録画 289（アニス：スター単騎）: `range/20261007-289_rl_anis-star_solo_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 01:19 録画 307（ウンファ単騎）: `range/20261007-307_sr_unfa_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:44 録画 293（エマ：タクティカル・アップ単騎。取り込んだときの番号は 278 で、main の録画 278〜285 と重なったので 2026-10-07 に 293 に振り直し、E: と I: の両方でファイル名を替えた。大きさと sha256 の先頭は替える前と一致）: `range/20261006-293_mg_emma-tu_lv1_manual-burst_spec-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 300（ユニ + I-DOLL・サン）: `range/20261007-300_rl+ar_yuni+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 00:42 に録画 301（ラム + デルタ + クイーン（真））を `intake.ts` で取り込み、この 1 本（`range/20261007-301_sr+sr+sg_ram+delta+queen-makoto_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`41e8ecd9c12b`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-07 00:42 録画 302（レイヴン + I-DOLL・サン + クラウン + ココア）: `range/20261007-302_rl+ar+mg+sr_raven+idoll-sun+crown+cocoa_crown-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 303（ノワール + レイヴン + ユニ + ココア）: `range/20261007-303_sg+rl+rl+sr_noir+raven+yuni+cocoa_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 304（ノワール + レイヴン + ユニ + ココア）: `range/20261007-304_sg+rl+rl+sr_noir+raven+yuni+cocoa_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、上の 5 本（V-0260〜V-0263）を、取り込んだときの番号 288〜292 から 300〜304 に振り直した。別のセッションが同じ時刻に 288・289（アニス：スター）を取り込んでいた（293 も別の録画が使っている）。E: と I: の両方でファイル名を手で書き換えた（中身は変えていないので sha256 は上のまま）。
2026-10-07 00:08 に録画 305（ルドミラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261006-305_smg_ludmilla_fixed-off.mp4`）だけを同期した。E: と I: で sha256 が一致（`f168f0b39d0f`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-07 00:08 録画 306（ルドミラ単騎）: `range/20261007-306_smg_ludmilla_bear-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、録画 305・306 は取り込みのときの番号（278・279）が main の録画と重なったので振り直し、E: と I: のファイル名と `derived/` の置き場所を替えた。中身は変えていない（sha256 は上のとおり）。

- 2026-10-07 23:46 録画 317（ココア + デルタ + モダニア）: `range/20261007-317_sr+sr+mg_cocoa+delta+modernia_modernia-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:46 録画 318（ミランダ単騎）: `range/20261007-318_smg_miranda_burst-solo.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:52 録画 320（アニス：スター単騎）: `range/20261007-320_rl_anis-star_solo_far-burst-early.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:53 録画 321（アニス：スター単騎）: `range/20261007-321_rl_anis-star_solo_far-burst-late.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 319（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-319_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 310（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-310_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 311（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-311_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 312（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-312_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 313（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-313_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 314（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-314_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 315（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-315_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 316（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-316_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、録画 319 は取り込みのときの番号（309）が別のブランチの録画（フォルクヴァン）と重なったので振り直し、E: と I: のファイル名と `derived/` の置き場所を替えた。中身は変えていない（sha256 は上のとおり）。

- 2026-10-08 00:18 録画 322（ミランダ単騎）: `range/20261007-322_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 323（ミランダ単騎）: `range/20261007-323_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 324（ミランダ単騎）: `range/20261007-324_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 325（ミランダ単騎）: `range/20261008-325_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 326（ミランダ単騎）: `range/20261008-326_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 327（ミランダ単騎）: `range/20261008-327_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 329（リター単騎）: `range/20261008-329_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 330（リター単騎）: `range/20261008-330_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 331（リター単騎）: `range/20261008-331_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 332（リター単騎）: `range/20261008-332_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 333（リター単騎）: `range/20261008-333_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 334（リター単騎）: `range/20261008-334_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 335（リター単騎）: `range/20261008-335_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 336（リター単騎）: `range/20261008-336_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 339（リター単騎）: `range/20261008-339_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 340（リター単騎）: `range/20261008-340_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 341（リター単騎）: `range/20261008-341_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 342（リター単騎）: `range/20261008-342_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 343（リター単騎）: `range/20261008-343_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 344（リター単騎）: `range/20261008-344_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 351（ヘルム単騎）: `range/20261008-351_sr_helm_gauge-sky.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 352（ヘルム単騎）: `range/20261008-352_sr_helm_gauge-order.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 353（ヘルム単騎）: `range/20261008-353_sr_helm_gauge-order.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:26 録画 363（ココア + デルタ + 紅蓮：ブラックシャドウ）: `range/20261008-363_sr+sr+rl_cocoa+delta+scarlet-black-shadow.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。番号が別の検証の録画と重なったので、同じ日に 354 から 363 に振り直した（E: と I: の名前を替えた）。
- 2026-10-08 21:32 録画 362（ココア + ソルジャーF.A. + アリス + レイヴン）: `range/20261008-362_sr+sg+sr+rl_cocoa+soldier-fa+alice+raven_alice-s1-burst.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。取り込みでは 358 を振ったが、ほかの取り込みと番号が重なったので、E: と I: のファイル名を 362 に振り直した（中身は同じ）。
- 2026-10-08 21:38 録画 364（リター単騎）: `range/20261008-364_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:42 録画 365（ココア + デルタ + ドレイク）: `range/20261008-365_sr+sr+sg_cocoa+delta+drake_drake-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 345（リター単騎）: `range/20261008-345_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 346（リター単騎）: `range/20261008-346_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 347（リター単騎）: `range/20261008-347_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 348（リター単騎）: `range/20261008-348_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 349（リター単騎）: `range/20261008-349_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 350（リター単騎）: `range/20261008-350_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:47 録画 366（ココア + デルタ + ラピ）: `range/20261008-366_sr+sr+ar_cocoa+delta+rapi_rapi-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:20 録画 367（モラン単騎）: `range/20261008-367_ar_moran_burst-left.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:20 録画 368（鈴原サクラ + デルタ + レイヴン）: `range/20261008-368_smg+sr+rl_sakura+delta+raven_burst-left.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:08 録画 369（モラン単騎）: `range/20261008-369_ar_moran_auto.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。取り込みのときは 367 を振ったが、ほかの取り込みと重なったので、E: と I: のファイル名を 369 に変えた。
- 2026-10-08 23:31 録画 370（モラン単騎）: `range/20261008-370_ar_moran_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 354（鈴原サクラ + デルタ + ドレイク）: `range/20261008-354_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 355（鈴原サクラ + デルタ + ドレイク）: `range/20261008-355_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 356（鈴原サクラ + デルタ + ドレイク）: `range/20261008-356_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 357（鈴原サクラ + デルタ + ドレイク）: `range/20261008-357_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 358（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-358_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 359（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-359_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 360（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-360_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 361（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-361_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:45 録画 371（ノワール単騎）: `range/20261009-371_sg_noir_spec-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:45 録画 372（ノワール単騎）: `range/20261009-372_sg_noir_spec-off.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-08 23:47 に録画 371（リター単騎）を `intake.ts` で取り込み、この 1 本（`range/20261008-371_smg_liter_auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`42063a65a25e`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

2026-10-08 23:47 に録画 372（リター単騎）を `intake.ts` で取り込み、この 1 本（`range/20261008-372_smg_liter_auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`b87af5c005f3`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-08 23:47 録画 373（リター単騎）: `range/20261008-373_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 374（リター単騎）: `range/20261008-374_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 375（リター単騎）: `range/20261008-375_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 376（リター単騎）: `range/20261008-376_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 377（リター単騎）: `range/20261008-377_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 378（リター単騎）: `range/20261008-378_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 379（リター単騎）: `range/20261008-379_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 380（リター単騎）: `range/20261008-380_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 381（リター単騎）: `range/20261008-381_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 382（リター単騎）: `range/20261008-382_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 383（リター単騎）: `range/20261009-383_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 384（リター単騎）: `range/20261009-384_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 385（リター単騎）: `range/20261009-385_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 386（リター単騎）: `range/20261009-386_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:57 録画 391（リター単騎）: `range/20261009-391_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:57 録画 392（リター単騎）: `range/20261009-392_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-09 に録画 371・372（リター単騎。V-0373）を 393・394 に振り直した（同じ番号の録画 371・372（ノワール）が先に main に入ったため）。E: と I: の両方で `range/20261008-371_smg_liter_auto.mp4` → `range/20261008-393_smg_liter_auto.mp4`、`range/20261008-372_smg_liter_auto.mp4` → `range/20261008-394_smg_liter_auto.mp4` に名前を変えた（中身は変えていないので sha256 は `42063a65a25e`・`b87af5c005f3` のまま。I: の大きさが E: と一致することを確かめた）。旧名は I: に残していない。

- 2026-10-09 00:47 録画 390（プリバティ：アンカインド・メイド単騎）: `range/20261009-390_sg_privaty-unkind-maid_manual-near_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 387（プロダクト08単騎）: `range/20261009-387_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 388（プロダクト08単騎）: `range/20261009-388_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 389（プロダクト08単騎）: `range/20261009-389_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 395（プロダクト08単騎）: `range/20261009-395_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 396（プロダクト08単騎）: `range/20261009-396_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 397（プロダクト08単騎）: `range/20261009-397_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 23:18 録画 398（ティア単騎）: `range/20261009-398_rl_tia_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 23:33 録画 399（メイデン単騎）: `range/20261009-399_sg_maiden_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 400（I-DOLL・フラワー + アドミ + アリス + I-DOLL・サン）: `range/20261009-400_rl+sr+sr+ar_flower+admi+alice+idoll-sun_admi-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 401（I-DOLL・フラワー + ウンファ：タクティカル・アップ）: `range/20261009-401_rl+sr_flower+eunhwa-tu_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 402（レイヴン + I-DOLL・サン + クラウン + ココア）: `range/20261009-402_rl+ar+mg+sr_raven+idoll-sun+crown+cocoa_crown-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:16 録画 403（ティア単騎）: `range/20261010-403_rl_tia_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:26 録画 404（メイデン単騎）: `range/20261010-404_sg_maiden_manual.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-10 13:51 に録画 405（鈴原サクラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-405_smg_sakura_manual_first-full.mp4`）だけを同期した。E: と I: で sha256 が一致（`b73b029b6be2`）。取り込み元の元ファイルは残した（`--copy`）。

2026-10-10 13:51 に録画 406（鈴原サクラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-406_smg_sakura_manual_first-full.mp4`）だけを同期した。E: と I: で sha256 が一致（`91cba8e271a6`）。取り込み元の元ファイルは残した（`--copy`）。

- 2026-10-10 14:52 録画 407（ココア + ソルジャーF.A. + アリス + レイヴン）: `range/20261010-407_sr+sg+sr+rl_cocoa+soldier-fa+alice+raven_alice-burst-repro.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-10 19:36 に録画 414（I-DOLL・フラワー + ウンファ：タクティカル・アップ + ヘルム）を `intake.ts` で取り込み、この 1 本（`range/20261010-414_rl+sr+sr_flower+eunhwa-tu+helm_true-damage-bucket.mp4`）だけを同期した。E: と I: で sha256 が一致（`af6b7ead2716`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。
2026-10-10 19:30 に録画 408（ノワール単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-408_sg_noir_auto_nocube.mp4`）だけを同期した。E: と I: で sha256 が一致（`9e287757e0c6`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-10 19:30 録画 409（ノワール単騎）: `range/20261010-409_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 410（ノワール単騎）: `range/20261010-410_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 411（ノワール単騎）: `range/20261010-411_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 412（ノワール単騎）: `range/20261010-412_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 413（ノワール単騎）: `range/20261010-413_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 415（ノワール単騎）: `range/20261010-415_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 416（ノワール単騎）: `range/20261010-416_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 417（ノワール単騎）: `range/20261010-417_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 418（ノワール単騎）: `range/20261010-418_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 419（ノワール単騎）: `range/20261010-419_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 420（ノワール単騎）: `range/20261010-420_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
