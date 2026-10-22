// The alias route must behave identically to the canonical one: same component, same controls, same
// result path. The audit asked for exactly this check rather than a second implementation.
import { withSession } from './device-session.mjs';
import { typeInto, ensureReverse } from './input-helpers.mjs';
ensureReverse();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, verdict, note) => { results.push(verdict); console.log(`${verdict === 'PASS' ? 'PASS ' : 'FAIL '} ${name}${note ? ' — ' + note : ''}`); };

await withSession(async (session) => {
  const { call, ev } = session;
  await call('Runtime.enable');
  const probe = async (route) => {
    await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
    await sleep(4500);
    return ev(
      `(function(){
        var input=document.querySelector('[data-testid=input-decompose]');
        var run=document.querySelector('[data-testid=btn-decompose-run]');
        return JSON.stringify({hasInput:Boolean(input), hasRun:Boolean(run), title:(document.querySelector('h1')||{}).innerText});
      })()`,
      false,
    );
  };
  const canonical = await probe('/pages/tool/decompose');
  const alias = await probe('/pages/tool/breakdown');
  const same = canonical === alias;
  record('the alias route renders the same controls', same ? 'PASS' : 'FAIL', `canonical=${canonical} alias=${alias}`);

  // And it accepts input the same way.
  const typed = await typeInto(session, 'input-decompose', '别名路由输入验证。');
  record('the alias route accepts input', typed.ok && typed.domLength === 9 ? 'PASS' : 'FAIL', typed.reason ?? `len=${typed.domLength}`);
});
const failed = results.filter((r) => r === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} alias cases passed`);
process.exit(failed.length ? 1 : 0);
