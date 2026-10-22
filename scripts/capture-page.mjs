// Capture one named route and report what it rendered, so a page's acceptance can be checked
// without eyeballing a PNG.
//
// Unlike capture-all-ui.mjs this is for the review loop: it takes the route as an argument, waits
// for the page to settle, and prints the rendered text length, the error elements it found, and
// where the screenshot was written.
// Capture one named route and report what it rendered, so a page's acceptance can be checked
// without eyeballing a PNG.
//
// Unlike capture-all-ui.mjs this is for the review loop: it takes the route as an argument, waits
// for the page to settle, and prints the rendered text length, the error elements it found, and
// where the screenshot was written.
//
// The device connection goes through scripts/device-session.mjs, which re-attaches if the app was
// restarted or reinstalled underneath us - the failure that used to be recorded as "the emulator's
// foreground was stolen".
import fs from 'node:fs';
import path from 'node:path';
import { withSession, ADB } from './device-session.mjs';

const OUT = 'artifacts/ui-v2/r2';
const route = process.argv[2];
const slug = process.argv[3] ?? route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const waitMs = Number(process.argv[4] ?? 3000);

if (!route) {
  console.error('usage: node scripts/capture-page.mjs <route> [slug] [waitMs]');
  process.exit(1);
}
const ctl = async (fn) => { try { return await fn(); } catch (e) { return { __error: String(e && e.message) }; } };

// The app reaches the API over `adb reverse`; without it every request from the page fails and the
// page renders its error state, which would be captured as a defect.
try {
  const { execFileSync } = await import('node:child_process');
  execFileSync(ADB, ['reverse', 'tcp:3000', 'tcp:3000'], { stdio: 'ignore' });
} catch {
  // Reported by the page itself if it matters.
}

fs.mkdirSync(OUT, { recursive: true });

const result = await withSession(async ({ call, ev }) => {
  await call('Runtime.enable');
  await call('Page.enable');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Navigate with a real anchor click: pushState alone leaves the router's internal state behind.
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(waitMs);

  // String.raw: this expression is browser code, and `\t`/`\n`/`\r` inside it must reach the browser
  // as the two characters backslash-t. In an ordinary template literal Node interprets them first and
  // the browser receives real control characters, which truncate the character class and make the
  // whole expression a SyntaxError - the capture then silently reports a page with no text.
  const state = await ev(
    String.raw`(function(){
    var page=document.querySelector('.goodnight-page')||document.querySelector('main')||document.body;
    var text=(page?page.innerText:'')||'';
    var errs=Array.from(document.querySelectorAll('[role=alert],.error-note,.error')).filter(function(e){return (e.innerText||'').trim();}).map(function(e){return (e.innerText||'').trim().slice(0,60);});
    var imgs=Array.from(page?page.querySelectorAll('img,div'):[]).filter(function(e){var bg=getComputedStyle(e).backgroundImage;return bg&&bg!=='none'&&bg.indexOf('.png')>=0;}).length;
    var bg=getComputedStyle(page||document.body).backgroundColor;
    return JSON.stringify({len:text.split(/[\t\n\r ]+/).join(' ').trim().length,text:text.split(/[\t\n\r ]+/).join(' ').trim().slice(0,400),errs:errs.slice(0,4),decorativeLayers:imgs,background:bg});
  })()`,
    false,
  );

  const shot = await ctl(async () => call('Page.captureScreenshot', { format: 'png' }));
  let file = null;
  if (shot?.result?.data) {
    file = path.join(OUT, `${slug}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  }
  return { state, file };
});

let parsed = {};
try {
  parsed = JSON.parse(result.state || '{}');
} catch {
  // An unreadable payload leaves `parsed` empty; the report then shows the page with no text, which
  // is the honest result of a capture whose page state could not be read.
  parsed = {};
}
console.log(JSON.stringify({ route, slug, file: result.file, ...parsed }, null, 1));
