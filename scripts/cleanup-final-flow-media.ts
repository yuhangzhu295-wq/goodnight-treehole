import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type FlowReport = {
  marker?: string;
  ticket?: { screenshots?: Array<{ id?: string }> };
  diary?: { attachment?: { id?: string } };
};

async function readReport(file: string): Promise<FlowReport> {
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as FlowReport;
}

async function main() {
  const [feedback, diary] = await Promise.all([
    readReport('artifacts/test-report/final-feedback-upload-flow.json'),
    readReport('artifacts/test-report/final-private-diary-flow.json'),
  ]);
  if (!feedback.marker?.startsWith('TEST_FINAL_FEEDBACK_UPLOAD_') || !diary.marker?.startsWith('TEST_FINAL_PRIVATE_DIARY_')) {
    throw new Error('Refusing to clean media without explicit final-flow report markers');
  }
  const ids = [...new Set([
    ...(feedback.ticket?.screenshots ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)),
    diary.diary?.attachment?.id,
  ].filter((id): id is string => Boolean(id)))];
  if (!ids.length) throw new Error('No explicit final-flow media ids found');

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids } },
    include: { moodAttachments: true, diaryAttachments: true },
  });
  if (assets.length !== ids.length) throw new Error(`Expected ${ids.length} explicit final-flow assets, found ${assets.length}`);
  if (assets.some((asset) => asset.status !== 'deleted' || asset.moodAttachments.length || asset.diaryAttachments.length)) {
    throw new Error('Refusing to delete media that is ready or still attached');
  }
  const deleted = await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
  if (deleted.count !== ids.length) throw new Error(`Expected to delete ${ids.length} media rows, deleted ${deleted.count}`);

  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await fs.writeFile(
    path.resolve('artifacts/traces/final/cleanup-final-flow-media.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), ids, deleted: deleted.count }, null, 2),
    'utf8',
  );
  console.log(JSON.stringify({ ids, deleted: deleted.count }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
