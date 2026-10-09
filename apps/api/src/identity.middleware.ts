import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { AnonymousSessionService, runWithIdentity } from './anonymous-session.service.js';

/**
 * Resolves the C-end credential once per request and publishes the verified identity for the
 * ownership helpers to read.
 *
 * This is middleware rather than an interceptor on purpose: `next()` runs the rest of the Express
 * chain synchronously from here, so the async continuation keeps the context, whereas wrapping an
 * Observable in the interceptor would leave the subscription outside it.
 */
@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  constructor(@Inject(AnonymousSessionService) private readonly sessions: AnonymousSessionService) {}

  async use(req: any, _res: any, next: () => void) {
    const raw = req?.headers?.['x-goodnight-user-id'];
    const credential = Array.isArray(raw) ? raw[0] : raw;

    // A present-but-invalid credential must fail the request rather than be treated as "no
    // identity": silently continuing anonymously would turn an attack into an ordinary request.
    const identity = await this.sessions.tryVerify(credential);
    runWithIdentity(identity, () => next());
  }
}
