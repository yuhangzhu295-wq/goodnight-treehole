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

const waitFor = async (ev, expression, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (Number(await ev(expression, false)) === 1) return true;
    await sleep(300);
  }
  return false;
};

/** Clicks only if the control is on screen; returns 0 instead of throwing when a precondition failed. */
const click = async (ev, selector) =>
  Number(await ev(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return 0;e.click();return 1;})()`, false));

const openFirstDiary = async (ev) => {
  // The row itself is the tap target: the design's rows are a whole-line reading list, so there is no
  // inner button to press any more.
  const clicked = await ev("(function(){var c=document.querySelector('[data-testid=diary-card-first]');if(!c)return 0;c.click();return 1;})()", false);
  if (Number(clicked) !== 1) return false;
  // The detail page renders its menu button only once the record has loaded, so a fixed sleep would
  // race the request and the caller would read a page that is still loading.
  return waitFor(ev, "location.pathname==='/pages/diary/detail' && (document.querySelector('[data-testid=diary-detail-menu]')||document.querySelector('[data-testid=diary-detail-missing]')||document.querySelector('.load-error')) ? 1 : 0");
};

const openMenu = async (ev) => {
  const clicked = await ev("(function(){var b=document.querySelector('[data-testid=diary-detail-menu]');if(!b)return 0;b.click();return 1;})()", false);
  if (Number(clicked) !== 1) return false;
  return waitFor(ev, "document.querySelector('[data-testid=diary-detail-menu-sheet]')?1:0", 4000);
};

await withSession(async (session) => {
  const { ev } = session;

  // 0. A freshly installed app has no diaries, and an empty list cannot show whether a diary opens.
  //    Write one through the real composer first, exactly as a user would.
  const seeded = await navigateTo(session, '/pages/mood/create', { ready: '[data-testid=input-mood-content]' });
  if (seeded) {
    const typed = await typeInto(session, 'input-mood-content', `详情种子_${Date.now()}`);
    if (typed.ok) {
      await ev("(function(){document.querySelector('[data-testid=btn-submit-mood]').click();return 1;})()", false);
      await sleep(5000);
    }
  }

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

  // 2. the reply row exists only when the diary points at its own letter, and it opens that letter.
  //    The association has to be exercised on a diary that really has a reply, so this makes one first
  //    instead of hoping the newest row happens to be one - the earlier version passed by accident when
  //    the first row had no letter and failed to prove anything at all.
  await navigateTo(session, '/pages/letter/index', { ready: '[data-testid=btn-letter-save]' });
  await click(ev, '[data-testid=btn-letter-save]');
  await sleep(4000);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const openedLettered = await ev(`(function(){
    var cards = Array.from(document.querySelectorAll('[data-testid^=diary-card-]'));
    var i = cards.findIndex(function(e){return (e.innerText||'').indexOf('有回信')>=0;});
    if (i < 0) return -1;
    cards[i].click();
    return i;
  })()`, false);
  if (Number(openedLettered) >= 0) {
    await waitFor(ev, "location.pathname==='/pages/diary/detail' && (document.querySelector('[data-testid=diary-detail-menu]')||document.querySelector('.load-error')) ? 1 : 0");
    const letterRowShown = Number(await ev("(function(){return document.querySelector('[data-testid=diary-detail-letter]')?1:0;})()", false));
    if (letterRowShown === 1) await click(ev, '[data-testid=diary-detail-letter]');
    await waitFor(ev, "location.pathname==='/pages/letter/detail' ? 1 : 0");
    await sleep(1200);
    const letterPage = JSON.parse(await ev(`(function(){
      return JSON.stringify({
        path: location.pathname,
        id: new URLSearchParams(location.search).get('id'),
        bodyLen: ((document.querySelector('[data-testid=letter-detail-body]')||{}).innerText || '').length,
        error: (document.querySelector('.load-error')||{}).innerText || null
      });
    })()`, false) || '{}');
    record('the reply row opens that diary’s own letter',
      letterRowShown === 1 && letterPage.path === '/pages/letter/detail' && !!letterPage.id && letterPage.bodyLen > 0 && !letterPage.error ? 'PASS' : 'FAIL',
      JSON.stringify({ rowIndex: openedLettered, letterRowShown, ...letterPage }));
  } else {
    record('the reply row opens that diary’s own letter', 'FAIL', 'saving a letter produced no diary row marked 有回信');
  }

  // 3. the menu opens and can be dismissed without side effects
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const reachedDetail = await openFirstDiary(ev);
  const menuOpened = reachedDetail ? await openMenu(ev) : false;
  const menuShown = menuOpened ? 1 : 0;
  if (menuOpened) {
    await ev("(function(){document.querySelector('[data-testid=diary-detail-menu-close]').click();return 1;})()", false);
    await sleep(500);
  }
  const menuClosed = await ev("(function(){return document.querySelector('[data-testid=diary-detail-menu-sheet]')?1:0;})()", false);
  record('the more menu opens and closes without side effects', menuShown === 1 && Number(menuClosed) === 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ reachedDetail, menuShown, menuClosed }));

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
  if (projectedMenu.explained) await click(ev, '[data-testid=diary-detail-menu-close]');
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
  const offered = Number(await ev("(function(){return document.querySelector('[data-testid=diary-detail-delete]')?1:0;})()", false));
  if (offered === 1) await click(ev, '[data-testid=diary-detail-delete]');
  await sleep(500);
  const confirmShown = Number(await ev("(function(){return document.querySelector('[data-testid=diary-detail-delete-confirm]')?1:0;})()", false));
  if (confirmShown === 1) await click(ev, '[data-testid=diary-detail-delete-cancel]');
  await sleep(400);
  const stillThere = Number(await ev("(function(){return document.querySelector('[data-testid=diary-detail-body]')?1:0;})()", false));
  record('a real diary row offers delete, and cancelling keeps it',
    offered === 1 && confirmShown === 1 && stillThere === 1 ? 'PASS' : 'FAIL',
    JSON.stringify({ firstRow, offered, confirmShown, stillThere }));

  const reopened = await openMenu(ev);
  const deleteOffered = reopened ? await click(ev, '[data-testid=diary-detail-delete]') : 0;
  await sleep(500);
  const confirmed = deleteOffered === 1 ? await click(ev, '[data-testid=diary-detail-delete-confirm-button]') : 0;
  await sleep(4000);
  const afterDeletePath = await ev('location.pathname', false);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const gone = await ev(`(function(){
    return (document.body.innerText||'').indexOf(${JSON.stringify(firstRow)}) >= 0 ? 0 : 1;
  })()`, false);
  record('confirming the deletion removes that diary row from the list',
    confirmed === 1 && afterDeletePath === '/pages/diary/index' && Number(gone) === 1 ? 'PASS' : 'FAIL',
    JSON.stringify({ confirmed, afterDeletePath, gone, row: firstRow }));
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} diary detail cases passed`);
process.exit(failed.length ? 1 : 0);
