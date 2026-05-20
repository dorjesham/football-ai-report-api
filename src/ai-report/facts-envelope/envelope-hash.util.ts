import { createHash } from 'crypto';

export function hashEnvelope(payload: unknown): string {
  const json = JSON.stringify(payload);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}
