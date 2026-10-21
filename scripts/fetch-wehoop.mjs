// Downloads the wehoop (sportsdataverse) WNBA release files the ledger is
// built from into data/raw/ (gitignored). Skips a file that is already there;
// delete it to refetch. Releases: https://github.com/sportsdataverse/sportsdataverse-data/releases
//   wnba_stats_player_game_logs/player_game_logs_<season>.csv  one row per player per game from stats.wnba.com, 1997 on: the spine
//   wnba_stats_rosters/rosters_<season>.csv                    team rosters from stats.wnba.com, 1997 on: a position for every player
//   wnba_crosswalk/wnba_player_crosswalk_<season>.csv          WNBA Stats player id <-> ESPN athlete id, 2002 on
//   espn_wnba_player_boxscores/player_box_<season>.csv         ESPN box scores, 2003 on: the starter flag, positions, and the games the logs lack
//   espn_wnba_player_core/player_core_<season>.csv             ESPN bios: birth date, position, draft year
//   espn_wnba_schedules/wnba_schedule_<season>.csv             ESPN schedule: the game type, to name the All-Star game and the Cup final
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIRST_SEASON, ESPN_FIRST_SEASON, CURRENT_SEASON } from './lib/window.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data/raw')
const BASE = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download'
fs.mkdirSync(RAW, { recursive: true })

const wants = []
for (let s = FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  wants.push([`wnba_stats_player_game_logs/player_game_logs_${s}.csv`, `player_game_logs_${s}.csv`])
  wants.push([`wnba_stats_rosters/rosters_${s}.csv`, `rosters_${s}.csv`])
}
for (let s = ESPN_FIRST_SEASON; s <= CURRENT_SEASON; s++) {
  wants.push([`wnba_crosswalk/wnba_player_crosswalk_${s}.csv`, `wnba_player_crosswalk_${s}.csv`])
  wants.push([`espn_wnba_player_boxscores/player_box_${s}.csv`, `player_box_${s}.csv`])
  wants.push([`espn_wnba_player_core/player_core_${s}.csv`, `player_core_${s}.csv`])
  wants.push([`espn_wnba_schedules/wnba_schedule_${s}.csv`, `wnba_schedule_${s}.csv`])
}

// the running season's files change nightly; refetch those when older than a day
const fresh = (file) => {
  if (!fs.existsSync(file)) return false
  const running = file.includes(`_${CURRENT_SEASON}.`)
  return !running || Date.now() - fs.statSync(file).mtimeMs < 86_400_000
}

let n = 0
for (const [asset, name] of wants) {
  const file = path.join(RAW, name)
  if (fresh(file)) continue
  const res = await fetch(`${BASE}/${asset}`)
  if (!res.ok) { console.error(`fetch ${asset}: HTTP ${res.status}`); process.exitCode = 1; continue }
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  n++
  console.log(`${name} ${(fs.statSync(file).size / 1024).toFixed(0)}KB`)
}
console.log(`fetched ${n} file(s) into data/raw`)
