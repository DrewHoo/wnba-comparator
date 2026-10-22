import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { landingFromPath } from './lib/landing.ts'
import { FIRST_SEASON } from '../scripts/lib/window.mjs'
import './styles.css'

// The markup is already in the HTML: scripts/prerender.mjs bakes it in at
// build time so crawlers get the whole page without running anything.
// Hydrate onto it rather than throwing it away. The dev server has no baked
// markup, so fall back to a plain render there.
const BASE = import.meta.env.BASE_URL
const rel = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : ''
const root = document.getElementById('root')
const mount = (app) => {
  const el = <React.StrictMode>{app}</React.StrictMode>
  if (root.firstChild) hydrateRoot(root, el)
  else createRoot(root).render(el)
}

// a player's page at player/<id>/ carries her records file in the HTML and
// needs no ledger, so the board (and the 2MB ledger it bundles) loads only
// for the board
const player = /^player\/([^/]+)\/?$/.exec(rel)
if (player) {
  const data = document.getElementById('player-data')
  let preload = null
  try { preload = data ? JSON.parse(data.textContent) : null } catch {}
  import('./components/PlayerPage.jsx').then(({ PlayerPage }) => mount(<PlayerPage id={decodeURIComponent(player[1])} preload={preload} firstSeason={FIRST_SEASON} />))
} else {
  // the page's own query, from its path: a landing's, or none at the root. The
  // prerender passed the same to the markup it baked, so the hydrate matches;
  // the search params (a slot moved, a player open) apply in App's first effect.
  const landing = landingFromPath(rel)
  const initial = landing ? { query: landing.query } : null
  import('./App.jsx').then(({ default: App }) => mount(<App initial={initial} />))
}
