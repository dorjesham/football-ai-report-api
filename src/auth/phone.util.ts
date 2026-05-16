import { BadRequestException } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';

/** 规范化中国大陆手机号为 11 位数字（不含 +86） */
export function normalizeCnPhone(raw: string): string {
  const t = raw.replace(/\s+/g, '').trim();
  if (/^1\d{10}$/.test(t)) return t;
  const plus = t.replace(/^\+86/, '').replace(/^86/, '');
  if (/^1\d{10}$/.test(plus)) return plus;
  throw new BadRequestException('手机号格式无效，请输入 11 位中国大陆号码');
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.length < 7) return phone ?? null;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function hashOtp(phone: string, code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${phone}:${code}`, 'utf8').digest('hex');
}

export function verifyOtpHash(phone: string, code: string, pepper: string, codeHash: string): boolean {
  const h = hashOtp(phone, code, pepper);
  return h.length === codeHash.length && timingSafeEqualHex(h, codeHash);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return ba.equals(bb);
  } catch {
    return false;
  }
}

export function generateNumericOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(randomInt(min, max + 1));
}
