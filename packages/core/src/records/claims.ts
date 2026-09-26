// Stage 19-C・20-B: 結論の台帳。plan/design-stage19.md 2.4 節・plan/design-stage20.md 3.3 節。
// 結論は records/claims/C-NNNN.json に 1 件 1 ファイルで置き、plan/claims.md は話題ごとの一覧として生成する。
// 根拠の観測値は「根拠」の文にバッククォートで書いた ID から拾う（書くのは 1 か所だけ）。
// Stage 20-A: ID の桁を決め打ちしない（録画 3 桁以上・連番 2 桁以上・結論 4 桁以上）。通し番号の抜けは許す。

export const CLAIM_STATES = ['確定', '仮説', '棄却', '範囲外'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

/** 話題の語彙（claims.md の節の順）。1 件に 1 つ。足すときは設計書か検証記録で決める */
export const CLAIM_TOPICS = [
  '射撃（間隔・リロード・チャージ）',
  'バーストゲージ',
  'バーストの段階とフルバースト',
  '1 発の式・バフの掛かり方',
  '育成・ステータス',
  '命中率・距離',
  'スキル・キャラ固有',
  '敵・的・場面',
  '読み取り（HUD・画面）',
] as const;
export type ClaimTopic = (typeof CLAIM_TOPICS)[number];

/**
 * 根拠の等級（覆りにくさの順）。上から順に問い、最初に当てはまったものにする（plan/design-stage20.md 3.3 節）。
 * 新しく確定にするのは上の 3 つのとき（テストでは見ない。PR でオーナーが確かめる）。
 */
export const CLAIM_GRADES = ['厳密一致', '反復実測', 'データ明記', '単独実測', '推論'] as const;
export type ClaimGrade = (typeof CLAIM_GRADES)[number];

/** records/claims/C-NNNN.json の中身 */
export type ClaimFile = {
  id: string;
  /** 結論の文 */
  text: string;
  state: ClaimState;
  topic: ClaimTopic;
  /** 棄却の結論は省いてよい */
  grade?: ClaimGrade;
  /** 根拠。観測値はバッククォートで囲んだ ID で書く（`012-01`〜`012-04` のような範囲も可） */
  basis: string;
  /** モデル側（どのコード・データに入っているか。未実装・未反映ならそう書く） */
  model: string;
  /** 置き換えた（棄却した）結論の ID */
  replaces: string[];
  /** 更新日（YYYY-MM-DD） */
  updated: string;
};

export type Claim = ClaimFile & {
  /** 根拠の文から拾った観測値の ID */
  observations: string[];
};

const OBSERVATION_ID = /`((?:\d{3,}|L-[A-Z]{1,3})-\d{2,})`/g;
const OBSERVATION_RANGE = /`((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})`\s*〜\s*`\1-(\d{2,})`/g;
const CLAIM_ID = /^C-(\d{4,})$/;

/** 根拠の文から、バッククォートで囲んだ観測値の ID を拾う。「`012-01`〜`012-04`」は 012-01〜012-04 に展開する */
export function observationIdsIn(text: string): string[] {
  const ids: string[] = [];
  let rest = text;
  for (const m of text.matchAll(OBSERVATION_RANGE)) {
    const width = m[2]!.length;
    for (let n = Number(m[2]); n <= Number(m[3]); n++) ids.push(`${m[1]}-${String(n).padStart(width, '0')}`);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(OBSERVATION_ID)) ids.push(m[1]!);
  return [...new Set(ids)].sort();
}

/** 結論の番号（C-0012 → 12）。形が違えば NaN */
export function claimNumber(id: string): number {
  const m = CLAIM_ID.exec(id);
  return m === null ? Number.NaN : Number(m[1]);
}

/** ファイルの中身から結論を作り、番号順に並べる */
export function toClaims(files: readonly ClaimFile[]): Claim[] {
  return files
    .map((f) => ({ ...f, observations: observationIdsIn(f.basis) }))
    .sort((a, b) => claimNumber(a.id) - claimNumber(b.id) || a.id.localeCompare(b.id));
}

export function validateClaims(claims: readonly Claim[], observationIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const byId = new Map(claims.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const c of claims) {
    if (!CLAIM_ID.test(c.id)) errors.push(`${c.id}: ID は C-<4 桁以上の数字>`);
    else if (seen.has(c.id)) errors.push(`${c.id}: ID が重複している`);
    seen.add(c.id);
    if (!CLAIM_STATES.includes(c.state)) errors.push(`${c.id}: 状態が語彙に無い: ${c.state}`);
    if (!CLAIM_TOPICS.includes(c.topic)) errors.push(`${c.id}: 話題が語彙に無い: ${c.topic}`);
    if (c.grade === undefined) {
      if (c.state !== '棄却') errors.push(`${c.id}: 根拠の等級が無い（省けるのは棄却だけ）`);
    } else if (!CLAIM_GRADES.includes(c.grade)) errors.push(`${c.id}: 根拠の等級が語彙に無い: ${c.grade}`);
    if (c.text.trim() === '') errors.push(`${c.id}: 結論が空`);
    if (c.basis.trim() === '') errors.push(`${c.id}: 根拠が空`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.updated)) errors.push(`${c.id}: 更新日は YYYY-MM-DD`);
    for (const o of c.observations) if (!observationIds.has(o)) errors.push(`${c.id}: 観測値 ${o} が無い`);
    for (const r of c.replaces) {
      const old = byId.get(r);
      if (old === undefined) errors.push(`${c.id}: 置き換えた結論 ${r} が無い`);
      else if (old.state !== '棄却') errors.push(`${c.id}: 置き換えた結論 ${r} の状態が棄却でない（${old.state}）`);
    }
  }
  return errors;
}

/** 観測値 ID → それを根拠にした結論の ID */
export function claimsByObservation(claims: readonly Claim[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of claims) {
    for (const o of c.observations) map.set(o, [...(map.get(o) ?? []), c.id]);
  }
  return map;
}

/** 結論に結び付いた観測値（状態が確定か仮説の結論の根拠）。手入力の条件で比べる観測値は、どれかに結び付ける（Stage 20-A） */
export function supportedObservations(claims: readonly Claim[]): Set<string> {
  return new Set(claims.filter((c) => c.state === '確定' || c.state === '仮説').flatMap((c) => c.observations));
}

/** テストで許容幅を守らせる観測値（状態が確定の結論の根拠） */
export function gatedObservations(claims: readonly Claim[]): Set<string> {
  return new Set(claims.filter((c) => c.state === '確定').flatMap((c) => c.observations));
}

// ---- plan/claims.md（生成） ----

const CLAIMS_HEADER = `# 結論の台帳

- **このファイルは生成する（手で書かない）**。結論は \`records/claims/C-NNNN.json\` に 1 件 1 ファイルで置き、\`npm run records:check\` で作り直す（[design-stage20.md](design-stage20.md) 3.3 節）。
- 問い（機構・定数）からいまの結論を引くときは、ここを見る。話題ごとの節に、番号順に並べてある。
- 状態は \`確定\`・\`仮説\`・\`棄却\`・\`範囲外\` のどれか。\`範囲外\` は、モデルで扱わないものと、観測できないモデルの約束（単位など）。\`確定\` の結論の根拠の観測値は、\`npm test\` でモデルと比べ、許容幅の外なら落ちる。
- 根拠の等級は、上から順に問い、最初に当てはまったもの（[design-stage20.md](design-stage20.md) 3.3 節）。新しく \`確定\` にするのは 1〜3 のとき。
  1. \`厳密一致\`: 合わせ込みの定数を持たない式やデータから計算した値と、実測が端数まで一致した
  2. \`反復実測\`: 値を決めるのに使っていない実測でも再現した
  3. \`データ明記\`: ゲームのデータ（CDN の数値・説明文）に、解釈の余地なく一意に書かれている
  4. \`単独実測\`: 実測はあるが、1 回だけか、値をその実測に合わせて決めただけ
  5. \`推論\`: 上のどれでもない（解釈の余地のある読み・推論・推定・外部資料・観測できない約束）
- 訂正は、古い結論を消さずに状態を \`棄却\` にし、新しい結論の「置き換え」に古い ID を書く。ID は変えない・使い回さない。
- 根拠の \`010-01\` などは観測値の ID（\`records/observations/<録画 id>.json\`）。モデル側が「未反映」のものは、結論は確かだがモデルの既定などにまだ入れていない。
- 関連: [design-stage19.md](design-stage19.md) 2.4 節、[verification.md](verification.md)（2026-09-26 までの根拠の記録）、[residuals.md](residuals.md)（残差の一覧）`;

/** plan/claims.md の全文。話題の語彙の順に節を作り、節の中は番号順 */
export function renderClaims(claims: readonly Claim[]): string {
  const replacedBy = new Map<string, string[]>();
  for (const c of claims) for (const r of c.replaces) replacedBy.set(r, [...(replacedBy.get(r) ?? []), c.id]);
  const count = (state: ClaimState) => claims.filter((c) => c.state === state).length;
  const lines = [
    CLAIMS_HEADER,
    '',
    `件数: ${CLAIM_STATES.map((s) => `${s} ${count(s)}`).join('・')}（計 ${claims.length}）`,
  ];
  for (const topic of CLAIM_TOPICS) {
    const inTopic = claims.filter((c) => c.topic === topic);
    if (inTopic.length === 0) continue;
    lines.push('', `## ${topic}`, '');
    for (const c of inTopic) {
      const meta = [`状態: ${c.state}`, ...(c.grade ? [`等級: ${c.grade}`] : []), `更新日: ${c.updated}`];
      lines.push(
        `- **${c.id}** ${c.text}`,
        `  - ${meta.join('・')}`,
        `  - 根拠: ${c.basis}`,
        `  - モデル側: ${c.model}`,
      );
      if (c.replaces.length > 0) lines.push(`  - 置き換え: ${c.replaces.join('、')}`);
      const by = replacedBy.get(c.id);
      if (by !== undefined) lines.push(`  - 置き換えた結論: ${by.join('、')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
