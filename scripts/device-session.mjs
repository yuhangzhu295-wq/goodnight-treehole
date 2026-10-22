// One place that owns the connection to the app's WebView.
//
// Every capture and seed script used to open this connection itself, and each of them failed the same
// way: the app is force-stopped or reinstalled (which this project does often, because `adb install -r`
// leaves the activity unregistered), the WebView socket it forwarded to disappears, and the next CDP
// call hangs or throws. That read as "the emulator's foreground was stolen" and was recorded as machine
// instability. Measured directly, the connection is stable - 12/12 calls over 18s with no socket close
// - as long as the pid it was opened against is still alive.
//
// So this module re-resolves the pid and re-forwards when a call fails, rather than crashing.
import { execFileSync } from 'node:child_process';

export const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
export const CDP_PORT = 9333;
export const PACKAGE = 'com.goodnight.treehole';

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The app's pid, or '' when it is not running. `pidof` exits non-zero in that case. */
export function appPid() {
  try {
    return adb('shell', 'pidof', PACKAGE);
  } catch {
    return '';
  }
}

/**
 * True when the app's window is the one in front.
 *
 * `dumpsys window` prints a "WINDOW MANAGER LAST ANR" snapshot *before* the live state, and that
 * snapshot carries its own `mCurrentFocus` line. Once any app has ANR'd, the first focus line names
 * the app that crashed rather than the app in front - reading it made every session conclude the
 * foreground had been stolen and keep relaunching while the real focus was already correct.
 * `dumpsys window displays` emits only the live display contents, so it has exactly one such line.
 */
export function isForeground() {
  try {
    let focus = adb('shell', 'dumpsys', 'window', 'displays')
      .split(/\r?\n/)
      .find((line) => line.includes('mCurrentFocus'));
    if (!focus) {
      // Older builds may not answer the `displays` form; the live section is the last one printed.
      const lines = adb('shell', 'dumpsys', 'window')
        .split(/\r?\n/)
        .filter((line) => line.includes('mCurrentFocus'));
      focus = lines[lines.length - 1];
    }
    return (focus ?? '').includes(PACKAGE);
  } catch {
    return false;
  }
}

/**
 * Brings the app back to the front, without assuming it is gone.
 *
 * A covered WebView still answers CDP but reports the *other* app's page, so a script that only
 * re-attaches on a dead socket will happily click through the wrong application. This is called
 * before reading a page's state, not just when a call fails.
 */
export async function ensureForeground(attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    if (isForeground()) return true;
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    adb('shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return isForeground();
}

/** Brings the app to the foreground and returns its pid, or '' if it will not start. */
export async function launchApp(waitMs = 8000) {
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
  adb('shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`);
  const deadline = Date.now() + waitMs;
  let pid = appPid();
  while (!pid && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    pid = appPid();
  }
  return pid;
}

/**
 * Opens a CDP session against the app's current WebView, and re-opens it if the app restarts.
 *
 * `withSession` re-resolves the pid and re-forwards when a call fails, so a script survives the app
 * being reinstalled underneath it instead of dying on a dead socket.
 */
export async function withSession(fn, { relaunch = true } = {}) {
  await ensureForeground();
  let pid = appPid();
  if (!pid) {
    if (!relaunch) throw new Error('the app is not running');
    pid = await launchApp();
    if (!pid) throw new Error('the app is not running and would not start');
  }
  const attach = async () => {
    adb('forward', '--remove-all');
    adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!target) throw new Error('no CDP page target');
    return new WebSocket(target.webSocketDebuggerUrl);
  };

  let ws = await attach();
  let seq = 0;
  const waiters = new Map();
  const onMessage = (e) => {
    const msg = JSON.parse(e.data);
    const f = waiters.get(msg.id);
    if (f) {
      waiters.delete(msg.id);
      f(msg);
    }
  };
  ws.addEventListener('message', onMessage);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  /**
   * Confirm the socket actually round-trips before handing it to the caller.
   *
   * A freshly cold-started app accepts the WebSocket connection before its renderer is ready, and the
   * first `send` then gets no reply at all - the caller sees a 15s timeout on its first read and the
   * whole run dies. One cheap round-trip here turns that into a retry.
   */
  for (let i = 0; i < 3; i += 1) {
    try {
      await call('Runtime.evaluate', { expression: '1', returnByValue: true });
      break;
    } catch {
      if (i === 2) break;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      ws.removeEventListener('message', onMessage);
      await new Promise((r) => setTimeout(r, 2500));
      ws = await attach();
      ws.addEventListener('message', onMessage);
      await new Promise((res) => ws.addEventListener('open', res, { once: true }));
    }
  }

  const call = async (method, params) => {
    try {
      return await new Promise((res, rej) => {
        const id = ++seq;
        const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 15_000);
        waiters.set(id, (m) => {
          clearTimeout(timer);
          res(m);
        });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    } catch (error) {
      // The socket is dead - almost always because the app was restarted or reinstalled. Re-open
      // against whatever pid is alive now and retry once.
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      ws.removeEventListener('message', onMessage);
      // The app may have died (this machine's emulator kills it under memory pressure). Relaunch it
      // rather than failing the run: a capture that survives a restart is worth far more than one that
      // aborts, and the relaunch is observable in the log.
      let next = appPid();
      if (!next) {
        console.log('[device-session] the app died; relaunching');
        next = await launchApp();
      }
      if (!next) throw new Error(`${method} failed and the app would not restart: ${error.message}`);
      pid = next;
      ws = await attach();
      ws.addEventListener('message', onMessage);
      await new Promise((res) => ws.addEventListener('open', res, { once: true }));
      return await new Promise((res, rej) => {
        const id = ++seq;
        const timer = setTimeout(() => rej(new Error(`${method} timed out after reconnect`)), 15_000);
        waiters.set(id, (m) => {
          clearTimeout(timer);
          res(m);
        });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
  };

  /**
   * Reads the page, guaranteeing the app is in front first.
   *
   * The foreground check matters more than it looks: a covered WebView keeps answering CDP, so a
   * read taken while another app is in front returns *that* app's page. The script then reports the
   * wrong application's content as this page's state, which is a silent wrong answer rather than an
   * error. Re-asserting before each read makes that impossible.
   */
  const ev = async (expression, awaitPromise = true) => {
    await ensureForeground();
    // A dead app leaves the forwarded socket in place, so a read would hang for the full timeout and
    // report "Runtime.evaluate timed out" - which says nothing about the real cause. Relaunch it and
    // let the next read land on the fresh instance instead.
    if (!appPid()) {
      console.log('[device-session] the app died before a read; relaunching');
      const restarted = await launchApp();
      if (!restarted) throw new Error('the app is no longer running and would not restart');
      pid = restarted;
      ws = await attach();
      ws.addEventListener('message', onMessage);
      await new Promise((res) => ws.addEventListener('open', res, { once: true }));
    }
    const r = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    // A page-side exception arrives as a normal reply with `exceptionDetails` and no value. Returning
    // null there made a broken probe indistinguishable from "the element is not there" - a capture
    // that silently produced nothing looked like an empty page. Surface it instead.
    const details = r?.result?.exceptionDetails;
    if (details) {
      const description = details.exception?.description ?? details.text ?? 'evaluation failed';
      throw new Error(`page exception: ${String(description).split('\n')[0]}`);
    }
    return r?.result?.result?.value ?? null;
  };

  try {
    return await fn({ call, ev, pid: () => pid });
  } finally {
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }
}
