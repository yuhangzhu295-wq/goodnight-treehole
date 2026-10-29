// Writes one private diary through the app's real composer and prints its id.
//
// Used when a screenshot needs a record with real shape (a title line plus body paragraphs): the
// verification scripts create their own data, but their markers are single lines, and a single-line
// diary renders as a title with no body - which is a legitimate state but a poor screenshot for
// judging the reading layout.
//
// Usage: node scripts/seed-diary.mjs "第一行标题" "第二段正文" "第三段正文"
//        node scripts/seed-diary.mjs --if-empty "标题" "正文"   # skip when a diary already exists
import { withSession } from './device-session.mjs';
import { navigateTo, typeInto } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';

await requireStack();
const args = process.argv.slice(2);
// `--if-empty` exists because a deploy uninstalls the package, which gives the app a new anonymous
// identity: the previous identity's diaries are unreachable and the list page has no row to open. A
// suite that needs one row can then top up without adding a row on every run.
const ifEmpty = args.includes('--if-empty');
const lines = args.filter((arg) => arg !== '--if-empty');
if (!lines.length) {
  console.error('usage: node scripts/seed-diary.mjs [--if-empty] "标题行" "正文段" ...');
  process.exit(1);
}
const content = lines.join('\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const id = await withSession(async (session) => {
  const { ev } = session;
  if (ifEmpty) {
    const existing = await ev(
      `(async()=>{
        try {
          var p = window.Capacitor.Plugins.Preferences;
          var c = (await p.get({ key: 'goodnight-identity-credential' })).value;
          var r = await fetch('http://127.0.0.1:3000/api/v1/diaries', { headers: { 'x-goodnight-user-id': c } });
          var b = await r.json();
          return (b && b.items && b.items.length) || 0;
        } catch (e) { return 0; }
      })()`,
      true,
    );
    if (Number(existing) > 0) return 'SKIP';
  }
  const ready = await navigateTo(session, '/pages/mood/create', { ready: '[data-testid=input-mood-content]' });
  if (!ready) throw new Error('the composer never opened');
  const typed = await typeInto(session, 'input-mood-content', content);
  if (!typed.ok || typed.domLength !== content.length) {
    throw new Error(`the composer did not take the text (${typed.reason ?? typed.domLength})`);
  }
  await ev("(function(){var e=document.querySelector('[data-testid=mood-visibility-private]');if(e)e.click();return 1;})()", false);
  await sleep(300);
  await ev("(function(){document.querySelector('[data-testid=btn-submit-mood]').click();return 1;})()", false);
  await sleep(5000);
  await navigateTo(session, '/pages/diary/index', { ready: '[data-testid=diary-card-first]' });
  const clicked = await ev(`(function(){
    var cards = Array.from(document.querySelectorAll('[data-testid^=diary-card-]'));
    var hit = cards.find(function(c){return (c.innerText||'').indexOf(${JSON.stringify(lines[0].slice(0, 8))}) >= 0;});
    if (!hit) return 0;
    hit.click();
    return 1;
  })()`, false);
  if (Number(clicked) !== 1) return '';
  // The detail route carries the id the caller needs for a screenshot.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = String(await ev("(function(){return new URLSearchParams(location.search).get('id')||'';})()", false) ?? '');
    if (value) return value;
    await sleep(300);
  }
  return '';
});
await requireStackAtEnd();
if (id === 'SKIP') console.log('already has a diary; nothing written');
else console.log(id || 'WARNING: the new diary was not found in the list');
