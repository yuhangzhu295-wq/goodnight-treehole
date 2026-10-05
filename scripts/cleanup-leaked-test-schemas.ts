import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const repoRoot = path.resolve(__dirname, '..');
const envValues = loadEnvFile(path.join(repoRoot, '.env'));

const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  envValues.DATABASE_URL ||
  'postgresql://goodnight:goodnight@localhost:15432/goodnight_treehole?schema=public';

const parsedUrl = new URL(rawDatabaseUrl);
const host = parsedUrl.hostname || '127.0.0.1';
const port = parsedUrl.port || process.env.TEST_PG_PORT || process.env.PGPORT || envValues.TEST_PG_PORT || '15432';
const user = parsedUrl.username || 'goodnight';
const password = decodeURIComponent(parsedUrl.password || 'goodnight');
const database = parsedUrl.pathname.replace(/^\//, '') || 'goodnight_treehole';

function findPsql(): string {
  const customBin = process.env.TEST_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const customPsql = path.join(customBin, 'psql.exe');
  if (fs.existsSync(customPsql)) return customPsql;
  return 'psql';
}

const psqlPath = findPsql();

function execPsql(sql: string, targetDb = database): string {
  const env = { ...process.env, PGPASSWORD: password };
  const res = spawnSync(
    psqlPath,
    ['-h', host, '-p', port, '-U', user, '-d', targetDb, '-v', 'client_min_messages=warning', '-Atc', sql],
    { encoding: 'utf8', env, windowsHide: true },
  );
  if (res.error || res.status !== 0) {
    throw new Error(`psql error: ${res.error?.message ?? res.stderr ?? res.stdout}`);
  }
  return res.stdout.trim();
}

async function main() {
  console.log(`Connecting to database ${database} at ${host}:${port} as ${user}...`);

  // 1. Check schemas before cleanup
  const countBeforeStr = execPsql(
    "SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'goodnight_treehole_test%';",
  );
  const countBefore = parseInt(countBeforeStr, 10);
  console.log(`Leaked test schemas before cleanup: ${countBefore}`);

  // Fetch list of schema names to verify exact prefix
  if (countBefore > 0) {
    const listRaw = execPsql(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'goodnight_treehole_test%' ORDER BY schema_name;",
    );
    const schemaNames = listRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const schemaName of schemaNames) {
      if (!/^goodnight_treehole_test_[a-zA-Z0-9_]+$/.test(schemaName)) {
        throw new Error(`Unsafe schema name encountered, refusing to proceed: ${schemaName}`);
      }
    }

    console.log(`Dropping ${schemaNames.length} leaked schemas with CASCADE...`);
    for (let i = 0; i < schemaNames.length; i++) {
      const name = schemaNames[i];
      execPsql(`DROP SCHEMA IF EXISTS "${name}" CASCADE;`);
      if ((i + 1) % 50 === 0 || i === schemaNames.length - 1) {
        console.log(`Dropped ${i + 1}/${schemaNames.length} schemas...`);
      }
    }
  }

  // 2. Check schemas after cleanup
  const countAfterStr = execPsql(
    "SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'goodnight_treehole_test%';",
  );
  const countAfter = parseInt(countAfterStr, 10);
  console.log(`Leaked test schemas after cleanup: ${countAfter}`);

  // 3. Verify public schema integrity
  const tableCountStr = execPsql(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
  );
  const tableCount = parseInt(tableCountStr, 10);

  const migrationCountStr = execPsql('SELECT count(*) FROM public._prisma_migrations;');
  const migrationCount = parseInt(migrationCountStr, 10);

  const rowCountStr = execPsql(`
    SELECT sum(cnt) FROM (
      SELECT (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) t;
  `);
  const rowCount = parseInt(rowCountStr, 10);

  console.log('Public schema verification:');
  console.log(`- Base tables in public: ${tableCount} (expected 54)`);
  console.log(`- Applied migrations in public: ${migrationCount} (expected 12)`);
  console.log(`- Total live rows in public: ${rowCount} (expected 1304)`);

  if (countAfter !== 0) {
    throw new Error(`Failed to clean up all leaked schemas: ${countAfter} remain`);
  }
  if (tableCount !== 54) {
    throw new Error(`Expected 54 tables in public, found ${tableCount}`);
  }
  if (migrationCount !== 12) {
    throw new Error(`Expected 12 migrations in public, found ${migrationCount}`);
  }
  if (rowCount !== 1304) {
    throw new Error(`Expected 1304 live rows in public, found ${rowCount}`);
  }

  console.log('Cleanup and verification completed successfully.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
