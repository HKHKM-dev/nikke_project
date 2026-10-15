// スキルの効果の分類（plan/design-buff-state-heal.md 1 節・論点 2）: 全キャラの説明文（日本語。宝物版を含む）を、■ の行と
// 「」の効果の句に分け、きっかけ・条件・対象・効果・修飾を正規表現で読む。読みは機械的なもので、件数は目安。
// 一覧（生成物 plan/skill-catalog.md）は skills/catalogDoc.ts が書く。読み違いは、説明文の書き損じの表（TEXT_FIXES）と、
// 句の読み方の表（META・KINDS・TRIGGERS・CONDITIONS・TARGETS）で直す。
import type { CharacterData, SkillRaw } from '../types.ts';
import { SKILL_SLOTS } from './types.ts';

/** stat の▲▼の読み。canon は一覧の stat の鍵（読めなかった名前は「?名前」） */
export type CatalogStat = { name: string; canon: string; dir: 'up' | 'down'; scaling: string };

/** 効果の句 1 つの読み */
export type QuoteReading = {
  /** 種類の鍵（'stat'・'damage:dot'・'state:grant' など）。meta は直前の効果に付く修飾 */
  kind: string;
  meta?: true;
  text?: string;
  /** 名前の付いた状態（「〈名前〉：中身」の名前） */
  state?: string;
  /** キャラ固有のカウンタの名前（勇者レベル・乗車券など。状態の一覧には入れない） */
  counter?: string;
  stat?: CatalogStat;
  sub?: string;
  mods?: string[];
};

/** 効果を付ける側から見た対象の側 */
export type CatalogSide = 'enemy' | 'cover' | 'self' | 'ally' | 'unknown';

/** ■ の行 1 つ */
export type CatalogLine = {
  rid: number;
  name: string;
  /** skill1・skill2・burst と、宝物版は treasure.skill1 など */
  slot: string;
  /** スロットの中の行の番号 */
  li: number;
  /** 最初の「 か「機能」より前（きっかけ・条件・対象） */
  head: string;
  /** 改行を除いた行の全体 */
  flat: string;
  triggers: string[];
  conditions: string[];
  targets: string[];
  defined: boolean;
  /** 行の最初の効果より前に出た修飾 */
  lineMods?: string[];
};

/** 効果の句 1 つ（行の頭と、句の読み） */
export type CatalogEffect = QuoteReading & {
  rid: number;
  name: string;
  slot: string;
  li: number;
  defined: boolean;
  triggers: string[];
  /** きっかけの書かれていない句: バーストのスロットは burstUse、スキルのスロットは none（持続なら常時、そうでなければ CT ごと） */
  implicit: 'burstUse' | 'none' | null;
  conditions: string[];
  targets: string[];
  side: CatalogSide;
  quote: string;
  head: string;
  subHead: string;
};

type Rules = readonly (readonly [RegExp, string])[];

/**
 * 説明文の書き損じ（読み違いの例外の表）。ロザンナ：シックオーシャンの「1秒間隔「…秒間維持」の閉じ括弧の欠けと、
 * ギルティ：マイティバニーの 1 か所だけ「：」の無い「バニーモードスタンス」
 */
const TEXT_FIXES: readonly (readonly [RegExp, string])[] = [
  [/([XN\d.]+秒間隔)「/g, '$1」「'],
  [/バニーモードスタンス/g, 'バニーモード：スタンス'],
];

/** 説明文の書式（色・用語の印・値の差し込み）を除き、書き損じを直す。値は X にする */
export function cleanDescription(s: string): string {
  let out = s
    .replace(/<word_group=\d+>/g, '')
    .replace(/<\/word_group>/g, '')
    .replace(/<color=[^>]*>/g, '')
    .replace(/<\/color>/g, '')
    .replace(/\{description_value_(\d+)\}/g, 'X')
    .replace(/｣/g, '」')
    .replace(/\r/g, '');
  for (const [re, to] of TEXT_FIXES) out = out.replace(re, to);
  return out;
}

// ---- 効果の句 ----

/** 「〈名前〉：…」の名前が状態でない見出し */
const NOT_STATE_PREFIX =
  /^(初回ダメージ|通常ダメージ|維持時間|追加効果\d*|注意事項|ダメージ|チャージ時間|最大装弾数|フルチャージダメージ|解除条件|使用武器変更|使用武器を変更|攻撃間隔|機能\d*|勇者レベルアップ効果|ヘイト)$/;

/** 直前の効果に付く修飾（持続の形・スタック・解除不可など） */
const META: Rules = [
  [/^[XN\d.]+秒間維持$/, 'dur:seconds'],
  [/^持続$/, 'dur:permanent'],
  [/^[XN\d]+発間維持$/, 'dur:shots'],
  [/^リロード[XN\d]+回に適用$/, 'dur:reloads'],
  [/フルバーストタイムの間持続/, 'dur:fullBurst'],
  [/^変身解除まで$/, 'dur:untilState'],
  [/回数分だけ維持/, 'dur:scaled'],
  [/復活後も維持/, 'meta:keepOnRevive'],
  [/^[XN\d]+スタック$/, 'stack:max'],
  [
    /^最大[XN\d]+(個|回|発|本|段階|％|レベルまで成長|枚まで)?$|最大[XN\d]+まで蓄積可能|^最大[XN\d]+発保存$|^最大[XN\d]+レベルまで成長$/,
    'stack:cap',
  ],
  [/^解除不可$/, 'meta:undispellable'],
  [/^戦闘中[XN\d]+回発動$|^[XN\d]+回発動$|^最大[XN\d]+回$/, 'meta:limitedUses'],
  [/^下位効果のスタック適用$/, 'meta:sequential'],
  [/使用回数別の(追加)?効果|開始回数別の?効果/, 'meta:eventCountStaged'],
  [/攻撃回数別の効果|攻撃命中回数別の効果/, 'meta:shotCycle'],
  [
    /各段階の効果のみ適用|該当効果のみ適用|段階別の(追加)?効果|状態別の効果|スタック量別の効果|別の効果$|別効果$|部隊構成による効果|部隊構成別の効果|条件に合う.*のみ適用|モード適用別効果/,
    'meta:staged',
  ],
  [/^[XN\d.]+秒間隔$/, 'meta:interval'],
  [/^[XN\d.]+秒$/, 'meta:seconds'],
  [/^[XN\d]+回$/, 'meta:count'],
  [/^最低[XN\d]+を維持$/, 'meta:floor'],
  [/命中時にバフ効果適用|^初回発動時/, 'meta:misc'],
  // 使用武器変更のまとまりの中の見出し（マクスウェル：オーディナリーメカニックの「チャージ時間」）。効果でも状態でもない
  [/^(チャージ時間|攻撃間隔|最大装弾数|フルチャージダメージ)$/, 'meta:weaponProp'],
  [/発動後.*解除|適用後.*(解除|消去)|時に?解除$|時スタック解除$|一定条件で解除|解除時初期化/, 'state:removeOn'],
];

/** キャラ固有のカウンタ（上限・増減・「× 枚数」の値を持ち、時間で外れない）。状態の一覧には入れない */
const RESOURCE_RE =
  /火力ゲージ|MP|バッテリー|超感覚|キャプチャーチェーン|幽霊キャプチャー|廃品|自家製弾倉|乗車券|勇者レベル|オーバーエネルギー|経験値|使用回数[XN\d]+回▼/;

/** 効果の種類（上から順に最初に当たったもの） */
const KINDS: Rules = [
  [/持続ダメージ$/, 'damage:dot'],
  [/分配ダメージ$|分配ダメージ。/, 'damage:distributed'],
  [/追加ダメージ$/, 'damage:additional'],
  [/防御力無視バーストスキルダメージ$/, 'damage:burstTrue'],
  [/バーストスキルダメージ$/, 'damage:burst'],
  [/防御力無視ダメージ$/, 'damage:true'],
  [/コア命中ダメージ$/, 'damage:core'],
  [/固定ダメージ/, 'damage:fixed'],
  [/最大HP.*(攻撃力に合算|攻撃力として換算).*ダメージ$/, 'damage:hpScaled'],
  [/の[XN\d]+％の?ダメージ$|攻撃力の[XN\d]+％のダメージ/, 'damage:skill'],
  [/蓄積爆破|烙印|蓄積$|最大ダメージ蓄積量/, 'damage:accumulate'],
  [/遮蔽物/, 'cover'],
  [/持続回復/, 'heal:overTime'],
  [/攻撃ダメージの[XN\d]+％(を|の)?回復/, 'heal:lifesteal'],
  [/バリアHP.*回復/, 'heal:barrier'],
  [/デコイ.*回復/, 'heal:decoy'],
  [/復活/, 'heal:revive'],
  [/超過.*HP回復量.*保存/, 'heal:overflowStore'],
  [/HP回復均等分配/, 'heal:share'],
  [/蓄積量に応じた回復|忍法救急キット|最大蓄積量はスキル発動者/, 'heal:accumulated'],
  [/受けるHP回復量|与えるHP回復量|HP回復量[XN\d]+％/, 'stat:healAmount'],
  [/MP[XN\d]*回復/, 'resource'],
  [/回復/, 'heal:instant'],
  [/次のバリアのHP/, 'stat:barrierHp'],
  [/バリアに与えるダメージ/, 'stat:barrierDamage'],
  [/バリア/, 'shield:barrier'],
  [/無敵/, 'shield:invincible'],
  [/不屈/, 'shield:undying'],
  [/単一攻撃(の)?対象から除外/, 'shield:untargetable'],
  [/分身/, 'shield:decoy'],
  [/受けるダメージ(均等|偏差)分配/, 'shield:damageShare'],
  [/敵全体を挑発/, 'control:selfTaunt'],
  [/^挑発$/, 'control:taunt'],
  [/気絶$/, 'control:stun'],
  [/移動不可|強制移動/, 'control:move'],
  [/ロックオン$/, 'control:lockOn'],
  [/警戒対象指定|ターゲット殲滅|^命中部位$/, 'control:mark'],
  [/効果解除/, 'buffOp:dispel'],
  [/免疫/, 'buffOp:immunity'],
  [/効果無効/, 'buffOp:nullify'],
  [/スタックコピー|コピー$|コピー X％$/, 'buffOp:copy'],
  [/スタック量 ?[XN\d]+個[▲▼]/, 'buffOp:stackChange'],
  [/弾丸チャージ|弾丸ポーチ|^弾丸泥棒$|^代用弾丸$/, 'instant:ammoRefill'],
  [/強制リロード/, 'instant:forceReload'],
  [/残弾数[XN\d]+％(減少|低下)/, 'instant:ammoDrain'],
  [/^バーストゲージのチャージ ?[XN\d]+％$/, 'instant:burstGauge'],
  [/バーストスキルクールタイム ?[XN\d]+秒▼/, 'instant:burstCooldown'],
  [/バーストスキルクールタイム ?[XN\d]+秒▲/, 'instant:burstCooldownUp'],
  [/スキル[N\d]の?クールタイム|発動間隔[XN\d]+秒▼|再発動周期[XN\d]+秒▼/, 'instant:skillCooldown'],
  [/スキル[N\d]強制使用/, 'instant:forceSkill'],
  [/回数条件[XN\d]+回▼|攻撃回数の条件が/, 'cycle:every'],
  [/フルバーストタイム.*[XN\d]+秒▲/, 'fullBurst:extend'],
  [/フルバーストタイム[XN\d]+秒▼/, 'fullBurst:shorten'],
  [/バースト再突入/, 'burst:reentry'],
  [/バースト[XN\d]に変更/, 'burst:changeStep'],
  [/使用武器(を)?変更|武器変更|^殲滅モード$/, 'weaponChange'],
  [/^貫通特化$/, 'weaponChange:pierce'],
  [
    /順番に攻撃|呼び出し|展開|シューティングスター|オートファイア|連続攻撃|回数分だけ攻撃|^粘着榴弾$|^火力爆発$|^ノイズバレット$|^エンハンスバレット$|^マグナム弾|^硫酸弾$|緊急出動/,
    'autoAttack',
  ],
  [
    /通常攻撃を防御力?無視ダメージ|防御力無視ダメージとして適用|防御力無視ダメージに変化|防御力無視ダメージを適用|防御力無視ダメージに変更/,
    'flag:trueDamageConversion',
  ],
  [/有利コードのダメージ適用/, 'flag:elementAdvantage'],
  [/装弾数無限/, 'flag:infiniteAmmo'],
  [/に固定$|で固定$|をN?[XN\d]*個に固定/, 'stat:fixed'],
  [/超過した値をチャージダメージに変換|超過した値の[XN\d]+％のチャージダメージ▲/, 'stat:overflowConvert'],
  [RESOURCE_RE, 'resource'],
  [/発動不可$/, 'state:block'],
  [/効果を追加$/, 'state:extra'],
];

/** stat の名前（説明文の▲▼の前の名前）から一覧の鍵 */
const STAT_NAMES: Rules = [
  [/^攻撃力$/, 'attack'],
  [/^攻撃ダメージ$/, 'attackDamage'],
  [/^クリティカル確率$/, 'critRate'],
  [/^クリティカルダメージ$/, 'critDamage'],
  [/^通常攻撃のクリティカル確率$/, 'normalCritRate'],
  [/^チャージダメージ$/, 'chargeDamage'],
  [/^チャージダメージ倍率$/, 'chargeDamageMultiplier'],
  [/^分配ダメージ$/, 'distributedDamage'],
  [/^持続ダメージ$/, 'sustainedDamage'],
  [/^防御力無視ダメージ$/, 'trueDamage'],
  [/^有利コードの攻撃ダメージ$/, 'elementDamage'],
  [/^コアダメージ$/, 'coreDamage'],
  [/^発射体爆発ダメージ$/, 'projectileExplosionDamage'],
  [/^通常攻撃ダメージ(倍率)?$/, 'normalAttackDamage'],
  [/^受けるダメージ$/, 'damageTaken'],
  [/^最大装弾数$/, 'maxAmmo'],
  [/^リロード速度$|^リロード比率$/, 'reloadSpeed'],
  [/^チャージ速度$/, 'chargeSpeed'],
  [/^チャージ時間$/, 'chargeTime'],
  [/^命中率$/, 'hitRate'],
  [/^バーストゲージのチャージ速度$/, 'burstGaugeSpeed'],
  [/^防御力$|防御力$/, 'defense'],
  [/^最大HP(のみ)?$/, 'maxHp'],
  [/^貫通ダメージ$/, 'pierceDamage'],
  [/^爆発範囲$/, 'explosionRange'],
  [/^パーツダメージ$/, 'partsDamage'],
  [/^阻止部位の攻撃ダメージ$/, 'interruptPartDamage'],
  [/^攻撃速度$/, 'attackSpeed'],
  [/^発射体付着ダメージ$/, 'projectileStickDamage'],
  [/^順番攻撃ダメージ$/, 'sequentialAttackDamage'],
  [/^ペレット数$/, 'pelletCount'],
  [/^適正(最小|最大)射程距離$/, 'range'],
  [/^マシンガン立ち上げ速度$/, 'spinUp'],
  [/^現在のHP$/, 'currentHp'],
  [/^貫通範囲$/, 'pierceRange'],
  [/から受けるダメージ$/, 'damageTakenFromElement'],
  [/スキル対象の説明部分が.*バーストスキルダメージ$/, 'burstDamageByTargetText'],
  [/該当の発射体に与えるダメージ$/, 'projectileTargetDamage'],
  [/^受けるHP回復量$/, 'healReceived'],
  [/^与えるHP回復量$|^HP回復量$/, 'healGiven'],
  [/^次のバリアのHP$/, 'barrierHp'],
  [/^バリアに与えるダメージ$/, 'barrierDamage'],
  [/維持時間$|持続時間$/, 'stateDuration'],
  [/効果$|蓄積割合$|最大蓄積量$|追加効果適用対象$|追加効果攻撃範囲$/, 'stateParam'],
];

/** 「〈stat〉X％▲」の形の読み。▲▼（か「防御力X％」）が無ければ null */
export function statOf(body: string): CatalogStat | null {
  const m = body.match(/^(.*?)\s*([XN\d.]+)\s*(％|発|秒|個)?\s*(倍率)?\s*(×.+?)?(▲|▼|増加|拡大|拡張|低下)?$/);
  if (!m || (!m[6] && !/防御力X％$/.test(body))) return null;
  let name = (m[1] ?? '').trim();
  let scaling = 'ratio';
  const strip = (re: RegExp, s: string) => {
    if (re.test(name)) {
      scaling = s;
      name = name.replace(re, '');
    }
  };
  strip(/^スキル発動者基準で(の)?/, 'casterBased');
  strip(/^スキル発動者の最終最大HP基準で/, 'casterHp');
  strip(/^スキル発動者の防御力に比例して/, 'casterDefense');
  strip(/^失ったHP[XN\d]+％ごとに/, 'lostHp');
  strip(/^自分の最終最大装弾数[XN\d]+発ごとに/, 'perMaxAmmo');
  if (m[5]) scaling = 'perStack';
  if (m[4]) name = name + '倍率';
  if (m[3] === '発' || m[3] === '個') scaling = scaling === 'ratio' ? 'flat' : scaling;
  if (m[3] === '秒') scaling = 'seconds';
  const dir = m[6] === '▼' || m[6] === '低下' ? 'down' : 'up';
  const canon = STAT_NAMES.find(([re]) => re.test(name))?.[1];
  return { name, canon: canon ?? `?${name}`, dir, scaling };
}

/** 効果の句（「」の中）1 つの読み */
export function classifyQuote(q: string): QuoteReading {
  let body = q.trim();
  if (/最大HPの[XN\d]+％分の\s*攻撃力▲/.test(body)) {
    const named = /^([^：]+)：/.exec(body)?.[1];
    return {
      kind: 'stat',
      stat: { name: '攻撃力', canon: 'attack', dir: 'up', scaling: 'casterHp' },
      ...(named !== undefined ? { state: named } : {}),
    };
  }
  for (const [re, tag] of META) if (re.test(body)) return { kind: tag, meta: true, text: body };
  // 「スキル発動者の防御力に比例して X％防御力▲」（マルチャーナ）: 値が stat の名前の前にある形を、ほかと同じ並びにする
  body = body.replace(/^(.*に比例して)\s*([XN\d.]+％)\s*(.+?)(▲|▼)$/, '$1$3$2$4');
  let state: string | undefined;
  const m = body.match(/^([^：]+)：(.*)$/);
  if (m && !NOT_STATE_PREFIX.test((m[1] ?? '').trim())) {
    state = (m[1] ?? '').trim();
    body = (m[2] ?? '').trim();
  }
  // 「〈名前〉：最大 N レベルまで成長」「〈名前〉：最大 N 枚まで」: 「：」の後ろは上限（修飾）。固有のカウンタなら状態の一覧に入れない
  if (state !== undefined) {
    const tag = META.find(([re]) => re.test(body))?.[1];
    if (tag !== undefined) {
      if (RESOURCE_RE.test(state)) {
        return {
          kind: 'resource',
          counter: state.replace(/[XN\d]+枚発券$/, ''),
          text: `${state}：${body}`,
          mods: [tag],
        };
      }
      return { kind: 'state:grant', state, mods: [tag] };
    }
  }
  // 同じスキルが状態を外す「〈名前〉解除」（Removes）と「〈名前〉消去」（Cancels）は別の分類（本体の論点 8。消去は解除不可の状態も外す）
  const removal = (s: string) => (s.endsWith('消去') ? 'state:cancel' : 'state:remove');
  if (state === undefined && /^(.+?)(解除|消去)$/.test(body) && !/効果解除/.test(body)) {
    return { kind: removal(body), state: body.replace(/(解除|消去)$/, '').replace(/スタック$/, '') };
  }
  // 「ステージパート：ボーカル消去」（ミント）: 名前そのものが「：」を含む状態の消去・解除
  if (
    state !== undefined &&
    /^[^、。]+?(解除|消去)$/.test(body) &&
    !/効果解除|受けると解除|時に?解除|スタック解除|除外/.test(body)
  ) {
    return { kind: removal(body), state: `${state}：${body.replace(/(解除|消去)$/, '')}` };
  }
  if (/が.+に変化$/.test(body)) return { kind: 'state:switch', text: body };
  const st = statOf(body);
  const withState = state !== undefined ? { state } : {};
  const tag = KINDS.find(([re]) => re.test(body))?.[1];
  if (tag !== undefined) {
    if (tag.startsWith('stat:') && st) return { kind: 'stat', stat: st, sub: tag, ...withState };
    return { kind: tag, text: body, ...withState };
  }
  if (st) return { kind: 'stat', stat: st, ...withState };
  if (state !== undefined && body === '') return { kind: 'state:grant', state };
  if (state !== undefined) return { kind: 'state:grant', state: `${state}：${body}` };
  return { kind: 'state:grant?', state: body };
}

// ---- 頭（きっかけ・条件・対象） ----

const TRIGGERS: Rules = [
  [/戦闘開始時/, 'battleStart'],
  [/フルバーストタイム(が|の)?(発動|開始)(した)?時|フルバーストタイム発動時/, 'fullBurstStart'],
  [/フルバーストタイム(が)?終了(した)?時/, 'fullBurstEnd'],
  [/バーストスキルを([XN\d]+回)?使用した時|バーストスキル使用時/, 'burstUse'],
  [/バースト([N\dⅠⅡⅢ]+|X)段階突入時|バースト[ⅠⅡⅢ]に突入時/, 'burstStageEnter'],
  [/フルチャージ攻撃が.*命中した時|フルチャージして[XN\d]+回命中/, 'fullChargeHit'],
  [
    /フルチャージして攻撃した時|フルチャージで[XN\d]+回攻撃した時|フルチャージした時|フルチャージして[XN\d]+回攻撃した時|フルチャージ攻撃で[XN\d]+回攻撃した時|フルチャージ状態で[XN\d]+回攻撃した時/,
    'fullChargeShot',
  ],
  [/フルチャージをX秒以上維持|フルチャージ状態をX秒以上/, 'chargeHold'],
  [/フルチャージではない通常攻撃を/, 'partialChargeShot'],
  [/クリティカル命中した時/, 'critHit'],
  [/コアに?[XN\d]+回命中|コアに命中/, 'coreHit'],
  [/ペレットが[XN\d]+回命中|ペレットが[XN\d]+個以上命中/, 'pelletHit'],
  [/通常攻撃が([XN\d]+回)?命中した時|通常攻撃(で|を)[XN\d]+回命中した時|攻撃が[XN\d]+回命中/, 'normalHit'],
  [
    /通常攻撃で[XN\d]+回攻撃した時|^[XN\d]+回攻撃した時|、[XN\d]+回攻撃した時|通常攻撃を([XN\d]+回)?(した|行った)時|通常攻撃時|[XN\d]+回射撃した時/,
    'normalShot',
  ],
  [/最後の弾丸(が|で)(命中した時|攻撃した時|攻撃した後)|最後の弾丸で攻撃時/, 'lastShot'],
  [/リロードが完了した時|リロード完了時/, 'reloadComplete'],
  [/[XN\d]+秒ごと|[XN\d]+秒毎/, 'timer'],
  // ツールチップ「特定のタイミング」（T5）: 周期ではなく、フルバースト終了・バースト 3 段階突入・敵の出現
  [/特定のタイミング/, 'specificTiming'],
  [/回復効果が適用され/, 'healed'],
  [/攻撃を受けた時|撃たれたら/, 'damaged'],
  [/敵を倒した時|敵が(破壊|撃破)された時/, 'kill'],
  [/戦闘不能/, 'allyDown'],
  [/パーツを破壊|パーツに([XN\d]+回)?命中|発射体を破壊/, 'parts'],
  [/敵(が)?出現|ラプチャーが出現|ラプチャーが[XN\d]+機/, 'enemySpawn'],
  [/バリア適用時/, 'barrierApplied'],
  [/が付与された時|(が|を)?適用された時|が適用される時|が適用時|適用時/, 'stateApplied'],
  [/状態が終了した時|フル・?フルチャージ状態が終了/, 'stateEnded'],
  [/HP.*(以下|以上|未満)になった時|HPが最大になった時/, 'hpThreshold'],
  [/消費した弾の合計/, 'teamAmmo'],
  [/スタック状態ならスタック解除後|フルスタック状態の時、スタック解除後|スタック解除後/, 'fullStackConsume'],
  [/ターゲットが出現/, 'enemyEvent'],
  [/デコイが存在/, 'decoyPresent'],
  [/[XN\d]+％の確率で/, 'chance'],
  [
    /経験値[XN\d]+スタックごと|廃品を[XN\d]+個回収|MPチャージ時|MP使用後|バッテリーが|勇者レベルアップ時|オーバーエネルギー[XN\d]+％状態になった時|幽霊キャプチャー発動時|ボーナス/,
    'resourceEvent',
  ],
  [/がクリティカル命中した時|が命中した時、対象が|殲滅の効果発動時|スキル[N\d]を発動した時|を発動した時/, 'skillEvent'],
  [/遮蔽物のHPを回復した時/, 'coverHealed'],
  [/同時に命中/, 'multiHit'],
  [/戦闘中[XN\d]回/, 'limited'],
];

const CONDITIONS: Rules = [
  [/フォーカス状態/, 'focus'],
  [/自分が.+?のフルスタック(状態|時)|自分が.+?フルスタック状態|最大数なら/, 'selfState:fullStack'],
  [
    /自分が.+?状態(でなければ|ではない)|自分が.+?状態ではない場合|状態でなければ|状態ではない(時|味方)/,
    'selfState:absent',
  ],
  [
    /自分が.+?状態(なら|の場合|の時)|自分が.+?段階|状態の時(のみ|に限り)|状態の場合のみ|が展開された状態なら/,
    'selfState',
  ],
  [/自分に.+?適用中|自分に.+?が適用時/, 'selfState:while'],
  [/対象が.+?状態|予告状状態/, 'enemyState'],
  [/対象が.+?コードなら|コードの敵/, 'enemyElement'],
  [/HPが?[XN\d]+％(以上|以下|未満)|HPが最大|HPの割合が.*以下|HP[XN\d]+％以下/, 'hp'],
  [/同じ部隊の味方がいれば/, 'squad'],
  [/基本バースト段階が[XN\d]+の味方が|基本バースト段階.*いなければ|部隊構成/, 'burstStepMix'],
  [/直前に自分がバーストスキルを使用していれば/, 'usedBurst'],
  [/フルバーストタイム(中|なら|の持続中|持続中|発動中)|フルバースト状態でなければ/, 'inFullBurst'],
  [/敵が[XN\d]+機以上|ラプチャーが[XN\d]+機(以上|以下)/, 'enemyCount'],
  [/生存している限り|生存状態|破壊されていない限り/, 'alive'],
  [/武器変更状態の場合/, 'selfWeaponChanged'],
  [/対象がターゲットなら/, 'enemyIsTarget'],
  [/適正射程距離内/, 'range'],
  [/ラプチャーなら|ラプチャー$/, 'enemyType'],
  [/[XN\d]+本未満なら|勇者レベルが[XN\d]+以上/, 'resource'],
  [/バリア適用状態/, 'selfBarrier'],
];

const TARGETS: Rules = [
  [/自分と自分の両隣|両隣/, 'ally:neighbors'],
  [/直前にバーストスキルを使用した/, 'ally:burstUsers'],
  [/最終攻撃力が最も高い味方|攻撃力が最も高い味方/, 'ally:topAttack'],
  [/残りの?HPの(割合|数値|値)が最も低い味方|残りHPの値が最も低い味方/, 'ally:lowestHp'],
  [/基本チャージ時間が一番長い味方/, 'ally:longestChargeTime'],
  [/最大HPが最も高い味方|最終防御力が最も高い味方/, 'ally:topOther'],
  // 「デバフ効果がかけられている味方のうち、ランダムに N 機に」（ココア）は条件ではなく対象の絞り込み
  [/デバフ効果がかけられている味方/, 'ally:debuffed'],
  [/ランダムな味方|ランダムに[XN\d]+機/, 'ally:random'],
  [/自分の王|自分のアイドル/, 'ally:specific'],
  [/遮蔽物/, 'cover'],
  [/自分を除く.*味方全体/, 'ally:alliesExceptSelf'],
  [/(を所持する|コードの|型の|同じ部隊の|基本バースト段階が[XN\d]+の|状態の|状態ではない)味方/, 'ally:alliesFiltered'],
  [/味方全体|味方[XN\d]+機/, 'ally:allies'],
  [/自分に|自分$|^自分と|自分と自分を除く/, 'self'],
  [/敵全体|攻撃範囲内の敵/, 'enemy:all'],
  [/対象に|対象本体|同じ敵|命中した敵|予告状状態の対象/, 'enemy:hit'],
  [/最も(高い|低い|近い)敵|照準線に最も近い敵|ランダムな?の?敵|型の敵|指定した敵|敵[XN\d]+機/, 'enemy:selected'],
];

function tagsOf(rules: Rules, text: string): string[] {
  return rules.filter(([re]) => re.test(text)).map(([, tag]) => tag);
}

function normTargets(t: string[]): string[] {
  let out = t;
  if (out.some((x) => x.startsWith('ally:') && x !== 'ally:allies')) out = out.filter((x) => x !== 'ally:allies');
  if (out.includes('ally:alliesExceptSelf')) out = out.filter((x) => x !== 'self');
  if (out.includes('ally:debuffed')) out = out.filter((x) => x !== 'ally:random');
  return out;
}

function sideOf(targets: readonly string[]): CatalogSide {
  if (targets.length === 0) return 'unknown';
  if (targets.every((t) => t.startsWith('enemy'))) return 'enemy';
  if (targets.some((t) => t === 'cover')) return 'cover';
  if (targets.every((t) => t === 'self')) return 'self';
  return 'ally';
}

/** 頭のきっかけ。重なって当たる読みは、より狭いほうを残す */
function lineTriggers(head: string): string[] {
  let triggers = tagsOf(TRIGGERS, head);
  if (triggers.includes('healed')) triggers = triggers.filter((t) => t !== 'stateApplied');
  if (triggers.includes('barrierApplied')) triggers = triggers.filter((t) => t !== 'stateApplied');
  if (triggers.includes('chargeHold')) triggers = triggers.filter((t) => t !== 'fullChargeShot');
  if (triggers.includes('critHit')) triggers = triggers.filter((t) => t !== 'normalHit' && t !== 'skillEvent');
  if (triggers.includes('partialChargeShot')) triggers = triggers.filter((t) => t !== 'normalShot');
  return triggers;
}

/** キャラのスロット（基礎版の skill1・skill2・burst と、宝物版の同じ 3 つ） */
function slotsOf(c: CharacterData): [string, SkillRaw][] {
  const out: [string, SkillRaw][] = SKILL_SLOTS.map((s) => [s, c.skills[s]]);
  if (c.treasure !== null) for (const s of SKILL_SLOTS) out.push([`treasure.${s}`, c.treasure.skills[s]]);
  return out;
}

/** 全キャラの説明文を、行と効果の句に分ける。characters は resourceId の順に並べ直す */
export function classifyCharacters(
  characters: readonly CharacterData[],
  defined: ReadonlySet<number>,
): { lines: CatalogLine[]; effects: CatalogEffect[] } {
  const lines: CatalogLine[] = [];
  const effects: CatalogEffect[] = [];
  for (const c of [...characters].sort((a, b) => a.resourceId - b.resourceId)) {
    const isDefined = defined.has(c.resourceId);
    for (const [slot, skill] of slotsOf(c)) {
      const raw = cleanDescription(skill.description.ja)
        .split('■')
        .map((l) => l.trim())
        .filter(Boolean);
      raw.forEach((line, li) => {
        const flat = line.replace(/\n/g, '');
        // 頭: 最初の「 か「機能」の前
        const cut = Math.min(...[flat.indexOf('「'), flat.indexOf('機能')].filter((i) => i >= 0), flat.length);
        const head = flat.slice(0, cut);
        const triggers = lineTriggers(head);
        const conditions = tagsOf(CONDITIONS, head);
        const lineTargets = normTargets(tagsOf(TARGETS, head));
        const lineRec: CatalogLine = {
          rid: c.resourceId,
          name: c.name.ja,
          slot,
          li,
          head,
          flat,
          triggers,
          conditions,
          targets: lineTargets,
          defined: isDefined,
        };
        lines.push(lineRec);
        let last: CatalogEffect | null = null;
        // 「効果N：」の小項目ごとに対象を持つことがある
        for (const part of flat.slice(cut).split(/効果\d+：|追加効果\d*：?(?=「)/)) {
          const q = part.indexOf('「');
          const subHead = q >= 0 ? part.slice(0, q) : part;
          const subTargets = normTargets(tagsOf(TARGETS, subHead));
          const subTriggers = tagsOf(TRIGGERS, subHead);
          let targets = subTargets.length > 0 ? subTargets : lineTargets;
          // 「効果N の対象：敵全体」のように、対象が項目の後ろに書かれている形
          const trailing = /の対象：(.+)$/.exec(part)?.[1];
          if (trailing !== undefined) {
            const t = normTargets(tagsOf(TARGETS, `${trailing.replace(/（.*$/, '')}に`));
            if (t.length > 0) targets = t;
          }
          let prevEnd = q;
          for (const m of part.matchAll(/「([^」]*)」/g)) {
            // 項目の途中で対象が変わる形（「自分に：「…」命中した敵に：「…」」）
            const between = part.slice(prevEnd, m.index);
            prevEnd = m.index + m[0].length;
            const midTargets = normTargets(tagsOf(TARGETS, between));
            if (between.length > 0 && midTargets.length > 0) targets = midTargets;
            const quote = m[1] ?? '';
            const reading = classifyQuote(quote);
            if (reading.kind === 'meta:weaponProp') continue;
            if (reading.meta) {
              if (last !== null) (last.mods ??= []).push(reading.kind);
              else (lineRec.lineMods ??= []).push(reading.kind);
              continue;
            }
            const rec: CatalogEffect = {
              ...reading,
              rid: c.resourceId,
              name: c.name.ja,
              slot,
              li,
              defined: isDefined,
              triggers: subTriggers.length > 0 ? [...triggers, ...subTriggers] : triggers,
              implicit:
                triggers.length + subTriggers.length === 0 ? (slot.endsWith('burst') ? 'burstUse' : 'none') : null,
              conditions,
              targets,
              side: sideOf(targets),
              quote,
              head,
              subHead,
            };
            effects.push(rec);
            last = rec;
          }
        }
      });
    }
  }
  return { lines, effects };
}
