// One write per change. A query change is a replaceState so the back stack
// doesn't grow; the analytics embed counts each write as a pageview. The
// address is relative to the site's base: a landing's path with its params,
// or just the root's params ("?n=50").
export function writeUrl(address, mode = 'replace') {
  try {
    const url = new URL(import.meta.env.BASE_URL + address, window.location.href)
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  } catch {}
}
