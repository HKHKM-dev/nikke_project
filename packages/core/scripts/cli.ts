// CLI の引数の読み取り（packages/core/scripts と tools の道具で共有。plan/design-workflow-simplification-16.md 2 節）。
// 使い方は、各スクリプトの冒頭の // のコメントにだけ書く。-h・--help ではそれとオプションの一覧を出して終わり、知らない引数や
// 値の形の誤りでは、エラーの 1 行と使い方を出して終わる（スタックトレースを出さない）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';

type Options = NonNullable<ParseArgsConfig['options']>;
type Config = Omit<ParseArgsConfig, 'args'> & { options?: Options };

/** ファイルの冒頭の // のコメントの行（// と続く空白 1 つを外す） */
export function headerComment(source: string): string {
  const lines: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith('//')) break;
    lines.push(line.slice(2).replace(/^ /, ''));
  }
  return lines.join('\n');
}

/** オプションの一覧（--名前 <値>・-短い名前・何度でも渡せるものは「…」） */
export function optionList(options: Options): string {
  return Object.entries(options)
    .map(([name, o]) => {
      const short = o.short === undefined ? '' : `-${o.short}, `;
      const value = o.type === 'string' ? ' <値>' : '';
      return `  ${short}--${name}${value}${o.multiple === true ? ' …' : ''}`;
    })
    .join('\n');
}

/** 使い方の文（冒頭のコメントと、オプションの一覧） */
export function usageText(source: string, options: Options): string {
  const list = optionList(options);
  return list === '' ? headerComment(source) : `${headerComment(source)}\n\nオプション:\n${list}`;
}

const isParseArgsError = (e: unknown): e is Error =>
  e instanceof Error && 'code' in e && typeof e.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS');

/**
 * parseArgs に -h・--help を足して読む。scriptUrl は呼ぶスクリプトの import.meta.url（冒頭のコメントを使い方として出す）。
 * usage を渡すと、冒頭のコメントの代わりにそれを出す
 */
export function cliArgs<T extends Config>(
  scriptUrl: string,
  config: T,
  { args = process.argv.slice(2), usage }: { args?: string[]; usage?: string } = {},
) {
  const options: Options = { ...config.options, help: { type: 'boolean', short: 'h', default: false } };
  const text = () => usage ?? usageText(readFileSync(fileURLToPath(scriptUrl), 'utf8'), options);
  let parsed;
  try {
    parsed = parseArgs({ ...config, args, options } as T & { args: string[] });
  } catch (e) {
    if (!isParseArgsError(e)) throw e;
    console.error(`${e.message}\n\n${text()}`);
    process.exit(2);
  }
  if ((parsed.values as { help?: boolean }).help === true) {
    console.log(text());
    process.exit(0);
  }
  return parsed;
}
