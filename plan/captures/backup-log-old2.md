# バックアップの実行の記録（2026-10-06〜2026-10-25。凍結）

- 2026-10-25 に [backup-log.md](backup-log.md) の名前を変えて凍結した（[../design-workflow-simplification.md](../design-workflow-simplification.md) 2 節）。書き換えない（番号の振り直しでファイル名が置き換わるほかは）。
- この後に `intake.ts` で Drive に置いた録画の記録は、録画の JSON（`records/recordings/<録画 id>.json`）の `backup` にある。ふだんと違う出来事は [backup-log.md](backup-log.md) に続ける。
- 2026-10-05 までの記録は [backup-log-old.md](backup-log-old.md)（凍結）。
- 凍結する前の決まり: 同期したら、ここに足す（日付・足したもの・sha256 の突き合わせの結果）。`intake.ts` で取り込んで同期した録画は、`intake.ts` が 1 行足す（2026-10-11 から。sha256 の値は録画の JSON にある）。手で同期したときと、番号の振り直しなどは段落で書く。

2026-10-06 に、[backup-log-old.md](backup-log-old.md) の録画 0228〜0230 は取り込みのときに 213〜215 の番号で入れたが、別の作業の録画（`20261005-213`〜`215_smg_liter_auto.mp4`）と番号が重なったので、E: と I: の両方で 228〜230 に改名した（中身と sha256 は同じ）。

- 2026-10-06 00:13 録画 0231（ウンファ：タクティカル・アップ単騎）: `range/20261005-0231_sr_eunhwa-tu_crit-rate.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:13 録画 0232（I-DOLL・フラワー + ウンファ：タクティカル・アップ）: `range/20261006-0232_rl+sr_flower+eunhwa-tu_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:13 録画 0233（I-DOLL・フラワー + ウンファ：タクティカル・アップ + I-DOLL・サン）: `range/20261006-0233_rl+sr+ar_flower+eunhwa-tu+sun_full-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:58 録画 0242（ウンファ：タクティカル・アップ単騎）: `range/20261006-0242_sr_eunhwa-tu_crit-rate.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0234（リター単騎）: `range/20261006-0234_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0236（リター単騎）: `range/20261006-0236_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0237（リター単騎）: `range/20261006-0237_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0238（リター単騎）: `range/20261006-0238_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0239（リター単騎）: `range/20261006-0239_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0240（リター単騎）: `range/20261006-0240_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0241（リター単騎）: `range/20261006-0241_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 00:56 録画 0235（リター単騎）: `range/20261006-0235_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 01:03 録画 0243（鈴原サクラ単騎）: `range/20261006-0243_smg_sakura_skills.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:34 録画 0244（ミランダ + デルタ）: `range/20261006-0244_smg+sr_miranda+delta_burst.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 07:34 に録画 0245（ミランダ + デルタ + I-DOLL・サン）を `intake.ts` で取り込み、この 1 本（`range/20261006-0245_smg+sr+ar_miranda+delta+sun_full-burst.mp4`）だけを同期した。E: と I: で sha256 が一致（`c336fa3bc89a`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。
2026-10-06 07:35 に録画 0246（鈴原サクラ + デルタ + ブラン + ノワール）を `intake.ts` で取り込み、この 1 本（`range/20261006-0246_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4`）だけを同期した。E: と I: で sha256 が一致（`7247098dc40a`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 07:35 録画 0247（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-0247_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:35 録画 0248（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-0248_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 07:35 録画 0249（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-0249_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 07:45 に、上の 4 本（鈴原サクラ + デルタ + ブラン / ユニ + ノワール）を、別のセッションが同じ時刻に 244・245（ミランダ）を取り込んでいたため、撮った順に 246〜249 へ振り直した（E: と I: の両方でファイル名を替え、sha256 の先頭と大きさが替える前と一致することを確かめた）。

- 2026-10-06 08:03 録画 0250（マナ単騎）: `range/20261006-0250_ar_mana_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 0251（マナ単騎）: `range/20261006-0251_ar_mana_tboost-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 0252（マナ単騎）: `range/20261006-0252_ar_mana_bear-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 08:03 録画 0253（ノワール単騎）: `range/20261006-0253_sg_noir_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:52 録画 0258（ラム + デルタ + 雪子）: `range/20261006-0258_sr+sr+mg_ram+delta+yukiko_wind_yukiko-auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 19:52 に録画 0259（ココア + ユニ + クイーン（真） + 雪子）を `intake.ts` で取り込み、この 1 本（`range/20261006-0259_sr+rl+sg+mg_cocoa+yuni+queen-makoto+yukiko_wind_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`374069528fa1`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 19:52 録画 0260（ラム + デルタ + 雪子）: `range/20261006-0260_sr+sr+mg_ram+delta+yukiko_fire_yukiko-auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-06 19:52 に録画 0261（ココア + ユニ + クイーン（真） + 雪子）を `intake.ts` で取り込み、この 1 本（`range/20261006-0261_sr+rl+sg+mg_cocoa+yuni+queen-makoto+yukiko_fire_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`50204838d085`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-06 19:59 録画 0262（ミランダ + デルタ + I-DOLL・サン）: `range/20261006-0262_smg+sr+ar_miranda+delta+idoll-sun_miranda-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:59 録画 0263（エマ：タクティカル・アップ単騎）: `range/20261006-0263_mg_emma-tu_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:08 録画 0264（アスカ + ヘルム）: `range/20261006-0264_ar+sr_asuka+helm_helm-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:08 録画 0265（アスカ + ヘルム）: `range/20261006-0265_ar+sr_asuka+helm_helm-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:12 録画 0266（ミサト単騎）: `range/20261006-0266_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:51 録画 0274（ミサト単騎）: `range/20261006-0274_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:51 録画 0275（ミサト単騎）: `range/20261006-0275_smg_misato_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 0254（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-0254_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 0255（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-0255_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 0256（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-0256_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 19:36 録画 0257（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261006-0257_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:29 録画 0267（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-0267_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:29 録画 0268（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-0268_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:30 録画 0269（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261006-0269_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 0270（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-0270_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 0271（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-0271_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 20:39 録画 0272（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261006-0272_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 22:46 録画 0276（ソルジャーF.A.単騎）: `range/20261006-0276_sg_soldier-fa.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 22:52 録画 0277（I-DOLL・オーシャン + ソルジャーF.A.）: `range/20261006-0277_sg_soldier-fa_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:10 録画 0282（ソルジャーE.G.単騎。取り込んだときの番号は 276 で、main の録画と重なったので同じ日に 282 に振り直し、E: と I: のファイル名も替えた）: `range/20261006-0282_ar_soldier-eg_s2-no-fire.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 0283（ソルジャーE.G.単騎。取り込んだときの番号は 277 で、同じく 283 に振り直した）: `range/20261006-0283_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 0278（ソルジャーE.G.単騎）: `range/20261006-0278_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 0279（ソルジャーE.G.単騎）: `range/20261006-0279_ar_soldier-eg_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 0280（鈴原サクラ + デルタ + ソルジャーE.G.）: `range/20261006-0280_smg+sr+ar_sakura+delta+soldier-eg_eg-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:20 録画 0281（鈴原サクラ + デルタ + ソルジャーE.G.）: `range/20261006-0281_smg+sr+ar_sakura+delta+soldier-eg_eg-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:40 録画 0284（I-DOLL・フラワー + ユニ + アスカ）: `range/20261006-0284_ar_asuka_s1-extend.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:50 録画 0285（ミランダ + デルタ + I-DOLL・サン）: `range/20261006-0285_smg+sr+ar_miranda+delta+idoll-sun_delta-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:58 録画 0286（I-DOLL・フラワー + エマ：タクティカル・アップ）: `range/20261006-0286_rl+mg_flower+emma-tu_explosion.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:58 録画 0287（I-DOLL・フラワー + ウンファ：タクティカル・アップ + エマ：タクティカル・アップ）: `range/20261006-0287_rl+sr+mg_flower+eunhwa-tu+emma-tu_formation.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:39 録画 0288（アニス：スター単騎）: `range/20261007-0288_rl_anis-star_solo_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:39 録画 0289（アニス：スター単騎）: `range/20261007-0289_rl_anis-star_solo_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 01:19 録画 0307（ウンファ単騎）: `range/20261007-0307_sr_unfa_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-06 23:44 録画 0293（エマ：タクティカル・アップ単騎。取り込んだときの番号は 278 で、main の録画 0278〜0285 と重なったので 2026-10-07 に 293 に振り直し、E: と I: の両方でファイル名を替えた。大きさと sha256 の先頭は替える前と一致）: `range/20261006-0293_mg_emma-tu_lv1_manual-burst_spec-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 0300（ユニ + I-DOLL・サン）: `range/20261007-0300_rl+ar_yuni+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 00:42 に録画 0301（ラム + デルタ + クイーン（真））を `intake.ts` で取り込み、この 1 本（`range/20261007-0301_sr+sr+sg_ram+delta+queen-makoto_queen-auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`41e8ecd9c12b`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-07 00:42 録画 0302（レイヴン + I-DOLL・サン + クラウン + ココア）: `range/20261007-0302_rl+ar+mg+sr_raven+idoll-sun+crown+cocoa_crown-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 0303（ノワール + レイヴン + ユニ + ココア）: `range/20261007-0303_sg+rl+rl+sr_noir+raven+yuni+cocoa_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 00:42 録画 0304（ノワール + レイヴン + ユニ + ココア）: `range/20261007-0304_sg+rl+rl+sr_noir+raven+yuni+cocoa_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、上の 5 本（V-0260〜V-0263）を、取り込んだときの番号 288〜292 から 300〜304 に振り直した。別のセッションが同じ時刻に 288・289（アニス：スター）を取り込んでいた（293 も別の録画が使っている）。E: と I: の両方でファイル名を手で書き換えた（中身は変えていないので sha256 は上のまま）。
2026-10-07 00:08 に録画 0305（ルドミラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261006-0305_smg_ludmilla_fixed-off.mp4`）だけを同期した。E: と I: で sha256 が一致（`f168f0b39d0f`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-07 00:08 録画 0306（ルドミラ単騎）: `range/20261007-0306_smg_ludmilla_bear-cube_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、録画 0305・0306 は取り込みのときの番号（278・279）が main の録画と重なったので振り直し、E: と I: のファイル名と `derived/` の置き場所を替えた。中身は変えていない（sha256 は上のとおり）。

- 2026-10-07 23:46 録画 0317（ココア + デルタ + モダニア）: `range/20261007-0317_sr+sr+mg_cocoa+delta+modernia_modernia-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:46 録画 0318（ミランダ単騎）: `range/20261007-0318_smg_miranda_burst-solo.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:52 録画 0320（アニス：スター単騎）: `range/20261007-0320_rl_anis-star_solo_far-burst-early.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:53 録画 0321（アニス：スター単騎）: `range/20261007-0321_rl_anis-star_solo_far-burst-late.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 0319（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-0319_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 0310（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-0310_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:37 録画 0311（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-0311_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 0312（鈴原サクラ + デルタ + ブラン + ノワール）: `range/20261007-0312_smg+sr+ar+sg_sakura+delta+blanc+noir_blanc-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 0313（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-0313_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 0314（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-0314_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 0315（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-0315_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-07 23:38 録画 0316（鈴原サクラ + デルタ + ユニ + ノワール）: `range/20261007-0316_smg+sr+rl+sg_sakura+delta+yuni+noir_yuni-control.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-07 に、録画 0319 は取り込みのときの番号（309）が別のブランチの録画（フォルクヴァン）と重なったので振り直し、E: と I: のファイル名と `derived/` の置き場所を替えた。中身は変えていない（sha256 は上のとおり）。

- 2026-10-08 00:18 録画 0322（ミランダ単騎）: `range/20261007-0322_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 0323（ミランダ単騎）: `range/20261007-0323_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 0324（ミランダ単騎）: `range/20261007-0324_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 0325（ミランダ単騎）: `range/20261008-0325_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 0326（ミランダ単騎）: `range/20261008-0326_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 00:18 録画 0327（ミランダ単騎）: `range/20261008-0327_smg_miranda_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0329（リター単騎）: `range/20261008-0329_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0330（リター単騎）: `range/20261008-0330_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0331（リター単騎）: `range/20261008-0331_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0332（リター単騎）: `range/20261008-0332_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0333（リター単騎）: `range/20261008-0333_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0334（リター単騎）: `range/20261008-0334_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0335（リター単騎）: `range/20261008-0335_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:14 録画 0336（リター単騎）: `range/20261008-0336_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0339（リター単騎）: `range/20261008-0339_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0340（リター単騎）: `range/20261008-0340_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0341（リター単騎）: `range/20261008-0341_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0342（リター単騎）: `range/20261008-0342_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0343（リター単騎）: `range/20261008-0343_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 01:51 録画 0344（リター単騎）: `range/20261008-0344_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 0351（ヘルム単騎）: `range/20261008-0351_sr_helm_gauge-sky.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 0352（ヘルム単騎）: `range/20261008-0352_sr_helm_gauge-order.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:42 録画 0353（ヘルム単騎）: `range/20261008-0353_sr_helm_gauge-order.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:26 録画 0363（ココア + デルタ + 紅蓮：ブラックシャドウ）: `range/20261008-0363_sr+sr+rl_cocoa+delta+scarlet-black-shadow.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。番号が別の検証の録画と重なったので、同じ日に 354 から 363 に振り直した（E: と I: の名前を替えた）。
- 2026-10-08 21:32 録画 0362（ココア + ソルジャーF.A. + アリス + レイヴン）: `range/20261008-0362_sr+sg+sr+rl_cocoa+soldier-fa+alice+raven_alice-s1-burst.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。取り込みでは 358 を振ったが、ほかの取り込みと番号が重なったので、E: と I: のファイル名を 362 に振り直した（中身は同じ）。
- 2026-10-08 21:38 録画 0364（リター単騎）: `range/20261008-0364_smg_liter_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:42 録画 0365（ココア + デルタ + ドレイク）: `range/20261008-0365_sr+sr+sg_cocoa+delta+drake_drake-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0345（リター単騎）: `range/20261008-0345_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0346（リター単騎）: `range/20261008-0346_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0347（リター単騎）: `range/20261008-0347_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0348（リター単騎）: `range/20261008-0348_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0349（リター単騎）: `range/20261008-0349_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 20:11 録画 0350（リター単騎）: `range/20261008-0350_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:47 録画 0366（ココア + デルタ + ラピ）: `range/20261008-0366_sr+sr+ar_cocoa+delta+rapi_rapi-auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:20 録画 0367（モラン単騎）: `range/20261008-0367_ar_moran_burst-left.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:20 録画 0368（鈴原サクラ + デルタ + レイヴン）: `range/20261008-0368_smg+sr+rl_sakura+delta+raven_burst-left.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:08 録画 0369（モラン単騎）: `range/20261008-0369_ar_moran_auto.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは `intake.ts` が E: へ移した。取り込みのときは 367 を振ったが、ほかの取り込みと重なったので、E: と I: のファイル名を 369 に変えた。
- 2026-10-08 23:31 録画 0370（モラン単騎）: `range/20261008-0370_ar_moran_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0354（鈴原サクラ + デルタ + ドレイク）: `range/20261008-0354_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0355（鈴原サクラ + デルタ + ドレイク）: `range/20261008-0355_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0356（鈴原サクラ + デルタ + ドレイク）: `range/20261008-0356_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0357（鈴原サクラ + デルタ + ドレイク）: `range/20261008-0357_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0358（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-0358_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0359（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-0359_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0360（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-0360_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 21:32 録画 0361（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261008-0361_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:45 録画 0371（ノワール単騎）: `range/20261009-0371_sg_noir_spec-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:45 録画 0372（ノワール単騎）: `range/20261009-0372_sg_noir_spec-off.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-08 23:47 に録画 0371（リター単騎）を `intake.ts` で取り込み、この 1 本（`range/20261008-0371_smg_liter_auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`42063a65a25e`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

2026-10-08 23:47 に録画 0372（リター単騎）を `intake.ts` で取り込み、この 1 本（`range/20261008-0372_smg_liter_auto.mp4`）だけを同期した。E: と I: で sha256 が一致（`b87af5c005f3`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-08 23:47 録画 0373（リター単騎）: `range/20261008-0373_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 0374（リター単騎）: `range/20261008-0374_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 0375（リター単騎）: `range/20261008-0375_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 0376（リター単騎）: `range/20261008-0376_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 0377（リター単騎）: `range/20261008-0377_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-08 23:48 録画 0378（リター単騎）: `range/20261008-0378_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0379（リター単騎）: `range/20261008-0379_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0380（リター単騎）: `range/20261008-0380_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0381（リター単騎）: `range/20261008-0381_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0382（リター単騎）: `range/20261008-0382_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0383（リター単騎）: `range/20261009-0383_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0384（リター単騎）: `range/20261009-0384_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0385（リター単騎）: `range/20261009-0385_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:14 録画 0386（リター単騎）: `range/20261009-0386_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:57 録画 0391（リター単騎）: `range/20261009-0391_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:57 録画 0392（リター単騎）: `range/20261009-0392_smg_liter_auto.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-09 に録画 0371・0372（リター単騎。V-0373）を 393・394 に振り直した（同じ番号の録画 0371・0372（ノワール）が先に main に入ったため）。E: と I: の両方で `range/20261008-0371_smg_liter_auto.mp4` → `range/20261008-0393_smg_liter_auto.mp4`、`range/20261008-0372_smg_liter_auto.mp4` → `range/20261008-0394_smg_liter_auto.mp4` に名前を変えた（中身は変えていないので sha256 は `42063a65a25e`・`b87af5c005f3` のまま。I: の大きさが E: と一致することを確かめた）。旧名は I: に残していない。

- 2026-10-09 00:47 録画 0390（プリバティ：アンカインド・メイド単騎）: `range/20261009-0390_sg_privaty-unkind-maid_manual-near_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 0387（プロダクト08単騎）: `range/20261009-0387_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 0388（プロダクト08単騎）: `range/20261009-0388_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 00:35 録画 0389（プロダクト08単騎）: `range/20261009-0389_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 0395（プロダクト08単騎）: `range/20261009-0395_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 0396（プロダクト08単騎）: `range/20261009-0396_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 08:02 録画 0397（プロダクト08単騎）: `range/20261009-0397_sr_product08_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 23:18 録画 0398（ティア単騎）: `range/20261009-0398_rl_tia_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-09 23:33 録画 0399（メイデン単騎）: `range/20261009-0399_sg_maiden_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 0400（I-DOLL・フラワー + アドミ + アリス + I-DOLL・サン）: `range/20261009-0400_rl+sr+sr+ar_flower+admi+alice+idoll-sun_admi-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 0401（I-DOLL・フラワー + ウンファ：タクティカル・アップ）: `range/20261009-0401_rl+sr_flower+eunhwa-tu_burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:08 録画 0402（レイヴン + I-DOLL・サン + クラウン + ココア）: `range/20261009-0402_rl+ar+mg+sr_raven+idoll-sun+crown+cocoa_crown-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:16 録画 0403（ティア単騎）: `range/20261010-0403_rl_tia_manual.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 00:26 録画 0404（メイデン単騎）: `range/20261010-0404_sg_maiden_manual.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-10 13:51 に録画 0405（鈴原サクラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-0405_smg_sakura_manual_first-full.mp4`）だけを同期した。E: と I: で sha256 が一致（`b73b029b6be2`）。取り込み元の元ファイルは残した（`--copy`）。

2026-10-10 13:51 に録画 0406（鈴原サクラ単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-0406_smg_sakura_manual_first-full.mp4`）だけを同期した。E: と I: で sha256 が一致（`91cba8e271a6`）。取り込み元の元ファイルは残した（`--copy`）。

- 2026-10-10 14:52 録画 0407（ココア + ソルジャーF.A. + アリス + レイヴン）: `range/20261010-0407_sr+sg+sr+rl_cocoa+soldier-fa+alice+raven_alice-burst-repro.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-10 19:36 に録画 0414（I-DOLL・フラワー + ウンファ：タクティカル・アップ + ヘルム）を `intake.ts` で取り込み、この 1 本（`range/20261010-0414_rl+sr+sr_flower+eunhwa-tu+helm_true-damage-bucket.mp4`）だけを同期した。E: と I: で sha256 が一致（`af6b7ead2716`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。
2026-10-10 19:30 に録画 0408（ノワール単騎）を `intake.ts` で取り込み、この 1 本（`range/20261010-0408_sg_noir_auto_nocube.mp4`）だけを同期した。E: と I: で sha256 が一致（`9e287757e0c6`）。取り込み元の元ファイルは `intake.ts` が E: へ移した。

- 2026-10-10 19:30 録画 0409（ノワール単騎）: `range/20261010-0409_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 0410（ノワール単騎）: `range/20261010-0410_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 0411（ノワール単騎）: `range/20261010-0411_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 0412（ノワール単騎）: `range/20261010-0412_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 19:30 録画 0413（ノワール単騎）: `range/20261010-0413_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0415（ノワール単騎）: `range/20261010-0415_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0416（ノワール単騎）: `range/20261010-0416_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0417（ノワール単騎）: `range/20261010-0417_sg_noir_auto_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0418（ノワール単騎）: `range/20261010-0418_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0419（ノワール単騎）: `range/20261010-0419_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-10 20:17 録画 0420（ノワール単騎）: `range/20261010-0420_sg_noir_auto_cube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 06:36 録画 0421（紅蓮：ブラックシャドウ単騎）: `range/20261011-0421_rl_scarlet-black-shadow_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 06:36 録画 0422（紅蓮：ブラックシャドウ単騎）: `range/20261011-0422_rl_scarlet-black-shadow_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:01 録画 0423（I-DOLL・サン単騎）: `range/20261011-0423_ar_idoll-sun_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:01 録画 0424（I-DOLL・サン単騎）: `range/20261011-0424_ar_idoll-sun_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:01 録画 0425（I-DOLL・サン単騎）: `range/20261011-0425_ar_idoll-sun_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0426（I-DOLL・オーシャン単騎）: `range/20261011-0426_smg_idoll-ocean_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0427（I-DOLL・オーシャン単騎）: `range/20261011-0427_smg_idoll-ocean_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0428（クラウン単騎）: `range/20261011-0428_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0429（クラウン単騎）: `range/20261011-0429_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0430（ドレイク単騎）: `range/20261011-0430_sg_drake_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0431（ラム単騎）: `range/20261011-0431_sr_rum_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0432（アニス：スター単騎）: `range/20261011-0432_rl_anis-star_manual-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0433（アニス：スター単騎）: `range/20261011-0433_rl_anis-star_auto-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0434（サクラ + デルタ + ドレイク）: `range/20261011-0434_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0435（サクラ + デルタ + ドレイク）: `range/20261011-0435_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0436（サクラ + デルタ + ドレイク）: `range/20261011-0436_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0437（サクラ + デルタ + I-DOLL・サン）: `range/20261011-0437_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0438（サクラ + デルタ + I-DOLL・サン）: `range/20261011-0438_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 08:02 録画 0439（サクラ + デルタ + I-DOLL・サン）: `range/20261011-0439_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:16 録画 0440（ルドミラ：ウィンターオーナー）: `range/20261011-0440_mg_ludmilla-winter-owner_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:16 録画 0441（ルドミラ：ウィンターオーナー）: `range/20261011-0441_mg_ludmilla-winter-owner_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:16 録画 0442（ルドミラ：ウィンターオーナー）: `range/20261011-0442_mg_ludmilla-winter-owner_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0443（エマ）: `range/20261011-0443_mg_emma_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0444（エマ）: `range/20261011-0444_mg_emma_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0445（エマ）: `range/20261011-0445_mg_emma_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0446（クラウン）: `range/20261011-0446_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0447（クラウン）: `range/20261011-0447_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 14:17 録画 0448（クラウン）: `range/20261011-0448_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0449（エマ）: `range/20261011-0449_mg_emma_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0450（エマ）: `range/20261011-0450_mg_emma_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0451（クラウン）: `range/20261011-0451_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0452（クラウン）: `range/20261011-0452_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0453（クラウン）: `range/20261011-0453_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-11 16:57 録画 0454（クラウン）: `range/20261011-0454_mg_crown_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-12 12:32 録画 0455（たきな単騎）: `range/20261012-0455_sr_takina_hide.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-12 12:32 録画 0456（たきな単騎）: `range/20261012-0456_sr_takina_hide.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-12 12:32 録画 0457（たきな単騎）: `range/20261012-0457_sr_takina_hide.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-12 12:32 録画 0458（たきな単騎）: `range/20261012-0458_sr_takina_sky.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-12 12:32 録画 0459（たきな単騎）: `range/20261012-0459_sr_takina_sky.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 18:42 録画 0461（ラム + デルタ + アスカ）: `range/20261017-0461_ar_asuka.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 18:42 録画 0462（ラム + デルタ + アスカ）: `range/20261017-0462_ar_asuka.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 18:50 録画 0467（トーブ単騎）: `range/20261017-0467_ar_tove.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 18:50 録画 0468（トーブ単騎）: `range/20261017-0468_ar_tove.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 録画 0467・0468（トーブ単騎）: 取り込んだ番号 461・462 が main の録画と重なったので、E: と I: のファイル名を 467・468 に振り直した（中身は同じ）。
- 2026-10-17 19:14 録画 0465（I-DOLL・サン + マナ + デルタ + ラム）: `range/20261017-0465_ar_mana_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 19:14 録画 0466（I-DOLL・サン + マナ + デルタ + ラム）: `range/20261017-0466_ar_mana_auto.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 19:01 録画 0469（ラム + デルタ + ミハラ）: `range/20261017-0469_ar_mihara.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 19:01 録画 0470（ラム + デルタ + ミハラ）: `range/20261017-0470_ar_mihara.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 録画 0469・0470（ラム + デルタ + ミハラ）: 取り込んだ番号 463・464 がほかのブランチの録画と重なったので、E: と I: のファイル名を 469・470 に振り直した（中身は同じ）。
- 2026-10-17 19:59 録画 0472（アスカ + ミサト）: `range/20261017-0472_smg+ar_asuka-idle+misato.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 19:59 録画 0473（ミサト + アスカ）: `range/20261017-0473_smg+ar_misato+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-17 に、録画 0465・0466 の証拠フレーム（`frames/465_f*.jpg`・`frames/466_f*.jpg`。V-0434）を PowerShell の robocopy で手で同期した（E: と I: で sha256 が一致）。

- 2026-10-17 19:42 録画 0463（ラム + デルタ + ソーダ：トゥインクルバニー）: `range/20261017-0463_sg_soda-tb-burst_pause.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 19:59 録画 0471（ラム + デルタ + ソーダ：トゥインクルバニー）: `range/20261017-0471_sg_soda-tb-burst_pause-2.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:14 録画 0474（マナ + アスカ）: `range/20261017-0474_ar+ar_mana+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:15 録画 0475（マナ + アスカ）: `range/20261017-0475_ar+ar_mana+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:21 録画 0476（エマ：タクティカル・アップ + アスカ）: `range/20261017-0476_mg+ar_emma-tu+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:21 録画 0477（エマ：タクティカル・アップ + アスカ）: `range/20261017-0477_mg+ar_emma-tu+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:29 録画 0478（アニス：スター + I-DOLL・フラワー + アスカ）: `range/20261017-0478_rl+rl+ar_anis-star+idoll-flower+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 20:29 録画 0479（アニス：スター + I-DOLL・フラワー + アスカ）: `range/20261017-0479_rl+rl+ar_anis-star+idoll-flower+asuka_asuka-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 22:58 録画 0480（ラム + デルタ + シンデレラ）: `range/20261017-0480_sr+sr+rl_ram+delta+cinderella_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-17 22:58 録画 0481（ラム + デルタ + シンデレラ）: `range/20261017-0481_sr+sr+rl_ram+delta+cinderella_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 06:07 録画 0482（I-DOLL・フラワー + アニス：スター + デルタ + シンデレラ）: `range/20261018-0482_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 06:07 録画 0483（I-DOLL・フラワー + アニス：スター + デルタ + シンデレラ）: `range/20261018-0483_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 06:07 録画 0484（アニス：スター + デルタ + シンデレラ）: `range/20261018-0484_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 06:07 録画 0485（アニス：スター + デルタ + シンデレラ）: `range/20261018-0485_cinderella-control.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 13:43 録画 0486（I-DOLL・フラワー + アニス：スター + デルタ + シンデレラ）: `range/20261018-0486_status-pause.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 14:26 録画 0487（アニス：スター + デルタ + シンデレラ）: `range/20261018-0487_status-pause.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 15:10 録画 0488（アニス：スター + デルタ + シンデレラ）: `range/20261018-0488_status-pause.mp4` を同期（E: と I: で sha256 が一致）。 取り込み元の元ファイルは残した（`--copy`）。
- 2026-10-18 21:07 録画 0489（鈴原サクラ + アスカ）: `range/20261018-0489_smg+ar_sakura+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:07 録画 0490（鈴原サクラ + ミハラ + アスカ）: `range/20261018-0490_smg+ar+ar_sakura+mihara+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:07 録画 0491（鈴原サクラ + アスカ）: `range/20261018-0491_smg+ar_sakura+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:07 録画 0492（鈴原サクラ + ミハラ + アスカ）: `range/20261018-0492_smg+ar+ar_sakura+mihara+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:31 録画 0497（アスカ + ミサト）: `range/20261018-0497_misato-s1-heal-a.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:31 録画 0498（ミサト + アスカ）: `range/20261018-0498_misato-s1-heal-b.mp4` を同期（E: と I: で sha256 が一致）。

2026-10-18 21:58 に、録画 0489 を 497 に振り直した（`records:renumber`）。E: と I: の名前を変えた（`range/20261018-0497_misato-s1-heal-a.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-18 21:59 に、録画 0490 を 498 に振り直した（`records:renumber`）。E: と I: の名前を変えた（`range/20261018-0498_misato-s1-heal-b.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

- 2026-10-18 21:22 録画 0493（I-DOLL・オーシャン + アスカ）: `range/20261018-0493_smg+ar_ocean+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:22 録画 0494（I-DOLL・オーシャン + アスカ）: `range/20261018-0494_smg+ar_ocean+asuka-idle.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:22 録画 0495（アスカ + I-DOLL・オーシャン）: `range/20261018-0495_smg+ar_asuka-idle+ocean.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 21:22 録画 0496（アスカ + I-DOLL・オーシャン）: `range/20261018-0496_smg+ar_asuka-idle+ocean.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0499（アニス：スター単騎）: `range/20261018-0499_rl_anis-star_burst-once.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0500（アニス：スター単騎）: `range/20261018-0500_rl_anis-star_burst-once.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0501（アニス：スター単騎）: `range/20261018-0501_rl_anis-star_burst-once.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0502（アニス：スター単騎）: `range/20261018-0502_rl_anis-star_no-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0503（アニス：スター単騎）: `range/20261018-0503_rl_anis-star_no-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:36 録画 0504（アニス：スター単騎）: `range/20261018-0504_rl_anis-star_no-burst.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:42 録画 0505（ナガ単騎）: `range/20261018-0505_sg_naga_solo_s2-core-1.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-18 23:42 録画 0506（ナガ単騎）: `range/20261018-0506_sg_naga_solo_s2-core-2.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 00:12 録画 0507（アニス：スター + ナガ）: `range/20261019-0507_rl_anis-star+naga_star-core-damage.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 07:54 録画 0508（I-DOLL・フラワー + エヌ : ミラクルフェアリー + ソルジャーE.G.）: `range/20261019-0508_rl_anne-miracle-fairy.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 07:54 録画 0509（I-DOLL・フラワー + エヌ : ミラクルフェアリー + ソルジャーE.G.）: `range/20261019-0509_rl_anne-miracle-fairy.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 23:40 録画 0510（ソルジャーF.A. + トーブ）: `range/20261019-0510_ar_tove_s2-attack-speed.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 23:40 録画 0511（ソルジャーF.A. + トーブ）: `range/20261019-0511_ar_tove_s2-attack-speed.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-19 23:40 録画 0512（ソルジャーF.A. + トーブ）: `range/20261019-0512_ar_tove_s2-auto-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:03 録画 0513（I-DOLL・フラワー + ソルジャーF.A. + シンデレラ + アニス：スター + デルタ）: `range/20261020-0513_delta-def-status-pause.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0514（ソルジャーE.G.単騎）: `interception/20261020-0514_special_blacksmith_soldier-eg.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0515（ココア単騎）: `interception/20261020-0515_special_blacksmith_cocoa.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0516（リター単騎）: `interception/20261020-0516_special_blacksmith_liter.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0517（エマ単騎）: `interception/20261020-0517_special_blacksmith_emma.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0518（ソルジャーF.A.単騎）: `interception/20261020-0518_special_blacksmith_soldier-fa.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:21 録画 0519（I-DOLL・フラワー単騎）: `interception/20261020-0519_special_blacksmith_idoll-flower.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 01:45 録画 0520（ソルジャーF.A. + トーブ）: `range/20261020-0520_ar_tove_s2-auto-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-20 23:29 録画 0521（リター単騎）: `range/20261020-0521_smg_liter_cube-assault7_fixed-off.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0522（ノワール単騎）: `range/20261022-0522_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0523（ノワール単騎）: `range/20261022-0523_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0524（ノワール単騎）: `range/20261022-0524_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0525（ノワール単騎）: `range/20261022-0525_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0526（ノワール単騎）: `range/20261022-0526_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0527（ノワール単騎）: `range/20261022-0527_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0528（ノワール単騎）: `range/20261022-0528_sg_noir_auto_spec-on.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0529（ノワール単騎）: `range/20261022-0529_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0530（ノワール単騎）: `range/20261022-0530_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0531（ノワール単騎）: `range/20261022-0531_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0532（ノワール単騎）: `range/20261022-0532_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0533（ノワール単騎）: `range/20261022-0533_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0534（ノワール単騎）: `range/20261022-0534_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-22 01:18 録画 0535（ノワール単騎）: `range/20261022-0535_sg_noir_auto_spec-off_nocube.mp4` を同期（E: と I: で sha256 が一致）。
- 2026-10-23 23:33 録画 0542（ラム + デルタ + ソーダ：トゥインクルバニー）: `range/20261023-0542_sg_soda-tb-burst_nopause.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-23 23:34 録画 0543（アニス：スター + デルタ + ソーダ：トゥインクルバニー）: `range/20261023-0543_sg_soda-tb-burst_anis-star-1.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-23 23:34 録画 0544（アニス：スター + デルタ + ソーダ：トゥインクルバニー）: `range/20261023-0544_sg_soda-tb-burst_anis-star-2.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。

2026-10-23 15:26 に、録画 0536 を 542 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261023-0542_sg_soda-tb-burst_nopause.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-23 15:27 に、録画 0537 を 543 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261023-0543_sg_soda-tb-burst_anis-star-1.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-23 15:28 に、録画 0538 を 544 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261023-0544_sg_soda-tb-burst_anis-star-2.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 1 件。中身は変えていないので sha256 は台帳のまま）。

- 2026-10-23 23:51 録画 0540（I-DOLL・フラワー + エヌ : ミラクルフェアリー + アスカ）: `range/20261023-0540_rl_anne-miracle-fairy_asuka-noshoot.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-23 23:55 録画 0541（エマ：タクティカル・アップ + ウンファ：タクティカル・アップ）: `range/20261023-0541_mg_emma-tu_eunhwa-tu_manual-burst.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 02:39 録画 0545（アニス：スター + クラウン + デルタ）: `range/20261024-0545_mg_crown_anis-star-ai_delta-1.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 02:39 録画 0546（アニス：スター + クラウン + デルタ）: `range/20261024-0546_mg_crown_anis-star-ai_delta-2.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 02:39 録画 0547（アニス：スター + クラウン）: `range/20261024-0547_rl_anis-star-late-fire_crown-ai-1.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 02:39 録画 0548（アニス：スター + クラウン）: `range/20261024-0548_rl_anis-star-late-fire_crown-ai-2.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 02:39 録画 0549（アニス：スター + クラウン）: `range/20261024-0549_rl_anis-star-late-fire_crown-ai-3.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:08 録画 0550（ウンファ：タクティカル・アップ単騎）: `range/20261024-0550_sr_unfa_manual.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:19 録画 0551（ウンファ単騎）: `range/20261024-0551_sr_unfa_manual.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:35 録画 0553（ウンファ単騎）: `range/20261024-0553_sr_unfa_manual.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:36 `npm run drive:sync`（デスクトップ）: 4 つの対が通った。クラウドで足した `scratch/blablalink/` の 2 件は 13:29 のフックの同期で降りていた。`private` の対は、Drive の `owner.md`（クラウドでの追記）を見て安全停止（`Safety abort: all files were changed`）していたので、ローカルが前の同期から変わっていないことを確かめてから、その対だけ `--force` で 1 回回して降ろした（ローカルの古い版は `nikke_sync_trash/private/` へ）。13:42 に `captures` と `private` の両側の根に目印 `SYNC_MARKER_DO_NOT_DELETE.txt` を置いた（[../design-cloud-environment.md](../design-cloud-environment.md) 4.2 節）。旧い目印 `RCLONE_TEST` は、目印を変える変更のマージの後に消す。
- 2026-10-24 12:12 録画 0556（I-DOLL・フラワー単騎）: `range/20261024-0556_rl_idoll-flower_manual-core.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:12 録画 0557（I-DOLL・フラワー単騎）: `range/20261024-0557_rl_idoll-flower_manual-core.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:12 録画 0558（I-DOLL・フラワー単騎）: `range/20261024-0558_rl_idoll-flower_manual-core.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:12 録画 0559（I-DOLL・フラワー単騎）: `range/20261024-0559_rl_idoll-flower_manual-core.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。

2026-10-24 04:50 に、録画 0553 を 559 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0559_rl_idoll-flower_manual-core.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 04:51 に、録画 552 を 558 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0558_rl_idoll-flower_manual-core.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 04:53 に、録画 0551 を 557 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0557_rl_idoll-flower_manual-core.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 04:54 に、録画 0550 を 556 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0556_rl_idoll-flower_manual-core.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

- 2026-10-24 12:19 録画 0554（デルタ単騎）: `range/20261024-0554_sr_delta_normal-enemy.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 12:19 録画 0555（デルタ単騎）: `range/20261024-0555_sr_delta_normal-enemy.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。

2026-10-24 03:45 に、録画 0551 を 554 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0554_sr_delta_normal-enemy.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 03:46 に、録画 552 を 555 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`range/20261024-0555_sr_delta_normal-enemy.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

- 2026-10-24 13:52 録画 0574（ソルジャーE.G.単騎）: `interception/20261024-0574_special_blacksmith_soldier-eg.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:52 録画 0575（ソルジャーF.A.単騎）: `interception/20261024-0575_special_blacksmith_soldier-fa.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:52 録画 0577（I-DOLL・フラワー単騎）: `interception/20261024-0577_special_blacksmith_idoll-flower.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:52 録画 0578（ココア単騎）: `interception/20261024-0578_special_blacksmith_cocoa.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:53 録画 0579（エマ単騎）: `interception/20261024-0579_special_blacksmith_emma.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 13:53 録画 0580（リター単騎）: `interception/20261024-0580_special_blacksmith_liter.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。

2026-10-24 05:27 に、録画 561 を 567 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0580_special_blacksmith_liter.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:34 に、録画 567 を 573 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0580_special_blacksmith_liter.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:35 に、録画 0556 を 574 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0574_special_blacksmith_soldier-eg.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:37 に、録画 0557 を 575 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0575_special_blacksmith_soldier-fa.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:38 に、録画 0558 を 577 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0577_special_blacksmith_idoll-flower.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:39 に、録画 0559 を 578 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0578_special_blacksmith_cocoa.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:40 に、録画 560 を 579 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0579_special_blacksmith_emma.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

2026-10-24 05:41 に、録画 573 を 580 に振り直した（`records:renumber`）。E: と Drive の名前を変えた（`interception/20261024-0580_special_blacksmith_liter.mp4`。ほかにスクショ・証拠フレーム・キャッシュが 0 件。中身は変えていないので sha256 は台帳のまま）。

- 2026-10-24 14:25 録画 0562（アニス：スター + イサベル）: `range/20261024-0562_sg_isabel_anis-star-ai-1.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 14:25 録画 0563（アニス：スター + イサベル）: `range/20261024-0563_sg_isabel_anis-star-ai-2.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 14:25 録画 0564（アニス：スター + イサベル）: `range/20261024-0564_sg_isabel_anis-star-ai-3.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 14:26 録画 0565（イサベル単騎）: `range/20261024-0565_sg_isabel_solo-gauge-1.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 14:26 録画 0566（イサベル単騎）: `range/20261024-0566_sg_isabel_solo-gauge-2.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 16:41 録画 0581（エマ + ナガ）: `range/20261024-0581_emma-naga-s2-count.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 16:41 録画 0582（エマ + ナガ）: `range/20261024-0582_emma-naga-s2-count.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 16:44 録画 0583（アスカ + マナ）: `range/20261024-0583_ar+ar_asuka+mana_asuka-control-1.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 16:45 録画 0584（アスカ + マナ）: `range/20261024-0584_ar+ar_asuka+mana_asuka-control-2.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 16:45 録画 0585（アスカ + マナ）: `range/20261024-0585_ar+ar_asuka+mana_mana-control-1.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 16:45 録画 0586（アスカ + マナ）: `range/20261024-0586_ar+ar_asuka+mana_mana-control-2.mp4` を Drive に置いた（Drive の中で取り込み元の写しからコピーした。E: と Drive で sha256 が一致）。
- 2026-10-24 23:25 録画 0587（I-DOLL・サン単騎）: `range/20261024-0587_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0588（I-DOLL・サン単騎）: `range/20261024-0588_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0589（I-DOLL・サン単騎）: `range/20261024-0589_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0590（I-DOLL・サン単騎）: `range/20261024-0590_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0591（I-DOLL・サン単騎）: `range/20261024-0591_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0592（I-DOLL・サン単騎）: `range/20261024-0592_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:26 録画 0593（I-DOLL・サン単騎）: `range/20261024-0593_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0594（I-DOLL・サン単騎）: `range/20261024-0594_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0595（I-DOLL・サン単騎）: `range/20261024-0595_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0596（I-DOLL・オーシャン単騎）: `range/20261024-0596_smg_idoll-ocean_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0597（I-DOLL・オーシャン単騎）: `range/20261024-0597_smg_idoll-ocean_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0598（I-DOLL・オーシャン単騎）: `range/20261024-0598_smg_idoll-ocean_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:27 録画 0599（I-DOLL・オーシャン単騎）: `range/20261024-0599_smg_idoll-ocean_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-24 23:28 録画 0600（I-DOLL・オーシャン単騎）: `range/20261024-0600_smg_idoll-ocean_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0601（ノワール単騎）: `range/20261024-0601_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0602（ノワール単騎）: `range/20261024-0602_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0603（ノワール単騎）: `range/20261024-0603_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0604（ノワール単騎）: `range/20261024-0604_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0605（ノワール単騎）: `range/20261024-0605_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:30 録画 0606（ノワール単騎）: `range/20261024-0606_sg_noir_auto_cube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0607（ノワール単騎）: `range/20261024-0607_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0608（ノワール単騎）: `range/20261025-0608_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0609（ノワール単騎）: `range/20261025-0609_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0610（ノワール単騎）: `range/20261025-0610_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0611（ノワール単騎）: `range/20261025-0611_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 00:31 録画 0612（ノワール単騎）: `range/20261025-0612_sg_noir_auto_nocube.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:09 録画 0613（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0613_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:09 録画 0614（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0614_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:09 録画 0615（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0615_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:09 録画 0616（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0616_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0617（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0617_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0618（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0618_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0619（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0619_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0620（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0620_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0621（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0621_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:10 録画 0622（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0622_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:11 録画 0623（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0623_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 02:11 録画 0624（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0624_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:39 録画 0625（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0625_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0626（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0626_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0627（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0627_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0628（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0628_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0629（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0629_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0630（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0630_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:40 録画 0631（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0631_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:41 録画 0632（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0632_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:41 録画 0633（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0633_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:41 録画 0634（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0634_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:41 録画 0635（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0635_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 03:41 録画 0636（鈴原サクラ + デルタ + ドレイク）: `range/20261025-0636_smg+sr+sg_sakura+delta+drake_drake-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0637（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0637_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0638（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0638_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0639（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0639_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0640（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0640_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0641（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0641_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 12:18 録画 0642（鈴原サクラ + デルタ + I-DOLL・サン）: `range/20261025-0642_smg+sr+ar_sakura+delta+idoll-sun_sun-control.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:42 録画 0643（I-DOLL・サン単騎）: `range/20261025-0643_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0644（I-DOLL・サン単騎）: `range/20261025-0644_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0645（I-DOLL・サン単騎）: `range/20261025-0645_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0646（I-DOLL・サン単騎）: `range/20261025-0646_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0647（I-DOLL・サン単騎）: `range/20261025-0647_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0648（I-DOLL・サン単騎）: `range/20261025-0648_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0649（I-DOLL・サン単騎）: `range/20261025-0649_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:43 録画 0650（I-DOLL・サン単騎）: `range/20261025-0650_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0651（I-DOLL・サン単騎）: `range/20261025-0651_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0652（I-DOLL・サン単騎）: `range/20261025-0652_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0653（I-DOLL・サン単騎）: `range/20261025-0653_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0654（I-DOLL・サン単騎）: `range/20261025-0654_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0655（I-DOLL・サン単騎）: `range/20261025-0655_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
- 2026-10-25 15:44 録画 0656（I-DOLL・サン単騎）: `range/20261025-0656_ar_idoll-sun_auto.mp4` を Drive に置いた（クラウドで record から移した。record の写しと Drive で sha256 が一致）。
