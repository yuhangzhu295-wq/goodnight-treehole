// The diary list with real records: write one through the composer, then check the list, the privacy
// of a private entry, and the diary <-> letter association.
//
// The list is empty for a fresh viewer, and an empty list cannot show whether dates, privacy or the
// reply link work. So this creates the record through the UI it ships with rather than seeding rows.
import { withSession } from './device-session.mjs';
import { typeInto, hookPostBodies, postedBodies, ensureReverse } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };
const MARKER = `日记验证_${Date.now()}`;

const go = async (ev, route, settle = 4500) => {
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(settle);
};

await withSession(async (session) => {
  const { ev } = session;
  // 1. write a private diary through the real composer
  await go(ev, '/pages/mood/create');
  const typed = await typeInto(session, 'input-mood-content', MARKER);
  record('the composer takes the text', typed.ok && typed.domLength === MARKER.length ? 'PASS' : 'FAIL', typed.reason ?? `len=${typed.domLength}`);
  await ev("(function(){var e=document.querySelector('[data-testid=mood-visibility-private]');if(e)e.click();return 1;})()", false);
  await sleep(300);
  await hookPostBodies(session);
  await ev("(function(){var e=document.querySelector('[data-testid=btn-submit-mood]');e.click();return 1;})()", false);
  await sleep(5000);
  const bodies = await postedBodies(session, '/api/v1/moods');
  let sent = null;
  try { sent = JSON.parse(bodies[bodies.length - 1] ?? '{}'); } catch { sent = null; }
  record('the submit carries the text and the private choice',
    String(sent?.content ?? '').includes(MARKER) && sent?.visibility === 'PRIVATE' ? 'PASS' : 'FAIL',
    JSON.stringify({ visibility: sent?.visibility, hasMarker: String(sent?.content ?? '').includes(MARKER) }));

  // 2. the list shows it with a real date
  await go(ev, '/pages/diary/index');
  const listed = JSON.parse(await ev(`(function(){
    var cards = Array.from(document.querySelectorAll('[data-testid^=diary-card-]'));
    var hit = cards.filter(function(e){return (e.innerText||'').indexOf(${JSON.stringify(MARKER)})>=0;});
    var first = cards[0];
    var dateEl = first ? first.querySelector('.diary-entry-date') : null;
    return JSON.stringify({
      count: cards.length,
      found: hit.length>0,
      date: dateEl ? (dateEl.innerText||'').trim() : null,
      err: (document.querySelector('.load-error')||{}).innerText || null,
      empty: !!document.querySelector('[data-testid=diary-empty-state]')
    });
  })()`, false) || '{}');
  record('the new diary is listed with a date',
    listed.found && /^\d{2}\s*\/\s*\d{2}$/.test(listed.date ?? '') && !listed.err && !listed.empty ? 'PASS' : 'FAIL',
    JSON.stringify(listed));

  // 3. a private entry must not reach the public square
  await go(ev, '/pages/square/index');
  const square = JSON.parse(await ev(`(function(){
    var text = document.body.innerText || '';
    return JSON.stringify({leaked: text.indexOf(${JSON.stringify(MARKER)})>=0, len: text.length});
  })()`, false) || '{}');
  record('a private diary does not appear in the public square', square.leaked === false ? 'PASS' : 'FAIL', JSON.stringify(square));

  // 4. saving the letter creates a diary entry that knows it has a reply
  await go(ev, '/pages/letter/index');
  const saveState = JSON.parse(await ev(`(function(){
    var b = document.querySelector('[data-testid=btn-letter-save]');
    return JSON.stringify({hasButton: !!b, label: b ? (b.innerText||'').replace(/\\s+/g,'') : null});
  })()`, false) || '{}');
  if (saveState.hasButton) {
    await ev("(function(){document.querySelector('[data-testid=btn-letter-save]').click();return 1;})()", false);
    await sleep(4000);
  }
  const afterSave = await ev("(function(){var e=document.querySelector('[data-testid=btn-letter-save]');return e?(e.innerText||'').replace(/\\s+/g,''):null;})()", false);
  await go(ev, '/pages/diary/index');
  const letterRow = JSON.parse(await ev(`(function(){
    var cards = Array.from(document.querySelectorAll('[data-testid^=diary-card-]'));
    var withLetter = cards.filter(function(e){return (e.innerText||'').indexOf('已有回信')>=0;});
    return JSON.stringify({count: cards.length, withLetter: withLetter.length, firstHasLetter: cards[0] ? (cards[0].innerText||'').indexOf('已有回信')>=0 : null});
  })()`, false) || '{}');
  record('saving a letter produces a diary entry marked as having a reply',
    saveState.hasButton && /已保存|保存到日记/.test(afterSave ?? '') && letterRow.withLetter > 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ before: saveState.label, after: afterSave, rows: letterRow }));
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} diary cases passed`);
process.exit(failed.length ? 1 : 0);
