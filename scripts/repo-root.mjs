// Paths anchored on the repository, not on the caller's working directory.
//
// Several scripts used to read `.env` (and write artifacts) through a bare relative path. Invoked
// from anywhere other than the repo root they either crashed with ENOENT or, worse, wrote their
// output into whatever tree they were started from - which is how a screenshot review once read a
// PNG from a previous run while the log showed the current page.
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

export const REPO_ROOT = path.resolve(here, '..');

/** Absolute path to a file inside the repository. */
export function repoFile(...parts) {
  return path.join(REPO_ROOT, ...parts);
}
