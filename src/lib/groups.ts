// The team pages: the best players of one position in one franchise's
// history ("the Las Vegas Aces' best guards"), from the ledger. A franchise
// is keyed by its current team id and carries the cities it played in
// before (the Aces were the Utah Starzz and the San Antonio Stars); a
// folded team keeps its own id. A page is a position's metrics, every
// qualifying player's regular-season totals over her games for the
// franchise, ranked by the first metric, and the cumulative curve of the
// first three metrics for the top few, one line per player. Pure: the
// prerender computes it once and embeds the result in the page, so the
// client needs no ledger. CFB Comparator's group pages, by franchise.
import type { Game, Ledger, Pos } from './ledger.ts'
import { statByKey, type StatKey } from './stats.ts'
import { POS_WORDS } from './words.ts'

export type GroupPos = Exclude<Pos, 'ALL'>

export interface Franchise {
  /** the current team id (a folded team's own), the address's id lower-cased */
  id: string
  name: string
  /** every team id the ledger has for it, the oldest first */
  ids: string[]
  /** the earlier teams, oldest first, for the page's line ("the Utah Starzz and the San Antonio Silver Stars before") */
  was: { id: string; name: string }[]
  active: boolean
}

/** the franchises: the current teams with their earlier ids, then the folded ones. The ledger's PHO (the Stats logs) and PHX (ESPN's, 2025 on) are one team. */
export const FRANCHISES: Franchise[] = [
  { id: 'ATL', name: 'Atlanta Dream', ids: ['ATL'], was: [], active: true },
  { id: 'CHI', name: 'Chicago Sky', ids: ['CHI'], was: [], active: true },
  { id: 'CON', name: 'Connecticut Sun', ids: ['ORL', 'CON'], was: [{ id: 'ORL', name: 'Orlando Miracle' }], active: true },
  { id: 'DAL', name: 'Dallas Wings', ids: ['DET', 'TUL', 'DAL'], was: [{ id: 'DET', name: 'Detroit Shock' }, { id: 'TUL', name: 'Tulsa Shock' }], active: true },
  { id: 'GSV', name: 'Golden State Valkyries', ids: ['GSV'], was: [], active: true },
  { id: 'IND', name: 'Indiana Fever', ids: ['IND'], was: [], active: true },
  { id: 'LVA', name: 'Las Vegas Aces', ids: ['UTA', 'SAN', 'LVA'], was: [{ id: 'UTA', name: 'Utah Starzz' }, { id: 'SAN', name: 'San Antonio Silver Stars (later the Stars)' }], active: true },
  { id: 'LAS', name: 'Los Angeles Sparks', ids: ['LAS'], was: [], active: true },
  { id: 'MIN', name: 'Minnesota Lynx', ids: ['MIN'], was: [], active: true },
  { id: 'NYL', name: 'New York Liberty', ids: ['NYL'], was: [], active: true },
  { id: 'PHX', name: 'Phoenix Mercury', ids: ['PHO', 'PHX'], was: [], active: true },
  { id: 'PDX', name: 'Portland Fire', ids: ['PDX'], was: [], active: true },
  { id: 'SEA', name: 'Seattle Storm', ids: ['SEA'], was: [], active: true },
  { id: 'TOR', name: 'Toronto Tempo', ids: ['TOR'], was: [], active: true },
  { id: 'WAS', name: 'Washington Mystics', ids: ['WAS'], was: [], active: true },
  { id: 'CHA', name: 'Charlotte Sting', ids: ['CHA'], was: [], active: false },
  { id: 'CLE', name: 'Cleveland Rockers', ids: ['CLE'], was: [], active: false },
  { id: 'HOU', name: 'Houston Comets', ids: ['HOU'], was: [], active: false },
  { id: 'MIA', name: 'Miami Sol', ids: ['MIA'], was: [], active: false },
  { id: 'POR', name: 'Portland Fire (2000–2002)', ids: ['POR'], was: [], active: false },
  { id: 'SAC', name: 'Sacramento Monarchs', ids: ['SAC'], was: [], active: false },
]
export const franchiseBySlug = (slug: string): Franchise | null => FRANCHISES.find((f) => f.id.toLowerCase() === slug.toLowerCase()) ?? null

/** the position's metrics, the first the one the page ranks by, the first three drawn */
export const GROUP_METRICS: Record<GroupPos, StatKey[]> = {
  G: ['pts', 'ast', 'tpm', 'stl'],
  F: ['pts', 'reb', 'ast', 'stl'],
  C: ['pts', 'reb', 'blk', 'ast'],
}
export const GROUP_POS: GroupPos[] = ['G', 'F', 'C']

/** the position's slug in a page's address */
export const POS_SLUG: Record<GroupPos, string> = { G: 'guards', F: 'forwards', C: 'centers' }
export const posFromSlug = (slug: string): GroupPos | null => (Object.entries(POS_SLUG).find(([, s]) => s === slug)?.[0] as GroupPos | undefined) ?? null

/** how many curves a chart draws */
export const CURVES = 8
/** regular-season games a player needs with the franchise to be listed */
export const MIN_GAMES = 10

export interface GroupRow {
  id: string
  name: string
  from: number
  to: number
  games: number
  /** per metric, the total over her regular-season games for the franchise */
  totals: number[]
  /** per metric drawn, the cumulative value after each game, for the top rows only */
  curves?: number[][]
}

export interface GroupData {
  id: string
  name: string
  was: Franchise['was']
  active: boolean
  pos: GroupPos
  metrics: StatKey[]
  from: number
  to: number
  /** every qualifying player, ranked by the first metric */
  rows: GroupRow[]
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** the page's data for one franchise and position */
export function groupData(L: Ledger, f: Franchise, pos: GroupPos, { top = CURVES, minGames = MIN_GAMES } = {}): GroupData {
  const metrics = GROUP_METRICS[pos]
  const reads = metrics.map((k) => statByKey(k).read)
  const rows: (GroupRow & { gs: Game[] })[] = []
  let from = Infinity, to = -Infinity
  for (const p of L.players) {
    const own = p.games.filter((g) => f.ids.includes(g.team))
    for (const g of own) { if (g.season < from) from = g.season; if (g.season > to) to = g.season }
    if (p.pos !== pos) continue
    const gs = own.filter((g) => !g.post)
    if (gs.length < minGames) continue
    const totals = reads.map((read) => gs.reduce((s, g) => s + read(g), 0))
    rows.push({ id: p.id, name: p.name, from: gs[0].season, to: gs[gs.length - 1].season, games: gs.length, totals, gs })
  }
  rows.sort((a, b) => b.totals[0] - a.totals[0] || b.games - a.games || a.name.localeCompare(b.name))
  for (const r of rows.slice(0, top)) r.curves = reads.slice(0, 3).map((read) => { let cum = 0; return r.gs.map((g) => (cum += read(g))) })
  return { id: f.id, name: f.name, was: f.was, active: f.active, pos, metrics, from, to, rows: rows.map(({ gs, ...r }) => r) }
}

export const groupPath = (id: string, pos: GroupPos): string => `/team/${id.toLowerCase()}/${POS_SLUG[pos]}/`

const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`)
/** "The Las Vegas Aces' best guards", "The Houston Comets' best forwards" */
export const groupH1 = (d: Pick<GroupData, 'name' | 'pos'>): string => `The ${possessive(d.name.replace(/ \(.*\)$/, ''))} best ${POS_WORDS[d.pos]}`
/** "Best Las Vegas Aces guards of all time · WNBA Comparator" */
export const groupTitle = (d: Pick<GroupData, 'name' | 'pos'>, site: string): string => `Best ${d.name.replace(/ \(.*\)$/, '')} ${POS_WORDS[d.pos]} of all time · ${site}`
/** "the Utah Starzz and the San Antonio Stars before" */
export const wasWords = (d: Pick<GroupData, 'was'>): string => (d.was.length ? `${d.was.map((w) => `the ${w.name}`).join(' and ')} before` : '')

/** "A'ja Wilson leads with 6,710 points in 305 games for the Las Vegas Aces; Kelsey Plum had 4,155." */
export function groupLead(d: GroupData): string {
  const stat = statByKey(d.metrics[0])
  const [a, b] = d.rows
  if (!a) return ''
  return `${a.name} leads with ${fmt(a.totals[0])} ${stat.noun} in ${a.games} games for the ${d.name.replace(/ \(.*\)$/, '')}${b ? `; ${b.name} had ${fmt(b.totals[0])}` : ''}.`
}

export function groupDescription(d: GroupData): string {
  const stat = statByKey(d.metrics[0])
  const was = wasWords(d)
  return `${groupLead(d)} Every ${POS_WORDS[d.pos].replace(/s$/, '')} with ${MIN_GAMES} or more regular-season games for the franchise${was ? ` (${was})` : ''}, ${d.from} to ${d.to}, ranked by ${stat.noun}, with each player's ${stat.noun} drawn game by game.`
}
