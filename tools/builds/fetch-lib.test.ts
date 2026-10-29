import { describe, expect, it } from 'vitest';
import {
  API_BASE,
  captureRequest,
  charactersOf,
  chunks,
  dedupe,
  detailsOf,
  findDeep,
  outpostOf,
  pickHeaders,
  unwrapResponse,
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
