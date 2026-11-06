// Seed memories and enable allowAiMemoryUse for MemoryCenter review against design
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = 'C:/Users/zyu33/Projects/goodnight-treehole';
const { withSession } = await import(pathToFileURL(path.join(repo, 'scripts/device-session.mjs')).href);

await withSession(async ({ ev }) => {
  const result = await ev(`(async () => {
    const p = window.Capacitor.Plugins.Preferences;
    const c = (await p.get({ key: 'goodnight-identity-credential' })).value;
    if (!c) return { error: 'NO_CREDENTIAL' };
    const H = { 'content-type': 'application/json', 'x-goodnight-user-id': c };

    // 1. Ensure allowAiMemoryUse is true
    await fetch('http://127.0.0.1:3000/api/v1/settings/privacy', {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ allowAiMemoryUse: true, allowLongTermMemory: true })
    });

    // 2. Check existing memories
    const res = await fetch('http://127.0.0.1:3000/api/v1/me/memories', { headers: H });
    const data = await res.json();
    const items = data.items || [];

    const hasWork = items.some((i) => i.title === '最近在准备换工作' && i.status === 'active');
    if (!hasWork) {
      await fetch('http://127.0.0.1:3000/api/v1/memory', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          title: '最近在准备换工作',
          content: '打算换个城市发展，目前正在看岗位。',
          days: 24,
          scope: 'all_ai',
          category: '用户主动保存'
        })
      });
    }

    const hasSleep = items.some((i) => i.title === '希望以后先睡一觉再回复消息');
    if (!hasSleep) {
      const cr = await fetch('http://127.0.0.1:3000/api/v1/memory', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          title: '希望以后先睡一觉再回复消息',
          content: '情绪激动的时候容易发错话，先睡一觉再决定。',
          days: 30,
          scope: 'all_ai',
          category: '用户主动保存'
        })
      });
      const cb = await cr.json();
      if (cb.item?.id) {
        await fetch('http://127.0.0.1:3000/api/v1/me/memories/' + cb.item.id, {
          method: 'PATCH',
          headers: H,
          body: JSON.stringify({ status: 'disabled' })
        });
      }
    }

    return { ok: true };
  })()`, true);
  console.log('Seed result:', result);
});
