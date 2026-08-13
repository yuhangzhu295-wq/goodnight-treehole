import { spawnSync } from 'node:child_process';

const pgBin = process.env.TEST_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const host = '127.0.0.1';
const port = '55432';
const user = 'goodnight';

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
  run(executable('dropdb'), ['-h', host, '-p', port, '-U', user, '--if-exists', '--force', name]);
  run(executable('createdb'), ['-h', host, '-p', port, '-U', user, name]);
  const databaseUrl = `postgresql://${user}@${host}:${port}/${name}?schema=public`;
  run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'], { ...process.env, DATABASE_URL: databaseUrl });
  return databaseUrl;
}
