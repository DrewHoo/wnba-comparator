// One write per change. A query change is a replaceState so the back stack
// doesn't grow; the analytics embed counts each write as a pageview.
export function writeUrl(search, mode = 'replace') {
  try {
    const url = new URL(window.location.href)
    url.search = search
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  } catch {}
}
