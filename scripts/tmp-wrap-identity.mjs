import fs from 'node:fs';
import path from 'node:path';

const roots = ['tests', 'scripts'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
}
for (const r of roots) if (fs.existsSync(r)) walk(r);

const headerRe = /\.set\(\s*'x-goodnight-user-id'\s*,\s*([^)]+?)\s*\)/g;

let rewritten = 0;
let importsAdded = 0;
const touched = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original.replace(headerRe, (match, arg) => {
    if (/identityFor\s*\(/.test(arg)) return match;
    return `.set('x-goodnight-user-id', identityFor(${arg}))`;
  });

  if (next === original) continue;

  // Ensure identityFor is imported. Prefer extending an existing named import from a helpers module.
  if (!/\bidentityFor\b/.test(original.replace(headerRe, ''))) {
    const importRe = /import\s*\{([^}]*)\}\s*from\s*'([^']*helpers[^']*)';/;
    const m = importRe.exec(next);
    if (m) {
      const names = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!names.includes('identityFor')) names.push('identityFor');
      next = next.replace(importRe, `import { ${names.join(', ')} } from '${m[2]}';`);
      importsAdded += 1;
    } else {
      const depth = path.relative(path.dirname(file), 'tests/business/helpers').replace(/\\/g, '/');
      const spec = depth.startsWith('.') ? depth : `./${depth}`;
      next = `import { identityFor } from '${spec}';\n${next}`;
      importsAdded += 1;
    }
  }

  fs.writeFileSync(file, next);
  rewritten += (next.match(/identityFor\(/g) || []).length;
  touched.push(file);
}

console.log('files rewritten:', touched.length);
console.log('call sites wrapped:', rewritten);
console.log('imports adjusted:', importsAdded);
for (const f of touched) console.log('  ', f);
