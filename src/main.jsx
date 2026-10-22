import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.jsx'
import { landingFromPath } from './lib/landing.ts'
import './styles.css'

// the page's own query, from its path: a landing's, or none at the root. The
// prerender passed the same to the markup it baked, so the hydrate matches;
// the search params (a slot moved, a player open) apply in App's first effect.
const BASE = import.meta.env.BASE_URL
const rel = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : ''
const landing = landingFromPath(rel)
const initial = landing ? { query: landing.query } : null

// The markup is already in the HTML: scripts/prerender.mjs bakes it in at
// build time so crawlers get the whole page without running anything.
// Hydrate onto it rather than throwing it away. The dev server has no baked
// markup, so fall back to a plain render there.
const root = document.getElementById('root')
const app = (
  <React.StrictMode>
    <App initial={initial} />
  </React.StrictMode>
)
if (root.firstChild) hydrateRoot(root, app)
else createRoot(root).render(app)
