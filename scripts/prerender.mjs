// Runs after `vite build`. Bakes the rendered app into dist/index.html and
// one page per named definition (src/lib/landing.ts) at dist/<slug>/index.html,
// each with its own <head> from site.config.js and the landing table; writes
// the sitemap, llms.txt, and the ledger copy the share worker reads.
//
// Without this the deployed page is `<div id="root"></div>` and every word on
// it exists only after React runs. Google usually renders JS in a deferred
// second pass; Bing, DuckDuckGo, social unfurlers, and the LLM crawlers
// largely don't. Prerendering makes the content plain HTML.
import { createServer } from 'vite'
import { renderToString } from 'react-dom/server'
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../site.config.js'
import { OTHERS } from './lib/siblings.mjs'
import pkg from '../package.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SLUG = pkg.name
const ORIGIN = `https://${config.domain}`
const SITE = `${ORIGIN}/${SLUG}/`
const OUT = path.join(ROOT, 'dist/index.html')

if (config.domain === 'example.com') {
  console.warn('prerender: site.config.js still says example.com; the canonical and OG URLs will be wrong until you set your domain')
}

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
})
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const { LANDINGS } = await vite.ssrLoadModule('/src/lib/landing.ts')
const { decodeLedger } = await vite.ssrLoadModule('/src/lib/ledger.ts')
const { evaluate, DEFAULT_QUERY } = await vite.ssrLoadModule('/src/lib/query.ts')
const { toUrl } = await vite.ssrLoadModule('/src/lib/url.ts')
const { rowName, rowWords } = await vite.ssrLoadModule('/src/lib/words.ts')
const { leaderWords, shareDescription } = await vite.ssrLoadModule('/src/lib/share.ts')
const L = decodeLedger(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/players.json'), 'utf8')))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// --- structured data, generated from the same rows the page renders so it can't drift
const webPage = (url, name, description) => ({ '@type': 'WebPage', '@id': url, url, name, description, isPartOf: { '@type': 'WebSite', url: `${ORIGIN}/`, name: config.domain } })
const breadcrumb = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) })
/** the board's top rows as a ranked list: "Cynthia Cooper: 2,187 points through her first 100 games" */
const itemList = (name, url, board, q) => ({
  '@type': 'ItemList', name, itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: Math.min(10, board.ranked.length),
  itemListElement: board.ranked.slice(0, 10).map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: `${rowName(r)}: ${rowWords(r, q)}`, url: `${url}?t=${encodeURIComponent(r.key)}` })),
})

// --- the template: vite's index.html, with its title, root and head markers checked once
const template = fs.readFileSync(OUT, 'utf8')
// Throw rather than no-op: a Vite change that renames the marker would
// otherwise quietly ship an empty page again.
if (!template.includes('<div id="root"></div>')) throw new Error('prerender: could not find an empty #root in dist/index.html')
if (!/<title>[^<]*<\/title>/.test(template)) throw new Error('prerender: could not find <title> in dist/index.html')

/** one page: the app rendered with its own query, and a head that says what the page is */
function page({ initial, url, title, description, image, imageAlt, jsonLd }) {
  const appHtml = renderToString(React.createElement(App, { initial }))
  const head = `
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${url}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(config.domain)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(imageAlt)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${image}" />

    <!-- Cross-site chrome served by the index site: back bar, comments, analytics. -->
    <script src="${ORIGIN}/embed/back-bar.js" data-section="sports" async></script>
    <script src="${ORIGIN}/embed/giscus.js" async></script>
    <script src="${ORIGIN}/embed/analytics.js" async></script>

    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>`
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace('</head>', head)
  html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
  return { html, words: appHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length }
}

const urls = []
const llms = [] // each landing's h1, address and lead sentence

// --- the root: the default board
{
  const board = evaluate(L, DEFAULT_QUERY)
  const description = shareDescription(DEFAULT_QUERY, board, null, L.firstSeason)
  const { html, words } = page({
    initial: null, url: SITE, title: config.pageTitle ?? config.title, description,
    image: `${SITE}og.png`, imageAlt: config.ogImageAlt,
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage(SITE, config.pageTitle ?? config.title, description), breadcrumb([[config.domain, `${ORIGIN}/`], [config.title, SITE]]), itemList(config.title, SITE, board, DEFAULT_QUERY)] },
  })
  fs.writeFileSync(OUT, html)
  urls.push(SITE)
  console.log(`prerendered the root, ${(html.length / 1024).toFixed(0)}KB (~${words} words)`)
}

// --- the named definition pages: the board on each, at its own path, titled
// the way people ask; its card is the worker's board card for the query
for (const l of LANDINGS) {
  const board = evaluate(L, l.query)
  const url = `${SITE}${l.slug}/`
  const title = `${l.title} · ${config.title}`
  const lead = leaderWords(board, l.query)
  const description = shareDescription(l.query, board, null, L.firstSeason)
  const { html } = page({
    initial: { query: l.query }, url, title, description,
    image: `${SITE}share/og.png${toUrl({ query: l.query, open: null })}`, imageAlt: `${l.h1}, on a dark leaderboard.`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage(url, title, description), breadcrumb([[config.domain, `${ORIGIN}/`], [config.title, SITE], [l.h1, url]]), itemList(l.h1, url, board, l.query)] },
  })
  if (!html.includes(esc(l.h1).replace(/&quot;/g, '"').replace(/'/g, '&#x27;')) && !html.includes(l.h1)) throw new Error(`prerender: ${l.slug} does not carry its h1`)
  const dir = path.join(ROOT, 'dist', l.slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html)
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`prerender: ${l.slug} was not written`)
  urls.push(url)
  llms.push({ l, url, lead })
}
console.log(`prerendered ${LANDINGS.length} named definition pages`)

// --- the sitemap: every page, with lastmod; the index site's sitemap index lists it
const lastmod = new Date().toISOString().slice(0, 10)
fs.writeFileSync(path.join(ROOT, 'dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`)

// --- llms.txt (llmstxt.org): the site in plain markdown for a language model
// that reads it, the way a person reads the board: what it is, then one line
// per question page with its leader. Said the way the pages say it.
fs.writeFileSync(path.join(ROOT, 'dist/llms.txt'), `# ${config.title}

> ${config.description}

Every row is a player's games in order from the WNBA Stats box scores, ${L.firstSeason} to ${L.currentSeason}, every game of every season. A query is a sentence (who · which stat or per-game test · how it adds up · through how many games, starts or seasons · regular season or playoffs · since when), and the board at ${SITE} ranks every career, or every player-season, at that window; the pages below are the questions people ask. Ranks are competition ranks, ties included. The data is wehoop's (sportsdataverse), CC BY 4.0. Credit as "per WNBA Comparator" with the page's link.

## Questions

${llms.map(({ l, url, lead }) => `- [${l.h1}](${url})${lead ? `: ${lead}` : ''}`).join('\n')}

## Method

- [The method](${SITE}#method): what a game, a start and a win are here, where the box scores come from, and how positions were filled.

## The other sports sites

${OTHERS.map((s) => `- [${s.name}](${s.url}): ${s.words}.`).join('\n')}
`)

// --- the ledger, published for the share worker (workers/share), which draws a
// board's card from it; the same file the page bundles, so the two agree
fs.mkdirSync(path.join(ROOT, 'dist/share'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'src/data/players.json'), path.join(ROOT, 'dist/share/players.json'))

await vite.close()
console.log(`sitemap: ${urls.length} URLs; llms.txt: ${llms.length} questions; head written for ${SITE}`)
