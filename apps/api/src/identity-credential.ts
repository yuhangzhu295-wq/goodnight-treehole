import crypto from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

/**
 * C-end identity credential.
 *
 * The C-end used to identify a caller by the raw `x-goodnight-user-id` header, which means knowing
 * any user id was enough to act as that user: every ownership check downstream compares against a
 * value the caller supplied. This module replaces that with a server-issued credential bound to the
 * user id, so claiming an identity requires a signature the caller cannot produce.
 *
 * The credential is deliberately not a session: it carries no revocation list and no server state.
 * It is a signed statement of "the server issued this user id at this time", with a bounded age.
 */

/** Long-lived by design: the app has no login, so an expired credential means a lost identity. */
export const IDENTITY_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Domain separation: a credential minted here must not be usable as an admin bearer token. */
const PURPOSE = 'cend';

export function getIdentitySecret(): string {
  const secret = process.env.CEND_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new UnauthorizedException('身份凭证密钥未配置');
  }
  return secret.trim();
}

function computeSignature(userId: string, issuedAt: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}:${userId}:${issuedAt}`).digest('hex');
}

export function issueIdentityCredential(userId: string, issuedAt: number = Date.now()): string {
  const trimmed = userId.trim();
  if (!trimmed) throw new Error('不能为空用户签发身份凭证');
  const secret = getIdentitySecret();
  const signature = computeSignature(trimmed, issuedAt, secret);
  return Buffer.from(`${trimmed}:${issuedAt}:${signature}`).toString('base64url');
}

/**
 * Returns the verified user id, or null when no credential was supplied.
 * A credential that is present but malformed, tampered with, or expired throws rather than
 * degrading to anonymous: silently treating a bad credential as "no identity" would turn an
 * attack into an ordinary unauthenticated request.
 */
export function verifyIdentityCredential(value?: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const secret = getIdentitySecret();

  let decoded = '';
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new UnauthorizedException('身份凭证格式无效');
  }

  // Split from the right: the signature and timestamp are fixed-shape, the user id is not.
  const lastColon = decoded.lastIndexOf(':');
  if (lastColon <= 0) throw new UnauthorizedException('身份凭证格式无效');
  const signature = decoded.slice(lastColon + 1);
  const withoutSignature = decoded.slice(0, lastColon);
  const secondColon = withoutSignature.lastIndexOf(':');
  if (secondColon <= 0) throw new UnauthorizedException('身份凭证格式无效');
  const issuedAtRaw = withoutSignature.slice(secondColon + 1);
  const userId = withoutSignature.slice(0, secondColon);

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    throw new UnauthorizedException('身份凭证时间戳无效');
  }

  const nowMs = Date.now();
  // A small forward tolerance absorbs clock skew between instances without allowing a far-future
  // credential to stay valid indefinitely.
  if (nowMs - issuedAt > IDENTITY_CREDENTIAL_TTL_MS || issuedAt > nowMs + 60_000) {
    throw new UnauthorizedException('身份凭证已过期');
  }

  const expected = computeSignature(userId, issuedAt, secret);
  const givenBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
    throw new UnauthorizedException('身份凭证签名无效');
  }

  return userId;
}

/**
 * Whether a caller may self-issue the demo identity. Off unless explicitly enabled, because the
 * demo user holds seeded content that belongs to nobody in particular; enabling this in production
 * would re-open the very hole this module closes.
 */
export function demoIdentityAllowed(): boolean {
  return process.env.ALLOW_DEMO_IDENTITY === 'true';
}
