// The known-answer gate: published factoids the ledger has to reproduce.
// Prints each with the numbers it found; the test in src/lib/query.test.ts
// pins the ones that pass. Run after `npm run ledger`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeLedger } from '../src/lib/ledger.ts'
import { evaluate, DEFAULT_QUERY } from '../src/lib/query.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const L = decodeLedger(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/players.json'), 'utf8')))
const row = (board, name, season) => [...board.ranked, ...board.onTheWay].find((r) => r.player.name === name && (season == null || r.season === season))
const top = (b, k = 4) => b.ranked.slice(0, k).map((r) => `${r.rank}. ${r.player.name}${r.season != null ? ` ${r.season}` : ''} ${r.value}`).join(' · ')
const season = (stat, n = 44) => evaluate(L, { ...DEFAULT_QUERY, stat, seq: 'teamGames', n })

console.log("0. Cynthia Cooper's 621 points in 1997 (28 games) and Tamika Catchings's 594 in 2002 (32)")
{ const c = row(season('pts', 28), 'Cynthia Cooper', 1997), t = row(season('pts', 32), 'Tamika Catchings', 2002); console.log(`   Cooper ${c?.value} in ${c?.games.length}, Catchings ${t?.value} in ${t?.games.length}`) }
console.log("1. A'ja Wilson's 1,021 points in 2024, the first 1,000-point season")
{ const b = season('pts'); const w = row(b, "A'ja Wilson", 2024); console.log(`   ${w?.value} in ${w?.games.length} games, rank ${w?.rank} · ${top(b)}`) }
console.log('2. Caitlin Clark\'s 337 assists in 2024, the single-season record')
{ const b = season('ast'); const c = row(b, 'Caitlin Clark', 2024); console.log(`   ${c?.value} in ${c?.games.length} games, rank ${c?.rank} · ${top(b)}`) }
console.log('3. Sabrina Ionescu\'s 128 threes in 2023')
{ const b = season('tpm'); const s = row(b, 'Sabrina Ionescu', 2023); console.log(`   ${s?.value}, rank ${s?.rank} · ${top(b)}`) }
console.log('4. Tina Charles\'s 398 rebounds in 2010')
{ const b = season('reb'); const t = row(b, 'Tina Charles', 2010); console.log(`   ${t?.value}, rank ${t?.rank} · ${top(b)}`) }
console.log('5. Caitlin Clark\'s two triple-doubles in 2024, the first by a rookie')
{ const b = season('td', 40); const c = row(b, 'Caitlin Clark', 2024); console.log(`   ${c?.value}, rank ${c?.rank} · ${top(b, 4)}`) }
console.log('6. Paige Bueckers\'s 44 points on Aug 20, 2025, the rookie record: one 40-point game in her team\'s 44')
{ const b = evaluate(L, { ...DEFAULT_QUERY, how: 'count', tests: [{ stat: 'pts', min: 40 }], seq: 'teamGames', n: 44 }); const p = row(b, 'Paige Bueckers', 2025); console.log(`   ${p?.value} (${p?.games.filter((g) => g.pts >= 40).map((g) => `${g.pts} on ${g.date}`)}), rank ${p?.rank} of ${b.ranked.length}`) }
console.log('7. fastest to 1,000 points, by games')
{ const b = evaluate(L, { ...DEFAULT_QUERY, how: 'reach', n: 1000, dir: 'fewest' }); console.log(`   ${top(b, 6)}`) }
console.log('8. most points through the first 100 games (the default board)')
{ const b = evaluate(L, DEFAULT_QUERY); console.log(`   ${top(b, 6)} · ${b.ranked.length} careers, ${b.onTheWay.length} on the way`) }
console.log('9. most assists through the first 50 games')
{ const b = evaluate(L, { ...DEFAULT_QUERY, stat: 'ast', n: 50 }); console.log(`   ${top(b, 6)}`) }
console.log('10. wins through the first 100 starts')
{ const b = evaluate(L, { ...DEFAULT_QUERY, stat: 'win', seq: 'starts', n: 100 }); console.log(`   ${top(b, 6)} · ${b.ranked.length} careers, ${b.gapped} sit out (no starter flag)`) }
console.log('11. double-doubles through the first 100 games')
{ const b = evaluate(L, { ...DEFAULT_QUERY, stat: 'dd', n: 100 }); console.log(`   ${top(b, 6)}`) }
