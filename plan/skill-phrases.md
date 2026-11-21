# 説明文の言い回しと語彙の対応

- スキルの説明文の言い回しを、定義（`packages/core/data/skills/`）でどう書くかを引く表。定義の手順は [skills-guide.md](skills-guide.md)、語彙の決まり（欄の条件・組み合わせの制約・既定）は `packages/core/src/skills/types.ts` の注記と、表の設計書の節にある。
- 語彙を足したら、表の末尾に 1 行（言い回し・書き方・例・設計書）足す。言い回しで引くときは、この文書を検索する。

<!-- prettier-ignore -->
| 言い回し | 書き方 | 例 | 設計書 |
| --- | --- | --- | --- |
| スキル発動者の最終最大HP の X% 分の攻撃力▲ | `scaling: "casterFinalMaxHp"` | ラプラス：アルティメットヒーローの S1 | [design-skill-stage6.md](design-skill-stage6.md) |
| スキル発動者基準で最大HP（のみ）X%▲（味方に付く） | timed の `scaling: "casterMaxHp"` | エードの S2・バースト、マストのバーストの味方への効果 | [design-hp-ratio-readers.md](design-hp-ratio-readers.md) 9 節 |
| 自分の HP が X% 以上なら | `condition.selfHp: { "atLeastRef": N }`（説明文に即値で書かれた X は `{ "atLeast": X }`） | ノワールの S1・ミルクの S2 | 同上、[design-hp-ratio-readers.md](design-hp-ratio-readers.md) 2.1 節 |
| 最大HP▲ | `stat: "maxHp"` | シンデレラの美しさ | 同上 |
| デコイ・デコイが存在する時 | 目録の `decoy`・`condition.selfState: "decoy"` | — | 同上 |
| 自分と自分より最終防御力が低い味方 | `target: "allies"` と `targetDefense: "lowerThanSelf"` | アニス：スターの S2 | [design-skill-stage7.md](design-skill-stage7.md) |
| 防御力▲ | `stat: "defense"` | デルタの S2 | 同上 |
| 〈クラス〉型の味方 | `targetClass` | エヌ：ミラクルフェアリーの S1・バースト | [design-skill-stage9.md](design-skill-stage9.md) |
| 残りの HP の割合が最も低い味方 N 機 | `target: "lowestHpRatio"` と `targetCount`（`targetCountRef`） | ミサトの S1 | [design-skill-stage8.md](design-skill-stage8.md)、[design-hp-ratio-readers.md](design-hp-ratio-readers.md) 2.2 節 |
| 「〈名前〉」：機能…・〜状態の味方 | 状態の付与 `kind: "state"` と `contents`。名前は目録（`skills/states.ts`）の id | — | [design-named-state.md](design-named-state.md) 5 節・[design-skill-stage1.md](design-skill-stage1.md) 1.4 節 |
| 同じ状態を、維持の違うきっかけで付ける（スタックしない状態） | 付与ごとに秒の維持（`durationRef`・`durationSeconds`）を書く | ロザンナの S1・S2 の隠れ身 | [design-rosanna.md](design-rosanna.md) 2 節 |
| 自分が〈状態〉なら・でなければ／解除不可 | `condition.selfState`／付与の `undispellable: true` | — | [design-skill-stage1.md](design-skill-stage1.md) 1.1・1.3 節 |
| 〈名前〉解除／直前に自分がバーストを使用していれば | `kind: "removeState"`／`condition.usedBurst: true` | マナの S2 | 同 1.2・1.4・1.5 節 |
| 初めてフルバーストタイムが発動した時／直前に自分がバーストを使用していなければ | 出来事の回数のきっかけ `{ "count": "fullBurstStart", "atLeast": 1, "atMost": 1 }`／`condition.usedBurst: false` | ディーゼル：ウィンタースイーツの S1 | [design-diesel-ws.md](design-diesel-ws.md) 2.1・2.2 節 |
| 〈名前〉のスタック量 N 個▲ | `kind: "stackChange"` | — | [design-skill-stage3.md](design-skill-stage3.md) 1.1 節 |
| スタック可能バフ効果のスタック量 N 個▲（付いているバフだけを増やす） | `stackChange` の `existingOnly: true` | ディーゼルの宝物版 S1（C-1182） | [design-diesel.md](design-diesel.md) 8.1 節 |
| フルバーストタイム持続中に N 回／窓の外の発も数え、付くのは窓の中だけ | 回数のきっかけの `during: "fullBurst"` と `reset`／`firesDuring: "fullBurst"` | ソーダ：トゥインクルバニーの S1 | 同 1.2・1.6 節 |
| 〈名前〉のフルスタック状態の時、スタック解除後（回復） | トリガー `{ "fullStack": "<id>" }` | クラウンの S2 | 同 1.3 節 |
| 〈名前〉のフルスタック状態ならスタック解除後、弾丸チャージ・▲▼（N 秒間維持） | `ammoRefill`・timed のトリガー `{ "fullStack": "<id>" }` | ディーゼルの S2 | [design-diesel.md](design-diesel.md) 2.1 節 |
| 自分が武器変更状態の場合、通常攻撃が N 回命中した時 | 回数のきっかけの `firesDuring: "weaponChange"` | モランの S1 | [design-skill-stage11.md](design-skill-stage11.md) 2.3・3.3 節 |
| 〈名前〉：バーストスキルクールタイム X 秒▼（持続・維持の付いた形。T4） | 状態の中身（か timed）の `stat: "burstCooldown"`・`scaling: "flat"` | モランの宝物版 S1 の熱血・ミルクの宝物版 S1・ティアの S1 | 同 3.3 節・[design-skill-stage15.md](design-skill-stage15.md) 2.2 節 |
| 遮蔽物の HP を回復した時／遮蔽物 HP 回復 | timed のきっかけ `{ "coverHealed": true }`／`kind: "coverHeal"` | ティアの S1・S2 | [design-skill-stage15.md](design-skill-stage15.md) 2.2 節 |
| 〈名前〉が適用される時・適用された時／〈名前〉：弾丸チャージ X% | トリガー `{ "applied": "<id>" }`／即時効果と、維持 0 秒の付与 | トーブの宝物版 S1 | [design-skill-stage4.md](design-skill-stage4.md) 1.1・1.2 節 |
| 自分がバリア適用状態なら／バリア・共用バリア | `condition.selfState: "barrier"`／付与の `state: "barrier"` | ラムのバースト・アスカの S2 | [design-skill-stage5.md](design-skill-stage5.md) 1.1・1.2 節 |
| 自分と〈状態〉の味方 | `targetState` と `includeSelf: true` | ラプンツェル：サンクチュアリの「自分と臨戦状態の味方」 | [design-new-chars-1029.md](design-new-chars-1029.md) 5.1・8 節 |
| N 回順番に攻撃（バースト以外）／順番攻撃ダメージ X%▲ | damage の `hitsRef`・`hitIntervalFrames`／stat `sequentialAttackDamage` | マリアン：クイーンの S1・S2 | 同 5.2・5.5 節 |
| 〈状態〉再発動周期 N 秒▼／バーストを使用した時、〈スキル〉の発動間隔 N 秒▼（N 秒間維持） | 周期の damage の `periodShorten`（`state`／名前の無い窓 `window: { "trigger": "burstUse", "durationRef": N }`） | マリアン：クイーンの S2・エイダの S2 | 同 5.3 節・10.2 節の f・[design-skill-stage15.md](design-skill-stage15.md) 2.3 節 |
| 〈名前〉：スキル N クールタイム X%▼（N 秒間維持。味方に付く） | 状態の中身 `{ "skillCooldownDown": { "slot": "skill2", "percentRef": N } }`／相手の周期のきっかけの印 `cooldown: true` | アルカナの S1 の魔術師のカード（相手はイサベルの S2） | [design-arcana-magician.md](design-arcana-magician.md) 2 節 |
| スキル N のクールタイム X%▼（維持なし。自分）／スキル N を発動した時／説明文にきっかけの無い CT ごとのアクティブの timed | `kind: "skillCooldownReduction"`（`slot`・`percentRef`。きっかけは射撃の回数）／timed のきっかけ `{ "skillFired": "skill2" }`／timed の周期のきっかけの印 `cooldown: true` | センチの宝物版 S1・S2 | [design-centi.md](design-centi.md) 2 節 |
| フルバーストタイム発動中、N 秒ごとに | 周期のきっかけ（`everySeconds`）の damage と `condition.inFullBurst: true` | エイダの S2 | [design-skill-stage15.md](design-skill-stage15.md) 2.3 節 |
| 最終攻撃力の X% の防御力無視ダメージ（倍率ダメージ） | damage の `damageType: "true"` | エイダの S2・ベスティー：タクティカル・アップの S2 | 同上 |
| 直前にバーストスキルを使用した基本バースト段階が N の味方全体 | `target: "burstUsers"` と `targetBurstStep`（timed・付与・heal） | エイダの S1 | 同上 |
| 「〈名前〉」：N 発間維持のチャージ速度▼ | 付与の `durationShotsRef` と中身の `stat: "chargeSpeed"` | エイダの特殊改造 | 同上 |
| 再発動周期 N 秒（端数を持ち越す）／命中した時に付く（周期の付与の遅れ） | 周期のきっかけの `carry: true`／周期の付与の `delayFrames` | マリアン：クイーンの S1 の槍と弱点露出 | 同 10.2 節の a・d・e |
| 周期のスキルのヒットから付く▲▼ | 周期のきっかけの timed の `delayFrames` | エーテルの S2 の防御力▼ | V-0602 |
| 説明文にきっかけの無い周期の持続ダメージが、発動の N f 後に付く | dot の周期のきっかけ（`everySeconds`）と `tickDelayFrames` | ロザンナ：シックオーシャンの S2 | [design-rosanna-co.md](design-rosanna-co.md) 2 節 |
| コア命中ダメージ | damage の `coreHit: true` | マリアン：クイーンの S2 | 同 5.4 節 |
| マシンガン立ち上げ速度 X%▲ | stat `spinUpSpeed` | マリアン：クイーンのバースト | 同 5.6 節 |
| 通常攻撃が N 回クリティカル命中した時／自分が使用武器変更状態でなければ | 回数の種類 `critHit`／回数のきっかけの `firesOutside: "weaponChange"` | 紅蓮：神殺の S2 | 同 5.7 節 |
| N 秒ごとに〈カウンタ〉N%▼／〈カウンタ〉の N% 以上の時（下位効果のスタック適用） | `counterChange` の時間の周期のきっかけ（`{ "everySeconds": N, "carry": true }`・`decrease`）／`passive` の `while.selfCounter`（閾値ごとに 1 つ） | 千束の S1 の超感覚 | [design-skill-stage16.md](design-skill-stage16.md) 2.1 節 |
| 防御力無視バーストスキルダメージ | burstDamage の `damageType: "true"` | ベスティー：タクティカル・アップのバースト | [design-skill-stage16.md](design-skill-stage16.md) 2.2 節 |
| 最大弾数のリロードが完了した時、〈状態〉解除／自分が〈状態〉でない時（その状態の付与の条件） | `removeState` のきっかけ `{ "reloadEnd": true }`／付与の `condition.selfState: { "state": 〈状態〉, "present": false }`（自分の状態を見る付与は `present: false` だけ） | ベスティー：タクティカル・アップの S1 のミサイルガイド | 同上 |
| 対象に「〈名前〉：…」「N スタック」（敵に付く状態のスタック）／スキル発動者基準で防御力 X%▼ | 付与の `target: "enemy"` と `maxStacksRef`／中身の `stat: "enemyDefenseDown"`・`scaling: "casterDefence"` | マストの S1 の海風 | [design-mast.md](design-mast.md) 2.1・2.2 節 |
| 〈状態〉の対象に「最終攻撃力の X% のダメージ」「〈状態〉スタックコピー」「1 秒間隔」 | dot の `stacksFrom: { enemyState }`（元は dot か、敵にスタックで付く状態の付与）と `sustained: false` | マストのバーストの暴風 | [design-mast.md](design-mast.md) 2.3 節 |
| 自分の HP が X% 以下である限り | timed のきっかけ `{ "selfHpAtMostRef": N }` と `durationUntil: "selfHpAbove"` | マストの S1（バーストの最大HP のみ▲ の間） | [design-mast.md](design-mast.md) 8 節 |
| 自分の HP が X% 以下の時（N 秒間維持） | timed のきっかけ `{ "selfHpAtMostRef": N }` と `durationRef`（即値なら `durationSeconds`） | エードの S1 | [design-ade.md](design-ade.md) 2.1 節 |
| 〈カウンタ〉が 100% になった時、〈状態〉（解除条件：〈カウンタ〉が 0% になった時） | 付与のきっかけ `{ "counterFull": 〈カウンタ〉 }` と `durationUntil: { "counterEmpty": 〈カウンタ〉 }`（同じカウンタで組む。自分にだけ・スタックなし） | アークレンジャー・ブラックの変身 | [design-skill-stage19.md](design-skill-stage19.md) 2.1 節 |
| 〈状態〉の間、N 秒間隔で〈カウンタ〉N%▼／〈状態〉の後、〈カウンタ〉N%▼ | `counterChange` の周期のきっかけ `{ "everySeconds": N, "carry": true, "since": { "applied": 〈状態〉 } }`／`counterChange` のきっかけ `{ "applied": 〈状態〉 }` | — | 同上 |
| 〈状態〉が適用された時、〈状態〉解除までの持続ダメージ | dot のきっかけ `{ "applied": 〈状態〉 }` と `durationUntil: { "stateEnd": 〈状態〉 }`（同じ状態で組む） | — | 同上 |
| 『バースト〈段階〉で使用時：〈モード〉』／バーストスキルクールタイム X 秒▼「戦闘中 1 回発動」 | burstUse の効果の `condition.burstStep`（モードの名前は維持 0 秒の付与）／`cooldownReduction` の `maxFires: 1` | レッドフードのバースト | [design-red-hood.md](design-red-hood.md) 2.1〜2.3 節・7.1 節 |
| チャージ速度 100% を超えた場合、超過した値をチャージダメージに変換・超過した値の X% のチャージダメージ▲ | passive の stat `chargeSpeedOverflow`（`self` だけ） | レッドフードの S1 | 同 2.4 節 |
| 使用武器変更の解放の長さ・装弾数無限（説明文に無く、録画で読む） | `weaponChange` の `chargeReleaseSeconds`・`infiniteAmmo` | レッドフードのレッドウルフ | 同 7.1 節の論点 10・11 |
| 「スタック量増減効果無効」 | 付与の `stackImmutable: true` | ナユタの記憶吸収 | [design-nayuta.md](design-nayuta.md) 2.5 節 |
| 「〈名前〉：使用武器変更」（自分が〈名前〉状態なら） | `weaponChange` の `state` と、読む側の `condition.selfState` | — | 同上 |
| チャージしない武器から、チャージ時間 N 秒のチャージ武器への使用武器変更 | `weaponChange` の `chargeTimeSeconds`（基礎の武器がチャージしなくても書ける）と、最初の発の `firstShotDelayFrames`・的の表の `coreHitRate.weaponChanges`・`bulletHitRate.weaponChanges` の行 | ナユタの記憶燃焼 | 同 2.6 節 |
| 使用武器変更の「最大装弾数：N 発」で撃ち切って戻った後の、基礎の武器の 1 発目までの待ち（説明文に無く、録画で読む） | `weaponChange` の `returnFirstShotFrames`（`maxAmmoRef` の変更だけ）と、その後の同じ枠のクールタイムの周期の発動の待ち `returnCooldownFrames` | スノーホワイトのバースト | [design-snow-white.md](design-snow-white.md) 8.1 節の論点 4・8.3 節の論点 7 |
| 「チャージ時間：N 秒固定」（使用武器変更の武器） | `weaponChange` の `chargeTimeFixed: true` | ナユタの記憶燃焼 | 同 2.4 節 |
| 使用武器変更の「チャージ時間：N 秒」（N が説明文の値） | `weaponChange` の `chargeTimeRef` | マクスウェル：オーディナリーメカニックのバースト | [design-maxwell-om.md](design-maxwell-om.md) 2.1 節 |
| 〈状態〉の段階別の効果・各段階の効果のみ適用（使用武器変更のチャージ時間） | 段階ごとの `weaponChange` と、条件 `selfState` の `stacks`・`stacksBelow`（N スタック未満） | マクスウェル：オーディナリーメカニックのバーストの過電流 | 同 2.2 節 |
| 現在のHP X%▼ | 即時効果 `kind: "currentHpDown"`（自分だけ） | 紅蓮の S1 | [design-scarlet.md](design-scarlet.md) 2.1 節 |
| 自分の HP が X% 以下の場合（発火で付く効果） | timed の `condition.selfHp: { "atMostRef": N }`（即値は `atMost`） | 紅蓮のバースト | 同 2.2 節 |
| 段階別の効果・下位効果のスタック適用（N 段階：N−1 段階フルスタック状態なら） | 段階ごとの状態の付与（同じきっかけ）と、上の段階の条件 `selfState` の `stacks: "full"`・`sameFiring: true` | クエンシー：エスケープクイーンの S2 | [design-quency-eq.md](design-quency-eq.md) 2 節の論点 3 |
| 〈攻撃〉した時、自分が〈状態〉なら（同じ攻撃で別のスキルが〈状態〉を付ける） | timed の条件 `selfState` の `present: true`・`sameFiring: true`（同じ発で付いた状態も見る。きっかけは射撃の回数で、状態の付与と同じ回数の種類） | プリムの宝物版 S2 | [design-frima.md](design-frima.md) 2 節 |
| 適正最小射程距離 X%▲／フルチャージ攻撃が適正射程距離内の対象に命中した時 | stat `minEffectiveRange`（状態だけの stat）／fullChargeShot の timed の `condition.inEffectiveRange: true` | エード：エージェントバニーの S1・S2・バースト | [design-agent-bunny.md](design-agent-bunny.md) 2.1・2.2 節 |
| 適正最大射程距離 X%▲ | stat `maxEffectiveRange`（状態だけの stat。上端 × (1 + Σ)）。対象は自分に限らない（`targetWeapon` で絞れる） | レオナの S1 | [design-leona.md](design-leona.md) 2.1 節 |
| 貫通特化／貫通ダメージ X%▲ | フラグの stat `pierce`（timed・passive（`while` も書ける）・状態の中身）／stat `pierceDamage` | エード：エージェントバニーの S2・バースト | 同 2.3 節 |
| 使用武器変更の「追加効果：貫通特化」／変更後の武器の 1 発の弾の数（説明文に無く、録画で読む） | `weaponChange` の `pierce: true`／`shotCount` | ツバイのバースト | [design-zwei.md](design-zwei.md) 2.1・2.2 節 |
| 「N スタック」「N 発間維持」 | timed の `maxStacksRef` と `durationShotsRef` | ツバイの宝物版 S1 | 同 2.3 節 |
| デバフ効果解除 N 個（味方全体／デバフのかかった味方からランダムに N 機） | `removeDebuff`（`target: "allies"`／`"debuffedRandom"` と `targetCount`） | ココアの S1・バースト | [design-debuff-removal.md](design-debuff-removal.md) 2.2 節・[design-debuff-removal-timed.md](design-debuff-removal-timed.md) 2.1 節 |
| ペレットの数を 1 個に固定／ペレット数 N 個▲（N 発間維持の貫通特化・命中率▲） | フラグの stat `singlePellet`／stat `pelletCount` と `scaling: "flat"`（`singlePellet` は timed の self。`pelletCount` は timed の self・allies・topAttack と、自分に付く状態の中身）／`durationShotsRef` を `hitRate`・`pierce`・`singlePellet` にも書ける | ドロシー：セレンディピティの S1・バースト、アルカナ：フォーチュンメイトの S2 の幸せな思い出、レオナの S2（SG の上位 2 機） | [design-dorothy-serendipity.md](design-dorothy-serendipity.md) 2 節・[design-fortune-mate.md](design-fortune-mate.md) 2.3 節・[design-leona.md](design-leona.md) 2.2 節 |
| 〈状態〉が終了した時（残弾数減少・状態の付与） | きっかけ `{ "ended": 〈状態〉 }`（counterChange・ammoDecrease・状態の付与） | グレイブの S1 | [design-grave.md](design-grave.md) 2.1 節 |
| 〈状態〉：…「最大装弾リロード完了時に解除」 | 状態の付与の `durationUntil: "reloadEnd"` | グレイブの S2 の過熱I | 同 2.2 節 |
| 〈状態〉が終了した時（倍率ダメージ・timed・敵の状態の消去）／終了の N f 後のヒット | きっかけ `{ ended }`／damage と敵の消去の `delayFrames` | アスカ：WILLE の殲滅・緊急修復 | [design-asuka-wille.md](design-asuka-wille.md) 2.1 節・決めたこと |
| 個別対象ごとに〈敵に付いた状態〉スタックコピー（1 回のヒット）／効果適用後、〈状態〉解除 | damage の `perCount: { enemyState }`（`{ ended }` だけ）／`cancelState` の `target: "enemy"`（敵にスタックで付ける付与の状態） | アスカ：WILLE の殲滅 | 同 2.2・2.3 節 |
| 自分が〈状態〉の時に限り、対象に（敵に付く状態の付与） | 敵の付与の条件 `selfState`（ほかの鍵は書けない） | アスカ：WILLE の S1 のアンチA.T.フィールド | 同 決めたこと |
| リロード比率 X%▼ | stat `reloadRatio`（`decrease`） | グレイブの S1 の放熱 | 同 2.3 節 |
| 〈状態〉なら、通常攻撃時「攻撃回数別の効果」「各段階の効果のみ適用」「〈状態〉解除時初期化」（段が弾丸チャージ・状態の付与） | 段ごとの効果に、回数のきっかけ `every`（段の間隔 × 段の数）・`phase`（段の回数）・`during: { state }`（弾丸チャージにも書ける） | アルカナ：フォーチュンメイトの S2 | [design-fortune-mate.md](design-fortune-mate.md) 2.1・2.2 節 |
| 〈状態〉なら、命中した時「攻撃命中回数別の効果」（N 回：〈状態〉かつ〈下位の状態〉の時に限り） | 回数のきっかけの `during: { "state": 〈状態〉 }` と付与の条件 `selfState` | グレイブの S2 の過熱II・III | 同 2.4 節・C-1123 |
| 〈状態〉の時に限り…「持続」（状態の付与） | 状態の付与の `durationUntil: { "stateEnd": 〈状態〉 }` | グレイブの S2 の過熱II・III | 同 2.5 節 |
| 「貫通特化」「1 発間維持」 | timed の `stat: "pierce"` と `durationShots: 1` | D：キラーワイフの S1 | [design-killer-wife.md](design-killer-wife.md) 2.1・10 節 |
| 〈状態〉の対象に命中させた味方に（〈状態〉N 秒間維持） | timed の `holderHit: { withinRef: N }` と秒の維持 | D：キラーワイフのバースト | 同 2.2・10 節 |
| 〈名前〉消去（自分の状態） | `cancelState` の `target: "self"`（条件は解除と同じ鍵） | ミントの S2 | [design-mint-prika.md](design-mint-prika.md) 2.1 節 |
| 条件に合う〈組の状態〉のみ適用 | 目録の `group`（同じ組の状態の付与） | ミントのバースト | 同 2.2 節 |
| 〈状態〉が適用された時、自分が〈状態〉なら／〈状態〉のスキル発動者に | `{ applied }` の効果の `condition.selfState`／`target: "appliedCaster"`（`{ applied }` の timed・付与だけ） | プリカの S2 のアンコール | 同 2.3・2.4 節 |
| 〈状態〉維持時間 X 秒▲ | `kind: "stateExtend"`（`secondsRef`） | アンコールの効果 2 | 同 2.5 節 |
| バーストスキルクールタイム X 秒▲（即時） | `cooldownReduction` の `increase: true` | アンコールの効果 4 | 同 2.6 節 |
| 自分が〈状態〉なら（回復） | `heal` の `condition.selfState` | ミントの S1 のダンスエフェクト | 同 2.7 節 |
| 自分の HP が最大の場合（倍率ダメージ） | damage の `condition.selfHp: { "atLeast": 100 }` | ソリンのバースト | [design-soline.md](design-soline.md) 2.1 節 |
| フルバースト状態でなければ（timed）／フルバーストタイム中のみ（攻撃力▲） | timed の `condition.inFullBurst: false`／攻撃力の timed の `condition.inFullBurst` | ベルベットの S1・S2 | [design-velvet.md](design-velvet.md) 2.1・2.2 節 |
| 〈カウンタ〉の弾薬消費 N 発（足りなければ起きない） | `counterChange` の `decrease` と、消費と同じ行の効果の全部に `condition.selfCounter: { "atLeast": N }` | ベルベットの弾丸ポーチ | 同 1・2.3 節 |
| スキル対象の説明部分が『〜敵1機に』で終わるバーストスキルダメージ▲ | stat `oneEnemyBurstDamage`（timed。当てはまる burstDamage は説明文の対象の句から解決が決める） | ジャッカルのバースト | [design-jackal.md](design-jackal.md) 2 節 |
| スキル対象の説明部分が『敵全体に』で終わるバーストスキルダメージ▲ | stat `allEnemiesBurstDamage`（timed。当てはまる burstDamage は説明文の対象の句から解決が決める） | トリナのバーストの根張り | [design-trina.md](design-trina.md) 2.1 節 |
| 部隊の一番左側にいる〈絞り込み〉の味方 1 機 | timed の `target: "allies"` と `targetLeftmost: true`（`targetWeapon`・`targetElement`・`targetClass` と組む） | トリナの S2 | [design-trina.md](design-trina.md) 2.2 節 |
| 自分の最終最大装弾数 1 発ごとにチャージダメージ X%▲ | timed の `scaling: "perFinalMaxAmmo"`（`chargeDamage`・`self` だけ） | エミリアの S1 | [design-emilia.md](design-emilia.md) 2.1 節 |
| 自分が与えたダメージ量の X% 分本体に固定ダメージ（フルチャージ攻撃が命中した時） | damage の `damageType: "fixedShare"`（きっかけは `{ "count": "fullChargeShot" }` だけ） | エミリアの S2 | 同 2.2 節 |
| 使用武器変更の「初回ダメージ：最終攻撃力の X% のダメージ」（変更後の武器の発とは別の 1 ヒット） | burst の `burstDamage`（遅れの表の hitFrames） | ラプラスのバースト（C-1204） | [design-laplace.md](design-laplace.md) 8 節 |
| 自分が〈状態〉のフルスタック状態なら、（使用武器変更の）通常ダメージを防御力無視ダメージとして適用（バーストを使った時に判定） | 変更を 2 つにし、条件 `selfState` の `stacks`（`trueDamage` あり）と `stacksBelow` で分ける | ラプラスの宝物版のバースト（C-1200） | 同 8 節 |
| 味方が消費した弾の合計が N 発ごとに（バーストゲージのチャージ） | burstGauge のきっかけ `{ "count": "teamAmmo", "everyRef": N }`（自分を含む全員の発） | シンデレラ：クリスタルウェーブの S1 | [design-cinderella-cw.md](design-cinderella-cw.md) 7 節 |
| 味方が消費した弾の合計が N 発ごとに、ランダムな敵に「N 回順番に攻撃」 | damage のきっかけ `{ "count": "teamAmmo", "everyRef": N }` と `hitsRef`・`hitIntervalFrames`・`delayFrames` | リトルマーメイドの S2 のバブルバラージ | [design-little-mermaid.md](design-little-mermaid.md) 7 節 |
| フルバーストタイムが発動した時、直前に自分がバーストを使用していれば（倍率ダメージ） | damage の `condition.usedBurst: true` | シンデレラ：クリスタルウェーブの S2 | 同上 |
| 〈stat〉増加効果が適用された時（自分に付く状態） | 付与のきっかけ `{ "buffApplied": "<stat>" }`（どの枠の▲でも、付くたびに） | ブレッディの S1 のやみつきの味・オススメの味 | [design-bready.md](design-bready.md) 2.1 節 |
| 〈stat〉増加状態でなければ | 条件 `selfBuffed: { "stat": "<stat>", "present": false }` | ブレッディの S1 のオススメの味 | 同 2.2 節 |
| 〈状態〉消去（もう片方の状態が付いた時に外れる 2 つの状態） | 目録の切り替えの組 `group` | ブレッディの S1 の味 | 同 2.3 節 |
| 対象が〈他のキャラが敵に付けた状態〉なら、〈状態〉のスタック量 N 個▲ | `stackChange` の `target: "enemy"`（同じ定義にその状態の dot が無い）と条件 `enemyState` | レイ（仮称）の S1 のアンチA.T.フィールド | [design-rei-tentative.md](design-rei-tentative.md) 2.1 節 |
| 〈時間で変わる状態〉の味方全体（バーストの使用などで付く状態） | timed の `targetState`（編成のどの枠でも静的でなければ、発火のフレームにその状態を持つ枠） | レイ（仮称）の S1 の殲滅態勢の味方 | 同 2.2 節 |
| 〈持続ダメージの名前〉効果 X%▲ | timed の stat `dotEffect`（持ち主の持続ダメージの tick に別の乗数） | ブレッディのバーストのあと味効果 | 同 2.4 節・決めたこと |
| 「〈状態〉」の間の必要命中回数 N 回（味方全体で累計）で〈カウンタ〉1 増加（その状態の解除・倍率ダメージも同じきっかけ） | 回数の種類 `teamHit` と `during: { state }`（counterChange・damage・removeState にも書ける） | エレグ：ブーム・アンド・ショックの S1 の憑依・S2 | [design-elegg-bs.md](design-elegg-bs.md) 2.1・2.2 節 |
| 〈カウンタ〉N▼「最低 M を維持」 | `counterChange` の `floor` | エレグ：ブーム・アンド・ショックのバースト | 同 2.3 節 |
| 通常攻撃が N 回（クリティカル）命中した時、ランダムな敵に「N 回順番に攻撃」 | 射撃の回数のきっかけの damage の `hitsRef`・`hitIntervalFrames`・`delayFrames`（射撃に畳み込まない） | イヴの S1 の不安定エネルギー | [design-eve.md](design-eve.md) 2.1 節 |
| 通常攻撃が N 回命中した時、対象が〈コード〉なら自分に弾丸チャージ | `ammoRefill` の `enemyElement` | イヴの S2 | 同 2.2 節 |
| 〈倍率ダメージ〉がクリティカル命中した時、同じ敵に（追加ダメージ） | damage の `onSkillCrit: true`（相手と同じきっかけ。期待値は値 × 倍率ダメージの会心率） | ジュリアの宝物版 S2 のマルカート | [design-julia.md](design-julia.md) 2.1 節 |
| スキル発動者の最終最大HP の X% を攻撃力に合算して Y% ダメージ／〈カウンタ〉分の連続攻撃 | burstDamage の `addCasterMaxHpRef`／burstDamage の `hitsFrom: { counter }` と、遅れの表の行のカウンタの上限の数の `hitOffsets` | メイデン：アイスローズのバースト | [design-maiden-ice-rose.md](design-maiden-ice-rose.md) 2.2・8 節 |
| 〈カウンタ〉が 0 なら・1 以上なら（カウンタの増減と timed のきっかけ） | 条件 `selfCounter` の `below: 1`・`atLeast: 1` | メイデン：アイスローズの S1・S2 の MP | 同 2.1・2.4 節 |
| 自分の HP が X% 以下の場合に限り、失った HP 1% ごとに攻撃力 Y%▲「持続」 | timed の `scaling: "perLostHp"`（`attack`・`self` だけ）と、きっかけ `{ "selfHpAtMostRef": N }`・`durationUntil: "selfHpAbove"` | ギロチンの S2 | [design-guillotine.md](design-guillotine.md) 2.1 節 |
| 自分の HP が X% 以下の場合（倍率ダメージ） | damage の `condition.selfHp: { "atMostRef": N }`（バーストを使ったフレームの HP の割合で見る） | ギロチンのバースト | 同 2.2 節 |
| 最終最大HP の X% を攻撃力として換算した Y% のダメージ | burstDamage の `convertCasterMaxHpRef`（攻撃力を最終最大HP × X% に置き換える。`addCasterMaxHpRef` と組まない） | キロのバースト | [design-kilo.md](design-kilo.md) 2.2 節 |
| 〈名前〉：最終最大HP の X% のバリア「持続」・〈名前〉状態なら（自分へのバリア） | 目録の家族 `barrier` の状態の付与（中身なし・`durationUntil: "battleEnd"`）。被弾で切れる分は扱わない | キロの S1 のナノコーティング | 同 2.1 節 |
| 〈カウンタ〉を N 個回収した時（N は上限）、〈別のカウンタ〉が M 本未満なら「〈カウンタ〉数リセット」「〈別のカウンタ〉1 本増加」／「X% × 〈別のカウンタ〉の数▲」「持続」 | `counterChange` 2 つ（きっかけ `{ "counterFull": 〈カウンタ〉 }`・条件 `selfCounter` の `below: M`）／閾値ごとの `passive`（`while.selfCounter`）。前提の中で届かない段は前提の外の notes | E.H. の S1 の廃品・自家製弾倉 | [design-eh.md](design-eh.md) 2.2 節 |
| 使用武器変更の「最大装弾数：N 発 × 〈カウンタ〉の数」（説明文に番号の無い装弾数） | `weaponChange` の即値の `maxAmmo`（`maxAmmoRef` とちょうど片方。撃ち切りで終わる） | E.H. のバースト | 同 2.3 節 |
| 使用武器変更の武器のコアの倍率（説明文に無く、録画で読む） | `weaponChange` の `coreDamageRate`（即値。省略は基礎の武器のまま） | E.H. のバースト（×2.0） | [design-eh.md](design-eh.md) 8.1 節 |
| 通常攻撃が N 回命中した時、コアでなければ | 回数の種類 `nonCoreHit`（コアでない命中の期待値を通算で数える） | ギロチン：ウィンタースレイヤーの S2 の経験値 | [design-guillotine-ws.md](design-guillotine-ws.md) 2.1 節 |
| 〈状態〉N スタックごとに（〈カウンタ〉が上がる） | `counterChange` のきっかけ `{ "stateStacks": 〈状態〉, "everyRef": N }` | ギロチン：ウィンタースレイヤーの S1 の勇者レベル | 同 2.2 節 |
| 〈カウンタ〉アップ時（〈カウンタ〉が上がった時） | 弾丸チャージ・回復・timed のきっかけ `{ "counterUp": 〈カウンタ〉 }`（戦闘開始時の増減では起きない） | 同上の勇者レベルアップ効果 | 同 2.2 節 |
| X% × 〈カウンタ〉数分▲「持続」（上がるたびに付け直す） | timed の `perCount: { "counter": 〈カウンタ〉 }` と `durationUntil: "battleEnd"` | ギロチン：ウィンタースレイヤーの S1 | 同 2.3 節 |
| 最終攻撃力の X% × 〈カウンタ〉数分の持続ダメージ | dot の `stacksFrom: { "counter": 〈カウンタ〉 }`（付けた時の値。tick ごとに読むなら `copyEachTick`）。付く時刻の遅れの実測は `delayFrames`（ゲージを溜めない `burstUse` の dot にも書ける） | ギロチン：ウィンタースレイヤーのバースト | 同 2.4・8.2 節 |
| バースト 3 段階突入時、「開始回数別の効果」「下位効果のスタック適用」 | 段ごとの効果に、出来事の回数のきっかけ `{ "count": "burstStage3Enter", "atLeast": N }`（編成の段階 3 への突入を数える。II で切れたチェーンも数える） | ネオン：ブルーオーシャンの S2 | [design-neon-bo.md](design-neon-bo.md) 2.1 節 |
| 使用武器変更の後の「対象が〈コード〉なら対象に追加ダメージ」（変更後の武器の発ごと） | damage のきっかけ `{ "count": "weaponChangeShot" }` と `enemyElement`（1 トリガーの値に畳み込まず、変更後の武器の発にだけ出す） | ネオン：ブルーオーシャンのバースト | 同 2.4 節 |
| 対象が〈状態〉状態ではないなら（敵の状態の否定。敵への付与・自分への付与）／対象が〈状態〉状態なら「N 発間維持」 | 条件 `enemyState: { "state": "<id>", "present": false }`（敵への付与にも書ける）／発数の維持の timed の条件 `enemyState` | ファントムの S1 の予告状・怪盗の短剣・攻撃ダメージ▲ | [design-phantom.md](design-phantom.md) 2.1 節 |
| 〈名前〉フルスタック状態なら、対象に追加ダメージ・効果発動後〈敵の状態〉解除・スタック解除後自分に〈状態〉・敵全体に分配ダメージ | damage・状態の付与・解除のきっかけ `{ "fullStack": "<id>" }`／敵の状態の解除は `removeState` の `target: "enemy"`（同じフレームに付いた件も外す） | ファントムの S2 | 同 2.2・2.3 節 |
| 「持続」「バーストスキル使用時スタック解除」 | 状態の付与の `durationUntil: "battleEnd"` と、`removeState` のきっかけ `burstUse` | ファントムの S2 の分配ダメージ▲ | 同 1 節 |
