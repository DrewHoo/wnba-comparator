// Builds the ledger the site reads: per player, every game she appeared in,
// in order. The spine is the WNBA Stats player game logs (1997 on, every
// game); the ESPN box scores (2003 on) fill any game the logs lack (the
// running season's tail when the Stats pipeline is behind) and supply the
// starter flag, joined by player and date through wehoop's crosswalk; the
// ESPN bios supply the position and birth date. One file,
// src/data/players.json, in a compact array form (src/lib/ledger.ts decodes
// it; COLS below is the row layout).
//
// What the data can't say, so the site doesn't: a game with no ESPN box
// (every game before 2003 and a few after) has no starter flag, so its
// `started` is -1 (null in the engine) and the starts sequence sits a career
// out when one falls inside its window. A row in the game log is an
// appearance; the logs have no row for a player who didn't play.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCsv } from './lib/csv.mjs'
import { FIRST_SEASON, ESPN_FIRST_SEASON, CURRENT_SEASON } from './lib/window.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data/raw')
const OUT = path.join(ROOT, 'src/data')
fs.mkdirSync(OUT, { recursive: true })

// the row layout; src/lib/ledger.ts reads the same order
export const COLS = ['season', 'post', 'date', 'home', 'team', 'opp', 'started', 'result', 'tgn',
  'min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf']
const num = (v) => (v === '' || v === 'NA' ? 0 : Math.round(Number(v)))
const yes = (v) => String(v).toLowerCase() === 'true'
const ymd = (s) => Number(s.slice(0, 10).replace(/-/g, ''))
const majority = (counter) => [...counter].sort((a, b) => b[1] - a[1])[0]?.[0]
const vote = (map, key, value) => { const c = map.get(key) ?? map.set(key, new Map()).get(key); c.set(value, (c.get(value) ?? 0) + 1) }
// a name the two sources can agree on: lowercase letters only, no accents, no nicknames in parentheses
const plain = (name) => name.normalize('NFD').replace(/\(.*?\)/g, '').replace(/[^a-zA-Z ]/g, '').toLowerCase().trim().split(/\s+/)
const nameKey = (name) => plain(name).join('')
const shortKey = (name) => { const w = plain(name); return w.length ? `${w[0][0]}${w[w.length - 1]}` : '' }

// 1. the spine: every appearance in the game logs, and from them every game
const games = new Map() // game id -> { season, post, date, home, away } in WNBA Stats team codes
const apps = [] // { pid, name, gameId, team, opp, home, result, line }
for (let s = FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `player_game_logs_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) {
    if (!r.player_id) continue // a team row
    const m = /^(\S+) (vs\.|@) (\S+)$/.exec(r.matchup)
    if (!m || m[1] !== r.team_abbreviation) throw new Error(`matchup ${r.matchup} for ${r.team_abbreviation}`)
    const home = m[2] === 'vs.'
    const opp = m[3]
    const post = r.season_type === 'playoffs' ? 1 : 0
    const date = ymd(r.game_date)
    if (!games.has(r.game_id)) games.set(r.game_id, { season: Number(r.season), post, date, home: home ? r.team_abbreviation : opp, away: home ? opp : r.team_abbreviation })
    apps.push({
      pid: r.player_id, name: r.player_name, gameId: r.game_id, team: r.team_abbreviation, opp, home, result: r.wl === 'W' ? 2 : r.wl === 'L' ? 0 : 1,
      line: [num(r.min), num(r.pts), num(r.fgm), num(r.fga), num(r.fg3m), num(r.fg3a), num(r.ftm), num(r.fta), num(r.oreb), num(r.dreb), num(r.reb), num(r.ast), num(r.stl), num(r.blk), num(r.tov), num(r.pf)],
    })
  }
}
const logLast = {} // season -> last date in the logs
for (const g of games.values()) logLast[g.season] = Math.max(logLast[g.season] ?? 0, g.date)

// 2. the crosswalk: WNBA Stats player id <-> ESPN athlete id (the id most seasons agree on), and a position of last resort
const espnVotes = new Map(), wnbaVotes = new Map()
const xwPos = new Map() // pid -> position
for (let s = ESPN_FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `wnba_player_crosswalk_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) {
    if (!r.wnba_player_id || !r.espn_athlete_id) continue
    vote(espnVotes, r.wnba_player_id, r.espn_athlete_id)
    vote(wnbaVotes, r.espn_athlete_id, r.wnba_player_id)
    const pos = [r.espn_position, r.wnba_position].find((p) => p && p !== 'NA')
    if (pos && !xwPos.has(r.wnba_player_id)) xwPos.set(r.wnba_player_id, pos)
  }
}
const espnOf = new Map([...espnVotes].map(([k, c]) => [k, majority(c)]))
const wnbaOf = new Map([...wnbaVotes].map(([k, c]) => [k, majority(c)]))

// 3. the ESPN box scores: every played row by game, the starter flag by player and date
// (by ESPN id, then by name for a player the crosswalk lacks), the position by player
const skipGame = new Set() // the All-Star game and the Commissioner's Cup final: on ESPN's schedule, not league games
for (let s = ESPN_FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `wnba_schedule_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const g of readCsv(file)) if (g.type_abbreviation === 'ALLSTAR' || g.type_abbreviation === 'CC' || g.status_type_name !== 'STATUS_FINAL') skipGame.add(g.game_id)
}
const espnGames = new Map() // espn game id -> { season, post, date, home, away (ESPN codes), rows }
const startOf = new Map() // `${espnId}|${date}` -> 0 | 1
const startByName = new Map() // `${nameKey}|${date}` and `${shortKey}|${date}` -> 0 | 1, or -1 when two players share the key that day
const espnTeamOf = new Map() // `${espnId}|${date}` -> ESPN team code
const boxPos = new Map() // espnId -> { pos: n }
for (let s = ESPN_FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `player_box_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) {
    if (skipGame.has(r.game_id) || yes(r.did_not_play) || r.points === '' || r.minutes === '') continue
    const date = ymd(r.game_date)
    const flag = yes(r.starter) ? 1 : 0
    startOf.set(`${r.athlete_id}|${date}`, flag)
    espnTeamOf.set(`${r.athlete_id}|${date}`, r.team_abbreviation)
    for (const k of [`${nameKey(r.athlete_display_name)}|${date}`, `${shortKey(r.athlete_display_name)}|${date}`]) startByName.set(k, startByName.has(k) ? -1 : flag)
    const pos = r.athlete_position_abbreviation
    if (pos && pos !== 'NA') { const c = boxPos.get(r.athlete_id) ?? boxPos.set(r.athlete_id, {}).get(r.athlete_id); c[pos] = (c[pos] ?? 0) + 1 }
    const home = r.home_away === 'home'
    const eg = espnGames.get(r.game_id) ?? espnGames.set(r.game_id, { season: Number(r.season), post: r.season_type === '3' ? 1 : 0, date, home: home ? r.team_abbreviation : r.opponent_team_abbreviation, away: home ? r.opponent_team_abbreviation : r.team_abbreviation, rows: [] }).get(r.game_id)
    eg.rows.push(r)
  }
}

// 4. ESPN's team codes to the logs' codes, by season, through the players the two sources share on a date
const teamVotes = new Map() // `${season}|${espnCode}` -> Map<statsCode, n>
const lastCode = new Map() // espnCode -> statsCode, the latest season's
for (const a of apps) {
  const g = games.get(a.gameId)
  const espn = espnOf.get(a.pid)
  const code = espn && espnTeamOf.get(`${espn}|${g.date}`)
  if (code) vote(teamVotes, `${g.season}|${code}`, a.team)
}
const teamMap = new Map([...teamVotes].map(([k, c]) => [k, majority(c)]))
for (const k of [...teamMap.keys()].sort()) lastCode.set(k.split('|')[1], teamMap.get(k))
const toCode = (season, espnCode) => teamMap.get(`${season}|${espnCode}`) ?? lastCode.get(espnCode) ?? espnCode

// 5. games the logs lack, filled from ESPN: the running season's tail, or a game the Stats pipeline missed
const statsKey = new Set([...games.values()].map((g) => `${g.date}|${g.home}|${g.away}`))
const statsHomeDay = new Set([...games.values()].map((g) => `${g.date}|${g.home}`))
const pidByName = new Map() // nameKey -> pid, for a player the crosswalk lacks; -1 when two share it
for (const a of apps) { const k = nameKey(a.name); pidByName.set(k, pidByName.has(k) && pidByName.get(k) !== a.pid ? -1 : a.pid) }
const filled = {} // season -> games filled
let suspect = 0
for (const [id, eg] of espnGames) {
  const home = toCode(eg.season, eg.home), away = toCode(eg.season, eg.away)
  if (statsKey.has(`${eg.date}|${home}|${away}`)) continue
  // the logs have a game that day for the same home team: a code the map got wrong, not a missing game
  if (statsHomeDay.has(`${eg.date}|${home}`)) { suspect++; continue }
  const gameId = `espn:${id}`
  games.set(gameId, { season: eg.season, post: eg.post, date: eg.date, home, away })
  filled[eg.season] = (filled[eg.season] ?? 0) + 1
  for (const r of eg.rows) {
    const byName = pidByName.get(nameKey(r.athlete_display_name))
    const pid = wnbaOf.get(r.athlete_id) ?? (byName && byName !== -1 ? byName : `espn:${r.athlete_id}`)
    if (!espnOf.has(pid)) espnOf.set(pid, r.athlete_id)
    const team = toCode(eg.season, r.team_abbreviation), opp = toCode(eg.season, r.opponent_team_abbreviation)
    const own = Number(r.team_score), theirs = Number(r.opponent_team_score)
    apps.push({
      pid, name: r.athlete_display_name, gameId, team, opp, home: r.home_away === 'home', result: own > theirs ? 2 : own < theirs ? 0 : 1,
      line: [num(r.minutes), num(r.points), num(r.field_goals_made), num(r.field_goals_attempted), num(r.three_point_field_goals_made), num(r.three_point_field_goals_attempted),
        num(r.free_throws_made), num(r.free_throws_attempted), num(r.offensive_rebounds), num(r.defensive_rebounds), num(r.rebounds), num(r.assists), num(r.steals), num(r.blocks), num(r.turnovers), num(r.fouls)],
    })
  }
}

// 6. the team's game number that season, and the season's length
const teamSeason = new Map() // `${team}|${season}` -> [{ id, post, date }]
for (const [id, g] of games) {
  for (const team of [g.home, g.away]) {
    const key = `${team}|${g.season}`
    if (!teamSeason.has(key)) teamSeason.set(key, [])
    teamSeason.get(key).push({ id, post: g.post, date: g.date })
  }
}
const tgnOf = new Map() // `${game_id}|${team}` -> n
const teamGames = {} // team -> season -> [reg, all]
for (const [key, list] of teamSeason) {
  const [team, season] = key.split('|')
  list.sort((a, b) => a.post - b.post || a.date - b.date)
  list.forEach((x, i) => tgnOf.set(`${x.id}|${team}`, i + 1))
  ;(teamGames[team] ??= {})[season] = [list.filter((x) => !x.post).length, list.length]
}

// 7. bios: birth date and position; then the WNBA Stats rosters (a position for every player, 1997 on),
// then the researched layer (data/ref/positions.json, each row with its receipts)
const bio = new Map() // espnId -> { born, pos }
for (let s = ESPN_FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `player_core_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) {
    const b = bio.get(r.athlete_id) ?? bio.set(r.athlete_id, { born: null, pos: null }).get(r.athlete_id)
    if (!b.born && r.date_of_birth) b.born = r.date_of_birth.slice(0, 10)
    if (!b.pos && r.position_abbreviation && r.position_abbreviation !== 'NA') b.pos = r.position_abbreviation
  }
}

const rosterPos = new Map() // pid -> Map<position, seasons>
for (let s = FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  const file = path.join(RAW, `rosters_${s}.csv`)
  if (!fs.existsSync(file)) continue
  for (const r of readCsv(file)) if (r.player_id && r.position) vote(rosterPos, r.player_id, r.position)
}
const researched = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ref/positions.json'), 'utf8'))
const researchPos = new Map(researched.rows.map((r) => [r.id, r.pos]))

// 8. the players
const teams = [...new Set([...games.values()].flatMap((g) => [g.home, g.away]))].sort()
const ti = new Map(teams.map((t, i) => [t, i]))
const GROUP = { G: 'G', F: 'F', C: 'C', 'G-F': 'G', 'F-G': 'G', 'F-C': 'F', 'C-F': 'C', PG: 'G', SG: 'G', SF: 'F', PF: 'F' }
const players = new Map() // pid -> { id, name, rows }
const flagged = {} // season -> [with a flag, appearances]
apps.sort((a, b) => games.get(a.gameId).date - games.get(b.gameId).date)
for (const a of apps) {
  const g = games.get(a.gameId)
  const p = players.get(a.pid) ?? players.set(a.pid, { id: a.pid, name: a.name, rows: [] }).get(a.pid)
  p.name = a.name // the latest spelling
  const espn = espnOf.get(a.pid)
  const byName = (k) => { const v = startByName.get(`${k}|${g.date}`); return v == null || v < 0 ? undefined : v }
  const started = (espn != null ? startOf.get(`${espn}|${g.date}`) : undefined) ?? byName(nameKey(a.name)) ?? byName(shortKey(a.name)) ?? -1
  const f = (flagged[g.season] ??= [0, 0])
  f[1]++
  if (started >= 0) f[0]++
  p.rows.push([g.season, g.post, g.date, a.home ? 1 : 0, ti.get(a.team), ti.get(a.opp), started, a.result, tgnOf.get(`${a.gameId}|${a.team}`) ?? 0, ...a.line])
}
// the starts sequence begins with the ESPN box scores; the engine sits a career out of a starts field
// when a game with no flag falls inside its window
const startsSince = ESPN_FIRST_SEASON

const out = []
const posTally = {}
let noBorn = 0, noEspn = 0
for (const p of players.values()) {
  const espn = espnOf.get(p.id)
  if (!espn) noEspn++
  // the position: ESPN's (the box rows' modal one, then the bio's, then the crosswalk's), else the
  // roster's (the label most seasons gave her), else researched; combos fold to the first letter
  const espnPos = Object.entries(boxPos.get(espn) ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? bio.get(espn)?.pos ?? xwPos.get(p.id)
  const label = espnPos ?? (rosterPos.has(p.id) ? majority(rosterPos.get(p.id)) : null) ?? researchPos.get(p.id) ?? null
  const pos = GROUP[label] ?? GROUP[String(label).replace(/[^A-Z]/g, '').slice(0, 1)] ?? null
  const posSrc = pos == null ? null : espnPos ? 'espn' : rosterPos.has(p.id) ? 'roster' : 'research'
  posTally[posSrc ?? 'none'] = (posTally[posSrc ?? 'none'] ?? 0) + 1
  const born = bio.get(espn)?.born ?? null
  if (!born) noBorn++
  out.push({ id: p.id, name: p.name, born, debut: p.rows[0][0], pos, posSrc, rows: p.rows })
}
out.sort((a, b) => b.rows.length - a.rows.length)

const builtAt = new Date().toISOString()
const file = { v: 2, builtAt, firstSeason: FIRST_SEASON, currentSeason: CURRENT_SEASON, startsSince, cols: COLS, teams, teamGames, players: out }
const text = JSON.stringify(file)
fs.writeFileSync(path.join(OUT, 'players.json'), text)
console.log(`${out.length} players, ${out.reduce((n, p) => n + p.rows.length, 0)} appearances, ${games.size} games, ${(text.length / 1024 / 1024).toFixed(1)}MB`)
const perSeason = {}
for (const g of games.values()) perSeason[g.season] = (perSeason[g.season] ?? 0) + 1
console.log(`games by season ${JSON.stringify(perSeason)}`)
console.log(`filled from ESPN ${JSON.stringify(filled)} (the logs' last date: ${JSON.stringify(Object.fromEntries(Object.entries(logLast).filter(([s]) => filled[s])))}); ${suspect} ESPN games skipped as a same-day duplicate`)
console.log(`team codes ${JSON.stringify(Object.fromEntries([...teamMap].filter(([k]) => k.startsWith(String(CURRENT_SEASON)))))}`)
console.log(`starter flag coverage by season ${JSON.stringify(Object.fromEntries(Object.entries(flagged).map(([s, [a, b]]) => [s, `${a}/${b}`])))}; starts since ${startsSince}`)
console.log(`positions by source ${JSON.stringify(posTally)}, no birth date ${noBorn}, no ESPN id ${noEspn} (of ${out.length}; ${out.filter((p) => p.rows[p.rows.length - 1][0] < ESPN_FIRST_SEASON).length} done before ${ESPN_FIRST_SEASON}), ids from ESPN only ${out.filter((p) => p.id.startsWith('espn:')).length}`)
console.log(`built ${builtAt}`)
