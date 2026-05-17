import { UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function parseAudienceList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyAppleIdToken(
  idToken: string,
  audiences: string[],
): Promise<{ sub: string; email?: string }> {
  if (!audiences.length) {
    throw new UnauthorizedException('APPLE_CLIENT_ID not configured');
  }
  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });
    const sub = payload.sub;
    if (!sub) throw new UnauthorizedException('Invalid Apple token');
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    return { sub, email };
  } catch {
    throw new UnauthorizedException('Invalid Apple id_token');
  }
}

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<{ sub: string; email?: string; name?: string; picture?: string }> {
  if (!audience) {
    throw new UnauthorizedException('GOOGLE_CLIENT_ID not configured');
  }
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    const sub = payload.sub;
    if (!sub) throw new UnauthorizedException('Invalid Google token');
    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  } catch {
    throw new UnauthorizedException('Invalid Google id_token');
  }
}
