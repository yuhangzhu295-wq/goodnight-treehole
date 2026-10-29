import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const pgBin = process.env.TEST_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const host = '127.0.0.1';
const port = process.env.TEST_PG_PORT ?? process.env.PGPORT ?? '5432';
const user = 'goodnight';
const password = process.env.TEST_PG_PASSWORD ?? process.env.PGPASSWORD ?? 'goodnight';
const database = process.env.TEST_PG_DATABASE ?? 'goodnight_treehole';
// Discovered from the migrations directory rather than listed by hand. The previous hardcoded
// list is why nobody noticed that `20261001000000_action_plan_mode` had been applied locally
// with no file in the repository: this check simply never looked at it, so a database that could
// run and a source tree that could not be rebuilt from zero both passed. Reading the directory
// means a new migration is covered the moment it is added.
const migrationsDir = path.resolve('prisma', 'migrations');
async function trackedMigrations(): Promise<string[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    const sql = path.join(migrationsDir, name, 'migration.sql');
    try {
      await fs.access(sql);
    } catch {
      throw new Error(`Migration directory ${name} has no migration.sql; the repository cannot rebuild from zero.`);
    }
  }
  if (!names.length) throw new Error('No migrations found; refusing to report a pass.');
  return names;
}
const reportPath = path.resolve('artifacts', 'test-report', 'third-stage-migration-verification.json');

function executable(name: string) {
  return path.join(pgBin, `${name}.exe`);
}

function command(commandName: string, args: string[], env: NodeJS.ProcessEnv, label: string) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      [`${label} failed`, result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'),
    );
  }
  return result.stdout.trim();
}

function pgEnvironment(schema?: string) {
  return {
    ...process.env,
    PGPASSWORD: password,
    PGCLIENTENCODING: 'UTF8',
    ...(schema ? { PGOPTIONS: `-c search_path=${schema}` } : {}),
  };
}

function assertSafeSchema(schema: string) {
  if (!/^gn_migration_test_[a-z0-9_]+$/.test(schema)) {
    throw new Error(`Refusing unsafe migration test schema: ${schema}`);
  }
}

function databaseUrl(schema: string) {
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=${schema}`;
}

function psql(sql: string, schema?: string) {
  return command(
    executable('psql'),
    ['-h', host, '-p', port, '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    pgEnvironment(schema),
    'psql',
  );
}

function createSchema(schema: string) {
  assertSafeSchema(schema);
  psql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}";`);
}

function dropSchema(schema: string) {
  assertSafeSchema(schema);
  psql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
}

function queryJson(schema: string, sql: string) {
  const output = psql(sql, schema).trim();
  if (!output) throw new Error('Expected a JSON query result but received no output.');
  return JSON.parse(output);
}

async function fixture(name: string, migrations: readonly string[]) {
  const directory = path.resolve('artifacts', 'migration-fixtures', name);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(path.join(directory, 'migrations'), { recursive: true });
  await fs.copyFile(path.resolve('prisma', 'schema.prisma'), path.join(directory, 'schema.prisma'));
  for (const migration of migrations) {
    await fs.cp(path.resolve('prisma', 'migrations', migration), path.join(directory, 'migrations', migration), {
      recursive: true,
    });
  }
  return directory;
}

function migrate(schema: string, schemaPath: string) {
  command(
    process.execPath,
    [path.resolve('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy', '--schema', schemaPath],
    { ...pgEnvironment(), DATABASE_URL: databaseUrl(schema) },
    'prisma migrate deploy',
  );
}

function seedUpgradeFixture(schema: string) {
  psql(
    `
      INSERT INTO "User" ("id", "openid", "nickname", "anonymousCode", "updatedAt")
      VALUES
        ('migration_user_a', 'migration_openid_a', 'migration_user_a', 'MIGA', NOW()),
        ('migration_user_b', 'migration_openid_b', 'migration_user_b', 'MIGB', NOW());

      INSERT INTO "PrivacySetting" (
        "id", "userId", "allowLongTermMemory", "allowPeerMatching", "updatedAt"
      ) VALUES ('migration_privacy_a', 'migration_user_a', true, true, NOW());

      INSERT INTO "LifeJourney" ("id", "userId", "title", "domain", "updatedAt")
      VALUES ('migration_journey_a', 'migration_user_a', 'migration journey', 'relationship', NOW());

      INSERT INTO "PeerExperience" (
        "id", "userId", "journeyId", "title", "domain", "stage", "content", "tags", "consentedAt", "updatedAt"
      ) VALUES (
        'migration_peer_experience_a', 'migration_user_a', 'migration_journey_a',
        'migration peer experience', 'relationship', 'stable', 'pre-upgrade peer experience must persist',
        '["migration","preserve"]'::jsonb, NOW(), NOW()
      );

      INSERT INTO "PeerMatch" (
        "id", "userId", "journeyId", "peerExperienceId", "score", "reasons", "updatedAt"
      ) VALUES (
        'migration_peer_match_b', 'migration_user_b', NULL, 'migration_peer_experience_a',
        0.8, '["pre-upgrade match"]'::jsonb, NOW()
      );

      INSERT INTO "PeerConversation" (
        "id", "matchId", "starterUserId", "receiverUserId", "expiresAt", "createdAt"
      ) VALUES (
        'migration_peer_conversation', 'migration_peer_match_b', 'migration_user_b',
        'migration_user_a', NOW() + interval '24 hours', NOW()
      );

      INSERT INTO "UserNotification" ("id", "userId", "type", "title", "body")
      VALUES ('migration_notification_a', 'migration_user_a', 'migration', 'migration notification', 'pre-upgrade notification must persist');

      INSERT INTO "AIProvider" (
        "id", "name", "type", "baseUrl", "modelName", "usageTags", "updatedAt"
      ) VALUES (
        'migration_provider', 'migration remote provider', 'cloud', 'https://example.invalid/v1',
        'migration-model', '[]'::jsonb, NOW()
      );

      INSERT INTO "AIJob" (
        "id", "userId", "contentId", "contentType", "jobType", "taskType", "style",
        "providerId", "modelName", "status", "promptSummary", "traceJson", "updatedAt"
      ) VALUES (
        'migration_ai_job', 'migration_user_a', 'migration_journey_a', 'journey', 'migration',
        'migration', 'warm', 'migration_provider', 'migration-model', 'succeeded',
        'pre-upgrade AI job', '[]'::jsonb, NOW()
      );

      INSERT INTO "MemoryItem" (
        "id", "userId", "journeyId", "category", "content", "consentedAt", "expiresAt"
      ) VALUES (
        'migration_memory_a', 'migration_user_a', 'migration_journey_a', 'context',
        'pre-upgrade bounded memory', NOW(), NOW() + interval '30 days'
      );
    `,
    schema,
  );
}

async function main() {
  const allMigrations = await trackedMigrations();
  // The first four are the pre-third-stage set; the upgrade path applies them, seeds rows that
  // must survive, then applies the rest.
  const baseMigrations = allMigrations.slice(0, 4);
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const freshSchema = `gn_migration_test_fresh_${suffix}`;
  const upgradeSchema = `gn_migration_test_upgrade_${suffix}`;
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    strategy: 'Prisma migrate deploy on isolated PostgreSQL schemas; no db push used.',
    fresh: { status: 'RUNNING', schema: freshSchema },
    upgrade: { status: 'RUNNING', schema: upgradeSchema },
    cleanup: { fresh: 'PENDING', upgrade: 'PENDING' },
  };
  let failure: unknown;

  try {
    createSchema(freshSchema);
    const freshFixture = await fixture(`third-stage-fresh-${suffix}`, allMigrations);
    migrate(freshSchema, path.join(freshFixture, 'schema.prisma'));
    const freshMigrationCount = Number(
      psql('SELECT count(*) FROM "_prisma_migrations";', freshSchema),
    );
    if (freshMigrationCount !== allMigrations.length) {
      throw new Error(`Fresh migration count mismatch: expected ${allMigrations.length}, received ${freshMigrationCount}`);
    }
    psql(
      `
        INSERT INTO "User" ("id", "openid", "nickname", "anonymousCode", "updatedAt")
        VALUES ('fresh_privacy_user', 'fresh_privacy_openid', 'Fresh Privacy', 'FRESH', NOW());
        INSERT INTO "PrivacySetting" ("id", "userId", "updatedAt")
        VALUES ('fresh_privacy', 'fresh_privacy_user', NOW());
      `,
      freshSchema,
    );
    const freshPrivacy = queryJson(
      freshSchema,
      `SELECT json_build_object(
        'allowAiMemoryUse', "allowAiMemoryUse",
        'allowAnonymousExperienceShare', "allowAnonymousExperienceShare",
        'allowJourneyArchiveRetention', "allowJourneyArchiveRetention",
        'allowFutureSelfNotifications', "allowFutureSelfNotifications",
        'allowDataExport', "allowDataExport"
      )::text FROM "PrivacySetting" WHERE "id" = 'fresh_privacy';`,
    );
    if (Object.values(freshPrivacy).some((value) => value !== false)) {
      throw new Error(`Fresh privacy defaults must be opt-in, received ${JSON.stringify(freshPrivacy)}`);
    }
    report.fresh = {
      status: 'PASS',
      migrationCount: freshMigrationCount,
      privacyDefaults: freshPrivacy,
    };

    createSchema(upgradeSchema);
    const upgradeFixture = await fixture(`third-stage-upgrade-${suffix}`, baseMigrations);
    migrate(upgradeSchema, path.join(upgradeFixture, 'schema.prisma'));
    seedUpgradeFixture(upgradeSchema);
    const fullUpgradeFixture = await fixture(`third-stage-upgrade-full-${suffix}`, allMigrations);
    migrate(upgradeSchema, path.join(fullUpgradeFixture, 'schema.prisma'));
    const upgradeEvidence = queryJson(
      upgradeSchema,
      `SELECT json_build_object(
        'migrationCount', (SELECT count(*) FROM "_prisma_migrations"),
        'user', (SELECT count(*) FROM "User" WHERE "id" = 'migration_user_a'),
        'privacy', (SELECT json_build_object(
          'allowLongTermMemory', "allowLongTermMemory",
          'allowPeerMatching', "allowPeerMatching",
          'allowAiMemoryUse', "allowAiMemoryUse",
          'allowAnonymousExperienceShare', "allowAnonymousExperienceShare",
          'allowJourneyArchiveRetention', "allowJourneyArchiveRetention",
          'allowFutureSelfNotifications', "allowFutureSelfNotifications",
          'allowDataExport', "allowDataExport"
        ) FROM "PrivacySetting" WHERE "id" = 'migration_privacy_a'),
        'journey', (SELECT count(*) FROM "LifeJourney" WHERE "id" = 'migration_journey_a'),
        'peerExperience', (SELECT count(*) FROM "PeerExperience" WHERE "id" = 'migration_peer_experience_a'),
        'peerConversation', (SELECT count(*) FROM "PeerConversation" WHERE "id" = 'migration_peer_conversation'),
        'notification', (SELECT count(*) FROM "UserNotification" WHERE "id" = 'migration_notification_a'),
        'aiJob', (SELECT count(*) FROM "AIJob" WHERE "id" = 'migration_ai_job'),
        'memory', (SELECT json_build_object(
          'title', "title", 'source', "source", 'scope', "scope", 'status', "status"
        ) FROM "MemoryItem" WHERE "id" = 'migration_memory_a')
      )::text;`,
    );
    const requiredCounts = ['user', 'journey', 'peerExperience', 'peerConversation', 'notification', 'aiJob'];
    if (
      upgradeEvidence.migrationCount !== allMigrations.length ||
      requiredCounts.some((key) => upgradeEvidence[key] !== 1) ||
      upgradeEvidence.privacy?.allowAiMemoryUse !== false ||
      upgradeEvidence.privacy?.allowAnonymousExperienceShare !== false ||
      upgradeEvidence.privacy?.allowJourneyArchiveRetention !== false ||
      upgradeEvidence.privacy?.allowFutureSelfNotifications !== false ||
      upgradeEvidence.privacy?.allowDataExport !== false ||
      upgradeEvidence.memory?.title !== '有限记忆' ||
      upgradeEvidence.memory?.source !== 'user_saved' ||
      upgradeEvidence.memory?.scope !== 'all_ai' ||
      upgradeEvidence.memory?.status !== 'active'
    ) {
      throw new Error(`Upgrade evidence did not satisfy data preservation and opt-in requirements: ${JSON.stringify(upgradeEvidence)}`);
    }
    report.upgrade = { status: 'PASS', ...upgradeEvidence };
  } catch (error) {
    failure = error;
    report.error = error instanceof Error ? error.message : String(error);
    if ((report.fresh as { status: string }).status === 'RUNNING') report.fresh = { status: 'FAIL' };
    if ((report.upgrade as { status: string }).status === 'RUNNING') report.upgrade = { status: 'FAIL' };
  } finally {
    for (const [key, schema] of [
      ['fresh', freshSchema],
      ['upgrade', upgradeSchema],
    ] as const) {
      try {
        dropSchema(schema);
        (report.cleanup as Record<string, string>)[key] = 'PASS';
      } catch (cleanupError) {
        (report.cleanup as Record<string, string>)[key] = `FAIL: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`;
        failure ??= cleanupError;
      }
    }
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (failure) throw failure;
  console.log(JSON.stringify(report, null, 2));
}

void main();
