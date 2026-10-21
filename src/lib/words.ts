// The words of a query and of a row: the sentence the pickers sit in, the
// claim a row makes. Pure, so the prerender, the panel and a share card say
// the same thing.
import type { Pos } from './ledger.ts'
import type { Query, Row, Seq, Test } from './query.ts'
import { countWords, isUnit, statByKey } from './stats.ts'

export const POS_WORDS: Record<Pos, string> = { ALL: 'players', G: 'guards', F: 'forwards', C: 'centers' }

/** the sequence's noun, plural: "starts", "games", "seasons", "team games of a season" */
export function seqWords(seq: Seq, n: number): string {
  if (seq === 'starts') return n === 1 ? 'start' : 'starts'
  if (seq === 'seasons') return n === 1 ? 'season' : 'seasons'
  if (seq === 'teamGames') return `${n === 1 ? 'game' : 'games'} of a season`
  return n === 1 ? 'game' : 'games'
}

/** "30+ points", "no turnovers", "a double-double", "a win" */
export function testWords(t: Test): string {
  const s = statByKey(t.stat)
  if (t.max === 0 && t.min === 0) return `no ${s.noun}`
  if (t.max != null) return `${t.min}–${t.max} ${s.noun}`
  if (t.min === 1 && isUnit(s)) return `a ${s.one}`
  return `${t.min}+ ${s.noun}`
}

export const testsWords = (tests: Test[]) => tests.map(testWords).join(' and ')

/** "their first 100 games" / "their team's first 20 games of a season" */
export function windowWords(q: Query): string {
  if (q.seq === 'teamGames') return `their team's first ${q.n} ${seqWords(q.seq, q.n)}`
  return `their first ${q.n} ${seqWords(q.seq, q.n)}`
}

/** the whole sentence, for a title or a card */
export function queryWords(q: Query): string {
  const who = POS_WORDS[q.pos]
  const stat = statByKey(q.stat)
  const era = q.since ? ` since ${q.since}` : ''
  const scope = q.scope === 'all' ? ', playoffs included' : ''
  if (q.how === 'sum') return `${who} with the ${q.dir} ${stat.noun} through ${windowWords(q)}${scope}${era}`
  if (q.how === 'reach') return `${who} ${q.dir === 'fewest' ? 'fastest' : 'slowest'} to ${countWords(q.n, stat)}, by ${seqWords(q.seq, 2)}${scope}${era}`
  const t = testsWords(q.tests)
  if (q.how === 'every') return `${who} with ${t} in each of ${windowWords(q)}${scope}${era}`
  if (q.how === 'streak') return `${who} with the longest streak of games with ${t} in ${windowWords(q)}${scope}${era}`
  return `${who} with the ${q.dir} games with ${t} in ${windowWords(q)}${scope}${era}`
}

const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]) }

/** a player's name with the season for a player-season row */
export const rowName = (r: Row) => (r.season != null ? `${r.player.name} (${r.season} ${r.team})` : r.player.name)

/** the row's claim: "1,021 points through her team's first 40 games of 2024" */
export function rowWords(r: Row, q: Query): string {
  const stat = statByKey(q.stat)
  const scope = q.scope === 'all' ? ', playoffs included' : ''
  const win = r.season != null ? `${r.team}'s first ${q.n} games of ${r.season}` : `${r.complete ? 'her first' : 'her'} ${r.reached} ${seqWords(q.seq, r.reached)}`
  if (r.value == null) return `${r.reached} ${seqWords(q.seq, r.reached)} and still short of ${countWords(q.n, stat)}`
  if (q.how === 'sum') return `${countWords(r.value, stat)} through ${win}${scope}`
  if (q.how === 'reach') return `${countWords(q.n, stat)} in ${r.value} ${seqWords(q.seq, r.value)}${scope}`
  const t = testsWords(q.tests)
  if (q.how === 'every') return r.all ? `${t} in each of ${win}${scope}` : `${t} in ${r.value} of ${win}${scope}`
  if (q.how === 'streak') return `${r.value} straight ${r.value === 1 ? 'game' : 'games'} with ${t} in ${win}${scope}`
  return `${r.value} ${r.value === 1 ? 'game' : 'games'} with ${t} in ${win}${scope}`
}

/** "1st of 212", "T-3rd of 212" */
export const rankWords = (r: Row, field: number) => `${r.tied ? 'T-' : ''}${ord(r.rank)} of ${field}`
