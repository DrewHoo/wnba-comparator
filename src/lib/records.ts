// Records: what a player leads. A shape is a query without its window; at
// every N on a grid the field is ranked and two things are read: who holds
// the record now (rank 1, ties included) and who set it as the field filled
// in (the running best, in the order the entities reached N). A player's
// leads are intervals of N, one row each, so "most points through her first
// 150 games" and "...155 games" are the same row. The score is in bits,
// shaped like Streak King's crown score, and its weights are the knobs in
// RECORDS. A row carries the score's inputs, not the score, so a page (and
// the tuner) scores it with whatever knobs it has. The method is NFL
// Comparator's specs/player-pages.spec.md; the code is NBA Comparator's
// miner (the newest), over this ledger's games through a flat view of it;
// the build (scripts/build-records.mjs) writes one file per player.
//
// N walks a grid: every N to 100, every 5 to 500, every 10 past it (games
// and starts), every team game of a season, and every season. Intervals,
// holes and the gap tolerance are counted in grid steps; `lo`, `hi` and `at`
// are real Ns. Each shape's per-item values are one cumulative array over
// every career (`V`), read at the grid points; the field at each N and its
// order by date depend only on the sequence, so they are built once per
// sequence (`Ctx`) and shared by every stat and test. The fields are the
// board's: a career is in at N once it has N items, a starts sequence stops
// at the first game with no box score (and a career from before the starter
// flag has none), a season is in at N once the team has played N games, and
// a season is in the seasons sequence once it is over.

import type { Game, Ledger, Player, Pos } from './ledger.ts'
import { PLAYED_MIN, type Dir, type How, type Query, type Scope, type Seq, type Test } from './query.ts'
import { STATS, statByKey, type StatKey } from './stats.ts'

/** a query without its window: the sentence with N left free */
export type Shape = Omit<Query, 'n'>

export type Kind = 'held' | 'set'

/** what a row needs to know about its player */
export type PlayerRef = Pick<Player, 'id' | 'name' | 'debut' | 'pos'>

export interface RecordRow {
  shape: Shape
  kind: Kind
  /** the entity: the player's id, or id:season for a player-season */
  key: string
  player: PlayerRef
  season: number | null
  team: string | null
  /** the interval of N the row covers (for reach, the low and high milestone; `from` is the low one too), and the N (or milestone) it is worded at */
  lo: number
  hi: number
  from?: number
  at: number
  /** the interval's length in grid Ns (milestones span the games between them), what the hold term reads */
  len: number
  /** grid steps inside the interval where the lead lapsed (merged over small gaps) */
  holes: number
  value: number
  second: number | null
  field: number
  ties: number
  /** the field's median and top-decile value at the worded N, the dominance unit */
  med: number
  q90: number
  /** the interval reaches the entity's current N and the player is active */
  live: boolean
  /** set: who broke it, at the worded N */
  breaker?: { name: string; season: number | null; value: number; date: number }
  score: number
  terms: Record<string, number>
  /** fancier or wordier rows folded under this one */
  folded: RecordRow[]
}

export type Tier = 'headline' | 'secondary' | 'trivia'

export interface Knobs {
  fieldFloor: number
  keepFloor: number
  admitTies: number
  minN: Record<Seq, number>
  gapTol: number
  depthW: number
  holdW: number
  domW: number
  leadW: number
  sizeW: number
  liveW: number
  setW: number
  seasonShare: number
  minutesAvg: number
  tiers: Record<Tier, number>
  words: { scopeAll: number; since: number; test: number; count: number; every: number; streak: number }
}

export const RECORDS: Knobs = {
  /** a field smaller than this ranks nothing: the field now, and for a set row the field when she got there */
  fieldFloor: 10,
  /** a row scoring under this at the shipped weights is never kept: the miner's own floor */
  keepFloor: 4,
  /** a tie group at rank 1 this large or smaller is a lead ("one of four") */
  admitTies: 4,
  /** an interval is trimmed to start at this N: what comes before is early-career noise */
  minN: { games: 8, starts: 8, seasons: 1, teamGames: 3 },
  /** grid steps inside an interval where the lead lapsed are bridged when this few in a row */
  gapTol: 2,
  /** bits per doubling of the window's depth in games (a season counts SEASON_GAMES) */
  depthW: 1,
  /** bits per doubling of the interval's length in games */
  holdW: 1.5,
  /** per doubling of the gap above the field's median, in top-decile units */
  domW: 2,
  /** per doubling of the gap over second place, in top-decile units */
  leadW: 2,
  /** bits per doubling of a count or streak's value in games */
  sizeW: 1,
  /** a lead still growing */
  liveW: 3,
  /** a record since broken */
  setW: -3,
  /** a player-season is in the field at team game N when she started this share of the team's first N games, or averaged `minutesAvg` minutes over them */
  seasonShare: 0.5,
  minutesAvg: 15,
  /** how a stat site ranks the stat: the leaders page, a secondary table, a split */
  tiers: { headline: 0, secondary: 2, trivia: 6 },
  /** what a claim costs to say */
  words: { scopeAll: 1, since: 3, test: 1, count: 1, every: 1, streak: 3 },
}

/** the knobs a tuner turns: the weights, flat, keyed by path */
export const KNOB_PATHS = ['depthW', 'holdW', 'domW', 'leadW', 'sizeW', 'liveW', 'setW', 'tiers.secondary', 'tiers.trivia', 'words.scopeAll', 'words.test', 'words.count', 'words.every', 'words.streak'] as const

export function withKnob(k: Knobs, path: string, value: number): Knobs {
  const out = { ...k, tiers: { ...k.tiers }, words: { ...k.words } } as Knobs & Record<string, unknown>
  const [a, b] = path.split('.')
  if (b) (out[a] as Record<string, number>)[b] = value
  else out[a] = value
  return out
}
export const knobAt = (k: Knobs, path: string): number => {
  const [a, b] = path.split('.')
  const v = (k as unknown as Record<string, unknown>)[a]
  return b ? (v as Record<string, number>)[b] : (v as number)
}

/** a season's depth for the depth term: the modern schedule */
export const SEASON_GAMES = 40

const HEADLINE: StatKey[] = ['pts', 'reb', 'ast', 'win']
const SECONDARY: StatKey[] = ['stl', 'blk', 'tpm', 'dd', 'td', 'fgm', 'ftm', 'min', 'stocks', 'pra']

/** how a stat site ranks the stat: the leaders page, a secondary table, a split */
export const tier = (stat: StatKey): Tier => (HEADLINE.includes(stat) ? 'headline' : SECONDARY.includes(stat) ? 'secondary' : 'trivia')

/** the direction a fan wants: fewest of a bad thing */
export const goodDir = (stat: StatKey): Dir => (['tov', 'pf', 'loss'].includes(stat) ? 'fewest' : 'most')

const TICK: Partial<Record<StatKey, number>> = { pts: 1000, reb: 500, ast: 500, stl: 100, blk: 100, tpm: 100, fgm: 500, ftm: 250, win: 50, dd: 50, min: 1000 }
export const hasMilestones = (stat: StatKey) => TICK[stat] != null

/** the milestone grid a reach counts to, up to `max`: 1, 2.5, 5, 7.5 × the tick, then every 5 ticks */
export function milestones(stat: StatKey, max: number): number[] {
  const t = TICK[stat]
  if (!t) return []
  const out = [1, 2.5, 5, 7.5].map((x) => x * t)
  for (let m = 10 * t; m <= max; m += 5 * t) out.push(m)
  return out.filter((m) => m <= max)
}

/** the lengths a WNBA regular season has had: a whole season is a free number to say */
const SEASON_LENGTHS = [22, 28, 30, 32, 34, 36, 40, 44]

/** how much a window's number costs to say: a round N is free */
export function roundCost(n: number, seq: Seq): number {
  if (seq === 'seasons') return [1, 2, 3, 5, 10, 15, 20].includes(n) ? 0 : 1
  if (seq === 'teamGames') return SEASON_LENGTHS.includes(n) || n % 10 === 0 ? 0 : n % 5 === 0 ? 0.5 : 1
  if (n % 100 === 0) return 0
  if (n % 50 === 0) return 0.5
  if (n % 25 === 0 || n % 10 === 0) return 1
  if (n % 5 === 0) return 2
  return 3
}

/** the N a sequence is ranked at: every N to 100, every 5 to 500, every 10 past it; every team game; every season */
export function gridFor(seq: Seq, maxN: number): number[] {
  const out: number[] = []
  if (seq === 'teamGames' || seq === 'seasons') { for (let n = 1; n <= maxN; n++) out.push(n); return out }
  for (let n = 1; n <= Math.min(100, maxN); n++) out.push(n)
  for (let n = 105; n <= Math.min(500, maxN); n += 5) out.push(n)
  for (let n = 510; n <= maxN; n += 10) out.push(n)
  return out
}

/** the shapes the mine walks: every stat over every sequence in its good direction, for the field `pos` (the build mines 'ALL') */
export function shapesFor(pos: Pos = 'ALL'): Shape[] {
  const out: Shape[] = []
  const seqs: Seq[] = ['games', 'starts', 'seasons']
  const scopes: Scope[] = ['reg', 'all']
  const base = { pos, since: null }
  for (const s of STATS) {
    if (s.key === 'loss') continue
    const dir = goodDir(s.key)
    for (const scope of scopes) {
      for (const seq of [...seqs, 'teamGames' as Seq]) {
        // "through the team's first 45 games, playoffs included" is a claim nobody makes
        if (seq === 'teamGames' && scope === 'all') continue
        // a fewest-of-a-bad-thing total needs the player to have played: starts only
        if (dir === 'most' || seq === 'starts') out.push({ ...base, stat: s.key, tests: [], how: 'sum', seq, scope, dir })
        // a season item passing a per-game test means one game of it did: seasons take sums only
        if (seq === 'seasons') continue
        for (const how of ['count', 'every', 'streak'] as How[]) {
          for (const min of s.thresholds) {
            // games with a win are wins
            if (how === 'count' && s.key === 'win') continue
            // a bad thing is tested only for none of it (the stats with a 0 threshold)
            if (dir === 'fewest' && min !== 0) continue
            const test: Test = min === 0 ? { stat: s.key, min: 0, max: 0 } : { stat: s.key, min }
            out.push({ ...base, stat: s.key, tests: [test], how, seq, scope, dir: 'most' })
          }
        }
      }
      if (dir === 'most' && hasMilestones(s.key)) for (const seq of ['games', 'starts'] as Seq[]) out.push({ ...base, stat: s.key, tests: [], how: 'reach', seq, scope, dir: 'fewest' })
    }
  }
  return out
}

// ---- the ledger as flat columns, and the sequences, built once per ledger and (sequence, scope)

/** every game of the ledger in one run, a player's games contiguous: what the miner reads by index */
interface Flat {
  n: number
  games: Game[]
  season: Int32Array
  /** the team's index in `teams` */
  team: Int32Array
  teams: string[]
  tgn: Int32Array
  date: Int32Array
  post: Uint8Array
  /** 1 started, 0 came off the bench, -1 no box score */
  start: Int8Array
  min: Int32Array
  /** per player: her games are [lo, hi) */
  spans: { p: Player; lo: number; hi: number }[]
}

function buildFlat(L: Ledger): Flat {
  const games: Game[] = []
  const spans: Flat['spans'] = []
  for (const p of L.players) { const lo = games.length; for (const g of p.games) games.push(g); if (games.length > lo) spans.push({ p, lo, hi: games.length }) }
  const n = games.length
  const teams: string[] = [], tix = new Map<string, number>()
  const F: Flat = { n, games, season: new Int32Array(n), team: new Int32Array(n), teams, tgn: new Int32Array(n), date: new Int32Array(n), post: new Uint8Array(n), start: new Int8Array(n), min: new Int32Array(n), spans }
  for (let i = 0; i < n; i++) {
    const g = games[i]
    let t = tix.get(g.team)
    if (t == null) { t = teams.length; teams.push(g.team); tix.set(g.team, t) }
    F.season[i] = g.season; F.team[i] = t; F.tgn[i] = g.tgn; F.date[i] = g.date; F.post[i] = g.post ? 1 : 0
    F.start[i] = g.started == null ? -1 : g.started ? 1 : 0; F.min[i] = g.min
  }
  return F
}

interface Ent { player: Player; season: number | null; team: string | null; active: boolean }

/** every entity of one sequence: its items (a range of game indexes each) and the field at each grid N */
interface Ctx {
  seq: Seq
  scope: Scope
  ents: Ent[]
  /** per entity: its items are [start, start + len) */
  start: Int32Array
  len: Int32Array
  /** per item: its games are G[g0, g1) (an empty range is a team game she missed) */
  g0: Int32Array
  g1: Int32Array
  G: Int32Array
  /** per item: the date the entity reached it, and whether it is in the field there */
  date: Int32Array
  ok: Uint8Array
  grid: number[]
  /** per grid step: the entities in the field, by the date they reached N */
  field: Int32Array[]
  /** per entity: the last grid step it is in the field at, or -1 */
  lastStep: Int32Array
}

interface Cache { flat: Flat; vals: Map<StatKey, Int32Array>; ctx: Map<string, Ctx> }
const caches = new WeakMap<Ledger, Cache>()
const cacheOf = (L: Ledger): Cache => caches.get(L) ?? caches.set(L, { flat: buildFlat(L), vals: new Map(), ctx: new Map() }).get(L)!

/** a stat's value in every game of the ledger */
function valsOf(L: Ledger, key: StatKey): Int32Array {
  const c = cacheOf(L)
  let v = c.vals.get(key)
  if (!v) {
    const read = statByKey(key).read
    const { games, n } = c.flat
    v = new Int32Array(n)
    for (let i = 0; i < n; i++) v[i] = read(games[i])
    c.vals.set(key, v)
  }
  return v
}

class Grow {
  a = new Int32Array(1024)
  n = 0
  push(x: number) { if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b } this.a[this.n++] = x }
  done() { return this.a.slice(0, this.n) }
}

const inScope = (F: Flat, i: number, scope: Scope) => scope === 'all' || F.post[i] === 0

/** the date a team played its game `tgn` of a season, from any player's line in it */
function teamDates(L: Ledger, F: Flat): (team: number, season: number, tgn: number) => number {
  const T = F.teams.length, S = L.currentSeason - L.firstSeason + 1
  const d = new Int32Array(S * T * 128)
  for (let i = 0; i < F.n; i++) { const k = ((F.season[i] - L.firstSeason) * T + F.team[i]) * 128 + Math.min(127, F.tgn[i]); if (!d[k]) d[k] = F.date[i] }
  return (team, season, tgn) => d[((season - L.firstSeason) * T + team) * 128 + Math.min(127, tgn)]
}

/** her last game is in the ledger's current season */
export const isActive = (L: Ledger, p: Player): boolean => p.games[p.games.length - 1]?.season === L.currentSeason

function buildCtx(L: Ledger, seq: Seq, scope: Scope, k: Knobs): Ctx {
  const F = cacheOf(L).flat
  const ents: Ent[] = []
  const start = new Grow(), len = new Grow(), g0 = new Grow(), g1 = new Grow(), G = new Grow(), date = new Grow()
  const ok: number[] = []
  let items = 0
  const item = (a: number, b: number, d: number, inField: boolean) => { g0.push(a); g1.push(b); date.push(d); ok.push(inField ? 1 : 0); items++ }
  if (seq === 'teamGames') {
    // player-seasons, counted on her first team's schedule; in the field at N once she has played the window
    const dateOf = teamDates(L, F)
    for (const { p, lo, hi } of F.spans) {
      let i = lo
      while (i < hi) {
        const season = F.season[i]
        const gs: number[] = []
        while (i < hi && F.season[i] === season) { if (inScope(F, i, scope)) gs.push(i); i++ }
        if (!gs.length) continue
        const teamIdx = F.team[gs[0]], team = F.teams[teamIdx]
        const played = L.teamGames[team]?.[season]?.[scope === 'reg' ? 0 : 1] ?? 0
        if (!played) continue
        const own = gs.filter((g) => F.team[g] === teamIdx && F.tgn[g] >= 1 && F.tgn[g] <= played).sort((a, b) => F.tgn[a] - F.tgn[b])
        ents.push({ player: p, season, team, active: season === L.currentSeason })
        start.push(items); len.push(played)
        let j = 0, starts = 0, mins = 0, last = season * 10000 + 501
        for (let t = 1; t <= played; t++) {
          const a = G.n
          while (j < own.length && F.tgn[own[j]] === t) { const g = own[j++]; G.push(g); if (F.start[g] === 1) starts++; mins += F.min[g] }
          const d = dateOf(teamIdx, season, t) || last
          last = d
          item(a, G.n, d, starts >= Math.ceil(t * k.seasonShare) || mins >= t * k.minutesAvg)
        }
      }
    }
  } else {
    for (const { p, lo, hi } of F.spans) {
      const s0 = items
      if (seq === 'seasons') {
        let cur = -1
        for (let i = lo; i < hi; i++) {
          if (!inScope(F, i, scope)) continue
          if (F.season[i] !== cur) {
            if (cur !== -1) { g1.a[g1.n - 1] = G.n; date.a[date.n - 1] = F.date[G.a[G.n - 1]] }
            cur = F.season[i]
            // a season is whole once it is over
            item(G.n, G.n, 0, cur < L.currentSeason)
          }
          G.push(i)
        }
        if (cur !== -1) { g1.a[g1.n - 1] = G.n; date.a[date.n - 1] = F.date[G.a[G.n - 1]] }
      } else {
        for (let i = lo; i < hi; i++) {
          if (!inScope(F, i, scope)) continue
          if (seq === 'starts') {
            // the starts sequence stops at a game nobody can name the starters of, as the board's does
            if (F.start[i] === -1 || p.debut < L.startsSince) break
            if (F.start[i] !== 1) continue
          }
          item(G.n, G.n + 1, F.date[i], true)
          G.push(i)
        }
      }
      if (items === s0) continue
      ents.push({ player: p, season: null, team: null, active: isActive(L, p) })
      start.push(s0); len.push(items - s0)
    }
  }
  const S = start.done(), N = len.done(), D = date.done(), OK = Uint8Array.from(ok)
  let maxLen = 0
  for (let e = 0; e < N.length; e++) if (N[e] > maxLen) maxLen = N[e]
  const grid = gridFor(seq, maxLen)
  const lastStep = new Int32Array(ents.length).fill(-1)
  const keys = new Float64Array(ents.length)
  // the board's field: an entity is in at N once it has N items (a season shorter than N is not whole at N)
  const field = grid.map((n, s) => {
    let m = 0
    for (let e = 0; e < ents.length; e++) { if (N[e] >= n && OK[S[e] + n - 1]) { keys[m++] = D[S[e] + n - 1] * 1048576 + e; lastStep[e] = s } }
    const sorted = keys.subarray(0, m).sort()
    const f = new Int32Array(m)
    for (let i = 0; i < m; i++) f[i] = sorted[i] % 1048576
    return f
  })
  return { seq, scope, ents, start: S, len: N, g0: g0.done(), g1: g1.done(), G: G.done(), date: D, ok: OK, grid, field, lastStep }
}

function ctxOf(L: Ledger, seq: Seq, scope: Scope, k: Knobs): Ctx {
  const c = cacheOf(L)
  const key = `${seq}|${scope}|${k.seasonShare}|${k.minutesAvg}`
  return c.ctx.get(key) ?? c.ctx.set(key, buildCtx(L, seq, scope, k)).get(key)!
}

/** the per-game tests all hold, as query.ts's `holds` reads them (a clean test needs the game played), from the cached columns */
function testFn(L: Ledger, tests: Test[]): (g: number) => boolean {
  const ts = tests.map((t) => ({ v: valsOf(L, t.stat), min: t.min, max: t.max }))
  const minCol = cacheOf(L).flat.min
  return (g) => {
    for (const t of ts) {
      const v = t.v[g]
      if (v < t.min) return false
      if (t.max != null && (v > t.max || (t.max === 0 && minCol[g] < PLAYED_MIN))) return false
    }
    return true
  }
}

/** the shape's value at every item of every entity: V[start + i] at N = i + 1 (every game of the logs has every stat) */
function valuesOf(L: Ledger, ctx: Ctx, shape: Shape): Int32Array {
  const V = new Int32Array(ctx.g0.length)
  const { start, len, g0, g1, G } = ctx
  if (shape.how === 'sum' || shape.how === 'reach') {
    const vals = valsOf(L, shape.stat)
    for (let e = 0; e < ctx.ents.length; e++) {
      let cum = 0
      for (let it = start[e], end = start[e] + len[e]; it < end; it++) {
        for (let j = g0[it]; j < g1[it]; j++) cum += vals[G[j]]
        V[it] = cum
      }
    }
    return V
  }
  const pass = testFn(L, shape.tests)
  const streak = shape.how === 'streak'
  for (let e = 0; e < ctx.ents.length; e++) {
    let cum = 0, run = 0
    for (let it = start[e], end = start[e] + len[e]; it < end; it++) {
      let f = false
      for (let j = g0[it]; j < g1[it] && !f; j++) f = pass(G[j])
      if (streak) { run = f ? run + 1 : 0; if (run > cum) cum = run }
      else if (f) cum++
      V[it] = cum
    }
  }
  return V
}

// ---- ranking a field

interface Mark { value: number; second: number | null; field: number; ties: number; med: number; q90: number; breaker?: RecordRow['breaker'] }

/** a[lo..hi) partly ordered so a[k] is the k-th smallest */
function select(a: Int32Array, lo: number, hi: number, k: number): number {
  hi--
  while (hi > lo) {
    const pivot = a[(lo + hi) >> 1]
    let i = lo, j = hi
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j-- }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else break
  }
  return a[k]
}

/** maximal runs of grid steps, bridging gaps of up to gapTol */
function intervals(steps: number[], gapTol: number): { lo: number; hi: number; holes: number }[] {
  const out: { lo: number; hi: number; holes: number }[] = []
  for (const s of steps) {
    const last = out[out.length - 1]
    if (last && s - last.hi - 1 <= gapTol) { last.holes += s - last.hi - 1; last.hi = s }
    else out.push({ lo: s, hi: s, holes: 0 })
  }
  return out
}

/** the dominance scale's floor: a field of near-ties doesn't divide by zero */
const unitOf = (stat: StatKey) => (['pts', 'min'].includes(stat) ? 10 : ['reb', 'ast', 'fgm', 'ftm', 'fga', 'fta'].includes(stat) ? 5 : 1)

/** the score's terms from the row's inputs, under the knobs; the sum is the score */
export function scoreRow(row: Omit<RecordRow, 'score' | 'terms' | 'folded'>, k: Knobs): { score: number; terms: Record<string, number> } {
  const s = row.shape
  const sign = s.dir === 'most' ? 1 : -1
  const unit = s.how === 'sum' ? unitOf(s.stat) : 1
  const scale = Math.max((row.q90 - row.med) * sign, unit)
  const terms: Record<string, number> = {}
  terms.field = Math.log2(row.field)
  terms.depth = k.depthW * Math.log2(Math.max(1, s.how === 'reach' ? row.value : s.seq === 'seasons' ? row.at * SEASON_GAMES : row.at))
  terms.hold = k.holdW * Math.log2(row.len)
  terms.dominance = k.domW * Math.log2(1 + Math.max(0, ((row.value - row.med) * sign) / scale))
  terms.lead = row.second == null ? 0 : k.leadW * Math.log2(1 + Math.max(0, ((row.value - row.second) * sign) / scale))
  if (s.how === 'count' || s.how === 'streak') terms.size = k.sizeW * Math.log2(Math.max(1, row.value))
  terms.tier = -k.tiers[tier(s.stat)]
  let words = 0
  if (s.scope === 'all') words += k.words.scopeAll
  if (s.since != null) words += k.words.since
  if (s.how === 'count' || s.how === 'every' || s.how === 'streak') words += k.words[s.how] + k.words.test * s.tests.length
  if (s.how !== 'reach') words += roundCost(row.at, s.seq)
  terms.words = -words
  if (row.live) terms.live = k.liveW
  if (row.kind === 'set') terms.set = k.setW
  return { score: Object.values(terms).reduce((a, b) => a + b, 0), terms }
}

/** the rows scored again under other knobs (a page with the tuner open) */
export const rescore = (rows: RecordRow[], k: Knobs): RecordRow[] => rows.map((r) => ({ ...r, ...scoreRow(r, k), folded: [] }))

/** every held and set row of one shape, for every entity */
export function mineShape(L: Ledger, shape: Shape, k = RECORDS): RecordRow[] {
  if (shape.pos !== 'ALL') throw new Error('mineShape: the mine ranks the whole field only')
  if (shape.how === 'reach' && (shape.seq === 'seasons' || shape.seq === 'teamGames')) return []
  const ctx = ctxOf(L, shape.seq, shape.scope, k)
  const V = valuesOf(L, ctx, shape)
  const E = ctx.ents.length
  const { start, len } = ctx
  const sign = shape.dir === 'most' ? 1 : -1

  // the steps: grid N for a window, milestones for a reach; at each, the field by date and each member's value
  let steps: number[]
  let fieldAt: (s: number) => Int32Array
  let valueAt: (e: number, s: number) => number
  let dateAt: (e: number, s: number) => number
  let lastStep: Int32Array
  if (shape.how === 'reach') {
    // the grid stops at the biggest career total in the field
    let max = 0
    for (let e = 0; e < E; e++) if (len[e] && V[start[e] + len[e] - 1] > max) max = V[start[e] + len[e] - 1]
    steps = milestones(shape.stat, max)
    const M = steps.length
    // reachAt[e * M + m]: the item (0-based) the entity reached milestone m in, or -1
    const ra = new Int32Array(E * M).fill(-1)
    lastStep = new Int32Array(E).fill(-1)
    for (let e = 0; e < E; e++) {
      let m = 0
      for (let i = 0; i < len[e] && m < M; i++) { const v = V[start[e] + i]; while (m < M && v >= steps[m]) { ra[e * M + m] = i; lastStep[e] = m; m++ } }
    }
    const keys = new Float64Array(E)
    const fields = steps.map((_, m) => {
      let c = 0
      for (let e = 0; e < E; e++) if (ra[e * M + m] >= 0) keys[c++] = ctx.date[start[e] + ra[e * M + m]] * 1048576 + e
      const sorted = keys.subarray(0, c).sort()
      const f = new Int32Array(c)
      for (let i = 0; i < c; i++) f[i] = sorted[i] % 1048576
      return f
    })
    fieldAt = (m) => fields[m]
    valueAt = (e, m) => ra[e * M + m] + 1
    dateAt = (e, m) => ctx.date[start[e] + ra[e * M + m]]
  } else {
    steps = ctx.grid
    fieldAt = (s) => ctx.field[s]
    valueAt = (e, s) => V[start[e] + Math.min(steps[s], len[e]) - 1]
    dateAt = (e, s) => ctx.date[start[e] + Math.min(steps[s], len[e]) - 1]
    lastStep = ctx.lastStep
  }

  const held = new Map<number, Map<number, Mark>>()
  const set = new Map<number, Map<number, Mark>>()
  const put = (m: Map<number, Map<number, Mark>>, e: number, s: number, mark: Mark) => (m.get(e) ?? m.set(e, new Map()).get(e)!).set(s, mark)
  let maxField = 0
  for (let s = 0; s < steps.length; s++) maxField = Math.max(maxField, fieldAt(s).length)
  const good = new Int32Array(maxField), scratch = new Int32Array(maxField)
  const isWindow = shape.how !== 'reach'
  for (let s = 0; s < steps.length; s++) {
    const f = fieldAt(s), n = f.length
    if (n < k.fieldFloor) continue
    let top = -Infinity
    if (isWindow) { for (let i = 0; i < n; i++) { const g = V[start[f[i]] + Math.min(steps[s], len[f[i]]) - 1] * sign; good[i] = g; if (g > top) top = g } }
    else for (let i = 0; i < n; i++) { const g = valueAt(f[i], s) * sign; good[i] = g; if (g > top) top = g }
    // "each of" is a claim only when the count is the whole window
    if (shape.how === 'every' && top !== steps[s]) continue
    let ties = 0, second = -Infinity
    for (let i = 0; i < n; i++) { const g = good[i]; if (g === top) ties++; else if (g > second) second = g }
    scratch.set(good.subarray(0, n))
    const kq = n - 1 - Math.floor(n * 0.1), km = n - 1 - Math.floor(n / 2)
    const q90 = select(scratch, 0, n, kq) * sign
    const med = (km === kq ? q90 * sign : select(scratch, 0, kq, km)) * sign
    const base = { second: second === -Infinity ? null : second * sign, field: n, ties, med, q90 }
    // one game is not a streak
    if (shape.how === 'streak' && top < 2) continue
    if (ties <= k.admitTies) for (let i = 0; i < n; i++) if (good[i] === top) put(held, f[i], s, { value: top * sign, ...base })
    // who set it: the running best as the entities reached N
    let best = -Infinity, holder: Mark | null = null
    for (let i = 0; i < n; i++) {
      if (good[i] <= best) continue
      const e = f[i]
      if (holder) holder.breaker = { name: ctx.ents[e].player.name, season: ctx.ents[e].season, value: good[i] * sign, date: dateAt(e, s) }
      best = good[i]
      holder = { value: good[i] * sign, second: holder ? holder.value : null, field: i + 1, ties: 1, med, q90 }
      // a record among fewer than fieldFloor careers is the league's first class getting there first, not a record
      if (i + 1 >= k.fieldFloor) put(set, e, s, holder)
    }
  }

  const out: RecordRow[] = []
  const minN = k.minN[shape.seq]
  const emit = (kind: Kind, e: number, marks: Map<number, Mark>, skip?: Map<number, Mark>) => {
    const ent = ctx.ents[e]
    // an interval starts no earlier than minN: the first few games are noise
    const ss = [...marks.keys()].filter((s) => !skip?.has(s) && (!isWindow || steps[s] >= minN)).sort((a, b) => a - b)
    for (const iv of intervals(ss, k.gapTol)) {
      const live = ent.active && iv.hi >= lastStep[e]
      const ivLen = isWindow ? steps[iv.hi] - steps[iv.lo] + 1 : Math.max(1, valueAt(e, iv.hi) - valueAt(e, iv.lo) + 1)
      const player: PlayerRef = { id: ent.player.id, name: ent.player.name, debut: ent.player.debut, pos: ent.player.pos }
      const rowAt = (s: number): RecordRow => {
        const m = marks.get(s)!
        const row: Omit<RecordRow, 'score' | 'terms' | 'folded'> = {
          shape, kind, key: ent.season != null ? `${ent.player.id}:${ent.season}` : ent.player.id, player, season: ent.season, team: ent.team,
          lo: isWindow ? Math.min(steps[iv.lo], len[e]) : steps[iv.lo], hi: isWindow ? Math.min(steps[iv.hi], len[e]) : steps[iv.hi], from: isWindow ? undefined : steps[iv.lo], at: isWindow ? Math.min(steps[s], len[e]) : steps[s], len: ivLen, holes: iv.holes,
          value: m.value, second: m.second, field: m.field, ties: m.ties, med: m.med, q90: m.q90, live, breaker: kind === 'set' ? m.breaker : undefined,
        }
        return { ...row, ...scoreRow(row, k), folded: [] }
      }
      // the row is worded at the N where it scores best; a live lead, an "each of", a reach, and a season lead that
      // runs to the season's end (the whole-season claim) at its high edge
      let best: RecordRow | null = null
      if (shape.how === 'every' || shape.how === 'reach' || live || (shape.seq === 'teamGames' && steps[iv.hi] >= len[e])) best = rowAt(iv.hi)
      else for (let s = iv.lo; s <= iv.hi; s++) { if (!marks.has(s) || skip?.has(s)) continue; const r = rowAt(s); if (!best || r.score > best.score) best = r }
      if (best) out.push(best)
    }
  }
  for (const [e, marks] of held) emit('held', e, marks)
  for (const [e, marks] of set) emit('set', e, marks, held.get(e))
  return out
}

/** every row of every shape, above the keep floor */
export function mine(L: Ledger, shapes = shapesFor('ALL'), k = RECORDS): RecordRow[] {
  const out: RecordRow[] = []
  for (const shape of shapes) for (const r of mineShape(L, shape, k)) if (r.score >= k.keepFloor) out.push(r)
  return out
}

export const testsKey = (tests: Test[]) => tests.map((t) => `${t.stat}:${t.min}${t.max != null ? `-${t.max}` : ''}`).join(',')
/** the claim's identity without its wording choices (scope, games vs starts) */
const claimKey = (r: RecordRow) => [r.kind, r.key, r.shape.how, r.shape.stat, testsKey(r.shape.tests), r.shape.dir, r.shape.seq === 'teamGames' ? 'season' : r.shape.seq === 'seasons' ? 'seasons' : 'career'].join('|')
/** games is everyone's plain sequence; starts and the playoffs are the fancier wordings */
const plainness = (r: RecordRow) => (r.shape.scope === 'all' ? 1 : 0) + (r.shape.seq === 'starts' ? 1 : 0)

/** one row per claim: the plainest wording stands, and a fancier one folds under it when its interval is inside */
export function collapse(rows: RecordRow[]): RecordRow[] {
  const groups = new Map<string, RecordRow[]>()
  for (const r of rows) (groups.get(claimKey(r)) ?? groups.set(claimKey(r), []).get(claimKey(r))!).push(r)
  const out: RecordRow[] = []
  for (const g of groups.values()) {
    g.sort((a, b) => plainness(a) - plainness(b) || b.score - a.score)
    const kept: RecordRow[] = []
    for (const r of g) {
      const under = kept.find((k) => { const tol = Math.max(3, 0.1 * (k.hi - k.lo + 1)); return r.lo >= k.lo - tol && r.hi <= k.hi + tol })
      if (under) under.folded.push(r)
      else kept.push(r)
    }
    out.push(...kept)
  }
  return out
}

/** the stat a row is about: a test's stat, or the sum's */
export const statOf = (r: RecordRow): StatKey => r.shape.tests[0]?.stat ?? r.shape.stat
/** the family a page groups by: the stat and the entity kind */
export const family = (r: RecordRow) => `${statOf(r)}|${r.season != null ? 'season' : 'career'}`

/** a derived stat's parts: a row under it that says the same number as a row under a part says nothing new */
export const COMPONENTS: Partial<Record<StatKey, StatKey[]>> = { pra: ['pts', 'reb', 'ast'], stocks: ['stl', 'blk'], reb: ['oreb', 'dreb'] }

export interface Family { key: string; best: RecordRow; rest: RecordRow[] }

const overlaps = (x: RecordRow, r: RecordRow) => x.lo <= r.hi && r.lo <= x.hi
/** the same number over the same stretch of the same sequence, under another stat or verb */
const sameClaim = (x: RecordRow, r: RecordRow) => x.kind === r.kind && x.season === r.season && x.value === r.value && overlaps(x, r) && x.shape.seq === r.shape.seq

/** a player's page: her rows, collapsed, grouped by family, the families by their best row */
export function page(rows: RecordRow[], playerId: string): Family[] {
  const mine = collapse(rows.filter((r) => r.player.id === playerId))
  // a derived stat's row folds under its part's row when they say the same number
  const kept = new Set(mine)
  for (const r of mine.filter((r) => COMPONENTS[statOf(r)])) {
    const part = mine.find((x) => kept.has(x) && x !== r && COMPONENTS[statOf(r)]!.includes(statOf(x)) && sameClaim(x, r) && x.shape.how === r.shape.how && testsKey(x.shape.tests).replace(statOf(x), '') === testsKey(r.shape.tests).replace(statOf(r), ''))
    if (part) { part.folded.push(r); kept.delete(r) }
  }
  const fams = new Map<string, RecordRow[]>()
  for (const r of mine) if (kept.has(r)) (fams.get(family(r)) ?? fams.set(family(r), []).get(family(r))!).push(r)
  const out: Family[] = []
  for (const [key, rs] of fams) {
    rs.sort((a, b) => b.score - a.score)
    // the same number at the same N under another verb (14 wins, won each of 14, 14 straight) is one claim
    const faces: RecordRow[] = []
    for (const r of rs) {
      const same = faces.find((x) => sameClaim(x, r))
      if (same) same.folded.push(r)
      else faces.push(r)
    }
    out.push({ key, best: faces[0], rest: faces.slice(1) })
  }
  return out.sort((a, b) => b.best.score - a.best.score)
}

// ---- the file: one per player, the rows' inputs and no score

export const FILE_VERSION = 1

export interface FileRow {
  /** the shape without pos and since: [stat, tests, how, seq, scope, dir] */
  s: [StatKey, string, How, Seq, Scope, Dir]
  k: Kind
  n: number | null
  tm: string | null
  lo: number
  hi: number
  fr?: number
  at: number
  len: number
  ho: number
  v: number
  v2: number | null
  f: number
  t: number
  md: number
  q9: number
  lv?: 1
  b?: [string, number | null, number, number]
}

export interface PlayerFile {
  v: number
  id: string
  name: string
  /** her position group, null when no source has one; the rows' field is every player */
  pos: Exclude<Pos, 'ALL'> | null
  born: string | null
  debut: number
  from: number
  to: number
  teams: string[]
  games: number
  active: boolean
  rows: FileRow[]
}

const parseTests = (s: string): Test[] => (s ? s.split(',').map((x) => { const m = /^([a-z0-9]+):(-?\d+)(?:-(\d+))?$/.exec(x)!; return m[3] == null ? { stat: m[1] as StatKey, min: Number(m[2]) } : { stat: m[1] as StatKey, min: Number(m[2]), max: Number(m[3]) } }) : [])

export function encodePlayer(L: Ledger, p: Player, rows: RecordRow[]): PlayerFile {
  const teams = [...new Set(p.games.map((g) => g.team))]
  return {
    v: FILE_VERSION, id: p.id, name: p.name, pos: p.pos, born: p.born, debut: p.debut,
    from: p.games[0].season, to: p.games[p.games.length - 1].season, teams, games: p.games.length, active: isActive(L, p),
    rows: rows.map((r) => {
      const o: FileRow = {
        s: [r.shape.stat, testsKey(r.shape.tests), r.shape.how, r.shape.seq, r.shape.scope, r.shape.dir], k: r.kind, n: r.season, tm: r.team,
        lo: r.lo, hi: r.hi, at: r.at, len: r.len, ho: r.holes, v: r.value, v2: r.second, f: r.field, t: r.ties, md: r.med, q9: r.q90,
      }
      if (r.from != null) o.fr = r.from
      if (r.live) o.lv = 1
      if (r.breaker) o.b = [r.breaker.name, r.breaker.season, r.breaker.value, r.breaker.date]
      return o
    }),
  }
}

/** the file's rows as the page scores them, under the knobs */
export function decodePlayer(file: PlayerFile, k = RECORDS): RecordRow[] {
  if (file.v !== FILE_VERSION) throw new Error(`player file v${file.v}, expected v${FILE_VERSION}`)
  const player: PlayerRef = { id: file.id, name: file.name, debut: file.debut, pos: file.pos }
  return file.rows.map((o) => {
    const row: Omit<RecordRow, 'score' | 'terms' | 'folded'> = {
      shape: { pos: 'ALL', stat: o.s[0], tests: parseTests(o.s[1]), how: o.s[2], seq: o.s[3], scope: o.s[4], since: null, dir: o.s[5] },
      kind: o.k, key: o.n != null ? `${file.id}:${o.n}` : file.id, player, season: o.n, team: o.tm,
      lo: o.lo, hi: o.hi, from: o.fr, at: o.at, len: o.len, holes: o.ho, value: o.v, second: o.v2, field: o.f, ties: o.t, med: o.md, q90: o.q9, live: o.lv === 1,
      breaker: o.b ? { name: o.b[0], season: o.b[1], value: o.b[2], date: o.b[3] } : undefined,
    }
    return { ...row, ...scoreRow(row, k), folded: [] }
  })
}
