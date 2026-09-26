// Stage 20-D: 文書の中の ID の参照を拾う（plan/design-stage20.md 3.6 節）。テストで、拾った ID がどれも実在することを確かめる。
// - 頭に記号の付く ID のうち、結論（C-）と検証記録（V-）は、囲まずに書いたものも拾う（取り違えない形なので）
// - 旧の録画（L-<タグ>）とその観測値（L-<タグ>-NN）は、バッククォートで囲んだものだけ拾う
// - 頭に記号の付かない ID（録画の 064、観測値の 064-01）は、散文からは拾わない（番号やファイル名の一部を誤って拾うため）
// - コードブロックの中は見ない

export type IdReference = {
  kind: 'claim' | 'verification' | 'recording' | 'observation';
  id: string;
};

export function idReferencesIn(markdown: string): IdReference[] {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  const refs: IdReference[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9_-])([CV])-(\d{4,})(?![0-9A-Za-z_-])/g)) {
    refs.push({ kind: m[1] === 'C' ? 'claim' : 'verification', id: `${m[1]}-${m[2]}` });
  }
  for (const m of text.matchAll(/`(L-[A-Z]{1,3})(-\d{2,})?`/g)) {
    refs.push(m[2] === undefined ? { kind: 'recording', id: m[1]! } : { kind: 'observation', id: `${m[1]}${m[2]}` });
  }
  return refs;
}
