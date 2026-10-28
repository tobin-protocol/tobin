// Amounts, strkeys and SHA-256. No bridge needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { EngineError, I128_MAX, I128_MIN, checkedAdd, checkedSub, compareBytes, fromHex, i128ToBytes, parseAmount, parsePositiveAmount, toHex, u32ToBytes } from '../src/amount.ts';
import { decodeAddress, encodeAddress } from '../src/strkey.ts';
import { sha256 } from '../src/sha256.ts';
import { compareAddresses, parseParty } from '../src/address.ts';

test('amounts: only bigint or canonical decimal strings; never a number', () => {
  assert.equal(parseAmount('123'), 123n);
  assert.equal(parseAmount(5n), 5n);
  assert.equal(parseAmount('-7'), -7n);
  for (const bad of [1.5, 3, NaN, '1.5', '1e3', ' 1', '01', '', '+1', '0x10', null, undefined, {}]) {
    assert.throws(() => parseAmount(bad), (e: unknown) => e instanceof EngineError && e.code === 'INVALID_AMOUNT', String(bad));
  }
  assert.throws(() => parsePositiveAmount('0'), (e: unknown) => e instanceof EngineError && e.code === 'NON_POSITIVE_AMOUNT');
  assert.throws(() => parsePositiveAmount(-1n), (e: unknown) => e instanceof EngineError && e.code === 'NON_POSITIVE_AMOUNT');
  assert.equal(parsePositiveAmount(I128_MAX), I128_MAX);
  assert.throws(() => parseAmount(I128_MAX + 1n), (e: unknown) => e instanceof EngineError && e.code === 'OVERFLOW');
  assert.throws(() => parseAmount((I128_MIN - 1n).toString()), (e: unknown) => e instanceof EngineError && e.code === 'OVERFLOW');
});

test('checked arithmetic follows the i128 range exactly', () => {
  assert.equal(checkedAdd(I128_MAX - 1n, 1n), I128_MAX);
  assert.throws(() => checkedAdd(I128_MAX, 1n), (e: unknown) => e instanceof EngineError && e.code === 'OVERFLOW');
  assert.equal(checkedSub(I128_MIN + 1n, 1n), I128_MIN);
  assert.throws(() => checkedSub(I128_MIN, 1n), (e: unknown) => e instanceof EngineError && e.code === 'OVERFLOW');
});

test('i128 and u32 big-endian encodings', () => {
  assert.equal(toHex(i128ToBytes(100n)), '00000000000000000000000000000064');
  assert.equal(toHex(i128ToBytes(I128_MAX)), '7f' + 'ff'.repeat(15));
  assert.equal(toHex(i128ToBytes(-1n)), 'ff'.repeat(16));
  assert.equal(toHex(i128ToBytes(I128_MIN)), '80' + '00'.repeat(15));
  assert.equal(toHex(u32ToBytes(1)), '00000001');
  assert.equal(toHex(u32ToBytes(0xdeadbeef)), 'deadbeef');
  assert.throws(() => u32ToBytes(-1));
  assert.throws(() => u32ToBytes(2 ** 32));
});

test('hex and byte order', () => {
  assert.deepEqual(fromHex('00ff10'), new Uint8Array([0, 255, 16]));
  assert.throws(() => fromHex('0g'));
  assert.throws(() => fromHex('abc'));
  assert.equal(compareBytes(new Uint8Array([1]), new Uint8Array([1, 0])), -1, 'a prefix sorts first');
  assert.equal(compareBytes(new Uint8Array([2]), new Uint8Array([1, 9])), 1);
  assert.equal(compareBytes(new Uint8Array([3, 4]), new Uint8Array([3, 4])), 0);
});

test('strkey: the well-known zero account, round trips, checksum and kind checks', () => {
  const zero = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  // the Soroban host printed this exact string for contract id 0x00..01 (core bridge smoke test): an independent check of base32 and CRC
  const one = new Uint8Array(32);
  one[31] = 1;
  assert.equal(encodeAddress('contract', one), 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM');
  assert.deepEqual(decodeAddress('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM').key, one);
  const d = decodeAddress(zero);
  assert.equal(d.kind, 'account');
  assert.deepEqual(d.key, new Uint8Array(32));
  assert.equal(encodeAddress('account', new Uint8Array(32)), zero);
  for (let i = 0; i < 50; i++) {
    const key = new Uint8Array(randomBytes(32));
    for (const kind of ['account', 'contract'] as const) {
      const s = encodeAddress(kind, key);
      assert.equal(s.length, 56);
      assert.equal(s[0], kind === 'account' ? 'G' : 'C');
      const back = decodeAddress(s);
      assert.equal(back.kind, kind);
      assert.deepEqual(back.key, key);
    }
  }
  const good = encodeAddress('contract', new Uint8Array(32).fill(7));
  const flipped = good.slice(0, 20) + (good[20] === 'A' ? 'B' : 'A') + good.slice(21);
  assert.throws(() => decodeAddress(flipped), (e: unknown) => e instanceof EngineError && e.code === 'INVALID_ADDRESS');
  for (const bad of ['', 'G', 'M' + zero.slice(1), zero.toLowerCase(), zero + 'A', 'S' + zero.slice(1)]) {
    assert.throws(() => decodeAddress(bad), (e: unknown) => e instanceof EngineError && e.code === 'INVALID_ADDRESS', bad);
  }
});

test('address XDR: 44 bytes for an account, 40 for a contract; an account sorts before a contract', () => {
  const a = parseParty(encodeAddress('account', new Uint8Array(32).fill(9)));
  const c = parseParty(encodeAddress('contract', new Uint8Array(32).fill(1)));
  assert.equal(a.xdr.length, 44);
  assert.equal(c.xdr.length, 40);
  assert.equal(toHex(a.xdr.slice(0, 12)), '000000120000000000000000');
  assert.equal(toHex(c.xdr.slice(0, 8)), '0000001200000001');
  assert.equal(compareAddresses(a.str, c.str), -1);
  assert.equal(compareAddresses(c.str, a.str), 1);
});

test('sha256 matches known vectors and node:crypto for many lengths', () => {
  assert.equal(toHex(sha256(new Uint8Array(0))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(toHex(sha256(Uint8Array.from('abc', (c) => c.charCodeAt(0)))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (let n = 0; n <= 300; n++) {
    const data = new Uint8Array(randomBytes(n));
    assert.equal(toHex(sha256(data)), createHash('sha256').update(data).digest('hex'), `length ${n}`);
  }
  const big = new Uint8Array(randomBytes(100_003));
  assert.equal(toHex(sha256(big)), createHash('sha256').update(big).digest('hex'));
});
