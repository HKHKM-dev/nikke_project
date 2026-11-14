# キャラのスキルを定義する手順

- キャラ 1 体のスキルを `packages/core/data/skills/{resourceId}.json` に定義し、撮影で確かめるまでの手順。方針は 0 節。
- DSL の語彙と検証の規則は `packages/core/src/skills/types.ts`、原則は [design-stage4.md](design-stage4.md) 2 節。
- **検証の共通の流れ（起案・撮影計画・撮る・読む・比べる・結論・閉じる・PR）と、確定にできる条件は [verification-guide.md](verification-guide.md)**。ここには、スキル定義に固有の手順だけを書く。

## 0. 方針

- **撮影で確かめるキャラだけ定義する**。説明文だけで解釈が一意に決まる効果（等級のデータ明記）でも、撮影で確かめる。語彙の実装が正しいかは撮影でしか分からないため。
- **1 体 1 PR**。語彙の追加・定義・予測・撮影の結果・結論を 1 本の PR にまとめる。
- **足す語彙はそのキャラに要るものだけ**。ただし、同じ言い回しの他のキャラにもそのまま使える形にする（対象を武器種で絞れる、別のトリガーでも使える、など）。
- **根拠は効果ごとに結論の ID で持つ**。定義のどの効果も、`claims` の欄で結論を指す（3 節）。
- **完了条件**
  - そのキャラの撮影と、定義の予測が合う。
  - そのキャラを含む実戦的な編成のテストで、そのキャラの効果（窓・発動・付与）が意図どおりに出る。
- **Stage 11 までに定義した 15 体**には、凍結の記録（`plan/verification.md`）から結論を写さない。結論を作るのは、最小構成の録画の読み直し（2 節）か、新しい撮影のときだけ（[design-skill-claims-5-2.md](design-skill-claims-5-2.md) 3 節）。機構の結論（stat の効き方）は、根拠の録画にそのキャラの効果が出ていなければ結び付けない。

## 1. 手順

### 1.1 選ぶ

- 所持・育成の状況は `D:\nikke_project\private\owner.md`（worktree には無い）で見る。
- 単騎か最小構成で撮れるかを見る。確かめたい効果のほかに、未確定の要素（定義の無い味方のバフ・被弾・確率発動）が混ざらない編成を組めるか。

### 1.2 説明文を分解する

- `packages/core/data/characters/{resourceId}.json` の `skills.{skill1|skill2|burst}` を読む。説明文の 1 行ずつを、次のどれかに分ける。notes は種類 `kind` を付けて書く（[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.1 節）。1 行の notes に種類の違う中身を混ぜない。
  - **語彙にある**: そのまま定義に書ける
  - **語彙を足す**: 足す語彙の案を書く
  - **ダメージに関係しない**（`noDamage`）: どの編成・敵でも与ダメージを変えない（敵の攻撃力▼・不屈・無敵など）。挑発は、付けたときにゲージを溜めることがある（C-0422・C-0480・C-0506。自分にヘイト：敵全体を挑発のティアの S2 は溜めない C-0505。キャラごとに確かめる）（[design-skill-claims-5-2.md](design-skill-claims-5-2.md) 7.2 節）
  - **前提の外**（`outOfScope`）: モデルの前提（静止単体ボス・被弾なし・味方が倒れない・パーツ／阻止部位／バリアなし。[requirements.md](requirements.md) 4.2 節）では起きない・効かない（被弾トリガー・パーツ・阻止部位・敵のバリアなど）
  - **間接に効く**（`indirect`）: それ自体は与ダメージを変えないが、経路（`path`。`hp`・`defense`・`barrier`・`decoy`・`cover`・`pierce`・`pellet`）の値や有無を動かし、その経路を読む効果のある編成でだけ効く（防御力▲・最大HP▲・受ける HP 回復量▲・味方へのバリア・デコイ・遮蔽物の回復・貫通特化など）。読む側（経路の値や有無で値・対象・条件・きっかけが決まる効果と、未対応・前提の外・補足の notes）には `reads` を書く。読む側が同じ定義にある未対応の動かす側は、未対応のまま（[design-indirect-notes.md](design-indirect-notes.md)）
  - **未対応**（`unimplemented`）: 前提の中でダメージに効く（効きうる）のに、今回は定義しないもの。理由（語彙が無い・撮っていない・きっかけが説明文に無い など）を添える。味方の回復は、「回復を受けた時」の効果を持つ味方の発動を変えるので、`heal` で定義しないならここ
  - 扱い方の補足（`modeling`）: 扱っていない効果ではなく、どこから入っているか・近似などの説明
  - 未対応・前提の外の notes には、効いたとしたらどんな効果かを `effect`（`kind`・`stat`・`target`・`trigger`。語彙で書けない欄は `"unknown"`。被弾のきっかけは `damaged`。計算の語彙に無い敵の防御力▼は stat `enemyDefenseDown`・対象 `enemy`、最大HP▲は stat `maxHp`）で書く。補足は、指す効果を `refers`（`"effects[0]"` など）で書き、指す効果が無ければ `effect` を書く。計算は読まず、最小構成の検査が使う（[design-minimal-relevance.md](design-minimal-relevance.md) 3.3 節）
- 語彙に無い効果の見込みは [design-stage16.md](design-stage16.md) 10.0.2 節（乱数を起点にする効果）と [requirements.md](requirements.md) 4.2 節（前提）にもある。

### 1.3 設計書（語彙を足すときだけ）

- `plan/design-<短い名前>.md` を起案する。書くのは、足す語彙・既存の語彙との関係・退化の見込み・リスク。
- 設計書と検証記録には同じことを書かない（[design-workflow-simplification-11.md](design-workflow-simplification-11.md) 1 節）。
  - 設計書: 範囲・説明文の分解・語彙・定義の案・退化の見込み・論点・撮って確かめる問い・経過。撮る前の「検証」の節は「撮影は V-NNNN（編成・予測・撮影の依頼はそちら）」と、撮影ごとの狙い 1 行だけにする。撮った後の「決めたこと」（段の設計書の「読んで分かったこと」も）には、次の PR や論点に効く判断と理由だけを書き、読んだ値と形は C-/V- の ID で指す。
  - 検証記録: 編成・混ざる要素・予測・読み方・結果・撮影の依頼。
- オーナーの承認は対話で得てから実装する（設計書だけの PR は出さない）。
- 語彙が足りているなら設計書は作らず、検証記録だけで進める。
- 調査は、キャラ毎か効果毎にまとめる（語彙の家族ごとに段を起こさない）。検証記録 1 本で問いを持ち、語彙を足すときだけ上の設計書を添える。
- 起こした段（[design-skill-stages.md](design-skill-stages.md)）は、その段の設計書のとおりに進めて閉じる。段の中の PR ごとの経過は段の設計書だけに「PR N を実装した（V-NNNN、C-…）。次は …」の 1 行で書き、段の一覧（[design-skill-stages.md](design-skill-stages.md)）の経過には、段ごとに 1 行（起案・決定・閉じた日と段の設計書）を書き、段の出来事のときだけ直す。設計書の経過の書き方は AGENTS.md「文書の書き方」。

### 1.4 実装する

- **語彙を足すとき**。1 段ごとに `npm test` を通す。
  1. `skills/types.ts` の型と、`skills/parse/` の効果の種類ごとのモジュールの検証（入口は `parseSkillDefinition`）、その単体テスト。
  2. 解決（`skills/resolve.ts` ほか）と、共通のフレームループ（`frame/`）。
  3. **既存のテストが数値を変えずに通る**ことを確かめる（退化）。
  4. CLI の表示（`packages/core/scripts/sim-run.ts`）。画面には効果の一覧を出さない（受けているバフとスキルの説明の欄は 2026-10-31 に消した）。
- **定義を書く**
  - `data/skills/{resourceId}.json` と `index.json`。
  - 数値は書かず、`ref` で説明文の値を指す。
  - スロットの対応状況（`support`）は書かない。効果の有無と、未対応（`unimplemented`）の notes の有無から読み込みで決まる（`supported`・`partial`・`unsupported`・`noEffect`。[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）。効果の無いスロットには、理由の notes が要る。
  - いつも満たすとみなした条件は、効果の `assumes` に書く。
  - 説明文の言い回しと語彙の対応は下の表。決まり（欄の条件・組み合わせの制約・既定）は `skills/types.ts` の注記と、表の設計書の節にだけ書く。語彙を足したら、注記に決まりを書き、表に 1 行（言い回し・書き方・例・設計書）足す。

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
    | フルバーストタイム発動中、N 秒ごとに | 周期のきっかけ（`everySeconds`）の damage と `condition.inFullBurst: true` | エイダの S2 | [design-skill-stage15.md](design-skill-stage15.md) 2.3 節 |
    | 最終攻撃力の X% の防御力無視ダメージ（倍率ダメージ） | damage の `damageType: "true"` | エイダの S2・ベスティー：タクティカル・アップの S2 | 同上 |
    | 直前にバーストスキルを使用した基本バースト段階が N の味方全体 | `target: "burstUsers"` と `targetBurstStep`（timed・付与・heal） | エイダの S1 | 同上 |
    | 「〈名前〉」：N 発間維持のチャージ速度▼ | 付与の `durationShotsRef` と中身の `stat: "chargeSpeed"` | エイダの特殊改造 | 同上 |
    | 再発動周期 N 秒（端数を持ち越す）／命中した時に付く（周期の付与の遅れ） | 周期のきっかけの `carry: true`／周期の付与の `delayFrames` | マリアン：クイーンの S1 の槍と弱点露出 | 同 10.2 節の a・d・e |
    | 周期のスキルのヒットから付く▲▼ | 周期のきっかけの timed の `delayFrames` | エーテルの S2 の防御力▼ | V-0602 |
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
    | 「チャージ時間：N 秒固定」（使用武器変更の武器） | `weaponChange` の `chargeTimeFixed: true` | ナユタの記憶燃焼 | 同 2.4 節 |
    | 使用武器変更の「チャージ時間：N 秒」（N が説明文の値） | `weaponChange` の `chargeTimeRef` | マクスウェル：オーディナリーメカニックのバースト | [design-maxwell-om.md](design-maxwell-om.md) 2.1 節 |
    | 〈状態〉の段階別の効果・各段階の効果のみ適用（使用武器変更のチャージ時間） | 段階ごとの `weaponChange` と、条件 `selfState` の `stacks`・`stacksBelow`（N スタック未満） | マクスウェル：オーディナリーメカニックのバーストの過電流 | 同 2.2 節 |
    | 現在のHP X%▼ | 即時効果 `kind: "currentHpDown"`（自分だけ） | 紅蓮の S1 | [design-scarlet.md](design-scarlet.md) 2.1 節 |
    | 自分の HP が X% 以下の場合（発火で付く効果） | timed の `condition.selfHp: { "atMostRef": N }`（即値は `atMost`） | 紅蓮のバースト | 同 2.2 節 |
    | 段階別の効果・下位効果のスタック適用（N 段階：N−1 段階フルスタック状態なら） | 段階ごとの状態の付与（同じきっかけ）と、上の段階の条件 `selfState` の `stacks: "full"`・`sameFiring: true` | クエンシー：エスケープクイーンの S2 | [design-quency-eq.md](design-quency-eq.md) 2 節の論点 3 |
    | 適正最小射程距離 X%▲／フルチャージ攻撃が適正射程距離内の対象に命中した時 | stat `minEffectiveRange`（状態だけの stat）／fullChargeShot の timed の `condition.inEffectiveRange: true` | エード：エージェントバニーの S1・S2・バースト | [design-agent-bunny.md](design-agent-bunny.md) 2.1・2.2 節 |
    | 貫通特化／貫通ダメージ X%▲ | フラグの stat `pierce`（timed・passive（`while` も書ける）・状態の中身）／stat `pierceDamage` | エード：エージェントバニーの S2・バースト | 同 2.3 節 |
    | 使用武器変更の「追加効果：貫通特化」／変更後の武器の 1 発の弾の数（説明文に無く、録画で読む） | `weaponChange` の `pierce: true`／`shotCount` | ツバイのバースト | [design-zwei.md](design-zwei.md) 2.1・2.2 節 |
    | 「N スタック」「N 発間維持」 | timed の `maxStacksRef` と `durationShotsRef` | ツバイの宝物版 S1 | 同 2.3 節 |
    | デバフ効果解除 N 個（味方全体／デバフのかかった味方からランダムに N 機） | `removeDebuff`（`target: "allies"`／`"debuffedRandom"` と `targetCount`） | ココアの S1・バースト | [design-debuff-removal.md](design-debuff-removal.md) 2.2 節・[design-debuff-removal-timed.md](design-debuff-removal-timed.md) 2.1 節 |
    | ペレットの数を 1 個に固定／ペレット数 N 個▲（N 発間維持の貫通特化・命中率▲） | フラグの stat `singlePellet`／stat `pelletCount` と `scaling: "flat"`（どちらも timed の self だけ）／`durationShotsRef` を `hitRate`・`pierce`・`singlePellet` にも書ける | ドロシー：セレンディピティの S1・バースト | [design-dorothy-serendipity.md](design-dorothy-serendipity.md) 2 節 |
    | 〈状態〉が終了した時（残弾数減少・状態の付与） | きっかけ `{ "ended": 〈状態〉 }`（counterChange・ammoDecrease・状態の付与） | グレイブの S1 | [design-grave.md](design-grave.md) 2.1 節 |
    | 〈状態〉：…「最大装弾リロード完了時に解除」 | 状態の付与の `durationUntil: "reloadEnd"` | グレイブの S2 の過熱I | 同 2.2 節 |
    | リロード比率 X%▼ | stat `reloadRatio`（`decrease`） | グレイブの S1 の放熱 | 同 2.3 節 |
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

  - 根拠の結論の ID は、効果と notes の `claims` に書く（3 節）。結論を作ったとき（[verification-guide.md](verification-guide.md) 8 節）に書き足す。解釈の結論を先に `仮説`・等級 `推論` で作って ID を書いてもよい。
  - `checkedAt` は説明文を読んだ日。
- **テスト**
  - DSL の単体テストは `skills/__tests__/<名前>.test.ts`。定義の検証エラーと、Lv ごとの解決値を見る。
  - 編成のテストは `__tests__/<名前>Team.test.ts`。そのキャラを含む実戦的な編成で、そのキャラの効果（窓・発動・付与）と、射撃の列がどのグループにも 1 回ずつ入ること（`partitions every shot`）を見る（`describe.each`。例は `deltaTeam.test.ts`）。
  - **テストに実測値を直書きしない**。実測との比較は観測値と照合ランナーで行う（[verification-guide.md](verification-guide.md) 6・7 節）。
- **キャラ固有の分岐をコアに置かない**。実測でしか決まらない値（紅蓮BS の射撃の較正の `MEASURED_CHARGE_CADENCE` など）は、表の 1 行にして結論の ID を添える。

## 2. 検証の流れ（スキル定義に固有のこと）

- 起案から PR までは [verification-guide.md](verification-guide.md) のとおり。スキルの検証では、話題を `スキル・キャラ固有` にし、問いを「<キャラ> のスキルを <解釈> と読んで、モデルは実測と合うか」にする（解釈が割れる行ごとに仮説を分ける）。
- 既存の録画で確かめられるときは、1.4 の実装の後、既に読んだ観測値か読み直した観測値と比べ、合わない点だけを追加で撮る（読み直しでも確定にできる。紅蓮BS の例は [design-stage11-scarlet-bs.md](design-stage11-scarlet-bs.md) 1 節）。
- 効果が合わなかったときは、根拠のある別の解釈で定義を直すか、未解明のまま効果を定義から外す・スロットを `partial` にして notes に書く。
- PR の題名は `スキル: <キャラ名>（V-NNNN、C-NNNN）`（`records:close` が案を出す）。

## 3. 結論の書き方

- 結論は `records/claims/C-NNNN.json`。話題は `スキル・キャラ固有` にする。
- 1 件に書く解釈は 1 つ（例: 「クラウンの S2 の回復は、HP が満タンでも適用されたことになる」）。1 件で同じスロットの複数の効果を指してよい。
- **効果との対応は定義の側に書く**。効果と notes の `claims` に、根拠の結論の ID を並べる（例: `"claims": ["C-0413", "C-0461"]`）。
  - 正は定義の `claims`。効果を並べ替えたり足したりしても、ID は効果と一緒に動くので古くならない。結論の側からは生成物で引く: [claims.md](claims.md) の「定義」の行と、キャラ × スロットの一覧 [skills.md](skills.md)（どちらも `npm run records:check` で作り直す）。
  - 結論の `model` には、定義のファイル（`data/skills/830.json`）と、定義の外の置き場所（コード・定数）を書く。効果の場所（`skill1 の effects[0]`）は書かなくてよい（書いたときは、下の検査で突き合わせる）。
  - notes にも `claims` を書ける（「ダメージに関係しない」「同じ部隊の味方がいない編成では起きない」などの判断の根拠）。`assumes` は効果の `claims` で指す。
  - 1 つの効果を複数の結論が裏付けてよい（1 tick の値の結論と、tick の時刻の結論など）。
  - notes・assumes の文には、説明に要るとき（値の出どころなど）のほかは ID を書かない。結び付きは `claims` で持つ。
- **検査**（`npm run records:check` と `npm test`。`packages/core/src/records/skills.ts`）
  - `claims` の形（`C-` と 4 桁以上の数字・1 つ以上・重複なし）は、定義の読み込み（`parseSkillDefinition`）で弾く。
  - 指した結論が無い・`棄却` なら落ちる。棄却したら、置き換えた結論の ID に差し替える。
  - `棄却` でない結論の `model` が定義の場所（`skill1 の effects[0]`・`treasureSkills.burst の effects[1]`・`skill1 の notes`・`全スロットの notes`）を書いていれば、その場所が定義にあり、その `claims` がその結論を指していないと落ちる。ファイルだけを書いていれば、そのファイルのどこかの `claims` が指していないと落ちる。
  - `claims` の無い効果は落とさない（Stage 11 までの定義。0 節）。skills.md に「根拠なし」と出る。
- 説明文をそのまま読んだだけの効果（倍率・秒数・トリガー・対象が一意なもの）は、1 件にまとめてよい（例: 「<キャラ> の burst の効果は説明文どおり」）。この場合も撮影で確かめてから `確定` にする（0 節）。

## 4. PR の前の確かめ

- [ ] 説明文の全行が、定義の効果か notes のどちらかに入っている
- [ ] 効果の `assumes` と、notes の種類（`kind`）が実態と合っている（[skills.md](skills.md) の対応状況が意図どおり）
- [ ] 定義のどの効果にも `claims` がある（[skills.md](skills.md) のそのキャラに「根拠なし」の効果が残っていない）
- [ ] 既存のテストの数値が変わっていない（変わったなら、その理由と根拠の ID を PR に書く）
- [ ] 実戦的な編成で、そのキャラの効果が意図どおりに出るテストがある
- 結論の根拠・等級・`decidedOn`・本文の節・最小構成の警告・生成物は `npm run records:close -- V-NNNN --mark` が、CI と同じ確認は `npm run pr:prep` が見る（[verification-guide.md](verification-guide.md) 9 節）。最小構成の警告で落ちたら、効かない理由を結論の `minimal` に印として書くか、仮説にする（[design-minimal-relevance.md](design-minimal-relevance.md) 11.3 節）
