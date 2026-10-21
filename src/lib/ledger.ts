// The ledger: per player, every game she appeared in, in order, from the
// WNBA Stats game logs (1997 on) with the ESPN starter flag where there is a
// box score (2003 on). One file, written by scripts/build-ledger.mjs in a
// compact array form; this decodes it into rows the engine reads.

/** the field: every player, or one position group */
export type Pos = 'ALL' | 'G' | 'F' | 'C'
export const POSITIONS: Pos[] = ['ALL', 'G', 'F', 'C']

export interface Game {
  season: number
  post: boolean
  /** YYYYMMDD */
  date: number
  home: boolean
  team: string
  opp: string
  /** the ESPN box score's starter flag; null for a game with no box score (every game before `startsSince`, a few after) */
  started: boolean | null
  /** 2 won, 1 tied, 0 lost */
  result: number
  /** the team's game number that season, regular season then postseason */
  tgn: number
  min: number
  pts: number
  fgm: number
  fga: number
  tpm: number
  tpa: number
  ftm: number
  fta: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
}

export interface Player {
  id: string
  name: string
  /** YYYY-MM-DD or null */
  born: string | null
  /** the season of her first game */
  debut: number
  /** the position group; null when no source has one */
  pos: Exclude<Pos, 'ALL'> | null
  /** where the position came from: ESPN, the WNBA Stats roster, or research (data/ref/positions.json) */
  posSrc: 'espn' | 'roster' | 'research' | null
  games: Game[]
}

export interface Ledger {
  builtAt: string
  firstSeason: number
  currentSeason: number
  /** the first season with a starter flag on nearly every game; the starts sequence begins here */
  startsSince: number
  players: Player[]
  /** team -> season -> [regular-season games played, all games played] */
  teamGames: Record<string, Record<string, [number, number]>>
}

export interface LedgerFile {
  v: number
  builtAt: string
  firstSeason: number
  currentSeason: number
  startsSince: number
  cols: string[]
  teams: string[]
  teamGames: Record<string, Record<string, [number, number]>>
  players: { id: string; name: string; born: string | null; debut: number; pos: Exclude<Pos, 'ALL'> | null; posSrc: 'espn' | 'roster' | 'research' | null; rows: number[][] }[]
}

const NEED = ['season', 'post', 'date', 'home', 'team', 'opp', 'started', 'result', 'tgn', 'min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf'] as const

export function decodeLedger(file: LedgerFile): Ledger {
  const c = Object.fromEntries(file.cols.map((k, i) => [k, i])) as Record<string, number>
  for (const k of NEED) if (!(k in c)) throw new Error(`ledger: column ${k} missing`)
  const players = file.players.map((p) => ({
    id: p.id,
    name: p.name,
    born: p.born,
    debut: p.debut,
    pos: p.pos,
    posSrc: p.posSrc,
    games: p.rows.map((r) => ({
      season: r[c.season], post: r[c.post] === 1, date: r[c.date], home: r[c.home] === 1,
      team: file.teams[r[c.team]] ?? '?', opp: file.teams[r[c.opp]] ?? '?',
      started: r[c.started] < 0 ? null : r[c.started] === 1, result: r[c.result], tgn: r[c.tgn],
      min: r[c.min], pts: r[c.pts], fgm: r[c.fgm], fga: r[c.fga], tpm: r[c.tpm], tpa: r[c.tpa], ftm: r[c.ftm], fta: r[c.fta],
      oreb: r[c.oreb], dreb: r[c.dreb], reb: r[c.reb], ast: r[c.ast], stl: r[c.stl], blk: r[c.blk], tov: r[c.tov], pf: r[c.pf],
    })),
  }))
  return { builtAt: file.builtAt, firstSeason: file.firstSeason, currentSeason: file.currentSeason, startsSince: file.startsSince, players, teamGames: file.teamGames }
}

/** whole years between a birth date and a YYYYMMDD game date; null without a birth date */
export function ageAt(born: string | null, date: number): number | null {
  if (!born) return null
  const by = Number(born.slice(0, 4)), bm = Number(born.slice(5, 7)), bd = Number(born.slice(8, 10))
  const y = Math.floor(date / 10000), m = Math.floor(date / 100) % 100, d = date % 100
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age--
  return age
}

/** "Sep 7, 2017" from a YYYYMMDD */
export function fmtDate(date: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Math.floor(date / 100) % 100 - 1]} ${date % 100}, ${Math.floor(date / 10000)}`
}
