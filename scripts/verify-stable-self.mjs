// StableSelf: type into the two free-text fields, save, and confirm the API holds what was typed.
// The audit's concern was "保存/权限失败是否导致空白或重复提交".
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { withSession } from './device-session.mjs';
import { typeInto, hookPostBodies, postedBodies, ensureReverse } from './input-helpers.mjs';
import { repoFile } from './repo-root.mjs';
const env = readFileSync(repoFile('.env'), 'utf8');
const prisma = new PrismaClient({ datasources: { db: { url: env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1] } } });
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, v, note) => { results.push(v); console.log(`${v === 'PASS' ? 'PASS ' : 'FAIL '} ${n}${note ? ' — ' + note : ''}`); };

const MARKER = `稳定自述_${Date.now()}`;
await withSession(async (session) => {
  const { call, ev } = session;
  await call('Runtime.enable');
  const go = async () => {
    await ev("(function(){var a=document.createElement('a');a.href='/pages/stable-self/index';a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()", false);
    // Wait for the field itself rather than a fixed sleep: after a restart the page can still be
    // loading when a 4.5s timer expires, and the failure then reads as "the field did not take focus".
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (Number(await ev("(function(){return document.querySelector('[data-testid=stable-description]')?1:0;})()", false)) === 1) return;
      await sleep(300);
    }
  };

  // 1. typing reaches Vue
  await go();
  const t1 = await typeInto(session, 'stable-description', MARKER);
  record('typing reaches Vue (description)', t1.ok && t1.domLength === MARKER.length ? 'PASS' : 'FAIL', t1.reason ?? `len=${t1.domLength}`);

  // 2. the second field too
  const t2 = await typeInto(session, 'reality-reminder', '先把手机放到客厅，只留闹钟。');
  record('typing reaches Vue (reality reminder)', t2.ok && t2.domLength === 14 ? 'PASS' : 'FAIL', t2.reason ?? `len=${t2.domLength}`);

  // 3. save sends the typed text. The write is gated on allowRecoveryData - the product's own rule -
  //    and the API refuses it without that switch, so the switch is opened first. Leaving it to the
  //    read-back step made this script report a body-only "PASS" for a save the server had rejected,
  //    and then fail on a read-back of a row that was never written.
  // A freshly installed app mints its credential on first use; reading Preferences before that
  // completes yields an empty header, and every request below then fails 401 - which the read-back
  // used to report as "no field", i.e. as if the save had silently not persisted.
  const credential = await (async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const value = String(await ev(
        "(async()=>{var p=window.Capacitor.Plugins.Preferences;var cr=await p.get({key:'goodnight-identity-credential'});return (cr&&cr.value)||'';})()",
        true,
      ) ?? '');
      if (value) return value;
      await sleep(300);
    }
    return '';
  })();
  record('the app holds an identity credential', credential ? 'PASS' : 'FAIL', credential ? 'present' : 'missing');
  const consentStatus = await ev(
    "(async()=>{" +
    "  var r=await fetch('http://127.0.0.1:3000/api/v1/settings/privacy',{method:'PATCH',headers:{'content-type':'application/json','x-goodnight-user-id':" + JSON.stringify(credential) + "},body:JSON.stringify({allowRecoveryData:true})});" +
    "  return r.status;" +
    "})()",
    true,
  );
  record('the recovery-data switch opens before saving', Number(consentStatus) === 200 ? 'PASS' : 'FAIL', `status=${consentStatus}`);
  await sleep(500);
  await hookPostBodies(session);
  await ev("(function(){var e=document.querySelector('[data-testid=stable-self-save]');e.click();return 1;})()", false);
  await sleep(4000);
  const bodies = await postedBodies(session, '/api/v1/me/stable-self');
  let sent = null;
  try { sent = JSON.parse(bodies[bodies.length - 1] ?? '{}'); } catch { sent = null; }
  const desc = sent && sent.profile ? sent.profile.stableDescription : null;
  record('save submits the typed text', desc === MARKER ? 'PASS' : 'FAIL', JSON.stringify(desc ?? null).slice(0, 50));

  // 4. and it lands in the database under this identity.
  // Everything happens in one page-side expression: the credential is read from Preferences and used
  // in the same breath, so the write and the read cannot drift onto two identities (a relaunch mints a
  // new anonymous one). The read is gated on allowRecoveryData, so that switch is opened first - the
  // gate is the product's rule, not something to route around.
  const readback = await ev(
    "(async()=>{" +
    "  var p=window.Capacitor.Plugins.Preferences;" +
    "  var cr=await p.get({key:'goodnight-identity-credential'});" +
    "  var cred=(cr&&cr.value)||'';" +
    "  if(!cred) return 'no credential';" +
    "  var H={'content-type':'application/json','x-goodnight-user-id':cred};" +
    "  await fetch('http://127.0.0.1:3000/api/v1/settings/privacy',{method:'PATCH',headers:H,body:JSON.stringify({allowRecoveryData:true})});" +
    "  var r=await fetch('http://127.0.0.1:3000/api/v1/me/stable-self',{headers:H});" +
    "  if(r.status!==200) return 'get('+r.status+')';" +
    "  var b=await r.json();" +
    "  var item=b.item||{};" +
    "  var desc=item.profile?item.profile.stableDescription:item.stableDescription;" +
    "  return String(desc===undefined?'(no field)':desc);" +
    "})()",
    true,
  );
  record('the saved text is readable back', readback === MARKER ? 'PASS' : 'FAIL', `read=${JSON.stringify(readback ?? null).slice(0, 50)}`);
});
await prisma.$disconnect();
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} stable-self cases passed`);
process.exit(failed.length ? 1 : 0);
