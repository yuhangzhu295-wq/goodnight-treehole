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

let activeChild: ChildProcess | null = null;
let currentLeaseDb: string | null = null;

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

function resolveSpecFiles(targets: string[]): string[] {
  const files: string[] = [];
  const addPath = (p: string) => {
    const resolved = path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
    if (!fs.existsSync(resolved)) return;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved);
      for (const entry of entries) {
        if (entry.endsWith('.spec.ts')) {
          files.push(path.join(resolved, entry));
        }
      }
    } else if (stat.isFile() && (resolved.endsWith('.spec.ts') || resolved.endsWith('.spec.js'))) {
      files.push(resolved);
    }
  };

  if (targets.length === 0) {
    addPath('tests/business');
  } else {
    for (const t of targets) {
      addPath(t);
    }
  }
  return [...new Set(files)].sort();
}

interface FileRunResult {
  file: string;
  relPath: string;
  passed: boolean;
  numTests: number;
  numPassed: number;
  numFailed: number;
  failedTestTitles: string[];
  dbName: string;
  timings: {
    dbCreate: number;
    migrate: number;
    test: number;
    drop: number;
    total: number;
  };
}

async function main() {
  const suiteStartTime = Date.now();
  const rawArgs = process.argv.slice(2);

  let keepDbOnFailure = process.env.KEEP_TEST_DB_ON_FAILURE === 'true' || process.env.KEEP_TEST_DB_ON_FAILURE === '1';

  const pathTargets: string[] = [];
  for (const arg of rawArgs) {
    if (arg === '--keep-db-on-failure') {
      keepDbOnFailure = true;
    } else if (arg.startsWith('--')) {
      // flags like --pool, etc.
    } else if (arg === 'vitest' || arg === 'run') {
      // skip runner tokens
    } else {
      pathTargets.push(arg);
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

  const specFiles = resolveSpecFiles(pathTargets);
  if (specFiles.length === 0) {
    console.error('[test-runner] No spec files found matching targets:', pathTargets);
    process.exit(1);
  }

  console.log(`[test-runner] Running ${specFiles.length} spec file(s) with per-file database lease isolation.\n`);

  const runtimeDir = path.resolve(repoRoot, 'artifacts', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const vitestMjs = path.resolve(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
  const prismaCli = path.resolve(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const expectedMigrations = countMigrationDirectories();

  const handleSignal = (signal: string) => {
    console.log(`\n[test-runner] Received ${signal}. Terminating child processes and cleaning up...`);
    if (activeChild) {
      try {
        activeChild.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    if (currentLeaseDb) {
      try {
        execPsql(
          maintenanceDb,
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${currentLeaseDb}' AND pid <> pg_backend_pid();`,
        );
        execPsql(maintenanceDb, `DROP DATABASE IF EXISTS "${currentLeaseDb}";`);
      } catch {
        // ignore
      }
    }
    process.exit(130);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  const fileResults: FileRunResult[] = [];

  for (let fileIdx = 0; fileIdx < specFiles.length; fileIdx++) {
    const specFile = specFiles[fileIdx];
    const relFile = path.relative(repoRoot, specFile).replace(/\\/g, '/');
    const fileStartTime = Date.now();

    console.log(`\n================================================================================`);
    console.log(`[test-runner] [${fileIdx + 1}/${specFiles.length}] Leasing database for ${relFile}`);
    console.log(`================================================================================`);

    const rawRunId = `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`.toLowerCase();
    const runId = rawRunId.replace(/[^a-z0-9_]/g, '_');
    const dbName = `goodnight_treehole_test_${runId}`;

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
    currentLeaseDb = dbName;

    const storeFile = path.resolve(runtimeDir, `goodnight-store-test-${runId}.json`);
    if (fs.existsSync(storeFile)) {
      fs.rmSync(storeFile, { force: true });
    }

    const uploadsDir = path.resolve(runtimeDir, `uploads-test-${runId}`);
    fs.mkdirSync(uploadsDir, { recursive: true });

    const queueName = `goodnight-follow-ups-test-${runId}`;
    const reportJson = path.resolve(runtimeDir, `vitest-report-${runId}.json`);
    if (fs.existsSync(reportJson)) {
      fs.rmSync(reportJson, { force: true });
    }

    let dbCreated = false;
    let filePassed = false;
    let tCreate = fileStartTime;
    let tMigrate = fileStartTime;
    let tTestStart = fileStartTime;
    let tTestEnd = fileStartTime;
    let numTests = 0;
    let numPassed = 0;
    let numFailed = 0;
    const failedTestTitles: string[] = [];

    try {
      // 1. CREATE DATABASE
      const t0 = Date.now();
      execPsql(maintenanceDb, `CREATE DATABASE "${dbName}";`);
      dbCreated = true;
      tCreate = Date.now() - t0;

      // 2. Migrate and verify
      const tMigrateStart = Date.now();
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

      const appliedCountStr = execPsql(
        dbName,
        'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;',
      );
      const appliedCount = parseInt(appliedCountStr, 10);
      if (appliedCount !== expectedMigrations) {
        throw new Error(
          `Migration count mismatch: expected ${expectedMigrations} migrations, received ${appliedCount}.`,
        );
      }
      tMigrate = Date.now() - tMigrateStart;

      // 3. Run Vitest for this single file
      tTestStart = Date.now();
      const testArgs = [
        vitestMjs,
        'run',
        relFile,
        '--pool=forks',
        '--maxWorkers=1',
        '--minWorkers=1',
        '--no-file-parallelism',
        '--hookTimeout=30000',
        '--teardownTimeout=30000',
        '--reporter=basic',
        '--reporter=json',
        `--outputFile.json=${reportJson}`,
      ];

      const testEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...envValues,
        DATABASE_URL: leaseUrl,
        GOODNIGHT_STORE_FILE: storeFile,
        GOODNIGHT_UPLOADS_DIR: uploadsDir,
        FOLLOW_UP_QUEUE_NAME: queueName,
      };

      const runResult = await runCommand(process.execPath, testArgs, testEnv);
      tTestEnd = Date.now() - tTestStart;

      // Parse JSON report for exact test counts
      if (fs.existsSync(reportJson)) {
        try {
          const reportData = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
          numTests = reportData.numTotalTests ?? 0;
          numPassed = reportData.numPassedTests ?? 0;
          numFailed = reportData.numFailedTests ?? 0;
          filePassed = reportData.success && runResult.exitCode === 0;

          if (Array.isArray(reportData.testResults)) {
            for (const suite of reportData.testResults) {
              if (Array.isArray(suite.assertionResults)) {
                for (const test of suite.assertionResults) {
                  if (test.status === 'failed') {
                    failedTestTitles.push(test.fullName || test.title);
                  }
                }
              }
            }
          }
        } catch {
          filePassed = runResult.exitCode === 0;
        }
      } else {
        filePassed = runResult.exitCode === 0;
      }
    } catch (err: any) {
      console.error(`[test-runner] Execution failed for ${relFile}:`, err?.message ?? err);
      filePassed = false;
      numFailed = numFailed || 1;
      numTests = numTests || 1;
      failedTestTitles.push(`Execution Error: ${err?.message ?? String(err)}`);
    } finally {
      const tDropStart = Date.now();
      if (dbCreated) {
        if (!filePassed && keepDbOnFailure) {
          console.log('================================================================================');
          console.log(`[test-runner] KEEP_TEST_DB_ON_FAILURE active: preserved database "${dbName}" for ${relFile}`);
          console.log('[test-runner] Reproduction command:');
          console.log(
            `  DATABASE_URL="${leaseUrl}" GOODNIGHT_STORE_FILE="${storeFile}" GOODNIGHT_UPLOADS_DIR="${uploadsDir}" FOLLOW_UP_QUEUE_NAME="${queueName}" npx vitest run ${relFile} --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism --reporter=basic`,
          );
          console.log('================================================================================');
        } else {
          try {
            execPsql(
              maintenanceDb,
              `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
            );
            execPsql(maintenanceDb, `DROP DATABASE IF EXISTS "${dbName}";`);

            const remaining = execPsql(maintenanceDb, `SELECT count(*) FROM pg_database WHERE datname = '${dbName}';`);
            if (parseInt(remaining, 10) !== 0) {
              console.error(`[test-runner] Warning: database "${dbName}" still exists after drop.`);
            }
          } catch (dropErr: any) {
            console.error(`[test-runner] Failed to drop lease database "${dbName}":`, dropErr?.message ?? dropErr);
          }

          try {
            if (fs.existsSync(storeFile)) fs.rmSync(storeFile, { force: true });
            if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
            if (fs.existsSync(reportJson)) fs.rmSync(reportJson, { force: true });
          } catch {
            // ignore
          }
        }
      }
      currentLeaseDb = null;
      const tDrop = Date.now() - tDropStart;
      const tFileTotal = Date.now() - fileStartTime;

      fileResults.push({
        file: specFile,
        relPath: relFile,
        passed: filePassed,
        numTests,
        numPassed,
        numFailed,
        failedTestTitles,
        dbName,
        timings: {
          dbCreate: tCreate,
          migrate: tMigrate,
          test: tTestEnd,
          drop: tDrop,
          total: tFileTotal,
        },
      });
    }
  }

  // Aggregate Reporting
  const totalDuration = Date.now() - suiteStartTime;
  const passedFiles = fileResults.filter((r) => r.passed);
  const failedFiles = fileResults.filter((r) => !r.passed);

  const totalTests = fileResults.reduce((acc, r) => acc + r.numTests, 0);
  const totalPassed = fileResults.reduce((acc, r) => acc + r.numPassed, 0);
  const totalFailed = fileResults.reduce((acc, r) => acc + r.numFailed, 0);

  console.log(`\n================================================================================`);
  console.log(`[test-runner] AGGREGATE TEST SUITE REPORT`);
  console.log(`================================================================================`);

  console.log(`Test Files: ${failedFiles.length} failed | ${passedFiles.length} passed (${fileResults.length})`);
  console.log(`Tests:      ${totalFailed} failed | ${totalPassed} passed (${totalTests})`);
  console.log(`Duration:   ${(totalDuration / 1000).toFixed(2)}s`);

  if (failedFiles.length > 0) {
    console.log(`\nFailed Test Files (${failedFiles.length}):`);
    for (const r of failedFiles) {
      console.log(`  × ${r.relPath} (${r.numFailed}/${r.numTests} failed)`);
      for (const title of r.failedTestTitles) {
        console.log(`      - ${title}`);
      }
    }
  }

  console.log(`\nPer-File Timing Breakdown:`);
  console.log(
    `  ${'File'.padEnd(52)} ${'DB'.padStart(6)} ${'Migrate'.padStart(9)} ${'Test'.padStart(8)} ${'Drop'.padStart(6)} ${'Total'.padStart(8)} ${'Status'.padStart(6)}`,
  );
  console.log(`  ${'-'.repeat(98)}`);
  for (const r of fileResults) {
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(
      `  ${r.relPath.padEnd(52)} ${`${r.timings.dbCreate}ms`.padStart(6)} ${`${r.timings.migrate}ms`.padStart(9)} ${`${r.timings.test}ms`.padStart(8)} ${`${r.timings.drop}ms`.padStart(6)} ${`${r.timings.total}ms`.padStart(8)} ${status.padStart(6)}`,
    );
  }

  const avgCreate = Math.round(fileResults.reduce((a, b) => a + b.timings.dbCreate, 0) / fileResults.length);
  const avgMigrate = Math.round(fileResults.reduce((a, b) => a + b.timings.migrate, 0) / fileResults.length);
  const avgTest = Math.round(fileResults.reduce((a, b) => a + b.timings.test, 0) / fileResults.length);
  const avgDrop = Math.round(fileResults.reduce((a, b) => a + b.timings.drop, 0) / fileResults.length);

  console.log(`  ${'-'.repeat(98)}`);
  console.log(
    `  ${'AVERAGE'.padEnd(52)} ${`${avgCreate}ms`.padStart(6)} ${`${avgMigrate}ms`.padStart(9)} ${`${avgTest}ms`.padStart(8)} ${`${avgDrop}ms`.padStart(6)} ${`${Math.round(totalDuration / fileResults.length)}ms`.padStart(8)}`,
  );

  console.log(`================================================================================\n`);

  process.exit(failedFiles.length === 0 ? 0 : 1);
}

main();
