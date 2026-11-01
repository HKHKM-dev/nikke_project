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
- オーナーの承認は対話で得てから実装する（設計書だけの PR は出さない）。
- 語彙が足りているなら設計書は作らず、検証記録だけで進める。
- 調査は、キャラ毎か効果毎にまとめる（語彙の家族ごとに段を起こさない）。検証記録 1 本で問いを持ち、語彙を足すときだけ上の設計書を添える。
- 起こした段（[design-skill-stages.md](design-skill-stages.md)）は、その段の設計書のとおりに進めて閉じる。段の中の PR ごとの経過は段の設計書だけに「PR N を実装した（V-NNNN、C-…）。次は …」の 1 行で書き、段の一覧（[design-skill-stages.md](design-skill-stages.md)）の経過には、段ごとに 1 行（起案・決定・閉じた日と段の設計書）を書き、段の出来事のときだけ直す。設計書の「読んで分かったこと」には、次の PR や論点に効く判断だけを書き、結論の中身は ID で指す。設計書の経過の書き方は AGENTS.md「文書の書き方」。

### 1.4 実装する

- **語彙を足すとき**。1 段ごとに `npm test` を通す。
  1. `skills/types.ts` の型と `parseSkillDefinition` の検証、その単体テスト。
  2. 解決（`skills/resolve.ts` ほか）と、共通のフレームループ（`frame/`）。
  3. **既存のテストが数値を変えずに通る**ことを確かめる（退化）。
  4. CLI の表示（`packages/core/scripts/sim-run.ts`）。画面には効果の一覧を出さない（受けているバフとスキルの説明の欄は 2026-10-31 に消した）。
- **定義を書く**
  - `data/skills/{resourceId}.json` と `index.json`。
  - 数値は書かず、`ref` で説明文の値を指す。
  - スロットの対応状況（`support`）は書かない。効果の有無と、未対応（`unimplemented`）の notes の有無から読み込みで決まる（`supported`・`partial`・`unsupported`・`noEffect`。[design-skill-note-kinds.md](design-skill-note-kinds.md) 2.2 節）。効果の無いスロットには、理由の notes が要る。
  - いつも満たすとみなした条件は、効果の `assumes` に書く。
  - 説明文の言い回しと語彙の対応は下の表。欄の条件・組み合わせの制約・既定は `skills/types.ts` の注記と、表の設計書の節にある（ここには書き写さない）。語彙を足したら、表に 1 行足す。

    <!-- prettier-ignore -->
    | 言い回し | 書き方 | 決まり・例 | 設計書 |
    | --- | --- | --- | --- |
    | スキル発動者の最終最大HP の X% 分の攻撃力▲ | `scaling: "casterFinalMaxHp"` | 例: ラプラス：アルティメットヒーローの S1 | [design-skill-stage6.md](design-skill-stage6.md) |
    | 自分の HP が X% 以上なら | `condition.selfHp: { "atLeastRef": N }`（説明文に即値で書かれた X は `{ "atLeast": X }`） | HP は被弾で減りうるので `assumes` で決めない（[design-skill-catalog.md](design-skill-catalog.md) の論点 12）。例: ノワールの S1 | 同上 |
    | 最大HP▲ | `stat: "maxHp"` | 「最大HP のみ▲」は形を足すまで notes のまま（`definitions.test.ts` が見張る）。例: シンデレラの美しさ | 同上 |
    | デコイ・デコイが存在する時 | 目録の `decoy`・`condition.selfState: "decoy"` | — | 同上 |
    | 自分と自分より最終防御力が低い味方 | `target: "allies"` と `targetDefense: "lowerThanSelf"` | 読む側の印 `reads: ["defense"]` も書く。例: アニス：スターの S2 | [design-skill-stage7.md](design-skill-stage7.md) |
    | 防御力▲ | `stat: "defense"` | 効果にするのは、比べの自分の側と、読む側と組む録画が読み直せたものだけ。ほかは間接の notes（段 7 の論点 4）。例: デルタの S2 | 同上 |
    | 〈クラス〉型の味方 | `targetClass` | 例: エヌ：ミラクルフェアリーの S1・バースト | [design-skill-stage9.md](design-skill-stage9.md) |
    | 残りの HP の割合が最も低い味方 N 機 | `target: "lowestHpRatio"` と `targetCount`（`targetCountRef`） | 被弾した味方が選ばれうることを `assumes` に書く。例: ミサトの S1 | [design-skill-stage8.md](design-skill-stage8.md) |
    | 「〈名前〉」：機能…・〜状態の味方 | 状態の付与 `kind: "state"` と `contents`。名前は目録（`skills/states.ts`）の id | 目録に無い状態は id を足す（英語版の状態名の lowerCamelCase）。ほかから参照されない名前も付与で書く（[design-skill-catalog.md](design-skill-catalog.md) の論点 4） | [design-named-state.md](design-named-state.md) 5 節・[design-skill-stage1.md](design-skill-stage1.md) 1.4 節 |
    | 自分が〈状態〉なら・でなければ／解除不可 | `condition.selfState`／付与の `undispellable: true` | — | [design-skill-stage1.md](design-skill-stage1.md) 1.1・1.3 節 |
    | 〈名前〉解除／直前に自分がバーストを使用していれば | `kind: "removeState"`／`condition.usedBurst: true` | 例: マナの S2 | 同 1.2・1.4・1.5 節 |
    | 〈名前〉のスタック量 N 個▲ | `kind: "stackChange"` | — | [design-skill-stage3.md](design-skill-stage3.md) 1.1 節 |
    | フルバーストタイム持続中に N 回／窓の外の発も数え、付くのは窓の中だけ | 回数のきっかけの `during: "fullBurst"` と `reset`／`firesDuring: "fullBurst"` | 例: ソーダ：トゥインクルバニーの S1 | 同 1.2・1.6 節 |
    | 〈名前〉のフルスタック状態の時、スタック解除後（回復） | トリガー `{ "fullStack": "<id>" }` | 例: クラウンの S2 | 同 1.3 節 |
    | 自分が武器変更状態の場合、通常攻撃が N 回命中した時 | 回数のきっかけの `firesDuring: "weaponChange"` | 命中は変更の外の発も数え、出るのは使用武器の変更の発だけ（H1）。例: モランの S1 | [design-skill-stage11.md](design-skill-stage11.md) 2.3・3.3 節 |
    | 〈名前〉：バーストスキルクールタイム X 秒▼（持続・維持の付いた形。T4） | 状態の中身（か timed）の `stat: "burstCooldown"`・`scaling: "flat"` | 値は縮める秒で、効いている間に使ったバーストの CT と、付いた時に走っている CT（同じ発動から付いたものも）を縮める。即時の CT▼ は `cooldownReduction`。例: モランの宝物版 S1 の熱血・ミルクの宝物版 S1・ティアの S1 | 同 3.3 節・[design-skill-stage15.md](design-skill-stage15.md) 2.2 節 |
    | 遮蔽物の HP を回復した時／遮蔽物 HP 回復 | timed のきっかけ `{ "coverHealed": true }`／`kind: "coverHeal"`（対象は `self` だけ） | 読み込みが、同じ定義のただ 1 つの `coverHeal` のきっかけに置き換える。味方の遮蔽物 HP 回復は間接の notes（読む側に `reads: ["cover"]`）。例: ティアの S1・S2 | [design-skill-stage15.md](design-skill-stage15.md) 2.2 節 |
    | 〈名前〉が適用される時・適用された時／〈名前〉：弾丸チャージ X% | トリガー `{ "applied": "<id>" }`／即時効果と、維持 0 秒の付与 | 例: トーブの宝物版 S1 | [design-skill-stage4.md](design-skill-stage4.md) 1.1・1.2 節 |
    | 自分がバリア適用状態なら／バリア・共用バリア | `condition.selfState: "barrier"`／付与の `state: "barrier"` | 例: ラムのバースト・アスカの S2 | [design-skill-stage5.md](design-skill-stage5.md) 1.1・1.2 節 |
    | 自分と〈状態〉の味方 | `targetState` と `includeSelf: true` | 家族の根を指せば家族のどれにも当たる。例: ラプンツェル：サンクチュアリの「自分と臨戦状態の味方」 | [design-new-chars-1029.md](design-new-chars-1029.md) 5.1・8 節 |
    | N 回順番に攻撃（バースト以外）／順番攻撃ダメージ X%▲ | damage の `hitsRef`・`hitIntervalFrames`／stat `sequentialAttackDamage` | 例: マリアン：クイーンの S1・S2 | 同 5.2・5.5 節 |
    | 〈状態〉再発動周期 N 秒▼／バーストを使用した時、〈スキル〉の発動間隔 N 秒▼（N 秒間維持） | 周期の damage の `periodShorten`（`state`／名前の無い窓 `window: { "trigger": "burstUse", "durationRef": N }`） | 状態は、前の発動の時点で状態があり、縮めた次の発動まで続くときだけ縮む。窓は、縮めた次の発動が窓の中なら縮む（前の発動は見ない。`gaugePerHit` とは組めない）。例: マリアン：クイーンの S2・エイダの S2 | 同 5.3 節・10.2 節の f・[design-skill-stage15.md](design-skill-stage15.md) 2.3 節 |
    | フルバーストタイム発動中、N 秒ごとに | 周期のきっかけ（`everySeconds`）の damage と `condition.inFullBurst: true` | 周期は戦闘開始から数え続け、窓の中の回だけ出る（窓ごとに数え直さない）。例: エイダの S2 | [design-skill-stage15.md](design-skill-stage15.md) 2.3 節 |
    | 最終攻撃力の X% の防御力無視ダメージ（倍率ダメージ） | damage の `damageType: "true"` | 防御力を引かず、防御力無視ダメージ▲を攻撃ダメージ▲と同じ和に足す。射撃ごとの damage（フルチャージごとなど）は通常攻撃に畳み込まず、倍率ダメージのヒットとして出す。例: エイダの S2・ベスティー：タクティカル・アップの S2 | 同上 |
    | 直前にバーストスキルを使用した基本バースト段階が N の味方全体 | `target: "burstUsers"` と `targetBurstStep`（timed・付与・heal） | 例: エイダの S1 | 同上 |
    | 「〈名前〉」：N 発間維持のチャージ速度▼ | 付与の `durationShotsRef` と中身の `stat: "chargeSpeed"` | 射撃に効く stat のうち、発数の維持はチャージ速度だけ書ける。溜めの途中で付いても、それまでに溜めたフレームは残る。例: エイダの特殊改造 | 同上 |
    | 再発動周期 N 秒（端数を持ち越す）／命中した時に付く（周期の付与の遅れ） | 周期のきっかけの `carry: true`／周期の付与の `delayFrames` | `hitsRef` の damage は N ヒットとも発動の時点のバフ。例: マリアン：クイーンの S1 の槍と弱点露出 | 同 10.2 節の a・d・e |
    | 周期のスキルのヒットから付く▲▼ | 周期のきっかけの timed の `delayFrames` | 窓を周期の発火の d 後から始める。ヒットそのものに乗らないなら、ヒットの遅れ + 1。1 パス目で窓を追う stat（攻撃力・射撃に効く stat など）には書けない。例: エーテルの S2 の防御力▼ | V-0602 |
    | コア命中ダメージ | damage の `coreHit: true` | 例: マリアン：クイーンの S2 | 同 5.4 節 |
    | マシンガン立ち上げ速度 X%▲ | stat `spinUpSpeed` | 例: マリアン：クイーンのバースト | 同 5.6 節 |
    | 通常攻撃が N 回クリティカル命中した時／自分が使用武器変更状態でなければ | 回数の種類 `critHit`／回数のきっかけの `firesOutside: "weaponChange"` | 例: 紅蓮：神殺の S2 | 同 5.7 節 |
    | N 秒ごとに〈カウンタ〉N%▼／〈カウンタ〉の N% 以上の時（下位効果のスタック適用） | `counterChange` の時間の周期のきっかけ（`{ "everySeconds": N, "carry": true }`・`decrease`）／`passive` の `while.selfCounter`（閾値ごとに 1 つ） | 周期は戦闘開始から数える。閾値ごとに別々に付くので、高い段階では下位の効果も乗る。例: 千束の S1 の超感覚 | [design-skill-stage16.md](design-skill-stage16.md) 2.1 節 |
    | 防御力無視バーストスキルダメージ | burstDamage の `damageType: "true"` | 式は倍率ダメージの防御力無視ダメージと同じ。同じ発動の防御力無視ダメージ▲が乗るかは、着地点の表（`burst/landing.ts`）の `sameActivationBuffsOnHit`。例: ベスティー：タクティカル・アップのバースト | [design-skill-stage16.md](design-skill-stage16.md) 2.2 節 |
    | 最大弾数のリロードが完了した時、〈状態〉解除／自分が〈状態〉でない時（その状態の付与の条件） | `removeState` のきっかけ `{ "reloadEnd": true }`（removeState にだけ書ける）／付与の `condition.selfState: { "state": 〈状態〉, "present": false }`（自分の状態を見る付与は `present: false` だけ） | 例: ベスティー：タクティカル・アップの S1 のミサイルガイド | 同上 |
    | 対象に「〈名前〉：…」「N スタック」（敵に付く状態のスタック）／スキル発動者基準で防御力 X%▼ | 付与の `target: "enemy"` と `maxStacksRef`／中身の `stat: "enemyDefenseDown"`・`scaling: "casterDefence"` | 発動者基準の▼は、発動者のバフ前防御力 × X% を 1 スタックごとに敵の防御力から引き、割合の▼の後に 0 で止める（順と 0 で止めるのは未確定）。例: マストの S1 の海風 | [design-mast.md](design-mast.md) 2.1・2.2 節 |
    | 〈状態〉の対象に「最終攻撃力の X% のダメージ」「〈状態〉スタックコピー」「1 秒間隔」 | dot の `stacksFrom: { enemyState }`（元は dot か、敵にスタックで付く状態の付与）と `sustained: false` | 付けた時に 1 回写す（`copyEachTick` は tick ごとに写し直す仮説の形）。「持続ダメージ」でない周期のダメージは持続ダメージ▲を掛けない。例: マストのバーストの暴風 | [design-mast.md](design-mast.md) 2.3 節 |
    | 自分の HP が X% 以下である限り | timed のきっかけ `{ "selfHpAtMostRef": N }` と `durationUntil: "selfHpAbove"` | HP の割合は枠の想定を最大HP▲・最大HP のみ▲ の件で下げた値で、同じフレームに付いた件は次のフレームから。回復で HP が戻る分は扱わない。例: マストの S1（バーストの最大HP のみ▲ の間） | [design-mast.md](design-mast.md) 8 節 |
    | 〈カウンタ〉が 100% になった時、〈状態〉（解除条件：〈カウンタ〉が 0% になった時） | 付与のきっかけ `{ "counterFull": 〈カウンタ〉 }` と `durationUntil: { "counterEmpty": 〈カウンタ〉 }`（同じカウンタで組む。自分にだけ・スタックなし） | 付くのは届いたフレームの次、外れるのは 0 に届いたフレームの次（解除不可でも外れる）。例: アークレンジャー・ブラックの変身 | [design-skill-stage19.md](design-skill-stage19.md) 2.1 節 |
    | 〈状態〉の間、N 秒間隔で〈カウンタ〉N%▼／〈状態〉の後、〈カウンタ〉N%▼ | `counterChange` の周期のきっかけ `{ "everySeconds": N, "carry": true, "since": { "applied": 〈状態〉 } }`／`counterChange` のきっかけ `{ "applied": 〈状態〉 }` | 周期は状態の付いたフレームから数え、外れたら止まる。どちらも、その状態を自分に付ける付与が同じ定義に要る | 同上 |
    | 〈状態〉が適用された時、〈状態〉解除までの持続ダメージ | dot のきっかけ `{ "applied": 〈状態〉 }` と `durationUntil: { "stateEnd": 〈状態〉 }`（同じ状態で組む） | 付いたフレームを含む自分の件の終わりまで tick を出す。ゲージ・敵の状態・スタック・条件とは組めない | 同上 |
    | 『バースト〈段階〉で使用時：〈モード〉』／バーストスキルクールタイム X 秒▼「戦闘中 1 回発動」 | burstUse の効果の `condition.burstStep`（モードの名前は維持 0 秒の付与）／`cooldownReduction` の `maxFires: 1` | burstStep は全段階（AllStep）のキャラだけ（`definitions.test.ts`）。全段階の枠は CT が明けていれば同じチェーンで撃ち直す。例: レッドフードのバースト | [design-red-hood.md](design-red-hood.md) 2.1〜2.3 節・7.1 節 |
    | チャージ速度 100% を超えた場合、超過した値をチャージダメージに変換・超過した値の X% のチャージダメージ▲ | passive の stat `chargeSpeedOverflow`（`self` だけ） | フルチャージの発で、チャージ速度▲の比率の和の 1 を超えた分 × X をチャージダメージ▲に足す。例: レッドフードの S1 | 同 2.4 節 |
    | 使用武器変更の解放の長さ・装弾数無限（説明文に無く、録画で読む） | `weaponChange` の `chargeReleaseSeconds`・`infiniteAmmo` | 解放の秒の端数は射手が発ごとに持ち越す。確かめたのはチャージが 0 のときだけ。例: レッドフードのレッドウルフ | 同 7.1 節の論点 10・11 |

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
