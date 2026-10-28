// Month report: the numbers on screen must be the numbers the API returned, the fact list must match
// the days that actually have records, and the two states the audit asks about (no data, analysis
// switched off) must say what they are instead of showing a zeroed dashboard.
import { withSession } from './device-session.mjs';
import { typeInto, ensureReverse, navigateTo } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
await requireStack();
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };
const MARKER = `月报引用_${Date.now()}`;

await withSession(async (session) => {
  const { call, ev } = session;
  await call('Page.enable');
  // Capture the very response the page renders, so "the number is real" is a comparison against the
  // server's own payload rather than against a number this script also guessed.
  const injected = await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      var real = window.fetch;
      window.__reports = [];
      window.fetch = function(input, init){
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        return real.apply(this, arguments).then(function(res){
          if (url.indexOf('/api/v1/reports/monthly?') >= 0 || /\\/api\\/v1\\/reports\\/monthly\\?/.test(url)) {
            try { res.clone().json().then(function(b){ window.__reports.push({ url: url, body: b }); }); } catch (e) {}
          }
          return res;
        });
      };
    })();`,
  });
  const injectedId = injected?.result?.identifier;

  const open = async (route) => {
    const reached = await navigateTo(session, route, { ready: '[data-testid=report-count-records]' });
    await sleep(1200);
    return reached;
  };

  // Write one diary through the composer first. "你留下的话" must be the user's own writing, and the
  // only way to prove that rather than assume it is to put known text in and read it back.
  const composed = await navigateTo(session, '/pages/mood/create', { ready: '[data-testid=input-mood-content]' });
  const typed = await typeInto(session, 'input-mood-content', MARKER);
  await ev("(function(){var e=document.querySelector('[data-testid=btn-submit-mood]');if(e)e.click();return 1;})()", false);
  await sleep(4500);
  record('a diary can be written for the quote check', composed && typed.ok ? 'PASS' : 'FAIL', `${composed} ${typed.reason ?? `len=${typed.domLength}`}`);

  const reached = await open('/pages/report/month');
  record('the report page opens', reached ? 'PASS' : 'FAIL', `reached=${reached}`);

  const page = JSON.parse(await ev(`(function(){
    var n = function(id){var e=document.querySelector('[data-testid='+id+']');return e?Number((e.innerText||'').trim()):null;};
    var rows = document.querySelectorAll('[data-testid=report-day-]');
    var dayRows = Array.from(document.querySelectorAll('[data-testid^=report-day-]')).map(function(e){return (e.innerText||'').replace(/\\s+/g,' ').trim();});
    return JSON.stringify({
      records: n('report-count-records'),
      actions: n('report-count-actions'),
      life: n('report-count-life'),
      heading: (document.querySelector('[data-testid=filter-report-month]')||{}).innerText || null,
      days: dayRows,
      daysEmpty: !!document.querySelector('[data-testid=report-days-empty]'),
      actionRows: document.querySelectorAll('[data-testid=report-action-row]').length,
      quote: !!document.querySelector('[data-testid=report-quote]'),
      quoteText: (function(){var e=document.querySelector('[data-testid=report-quote] p');return e?(e.innerText||'').trim():null;})(),
      summary: !!document.querySelector('[data-testid=report-summary]'),
      analysisOff: !!document.querySelector('[data-testid=report-analysis-off]'),
      adviceDisabled: (function(){var b=document.querySelector('[data-testid=btn-report-advice]');return b?b.disabled:null;})(),
      trendChart: !!document.querySelector('[data-testid=report-trend-chart]'),
      lifeBars: document.querySelectorAll('.monthly-life-row').length,
      error: (document.querySelector('.load-error')||{}).innerText || null
    });
  })()`, false) || '{}');

  const captured = JSON.parse(await ev("JSON.stringify((window.__reports||[]).slice(-1)[0]||null)", false) || 'null');
  const body = captured?.body?.item ?? null;

  // 1. the three numbers are the payload's numbers
  const lifeExpected = body ? (Array.isArray(body.recovery?.lifeFunctions) ? body.recovery.lifeFunctions.filter((x) => String(x.state) !== 'unrecorded').length : 0) : null;
  const numbersMatch = !!body
    && page.records === Number(body.totalRecords ?? 0)
    && page.actions === Number(body.recovery?.completedActionCount ?? 0)
    && page.life === lifeExpected;
  record('the three counts equal what the API returned', numbersMatch ? 'PASS' : 'FAIL',
    JSON.stringify({ page: { records: page.records, actions: page.actions, life: page.life }, api: body ? { totalRecords: body.totalRecords, completedActionCount: body.recovery?.completedActionCount, life: lifeExpected } : null }));

  // 2. the date list matches the days that have records (or says there are none)
  const expectedDays = body && Array.isArray(body.dailyTrend) ? body.dailyTrend.filter((p) => Number(p.count) > 0).length : 0;
  const daysMatch = expectedDays > 0
    ? page.days.length === expectedDays && !page.daysEmpty
    : page.days.length === 0 && page.daysEmpty;
  record('按日期查看 lists exactly the days with records', daysMatch ? 'PASS' : 'FAIL',
    JSON.stringify({ expectedDays, rendered: page.days.length, empty: page.daysEmpty, sample: page.days.slice(0, 2) }));

  // 3. the removed score chart stays removed
  record('no emotion-score chart is rendered', page.trendChart === false && page.lifeBars === 0 ? 'PASS' : 'FAIL',
    JSON.stringify({ trendChart: page.trendChart, lifeBars: page.lifeBars }));

  // 3b. "你留下的话" is the text this run just wrote, not a generated letter
  record('你留下的话 is the text the user wrote', String(page.quoteText ?? '').includes(MARKER) ? 'PASS' : 'FAIL',
    JSON.stringify({ quote: String(page.quoteText ?? '').slice(0, 60), apiQuote: body?.quote ?? null, marker: MARKER }));

  // 4. the consent switch decides whether the AI section exists
  const consentOk = body
    ? (body.analysisAllowed === true
      ? page.summary === true && page.analysisOff === false && page.adviceDisabled === false
      : page.summary === false && page.analysisOff === true && page.adviceDisabled === true)
    : false;
  record('the AI section follows the long-term-analysis consent', consentOk ? 'PASS' : 'FAIL',
    JSON.stringify({ analysisAllowed: body?.analysisAllowed ?? null, summary: page.summary, analysisOff: page.analysisOff, adviceDisabled: page.adviceDisabled }));

  // 5. a month with no records is a plain zero state, not an empty dashboard
  await open('/pages/report/month?month=2020-01');
  const emptyMonth = JSON.parse(await ev(`(function(){
    var n = function(id){var e=document.querySelector('[data-testid='+id+']');return e?Number((e.innerText||'').trim()):null;};
    return JSON.stringify({
      records: n('report-count-records'),
      heading: (document.querySelector('[data-testid=filter-report-month]')||{}).innerText || null,
      daysEmpty: !!document.querySelector('[data-testid=report-days-empty]'),
      days: document.querySelectorAll('[data-testid^=report-day-]').length,
      quote: !!document.querySelector('[data-testid=report-quote]'),
      error: (document.querySelector('.load-error')||{}).innerText || null
    });
  })()`, false) || '{}');
  record('a month with no records shows zeros and says so',
    emptyMonth.records === 0 && emptyMonth.daysEmpty === true && emptyMonth.days === 0 && emptyMonth.quote === false && !emptyMonth.error ? 'PASS' : 'FAIL',
    JSON.stringify(emptyMonth));

  if (injectedId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: injectedId });
});
await requireStackAtEnd();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} report cases passed`);
process.exit(failed.length ? 1 : 0);
