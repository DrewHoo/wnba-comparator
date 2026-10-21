// The finder's index: every player in the ledger with her id, name, position
// and span, written to public/players/index.json so the dateline's finder
// can fetch it lazily (PlayerFinder.jsx). Runs before `vite build` so the
// file ships with the site, and on its own (`npm run index`) for the dev
// server. Not committed; the ledger in src/data is the source. When player
// pages arrive, this is the file that says who has one.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/players')
fs.mkdirSync(OUT, { recursive: true })

const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/players.json'), 'utf8'))
const c = Object.fromEntries(file.cols.map((k, i) => [k, i]))
const index = file.players.map((p) => ({
  id: p.id,
  name: p.name,
  pos: p.pos,
  from: p.rows[0][c.season],
  to: p.rows[p.rows.length - 1][c.season],
  games: p.rows.length,
}))
// the biggest careers first: what the finder lists before anything is typed
index.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index))
console.log(`${index.length} players in public/players/index.json`)
