// DecisionVault: create a decision through the real form, confirm the request carried the text, the
// record comes back from the API, and the status tabs are counted from those records rather than
// hard-coded. Run against a viewer that has no decisions yet - that is the state a new user is in,
// and it is the state where the composer used to be unreachable.
import { withSession } from './device-session.mjs';
import { typeInto, hookPostBodies, postedBodies, ensureReverse } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };
const MARKER = `决定验证_${Date.now()}`;

await withSession(async (session) => {
  const { call, ev } = session;
  await call('Runtime.enable');
  const go = async () => {
    await ev("(function(){var a=document.createElement('a');a.href='/pages/decision/index';a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()", false);
    // Wait for the page to settle instead of a fixed sleep: the list only exists after GET /decisions.
    for (let i = 0; i < 30; i += 1) {
      const ready = await ev("(function(){return document.querySelector('[data-testid=decision-empty],[data-testid^=decision-item-]')?1:0;})()", false);
      if (Number(ready) === 1) break;
      await sleep(300);
    }
  };

  // 1. open the composer. With no records there is no list header, so the entry point is the
  //    empty-state button (or the summary); with records it is the "新增决定" button.
  await go();
  // A restart underneath the page can leave it on the loading state even after `go()` saw the
  // container; the entry control is what step 1 actually needs, so wait for that and retry once.
  if (!Number(await ev("(function(){return document.querySelector('[data-testid=decision-add],[data-testid=decision-empty-add]')?1:0;})()", false))) {
    await sleep(1500);
    await go();
  }
  const opened = await ev(`(function(){
    // Read the details' own state. A control inside a collapsed <details> still reports a layout box,
    // so "has a rect" is not the same as "is open" - that mistake made the script skip the click and
    // then blame the field for not taking focus.
    var d = document.querySelector('[data-testid=decision-composer]');
    if (d && d.open) return 'already-open';
    var b = document.querySelector('[data-testid=decision-add]') || document.querySelector('[data-testid=decision-empty-add]');
    if (b) { b.click(); return 'button:' + b.getAttribute('data-testid'); }
    var s = document.querySelector('[data-testid=decision-composer] > summary');
    if (s) { s.click(); return 'summary'; }
    return 'no-entry';
  })()`, false);
  await sleep(700);
  const nowOpen = await ev("(function(){var d=document.querySelector('[data-testid=decision-composer]');return d&&d.open?1:0;})()", false);
  if (Number(nowOpen) !== 1) console.log(`  (composer did not open; entry=${opened})`);
  const t1 = await typeInto(session, 'decision-question', MARKER);
  record('typing reaches Vue (question)', t1.ok && t1.domLength === MARKER.length ? 'PASS' : 'FAIL', `${opened} ${t1.reason ?? `len=${t1.domLength}`}`);

  // The reason field is required by saveForLater; without it the submit is rejected before any
  // request is made, and the next assertion would blame the network for a form problem.
  const t2 = await typeInto(session, 'decision-reason', '验证用原因');
  record('typing reaches Vue (reason)', t2.ok && t2.domLength === '验证用原因'.length ? 'PASS' : 'FAIL', t2.reason ?? `len=${t2.domLength}`);

  // 2. submit and confirm the request carried the text
  await hookPostBodies(session);
  const clicked = await ev("(function(){var e=document.querySelector('[data-testid=decision-submit]');if(!e)return 'no-submit';e.click();return 'ok';})()", false);
  await sleep(5000);
  const bodies = await postedBodies(session, '/api/v1/decisions');
  let sent = null;
  try { sent = JSON.parse(bodies[bodies.length - 1] ?? '{}'); } catch { sent = null; }
  const q = sent ? (sent.question ?? (sent.criteria && sent.criteria[0])) : null;
  record('submit carries the typed text', String(q).includes(MARKER) ? 'PASS' : 'FAIL', `${clicked} ${JSON.stringify(q ?? null).slice(0, 50)}`);

  // 3. the record shows up in the list, read back from the page (not from the request we just sent)
  await sleep(2500);
  const listed = await ev(`(function(){
    var items = Array.from(document.querySelectorAll('[data-testid^=decision-item-]'));
    var hit = items.filter(function(e){return (e.innerText||'').indexOf(${JSON.stringify(MARKER)})>=0;});
    var d = document.querySelector('[data-testid=decision-composer]');
    // The composer is a plain section now (it used to be a <details>), so its presence is the state.
    return JSON.stringify({count:items.length, found:hit.length>0, firstStatus:items[0]?items[0].getAttribute('data-status'):null, composerOpen: !!d});
  })()`, false);
  const l = JSON.parse(listed || '{}');
  record('the created decision appears in the list', l.found && l.composerOpen === false ? 'PASS' : 'FAIL',
    `items=${l.count} status=${l.firstStatus} composerOpen=${l.composerOpen}`);

  // 4. the status tabs are counted from the records, and clicking one filters the list
  const tabs = await ev(`(function(){
    var t = Array.from(document.querySelectorAll('[data-testid^=decision-tab-]'));
    return JSON.stringify(t.map(function(e){return {key:e.getAttribute('data-testid').replace('decision-tab-',''), text:(e.innerText||'').replace(/\\s+/g,''), selected:e.getAttribute('aria-selected')};}));
  })()`, false);
  const tabList = JSON.parse(tabs || '[]');
  const allTab = tabList.find((t) => t.key === 'all');
  const allCount = allTab ? Number((allTab.text.match(/(\d+)$/) || [])[1]) : NaN;
  const countMatches = allCount === l.count;
  const otherTab = tabList.find((t) => t.key !== 'all');
  let filtered = null;
  if (otherTab) {
    await ev(`(function(){document.querySelector('[data-testid=decision-tab-${otherTab.key}]').click();return 1;})()`, false);
    await sleep(600);
    filtered = await ev(`(function(){
      var items = Array.from(document.querySelectorAll('[data-testid^=decision-item-]'));
      return JSON.stringify({count:items.length, statuses:items.map(function(e){return e.getAttribute('data-status');})});
    })()`, false);
    await ev("(function(){var e=document.querySelector('[data-testid=decision-tab-all]');if(e)e.click();return 1;})()", false);
    await sleep(400);
  }
  const f = JSON.parse(filtered || 'null');
  const filterOk = f && otherTab ? f.count > 0 && f.statuses.every((s) => s === otherTab.key) : false;
  record('status tabs count and filter the real records', tabList.length >= 2 && countMatches && filterOk ? 'PASS' : 'FAIL',
    `${JSON.stringify(tabList.map((t) => t.text))} all=${allCount} items=${l.count} filtered=${JSON.stringify(f)}`);

  // 5. one door, one label. The composer used to be a <details> whose summary opened the same panel
  //    as the button, and the two could disagree about whether it was open; the button owns it now,
  //    so the label has to follow the panel it toggles.
  const sync = [];
  const readSync = async () => JSON.parse(await ev(`(function(){
    var d=document.querySelector('[data-testid=decision-composer]');
    var b=document.querySelector('[data-testid=decision-add]');
    return JSON.stringify({open: !!d, label: b?(b.innerText||'').replace(/\\s+/g,'').trim():null});
  })()`, false) || '{}');
  sync.push(await readSync());
  await ev("(function(){document.querySelector('[data-testid=decision-add]').click();return 1;})()", false);
  await sleep(600);
  sync.push(await readSync());
  await ev("(function(){document.querySelector('[data-testid=decision-add]').click();return 1;})()", false);
  await sleep(600);
  sync.push(await readSync());
  const syncOk = sync[0].open === false && /新增/.test(sync[0].label ?? '')
    && sync[1].open === true && /收起/.test(sync[1].label ?? '')
    && sync[2].open === false && /新增/.test(sync[2].label ?? '');
  record('the add button and its label agree about whether the composer is open', syncOk ? 'PASS' : 'FAIL', JSON.stringify(sync));

  // 6. A failed load must not be reported as "you have no records". The page used to render the empty
  //    state whenever the item list was empty, including after a 500 - which asserts something it does
  //    not know.
  //
  //    The hook has to go in through Page.addScriptToEvaluateOnNewDocument, not by assigning
  //    window.fetch: clicking an anchor navigates by loading the document again (measured - a window
  //    property set before the click is gone after it), so an in-page patch is wiped by the very
  //    navigation that mounts the page under test.
  await call('Page.enable');
  const injected = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      var real = window.fetch;
      window.fetch = function(input, init){
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method) || 'GET';
        if (url.indexOf('/api/v1/decisions') >= 0 && String(method).toUpperCase() === 'GET') {
          return Promise.resolve(new Response('{"statusCode":500,"message":"forced"}', {status:500,headers:{'Content-Type':'application/json'}}));
        }
        return real.apply(this, arguments);
      };
    })();`,
  });
  const injectedId = injected?.result?.identifier;
  await ev("(function(){var a=document.createElement('a');a.href='/pages/decision/index';a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()", false);
  await sleep(5000);
  const failState = JSON.parse(await ev(`(function(){
    return JSON.stringify({
      empty: !!document.querySelector('[data-testid=decision-empty]'),
      err: (document.querySelector('.load-error')||{}).innerText || null,
      items: document.querySelectorAll('[data-testid^=decision-item-]').length,
      loading: !!document.querySelector('.loading')
    });
  })()`, false) || '{}');
  record('a failed load is not shown as an empty list', failState.empty === false && !!failState.err ? 'PASS' : 'FAIL',
    JSON.stringify(failState));
  if (injectedId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: injectedId });
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} decision cases passed`);
process.exit(failed.length ? 1 : 0);
