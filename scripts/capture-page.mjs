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
import { ensureReverse } from './input-helpers.mjs';
import { requireStack, requireStackAtEnd } from './preflight-api.mjs';
import { normalizeRoute } from './cli-route.mjs';

// The app reaches the API through `adb reverse tcp:3000`; that tunnel disappears whenever the adb
// server or the device restarts, and the page then renders its load-error banner. A capture taken in
// that state photographs a broken tunnel, not the page.
await requireStack();
ensureReverse();

/**
 * Anchored to this file, not to the process working directory: invoked from anywhere else, the
 * relative path wrote the PNG into that other tree, so the review read a screenshot from a previous
 * run while the text in the log came from the current one.
 */
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(REPO_ROOT, 'artifacts/ui-v2/r2');
/**
 * Git Bash rewrites an argument that starts with `/` into a Windows path, so
 * `/pages/decision/index` arrives as `C:/Program Files/Git/pages/decision/index`. Passing
 * MSYS_NO_PATHCONV=1 avoids it, but a silently rewritten route used to make the capture photograph
 * whatever page was already open, so the argument is repaired here as well. The repair lives in
 * `cli-route.mjs`, because every script that takes a route needs the same one.
 */
const route = normalizeRoute(process.argv[2]);
const slug = process.argv[3] ?? String(route).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const waitMs = Number(process.argv[4] ?? 3000);

if (!route) {
  console.error('usage: node scripts/capture-page.mjs <route> [slug] [waitMs]');
  process.exit(1);
}
if (route !== process.argv[2]) {
  console.error(`note: repaired the route argument from "${process.argv[2]}" to "${route}" (Git Bash path conversion)`);
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
  //
  // A single click can be lost - the app is sometimes still booting when the script attaches, and the
  // click then lands on a document that is about to be replaced. The capture used to sleep and shoot
  // whatever was on screen, so a failed navigation produced a picture of the *previous* page filed
  // under the requested route. Verify the path and retry instead.
  const expectedPath = route.split('?')[0];
  let navigated = false;
  for (let attempt = 0; attempt < 4 && !navigated; attempt += 1) {
    await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
    for (let i = 0; i < 20; i += 1) {
      await sleep(400);
      const path = await ev('location.pathname', false);
      if (path === expectedPath) { navigated = true; break; }
    }
  }
  await sleep(waitMs);

  // The URL changes before the router has painted the new page, so a capture taken right after the
  // path matches can photograph the *previous* screen and file it under this route - which is worse
  // than no capture at all when the picture goes to a visual reviewer. Wait for the text to stop
  // changing before shooting.
  let lastText = null;
  for (let i = 0; i < 10; i += 1) {
    const text = await ev("(document.body && document.body.innerText ? document.body.innerText.replace(/\\s+/g,' ').trim() : '')", false);
    if (text && text === lastText) break;
    lastText = text;
    await sleep(600);
  }

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

  // CAPTURE_SCROLL=bottom photographs the end of the document in a normal viewport. The stitched
  // full-page mode repeats the page's top inside very tall documents, which a reviewer read as a
  // second header rather than as a stitching artefact.
  if (process.env.CAPTURE_SCROLL === 'bottom') {
    await ev("(function(){window.scrollTo(0, document.body.scrollHeight); return 1;})()", false);
    await new Promise((r) => setTimeout(r, 700));
  }
  // CAPTURE_FULL=1 photographs the whole document, not just the first screen. A page whose primary
  // action sits below the fold otherwise reaches the reviewer as a screenshot with no save button on
  // it, and "cannot confirm the button moved" reads as a failed fix.
  const shotParams = { format: 'png' };
  if (process.env.CAPTURE_FULL === '1') {
    const metrics = await call('Page.getLayoutMetrics');
    const size = metrics?.result?.cssContentSize ?? metrics?.result?.contentSize;
    if (size?.width && size?.height) {
      shotParams.captureBeyondViewport = true;
      shotParams.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
    }
  }
  const shot = await ctl(async () => call('Page.captureScreenshot', shotParams));
  let file = null;
  if (shot?.result?.data) {
    file = path.join(OUT, `${slug}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  }
  return { state, file, navigated };
});

let parsed = {};
try {
  parsed = JSON.parse(result.state || '{}');
} catch {
  // An unreadable payload leaves `parsed` empty; the report then shows the page with no text, which
  // is the honest result of a capture whose page state could not be read.
  parsed = {};
}
if (!result.navigated) {
  console.error(`WARNING: the page never reached ${route}; the screenshot shows whatever was on screen.`);
}
// A PNG taken while the API was down shows the load-error banner, and a reviewer would read that as
// the page's design. Fail loudly instead of handing over a photograph of an outage.
if (Array.isArray(parsed.errs) && parsed.errs.length) {
  console.error(`WARNING: the page rendered an error: ${parsed.errs.join(' / ')}`);
}
await requireStackAtEnd();
console.log(JSON.stringify({ route, slug, navigated: result.navigated, file: result.file, ...parsed }, null, 1));
