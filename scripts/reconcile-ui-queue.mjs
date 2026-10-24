/**
 * Reconciles docs/design-v2/UI_V2_MASTER_QUEUE.json's `rendered` axis against the screenshots that
 * actually exist on disk.
 *
 * The V8 book asks for the queue to be re-checked against real artifacts rather than edited into a
 * better-looking shape, and names two specific suspicions: Round 2 pages marked rendered but not
 * implemented, and Round 3 pages whose `rendered` lags behind an existing image. This checks the part
 * that is mechanically checkable - does the file the entry names, or a file for that page, exist and
 * is it a real portrait capture - and reports everything else for a human to read.
 *
 * It does NOT touch `implemented`, `visualApproved` or `codeReviewApproved`: those are judgements and
 * flipping them from a script is exactly the "刷成 DONE" the book forbids.
 *
 * Usage: node scripts/reconcile-ui-queue.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const dir = 'artifacts/ui-v2/android';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')) : [];

/** A capture is usable evidence only if it is a real portrait PNG, not a truncated or rotated frame. */
function inspect(file) {
  const full = path.join(dir, file);
  const buf = fs.readFileSync(full);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return { ok: false, reason: 'not a PNG' };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > height) return { ok: false, reason: `landscape ${width}x${height}` };
  return { ok: true, width, height, bytes: buf.length };
}

const queuePath = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

const corrections = [];
const notes = [];

for (const task of q.tasks) {
  // Any file whose name starts with R<round>_<Page>_ belongs to that page.
  const prefix = `R${task.round}_${task.page}_`;
  const matches = files.filter((f) => f.startsWith(prefix)).map((f) => ({ f, ...inspect(f) }));
  const usable = matches.filter((m) => m.ok);
  const broken = matches.filter((m) => !m.ok);
  const claims = String(task.rendered ?? 'no');

  if (broken.length) {
    notes.push(`${task.page}: ${broken.length} capture(s) unusable - ${broken.map((b) => `${b.f} (${b.reason})`).join(', ')}`);
  }

  if (claims === 'no' && usable.length > 0) {
    corrections.push({
      id: task.id,
      page: task.page,
      from: 'no',
      to: 'yes',
      evidence: `${usable.length} real capture(s) on disk, e.g. ${usable[0].f} (${usable[0].width}x${usable[0].height}, ${Math.round(usable[0].bytes / 1024)}KB)`,
    });
    if (apply) {
      task.rendered = 'yes';
      task.screenshot = usable.map((u) => path.join(dir, u.f)).join(',');
      task.notes = [task.note, `rendered corrected by scripts/reconcile-ui-queue.mjs: ${usable[0].f} exists and is a portrait capture.`]
        .filter(Boolean)
        .join(' ');
    }
  }

  if (claims === 'yes' && usable.length === 0) {
    notes.push(
      `${task.page}: queue says rendered=yes but no usable capture matches ${prefix}* - the entry's own path is "${task.screenshot || '(empty)'}"`,
    );
  }
}

console.log(`screenshots on disk: ${files.length}`);
console.log();
if (corrections.length) {
  console.log('CORRECTIONS (queue said rendered=no, a real capture exists):');
  for (const c of corrections) console.log(`  ${c.page} [${c.id}]: ${c.from} -> ${c.to}  (${c.evidence})`);
} else {
  console.log('CORRECTIONS: none - the rendered=no entries really have no capture.');
}
console.log();
if (notes.length) {
  console.log('NEEDS A HUMAN READ:');
  for (const n of notes) console.log('  ' + n);
} else {
  console.log('NEEDS A HUMAN READ: none');
}
console.log();

if (apply && corrections.length) {
  q.updatedAt = new Date().toISOString();
  fs.writeFileSync(queuePath, JSON.stringify(q, null, 2) + '\n');
  console.log(`applied ${corrections.length} correction(s) to ${queuePath}`);
} else if (corrections.length) {
  console.log('dry run - re-run with --apply to write');
}
