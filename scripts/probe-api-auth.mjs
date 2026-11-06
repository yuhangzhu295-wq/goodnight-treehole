// Asks the running app's own WebView to call the API with its own credentials and reports what came
// back. A page that shows "服务暂时不可用" tells you nothing about which request failed or why; the
// status and body do.
import { withSession } from './device-session.mjs';

const route = process.argv[2] ?? '/pages/diary/index';
const endpoint = process.argv[3] ?? '/api/v1/diaries';
const waitMs = Number(process.argv[4] ?? 4000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await withSession(async (session) => {
  const { ev } = session;
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();return 1;})()`, false);
  await sleep(waitMs);

  const storage = JSON.parse(await ev(`(function(){
    var out = {};
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      var value = localStorage.getItem(key) || '';
      out[key] = value.length > 120 ? value.slice(0, 120) + '…' : value;
    }
    return JSON.stringify(out);
  })()`, false) || '{}');

  const result = JSON.parse(await ev(`(async function(){
    // The app keeps its identity in storage; send the same header the api layer sends so the probe
    // measures the server's answer to this device rather than to an anonymous caller.
    var credential = '';
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (/credential|identity|token/i.test(key)) { credential = localStorage.getItem(key) || ''; break; }
    }
    var response = await fetch(${JSON.stringify(endpoint)}, { headers: credential ? { 'x-goodnight-user-id': credential } : {} });
    var text = await response.text();
    return JSON.stringify({ status: response.status, body: text.slice(0, 300), sentCredential: Boolean(credential) });
  })()`, true) || '{}');

  console.log(JSON.stringify({ route, endpoint, storageKeys: Object.keys(storage), storage, ...result }, null, 2));
});
