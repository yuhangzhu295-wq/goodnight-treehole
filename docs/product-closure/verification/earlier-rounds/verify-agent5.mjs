/* global console */

import fs from 'node:fs';
const lines = fs.readFileSync('docs/product-audit/discovery-agent5-fake-candidates.md','utf8').split('\n');
const rows = lines.filter(l => /^\|\s*(M\d+|A\d+)\s*\|/.test(l));
const tally = {};
const fakes = [];
const nrc = [];
for (const r of rows) {
  const c = r.split('|').map(x=>x.trim());
  tally[c[4]] = (tally[c[4]]||0)+1;
  if (c[4]==='FAKE') fakes.push(c[1]+' | '+c[2]+' | '+c[6]);
  if (c[4]==='NEEDS_RUNTIME_CHECK') nrc.push(c[1]+' | '+c[2]+' | '+c[6]);
}
console.log('total rows = ' + rows.length);
console.log(JSON.stringify(tally));
console.log('FAKE:'); fakes.forEach(f=>console.log('  '+f));
console.log('NEEDS_RUNTIME_CHECK:'); nrc.forEach(f=>console.log('  '+f));

