// Generate the social preview images. Run: npm run gen:og
//   public/og.png    1200x630, what X/Bluesky/LinkedIn/Reddit/iMessage show
//   public/card.png  1200x750, the 8:5 cover for the index site's project card
//
// The composition is the real thing: the default board (players by points
// through their first 100 games) from src/data/players.json through
// src/lib/query.ts, drawn in the page's own look. It drifts as
// results come in; re-run after a redesign or when a fresher board is worth
// committing. Outputs are committed; CI does not regenerate them.
//
// Text is drawn as glyph outlines through opentype.js (pinned to 1.3.4; 2.x
// emits NaN path data), because sharp's librsvg never finds Graduate or Plex
// Mono. The TTFs are committed under scripts/fonts/ (OFL).
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'
import config from '../site.config.js'
import pkg from '../package.json' with { type: 'json' }
import { decodeLedger } from '../src/lib/ledger.ts'
import { evaluate, DEFAULT_QUERY } from '../src/lib/query.ts'
import { queryWords } from '../src/lib/words.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(ROOT, 'public')
mkdirSync(outDir, { recursive: true })

const font = (f) => opentype.parse(readFileSync(resolve(ROOT, 'scripts/fonts', f)).buffer.slice(0))
// The title is Georgia Bold, the same face Hostile Territory's poster uses, read from
// the Mac's own copy (not redistributable, so never committed here).
const GEORGIA_BOLD = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
const titleFont = () => {
  if (!existsSync(GEORGIA_BOLD)) throw new Error(`title font missing: ${GEORGIA_BOLD} (run gen:og on a Mac, or point GEORGIA_BOLD at a Georgia Bold TTF)`)
  return opentype.parse(readFileSync(GEORGIA_BOLD).buffer.slice(0))
}
const FONT = {
  Graduate: font('Graduate-Regular.ttf'),
  Mono: font('IBMPlexMono-Regular.ttf'),
  MonoBold: font('IBMPlexMono-SemiBold.ttf'),
  Serif: font('SourceSerif4-Regular.ttf'),
  Title: titleFont(),
}
const width = (str, name, size, spacing = 0) => FONT[name].getAdvanceWidth(str, size, { kerning: true, letterSpacing: spacing / size })
function text(str, { x, y, font: name, size, fill, anchor = 'start', spacing = 0, opacity }) {
  const f = FONT[name]
  const opts = { kerning: true, letterSpacing: spacing / size }
  const w = f.getAdvanceWidth(str, size, opts)
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return `<path d="${f.getPath(str, x0, y, size, opts).toPathData(2)}" fill="${fill}"${opacity != null ? ` opacity="${opacity}"` : ''}/>`
}

const BG = '#282127', INK = '#efe6d9', MUTED = '#bfb2a6', FAINT = '#857a75', LINE = '#453a42', CREAM = '#f3e2bc', RUST = '#c36c36'

const ledger = decodeLedger(JSON.parse(readFileSync(resolve(ROOT, 'src/data/players.json'), 'utf8')))
const query = DEFAULT_QUERY
const board = evaluate(ledger, query)

function render(W, H) {
  const L = 100, R = W - 100
  const rowH = 42
  const top = 258
  const footerY = H - 36
  const rows = board.ranked.slice(0, Math.floor((footerY - 30 - top) / rowH))
  const parts = []
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`)
  parts.push(`<rect width="${W}" height="${H}" fill="url(#glow)"/>`)
  parts.push(text(`${config.domain.toUpperCase()} · ${ledger.firstSeason}–${ledger.currentSeason}`, { x: W / 2, y: 58, font: 'Mono', size: 15, fill: FAINT, anchor: 'middle', spacing: 2.4 }))
  parts.push(text(config.title, { x: W / 2, y: 132, font: 'Title', size: 72, fill: CREAM, anchor: 'middle', spacing: 1 }))
  parts.push(text(queryWords(query), { x: W / 2, y: 182, font: 'Serif', size: 25, fill: INK, anchor: 'middle' }))
  parts.push(text(config.ogSubtitle, { x: W / 2, y: 214, font: 'Serif', size: 18, fill: FAINT, anchor: 'middle' }))
  // the board's header and rows
  parts.push(`<line x1="${L}" y1="${top - 22}" x2="${R}" y2="${top - 22}" stroke="${LINE}" stroke-dasharray="1 3"/>`)
  parts.push(text(`${board.ranked.length} CAREERS WITH THE WHOLE WINDOW`, { x: L, y: top - 4, font: 'Mono', size: 10.5, fill: FAINT, spacing: 1.4 }))
  parts.push(text('POINTS', { x: R, y: top - 4, font: 'Mono', size: 10.5, fill: FAINT, anchor: 'end', spacing: 1.4 }))
  rows.forEach((r, i) => {
    const y = top + rowH * (i + 1) - 12
    const rank = `${r.tied ? 'T' : ''}${r.rank}`
    parts.push(text(rank, { x: L + 4, y, font: 'Mono', size: 12, fill: r.rank === 1 ? CREAM : FAINT }))
    parts.push(text(r.player.name, { x: L + 50, y, font: 'Serif', size: 22, fill: INK }))
    parts.push(text(`${r.from}–${r.to}`, { x: L + 50 + width(r.player.name, 'Serif', 22) + 14, y, font: 'Mono', size: 10.5, fill: FAINT, spacing: 0.8 }))
    parts.push(text(r.value.toLocaleString('en-US'), { x: R, y: y + 1, font: 'Graduate', size: 26, fill: CREAM, anchor: 'end' }))
    parts.push(`<line x1="${L}" y1="${y + 14}" x2="${R}" y2="${y + 14}" stroke="${LINE}" stroke-dasharray="1 3"/>`)
  })
  parts.push(text(`${config.domain}/${pkg.name}`, { x: L, y: footerY, font: 'Mono', size: 13, fill: FAINT, spacing: 1 }))
  parts.push(`<rect x="${R - 80}" y="${footerY - 9}" width="80" height="3" fill="${RUST}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="-0.2" r="0.9">
      <stop offset="0%" stop-color="${CREAM}" stop-opacity="0.12"/>
      <stop offset="65%" stop-color="${CREAM}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${parts.join('\n  ')}
</svg>`
}

for (const { name, w, h } of [
  { name: 'og.png', w: 1200, h: 630 },
  { name: 'card.png', w: 1200, h: 750 },
]) {
  const out = resolve(outDir, name)
  await sharp(Buffer.from(render(w, h))).png({ compressionLevel: 9 }).toFile(out)
  console.log(`wrote ${name} (${w}x${h})`)
}
