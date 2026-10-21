// Merges the researched position rows (data/research/positions/*.json, each
// row with its receipts) into the ruling file data/ref/positions.json. The
// script decides what enters: a player with two sources that agree keeps
// both receipts; two that disagree on the group enter nothing and go to the
// triage list; a row for a player the worklist doesn't name is skipped. It
// prints what it skipped and why. Run check-receipts.mjs on the research
// files before this, and the build after.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'data/research/positions')
const REF = path.join(ROOT, 'data/ref/positions.json')
const worklist = new Map(JSON.parse(fs.readFileSync(path.join(DIR, 'worklist.json'), 'utf8')).players.map((p) => [p.id, p]))
const byId = new Map() // id -> { rows: [{ source, ...row }] }
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && !['worklist.json', 'residual.json', 'triage.json', 'wayback-cdx-playerfile.json'].includes(f))) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
  for (const r of data.rows ?? []) {
    if (!worklist.has(r.id)) { console.log(`skip ${f} ${r.name} (${r.id}): not on the worklist`); continue }
    if (!['G', 'F', 'C'].includes(r.pos) || !r.receipts?.length) { console.log(`skip ${f} ${r.name}: no group or no receipt`); continue }
    ;(byId.get(r.id) ?? byId.set(r.id, []).get(r.id)).push({ source: f.replace('.json', ''), ...r })
  }
}
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'))
const rows = []
const triage = []
for (const [id, list] of byId) {
  const groups = new Set(list.map((r) => r.pos))
  if (groups.size > 1) { triage.push({ id, name: list[0].name, disagreement: list.map((r) => `${r.source}: ${r.label}`), status: 'open', note: 'two sources disagree on the group; adjudicate with a third before entering' }); console.log(`triage ${list[0].name}: ${[...groups].join(' vs ')}`); continue }
  rows.push({ id, name: worklist.get(id).name, pos: list[0].pos, labels: list.map((r) => `${r.source}: ${r.label}`), grade: 'label', receipts: list.flatMap((r) => r.receipts) })
}
rows.sort((a, b) => worklist.get(b.id).games - worklist.get(a.id).games)
ref.rows = rows
ref.updated = new Date().toISOString().slice(0, 10)
fs.writeFileSync(REF, JSON.stringify(ref, null, 1) + '\n')
fs.writeFileSync(path.join(DIR, 'triage.json'), JSON.stringify({ note: 'players whose researched sources disagree on the position group; nothing enters positions.json until a third source settles it', updated: ref.updated, rows: triage }, null, 1) + '\n')
const left = [...worklist.values()].filter((p) => !byId.has(p.id))
console.log(`${rows.length} researched rows into data/ref/positions.json (${rows.filter((r) => r.receipts.length > 1).length} with two receipts), ${triage.length} in triage; worklist ${worklist.size}`)
