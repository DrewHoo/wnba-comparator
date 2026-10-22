// The named definition pages: a curated set of queries, each at its own
// path (/fastest-to-1000-points/), prerendered as the board on that query
// with an h1 worded the way people ask it. The board is the same board; the
// path is the query's canonical address, so a board that arrives at one of
// these queries by any route writes the path, and a landing path with a
// player open (?t=) keeps the query. The default query is the root page and
// must not appear here (landing.test pins it).
//
// Pure: strings and queries, no ledger, so the worker and the prerender can
// import it.
import { DEFAULT_QUERY, normalize, type Query } from './query.ts'
import { parseUrl, toUrl, type UrlState } from './url.ts'
import { cardHeading } from './share.ts'

export interface Landing {
  slug: string
  query: Query
  /** the h1, a question */
  h1: string
  /** the <title> before the site's name: the heading in the words people search with */
  title: string
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const Q = (patch: Partial<Query>): Query => normalize({ ...DEFAULT_QUERY, tests: [], ...patch })

// the slug, the query, the question; the title comes from the card heading
type Row = [slug: string, query: Query, h1: string]
const ROWS: Row[] = [
  // career windows: the root is points through 100 games
  ['most-points-in-first-50-games', Q({ n: 50 }), 'Who has the most points through her first 50 WNBA games?'],
  ['most-points-in-first-200-games', Q({ n: 200 }), 'Who has the most points through her first 200 WNBA games?'],
  ['most-assists-in-first-100-games', Q({ stat: 'ast' }), 'Who has the most assists through her first 100 WNBA games?'],
  ['most-rebounds-in-first-100-games', Q({ stat: 'reb' }), 'Who has the most rebounds through her first 100 WNBA games?'],
  ['most-3-pointers-in-first-100-games', Q({ stat: 'tpm' }), 'Who has made the most 3-pointers through her first 100 WNBA games?'],
  ['most-blocks-in-first-100-games', Q({ stat: 'blk' }), 'Who has the most blocks through her first 100 WNBA games?'],
  ['most-double-doubles-in-first-100-games', Q({ stat: 'dd' }), 'Who has the most double-doubles through her first 100 WNBA games?'],
  ['most-triple-doubles-in-first-100-games', Q({ stat: 'td' }), 'Who has the most triple-doubles through her first 100 WNBA games?'],
  ['most-30-point-games-in-first-100-games', Q({ how: 'count', tests: [{ stat: 'pts', min: 30 }] }), 'Who has the most 30-point games in her first 100 WNBA games?'],
  ['most-wins-in-first-100-starts', Q({ stat: 'win', seq: 'starts' }), 'Who has the most wins through her first 100 WNBA starts?'],
  // races
  ['fastest-to-1000-points', Q({ how: 'reach', n: 1000, dir: 'fewest' }), 'Who was the fastest to 1,000 WNBA points?'],
  ['fastest-to-5000-points', Q({ how: 'reach', n: 5000, dir: 'fewest' }), 'Who was the fastest to 5,000 WNBA points?'],
  ['fastest-to-500-assists', Q({ how: 'reach', stat: 'ast', n: 500, dir: 'fewest' }), 'Who was the fastest to 500 WNBA assists?'],
  ['fastest-to-1000-rebounds', Q({ how: 'reach', stat: 'reb', n: 1000, dir: 'fewest' }), 'Who was the fastest to 1,000 WNBA rebounds?'],
  // rookie seasons: every career here began in the league's own era, so its first season is its rookie season
  ['most-points-in-a-rookie-season', Q({ seq: 'seasons', n: 1 }), 'Who scored the most points in a WNBA rookie season?'],
  ['most-assists-in-a-rookie-season', Q({ stat: 'ast', seq: 'seasons', n: 1 }), 'Who had the most assists in a WNBA rookie season?'],
  ['most-rebounds-in-a-rookie-season', Q({ stat: 'reb', seq: 'seasons', n: 1 }), 'Who had the most rebounds in a WNBA rookie season?'],
  ['most-points-in-first-3-seasons', Q({ seq: 'seasons', n: 3 }), 'Who scored the most points in her first three WNBA seasons?'],
  // season starts: a team's first 20 games, a window every season since 1997 has
  ['most-points-in-first-20-games-of-a-season', Q({ seq: 'teamGames', n: 20 }), "Who scored the most points in a team's first 20 games of a WNBA season?"],
  ['most-assists-in-first-20-games-of-a-season', Q({ stat: 'ast', seq: 'teamGames', n: 20 }), "Who had the most assists in a team's first 20 games of a WNBA season?"],
  ['most-triple-doubles-in-first-20-games-of-a-season', Q({ stat: 'td', seq: 'teamGames', n: 20 }), "Who had the most triple-doubles in a team's first 20 games of a WNBA season?"],
  ['most-30-point-games-in-first-20-games-of-a-season', Q({ how: 'count', tests: [{ stat: 'pts', min: 30 }], seq: 'teamGames', n: 20 }), "Who had the most 30-point games in a team's first 20 games of a WNBA season?"],
]

export const LANDINGS: Landing[] = ROWS.map(([slug, query, h1]) => ({ slug, query, h1, title: `${cap(cardHeading(query))} in WNBA history (since 1997)` }))

/** the query's canonical spelling, the one toUrl writes; two queries are the same when these match */
export const queryKey = (q: Query) => toUrl({ query: q, open: null })

const bySlug = new Map(LANDINGS.map((l) => [l.slug, l]))
const byKey = new Map(LANDINGS.map((l) => [queryKey(l.query), l]))

/** the landing at a path relative to the site's base: "fastest-to-1000-points/" or "/fastest-to-1000-points"; null for the root and everything else */
export const landingFromPath = (rel: string): Landing | null => bySlug.get(rel.replace(/^\/+|\/+$/g, '')) ?? null

/** the landing a board is on, when its query has one */
export const landingFor = (q: Query): Landing | null => byKey.get(queryKey(q)) ?? null

export interface Location extends UrlState { landing: Landing | null }

/** the state of an address: the landing's query when the path names one (the search can still move slots and open a player), else the search alone */
export function parseLocation(rel: string, search: string): Location {
  const landing = landingFromPath(rel)
  const s = parseUrl(search, landing?.query ?? DEFAULT_QUERY)
  return { ...s, landing: landingFor(s.query) }
}

/** the address of a state, relative to the site's base: the landing's path when the query has one (only `t` and `vs` ride along), else the root with the query's params */
export function toAddress(state: UrlState): string {
  const l = landingFor(state.query)
  if (!l) return toUrl(state)
  const p = new URLSearchParams()
  if (state.open) p.set('t', state.open)
  if (state.open && state.vs) p.set('vs', state.vs)
  const s = p.toString()
  return `${l.slug}/${s ? `?${s}` : ''}`
}
