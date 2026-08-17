import { spawnSync } from 'node:child_process';

const pgBin = process.env.TEST_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const host = '127.0.0.1';
// Keep the default aligned with the real local PostgreSQL service while allowing
// CI/Docker setups to opt into their own port without changing the test code.
const port = process.env.TEST_PG_PORT ?? process.env.PGPORT ?? '5432';
const user = 'goodnight';
const password = process.env.TEST_PG_PASSWORD ?? process.env.PGPASSWORD ?? 'goodnight';
const database = process.env.TEST_PG_DATABASE ?? 'goodnight_treehole';

function executable(name: string) {
  return `${pgBin}\\${name}.exe`;
}

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error([result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
}

export function resetTestDatabase(name: string) {
  if (!/^goodnight_treehole_test_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing unsafe test database name: ${name}`);
  }
  const pgEnv = { ...process.env, PGPASSWORD: password };
  const schema = name.slice(0, 55);
  run(executable('psql'), ['-h', host, '-p', port, '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', `DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}";`], pgEnv);
  const databaseUrl = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=${schema}`;
  run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { ...pgEnv, DATABASE_URL: databaseUrl });
  return databaseUrl;
}
