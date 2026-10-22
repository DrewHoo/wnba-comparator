// The words a shared address carries: a board's title and description, a
// comparison's, the share button's text, the rows a card draws. Pure, so
// the share worker (workers/share), the share button, the tab title and the
// tests all say the same thing; the worker adds the data. NFL Comparator has
// the same module under the same name; the comparison itself (curves,
// crossings, the to-match line) is compare.ts.
import type { Board, Query, Row } from './query.ts'
import { DEFAULT_QUERY } from './query.ts'
import { compare, crossingWords, matchWords } from './compare.ts'
import { countWords, statByKey } from './stats.ts'
import { placeWords, queryWords, recordWords, rowName, rowWords, rankWords, seqWords, testsWords } from './words.ts'
import type { RecordRow } from './records.ts'

export const SITE = 'WNBA Comparator'

const unitWords = (q: Query) => (q.seq === 'teamGames' ? 'player-seasons' : 'careers')

/** the row's claim as one sentence: "Cynthia Cooper has 2,187 points through her first 100 games, 1st of 429 careers since 1997." */
export function claimWords(q: Query, board: Board, row: Row): string {
  const tail = row.complete && row.value != null ? `, ${rankWords(row, board.ranked.length)} ${unitWords(q)} since ${q.since ?? board.since}` : row.value == null ? '' : ', still inside the window'
  return `${row.player.name} has ${rowWords(row, q)}${tail}.`
}

/** what the share button sends with the board's address: the open row's claim, else the sentence */
export const shareText = (q: Query, board: Board | null, row: Row | null) => (board && row ? claimWords(q, board, row) : `${cap(queryWords(q))}.`)

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

/** "Cynthia Cooper leads with 2,187 points through her first 100 games." (ties: "A and B lead with …"); empty when nobody has the window */
export function leaderWords(board: Board, q: Query): string {
  const top = board.ranked[0]
  if (!top || top.value == null) return ''
  const tied = board.ranked.filter((r) => r.value === top.value)
  const names = tied.slice(0, 3).map(rowName)
  const who = tied.length > 3 ? `${names.slice(0, 2).join(', ')} and ${tied.length - 2} others` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return `${who} ${tied.length > 1 ? 'lead' : 'leads'} with ${rowWords(top, q)}.`
}

/** the description: the leader when the board is known; the open player's claim, read against her peer, when one is */
export function shareDescription(q: Query, board: Board | null, open: Row | null, firstSeason: number, peer: Row | null = null): string {
  const since = q.since ?? firstSeason
  const unit = q.seq === 'teamGames' ? 'player-season' : 'career'
  const parts: string[] = []
  if (open) {
    parts.push(board ? claimWords(q, board, open) : `${open.player.name} has ${rowWords(open, q)}.`)
    if (peer) {
      if (peer.value != null) parts.push(`${rowName(peer)}: ${rowWords(peer, q)}.`)
      const cmp = compare(open, peer, q)
      if (cmp) {
        parts.push(cmp.xs[0] ? `${open.player.name} ${crossingWords(cmp.xs[0], peer, q)}.` : 'Their curves never met.')
        const m = matchWords(open, peer, cmp, q)
        if (m) parts.push(m)
      }
    }
  } else if (board) { const w = leaderWords(board, q); if (w) parts.push(w) }
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

/** one side of a comparison card: the name, the value, its unit, the claim in small print */
export interface CardSide {
  name: string
  value: string
  /** "points", "games" */
  unit: string
  /** "1st of 429 · through her first 100 games" */
  claim: string
}

/** the comparison card's words: both sides, the panel's lines under them, the curves when there are any */
export interface CardComparison {
  heading: string
  sides: [CardSide, CardSide]
  lines: string[]
  chart: { me: number[]; them: number[]; n: number; unit: string } | null
}

/** the card a `t=` link draws: the open row against her peer, as the panel reads them */
export function cardComparison(q: Query, board: Board, row: Row, peer: Row): CardComparison {
  const stat = statByKey(q.stat)
  const unit = q.how === 'reach' ? seqWords(q.seq, 2) : q.how === 'sum' ? stat.noun : 'games'
  const field = board.ranked.length
  const place = (r: Row) => (r.complete && r.value != null ? rankWords(r, field) : 'inside the window')
  const claim = (r: Row) =>
    r.value == null ? `${r.reached} ${seqWords(q.seq, r.reached)} so far`
      : r.season != null ? `${r.team}'s first ${q.n} games of ${r.season}`
      : q.how === 'reach' ? `to ${countWords(q.n, stat)}`
      : `through ${r.complete ? 'her first' : 'her'} ${r.reached} ${seqWords(q.seq, r.reached)}`
  const side = (r: Row): CardSide => ({ name: rowName(r), value: r.value == null ? '—' : r.value.toLocaleString('en-US'), unit, claim: `${place(r)} · ${claim(r)}` })
  const cmp = compare(row, peer, q)
  const lines: string[] = []
  if (cmp) {
    lines.push(cmp.xs[0] ? `${row.player.name} ${crossingWords(cmp.xs[0], peer, q)}.` : 'Their curves never met.')
    const m = matchWords(row, peer, cmp, q)
    if (m) lines.push(m)
  } else {
    lines.push(`${rowName(row)}: ${rowWords(row, q)}.`)
    if (peer.value != null) lines.push(`${rowName(peer)}: ${rowWords(peer, q)}.`)
  }
  return {
    heading: `${row.player.name} vs ${peer.player.name}`,
    sides: [side(row), side(peer)],
    lines,
    chart: cmp ? { me: cmp.me, them: cmp.them, n: cmp.n, unit: seqWords(q.seq, 1) } : null,
  }
}

/** a player page's lead line: her best claim, or what the page is */
export function playerLead(name: string, face: RecordRow | null | undefined, firstSeason: number): string {
  return face ? `${name}: ${recordWords(face)}, ${placeWords(face)}.` : `Every comparison ${name} leads among WNBA players at the same point in the career, since ${firstSeason}.`
}

/** a player page's head; the title is the fact people type: "A'ja Wilson: every comparison she leads at the same point in a career · WNBA Comparator" */
export function playerText(name: string, face: RecordRow | null | undefined, firstSeason: number): { title: string; description: string } {
  const lead = playerLead(name, face, firstSeason)
  const rest = ` Every comparison she leads among WNBA players at the same point in the career, since ${firstSeason}.`
  return { title: `${name}: every comparison she leads at the same point in a career · ${SITE}`, description: face ? `${lead}${rest}` : lead }
}
