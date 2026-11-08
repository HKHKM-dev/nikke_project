import { describe, expect, it } from 'vitest';
import {
  API_BASE,
  callWithRetry,
  captureRequest,
  charactersOf,
  chunks,
  dedupe,
  detailsOf,
  findDeep,
  outpostOf,
  pickHeaders,
  isRateLimited,
  RATE_LIMIT_WAITS_MS,
  unwrapResponse,
  type PostResult,
} from './fetch-lib.ts';

describe('pickHeaders', () => {
  it('drops content-length, host and cookie and lower-cases the names', () => {
    expect(
      pickHeaders({ 'Content-Length': '10', host: 'x', Cookie: 'c', 'X-Common-Params': '{}', accept: '*/*' }),
    ).toEqual({ 'x-common-params': '{}', accept: '*/*' });
  });
});

describe('captureRequest', () => {
  const url = `${API_BASE}Game/GetUserCharacterDetails`;
  const body = JSON.stringify({ intl_open_id: 'id', nikke_area_id: 81, name_codes: [1] });

  it('takes the headers and the account fields of an API request', () => {
    expect(captureRequest(url, { 'x-a': '1', cookie: 'c' }, body)).toEqual({
      headers: { 'x-a': '1' },
      account: { intl_open_id: 'id', nikke_area_id: 81 },
    });
  });

  it('ignores other hosts, bodies without intl_open_id and bodies that are not JSON', () => {
    expect(captureRequest('https://www.blablalink.com/api/x', {}, body)).toBeNull();
    expect(captureRequest(url, {}, JSON.stringify({ nikke_area_id: 81 }))).toBeNull();
    expect(captureRequest(url, {}, JSON.stringify({ intl_open_id: '' }))).toBeNull();
    expect(captureRequest(url, {}, 'a=1')).toBeNull();
    expect(captureRequest(url, {}, 'null')).toBeNull();
    expect(captureRequest(url, {}, null)).toBeNull();
  });
});

describe('unwrapResponse', () => {
  it('returns data when code is 0', () => {
    expect(unwrapResponse('p', { code: 0, data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapResponse('p', { code: 0, a: 1 })).toEqual({ code: 0, a: 1 });
  });

  it('fails when code is not 0', () => {
    expect(() => unwrapResponse('p', { code: 1001, msg: 'login' })).toThrow('p: code 1001 login');
    expect(() => unwrapResponse('p', { data: {} })).toThrow('p: code undefined');
    expect(() => unwrapResponse('p', 'x')).toThrow();
  });
});

describe('isRateLimited', () => {
  it('is true for code 212000 (number or string) and for HTTP 429', () => {
    expect(isRateLimited({ json: { code: 212000, msg: 'request too frequently' } })).toBe(true);
    expect(isRateLimited({ json: { code: '212000' } })).toBe(true);
    expect(isRateLimited({ status: 429 })).toBe(true);
  });

  it('is false for other codes and HTTP states', () => {
    expect(isRateLimited({ json: { code: 0, data: {} } })).toBe(false);
    expect(isRateLimited({ json: { code: 1001 } })).toBe(false);
    expect(isRateLimited({ json: { code: '' } })).toBe(false);
    expect(isRateLimited({ json: null })).toBe(false);
    expect(isRateLimited({ status: 500 })).toBe(false);
  });
});

describe('callWithRetry', () => {
  /** results を順に返す post と、待った長さ・知らせの記録 */
  function setup(results: PostResult[]) {
    const waits: number[] = [];
    const logs: string[] = [];
    let calls = 0;
    const post = () => {
      const r = results[calls++];
      if (r === undefined) throw new Error('呼びすぎ');
      return Promise.resolve(r);
    };
    const opts = { sleep: (ms: number) => Promise.resolve(waits.push(ms)), log: (s: string) => logs.push(s) };
    return { post, opts, waits, logs, calls: () => calls };
  }
  const ok: PostResult = { json: { code: 0, data: { a: 1 } } };
  const limited: PostResult = { json: { code: 212000 } };

  it('returns data on the first call without waiting', async () => {
    const t = setup([ok]);
    await expect(callWithRetry('p', t.post, t.opts)).resolves.toEqual({ a: 1 });
    expect(t.waits).toEqual([]);
    expect(t.calls()).toBe(1);
  });

  it('waits and calls again on code 212000, a string code and HTTP 429', async () => {
    const t = setup([limited, { json: { code: '212000' } }, { status: 429 }, ok]);
    await expect(callWithRetry('p', t.post, t.opts)).resolves.toEqual({ a: 1 });
    expect(t.waits).toEqual([...RATE_LIMIT_WAITS_MS]);
    expect(t.logs).toHaveLength(3);
  });

  it('fails with the last result when the waits run out', async () => {
    const a = setup([limited, limited, limited, limited]);
    await expect(callWithRetry('p', a.post, a.opts)).rejects.toThrow('p: code 212000');
    expect(a.calls()).toBe(RATE_LIMIT_WAITS_MS.length + 1);
    const b = setup([{ status: 429 }, { status: 429 }]);
    await expect(callWithRetry('p', b.post, { ...b.opts, waitsMs: [1] })).rejects.toThrow('p: HTTP 429');
  });

  it('does not call again on other failures', async () => {
    const a = setup([{ status: 500 }]);
    await expect(callWithRetry('p', a.post, a.opts)).rejects.toThrow('p: HTTP 500');
    const b = setup([{ json: { code: 1001, msg: 'login' } }]);
    await expect(callWithRetry('p', b.post, b.opts)).rejects.toThrow('p: code 1001 login');
    expect(a.waits).toEqual([]);
    expect(b.waits).toEqual([]);
  });
});

describe('findDeep', () => {
  it('finds the first match depth first', () => {
    const v = { a: { b: [{ x: 1 }] }, c: [{ x: 2 }] };
    expect(findDeep(v, (x) => Array.isArray(x))).toEqual([{ x: 1 }]);
    expect(findDeep(v, (x) => x === 3)).toBeUndefined();
  });
});

describe('the extractors', () => {
  it('find the characters wherever they are nested', () => {
    const chars = [{ name_code: 5001, lv: 200 }];
    expect(charactersOf({ list: { characters: chars } })).toBe(chars);
    expect(() => charactersOf({ characters: [] })).toThrow('キャラの配列が無い');
  });

  it('take the details and the state effects', () => {
    const details = [{ name_code: 5001, head_equip_tid: 1 }];
    const effects = [{ id: 1, function_details: [] }];
    expect(detailsOf({ character_details: details, state_effects: effects })).toEqual({
      details,
      stateEffects: effects,
    });
    expect(detailsOf({ a: { character_details: details }, b: { effects } })).toEqual({
      details,
      stateEffects: effects,
    });
    expect(detailsOf({})).toEqual({ details: [], stateEffects: [] });
  });

  it('find the outpost object', () => {
    const outpost = { synchro_level: 400, recycle_room_researches: [] };
    expect(outpostOf({ outpost_info: outpost })).toBe(outpost);
    expect(() => outpostOf({ a: [{ synchro_level: 1 }] })).not.toThrow();
    expect(() => outpostOf({})).toThrow('synchro_level が無い');
  });
});

describe('dedupe and chunks', () => {
  it('drops equal values', () => {
    expect(dedupe([{ a: 1 }, { a: 2 }, { a: 1 }])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('splits by n', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 20)).toEqual([]);
  });
});
