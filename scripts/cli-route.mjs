// Repair a route argument that Git Bash rewrote on its way in.
//
// MSYS converts an argument starting with `/` into a Windows path, so `/pages/decision/index` arrives
// as `C:/Program Files/Git/pages/decision/index`. A script that passes that through navigates
// nowhere: the WebView refuses the path, the page that was already open stays open, and every
// control the script then looks for is reported as missing. `capture-page.mjs` repaired this and
// `verify-controls.mjs` did not, so the control suite spent a round measuring the wrong page.
//
// Passing MSYS_NO_PATHCONV=1 also avoids it; repairing here means a caller who forgets still gets a
// correct run instead of a silent false negative.
export function normalizeRoute(value) {
  if (!value) return value;
  const mangled = /^[A-Za-z]:[\\/](?:.*[\\/])?(pages[\\/].*)$/.exec(value);
  return mangled ? `/${mangled[1].replace(/\\/g, '/')}` : value;
}

/** The repaired route plus the one-line note a script should print when it had to repair it. */
export function readRouteArg(value) {
  const route = normalizeRoute(value);
  return { route, repaired: Boolean(route && value && route !== value) };
}
