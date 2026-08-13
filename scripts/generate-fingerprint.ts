import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function getGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const sha = getGitCommitSha();
const buildTime = new Date().toISOString();
const processStartTime = buildTime;
const runtimeInstanceId = Math.random().toString(36).substring(2, 15);

const fingerprint = {
  gitCommitSha: sha,
  buildTime,
  processStartTime,
  runtimeInstanceId,
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.resolve(dirname, '../artifacts/debug');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

fs.writeFileSync(path.join(artifactsDir, 'runtime-front.json'), JSON.stringify(fingerprint, null, 2));
fs.writeFileSync(path.join(artifactsDir, 'runtime-admin.json'), JSON.stringify(fingerprint, null, 2));
fs.writeFileSync(path.join(artifactsDir, 'runtime-api.json'), JSON.stringify(fingerprint, null, 2));

// Also generate a file that vite/nest can import to expose
const srcDir = path.resolve(dirname, '../packages/shared-types/src');
if (fs.existsSync(srcDir)) {
  const tsContent = `export const FINGERPRINT = ${JSON.stringify(fingerprint, null, 2)};`;
  fs.writeFileSync(path.join(srcDir, 'fingerprint.ts'), tsContent);
  // Need to export it from index.ts
  const indexFile = path.join(srcDir, 'index.ts');
  if (fs.existsSync(indexFile)) {
    const content = fs.readFileSync(indexFile, 'utf8');
    if (!content.includes("export * from './fingerprint.js'")) {
      fs.appendFileSync(indexFile, "\nexport * from './fingerprint.js';\n");
    }
  }
}
console.log('Fingerprint generated:', fingerprint);
