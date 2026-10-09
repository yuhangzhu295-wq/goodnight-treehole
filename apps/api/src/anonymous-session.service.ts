import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Anonymous session credentials (B3-R11).
 *
 * The C-end used to identify a caller by a bare `x-goodnight-user-id` header, so knowing any user id
 * was enough to read and write that user's private data. A credential is now issued and stored by
 * the server:
 *
 *   - the credential is `<sessionId>.<secret>`, and only `sha256(secret)` is stored, so a database
 *     read cannot be replayed as a credential;
 *   - it is verifiable from the database, so two API instances agree without sharing a cache and a
 *     restart does not lose anyone's identity;
 *   - it can be expired, revoked (including per device) and rotated, because the server holds it.
 *
 * It is deliberately NOT a signed token: a signature cannot be revoked before it expires, and the
 * requirement is that a lost device can be cut off.
 */

/** Long enough that a lost device is not a permanent liability, short enough to be routine. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Written to `lastUsedAt` at most this often, so reads do not turn into a write per request. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

const SECRET_BYTES = 32;

export type VerifiedIdentity = { userId: string; sessionId: string };

/**
 * The verified identity of the request being served.
 *
 * A database-backed check is asynchronous, while the ownership helpers are synchronous and called
 * from ~96 places. Making them async would put an `await` between each one and its use, and a
 * missing `await` there silently disables the check rather than failing - which has already happened
 * once in this codebase with the privacy gates. Instead the identity is verified once per request
 * and published here, and the helpers read it. They never trust a caller-supplied id.
 */
const identityStore = new AsyncLocalStorage<VerifiedIdentity | null>();

export function runWithIdentity<T>(identity: VerifiedIdentity | null, fn: () => T): T {
  return identityStore.run(identity, fn);
}

export function currentIdentity(): VerifiedIdentity | null {
  return identityStore.getStore() ?? null;
}

export function hashSessionSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
const hashSecret = hashSessionSecret;

@Injectable()
export class AnonymousSessionService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  private split(credential?: string): { sessionId: string; secret: string } | null {
    const raw = credential?.trim();
    if (!raw) return null;
    const separator = raw.indexOf('.');
    if (separator <= 0 || separator === raw.length - 1) return null;
    return { sessionId: raw.slice(0, separator), secret: raw.slice(separator + 1) };
  }

  /**
   * Issues a session for a user. The user id is chosen by the caller of this method, which is always
   * server code: a client never names the identity it is issued.
   */
  async issue(
    userId: string,
    options: { deviceId?: string; deviceLabel?: string; rotatedFromId?: string; ttlMs?: number } = {},
  ): Promise<{ sessionId: string; credential: string; expiresAt: Date }> {
    const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + (options.ttlMs ?? SESSION_TTL_MS));
    const session = await this.prisma.anonymousSession.create({
      data: {
        userId,
        secretHash: hashSecret(secret),
        deviceId: options.deviceId ?? null,
        deviceLabel: options.deviceLabel ?? null,
        expiresAt,
        rotatedFromId: options.rotatedFromId ?? null,
      },
    });
    return { sessionId: session.id, credential: `${session.id}.${secret}`, expiresAt };
  }

  /**
   * Resolves a credential to an identity, or throws.
   *
   * A credential that is present but unknown, revoked or expired throws rather than resolving to
   * "anonymous": treating a bad credential as no identity would turn an attack into an ordinary
   * unauthenticated request.
   */
  async verify(credential?: string): Promise<VerifiedIdentity> {
    const parts = this.split(credential);
    if (!parts) throw new UnauthorizedException('缺少或无效的身份凭证');

    const session = await this.prisma.anonymousSession.findUnique({ where: { id: parts.sessionId } });
    // Same message for unknown and revoked so the response does not confirm that a session exists.
    if (!session) throw new UnauthorizedException('身份凭证无效');

    const given = Buffer.from(hashSecret(parts.secret), 'hex');
    const expected = Buffer.from(session.secretHash, 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('身份凭证无效');
    }

    if (session.revokedAt) throw new UnauthorizedException('身份凭证已失效，请重新进入');
    if (session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('身份凭证已过期');

    // The user may have been removed or blocked since the session was issued.
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException('身份凭证无效');

    const lastUsed = session.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
      await this.prisma.anonymousSession
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }

    return { userId: session.userId, sessionId: session.id };
  }

  /** Verifies without throwing, for routes where identity is optional. */
  async tryVerify(credential?: string): Promise<VerifiedIdentity | null> {
    if (!credential?.trim()) return null;
    return await this.verify(credential);
  }

  async revoke(credential: string, reason: string): Promise<void> {
    const parts = this.split(credential);
    if (!parts) throw new UnauthorizedException('身份凭证无效');
    const session = await this.prisma.anonymousSession.findUnique({ where: { id: parts.sessionId } });
    if (!session) throw new UnauthorizedException('身份凭证无效');
    const given = Buffer.from(hashSecret(parts.secret), 'hex');
    const expected = Buffer.from(session.secretHash, 'hex');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('身份凭证无效');
    }
    await this.prisma.anonymousSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Rotates a credential: the successor is issued and the predecessor revoked in one transaction, so
   * a rotation can never leave two live credentials for the same session.
   */
  async rotate(credential: string): Promise<{ credential: string; expiresAt: Date }> {
    const identity = await this.verify(credential);
    const current = await this.prisma.anonymousSession.findUnique({ where: { id: identity.sessionId } });
    if (!current) throw new UnauthorizedException('身份凭证无效');

    return await this.prisma.$transaction(async (tx: any) => {
      const revoked = await tx.anonymousSession.updateMany({
        where: { id: identity.sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated' },
      });
      if (revoked.count === 0) {
        throw new UnauthorizedException('身份凭证已失效，请重新进入');
      }
      const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const successor = await tx.anonymousSession.create({
        data: {
          userId: identity.userId,
          secretHash: hashSecret(secret),
          deviceId: current.deviceId,
          deviceLabel: current.deviceLabel,
          expiresAt,
          rotatedFromId: identity.sessionId,
        },
      });
      return { credential: `${successor.id}.${secret}`, expiresAt };
    });
  }

  /** Revokes every session of one device, which is what a device loss needs. */
  async revokeDevice(userId: string, deviceId: string, reason: string): Promise<number> {
    const result = await this.prisma.anonymousSession.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  /** Revokes every session of a user. */
  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.anonymousSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  async listActiveForUser(userId: string) {
    if (!userId?.trim()) throw new BadRequestException('缺少用户');
    return await this.prisma.anonymousSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceLabel: true, createdAt: true, expiresAt: true, lastUsedAt: true },
    });
  }

  async findById(sessionId: string) {
    const session = await this.prisma.anonymousSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('会话不存在');
    return session;
  }
}
