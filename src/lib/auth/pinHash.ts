import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PIN_HASH_PREFIX = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function deriveKey(
  pinCode: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pinCode, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export function isHashedPin(pinCode: string | null | undefined): boolean {
  return typeof pinCode === 'string' && pinCode.startsWith(`${PIN_HASH_PREFIX}$`);
}

export async function hashPin(pinCode: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(pinCode, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    PIN_HASH_PREFIX,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

export async function verifyPin(
  pinCode: string,
  storedPinCode: string | null | undefined,
): Promise<boolean> {
  if (!storedPinCode) {
    return false;
  }

  if (!isHashedPin(storedPinCode)) {
    return pinCode === storedPinCode;
  }

  const parts = storedPinCode.split('$');
  if (parts.length !== 6) {
    return false;
  }

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw ?? '', 'base64');
    const expected = Buffer.from(hashRaw ?? '', 'base64');

    if (salt.length === 0 || expected.length === 0) {
      return false;
    }

    const actual = await deriveKey(pinCode, salt, expected.length, {
      N: n,
      r,
      p,
    });

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
