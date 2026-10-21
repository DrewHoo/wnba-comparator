// What the ledger cannot see, as a work list: positions by source, the
// players still without one (by how much they'd show on a board), and how
// often ESPN and the WNBA roster disagree on a player's group. Run after
// `npm run ledger`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/players.json'), 'utf8'))
const c = Object.fromEntries(f.cols.map((k, i) => [k, i]))

const bySrc = {}
for (const p of f.players) bySrc[p.posSrc ?? 'none'] = (bySrc[p.posSrc ?? 'none'] ?? 0) + 1
console.log(`positions by source ${JSON.stringify(bySrc)} of ${f.players.length} players`)
const none = f.players.filter((p) => !p.pos).sort((a, b) => b.rows.length - a.rows.length)
const tier = (n) => (n >= 100 ? '100+' : n >= 30 ? '30-99' : n >= 10 ? '10-29' : '<10')
const tiers = {}
for (const p of none) tiers[tier(p.rows.length)] = (tiers[tier(p.rows.length)] ?? 0) + 1
console.log(`no position: ${none.length} players, by games ${JSON.stringify(tiers)}`)
for (const p of none.slice(0, 15)) console.log(`   ${p.name} ${p.rows[0][c.season]}–${p.rows[p.rows.length - 1][c.season]} ${p.rows.length} games`)
if (none.length > 15) console.log(`   … ${none.length - 15} more, all under ${none[15].rows.length + 1} games`)

// ESPN against the roster where both speak
const GROUP = { G: 'G', F: 'F', C: 'C', 'G-F': 'G', 'F-G': 'G', 'F-C': 'F', 'C-F': 'C' }
const roster = new Map()
for (let s = f.firstSeason; s <= f.currentSeason; s++) {
  const file = path.join(ROOT, 'data/raw', `rosters_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) if (r.player_id && r.position) { const m = roster.get(r.player_id) ?? roster.set(r.player_id, {}).get(r.player_id); m[r.position] = (m[r.position] ?? 0) + 1 }
}
let agree = 0, differ = 0
const examples = []
for (const p of f.players) {
  if (p.posSrc !== 'espn' || !roster.has(p.id)) continue
  const label = Object.entries(roster.get(p.id)).sort((a, b) => b[1] - a[1])[0][0]
  if (GROUP[label] === p.pos) agree++
  else { differ++; if (examples.length < 6) examples.push(`${p.name} ESPN ${p.pos}, roster ${label}`) }
}
if (agree + differ) console.log(`ESPN vs roster group: ${agree} agree, ${differ} differ (${(100 * differ / (agree + differ)).toFixed(0)}%); e.g. ${examples.join('; ')}`)
