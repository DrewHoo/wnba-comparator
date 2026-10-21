import { describe, expect, it } from 'vitest'
import { cardHeading, cardRows, isShared, shareDescription, shareTitle } from './share.ts'
import { decodeLedger, type LedgerFile } from './ledger.ts'
import { evaluate, DEFAULT_QUERY } from './query.ts'
import { parseUrl } from './url.ts'
import file from '../data/players.json'

const L = decodeLedger(file as unknown as LedgerFile)

describe('share words', () => {
  it('the root is not a share; a slot off its default or an open player is', () => {
    expect(isShared(DEFAULT_QUERY, null)).toBe(false)
    expect(isShared({ ...DEFAULT_QUERY, n: 50 }, null)).toBe(true)
    expect(isShared(DEFAULT_QUERY, '100073')).toBe(true)
  })
  it('titles and headings read the sentence', () => {
    expect(shareTitle(DEFAULT_QUERY)).toBe('Players with the most points through their first 100 games · WNBA Comparator')
    expect(cardHeading(DEFAULT_QUERY)).toBe('most points through the first 100 games')
    expect(cardHeading({ ...DEFAULT_QUERY, how: 'reach', n: 1000, dir: 'fewest' })).toBe('fastest to 1,000 points')
    expect(cardHeading({ ...DEFAULT_QUERY, how: 'count', tests: [{ stat: 'pts', min: 30 }], seq: 'teamGames', n: 20 })).toBe("most games of 30+ points in a team's first 20 games")
  })
  it('the description names the leader, or the open player with her rank', () => {
    const b = evaluate(L, DEFAULT_QUERY)
    expect(shareDescription(DEFAULT_QUERY, b, null, L.firstSeason)).toMatch(/^Cynthia Cooper leads with 2,187 points through her first 100 games\. Every WNBA career since 1997/)
    const clark = [...b.ranked, ...b.onTheWay].find((r) => r.player.name === 'Caitlin Clark')!
    expect(shareDescription(DEFAULT_QUERY, b, clark, L.firstSeason)).toMatch(/^Caitlin Clark has 1,874 points through her 93 games\./)
  })
  it('the card shows the top rows, and the open player in place of the last when she is further down', () => {
    const { query, open } = parseUrl('?t=' + L.players.find((p) => p.name === 'Caitlin Clark')!.id)
    const rows = cardRows(evaluate(L, query), query, open)
    expect(rows).toHaveLength(6)
    expect(rows[0].name).toBe('Cynthia Cooper')
    expect(rows[5]).toMatchObject({ name: 'Caitlin Clark', rank: '—', span: 'thru 93', live: true, hi: true })
  })
})
