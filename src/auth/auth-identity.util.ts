import { BadRequestException } from '@nestjs/common';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new BadRequestException('Invalid email format');
  }
  return e;
}

export function normalizeUsername(raw: string): string {
  const u = raw.trim();
  if (!USERNAME_RE.test(u)) {
    throw new BadRequestException('Username must be 3-32 chars: letters, numbers, underscore');
  }
  return u;
}

export function assertPasswordStrength(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters');
  }
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.length <= 2 ? local[0] : `${local.slice(0, 2)}***`;
  return `${head}@${domain}`;
}

export function parseLoginIdentifier(raw: string): { kind: 'email' | 'username'; value: string } {
  const id = raw.trim();
  if (!id) throw new BadRequestException('identifier is required');
  if (id.includes('@')) {
    return { kind: 'email', value: normalizeEmail(id) };
  }
  return { kind: 'username', value: normalizeUsername(id) };
}
