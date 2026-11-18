import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliArgs, headerComment, optionList, usageText } from './cli.ts';

const SOURCE = [
  '// 道具の説明',
  '//   npm run x -- <id>',
  '//',
  "import { a } from 'b';",
  '// 冒頭の後のコメント',
].join('\n');

describe('headerComment', () => {
  it('takes the leading // lines only', () => {
    expect(headerComment(SOURCE)).toBe('道具の説明\n  npm run x -- <id>\n');
  });

  it('is empty without a leading comment', () => {
    expect(headerComment("import { a } from 'b';\n")).toBe('');
  });
});

describe('optionList', () => {
  it('lists value, short and multiple options', () => {
    expect(
      optionList({
        id: { type: 'string', multiple: true },
        all: { type: 'boolean', short: 'a' },
      }),
    ).toBe('  --id <値> …\n  -a, --all');
  });

  it('omits the option section when there are no options', () => {
    expect(usageText(SOURCE, {})).toBe(headerComment(SOURCE));
  });
});

describe('cliArgs', () => {
  afterEach(() => vi.restoreAllMocks());

  const exitWith = () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    return exit;
  };

  it('parses options and positionals', () => {
    const { values, positionals } = cliArgs(
      import.meta.url,
      { allowPositionals: true, options: { all: { type: 'boolean', default: false } } },
      { args: ['--all', '0001'] },
    );
    expect(values.all).toBe(true);
    expect(positionals).toEqual(['0001']);
  });

  it('prints the usage and exits 0 on --help', () => {
    exitWith();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => cliArgs(import.meta.url, { options: {} }, { args: ['-h'], usage: 'U' })).toThrow('exit 0');
    expect(log).toHaveBeenCalledWith('U');
  });

  it('prints the error and the usage without a stack trace on an unknown option', () => {
    exitWith();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cliArgs(import.meta.url, { options: {} }, { args: ['--nope'] })).toThrow('exit 2');
    const text = String(error.mock.calls[0]![0]);
    expect(text).toContain("'--nope'");
    expect(text).toContain('オプション:\n  -h, --help');
    expect(text).not.toContain('    at ');
  });
});
