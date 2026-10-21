// The query engine. A query is the five slots of the sentence (who · did
// what · how much · over which games · against whom), and evaluating it over
// the ledger gives every entity a value at the window, ranked. Entities are
// careers (one row per player) unless the sequence is the team's games of a
// season, where they are player-seasons.
//
// The readings a factoid makes (rank, one of K, tied or passed a peer at the
// same ordinal, fastest to M, on track to match) are all functions of the
// rows this returns; `crossings` and `toMatch` below are the peer ones.

import type { Game, Ledger, Player, Pos } from './ledger.ts'
import { ageAt } from './ledger.ts'
import { statByKey, type Stat, type StatKey } from './stats.ts'

/** which games are counted, in order: a career's games, its starts, its seasons, or a season's games counted by the team's schedule */
export type Seq = 'games' | 'starts' | 'seasons' | 'teamGames'
/** how the per-game numbers add up over the window */
export type How = 'sum' | 'count' | 'every' | 'streak' | 'reach'
export type Scope = 'reg' | 'all'
export type Dir = 'most' | 'fewest'

/** a per-game test: the stat is at least `min` (and at most `max` when set; `min: 0, max: 0` reads "no turnovers") */
export interface Test { stat: StatKey; min: number; max?: number }

export interface Query {
  /** the field: every player or one position group */
  pos: Pos
  /** the stat a sum or a reach counts */
  stat: StatKey
  /** the per-game test a count, every or streak reads (a conjunction) */
  tests: Test[]
  how: How
  /** the window: the first n of the sequence; for `reach`, the target the stat has to reach */
  n: number
  seq: Seq
  scope: Scope
  /** the era: careers that began, or seasons played, in this season or later; null for the whole ledger */
  since: number | null
  dir: Dir
}

export const DEFAULT_QUERY: Query = { pos: 'ALL', stat: 'pts', tests: [], how: 'sum', n: 100, seq: 'games', scope: 'reg', since: null, dir: 'most' }

export interface Row {
  key: string
  player: Player
  /** the season, for a player-season entity */
  season: number | null
  value: number | null
  /** how far along the sequence the entity is (its games or starts so far, up to the window) */
  reached: number
  /** the entity has the whole window (or, for reach, got there) */
  complete: boolean
  /** every: the test held in every game of the window */
  all: boolean
  /** the window's games, for the panel */
  games: Game[]
  /** the first and last season of the window */
  from: number
  to: number
  /** the team of a player-season */
  team: string | null
  rank: number
  /** competition rank with ties: "T-3rd" */
  tied: boolean
}

export interface Board {
  /** entities with the whole window, ranked */
  ranked: Row[]
  /** entities still inside the window, by value */
  onTheWay: Row[]
  /** careers that sit out a starts field: they began before the starter flag, or a game without one falls inside their window */
  gapped: number
  /** the first season of the ledger */
  since: number
  /** the first season with the starter flag */
  startsSince: number
}

/** fixes a query the pickers can't make */
export function normalize(q: Query): Query {
  const out = { ...q }
  if (out.how === 'reach') out.seq = out.seq === 'seasons' || out.seq === 'teamGames' ? 'games' : out.seq
  if ((out.how === 'count' || out.how === 'every' || out.how === 'streak') && out.tests.length === 0) {
    const s = statByKey(out.stat)
    out.tests = [{ stat: s.key, min: s.thresholds[Math.min(1, s.thresholds.length - 1)] }]
  }
  if (out.n < 1) out.n = 1
  return out
}

/** the minutes a game needs for a clean line (no turnovers, no fouls) to mean something */
export const PLAYED_MIN = 10

/** the player was on the floor long enough for a clean line to mean something: a two-minute cameo passes no clean test */
export const played = (g: Game): boolean => g.min >= PLAYED_MIN

/** the per-game tests all hold; a test with max 0 ("no turnovers") also needs the game played */
export const holds = (g: Game, tests: Test[]): boolean =>
  tests.every((t) => { const v = statByKey(t.stat).read(g); return v >= t.min && (t.max == null || (v <= t.max && (t.max > 0 || played(g)))) })

const inScope = (g: Game, scope: Scope) => scope === 'all' || !g.post

const inField = (p: Player, pos: Pos) => pos === 'ALL' || p.pos === pos

/** the sequence items of a career: games, starts, or seasons (each a list of games) */
export function items(p: Player, q: Pick<Query, 'seq' | 'scope'>): Game[][] {
  const gs = p.games.filter((g) => inScope(g, q.scope))
  if (q.seq === 'starts') return gs.filter((g) => g.started).map((g) => [g])
  if (q.seq === 'seasons') {
    const by = new Map<number, Game[]>()
    for (const g of gs) (by.get(g.season) ?? by.set(g.season, []).get(g.season)!).push(g)
    return [...by.values()]
  }
  return gs.map((g) => [g])
}

function longestRun(flags: boolean[]): number {
  let best = 0, run = 0
  for (const f of flags) { run = f ? run + 1 : 0; if (run > best) best = run }
  return best
}

/** value, reached and completeness of one entity over its window */
function measure(seqItems: Game[][], q: Query, stat: Stat, complete: boolean, ledger: Ledger): Pick<Row, 'value' | 'reached' | 'complete' | 'all' | 'games'> {
  if (q.how === 'reach') {
    let cum = 0
    for (let i = 0; i < seqItems.length; i++) {
      for (const g of seqItems[i]) cum += stat.read(g)
      if (cum >= q.n) return { value: i + 1, reached: i + 1, complete: true, all: false, games: seqItems.slice(0, i + 1).flat() }
    }
    return { value: null, reached: seqItems.length, complete: false, all: false, games: seqItems.flat() }
  }
  const win = seqItems.slice(0, q.n)
  const games = win.flat()
  const reached = win.length
  // a season window is complete once the season is over
  const done = complete && (q.seq !== 'seasons' || reached < q.n || (win[q.n - 1]?.[0]?.season ?? 0) < ledger.currentSeason)
  if (q.how === 'sum') return { value: games.reduce((s, g) => s + stat.read(g), 0), reached, complete: done, all: false, games }
  const flags = win.map((it) => it.some((g) => holds(g, q.tests)))
  const count = flags.filter(Boolean).length
  if (q.how === 'count') return { value: count, reached, complete: done, all: count === q.n, games }
  if (q.how === 'every') return { value: count, reached, complete: done, all: done && count === q.n, games }
  return { value: longestRun(flags), reached, complete: done, all: false, games }
}

/** the starts sequence can't be read: the career began before the starter flag, or a game with no flag comes before the window's last start (or anywhere, when the window isn't filled) */
function startsUnknown(p: Player, q: Query, m: Pick<Row, 'complete' | 'games'>, ledger: Ledger): boolean {
  if (q.seq !== 'starts') return false
  if (p.games[0].season < ledger.startsSince) return true
  const end = m.complete ? m.games[m.games.length - 1].date : Infinity
  return p.games.some((g) => g.started == null && g.date <= end && (q.scope === 'all' || !g.post))
}

function rankRows(rows: Row[], dir: Dir): Row[] {
  const sign = dir === 'most' ? -1 : 1
  rows.sort((a, b) => sign * ((a.value ?? 0) - (b.value ?? 0)) || a.player.name.localeCompare(b.player.name))
  let rank = 0
  for (let i = 0; i < rows.length; i++) {
    if (i === 0 || rows[i].value !== rows[i - 1].value) rank = i + 1
    rows[i].rank = rank
  }
  for (let i = 0; i < rows.length; i++) rows[i].tied = (i > 0 && rows[i - 1].value === rows[i].value) || (i + 1 < rows.length && rows[i + 1].value === rows[i].value)
  return rows
}

/** every entity's row at the window, ranked */
export function evaluate(ledger: Ledger, raw: Query): Board {
  const q = normalize(raw)
  const stat = statByKey(q.stat)
  const ranked: Row[] = []
  const onTheWay: Row[] = []
  let gapped = 0
  const push = (r: Row) => (r.complete && r.value != null ? ranked : onTheWay).push(r)
  const blank = { rank: 0, tied: false }

  for (const p of ledger.players) {
    if (!inField(p, q.pos)) continue
    if (q.seq === 'teamGames') {
      // player-seasons: the window is the team's first n games of the season
      const by = new Map<number, Game[]>()
      for (const g of p.games) if (inScope(g, q.scope)) (by.get(g.season) ?? by.set(g.season, []).get(g.season)!).push(g)
      for (const [season, gs] of by) {
        if (q.since != null && season < q.since) continue
        const team = gs[0].team
        const own = gs.filter((g) => g.team === team && g.tgn <= q.n)
        const played = ledger.teamGames[team]?.[season]?.[q.scope === 'reg' ? 0 : 1] ?? 0
        const complete = played >= q.n
        const reachedN = Math.min(played, q.n)
        if (q.how === 'reach') {
          let cum = 0, at: number | null = null
          for (const g of own) { cum += stat.read(g); if (cum >= q.n) { at = g.tgn; break } }
          push({ key: `${p.id}:${season}`, player: p, season, value: at, reached: reachedN, complete: at != null, all: false, games: own, from: season, to: season, team, ...blank })
          continue
        }
        const flagsByTgn = new Array<boolean>(reachedN).fill(false)
        for (const g of own) if (g.tgn >= 1 && g.tgn <= reachedN) flagsByTgn[g.tgn - 1] = holds(g, q.tests)
        const count = flagsByTgn.filter(Boolean).length
        const value = q.how === 'sum' ? own.reduce((s, g) => s + stat.read(g), 0) : q.how === 'streak' ? longestRun(flagsByTgn) : count
        push({ key: `${p.id}:${season}`, player: p, season, value, reached: reachedN, complete, all: (q.how === 'every' || q.how === 'count') && complete && count === q.n, games: own, from: season, to: season, team, ...blank })
      }
      continue
    }
    const seqItems = items(p, q)
    if (seqItems.length === 0) { if (q.seq === 'starts' && p.games[0].season < ledger.startsSince) gapped++; continue }
    const first = seqItems[0][0].season
    if (q.since != null && first < q.since) continue
    const m = measure(seqItems, q, stat, seqItems.length >= q.n, ledger)
    if (startsUnknown(p, q, m, ledger)) { gapped++; continue }
    const gs = m.games
    push({ key: p.id, player: p, season: null, ...m, from: gs[0]?.season ?? first, to: gs[gs.length - 1]?.season ?? first, team: null, ...blank })
  }
  // every: the count is the value, so the entities that held in every game lead the ranking
  return { ranked: rankRows(ranked, q.dir), onTheWay: rankRows(onTheWay, q.dir), gapped, since: ledger.firstSeason, startsSince: ledger.startsSince }
}

/** a career's cumulative curve of a stat over the sequence: cum[i] is the total through item i+1 */
export function curve(p: Player, q: Query): number[] {
  const stat = statByKey(q.stat)
  const out: number[] = []
  let cum = 0
  for (const it of items(p, q)) { for (const g of it) cum += stat.read(g); out.push(cum) }
  return out
}

export interface Crossing { n: number; kind: 'tied' | 'passed' | 'fell behind'; value: number }

/** where a's curve meets b's: the ordinals where a ties b (entering a tie) or passes b (ahead after being level or behind) */
export function crossings(a: number[], b: number[]): Crossing[] {
  const out: Crossing[] = []
  const len = Math.min(a.length, b.length)
  let prev = 0
  for (let i = 0; i < len; i++) {
    const d = Math.sign(a[i] - b[i])
    if (d === 0 && prev !== 0) out.push({ n: i + 1, kind: 'tied', value: a[i] })
    else if (d > 0 && prev <= 0 && i > 0) out.push({ n: i + 1, kind: 'passed', value: a[i] })
    else if (d < 0 && prev >= 0 && i > 0) out.push({ n: i + 1, kind: 'fell behind', value: a[i] })
    prev = d
  }
  return out
}

/** what `a` needs over its next k items to match b's total at that ordinal; null when b's curve doesn't reach it */
export function toMatch(a: number[], b: number[], k: number): { need: number; at: number } | null {
  const at = a.length + k
  if (at > b.length) return null
  return { need: b[at - 1] - (a[a.length - 1] ?? 0), at }
}

/** the player's age at the last game of a window */
export function ageAtWindow(r: Row): number | null {
  const g = r.games[r.games.length - 1]
  return g ? ageAt(r.player.born, g.date) : null
}
