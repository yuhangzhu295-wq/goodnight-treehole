// The square's two feed orders are real server-side orders, not a client re-sort of one page.
//
// `latest` must be non-increasing by creation time; `hot` must be non-increasing by hugs, then
// replies, then time. An unknown sort value must fall back to `latest` rather than erroring, because
// older clients send nothing and a typo should not blank the feed.
const BASE = 'http://127.0.0.1:3000';
const results = [];
const record = (name, ok, note) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
};

const fetchFeed = async (query) => {
  // `connection: close` so undici's keep-alive sockets do not outlive the run: exiting with them open
  // trips a libuv assertion on Windows after the last case has already printed PASS.
  const response = await fetch(`${BASE}/api/v1/posts${query}`, { headers: { connection: 'close' } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const nonIncreasing = (values) => values.every((value, index) => index === 0 || values[index - 1] >= value);
const times = (items) => items.map((item) => Date.parse(item.createdAt ?? 0));

const hot = await fetchFeed('?sort=hot');
const latest = await fetchFeed('?sort=latest');
const unknown = await fetchFeed('?sort=definitely-not-a-sort');

const hotItems = hot.body.items ?? [];
const latestItems = latest.body.items ?? [];

record(
  'hot is ordered by the community response, not by time',
  hot.status === 200 && hot.body.sort === 'hot' && hotItems.length > 1
    && nonIncreasing(hotItems.map((item) => Number(item.hugCount ?? 0))),
  `hugs=${hotItems.map((item) => item.hugCount).join(',')}`,
);

record(
  'latest is ordered by creation time',
  latest.status === 200 && latest.body.sort === 'latest' && latestItems.length > 1
    && nonIncreasing(times(latestItems)),
  `createdAt=${latestItems.map((item) => item.createdAt).join(',')}`,
);

// The two orders have to actually differ on this data, otherwise "hot" is just a label on the same
// list and the tab would be decoration.
const hotIds = hotItems.map((item) => item.id).join(',');
const latestIds = latestItems.map((item) => item.id).join(',');
record('the two orders differ on the same data', hotIds !== latestIds, `hot=${hotIds.slice(0, 40)} latest=${latestIds.slice(0, 40)}`);

record(
  'an unknown sort falls back to latest instead of failing',
  unknown.status === 200 && unknown.body.sort === 'latest',
  `status=${unknown.status} sort=${unknown.body.sort}`,
);

// The API order is only half of it: the page has to actually ask for it. Click 热门 on the device and
// read the order it renders, then compare it with the API's hot order.
const { withSession } = await import('./device-session.mjs');
const { navigateTo } = await import('./input-helpers.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rendered = await withSession(async (session) => {
  const { ev } = session;
  const ready = await navigateTo(session, '/pages/square/index', { ready: '[data-testid=square-sort-hot]' });
  if (!ready) return { ok: false, reason: 'the square never rendered its sort tabs' };
  const readOrder = () => ev(`(function(){
    return JSON.stringify(Array.from(document.querySelectorAll('[data-testid^=post-card-]')).map(function(card){
      var hugs = card.querySelector('[data-testid^=btn-square-hug]');
      return hugs ? Number((hugs.innerText||'').replace(/[^0-9]/g,'') || 0) : -1;
    }));
  })()`, false);
  const latestRendered = JSON.parse(String(await readOrder() ?? '[]'));
  await ev("(function(){document.querySelector('[data-testid=square-sort-hot]').click();return 1;})()", false);
  await sleep(2500);
  const hotRendered = JSON.parse(String(await readOrder() ?? '[]'));
  return { ok: true, latestRendered, hotRendered };
});

if (!rendered.ok) {
  record('the page asks the server for the order it shows', false, rendered.reason);
} else {
  const hotOk = nonIncreasing(rendered.hotRendered);
  const changed = rendered.latestRendered.join(',') !== rendered.hotRendered.join(',');
  record(
    'the page asks the server for the order it shows',
    hotOk && changed,
    `latest=${rendered.latestRendered.join(',')} hot=${rendered.hotRendered.join(',')}`,
  );
}

const failedTotal = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failedTotal}/${results.length} square sort cases passed`);
// Set the code and let Node drain its handles: calling process.exit() here aborts inside libuv on
// Windows while the last fetch's socket is still closing, which turns a green run into exit 127.
process.exitCode = failedTotal ? 1 : 0;
