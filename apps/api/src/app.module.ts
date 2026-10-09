import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { StoreService } from './store.service.js';
import { AdminController, HealthController, PublicController } from './controllers.js';
import { RemoteAiProviderService } from './remote-ai-provider.service.js';
import { PrismaRuntimeService } from './prisma-runtime.service.js';
import { MonthlyReportService } from './monthly-report.service.js';
import { FollowUpWorkerService } from './follow-up-worker.service.js';
import { Batch1PersistenceService } from './batch1-persistence.service.js';
import { PeerPersistenceService } from './peer-persistence.service.js';
import { SelfPersistenceService } from './self-persistence.service.js';
import { AnonymousSessionService } from './anonymous-session.service.js';
import { IdentityMiddleware } from './identity.middleware.js';

@Module({
  controllers: [HealthController, PublicController, AdminController],
  providers: [
    RemoteAiProviderService,
    PrismaRuntimeService,
    Batch1PersistenceService,
    PeerPersistenceService,
    SelfPersistenceService,
    StoreService,
    MonthlyReportService,
    FollowUpWorkerService,
    AnonymousSessionService,
    IdentityMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Applied to every route so no C-end handler can be reached without its credential having been
    // resolved. Admin routes ignore the result: they authenticate with their own bearer token.
    consumer.apply(IdentityMiddleware).forRoutes('*');
  }
}
