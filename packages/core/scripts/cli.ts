// CLI の引数の読み取り（packages/core/scripts と tools の道具で共有。plan/design-workflow-simplification-16.md 2 節）。
// 使い方は、各スクリプトの冒頭の // のコメントにだけ書く。-h・--help ではそれとオプションの一覧を出して終わり、知らない引数や
// 値の形の誤りでは、エラーの 1 行と使い方を出して終わる（スタックトレースを出さない）。必須の引数が無いときなど、スクリプトが
// 見つけた誤りは、fail で同じように出して終わる。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';

type Options = NonNullable<ParseArgsConfig['options']>;
type Config = Omit<ParseArgsConfig, 'args'>;

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

/** 使い方の文（冒頭のコメントと、オプションの一覧。extra はその間に足す実行時に決まる文） */
export function usageText(source: string, options: Options, extra?: string): string {
  const head = extra === undefined ? headerComment(source) : `${headerComment(source)}\n${extra}`;
  return `${head}\n\nオプション:\n${optionList(options)}`;
}

/** 使い方の文を作る（cliArgs が置く。1 つのプロセスで cliArgs は 1 回だけ呼ぶ） */
let usageOfScript: (() => string) | undefined;

/** message（あれば）と使い方を標準エラーに出して 2 で終わる（cliArgs の前に呼ぶと message だけ） */
export function fail(message?: string): never {
  const usage = usageOfScript?.();
  console.error([message, usage].filter((t) => t !== undefined).join('\n\n'));
  process.exit(2);
}

const isParseArgsError = (e: unknown): e is Error =>
  e instanceof Error && 'code' in e && typeof e.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS');

/**
 * parseArgs に -h・--help を足して読む。scriptUrl は呼ぶスクリプトの import.meta.url（冒頭のコメントを使い方として出す）。
 */
export function cliArgs<T extends Config>(
  scriptUrl: string,
  config: T,
  { args = process.argv.slice(2), extra }: { args?: string[]; extra?: string } = {},
) {
  const options: Options = { ...config.options, help: { type: 'boolean', short: 'h', default: false } };
  const text = () => usageText(readFileSync(fileURLToPath(scriptUrl), 'utf8'), options, extra);
  usageOfScript = text;
  let parsed;
  try {
    parsed = parseArgs({ ...config, args, options } as T & { args: string[] });
  } catch (e) {
    if (!isParseArgsError(e)) throw e;
    return fail(e.message);
  }
  if ((parsed.values as { help?: boolean }).help === true) {
    console.log(text());
    process.exit(0);
  }
  return parsed;
}
