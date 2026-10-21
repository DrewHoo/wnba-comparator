// The words a shared address unfurls with, the rows its card draws, and the
// comparison the panel reads (a row against a peer: the curves, where they
// met, what the subject needs to match). Pure, so the panel, the share
// worker (workers/share), document.title and the tests say the same thing;
// the worker adds the data.
import type { Board, Crossing, Query, Row } from './query.ts'
import { crossings, curve, toMatch, DEFAULT_QUERY } from './query.ts'
import { countWords, statByKey } from './stats.ts'
import { queryWords, rowName, rowWords, rankWords, seqWords, testsWords } from './words.ts'

export const SITE = 'WNBA Comparator'

/** the games ahead the "to match" line reads over */
export const K = 5

/** the peers a row can be read against: the rest of the board, forty at most */
export const peersOf = (board: Board, row: Row): Row[] => [...board.ranked, ...board.onTheWay].filter((r) => r.key !== row.key).slice(0, 40)

/** the peer a `vs` key names, else the first peer (the leader, or the next row) */
export const peerOf = (board: Board, row: Row, vs: string | null | undefined): Row | null => {
  const others = peersOf(board, row)
  return others.find((r) => r.key === vs) ?? others[0] ?? null
}

export interface Comparison {
  me: number[]
  them: number[]
  /** the last six crossings inside the window, latest first */
  xs: Crossing[]
  /** what the subject needs over the next K to match the peer there */
  match: { need: number; at: number } | null
  /** the chart's window */
  n: number
}

/** null for a player-season board or a test board: no curve to draw */
export function compare(row: Row, peer: Row, q: Query): Comparison | null {
  if (q.seq === 'teamGames' || q.how === 'every' || q.how === 'count' || q.how === 'streak') return null
  const cq = q.how === 'reach' ? { ...q, how: 'sum' as const } : q
  const me = curve(row.player, cq), them = curve(peer.player, cq)
  const xs = crossings(me, them).filter((c) => c.n <= Math.max(q.n, me.length)).slice(-6).reverse()
  const match = q.how === 'sum' ? toMatch(me.slice(0, Math.max(row.reached, Math.min(me.length, q.n))), them, K) : null
  const n = q.how === 'reach' ? Math.max(row.value ?? 0, peer.value ?? 0) : q.n
  return { me, them, xs, match, n }
}

/** "passed Cynthia Cooper at game 46, 1,021 points" */
export const crossingWords = (c: Crossing, peer: Row, q: Query) => `${c.kind} ${peer.player.name} at ${seqWords(q.seq, 1)} ${c.n}, ${countWords(c.value, statByKey(q.stat))}`

/** "To match Cynthia Cooper's 2,187 points at game 100, Caitlin Clark needs 313 points over her next 5 games." */
export function matchWords(row: Row, peer: Row, cmp: Comparison, q: Query): string | null {
  if (!cmp.match) return null
  const stat = statByKey(q.stat)
  const m = cmp.match
  return `To match ${peer.player.name}'s ${countWords(cmp.them[m.at - 1], stat)} at ${seqWords(q.seq, 1)} ${m.at}, ${row.player.name} needs ${countWords(Math.max(0, m.need), stat)} over her next ${K} ${seqWords(q.seq, K)}${m.need <= 0 ? ' (she is already past it)' : ''}.`
}

const unitWords = (q: Query) => (q.seq === 'teamGames' ? 'player-seasons' : 'careers')

/** the row's claim as one sentence: "Caitlin Clark has 1,874 points through her 93 games, still inside the window." */
export function claimWords(row: Row, q: Query, board: Board | null, firstSeason: number): string {
  const since = q.since ?? firstSeason
  const place = row.complete && row.value != null && board ? `, ${rankWords(row, board.ranked.length)} ${unitWords(q)} since ${since}` : row.value == null ? '' : ', still inside the window'
  return `${row.player.name} has ${rowWords(row, q)}${place}.`
}

/** whether the address says more than the root page does: any slot off its default, or a player open */
export function isShared(q: Query, open: string | null): boolean {
  if (open) return true
  const d = DEFAULT_QUERY
  return q.pos !== d.pos || q.stat !== d.stat || q.how !== d.how || q.n !== d.n || q.seq !== d.seq || q.scope !== d.scope || q.since !== d.since || q.dir !== d.dir || q.tests.length > 0
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Players with the most points through their first 100 games · WNBA Comparator"; with a row open, "Caitlin Clark vs Cynthia Cooper: most points through the first 100 games · WNBA Comparator" */
export function shareTitle(q: Query, open: Row | null = null, peer: Row | null = null): string {
  if (open) return `${rowName(open)}${peer ? ` vs ${rowName(peer)}` : ''}: ${cardHeading(q)} · ${SITE}`
  return `${cap(queryWords(q))} · ${SITE}`
}

/** the description: the leader when the board is known; the open player's claim, read against her peer, when one is */
export function shareDescription(q: Query, board: Board | null, open: Row | null, firstSeason: number, peer: Row | null = null): string {
  const since = q.since ?? firstSeason
  const unit = q.seq === 'teamGames' ? 'player-season' : 'career'
  const parts: string[] = []
  if (open) {
    parts.push(claimWords(open, q, board, firstSeason))
    if (peer) {
      if (peer.value != null) parts.push(`${rowName(peer)}: ${rowWords(peer, q)}.`)
      const cmp = compare(open, peer, q)
      if (cmp) {
        parts.push(cmp.xs[0] ? `${open.player.name} ${crossingWords(cmp.xs[0], peer, q)}.` : 'Their curves never met.')
        const m = matchWords(open, peer, cmp, q)
        if (m) parts.push(m)
      }
    }
  } else if (board?.ranked[0] && board.ranked[0].value != null) parts.push(`${rowName(board.ranked[0])} leads with ${rowWords(board.ranked[0], q)}.`)
  parts.push(`Every WNBA ${unit} since ${since} ranked at the same point: ${queryWords(q)}. Open a row to read it against a peer.`)
  return parts.join(' ')
}

/** what the card's heading says: "MOST POINTS THROUGH THE FIRST 100 GAMES" */
export function cardHeading(q: Query): string {
  const stat = statByKey(q.stat)
  const win = q.seq === 'teamGames' ? `a team's first ${q.n} games` : `the first ${q.n} ${seqWords(q.seq, q.n)}`
  if (q.how === 'sum') return `${q.dir} ${stat.noun} through ${win}`
  if (q.how === 'reach') return `${q.dir === 'fewest' ? 'fastest' : 'slowest'} to ${q.n.toLocaleString('en-US')} ${stat.noun}`
  const t = testsWords(q.tests)
  if (q.how === 'every') return `${t} in each of ${win}`
  if (q.how === 'streak') return `longest streak of ${t} in ${win}`
  return `${q.dir} games of ${t} in ${win}`
}

export interface CardRow {
  rank: string
  name: string
  /** "2013–2016", or "thru 93" for a row still inside the window */
  span: string
  value: string
  /** the row still inside the window: the value in rust */
  live: boolean
  /** the open player's row */
  hi: boolean
}

/** the card's rows: the top of the board, with the open player's row in place of the last when she is further down */
export function cardRows(board: Board, q: Query, open: string | null, n = 6): CardRow[] {
  const all = [...board.ranked, ...board.onTheWay]
  const top = board.ranked.slice(0, n)
  const openRow = open ? all.find((r) => r.key === open) ?? null : null
  if (openRow && !top.includes(openRow)) top.splice(Math.max(0, Math.min(top.length, n - 1)), top.length >= n ? 1 : 0, openRow)
  const way = (r: Row) => r.season == null && !r.complete
  return top.map((r, i) => ({
    rank: r.complete && r.value != null ? `${r.tied ? 'T' : ''}${r.rank}` : '—',
    name: rowName(r),
    span: way(r) ? `thru ${r.reached}` : r.season != null ? `${r.reached} of ${q.n}` : r.from === r.to ? String(r.from) : `${r.from}–${r.to}`,
    value: r.value == null ? '—' : q.how === 'reach' ? `${r.value}` : r.value.toLocaleString('en-US'),
    live: way(r),
    hi: r.key === open,
  }))
}
