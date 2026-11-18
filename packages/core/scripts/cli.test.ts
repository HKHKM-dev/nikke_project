import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliArgs, fail, headerComment, optionList, usageText } from './cli.ts';

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

describe('usageText', () => {
  it('lists value, short and multiple options', () => {
    expect(
      optionList({
        id: { type: 'string', multiple: true },
        all: { type: 'boolean', short: 'a' },
      }),
    ).toBe('  --id <値> …\n  -a, --all');
  });

  it('puts the extra text between the header and the options', () => {
    expect(usageText(SOURCE, { all: { type: 'boolean' } }, '語彙: a / b')).toBe(
      `${headerComment(SOURCE)}\n語彙: a / b\n\nオプション:\n  --all`,
    );
  });
});

describe('cliArgs', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockExit = () =>
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);

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
    mockExit();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => cliArgs(import.meta.url, {}, { args: ['-h'], extra: 'U' })).toThrow('exit 0');
    expect(String(log.mock.calls[0]![0])).toContain('U\n\nオプション:\n  -h, --help');
  });

  it('prints the error and the usage without a stack trace on an unknown option', () => {
    mockExit();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => cliArgs(import.meta.url, {}, { args: ['--nope'] })).toThrow('exit 2');
    const text = String(error.mock.calls[0]![0]);
    expect(text).toContain("'--nope'");
    expect(text).toContain('オプション:\n  -h, --help');
    expect(text).not.toContain('    at ');
  });

  it('lets the script fail with a message and the same usage', () => {
    cliArgs(import.meta.url, {}, { args: [] });
    mockExit();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => fail('id が要る')).toThrow('exit 2');
    expect(String(error.mock.calls[0]![0])).toMatch(/^id が要る\n\n[\s\S]*オプション:\n {2}-h, --help$/);
  });
});
