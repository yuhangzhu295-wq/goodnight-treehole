// Archive: the combined archive keeps its four categories, and the journey view reads like
// 21_Archive.png. The text filter has to actually reduce the rows it says it filters.
import { withSession } from './device-session.mjs';
import { typeInto, ensureReverse, navigateTo } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };

const rowsOf = (ev, prefix) => ev(`(function(){
  return JSON.stringify(Array.from(document.querySelectorAll('[data-testid^=${prefix}]')).map(function(e){
    return (e.innerText||'').replace(/\\s+/g,' ').trim();
  }));
})()`, false);

await withSession(async (session) => {
  const { ev } = session;

  const reached = await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-diary]' });
  const tabs = JSON.parse(await ev(`(function(){
    return JSON.stringify(['diary','post','letter','journey'].filter(function(k){
      return !!document.querySelector('[data-testid=archive-tab-'+k+']');
    }));
  })()`, false) || '[]');
  record('the archive keeps all four categories', reached && tabs.length === 4 ? 'PASS' : 'FAIL', JSON.stringify({ reached, tabs }));

  // 1. diary rows group by month and open the real entry
  const diaryRows = JSON.parse(await rowsOf(ev, 'archive-diary-') || '[]');
  const monthHeadings = await ev("JSON.stringify(Array.from(document.querySelectorAll('.archive-group-title')).map(function(e){return (e.innerText||'').trim();}))", false);
  const openedDiary = await ev("(function(){var b=document.querySelector('[data-testid=archive-diary-first]');if(!b)return 0;b.click();return 1;})()", false);
  await sleep(3000);
  const diaryPath = await ev('location.pathname', false);
  record('a diary row sits under its month and opens the entry',
    diaryRows.length > 0 && /年\d{1,2}月/.test(String(monthHeadings ?? '')) && Number(openedDiary) === 1 && diaryPath === '/pages/diary/detail' ? 'PASS' : 'FAIL',
    JSON.stringify({ rows: diaryRows.length, months: String(monthHeadings ?? '').slice(0, 40), path: diaryPath }));

  // 2. the search box reduces the visible rows to those that contain the text
  await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-diary]' });
  const beforeCount = (JSON.parse(await rowsOf(ev, 'archive-diary-') || '[]')).length;
  const sample = JSON.parse(await rowsOf(ev, 'archive-diary-') || '[]')[0] ?? '';
  const needle = String(sample).replace(/[0-9/\s:·]+/g, '').slice(2, 6);
  const typed = await typeInto(session, 'archive-search', needle);
  await sleep(800);
  const afterRows = JSON.parse(await rowsOf(ev, 'archive-diary-') || '[]');
  const allMatch = afterRows.length > 0 && afterRows.every((row) => row.includes(needle));
  record('the search box filters the rows it claims to filter',
    typed.ok && needle.length >= 2 && afterRows.length > 0 && afterRows.length <= beforeCount && allMatch ? 'PASS' : 'FAIL',
    JSON.stringify({ needle, before: beforeCount, after: afterRows.length, allMatch }));

  // 3. the journey view matches the design: month groups, "已经归档"/"最后更新", and the footer note
  await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-journey]' });
  await ev("(function(){document.querySelector('[data-testid=archive-tab-journey]').click();return 1;})()", false);
  await sleep(1500);
  const journey = JSON.parse(await ev(`(function(){
    var rows = Array.from(document.querySelectorAll('[data-testid^=archive-journey-]'));
    return JSON.stringify({
      rows: rows.length,
      firstText: rows[0] ? (rows[0].innerText||'').replace(/\\s+/g,' ').trim() : null,
      footnote: !!document.querySelector('[data-testid=archive-journey-footnote]'),
      empty: !!document.querySelector('.archive-empty'),
      actionsButton: !!document.querySelector('[data-testid=archive-journey-actions-first]')
    });
  })()`, false) || '{}');
  const metaOk = journey.rows === 0
    ? journey.empty === true
    : /(已经归档|最后更新 · )/.test(String(journey.firstText ?? ''));
  record('the journey view reads as the design describes it', metaOk && (journey.rows === 0 || journey.footnote === true) ? 'PASS' : 'FAIL',
    JSON.stringify(journey));

  // 4. switching categories changes the rows rather than re-rendering the same list
  await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-letter]' });
  await ev("(function(){document.querySelector('[data-testid=archive-tab-letter]').click();return 1;})()", false);
  await sleep(1500);
  const letterRows = JSON.parse(await rowsOf(ev, 'archive-letter-') || '[]');
  const diaryStillThere = await ev("(function(){return document.querySelector('[data-testid^=archive-diary-]')?1:0;})()", false);
  record('switching to 树洞回信 shows letters and hides diaries',
    letterRows.length > 0 && Number(diaryStillThere) === 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ letters: letterRows.length, diaryStillThere }));
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} archive cases passed`);
process.exit(failed.length ? 1 : 0);
