// Temporary fixture: force the active conversation's 72h window to have already passed, so the
// expired state can be captured on device. Prints the original expiry so it can be restored.
// Usage: node scripts/ui2-expire-conversation.mjs set <matchId> | restore <matchId>
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const [action, matchId] = process.argv.slice(2);
if (!matchId) throw new Error('usage: set|restore <matchId>');

const conv = await prisma.peerConversation.findFirst({ where: { matchId } });
if (!conv) throw new Error(`no conversation for ${matchId}`);
console.log(`current: status=${conv.status} expiresAt=${conv.expiresAt.toISOString()}`);

if (action === 'set') {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.peerConversation.update({ where: { id: conv.id }, data: { expiresAt: past } });
  console.log(`set expiresAt -> ${past.toISOString()} (1h ago); original was ${conv.expiresAt.toISOString()}`);
  console.log(`ORIGINAL_EXPIRES_AT=${conv.expiresAt.toISOString()}`);
} else if (action === 'restore') {
  const target = process.env.ORIGINAL_EXPIRES_AT;
  if (!target) throw new Error('set ORIGINAL_EXPIRES_AT');
  await prisma.peerConversation.update({ where: { id: conv.id }, data: { expiresAt: new Date(target) } });
  console.log(`restored expiresAt -> ${target}`);
} else {
  throw new Error(`unknown action ${action}`);
}
await prisma.$disconnect();
