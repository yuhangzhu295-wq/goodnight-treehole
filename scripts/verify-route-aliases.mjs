// Routes that are aliases of one view must actually render that view.
//
// The audit lists several paths as "legitimate aliases" of a single screen (diary, letter, report,
// mood composer, tool runner...). The failure mode is not a crash: it is a route that keeps its own
// copy of the markup, so a fix lands on one path and the others silently keep the old design. This
// compares each group by structure (the testids it renders) and by content (the text with numbers
// normalised), so "same view" is a measurement rather than a claim about the router table.
import { withSession } from './device-session.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };

/** The controls every tool-runner route must render, whatever tool it was opened for. */
const CORE_TOOL_IDS = ['front-tool-run-back', 'input-tool-run', 'btn-tool-run-submit'];

// `identical` groups must render byte-for-byte the same view. `parameterized` groups share one
// component whose content is supposed to differ by route (the tool runner prints the tool's own name),
// so there the shared structure is the assertion and the differing text is the proof the parameter is
// actually used rather than hard-coded.
const GROUPS = [
  { name: 'diary list', mode: 'identical', routes: ['/pages/diary/index', '/pages/diary/list', '/pages/me/diaries'] },
  { name: 'letter today', mode: 'identical', routes: ['/pages/letter/index', '/pages/letter/today', '/pages/reply/today'] },
  { name: 'month report', mode: 'identical', routes: ['/pages/report/month', '/pages/me/month-report'] },
  { name: 'mood composer', mode: 'identical', routes: ['/pages/mood/create', '/pages/post/create'] },
  { name: 'tool decompose', mode: 'identical', routes: ['/pages/tool/decompose', '/pages/tool/breakdown'] },
  { name: 'tool runner', mode: 'parameterized', routes: ['/pages/tool/rewrite', '/pages/tool/rant'] },
  { name: 'favorites', mode: 'identical', routes: ['/pages/favorite/index', '/pages/favorite/list'] },
];

await withSession(async ({ ev }) => {
  const signature = async (route) => {
    await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
    // A route visit is a full document load here, so the settle time has to cover the app boot and
    // the page's first fetch; polling for content is steadier than one fixed sleep.
    for (let i = 0; i < 40; i += 1) {
      const ready = await ev("(function(){return document.body&&document.body.innerText.trim().length>60?1:0;})()", false);
      if (Number(ready) === 1) break;
      await sleep(300);
    }
    await sleep(1200);
    // A snapshot taken while the page is still settling is not the page's state: one capture of the
    // letter page came back 48 characters longer than the other two because a status line was still
    // on screen. Read until two consecutive reads agree.
    const read = async () => {
      const raw = await ev(`(function(){
        var ids = Array.from(document.querySelectorAll('[data-testid]')).map(function(e){return e.getAttribute('data-testid');});
        ids = ids.map(function(v){return String(v).replace(/\\d{3,}/g,'<id>');});
        ids = ids.filter(function(v,i){return ids.indexOf(v)===i;}).sort();
        var h = document.querySelector('header h1') || document.querySelector('h1');
        var text = (document.body.innerText||'').replace(/\\d+/g,'#').replace(/\\s+/g,'');
        return JSON.stringify({path: location.pathname, title: h?(h.innerText||'').trim():null, ids: ids, text: text.slice(0,700), len: text.length});
      })()`, false);
      return raw || '{}';
    };
    let previous = await read();
    for (let i = 0; i < 4; i += 1) {
      await sleep(900);
      const next = await read();
      if (next === previous) break;
      previous = next;
    }
    return JSON.parse(previous);
  };

  for (const group of GROUPS) {
    const sigs = [];
    for (const route of group.routes) sigs.push({ route, ...(await signature(route)) });
    const base = sigs[0];
    const navigated = sigs.every((s) => s.path === s.route);
    const sameIds = sigs.every((s) => JSON.stringify(s.ids) === JSON.stringify(base.ids));
    const sameText = sigs.every((s) => s.text === base.text);
    const pass = group.mode === 'parameterized'
      ? navigated
        && sigs.every((s) => CORE_TOOL_IDS.every((id) => s.ids.includes(id)))
        && new Set(sigs.map((s) => s.title)).size === sigs.length
        && new Set(sigs.map((s) => s.text)).size === sigs.length
      : navigated && sameIds && sameText;
    const detail = pass
      ? `${sigs.length} routes, ${base.ids.length} ids, ${base.len} chars${group.mode === 'parameterized' ? `, titles ${JSON.stringify(sigs.map((s) => s.title))}` : ''}`
      : JSON.stringify(sigs.map((s) => ({ route: s.route, path: s.path, ids: s.ids.length, len: s.len })));
    record(`${group.name}: ${group.mode === 'parameterized' ? 'one component, route-specific content' : 'every route renders the same view'}`, pass ? 'PASS' : 'FAIL', detail);
  }
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} alias groups passed`);
process.exit(failed.length ? 1 : 0);
