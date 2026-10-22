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
      const next = appPid();
      if (!next || next === pid) throw error;
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

  const ev = async (expression, awaitPromise = true) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
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
