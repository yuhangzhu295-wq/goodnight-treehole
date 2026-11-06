import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApiTestApp } from './helpers';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { PeerPersistenceService } from '../../apps/api/src/peer-persistence.service';
import { StoreService } from '../../apps/api/src/store.service';
import { FollowUpWorkerService } from '../../apps/api/src/follow-up-worker.service';

export interface MultiInstanceContext {
  appA: INestApplication;
  appB: INestApplication;
  persistenceA: Batch1PersistenceService;
  persistenceB: Batch1PersistenceService;
  peerPersistenceA: PeerPersistenceService;
  peerPersistenceB: PeerPersistenceService;
  storeA: StoreService;
  storeB: StoreService;
  workerA: FollowUpWorkerService;
  workerB: FollowUpWorkerService;
  db: PrismaClient;
  dbUrl: string;
  close: () => Promise<void>;
}

export async function createTwoInstanceHarness(): Promise<MultiInstanceContext> {
  const dbUrl = process.env.DATABASE_URL!;
  const [appA, appB] = await Promise.all([createApiTestApp(), createApiTestApp()]);
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  return {
    appA,
    appB,
    persistenceA: appA.get(Batch1PersistenceService),
    persistenceB: appB.get(Batch1PersistenceService),
    peerPersistenceA: appA.get(PeerPersistenceService),
    peerPersistenceB: appB.get(PeerPersistenceService),
    storeA: appA.get(StoreService),
    storeB: appB.get(StoreService),
    workerA: appA.get(FollowUpWorkerService),
    workerB: appB.get(FollowUpWorkerService),
    db,
    dbUrl,
    close: async () => {
      await Promise.allSettled([appA.close(), appB.close(), db.$disconnect()]);
    },
  };
}
