// Captures a screen only once the target app is confirmed in the foreground.
//
// Another project's automation on this emulator relaunches com.yuhangzhu295.cozyfocus roughly every
// 35 seconds from the host (UI2-007), so a capture taken blind regularly shows the wrong app. This
// re-asserts our activity with `am start` (no force-stop, so the WebView keeps its route) and waits
// for the complete `topResumedActivity` string before writing the file.
//
// usage: node scripts/ui2-capture.mjs <outPath> [tap:x:y | swipe:x1:y1:x2:y2 | sleep:ms]...
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB ?? 'C:/Users/zyu33/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const SERIAL = process.env.SERIAL ?? 'emulator-5554';
const APP = 'com.goodnight.treehole/.MainActivity';

const adb = (...args) => execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8' });
const shell = (...args) => adb('shell', ...args);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The complete component string, never a truncated-package regex. */
function foreground() {
  const dump = shell('dumpsys', 'activity', 'activities');
  const line = dump.split('\n').find((l) => l.includes('topResumedActivity')) ?? '';
  const match = line.match(/([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.$]+)/);
  return match ? match[1] : '';
}

const outPath = process.argv[2];
const steps = process.argv.slice(3).map((step) => step.split(':'));
if (!outPath) throw new Error('usage: ui2-capture.mjs <outPath> [tap:x:y|swipe:x1:y1:x2:y2|sleep:ms]...');

for (const step of steps) {
  const [kind, ...rest] = step;
  if (kind === 'tap') shell('input', 'tap', rest[0], rest[1]);
  else if (kind === 'swipe') shell('input', 'swipe', rest[0], rest[1], rest[2], rest[3], '300');
  else if (kind === 'text') shell('input', 'text', rest.join(':'));
  else if (kind === 'sleep') sleep(Number(rest[0]));
  else throw new Error(`unknown step ${kind}`);
  sleep(kind === 'tap' ? 3500 : 1200);
}

// Re-assert the foreground and capture, retrying if the other automation got there first.
for (let attempt = 1; attempt <= 6; attempt += 1) {
  if (foreground() !== APP) {
    shell('am', 'start', '-n', APP);
    sleep(1500);
    continue;
  }
  const png = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  const confirmed = foreground();
  if (confirmed !== APP) {
    console.log(`attempt ${attempt}: foreground changed to ${confirmed} during capture, retrying`);
    continue;
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, png);
  console.log(`captured ${outPath} (${png.length} bytes) with fg=${confirmed}`);
  process.exit(0);
}
throw new Error('could not capture: the foreground was never confirmed');
