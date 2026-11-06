import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = 'C:/Users/zyu33/Projects/goodnight-treehole';
const { withSession } = await import(pathToFileURL(path.join(repo, 'scripts/device-session.mjs')).href);

await withSession(async ({ ev }) => {
  await ev(`(async () => {
    const p = window.Capacitor.Plugins.Preferences;
    const c = (await p.get({ key: "goodnight-identity-credential" })).value;
    if (!c) return;
    await fetch("http://127.0.0.1:3000/api/v1/settings/privacy", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-goodnight-user-id": c },
      body: JSON.stringify({ allowRecoveryData: true })
    });
  })()`, true);
});
