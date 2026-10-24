import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P0 verification, both directions.
 *
 * Case A: a row that exists in PostgreSQL and was never written by the store must survive a flush.
 * Case B: a row the store itself wrote and then removed from its snapshot must still be deleted.
 *
 * Case B is what keeps the fix from being "never delete anything", which would silently break every
 * legitimate deletion.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const outDir = path.resolve('artifacts/persistence/p0-legacy-sweep');
fs.mkdirSync(outDir, { recursive: true });
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), database: new URL(url).pathname.slice(1) };

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const { saveRelationalRuntimeState } = await import('../apps/api/src/relational-runtime.mapper.js');
  const stamp = Date.now();
  const userId = `p0_user_${stamp}`;

  try {
    await prisma.user.create({
      data: { id: userId, openid: `p0_openid_${stamp}`, anonymousCode: `p0_${stamp}`, nickname: 'P0' },
    });
    const userRow = {
      id: userId,
      openid: `p0_openid_${stamp}`,
      anonymousCode: `p0_${stamp}`,
      nickname: 'P0',
      status: 'normal',
      createdAt: new Date().toISOString(),
    };

    // ---- Case A: a row written directly to the database, never seen by the store ----
    const directMoodId = `p0_direct_mood_${stamp}`;
    await prisma.mood.create({
      data: {
        id: directMoodId,
        userId,
        emotion: '平静',
        content: 'written directly, not via the store',
        visibility: 'PRIVATE',
        riskLevel: 'low',
        riskScore: 0,
        status: 'active',
        createdAt: new Date(),
      },
    });
    await saveRelationalRuntimeState(prisma as never, { users: [userRow], moods: [], posts: [], letters: [] } as never);
    const caseA = { survived: (await prisma.mood.findUnique({ where: { id: directMoodId } })) !== null };
    evidence.caseA_directWriteSurvivesFlush = caseA;
    console.log('case A (direct write must survive):', JSON.stringify(caseA));

    // ---- Case B: a row the store wrote, then removed from its snapshot ----
    const ownedMoodId = `p0_owned_mood_${stamp}`;
    await saveRelationalRuntimeState(prisma as never, {
      users: [userRow],
      moods: [
        {
          id: ownedMoodId,
          userId,
          emotion: '开心',
          content: 'written by the store',
          visibility: 'PRIVATE',
          riskLevel: 'low',
          riskScore: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ],
      posts: [],
      letters: [],
    } as never);
    const afterFlush1 = (await prisma.mood.findUnique({ where: { id: ownedMoodId } })) !== null;

    await saveRelationalRuntimeState(prisma as never, { users: [userRow], moods: [], posts: [], letters: [] } as never);
    const afterFlush2 = (await prisma.mood.findUnique({ where: { id: ownedMoodId } })) !== null;
    const caseB = { writtenByStore: afterFlush1, deletedAfterRemoval: !afterFlush2 };
    evidence.caseB_ownedRowStillDeletable = caseB;
    console.log('case B (store-owned row must still be deletable):', JSON.stringify(caseB));

    evidence.verdict =
      caseA.survived && caseB.writtenByStore && caseB.deletedAfterRemoval
        ? 'PASS: direct writes survive the flush and store-owned rows are still deletable'
        : 'FAIL: one of the two directions is wrong';
    console.log('verdict:', evidence.verdict);
  } catch (error) {
    evidence.error = (error as Error).message;
    console.error('verification failed:', (error as Error).message);
  } finally {
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, 'verify.json'), JSON.stringify(evidence, null, 2) + '\n');
    await prisma.mood.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
    console.log('evidence written to', path.join(outDir, 'verify.json'));
  }
}

void main();
