import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

function loadEnvFile(envPath: string): Record<string, string> {
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
  'postgresql://goodnight:goodnight@127.0.0.1:15432/goodnight_treehole?schema=public';

const parsedUrl = new URL(rawDatabaseUrl);
const dbHost = parsedUrl.hostname || '127.0.0.1';
const dbPort = parseInt(
  parsedUrl.port || process.env.TEST_PG_PORT || process.env.PGPORT || envValues.TEST_PG_PORT || '15432',
  10,
);
const dbUser = parsedUrl.username || 'goodnight';
const dbPassword = decodeURIComponent(parsedUrl.password || 'goodnight');
const devDbName = parsedUrl.pathname.replace(/^\//, '') || 'goodnight_treehole';

const rawRedisUrl = process.env.REDIS_URL || envValues.REDIS_URL || 'redis://127.0.0.1:16379';
let redisHost = '127.0.0.1';
let redisPort = 16379;
try {
  const parsedRedis = new URL(rawRedisUrl);
  redisHost = parsedRedis.hostname || '127.0.0.1';
  redisPort = parseInt(parsedRedis.port || '16379', 10);
} catch {
  // fallback defaults
}

const maintenanceDb = process.env.TEST_MAINTENANCE_DB || envValues.TEST_MAINTENANCE_DB || 'postgres';

function findPsql(): string {
  const customBin = process.env.TEST_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const customPsql = path.join(customBin, 'psql.exe');
  if (fs.existsSync(customPsql)) return customPsql;
  return 'psql';
}

const psqlPath = findPsql();

function execPsql(targetDb: string, sql: string): string {
  const env = { ...process.env, PGPASSWORD: dbPassword };
  const res = spawnSync(
    psqlPath,
    [
      '-h',
      dbHost,
      '-p',
      String(dbPort),
      '-U',
      dbUser,
      '-d',
      targetDb,
      '-v',
      'client_min_messages=warning',
      '-Atc',
      sql,
    ],
    { encoding: 'utf8', env, windowsHide: true },
  );
  if (res.error || res.status !== 0) {
    throw new Error(`psql error (db: ${targetDb}): ${res.error?.message ?? res.stderr ?? res.stdout}`);
  }
  return res.stdout.trim();
}

async function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

function countMigrationDirectories(): number {
  const migrationsDir = path.resolve(repoRoot, 'prisma', 'migrations');
  if (!fs.existsSync(migrationsDir)) return 0;
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sqlFile = path.join(migrationsDir, entry.name, 'migration.sql');
      if (fs.existsSync(sqlFile)) {
        count++;
      }
    }
  }
  return count;
}

async function runCommand(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    activeChild = child;

    child.on('error', (err) => {
      activeChild = null;
      reject(err);
    });

    child.on('exit', (code, signal) => {
      activeChild = null;
      resolve({ exitCode: code ?? (signal ? 1 : 0), signal });
    });
  });
}

let activeChild: ChildProcess | null = null;

async function main() {
  const t0 = Date.now();
  const rawArgs = process.argv.slice(2);

  let keepDbOnFailure = process.env.KEEP_TEST_DB_ON_FAILURE === 'true' || process.env.KEEP_TEST_DB_ON_FAILURE === '1';

  const forwardedArgs: string[] = [];
  for (const arg of rawArgs) {
    if (arg === '--keep-db-on-failure') {
      keepDbOnFailure = true;
    } else {
      forwardedArgs.push(arg);
    }
  }

  console.log('[test-runner] Preflight checking infrastructure services...');
  const pgAlive = await probeTcp(dbHost, dbPort);
  if (!pgAlive) {
    console.error(
      `[INFRASTRUCTURE_FAILURE] Cannot connect to PostgreSQL at ${dbHost}:${dbPort}.\n` +
        `Target: ${dbHost}:${dbPort}\n` +
        'Docker/WSL2 container may be stopped. Ensure recovery containers are running on ports 15432/16379.\n',
    );
    process.exit(2);
  }

  const redisAlive = await probeTcp(redisHost, redisPort);
  if (!redisAlive) {
    console.error(
      `[INFRASTRUCTURE_FAILURE] Cannot connect to Redis at ${redisHost}:${redisPort}.\n` +
        `Target: ${redisHost}:${redisPort}\n` +
        'Docker/WSL2 container may be stopped. Ensure recovery containers are running on ports 15432/16379.\n',
    );
    process.exit(2);
  }

  // 1. Generate unpredictable runId and test database name
  const rawRunId = `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`.toLowerCase();
  const runId = rawRunId.replace(/[^a-z0-9_]/g, '_');
  const dbName = `goodnight_treehole_test_${runId}`;

  // Validate prefix, character set, length, and forbid dev db
  if (!/^goodnight_treehole_test_[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Invalid test database name: ${dbName}`);
  }
  if (Buffer.byteLength(dbName, 'utf8') > 63) {
    throw new Error(
      `Test database name exceeds PostgreSQL 63-byte identifier limit (${Buffer.byteLength(dbName, 'utf8')} bytes): ${dbName}`,
    );
  }
  if (dbName === devDbName || dbName === 'goodnight_treehole' || dbName === 'goodnight_treehole_cleanroom') {
    throw new Error(`Refusing database name matching development database: ${dbName}`);
  }

  const leaseUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}?schema=public`;

  // Runtime environment paths
  const runtimeDir = path.resolve(repoRoot, 'artifacts', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const storeFile = path.resolve(runtimeDir, `goodnight-store-test-${runId}.json`);
  if (fs.existsSync(storeFile)) {
    fs.rmSync(storeFile, { force: true });
  }

  const uploadsDir = path.resolve(runtimeDir, `uploads-test-${runId}`);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const queueName = `goodnight-follow-ups-test-${runId}`;

  let dbCreated = false;
  let testSuccess = false;
  let exitCode = 0;
  let tCreate = t0;
  let tMigrate = t0;
  let tTestStart = t0;
  let tTestEnd = t0;

  const teardown = () => {
    if (!dbCreated) return;
    if (!testSuccess && keepDbOnFailure) {
      console.log('================================================================================');
      console.log(`[test-runner] KEEP_TEST_DB_ON_FAILURE active: preserved database "${dbName}".`);
      console.log('[test-runner] Reproduction command:');
      console.log(
        `  DATABASE_URL="${leaseUrl}" GOODNIGHT_STORE_FILE="${storeFile}" GOODNIGHT_UPLOADS_DIR="${uploadsDir}" FOLLOW_UP_QUEUE_NAME="${queueName}" npx vitest run tests/business/ --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism --reporter=basic`,
      );
      console.log('================================================================================');
      return;
    }

    console.log(`[test-runner] Dropping lease database "${dbName}"...`);
    try {
      // Terminate any open connections to that lease database only
      execPsql(
        maintenanceDb,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
      );
      execPsql(maintenanceDb, `DROP DATABASE IF EXISTS "${dbName}";`);

      const remaining = execPsql(maintenanceDb, `SELECT count(*) FROM pg_database WHERE datname = '${dbName}';`);
      if (parseInt(remaining, 10) !== 0) {
        console.error(`[test-runner] Warning: database "${dbName}" still exists after drop.`);
      } else {
        console.log(`[test-runner] Database "${dbName}" dropped cleanly.`);
      }
    } catch (dropErr: any) {
      console.error(`[test-runner] Failed to drop lease database "${dbName}":`, dropErr?.message ?? dropErr);
    }

    try {
      if (fs.existsSync(storeFile)) fs.rmSync(storeFile, { force: true });
      if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
    } catch (fileErr: any) {
      console.error('[test-runner] Failed to clean up runtime files:', fileErr?.message ?? fileErr);
    }
  };

  const handleSignal = (signal: string) => {
    console.log(`\n[test-runner] Received ${signal}. Terminating child processes and cleaning up...`);
    if (activeChild) {
      try {
        activeChild.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    teardown();
    process.exit(130);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  try {
    // 2. CREATE DATABASE on maintenance connection
    console.log(`[test-runner] Creating lease database "${dbName}" via ${maintenanceDb}...`);
    execPsql(maintenanceDb, `CREATE DATABASE "${dbName}";`);
    dbCreated = true;
    tCreate = Date.now();
    console.log(`[test-runner] Lease database "${dbName}" created in ${tCreate - t0}ms.`);

    // 3. Migrate and verify
    console.log('[test-runner] Running prisma migrate deploy...');
    const expectedMigrations = countMigrationDirectories();
    const prismaCli = path.resolve(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
    const migrateRes = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      {
        cwd: repoRoot,
        env: { ...process.env, ...envValues, DATABASE_URL: leaseUrl },
        encoding: 'utf8',
        windowsHide: true,
      },
    );

    if (migrateRes.error || migrateRes.status !== 0) {
      throw new Error(
        `Migration deploy failed: ${migrateRes.error?.message ?? migrateRes.stderr ?? migrateRes.stdout}`,
      );
    }

    // Verify migration count in _prisma_migrations
    const appliedCountStr = execPsql(
      dbName,
      'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;',
    );
    const appliedCount = parseInt(appliedCountStr, 10);
    if (appliedCount !== expectedMigrations) {
      throw new Error(`Migration count mismatch: expected ${expectedMigrations} migrations, received ${appliedCount}.`);
    }
    tMigrate = Date.now();
    console.log(
      `[test-runner] Verified ${appliedCount}/${expectedMigrations} migrations applied in ${tMigrate - tCreate}ms.`,
    );

    // 4. Construct test command
    // Serial execution: a single fork / no file parallelism
    const testCmd = process.execPath;
    let testArgs: string[] = [];

    const vitestMjs = path.resolve(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');

    const ensureSerialFlags = (args: string[]) => {
      const res = [...args];
      if (!res.some((a) => a === '--pool' || a.startsWith('--pool='))) {
        res.push('--pool=forks');
      }
      if (!res.some((a) => a === '--maxWorkers' || a.startsWith('--maxWorkers='))) {
        res.push('--maxWorkers=1');
      }
      if (!res.some((a) => a === '--minWorkers' || a.startsWith('--minWorkers='))) {
        res.push('--minWorkers=1');
      }
      if (
        !res.some((a) => a === '--no-file-parallelism' || a === '--fileParallelism=false' || a === '--fileParallelism')
      ) {
        res.push('--no-file-parallelism');
      }
      if (!res.some((a) => a === '--hookTimeout' || a.startsWith('--hookTimeout='))) {
        res.push('--hookTimeout=30000');
      }
      if (!res.some((a) => a === '--teardownTimeout' || a.startsWith('--teardownTimeout='))) {
        res.push('--teardownTimeout=30000');
      }
      return res;
    };

    if (forwardedArgs.length === 0) {
      testArgs = [
        vitestMjs,
        'run',
        'tests/business/',
        '--pool=forks',
        '--maxWorkers=1',
        '--minWorkers=1',
        '--no-file-parallelism',
        '--hookTimeout=30000',
        '--teardownTimeout=30000',
        '--reporter=basic',
      ];
    } else if (forwardedArgs[0] === 'vitest') {
      testArgs = [vitestMjs, ...ensureSerialFlags(forwardedArgs.slice(1))];
    } else {
      testArgs = [vitestMjs, 'run', ...ensureSerialFlags(forwardedArgs)];
    }

    const testEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...envValues,
      DATABASE_URL: leaseUrl,
      GOODNIGHT_STORE_FILE: storeFile,
      GOODNIGHT_UPLOADS_DIR: uploadsDir,
      FOLLOW_UP_QUEUE_NAME: queueName,
    };

    tTestStart = Date.now();
    console.log(`[test-runner] Running test suite serially: node ${testArgs.join(' ')}`);
    const runResult = await runCommand(testCmd, testArgs, testEnv);
    tTestEnd = Date.now();

    exitCode = runResult.exitCode;
    testSuccess = exitCode === 0;
  } catch (err: any) {
    console.error('[test-runner] Execution failed:', err?.message ?? err);
    testSuccess = false;
    exitCode = exitCode || 1;
  } finally {
    const tCleanupStart = Date.now();
    teardown();
    const tCleanupEnd = Date.now();

    console.log('\n[test-runner] Wall-clock breakdown:');
    console.log(`  - DB lease creation: ${tCreate - t0}ms`);
    console.log(`  - Migration deploy & verify: ${tMigrate - tCreate}ms`);
    console.log(`  - Test suite execution: ${tTestEnd - tTestStart}ms`);
    console.log(`  - Teardown & drop: ${tCleanupEnd - tCleanupStart}ms`);
    console.log(`  - Total wall-clock: ${tCleanupEnd - t0}ms`);

    process.exit(exitCode);
  }
}

main();
