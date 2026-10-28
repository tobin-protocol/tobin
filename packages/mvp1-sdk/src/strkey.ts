// Stellar strkey (SEP-23) decoding and encoding for the two address kinds the contract accepts: accounts (G...) and contracts (C...).
// Version byte, 32-byte payload, CRC16-XModem checksum (little-endian), base32 (RFC 4648, no padding). No dependency.
import { EngineError } from './amount.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION_ACCOUNT = 6 << 3; // 'G'
const VERSION_CONTRACT = 2 << 3; // 'C'

export type AddressKind = 'account' | 'contract';

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function base32Decode(s: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new EngineError('INVALID_ADDRESS', `not a base32 character: ${ch}`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function base32Encode(b: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export interface DecodedAddress {
  kind: AddressKind;
  key: Uint8Array; // 32 bytes: the ed25519 key (account) or the contract id (contract)
}

/** Decode a G... or C... strkey. Throws INVALID_ADDRESS for any other kind (muxed, pre-auth, etc.), a bad checksum or a bad length. */
export function decodeAddress(s: string): DecodedAddress {
  if (typeof s !== 'string' || s.length !== 56 || (s[0] !== 'G' && s[0] !== 'C')) {
    throw new EngineError('INVALID_ADDRESS', `not an account (G...) or contract (C...) address: ${String(s).slice(0, 12)}`);
  }
  const raw = base32Decode(s);
  if (raw.length !== 35) throw new EngineError('INVALID_ADDRESS', 'bad strkey length');
  const body = raw.slice(0, 33);
  const crc = (raw[33] as number) | ((raw[34] as number) << 8);
  if (crc16(body) !== crc) throw new EngineError('INVALID_ADDRESS', 'bad strkey checksum');
  const version = body[0] as number;
  const kind: AddressKind | undefined = version === VERSION_ACCOUNT ? 'account' : version === VERSION_CONTRACT ? 'contract' : undefined;
  if (!kind || (kind === 'account') !== (s[0] === 'G')) throw new EngineError('INVALID_ADDRESS', 'strkey version does not match its prefix');
  return { kind, key: body.slice(1) };
}

export function encodeAddress(kind: AddressKind, key: Uint8Array): string {
  if (key.length !== 32) throw new EngineError('INVALID_ADDRESS', 'a key is 32 bytes');
  const body = new Uint8Array(33);
  body[0] = kind === 'account' ? VERSION_ACCOUNT : VERSION_CONTRACT;
  body.set(key, 1);
  const crc = crc16(body);
  const full = new Uint8Array(35);
  full.set(body);
  full[33] = crc & 0xff;
  full[34] = crc >>> 8;
  return base32Encode(full);
}
