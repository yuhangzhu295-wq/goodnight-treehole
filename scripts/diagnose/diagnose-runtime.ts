import fs from 'node:fs/promises';
import { cleanRuntime, kill, spawnLogged, urls, wait } from '../real-browser-utils';

async function fetchJson(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
}

async function main() {
  await fs.mkdir('artifacts/diagnosis', { recursive: true });
  await cleanRuntime();
  const env = { GOODNIGHT_STORE_FILE: 'data/goodnight-store.diagnose-runtime.json', VITE_API_BASE_URL: urls.api };
  const procs = [
    spawnLogged('diagnose-runtime-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('diagnose-runtime-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('diagnose-runtime-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];

  try {
    await wait(`${urls.api}/api/v1/posts`);
    await wait(`${urls.front}/pages/square/index`);
    await wait(`${urls.admin}/login`);
    const result = {
      generatedAt: new Date().toISOString(),
      ports: { api: 3000, front: 5173, admin: 5174 },
      services: {
        api: await fetchJson(`${urls.api}/api/v1/debug/fingerprint`),
        apiHealth: await fetchJson(`${urls.api}/api/health`).catch((error) => ({ ok: false, error: String(error) })),
        front: { url: `${urls.front}/pages/square/index`, status: (await fetch(`${urls.front}/pages/square/index`)).status },
        admin: { url: `${urls.admin}/login`, status: (await fetch(`${urls.admin}/login`)).status },
      },
      cacheState: 'cleaned-before-start',
      storeFile: 'apps/api/data/goodnight-store.diagnose-runtime.json',
    };
    await fs.writeFile('artifacts/diagnosis/runtime-fingerprint.json', JSON.stringify(result, null, 2));
  } finally {
    for (const proc of procs) kill(proc);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
