// Type into a field the way a user does, and assert the effect reached the database.
//
// The `fill` helper used everywhere before this set `.value` and dispatched `input`. That updates the
// DOM but not Vue's reactive state: the page showed the text while `form.content` stayed empty, so a
// submit either failed validation or sent an empty body, and the failure looked like a product bug.
//
// CDP `Input.insertText` goes through the caret - the same path a real keyboard takes - so Vue's
// listener fires and the model updates. It needs a focused field, so this taps first.
//
// Usage:
//   const session = await withSession(...);
//   const typed = await typeInto(session, 'input-mood-content', '内容');
//   console.log(typed); // { ok, domLength, stateReadout }
import { execFileSync } from 'node:child_process';
import { ADB } from './device-session.mjs';

/** Waits for a control to exist and be measurable, rather than assuming navigation finished. */
export async function waitForControl(session, testId, timeoutMs = 20000) {
  const { ev } = session;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const box = await ev(
      `(function(){
        var e=document.querySelector('[data-testid="${testId}"]');
        if(!e) return null;
        var r=e.getBoundingClientRect();
        if(r.width<=0||r.height<=0) return null;
        return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];
      })()`,
      false,
    );
    if (box && box.length === 2) return box;
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

/** Taps the control and inserts the text at the caret. Returns what the page actually shows. */
export async function typeInto(session, testId, text, { tap = true } = {}) {
  const { call, ev } = session;
  const box = await waitForControl(session, testId);
  if (!box) return { ok: false, reason: 'control not found', testId };

  if (tap) {
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: box[0], y: box[1], button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box[0], y: box[1], button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 700));
  }

  // A focused field is the precondition; without it insertText is silently dropped.
  const focused = await ev(
    `(function(){var e=document.querySelector('[data-testid="${testId}"]');return document.activeElement===e;})()`,
    false,
  );
  if (!focused) return { ok: false, reason: 'field did not take focus', testId };

  const inserted = await call('Input.insertText', { text });
  if (inserted?.error) return { ok: false, reason: String(inserted.error), testId };
  await new Promise((r) => setTimeout(r, 500));

  const readout = await ev(
    `(function(){
      var e=document.querySelector('[data-testid="${testId}"]');
      var counter=document.querySelector('.counter');
      return JSON.stringify({
        domLength: e.value.length,
        domValue: e.value,
        // The counter is bound to the same model the form submits, so it is the cheapest honest read
        // of the reactive state: if it moves, the input reached Vue.
        stateReadout: counter ? counter.innerText : null
      });
    })()`,
    false,
  );
  let parsed = {};
  try {
    parsed = JSON.parse(readout || '{}');
  } catch {
    return { ok: false, reason: 'could not read back the field', testId };
  }
  return { ok: true, ...parsed };
}

/** Clears a field, so a case can start from empty without reloading the page. */
export async function clearField(session, testId) {
  const { ev } = session;
  await ev(
    `(function(){
      var e=document.querySelector('[data-testid="${testId}"]');
      if(!e) return false;
      e.focus();
      e.setSelectionRange(0, e.value.length);
      return true;
    })()`,
    false,
  );
  const { call } = session;
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await new Promise((r) => setTimeout(r, 400));
}

/** Records every POST body the page sends, so an assertion can check what was actually submitted. */
export async function hookPostBodies(session) {
  const { ev } = session;
  await ev(
    `(function(){
      window.__postedBodies = window.__postedBodies || {};
      if (window.__postedHooked) return 'already';
      window.__postedHooked = true;
      var f = window.fetch;
      window.fetch = function () {
        var a = arguments;
        try {
          if (a[1] && String(a[1].method).toUpperCase() === 'POST') {
            var key = String(a[0]);
            (window.__postedBodies[key] = window.__postedBodies[key] || []).push(String(a[1].body));
          }
        } catch (e) { /* never break the app for a probe */ }
        return f.apply(this, a);
      };
      return 'hooked';
    })()`,
    false,
  );
}

export async function postedBodies(session, pathFragment) {
  const { ev } = session;
  const raw = await ev(
    `(function(){
      var keys = Object.keys(window.__postedBodies || {}).filter(function (k) {
        return k.indexOf(${JSON.stringify(pathFragment)}) >= 0;
      });
      var all = [];
      keys.forEach(function (k) { all = all.concat(window.__postedBodies[k]); });
      return JSON.stringify(all);
    })()`,
    false,
  );
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

/** Restores the emulator's `adb reverse` so the app can reach the API at 127.0.0.1:3000. */
export function ensureReverse() {
  try {
    execFileSync(ADB, ['reverse', 'tcp:3000', 'tcp:3000'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
