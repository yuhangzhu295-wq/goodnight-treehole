import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const dirtyTicketId = 'ticket_1783852420770';
const abandonedRouteTestJobId = 'job_cf37283bfc';
const crossEndFeedbackFixture = '\u8fd9\u662f\u4e00\u4e2a\u771f\u5b9e\u7684\u8de8\u7aef\u53cd\u9988\u6d4b\u8bd5';

async function main() {
  const ticket = await prisma.feedbackTicket.findUnique({ where: { id: dirtyTicketId }, select: { id: true, content: true, createdAt: true } });
  const result: Record<string, unknown> = { generatedAt: new Date().toISOString(), actions: [] };
  if (ticket) {
    const isExplicitTestRecord = ticket.content.startsWith('FEEDBACK_PHASE4_') && ticket.content.includes('??');
    if (!isExplicitTestRecord) throw new Error(`Refusing to delete non-test record ${ticket.id}`);
    await prisma.feedbackTicket.delete({ where: { id: ticket.id } });
    (result.actions as string[]).push('deleted-explicit-phase4-test-ticket');
    result.ticketCreatedAt = ticket.createdAt;
  }
  const crossEndFixtures = await prisma.feedbackTicket.findMany({
    where: { content: crossEndFeedbackFixture },
    select: { id: true, content: true, createdAt: true },
  });
  if (crossEndFixtures.length) {
    const deleted = await prisma.feedbackTicket.deleteMany({ where: { id: { in: crossEndFixtures.map((item) => item.id) } } });
    (result.actions as string[]).push(`deleted-${deleted.count}-cross-end-feedback-fixtures`);
    result.crossEndFeedbackFixtureIds = crossEndFixtures.map((item) => item.id);
  }
  const routeTestJob = await prisma.aIJob.findUnique({ where: { id: abandonedRouteTestJobId }, select: { id: true, contentId: true, promptSummary: true, status: true } });
  if (routeTestJob) {
    const isAbandonedTestFixture = routeTestJob.contentId.startsWith('route_test_') && routeTestJob.promptSummary === 'route test' && ['queued', 'running'].includes(routeTestJob.status);
    if (!isAbandonedTestFixture) throw new Error(`Refusing to delete non-fixture AI job ${routeTestJob.id}`);
    await prisma.aIJob.delete({ where: { id: routeTestJob.id } });
    (result.actions as string[]).push('deleted-abandoned-route-test-fixture');
  }
  if (!(result.actions as string[]).length) (result.actions as string[]).push('already-clean');
  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await fs.writeFile(path.resolve('artifacts/traces/final/cleanup-explicit-test-records.json'), JSON.stringify(result, null, 2), 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
