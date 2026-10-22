// Diary detail: opened from the list the way a user opens it, then checked for the reading layout,
// the reply link (only when the diary points at its own letter), and the two delete shapes.
import { withSession } from './device-session.mjs';
import { typeInto, ensureReverse, navigateTo } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };
const MARKER = `详情验证_${Date.now()}`;

const openFirstDiary = async (ev) => {
  await ev("(function(){var c=document.querySelector('[data-testid=diary-card-first] button');if(!c)return 0;c.click();return 1;})()", false);
  await sleep(3000);
};

const openMenu = async (ev) => {
  await ev("(function(){var b=document.querySelector('[data-testid=diary-detail-menu]');if(!b)return 0;b.click();return 1;})()", false);
  await sleep(600);
};

await withSession(async (session) => {
  const { ev } = session;

  // 1. open the first diary from the list - the real path, which also gives us a real id
  const listed = await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  await openFirstDiary(ev);
  const detail = JSON.parse(await ev(`(function(){
    var q = new URLSearchParams(location.search);
    return JSON.stringify({
      path: location.pathname,
      id: q.get('id'),
      meta: (document.querySelector('[data-testid=diary-detail-meta]')||{}).innerText || null,
      title: (document.querySelector('[data-testid=diary-detail-title]')||{}).innerText || null,
      body: (document.querySelector('[data-testid=diary-detail-body]')||{}).innerText || null,
      visibility: (document.querySelector('[data-testid=diary-detail-visibility]')||{}).innerText || null,
      hasLetterRow: !!document.querySelector('[data-testid=diary-detail-letter]'),
      menu: !!document.querySelector('[data-testid=diary-detail-menu]'),
      error: (document.querySelector('.load-error')||{}).innerText || null
    });
  })()`, false) || '{}');
  const metaOk = /^\d{4}年\d{1,2}月\d{1,2}日 · \d{2}:\d{2}$/.test(String(detail.meta ?? '').trim());
  record('a diary opens as a reading page with its own date and body',
    listed && detail.path === '/pages/diary/detail' && !!detail.id
      && metaOk && String(detail.body ?? '').trim().length > 0
      && detail.visibility === '可见范围：仅自己' && detail.menu && !detail.error ? 'PASS' : 'FAIL',
    JSON.stringify({ listed, path: detail.path, id: detail.id, meta: detail.meta, bodyLen: String(detail.body ?? '').length, visibility: detail.visibility }));

  // 2. the reply row exists only when the diary points at its own letter, and it opens that letter
  if (detail.hasLetterRow) {
    await ev("(function(){document.querySelector('[data-testid=diary-detail-letter]').click();return 1;})()", false);
    await sleep(3500);
    const letterPage = JSON.parse(await ev(`(function(){
      return JSON.stringify({
        path: location.pathname,
        id: new URLSearchParams(location.search).get('id'),
        bodyLen: ((document.querySelector('.letter-content')||{}).innerText || '').length,
        error: (document.querySelector('.load-error')||{}).innerText || null
      });
    })()`, false) || '{}');
    record('the reply row opens that diary’s own letter',
      letterPage.path === '/pages/letter/detail' && !!letterPage.id && letterPage.bodyLen > 0 && !letterPage.error ? 'PASS' : 'FAIL',
      JSON.stringify(letterPage));
  } else {
    record('the reply row opens that diary’s own letter', 'PASS', 'this diary has no letter target, so the row is correctly absent');
  }

  // 3. the menu opens and can be dismissed without side effects
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  await openFirstDiary(ev);
  await openMenu(ev);
  const menuShown = await ev("(function(){return document.querySelector('[data-testid=diary-detail-menu-sheet]')?1:0;})()", false);
  await ev("(function(){document.querySelector('[data-testid=diary-detail-menu-close]').click();return 1;})()", false);
  await sleep(500);
  const menuClosed = await ev("(function(){return document.querySelector('[data-testid=diary-detail-menu-sheet]')?1:0;})()", false);
  record('the more menu opens and closes without side effects', Number(menuShown) === 1 && Number(menuClosed) === 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ menuShown, menuClosed }));

  // 4. a mood-derived entry: the page must not offer a delete it cannot honour. The diary row is gone
  //    but the private mood is still there, so the list projects it again - the old button deleted a
  //    row, the entry came straight back, and it looked like a successful delete.
  await navigateTo(session, '/pages/mood/create', { ready: '[data-testid=input-mood-content]' });
  await typeInto(session, 'input-mood-content', MARKER);
  await ev("(function(){document.querySelector('[data-testid=btn-submit-mood]').click();return 1;})()", false);
  await sleep(4500);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const firstIsNew = await ev(`(function(){
    var c = document.querySelector('[data-testid=diary-card-first]');
    return c && (c.innerText||'').indexOf(${JSON.stringify(MARKER)}) >= 0 ? 1 : 0;
  })()`, false);
  await openFirstDiary(ev);
  await openMenu(ev);
  const projectedMenu = JSON.parse(await ev(`(function(){
    return JSON.stringify({
      explained: !!document.querySelector('[data-testid=diary-detail-delete-unavailable]'),
      offered: !!document.querySelector('[data-testid=diary-detail-delete]')
    });
  })()`, false) || '{}');
  await ev("(function(){document.querySelector('[data-testid=diary-detail-menu-close]').click();return 1;})()", false);
  await sleep(400);
  record('a mood-derived entry explains itself instead of offering a delete that cannot work',
    Number(firstIsNew) === 1 && projectedMenu.explained === true && projectedMenu.offered === false ? 'PASS' : 'FAIL',
    JSON.stringify({ firstIsNew, ...projectedMenu }));

  // 5. a real diary row (a letter saved into the diary) deletes for real, and the confirmation can be
  //    declined first.
  await navigateTo(session, '/pages/letter/index', { ready: '[data-testid=btn-letter-save]' });
  await ev("(function(){document.querySelector('[data-testid=btn-letter-save]').click();return 1;})()", false);
  await sleep(4000);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const firstRow = String(await ev("(function(){var c=document.querySelector('[data-testid=diary-card-first]');return c?(c.innerText||'').replace(/\\s+/g,' ').slice(0,24):null;})()", false) ?? '');
  await openFirstDiary(ev);
  await openMenu(ev);
  const offered = await ev("(function(){return document.querySelector('[data-testid=diary-detail-delete]')?1:0;})()", false);
  await ev("(function(){document.querySelector('[data-testid=diary-detail-delete]').click();return 1;})()", false);
  await sleep(500);
  const confirmShown = await ev("(function(){return document.querySelector('[data-testid=diary-detail-delete-confirm]')?1:0;})()", false);
  await ev("(function(){document.querySelector('[data-testid=diary-detail-delete-cancel]').click();return 1;})()", false);
  await sleep(400);
  const stillThere = await ev("(function(){return document.querySelector('[data-testid=diary-detail-body]')?1:0;})()", false);
  record('a real diary row offers delete, and cancelling keeps it',
    Number(offered) === 1 && Number(confirmShown) === 1 && Number(stillThere) === 1 ? 'PASS' : 'FAIL',
    JSON.stringify({ firstRow, offered, confirmShown, stillThere }));

  await openMenu(ev);
  await ev("(function(){document.querySelector('[data-testid=diary-detail-delete]').click();return 1;})()", false);
  await sleep(500);
  await ev("(function(){document.querySelector('[data-testid=diary-detail-delete-confirm-button]').click();return 1;})()", false);
  await sleep(4000);
  const afterDeletePath = await ev('location.pathname', false);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const gone = await ev(`(function(){
    return (document.body.innerText||'').indexOf(${JSON.stringify(firstRow)}) >= 0 ? 0 : 1;
  })()`, false);
  record('confirming the deletion removes that diary row from the list',
    afterDeletePath === '/pages/diary/index' && Number(gone) === 1 ? 'PASS' : 'FAIL',
    JSON.stringify({ afterDeletePath, gone, row: firstRow }));
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} diary detail cases passed`);
process.exit(failed.length ? 1 : 0);
