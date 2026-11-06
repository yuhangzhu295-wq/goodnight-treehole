import { PrismaClient } from '@prisma/client';

/**
 * Reads the rows behind one app identity for the Android page pass.
 *
 * The page pass itself talks to the app over CDP; this helper is the database half of its evidence,
 * run as a separate process so the pass can report a real row read rather than "the UI looked fine".
 * It reads only counts and the row ids it needs, never user text.
 */
async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error('usage: query-db-evidence.ts <userId>');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const [user, journeys, memories, diaries, letters, notifications, safetyEvents, decisions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true, status: true } }),
      prisma.lifeJourney.count({ where: { userId } }),
      prisma.memoryItem.count({ where: { userId, deletedAt: null } }),
      prisma.diary.count({ where: { userId } }),
      prisma.letter.count({ where: { userId } }),
      prisma.userNotification.count({ where: { userId } }),
      prisma.safetyEvent.count({ where: { userId } }),
      prisma.decisionRecord.count({ where: { userId } }),
    ]);
    console.log(
      JSON.stringify({
        userId,
        userExists: Boolean(user),
        userStatus: user?.status ?? null,
        createdAt: user?.createdAt?.toISOString() ?? null,
        counts: { journeys, memories, diaries, letters, notifications, safetyEvents, decisions },
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
