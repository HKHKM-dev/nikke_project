// スキルの効果の分類の一覧（生成物 plan/skill-catalog.md。plan/design-skill-catalog.md の論点 2）: skills/catalog.ts の読みを、
// 分類ごとの件数・キャラ・いまの語彙で書けるか（区分。本体 1 節）の表にする。3〜7 節の番号は分類の別紙
// （plan/design-skill-catalog-classes.md）の節と同じ。区分の付け方（どの分類が語彙あり・語彙なしか）はこのファイルの表で持つ。
import type { CatalogEffect, CatalogLine } from './catalog.ts';
import { NAMED_STATES } from './states.ts';

/** 区分（本体 1 節） */
type Status = 'ok' | 'gap' | 'indirect' | 'premise' | 'damaged' | 'oos' | 'nodmg' | 'check';
const ST: Record<Status, string> = {
  ok: '語彙あり',
  gap: '語彙なし',
  indirect: '間接に効く',
  premise: '前提で決まる',
  damaged: '被弾で効く',
  oos: '前提の外（構造）',
  nodmg: '計算に無関係',
  check: '要確認',
};
const ST_KEYS: readonly Status[] = ['ok', 'gap', 'indirect', 'premise', 'damaged', 'oos', 'nodmg', 'check'];

/** 表の名前・区分・語彙。区分が null の stat は statStatus が側と向きで決める */
type Info = readonly [label: string, status: Status, vocab?: string];

const STAT_INFO: Record<string, readonly [label: string, status: Status | null, vocab: string]> = {
  attack: ['攻撃力', 'ok', 'passive・timed の attack'],
  attackDamage: ['攻撃ダメージ', 'ok', 'attackDamage'],
  critRate: ['クリティカル確率', 'ok', 'critRate'],
  critDamage: ['クリティカルダメージ', 'ok', 'critDamage'],
  normalCritRate: ['通常攻撃のクリティカル確率', 'ok', 'normalCritRate'],
  chargeDamage: ['チャージダメージ', 'ok', 'chargeDamage'],
  chargeDamageMultiplier: ['チャージダメージ倍率', 'ok', 'chargeDamageMultiplier'],
  distributedDamage: ['分配ダメージ', 'ok', 'distributedDamage'],
  sustainedDamage: ['持続ダメージ', 'ok', 'sustainedDamage'],
  trueDamage: ['防御力無視ダメージ', 'ok', 'trueDamage'],
  elementDamage: ['有利コードの攻撃ダメージ', 'ok', 'elementDamage'],
  coreDamage: ['コアダメージ', 'ok', 'coreDamage'],
  projectileExplosionDamage: ['発射体爆発ダメージ', 'ok', 'projectileExplosionDamage'],
  normalAttackDamage: ['通常攻撃ダメージ倍率', 'ok', 'normalAttackDamage'],
  damageTaken: ['受けるダメージ', null, '敵▲は damageTaken。味方の▼は防御系'],
  maxAmmo: ['最大装弾数', 'ok', 'maxAmmo'],
  reloadSpeed: ['リロード速度', 'ok', 'reloadSpeed'],
  chargeSpeed: ['チャージ速度', 'ok', 'chargeSpeed'],
  chargeTime: ['チャージ時間（秒）', 'ok', 'chargeSpeed の flat・fixedChargeTime'],
  hitRate: ['命中率', null, '味方▲は hitRate。敵▼は敵の命中'],
  burstGaugeSpeed: [
    'バーストゲージのチャージ速度',
    null,
    'burstGaugeSpeed（2 段目の段 1 で timed・状態の中身にも）。アニス：スター S1 の味方の分は allyGaugeAdd（1 回ごとに足す形）',
  ],
  defense: ['防御力', null, '味方▲は防御系。敵▼は enemyDefenseDown（2 段目の段 2）'],
  maxHp: ['最大HP', 'indirect', 'HP の経路（HP 基準の攻撃力▲・ダメージ、HP の割合、HP 順の対象、バリアの量）'],
  pierceDamage: ['貫通ダメージ', 'gap', 'なし（貫通特化の発に乗る。ツールチップ T2。敵 1 体で乗るかは撮って確かめる）'],
  explosionRange: ['爆発範囲', 'check', 'なし（式に無い。コアの割合への効きは未確認）'],
  partsDamage: ['パーツダメージ', 'oos', 'なし（パーツの無い的）'],
  interruptPartDamage: ['阻止部位の攻撃ダメージ', 'oos', 'なし（阻止部位の無い的）'],
  attackSpeed: ['攻撃速度', 'ok', 'attackSpeed（AR・SMG・SG の発と発の間。2 段目の段 9 の PR 2）'],
  // 2 段目の段 12 の PR 2: 付着のヒット（damage の projectileStick。ラピ：レッドフードの粘着榴弾）にだけ掛ける
  projectileStickDamage: [
    '発射体付着ダメージ',
    'ok',
    'projectileStickDamage（damage の projectileStick のヒットにだけ）',
  ],
  sequentialAttackDamage: ['順番攻撃ダメージ', 'ok', 'sequentialAttackDamage'],
  pelletCount: [
    'ペレット数',
    'indirect',
    '1 発の総ダメージは変わらない（ツールチップ T3）。当たったペレットを数えるきっかけを早める',
  ],
  range: ['適正射程距離', 'gap', 'なし（距離ボーナスの乗る範囲を広げる。ツールチップ T6）'],
  spinUp: ['マシンガン立ち上げ速度', 'ok', 'spinUpSpeed（MG のレートの上がり幅。読みは仮説）'],
  currentHp: ['現在のHP', 'indirect', 'HP の経路（HP の条件・失った HP の値を動かす）'],
  pierceRange: ['貫通範囲', 'oos', 'なし'],
  damageTakenFromElement: ['〈コード〉の敵から受けるダメージ', 'damaged', '被弾の経路'],
  burstDamageByTargetText: ['対象の書き方で絞ったバーストスキルダメージ', 'gap', 'なし'],
  projectileTargetDamage: ['敵の発射体へのダメージ', 'oos', 'なし'],
  healReceived: ['受けるHP回復量', 'indirect', 'HP の経路（HP が満タンでない時の回復量）'],
  healGiven: ['与えるHP回復量', 'indirect', 'HP の経路（HP が満タンでない時の回復量）'],
  barrierHp: ['次のバリアのHP', 'damaged', 'バリアの HP（壊れるまでの長さ）'],
  barrierDamage: ['バリアに与えるダメージ', 'oos', '敵のバリア（射撃場の的に無い）'],
  stateDuration: ['状態の維持時間', 'gap', 'なし（別の状態の維持を延ばす）'],
  stateParam: ['状態の中身の値', 'gap', 'なし（別の状態の中身を変える）'],
};

const KIND_INFO: Record<string, Info> = {
  'damage:skill': ['倍率ダメージ（ダメージ）', 'ok', 'damage・burstDamage（skill）'],
  'damage:additional': ['追加ダメージ', 'ok', 'damage（additional）'],
  'damage:distributed': ['分配ダメージ', 'ok', 'damage・burstDamage（distributed）'],
  'damage:burst': ['バーストスキルダメージ', 'ok', 'burstDamage・damage'],
  'damage:dot': ['持続ダメージ', 'ok', 'dot'],
  'damage:true': ['防御力無視ダメージ（倍率ダメージ）', 'gap', 'なし（weaponChange の trueDamage だけ）'],
  'damage:burstTrue': ['防御力無視のバーストスキルダメージ', 'gap', 'なし'],
  'damage:core': ['コア命中ダメージ', 'ok', 'damage の coreHit'],
  'damage:fixed': ['固定ダメージ', 'gap', 'なし'],
  'damage:hpScaled': ['最大HP を足した倍率ダメージ', 'gap', 'なし'],
  'damage:accumulate': ['蓄積して爆発するダメージ', 'gap', 'なし'],
  'heal:instant': ['回復（1 回）', 'ok', 'heal'],
  'heal:intervalForm': [
    '回復（間隔・維持の付いた形）',
    'ok',
    'heal + 維持（付いた時の 1 回だけ healed。ツールチップ「回復効果が適用された時」で D-a）',
  ],
  'heal:overTime': ['持続回復', 'ok', '同上'],
  'heal:lifesteal': ['吸収回復（攻撃ダメージの X% 回復）', 'ok', 'heal + durationRef（C-0082）'],
  'heal:barrier': ['バリアの HP 回復', 'damaged', 'バリアの HP（壊れるまでの長さ）'],
  'heal:decoy': ['デコイの回復', 'damaged', 'デコイの HP'],
  'heal:revive': ['復活', 'oos', '倒れない前提'],
  'heal:overflowStore': ['超過回復量の保存', 'damaged', 'HP が減った時に放出'],
  'heal:share': ['回復の均等分配', 'damaged', 'HP が減った時'],
  'heal:accumulated': ['蓄積した回復の放出', 'gap', 'なし（回復効果と判定される。ツールチップ「蓄積量に応じた回復」）'],
  'shield:barrier': ['バリア', 'indirect', 'バリアの経路（バリア適用状態の条件・きっかけ）'],
  'shield:invincible': ['無敵', 'damaged', '被弾の経路'],
  'shield:undying': ['不屈', 'damaged', '被弾の経路'],
  'shield:untargetable': ['単一攻撃の対象から除外（隠れ身など）', 'damaged', '被弾の経路'],
  'shield:decoy': ['デコイ（分身）', 'indirect', 'デコイの経路（デコイが存在する時の条件）'],
  'shield:damageShare': ['受けるダメージの分配', 'damaged', '被弾の経路'],
  'control:selfTaunt': [
    'ヘイト（自分に敵全体を挑発）',
    'damaged',
    '誰が撃たれるか（被弾の経路）。付けたときのゲージはキャラごと（C-0505）',
  ],
  'control:taunt': [
    '挑発',
    'damaged',
    '誰が撃たれるか（被弾の経路）。付けたときのゲージはキャラごと（C-0422・C-0480・C-0506）',
  ],
  'control:stun': ['気絶', 'damaged', '敵の行動（被弾の経路）'],
  'control:move': ['移動不可・強制移動', 'oos', '静止した的'],
  'control:lockOn': ['ロックオン', 'check', '他の効果の対象・条件になる'],
  'control:mark': ['対象の指定（警戒対象など）', 'check', '他の効果の対象・条件になる'],
  'buffOp:dispel': ['バフ・デバフ効果の解除', 'check', '自分に付く▼（デバフ）を外しうる。解除不可は外れない'],
  'buffOp:immunity': ['効果の免疫', 'check', '自分に付く▼（デバフ）を防ぎうる'],
  'buffOp:nullify': ['増減効果の無効', 'gap', 'なし（チャージ速度の増減を無効にする等）'],
  'buffOp:copy': ['スタックのコピー', 'gap', 'なし'],
  'buffOp:stackChange': ['スタック量の増減', 'ok', 'stackChange（増加と decrease の減少。2 段目の段 3）'],
  'instant:ammoRefill': ['弾丸チャージ', 'ok', 'ammoRefill'],
  'instant:forceReload': ['強制リロード', 'gap', 'なし'],
  'instant:ammoDrain': [
    '残弾数の減少',
    'ok',
    'ammoDecrease（自分。いまは使用武器の変更の終わりのきっかけだけ。2 段目の段 11）',
  ],
  'instant:burstGauge': ['バーストゲージのチャージ', 'ok', 'burstGauge'],
  'instant:burstCooldown': [
    'バーストスキルクールタイム▼（即時。いま残っているクールタイムを減らす）',
    'ok',
    'cooldownReduction',
  ],
  'instant:burstCooldownUp': ['バーストスキルクールタイム▲（即時）', 'gap', 'なし'],
  'instant:skillCooldown': ['スキルのクールタイム・周期の変更（即時）', 'gap', 'なし（周期のトリガーは即値）'],
  // ツールチップ「クールタイム」（T4）: 維持やスタックの付いた増減は、その間スキル自体のクールタイムを変える。即時の増減とは別の効果
  'sustained:cooldown': [
    'クールタイムの増減（維持の付いた形。その間スキル自体のクールタイムを変える。T4）',
    'check',
    '状態の中身の stat burstCooldown（バーストの CT を縮める秒。scaling flat だけ。モランの宝物版の熱血。2 段目の段 11・C-0706）だけ',
  ],
  'instant:forceSkill': ['スキルの強制使用', 'gap', 'なし'],
  // 2 段目の段 12 の PR 2: cycle の無いスロットの射撃の回数のきっかけの N▼（decreaseRef。ラピ：レッドフードのバースト III）も
  'cycle:every': [
    '回数条件の変更',
    'ok',
    'cycleEvery（段の循環の間隔は every、cycle の無いスロットの射撃の回数のきっかけの N▼ は decreaseRef）',
  ],
  'fullBurst:extend': ['フルバーストタイム延長', 'gap', 'なし'],
  'fullBurst:shorten': ['フルバーストタイム短縮', 'gap', 'なし'],
  'burst:reentry': ['バースト再突入', 'ok', 'burstReentry'],
  // 2 段目の段 12 の PR 3: 編成で決まる静的な形（ラピ：レッドフードの戦闘補助）
  'burst:changeStep': [
    'バースト段階の変更',
    'ok',
    'burstStepChange（編成の条件 burstStepMix で付く静的な形。差し替えた段はチェーンにだけ効く）',
  ],
  weaponChange: ['使用武器変更', 'ok', 'weaponChange（項目による）'],
  'weaponChange:pierce': ['貫通特化', 'indirect', '貫通ダメージ▲を読む側にする状態（ツールチップ T2）'],
  autoAttack: ['自動攻撃・召喚・独自の弾', 'check', 'autoAttack（形による）'],
  'flag:trueDamageConversion': ['通常攻撃を防御力無視ダメージに', 'ok', 'trueDamageConversion'],
  // 2 段目の段 12 の PR 2: 自分に付く常時の形（ラピ：レッドフードの S2・シュガーの宝物版の S1）
  'flag:elementAdvantage': [
    '有利コードのダメージを適用',
    'ok',
    'passive の stat elementAdvantage（自分。どのコードの敵かは enemyElement）',
  ],
  'flag:infiniteAmmo': ['装弾数無限', 'ok', 'infiniteAmmo'],
  'stat:fixed': ['値の固定（〜に固定）', 'check', 'チャージ時間は fixedChargeTime。ほかはなし'],
  'stat:overflowConvert': ['超過した値の変換', 'gap', 'なし'],
  resource: ['キャラ固有のカウンタ（MP・ゲージ・弾倉など）', 'gap', 'なし'],
  'state:grant': ['名前の付いた状態の付与（名前・中身）', 'ok', 'state（目録の id）'],
  'state:grant?': ['名前だけの付与（状態・仕組み）', 'check', 'state か、仕組みごとの語彙'],
  'state:remove': [
    '状態・スタックの解除（同じスキルが外す。解除不可の状態は外さない読み）',
    'ok',
    'removeState（自分の状態。2 段目の段 1。味方の状態はなし）',
  ],
  'state:cancel': [
    '状態の消去（同じスキルが外す。解除不可の状態も外す）',
    'gap',
    'なし（解除とは別の語彙。本体の論点 8）',
  ],
  'state:switch': ['状態の変化（A が B に変化）', 'gap', 'なし（後の拡張 group）'],
  'state:block': ['発動不可', 'gap', 'なし'],
  'state:extra': ['状態の間の追加効果', 'gap', 'なし（後の拡張 while）'],
  cover: ['遮蔽物', 'damaged', '遮蔽物の HP（被弾の経路）'],
};

const TRIG_INFO: Record<string, Info> = {
  battleStart: ['戦闘開始時', 'ok'],
  fullBurstStart: ['フルバーストタイム発動時', 'ok'],
  fullBurstEnd: ['フルバーストタイム終了時', 'ok'],
  burstUse: ['バーストスキル使用時（回数の段を含む）', 'ok'],
  burstStageEnter: ['バースト N 段階突入時', 'ok'],
  fullChargeShot: ['フルチャージして攻撃した時', 'ok'],
  fullChargeHit: ['フルチャージ攻撃が命中した時（fullChargeShot で書き、命中を仮定）', 'ok'],
  normalShot: ['通常攻撃で N 回攻撃した時', 'ok'],
  normalHit: ['通常攻撃が N 回命中した時', 'ok'],
  coreHit: ['コアに命中した時', 'ok'],
  pelletHit: ['ペレットが命中した時', 'ok'],
  lastShot: ['最後の弾丸', 'ok'],
  timer: ['N 秒ごと', 'ok'],
  specificTiming: ['特定のタイミング（フルバースト終了・バースト 3 段階突入・敵の出現。ツールチップ T5）', 'gap'],
  healed: ['回復効果が適用された時', 'ok'],
  chance: ['確率', 'check'],
  stateApplied: ['〈状態〉が適用された時', 'check'],
  stateEnded: ['〈状態〉が終了した時', 'gap'],
  critHit: ['クリティカル命中した時', 'ok'],
  chargeHold: ['フルチャージを N 秒以上維持した時', 'gap'],
  partialChargeShot: ['フルチャージでない通常攻撃', 'gap'],
  reloadComplete: ['リロード完了時', 'gap'],
  teamAmmo: ['味方の消費した弾の合計', 'gap'],
  fullStackConsume: [
    'フルスタックでスタック解除後',
    'ok',
    'トリガー { fullStack }（回復と使用武器の変更。2 段目の段 3・段 11）',
  ],
  resourceEvent: [
    '固有のカウンタの出来事',
    'check',
    'カウンタが最大になった時の { counterFull }（counterChange のきっかけ。2 段目の段 11）だけ',
  ],
  skillEvent: ['ほかのスキルの発動・命中', 'gap'],
  limited: ['戦闘中 N 回', 'gap'],
  damaged: ['攻撃を受けた時', 'damaged'],
  kill: ['敵を倒した時', 'oos'],
  allyDown: ['戦闘不能時', 'oos'],
  parts: ['パーツ・発射体の破壊・命中', 'oos'],
  enemySpawn: ['敵の出現・数', 'oos'],
  hpThreshold: ['HP が閾値を越えた時（HP の経路の読む側）', 'indirect'],
  coverHealed: ['遮蔽物の HP を回復した時（壊れていない遮蔽物への回復で起きる。ツールチップ）', 'gap'],
  multiHit: ['N 機以上に同時に命中', 'oos'],
  enemyEvent: ['ターゲットの出現', 'ok', 'battleStart（射撃場の的は戦闘の始めからいるターゲットとみなす。V-0504）'],
  decoyPresent: ['デコイが存在する時（デコイの経路の読む側）', 'indirect'],
  barrierApplied: ['バリア適用時（バリアの経路の読む側）', 'indirect'],
  'implicit:burstUse': ['（バーストのスロットで書かれていない＝バースト使用時）', 'ok'],
  'implicit:passive': ['（スキルのスロットで書かれていない・持続＝常時）', 'ok'],
  'implicit:active': [
    '（スキルのスロットで書かれていない・維持やダメージ＝CT ごとのアクティブ。周期は everySeconds で、値はキャラごとに録画で読む）',
    'ok',
  ],
};

const COND_INFO: Record<string, Info> = {
  focus: ['フォーカス状態なら（操作キャラ。ツールチップ「フォーカス」）', 'gap', 'なし（編成で決まる）'],
  selfBuffed: ['自分が〈stat〉増加状態なら', 'ok', 'selfBuffed'],
  selfState: ['自分が〈状態〉なら', 'ok', 'selfState（2 段目の段 1）'],
  'selfState:fullStack': [
    '自分が〈状態〉のフルスタックなら',
    'ok',
    'selfState の stacks: "full"（N スタック以上は stacks: N。2 段目の段 3）',
  ],
  'selfState:absent': ['自分が〈状態〉でなければ', 'ok', 'selfState の present: false（2 段目の段 1）'],
  'selfState:while': ['自分に〈状態〉適用中', 'ok', '常時の効果の while（続いている間。2 段目の段 9 の PR 2）'],
  enemyState: ['対象（敵）が〈状態〉なら', 'check', 'damage の enemyState だけ'],
  enemyElement: ['対象が〈コード〉なら', 'ok', 'enemyElement'],
  hp: [
    '自分・味方の HP が X% 以上／以下・最大',
    'indirect',
    'HP の経路の読む側。HP は減りうる（射撃場でも被弾でわずかに減る）ので前提で決めない',
  ],
  squad: ['同じ部隊の味方がいれば', 'ok', 'squad'],
  burstStepMix: ['部隊構成（基本バースト段階）', 'ok', 'burstStepMix'],
  usedBurst: ['直前に自分がバーストを使用していれば', 'ok', 'usedBurst（2 段目の段 1）'],
  inFullBurst: ['フルバーストタイム中なら', 'ok', 'inFullBurst'],
  enemyCount: ['敵が N 機以上', 'premise', '敵 1 体'],
  alive: ['生存している限り', 'premise', '倒れない'],
  selfWeaponChanged: [
    '武器変更状態なら',
    'check',
    '回数のきっかけの発火の窓 firesDuring: "weaponChange"（2 段目の段 11・C-0705）だけ',
  ],
  enemyIsTarget: ['対象がターゲットなら', 'check', '射撃場の的をターゲットとみなす読み（18 の assumes）'],
  range: ['適正射程距離内なら', 'check', '距離の帯'],
  enemyType: ['ラプチャーなら', 'premise', '的はラプチャー'],
  resource: ['固有のカウンタの値', 'gap', 'なし'],
  selfBarrier: ['自分がバリア適用状態なら', 'indirect', 'バリアの経路（付与の窓で決まる）'],
};

const TGT_INFO: Record<string, Info> = {
  self: ['自分', 'ok'],
  'ally:allies': ['味方全体', 'ok'],
  'ally:alliesExceptSelf': ['自分を除く味方全体', 'ok'],
  'ally:alliesFiltered': ['絞った味方全体（絞り方を読み取れなかったもの）', 'check'],
  'ally:filter:weapon': ['〈武器〉を所持する味方', 'ok'],
  'ally:filter:element': ['〈コード〉の味方', 'ok'],
  'ally:filter:class': ['〈クラス〉型の味方', 'gap'],
  'ally:filter:squad': ['同じ部隊の味方', 'ok'],
  'ally:filter:burstStep': ['基本バースト段階が N の味方', 'ok'],
  'ally:filter:state': ['〈状態〉状態の味方', 'check'],
  'ally:topAttack': ['最終攻撃力が最も高い味方 N 機', 'ok'],
  'ally:longestChargeTime': ['基本チャージ時間が一番長い味方', 'ok'],
  'ally:burstUsers': ['直前にバーストスキルを使用した味方', 'ok'],
  'ally:lowestHp': ['残りの HP が最も低い味方 N 機', 'check'],
  'ally:topOther': ['最大HP・防御力が最も高い味方', 'gap'],
  'ally:neighbors': ['両隣の味方', 'gap'],
  'ally:random': ['ランダムな味方', 'check'],
  'ally:debuffed': [
    'デバフのかかった味方のうちランダムな N 機（自分に付く▼のある味方から選ぶ。どの効果がデバフかは未確認）',
    'check',
  ],
  'ally:specific': ['特定のキャラ（自分の王＝クラウン・自分のアイドル＝アニス：スター）', 'gap'],
  cover: ['遮蔽物', 'damaged'],
  'enemy:all': ['敵全体・攻撃範囲内の敵', 'ok'],
  'enemy:hit': ['対象（命中した敵）', 'ok'],
  'enemy:selected': ['条件で選ぶ敵 N 機', 'ok'],
  '-': ['（対象を読み取れなかったもの）', 'check'],
};

/**
 * 値の算出の行（3.2 節の SC のキー）。発動者基準は stat で語彙の有無が分かれる。2 段目の段 6: 発動者の最終最大HP 基準は、攻撃力だけが
 * 語彙あり（casterFinalMaxHp）
 */
function scalingKeyOf(e: CatalogEffect): string {
  const stat = e.stat!;
  if (stat.scaling === 'casterHp') return stat.canon === 'attack' ? 'casterHp:ok' : 'casterHp';
  if (stat.scaling !== 'casterBased') return stat.scaling;
  return ['attack', 'chargeSpeed', 'chargeTime'].includes(stat.canon) ? 'casterBased:ok' : 'casterBased:indirect';
}

/** 値の算出（3.2 節） */
const SC: Record<string, Info> = {
  ratio: ['対象自身の値の X%', 'ok'],
  'casterBased:ok': ['スキル発動者基準の攻撃力・チャージ速度（casterAttack・casterChargeTime）', 'ok'],
  'casterBased:indirect': ['スキル発動者基準の防御力・最大HP など（発動者の値を読む。分類の別紙 6 節）', 'indirect'],
  // 2 段目の段 6（plan/design-skill-stage6.md 1.3 節）: 最終最大HP の X% 分の攻撃力▲は語彙あり（casterFinalMaxHp）。ほかの stat は語彙なし
  'casterHp:ok': ['発動者の最大HP の X% 分の攻撃力▲（casterFinalMaxHp）', 'ok'],
  casterHp: ['発動者の最大HP 基準の、攻撃力のほかの値', 'gap'],
  perStack: ['X% × 〈状態〉のスタック数', 'gap'],
  lostHp: ['失った HP N% ごと（HP の経路の読む側）', 'indirect'],
  perMaxAmmo: ['最大装弾数 N 発ごと', 'gap'],
  casterDefense: ['発動者の防御力に比例（防御力の経路の動かす側。最終の付かない値を読む）', 'indirect'],
  flat: ['実数（発・個）', 'ok'],
  seconds: ['秒', 'ok'],
};

/** 持続の形（効果に付いた修飾。3.3 節） */
const DUR: Record<string, Info> = {
  'dur:seconds': ['N 秒間維持', 'ok'],
  'dur:permanent': ['持続（戦闘の終わりまで）', 'ok'],
  'dur:shots': ['N 発間維持', 'ok'],
  'dur:fullBurst': ['フルバーストタイムの間', 'ok'],
  'dur:reloads': ['リロード N 回に適用', 'gap'],
  'dur:untilState': ['〈状態〉解除まで', 'gap'],
  'dur:scaled': ['回数 × N 秒', 'gap'],
  'stack:max': ['N スタック', 'ok'],
  'stack:cap': ['最大 N（個・回・段階）', 'check'],
  'meta:undispellable': [
    '解除不可（効果解除・後から付く発動不可で外れない。効果解除の味方がいる時だけ効く。分類の別紙 4.5 節）',
    'indirect',
  ],
  'meta:limitedUses': ['戦闘中 N 回発動', 'gap'],
  'meta:interval': ['N 秒間隔', 'check'],
  'state:removeOn': ['〜時に解除', 'gap'],
  'meta:keepOnRevive': ['復活後も維持', 'oos'],
  'meta:misc': ['その他', 'check'],
  'meta:seconds': ['N 秒（項目）', 'check'],
  'meta:count': ['N 回（項目）', 'check'],
  'meta:floor': ['最低 N を維持', 'gap'],
  'meta:staged': ['段階別・状態別の効果', 'check'],
  'meta:eventCountStaged': ['使用回数別・開始回数別の効果', 'ok'],
  'meta:shotCycle': ['攻撃回数別の効果（循環）', 'ok'],
  'meta:sequential': ['下位効果のスタック適用', 'ok'],
};

// ---- 効果ごとの区分 ----

function statLabel(e: CatalogEffect): string {
  const stat = e.stat!;
  return STAT_INFO[stat.canon]?.[0] ?? stat.canon;
}

/** stat の区分と語彙（側と向きで決まるものがある） */
function statStatus(e: CatalogEffect): readonly [Status, string] {
  const stat = e.stat!;
  const c = stat.canon;
  const enemy = e.side === 'enemy';
  const down = stat.dir === 'down';
  if (c.startsWith('?')) return ['check', 'なし'];
  const info = STAT_INFO[c];
  if (c === 'damageTaken') {
    if (enemy) return down ? ['nodmg', '敵の被ダメ▼'] : ['ok', 'damageTaken'];
    return down ? ['damaged', '被弾の経路'] : ['check', '味方の被ダメ▲'];
  }
  if (c === 'defense') {
    if (enemy) return down ? ['ok', 'enemyDefenseDown（2 段目の段 2）'] : ['nodmg', '敵の防御▲'];
    return ['indirect', '防御力の経路（防御力の比べ・順位の対象。被ダメージは被弾の経路）'];
  }
  if (c === 'hitRate') return enemy ? ['damaged', '敵の命中（被弾の経路）'] : ['ok', 'hitRate（decrease）'];
  if (c === 'attack' && enemy) return ['damaged', '敵の攻撃力▼（被弾の経路）'];
  if (c === 'burstGaugeSpeed')
    return [
      'ok',
      'burstGaugeSpeed（2 段目の段 1 で timed・状態の中身にも）。アニス：スター S1 の味方の分は allyGaugeAdd',
    ];
  if (enemy && info?.[1] === 'ok') return ['nodmg', '敵への同じ stat'];
  return [info?.[1] ?? 'check', info?.[2] ?? 'なし'];
}

/** 効果の分類の鍵。間隔の付いた回復と、維持の付いたクールタイムの増減は別の分類 */
function effectKind(e: CatalogEffect): string {
  if (e.kind === 'heal:instant' && (e.mods ?? []).includes('meta:interval')) return 'heal:intervalForm';
  if (e.kind === 'stat') return `stat:${e.stat!.canon}`;
  if (
    ['instant:burstCooldown', 'instant:burstCooldownUp', 'instant:skillCooldown'].includes(e.kind) &&
    (e.mods ?? []).some((m) => m.startsWith('dur:') || m.startsWith('stack'))
  ) {
    return 'sustained:cooldown';
  }
  return e.kind;
}

function effectStatus(e: CatalogEffect): readonly [Status, string] {
  if (e.kind === 'stat') {
    if (e.sub === 'stat:fixed')
      return e.stat!.canon === 'chargeTime' ? ['ok', 'fixedChargeTime'] : ['gap', 'なし（〜に固定）'];
    return statStatus(e);
  }
  const k = effectKind(e);
  const info = KIND_INFO[k];
  if (info === undefined) return ['check', '?'];
  if (k === 'instant:ammoDrain' && e.side === 'enemy') return ['nodmg', '敵の残弾'];
  // バーストの「フルバーストタイム N 秒▲▼」は CDN の burst_duration で入っている（Stage 8）
  if (k.startsWith('fullBurst:') && e.implicit === 'burstUse' && e.conditions.length === 0) {
    return ['ok', 'CDN の burst_duration'];
  }
  return [info[1], info[2] ?? ''];
}

function effectLabel(e: CatalogEffect): string {
  return e.kind === 'stat' ? statLabel(e) : (KIND_INFO[effectKind(e)]?.[0] ?? e.kind);
}

/** きっかけ: 書かれていないスキルのスロットは、持続なら常時、そうでなければ CT ごとのアクティブ */
function trigKeys(e: CatalogEffect): string[] {
  if (e.triggers.length > 0) return e.triggers;
  if (e.implicit === 'burstUse') return ['implicit:burstUse'];
  return (e.mods ?? []).includes('dur:permanent') ? ['implicit:passive'] : ['implicit:active'];
}

/** 条件: 「自分が〈stat〉増加状態なら」は selfBuffed */
function condKeys(e: CatalogEffect): string[] {
  return e.conditions.map((c) => (c === 'selfState' && /自分が[^、]*増加状態/.test(e.head) ? 'selfBuffed' : c));
}

/** 対象: 絞った味方全体を絞り方で分ける */
function tgtKeys(e: CatalogEffect): string[] {
  return e.targets.flatMap((t) => {
    if (t !== 'ally:alliesFiltered') return [t];
    const h = /味方/.test(e.subHead) ? e.subHead : e.head;
    const out: string[] = [];
    if (/を所持する/.test(h)) out.push('ally:filter:weapon');
    if (/コードの味方/.test(h)) out.push('ally:filter:element');
    if (/型の味方/.test(h)) out.push('ally:filter:class');
    if (/同じ部隊の/.test(h)) out.push('ally:filter:squad');
    if (/基本バースト段階が/.test(h)) out.push('ally:filter:burstStep');
    if (/状態の味方|状態ではない味方/.test(h)) out.push('ally:filter:state');
    return out.length > 0 ? out : ['ally:alliesFiltered'];
  });
}

/** 大分類（1 節） */
function familyOf(k: string): string {
  if (k.startsWith('stat:')) return 'バフ・デバフ（stat の▲▼）';
  if (k.startsWith('damage:')) return 'ダメージ';
  if (k.startsWith('heal:')) return '回復';
  if (k.startsWith('shield:') || k === 'cover') return '防御（バリア・無敵など）';
  if (k.startsWith('control:')) return '行動阻害・指定';
  if (k.startsWith('buffOp:')) return 'バフ・デバフの操作';
  if (['instant:', 'sustained:', 'fullBurst:', 'burst:', 'cycle:'].some((p) => k.startsWith(p))) {
    return 'リソース・バーストの操作（弾・ゲージ・クールタイムなど）';
  }
  if (k.startsWith('weaponChange') || k === 'autoAttack' || k.startsWith('flag:')) {
    return '攻撃の形（武器変更・自動攻撃・フラグ）';
  }
  if (k.startsWith('state:')) return '状態の操作（名前だけの付与・解除・消去・切り替え・発動不可など）';
  if (k === 'resource') return 'キャラ固有のカウンタ';
  return 'その他';
}

// ---- 集計 ----

/** キャラの欄（行・効果の両方にある） */
type Who = { rid: number; name: string; defined: boolean };

function group<T>(items: readonly T[], keyOf: (x: T) => string | readonly string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const keys = keyOf(it);
    for (const k of typeof keys === 'string' ? [keys] : keys) {
      const list = m.get(k);
      if (list === undefined) m.set(k, [it]);
      else list.push(it);
    }
  }
  return m;
}

/** 件数の多い順（同数は先に出た順） */
function byCount<T>(m: Map<string, T[]>): [string, T[]][] {
  return [...m].sort((a, b) => b[1].length - a[1].length);
}

function charsOf(items: readonly Who[]): Who[] {
  const s = new Map<number, Who>();
  for (const it of items) s.set(it.rid, it);
  return [...s.values()];
}

/** キャラの例。定義のあるキャラを先に、それぞれ resourceId の順。max 体まで */
function fmtChars(items: readonly Who[], max = 5): string {
  const cs = charsOf(items).sort((a, b) => Number(b.defined) - Number(a.defined) || a.rid - b.rid);
  const names = cs.map((c) => (c.defined ? `**${c.name}**` : c.name));
  return names.length > max ? `${names.slice(0, max).join('、')} ほか ${names.length - max} 体` : names.join('、');
}

/** 「件数 | キャラ | うち定義あり」の 3 列 */
function rowCounts(items: readonly Who[]): string {
  const cs = charsOf(items);
  return `${items.length} | ${cs.length} | ${cs.filter((c) => c.defined).length}`;
}

/** 一覧の全体 */
export function renderSkillCatalog(lines: readonly CatalogLine[], effects: readonly CatalogEffect[]): string {
  const L = lines;
  const E = effects;
  const sections = new Map<string, string[]>();
  let cur: string[] = [];
  const begin = (key: string) => {
    cur = [];
    sections.set(key, cur);
  };
  const p = (s = '') => {
    cur.push(s);
  };

  // ---- 頭書き ----
  begin('h');
  const chars = new Set(L.map((l) => l.rid));
  const slotsAll = new Set(L.map((l) => `${l.rid}:${l.slot}`));
  p('# スキルの効果の分類');
  p();
  p(
    '- **このファイルは生成する（手で書かない）**。`npm run records:check` で作り直す。データを取り込み直して説明文が変わったら作り直す（最新かは `npm test` が確かめる）。作り方と区分の意味は [design-skill-catalog.md](design-skill-catalog.md) 1 節（論点 2）、読みの詳細は [design-skill-catalog-classes.md](design-skill-catalog-classes.md)（以下「分類の別紙」）、ツールチップとの突き合わせは [design-skill-catalog-tooltips.md](design-skill-catalog-tooltips.md)（T1〜T6）',
  );
  p(
    `- 元データ: \`packages/core/data/characters/*.json\` の説明文（日本語）。キャラ ${chars.size}・スロット ${slotsAll.size}（宝物版を含む）・■ の行 ${L.length}・効果の句 ${E.length}`,
  );
  p(
    '- 機械的な読み取り（正規表現。`packages/core/src/skills/catalog.ts`）なので、分け損ないが混ざる。件数は目安。読み違いは道具の表で直す。**太字**は定義のあるキャラ。キャラ（例）は定義のあるキャラを先に並べる',
  );
  p('- 節の番号: 1・2 節はこの一覧だけの要約。3〜7 節は分類の別紙と同じ番号（別紙だけにある節は飛ばす）');
  p(
    '- 効果 = 効果の句の数、キャラ = その分類を持つキャラの数、うち定義あり = そのうち data/skills に定義のあるキャラの数',
  );
  p(`- 状況: ${ST_KEYS.map((k) => ST[k]).join('・')}（意味は本体 1 節）`);
  p();

  // ---- 1. 大分類 ----
  begin('s1');
  p('## 1. 効果の大分類');
  p();
  p(
    '効果の句を中身の種類で 1 つずつに分けた。名前の付いた状態の付与で、中身（〈名前〉：…）が stat やダメージのものは、その中身の種類に数え、「うち状態の中身」にも出す（状態の付与と中身は直交する。状態ごとの形は 4.2 節）。',
  );
  p();
  p(`| 大分類 | 効果 | キャラ | うち定義あり | うち状態の中身 | ${ST_KEYS.map((k) => ST[k]).join(' | ')} |`);
  p(`| --- | --- | --- | --- | --- | ${ST_KEYS.map(() => '---').join(' | ')} |`);
  for (const [k, items] of byCount(group(E, (e) => familyOf(effectKind(e))))) {
    const counts = new Map<Status, number>(ST_KEYS.map((s) => [s, 0]));
    for (const e of items) {
      const s = effectStatus(e)[0];
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const inState = items.filter((e) => e.state !== undefined && !e.kind.startsWith('state:')).length;
    p(`| ${k} | ${rowCounts(items)} | ${inState} | ${ST_KEYS.map((s) => counts.get(s)).join(' | ')} |`);
  }
  p();

  // ---- 3. バフ・デバフ ----
  begin('s3');
  p('## 3. バフ・デバフ（stat の▲▼）');
  p();
  p('### 3.1 stat');
  p();
  p('対象の側（味方＝自分か味方、敵）と向き（▲▼）で分けた。');
  p();
  p('| stat | 側 | 向き | 効果 | キャラ | 定義あり | 状況 | 語彙 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const statEffects = E.filter((e) => e.kind === 'stat');
  for (const [, items] of byCount(
    group(
      statEffects,
      (e) => `${e.stat!.canon}|${e.side === 'enemy' ? '敵' : '味方'}|${e.stat!.dir === 'down' ? '▼' : '▲'}`,
    ),
  )) {
    const first = items[0]!;
    const [s, v] = statStatus(first);
    const side = first.side === 'enemy' ? '敵' : '味方';
    const dir = first.stat!.dir === 'down' ? '▼' : '▲';
    p(`| ${statLabel(first)} | ${side} | ${dir} | ${rowCounts(items)} | ${ST[s]} | ${v} | ${fmtChars(items)} |`);
  }
  p();

  begin('s3.2');
  p('### 3.2 値の算出');
  p();
  p('| 算出 | 効果 | キャラ | 定義あり | 状況 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  const scKey = scalingKeyOf;
  for (const [k, items] of byCount(group(statEffects, scKey))) {
    p(`| ${SC[k]?.[0] ?? k} | ${rowCounts(items)} | ${ST[SC[k]?.[1] ?? 'check']} | ${fmtChars(items)} |`);
  }
  p();

  begin('s3.3');
  p('### 3.3 持続の形（効果に付いた修飾）');
  p();
  p('| 形 | 効果 | キャラ | 定義あり | 状況 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  const mods: (Who & { mod: string })[] = [];
  for (const e of E) for (const mod of e.mods ?? []) mods.push({ rid: e.rid, name: e.name, defined: e.defined, mod });
  for (const l of L)
    for (const mod of l.lineMods ?? []) mods.push({ rid: l.rid, name: l.name, defined: l.defined, mod });
  for (const [k, items] of byCount(group(mods, (x) => x.mod))) {
    p(`| ${DUR[k]?.[0] ?? k} | ${rowCounts(items)} | ${ST[DUR[k]?.[1] ?? 'check']} | ${fmtChars(items)} |`);
  }
  p();

  // ---- 4. 状態 ----
  begin('s4');
  p('## 4. 状態');
  p();
  p(
    `「〈名前〉：中身」「〈名前〉」の付与、「〈名前〉解除・消去」、条件の「〈名前〉状態なら」から拾った。側は付与の対象。目録（\`skills/states.ts\`）にあるのは ${Object.values(
      NAMED_STATES,
    )
      .map((s) => s.name.ja)
      .join(
        '・',
      )}。キャラ固有のカウンタ（勇者レベル・乗車券など。上限と増減を持ち、時間で外れない）は状態に数えず、1 節の「キャラ固有のカウンタ」に置いた。`,
  );
  p();

  begin('s4.1');
  p('### 4.1 名前の付いた状態と効果の呼び名（名前ごと）');
  p();
  p(
    '「参照」は、名前がどこかの行の頭（きっかけ・条件・対象）に出るもの。参照の無い名前（効果の呼び名）も目録に入れる（本体の論点 4）。参照の有無は、見る側の語彙が要るかの目安。',
  );
  p();
  p('| 名前 | 側 | 参照 | 中身・付与の効果 | キャラ |');
  p('| --- | --- | --- | --- | --- |');
  const named = new Map<string, CatalogEffect[]>();
  for (const e of E) {
    if (e.state === undefined) continue;
    // 段階の番号（ペインロード 1・2 など）はまとめる。名前の一部の番号（エグゾスパイン Mk2）は残す
    const n = e.state.replace(/(?<![A-Za-z])[XN\d]+$/, '');
    const list = named.get(n);
    if (list === undefined) named.set(n, [e]);
    else list.push(e);
  }
  for (const [n, items] of [...named].sort((a, b) => a[1][0]!.rid - b[1][0]!.rid)) {
    const sides = [...new Set(items.map((e) => (e.side === 'enemy' ? '敵' : e.side === 'unknown' ? '?' : '味方')))];
    const contents = [
      ...new Set(
        items.map((e) => (e.kind === 'stat' ? `${statLabel(e)}${e.stat!.dir === 'down' ? '▼' : '▲'}` : effectLabel(e))),
      ),
    ];
    const key = n.replace(/：.*$/, '').replace(/(解除|消去)$/, '');
    const ref = key.length >= 2 && L.some((l) => l.head.includes(key)) ? 'あり' : '—';
    p(`| ${n} | ${sides.join('・')} | ${ref} | ${contents.join('、')} | ${fmtChars(items, 4)} |`);
  }
  p();

  begin('s4.2');
  p('### 4.2 状態の一生（形）');
  p();
  const withState = E.filter((e) => e.state !== undefined);
  const stateForms: [string, CatalogEffect[]][] = [
    ['中身あり（〈名前〉：stat の▲▼）', withState.filter((e) => e.kind === 'stat')],
    [
      '中身あり（〈名前〉：ダメージ・回復・そのほか）',
      withState.filter((e) => e.kind !== 'stat' && !e.kind.startsWith('state:')),
    ],
    ['名前だけの付与', E.filter((e) => e.kind === 'state:grant' || e.kind === 'state:grant?')],
    ['解除（同じスキルが外す）', E.filter((e) => e.kind === 'state:remove')],
    ['消去（同じスキルが外す。解除不可の状態も外す）', E.filter((e) => e.kind === 'state:cancel')],
    ['変化・切り替え', E.filter((e) => e.kind === 'state:switch')],
    ['スタック量の増減・コピー', E.filter((e) => e.kind === 'buffOp:stackChange' || e.kind === 'buffOp:copy')],
  ];
  p('| 形 | 効果 | キャラ | 定義あり | キャラ（例） |');
  p('| --- | --- | --- | --- | --- |');
  for (const [k, items] of stateForms) p(`| ${k} | ${rowCounts(items)} | ${fmtChars(items)} |`);
  p();

  begin('s4.3');
  p('### 4.3 状態を見る側（頭の書き方）');
  p();
  p('| 見る形 | 行 | キャラ | 定義あり | 状況 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  const viewers: [string, Status, CatalogLine[]][] = [
    [
      '条件: 自分が〈状態〉なら',
      'ok',
      L.filter(
        (l) =>
          l.conditions.includes('selfState') &&
          !l.conditions.includes('selfState:fullStack') &&
          !/自分が[^、]*増加状態/.test(l.head),
      ),
    ],
    ['条件: 自分が〈状態〉のフルスタックなら', 'ok', L.filter((l) => l.conditions.includes('selfState:fullStack'))],
    ['条件: 自分が〈状態〉でなければ', 'ok', L.filter((l) => l.conditions.includes('selfState:absent'))],
    ['条件: 自分に〈状態〉適用中', 'ok', L.filter((l) => l.conditions.includes('selfState:while'))],
    ['条件: 対象（敵）が〈状態〉なら', 'check', L.filter((l) => l.conditions.includes('enemyState'))],
    ['きっかけ: 〈状態〉が適用された時', 'check', L.filter((l) => l.triggers.includes('stateApplied'))],
    ['きっかけ: 〈状態〉が終了した時', 'gap', L.filter((l) => l.triggers.includes('stateEnded'))],
    ['きっかけ: フルスタックでスタック解除後', 'ok', L.filter((l) => l.triggers.includes('fullStackConsume'))],
    ['対象: 〈状態〉状態の味方', 'check', L.filter((l) => /状態の味方|状態ではない味方/.test(l.head))],
  ];
  for (const [k, s, items] of viewers) p(`| ${k} | ${rowCounts(items)} | ${ST[s]} | ${fmtChars(items)} |`);
  p();

  writeRemovalSection(p, begin, L);
  writeTimingSection(p, begin, L);

  // ---- 5. 回復 ----
  begin('s5');
  p('## 5. 回復');
  p();
  p('### 5.1 回復の形');
  p();
  p('| 回復の形 | 効果 | キャラ | 定義あり | 状況 | 語彙 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- | --- |');
  const heals = E.filter((e) => effectKind(e).startsWith('heal:'));
  for (const [k, items] of byCount(group(heals, effectKind))) {
    const [s, v] = effectStatus(items[0]!);
    p(`| ${KIND_INFO[k]?.[0] ?? k} | ${rowCounts(items)} | ${ST[s]} | ${v} | ${fmtChars(items)} |`);
  }
  p();

  begin('s5.2');
  p('### 5.2 回復のきっかけと対象');
  p();
  p('| きっかけ × 対象 | 効果 | キャラ | 定義あり | キャラ（例） |');
  p('| --- | --- | --- | --- | --- |');
  const healKey = (e: CatalogEffect) => {
    const trig = trigKeys(e)
      .map((t) => TRIG_INFO[t]?.[0] ?? t)
      .join('＋');
    const conds = condKeys(e);
    const cond = conds.length > 0 ? `（${conds.map((c) => COND_INFO[c]?.[0] ?? c).join('・')}）` : '';
    return `${trig}${cond} × ${tgtKeys(e)
      .map((t) => TGT_INFO[t]?.[0] ?? t)
      .join('・')}`;
  };
  const healEffects = heals.filter((e) =>
    ['heal:instant', 'heal:intervalForm', 'heal:overTime', 'heal:lifesteal'].includes(effectKind(e)),
  );
  for (const [k, items] of byCount(group(healEffects, healKey)))
    p(`| ${k} | ${rowCounts(items)} | ${fmtChars(items)} |`);
  p();

  begin('s5.3');
  p('### 5.3 回復を受ける側（回復効果が適用された時）');
  p();
  const recv = L.filter((l) => l.triggers.includes('healed'));
  p(`- 行: ${recv.length}。キャラ: ${fmtChars(recv, 30)}`);
  p();

  writeIndirectSection(p, begin, L, E);

  // ---- 7. 条件・きっかけ・対象 ----
  begin('s7');
  p('## 7. 条件・きっかけ・対象');
  p();

  begin('s7.1');
  p('### 7.1 条件');
  p();
  p('| 条件 | 効果 | キャラ | 定義あり | 状況 | 語彙 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [k, items] of byCount(
    group(
      E.filter((e) => e.conditions.length > 0),
      condKeys,
    ),
  )) {
    const info = COND_INFO[k];
    p(
      `| ${info?.[0] ?? k} | ${rowCounts(items)} | ${ST[info?.[1] ?? 'check']} | ${info?.[2] ?? ''} | ${fmtChars(items)} |`,
    );
  }
  p();

  begin('s7.2');
  p('### 7.2 きっかけ');
  p();
  p('| きっかけ | 効果 | キャラ | 定義あり | 状況 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const [k, items] of byCount(group(E, trigKeys))) {
    p(`| ${TRIG_INFO[k]?.[0] ?? k} | ${rowCounts(items)} | ${ST[TRIG_INFO[k]?.[1] ?? 'check']} | ${fmtChars(items)} |`);
  }
  p();

  begin('s7.3');
  p('### 7.3 対象');
  p();
  p('| 対象 | 効果 | キャラ | 定義あり | 状況 | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const [k, items] of byCount(group(E, (e) => (e.targets.length > 0 ? tgtKeys(e) : ['-'])))) {
    p(`| ${TGT_INFO[k]?.[0] ?? k} | ${rowCounts(items)} | ${ST[TGT_INFO[k]?.[1] ?? 'check']} | ${fmtChars(items)} |`);
  }
  p();

  // ---- 2. スロットごとの残り ----
  begin('s2');
  p('## 2. スロットごとに残る「語彙なし・要確認」');
  p();
  p(
    '前提の中でダメージに効く効果のうち、語彙なし・要確認の分類（効果・きっかけ・条件・対象）を、スロットごとに集めた。間接に効く・被弾で効く・前提の外（構造）・前提で決まる・計算に無関係は数えない。「それだけ」は、そのスロットに残る分類がそれ 1 つだけの数（その語彙で片づくスロット）。',
  );
  p();
  const slotGaps = new Map<string, Set<string>>();
  const activeSlots = new Set<string>();
  const skipped: ReadonlySet<Status> = new Set(['nodmg', 'oos', 'premise', 'damaged', 'indirect']);
  const outside: ReadonlySet<Status> = new Set(['oos', 'damaged']);
  const remains = (s: Status | undefined) => s === 'gap' || s === 'check';
  for (const e of E) {
    const key = `${e.rid}:${e.slot}`;
    let gaps = slotGaps.get(key);
    if (gaps === undefined) slotGaps.set(key, (gaps = new Set()));
    const trigs = trigKeys(e);
    if (trigs.includes('implicit:active')) activeSlots.add(key);
    const [es] = effectStatus(e);
    if (skipped.has(es)) continue;
    if (trigs.some((t) => outside.has(TRIG_INFO[t]?.[1] ?? 'check'))) continue;
    if (condKeys(e).some((c) => outside.has(COND_INFO[c]?.[1] ?? 'check'))) continue;
    if (remains(es))
      gaps.add(`効果: ${e.kind === 'stat' ? statLabel(e) + (e.side === 'enemy' ? '（敵）' : '') : effectLabel(e)}`);
    for (const t of trigs) if (remains(TRIG_INFO[t]?.[1])) gaps.add(`きっかけ: ${TRIG_INFO[t]![0]}`);
    for (const c of condKeys(e)) if (remains(COND_INFO[c]?.[1])) gaps.add(`条件: ${COND_INFO[c]![0]}`);
    for (const t of tgtKeys(e)) if (remains(TGT_INFO[t]?.[1])) gaps.add(`対象: ${TGT_INFO[t]![0]}`);
    if (e.kind === 'stat' && ['casterHp', 'perStack', 'perMaxAmmo'].includes(scalingKeyOf(e))) {
      gaps.add(`算出: ${SC[scalingKeyOf(e)]![0]}`);
    }
  }
  const gapCount = new Map<string, { all: number; only: number }>();
  for (const gaps of slotGaps.values()) {
    for (const g of gaps) {
      const c = gapCount.get(g) ?? { all: 0, only: 0 };
      c.all++;
      if (gaps.size === 1) c.only++;
      gapCount.set(g, c);
    }
  }
  const slotsWithGaps = [...slotGaps.values()].filter((g) => g.size > 0).length;
  const activeOnly = [...activeSlots].filter((k) => slotGaps.get(k)!.size === 0).length;
  p(`- 残りのあるスロット: ${slotsWithGaps} / ${slotGaps.size}（効果の句のあるスロット）`);
  p(
    `- 別枠: CT ごとのアクティブ（きっかけの書かれていないスキル）のあるスロット ${activeSlots.size}（うち、ほかに残りの無いスロット ${activeOnly}）。周期の語彙（everySeconds）はあり、周期の値をキャラごとに録画で読む（C-0453・C-0496・C-0502）。語彙の残りには数えない`,
  );
  p();
  p('| 分類 | スロット | それだけ |');
  p('| --- | --- | --- |');
  for (const [k, v] of [...gapCount].sort((a, b) => b[1].all - a[1].all)) p(`| ${k} | ${v.all} | ${v.only} |`);
  p();

  const order = ['h', 's1', 's2', 's3', 's3.2', 's3.3', 's4', 's4.1', 's4.2', 's4.3', 's4.5', 's4.6', 's5', 's5.2'];
  order.push('s5.3', 's6', 's7', 's7.1', 's7.2', 's7.3');
  const missing = [...sections.keys()].filter((k) => !order.includes(k));
  if (missing.length > 0) throw new Error(`sections not in order: ${missing.join(', ')}`);
  return order.flatMap((k) => sections.get(k) ?? []).join('\n');
}

type Writer = (s?: string) => void;

/** 4.5 節: 外れ方（解除・消去・解除条件・解除不可） */
function writeRemovalSection(p: Writer, begin: (key: string) => void, L: readonly CatalogLine[]): void {
  begin('s4.5');
  p('### 4.5 外れ方（解除・消去・解除条件・解除不可）');
  p();
  p('説明文の行から、効果・状態が外れる書き方を拾った。英語版の言い回しを添える。');
  p();
  const removals: [string, RegExp, string][] = [
    ['解除不可（効果解除で外れない）', /解除不可/, 'This effect cannot be removed'],
    ['〈名前〉消去（同じスキルが外す）', /[^「」]+消去」/, 'Cancels 〈名前〉'],
    [
      '〈名前〉解除（同じスキルが外す）',
      /「[^「」]+解除」|効果発動後[^「」]+解除|効果適用後[^「」]+解除/,
      'Removes 〈名前〉',
    ],
    [
      '〜時に解除・解除まで（出来事で外れる）',
      /時に?解除」|解除まで」|一定条件で解除」|リロード完了時に解除/,
      'Removed upon …',
    ],
    ['解除条件：〈出来事〉', /解除条件：/, 'Deactivation condition'],
    ['スタック解除（スタックの消費）', /スタック解除/, 'Removes (all) stacks'],
    ['直接攻撃を受けると解除（被弾）', /直接攻撃を受けると解除/, 'removed upon taking a direct hit'],
    ['効果解除（バフ・デバフ効果解除 N 個）', /効果解除/, 'Removes N buff(s)/debuff(s)'],
    [
      '切り替え（条件に合う〈グループ〉のみ適用）',
      /条件に合う.*のみ適用/,
      'Initiates a new … based on the current mode',
    ],
  ];
  p('| 書き方 | 英語版 | 行 | キャラ | 定義あり | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const [name, re, en] of removals) {
    const items = L.filter((l) => re.test(l.flat));
    p(`| ${name} | ${en} | ${rowCounts(items)} | ${fmtChars(items)} |`);
  }
  p();
  const undisp = L.filter((l) => /解除不可/.test(l.flat));
  const withSec = undisp.filter((l) => /「[XN\d.]+秒間維持」「解除不可」/.test(l.flat));
  const withUntil = undisp.filter((l) => /解除条件：/.test(l.flat));
  p(`- 解除不可と N 秒間維持が同じ効果に付く行: ${withSec.length}（${fmtChars(withSec)}）`);
  p(`- 解除不可の状態に解除条件が書かれた行: ${withUntil.length}（${fmtChars(withUntil)}）`);
  // 消去・解除の相手が、解除不可で付く状態か
  const grantedUndisp = new Set<string>();
  for (const l of undisp) {
    for (const m of l.flat.matchAll(
      /「([^「」：]+)(：[^」]*)?」(「[^」]*(スタック|間隔|秒間維持|まで)[^」]*」)*「(持続|[XN\d.]+秒間維持)」「解除不可」/g,
    )) {
      const name = (m[1] ?? '').trim();
      grantedUndisp.add(name);
      // 「ステージパート：ボーカル」のように、名前そのものが「：」を含む状態
      if (m[2] !== undefined && !/[▲▼％]|ダメージ|回復|バリア/.test(m[2])) grantedUndisp.add(`${name}${m[2]}`.trim());
    }
  }
  const erased = new Set<string>();
  for (const l of L) {
    for (const m of l.flat.matchAll(/「([^「」]+)消去」/g))
      erased.add((m[1] ?? '').replace(/^効果適用後、/, '').trim());
  }
  const removed = new Set<string>();
  for (const l of L) {
    for (const m of l.flat.matchAll(/「([^「」]+)解除」/g)) {
      if (/効果解除|スタック解除|時に?解除|一定条件で解除|直接攻撃を受けると解除/.test(m[0])) continue;
      removed.add((m[1] ?? '').replace(/^(効果発動後|効果適用後、?)/, '').trim());
    }
  }
  const mark = (n: string) => (grantedUndisp.has(n) ? '（解除不可で付く）' : '（解除不可でない）');
  p(`- 消去の相手: ${[...erased].map((n) => n + mark(n)).join('、')}`);
  p(`- 解除の相手: ${[...removed].map((n) => n + mark(n)).join('、')}`);
  p();
}

/** 4.6 節: 条件の判定のタイミング */
function writeTimingSection(p: Writer, begin: (key: string) => void, L: readonly CatalogLine[]): void {
  begin('s4.6');
  p('### 4.6 条件の判定のタイミング');
  p();
  p(
    '頭の条件を、発火の瞬間だけ見る書き方（「〜した時、〜なら」）と、続いている間だけ効く書き方（「〜の時に限り」「〜の時のみ」「〜である限り」「〜している限り」）と、きっかけの無い書き方（「〜なら、…持続」）に分けた。',
  );
  p();
  const gateRe = /限り|時のみ|場合のみ|中のみ/;
  const hasCond = L.filter((l) => l.conditions.length > 0);
  const gateL = hasCond.filter((l) => gateRe.test(l.head) && !/該当効果のみ|のみ適用/.test(l.head));
  const snapL = hasCond.filter((l) => !gateL.includes(l) && l.triggers.length > 0);
  const passiveL = hasCond.filter((l) => !gateL.includes(l) && l.triggers.length === 0);
  p('| 書き方 | 行 | キャラ | 定義あり | キャラ（例） |');
  p('| --- | --- | --- | --- | --- |');
  for (const [name, items] of [
    ['発火の瞬間の条件（きっかけ＋なら）', snapL],
    ['続いている間の条件（限り・のみ）', gateL],
    ['きっかけの無い条件（なら・持続）', passiveL],
  ] as const) {
    p(`| ${name} | ${rowCounts(items)} | ${fmtChars(items)} |`);
  }
  p();
  const gateUndisp = gateL.filter((l) => /解除不可/.test(l.flat));
  p(`- 続いている間の条件で、効果が「持続」「解除不可」のもの: ${gateUndisp.length} 行（${fmtChars(gateUndisp)}）`);
  p();
}

/** 6 節: 間接に効く経路（動かす側と読む側） */
function writeIndirectSection(
  p: Writer,
  begin: (key: string) => void,
  L: readonly CatalogLine[],
  E: readonly CatalogEffect[],
): void {
  begin('s6');
  p('## 6. 間接に効く経路（HP・防御力・バリア・デコイ・遮蔽物）');
  p();
  p(
    'それ自体は与ダメージを変えないが、ほかの効果の値・対象・条件・きっかけを変える効果を、動かす側と読む側に分けた。読む側の効果が編成にいる時だけ与ダメージに届く。',
  );
  p();
  const lineHas = (re: RegExp) => L.filter((l) => re.test(l.flat));
  const headHas = (re: RegExp) => L.filter((l) => re.test(l.head));
  const statIs = (e: CatalogEffect, canon: string) => e.kind === 'stat' && e.stat!.canon === canon;
  const paths: [string, string, string, readonly Who[]][] = [
    ['HP', '動かす', '最大HP▲（最大HP のみ▲を含む）', E.filter((e) => statIs(e, 'maxHp') && e.stat!.dir === 'up')],
    ['HP', '動かす', '最大HP のみ▲（現在の HP は増えない読み）', lineHas(/最大HPのみ/)],
    ['HP', '動かす', '自分の現在の HP▼', E.filter((e) => statIs(e, 'currentHp'))],
    [
      'HP',
      '動かす',
      '回復（1 回・持続・吸収）',
      E.filter((e) => ['heal:instant', 'heal:overTime', 'heal:lifesteal'].includes(e.kind)),
    ],
    ['HP', '動かす', '受ける・与える HP 回復量', E.filter((e) => statIs(e, 'healReceived') || statIs(e, 'healGiven'))],
    ['HP', '動かす', '最大HP のコピー', lineHas(/最大HPのコピー/)],
    [
      'HP',
      '読む',
      '最大HP 基準の攻撃力▲・ダメージ',
      E.filter((e) => e.kind === 'damage:hpScaled' || (e.kind === 'stat' && e.stat!.scaling === 'casterHp')),
    ],
    ['HP', '読む', '失った HP ごとの▲', E.filter((e) => e.kind === 'stat' && e.stat!.scaling === 'lostHp')],
    ['HP', '読む', 'HP の割合の条件（以上・以下・最大）', L.filter((l) => l.conditions.includes('hp'))],
    ['HP', '読む', 'HP が閾値を越えた時・最大になった時', L.filter((l) => l.triggers.includes('hpThreshold'))],
    [
      'HP',
      '読む',
      'HP 順の対象（残りの HP の割合・数値が最も低い味方）',
      L.filter((l) => l.targets.includes('ally:lowestHp')),
    ],
    ['防御力', '動かす', '防御力▲（味方）', E.filter((e) => statIs(e, 'defense') && e.side !== 'enemy')],
    [
      '防御力',
      '動かす',
      '発動者の防御力に比例する防御力▲（最終の付かない値を読む。ツールチップ「最終」）',
      lineHas(/防御力に比例/),
    ],
    [
      '防御力',
      '読む',
      '防御力の比べ・順位の対象（自分より防御力が低い味方・防御力が最も高い味方）',
      headHas(/より最終防御力が低い味方|最終防御力が最も高い味方/),
    ],
    ['バリア', '動かす', 'バリアの付与（個別・共用）', E.filter((e) => e.kind === 'shield:barrier')],
    [
      'バリア',
      '動かす',
      'バリアの HP（回復・次のバリアの HP▲・無敵付与）',
      lineHas(/バリアHP|次のバリアのHP|バリアに無敵付与/),
    ],
    ['バリア', '読む', 'バリア適用時（きっかけ）', L.filter((l) => l.triggers.includes('barrierApplied'))],
    ['バリア', '読む', 'バリア適用状態なら・の時に限り（条件）', headHas(/バリア適用状態/)],
    [
      'バリア',
      '読む',
      '名前の付いたバリアの状態を見る条件（ナノコーティング・妄想・必死の抵抗など）',
      headHas(/ナノコーティング状態|妄想状態|必死の抵抗状態|妄想共有状態|妄想が終了/),
    ],
    ['デコイ', '動かす', 'デコイ（分身）の付与', E.filter((e) => e.kind === 'shield:decoy')],
    ['デコイ', '読む', 'デコイが存在する時', L.filter((l) => l.triggers.includes('decoyPresent'))],
    ['遮蔽物', '動かす', '遮蔽物の HP 回復・復活・防御力▲', E.filter((e) => e.kind === 'cover')],
    [
      '遮蔽物',
      '読む',
      '遮蔽物の HP を回復した時・破壊されていない限り・破壊された味方',
      headHas(/遮蔽物のHPを回復した時|遮蔽物が破壊されていない限り|遮蔽物が破壊され/),
    ],
  ];
  p('| 経路 | 側 | 中身 | 件数 | キャラ | 定義あり | キャラ（例） |');
  p('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [pathName, side, name, items] of paths) {
    p(`| ${pathName} | ${side} | ${name} | ${rowCounts(items)} | ${fmtChars(items)} |`);
  }
  p();
  p('- 件数は、動かす側は効果、読む側は行の数（中身ごとに数え方が違う。目安）');
  p();
}
