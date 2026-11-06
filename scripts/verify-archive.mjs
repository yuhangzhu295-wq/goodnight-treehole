// Archive: the combined archive keeps its four categories, and the journey view reads like
// 21_Archive.png. The text filter has to actually reduce the rows it says it filters.
import { withSession } from './device-session.mjs';
import { typeInto, clearField, ensureReverse, navigateTo } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };

// The row prefix also catches the reply chip inside a diary row and the journey action button; their
// text is not the row's content. Exclude exactly those two shapes - filtering on "letter" also threw
// away every `archive-letter-*` row, which read as "the archive has no letters".
const rowsOf = (ev, prefix) => ev(`(function(){
  return JSON.stringify(Array.from(document.querySelectorAll('[data-testid^=${prefix}]'))
    .filter(function(e){var id=e.getAttribute('data-testid')||'';return id.indexOf('archive-diary-letter')<0 && id.indexOf('actions')<0;})
    .map(function(e){return (e.innerText||'').replace(/\\s+/g,' ').trim();}));
})()`, false);

await withSession(async (session) => {
  const { ev } = session;

  const reached = await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-diary]' });

  // This page has nothing to show without records, and a fresh viewer has none - the first run after a
  // reinstall would otherwise fail every row case for lack of data. Write two diaries through the real
  // composer when the list is empty, so the run does not depend on what a previous run left behind.
  // The tab bar renders before the fetch resolves, so "the tab exists" is not "the list has loaded".
  // Wait for rows or for the empty state, otherwise every row count below is a coin flip.
  const settleList = async () => {
    for (let i = 0; i < 20; i += 1) {
      const state = await ev("(function(){return (document.querySelector('[data-testid^=archive-diary-]') || document.querySelector('.archive-empty')) ? 1 : 0;})()", false);
      if (Number(state) === 1) return;
      await sleep(400);
    }
  };

  await settleList();
  const seeded = JSON.parse(await rowsOf(ev, 'archive-diary-') || '[]');
  if (!seeded.length) {
    const seedLog = [];
    for (const text of ['归档甲_猫咪', '归档乙_雨天']) {
      const reachedComposer = await navigateTo(session, '/pages/mood/create', { ready: '[data-testid=input-mood-content]' });
      const typed = await typeInto(session, 'input-mood-content', text);
      const submitted = await ev("(function(){var e=document.querySelector('[data-testid=btn-submit-mood]');if(!e)return 'no-button';e.click();return 'ok';})()", false);
      await sleep(4500);
      seedLog.push({ reachedComposer, typed: typed.ok, submitted, path: await ev('location.pathname', false) });
    }
    await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-diary]' });
    record('the run had records, or wrote two of them', seedLog.every((entry) => entry.typed && entry.submitted === 'ok') ? 'PASS' : 'FAIL', JSON.stringify(seedLog));
  }

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
  // A contiguous prefix of the row's own text. The previous needle stripped digits and separators
  // first, which produced a string that only existed because a decorative glyph sat in front of the
  // title; removing that glyph turned the fixture into a false failure.
  const needle = String(sample).trim().slice(0, 4);
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

  // 4. switching categories changes the rows rather than re-rendering the same list.
  //    The search box keeps its value across tabs (it is a filter the user typed), so clear it first -
  //    otherwise this tab is still filtered by the previous case's query.
  await clearField(session, 'archive-search');
  await sleep(600);
  //    Letters are generated on demand, so make sure at least one exists before reading this tab:
  //    open the today screen, then wait on the list until a letter card actually renders. Without the
  //    wait this case fails whenever generation finishes after the archive's single fetch.
  await navigateTo(session, '/pages/letter/index', { ready: '[data-testid=letter-back]' });
  await sleep(5000);
  const letterReady = await navigateTo(session, '/pages/letter/list', { ready: '[data-testid^=letter-card]' });
  await sleep(3000);
  await navigateTo(session, '/pages/archive/index', { ready: '[data-testid=archive-tab-letter]' });
  await ev("(function(){document.querySelector('[data-testid=archive-tab-letter]').click();return 1;})()", false);
  let letterRows = [];
  for (let i = 0; i < 20; i += 1) {
    await sleep(500);
    letterRows = JSON.parse(await rowsOf(ev, 'archive-letter-') || '[]');
    if (letterRows.length) break;
  }
  const diaryStillThere = await ev("(function(){return document.querySelector('[data-testid^=archive-diary-]')?1:0;})()", false);
  record('switching to 树洞回信 shows letters and hides diaries',
    letterReady && letterRows.length > 0 && Number(diaryStillThere) === 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ letterReady, letters: letterRows.length, diaryStillThere }));

  // 5. a search that matches nothing must say the search is the reason, not that the data is absent
  const nonsense = 'zzz_no_such_archive_entry';
  await typeInto(session, 'archive-search', nonsense);
  await sleep(900);
  const emptyText = String(await ev("(function(){var e=document.querySelector('.archive-empty');return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;})()", false) ?? '');
  record('a search with no matches names the query instead of claiming the data is missing',
    emptyText.includes(nonsense) ? 'PASS' : 'FAIL', JSON.stringify({ emptyText: emptyText.slice(0, 60) }));
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} archive cases passed`);
process.exit(failed.length ? 1 : 0);
