import { Module } from '@nestjs/common';
import { StoreService } from './store.service.js';
import { AdminController, HealthController, PublicController } from './controllers.js';
import { RemoteAiProviderService } from './remote-ai-provider.service.js';
import { PrismaRuntimeService } from './prisma-runtime.service.js';
import { MonthlyReportService } from './monthly-report.service.js';
import { FollowUpWorkerService } from './follow-up-worker.service.js';

@Module({
  controllers: [HealthController, PublicController, AdminController],
  providers: [RemoteAiProviderService, PrismaRuntimeService, StoreService, MonthlyReportService, FollowUpWorkerService],
})
export class AppModule {}
