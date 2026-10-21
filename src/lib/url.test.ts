import { describe, expect, it } from 'vitest'
import { parseUrl, toUrl } from './url.ts'
import { DEFAULT_QUERY } from './query.ts'

describe('url', () => {
  it('the default query is the bare address', () => {
    expect(toUrl({ query: DEFAULT_QUERY, open: null })).toBe('')
    expect(parseUrl('').query).toEqual(DEFAULT_QUERY)
  })
  it('round-trips a test query', () => {
    const query = { ...DEFAULT_QUERY, how: 'count' as const, tests: [{ stat: 'pts' as const, min: 20 }, { stat: 'reb' as const, min: 10 }], n: 40, seq: 'teamGames' as const, since: 2016 }
    const url = toUrl({ query, open: '4433403' })
    expect(url).toBe('?how=count&n=40&seq=teamGames&since=2016&tests=pts%3A20%2Creb%3A10&t=4433403')
    expect(parseUrl(url)).toEqual({ query, open: '4433403' })
  })
  it('drops what it cannot read', () => {
    const { query } = parseUrl('?pos=QB&stat=nope&n=-3&tests=pts:x,ast:8')
    expect(query.pos).toBe('ALL')
    expect(query.n).toBe(100)
    expect(query.tests).toEqual([{ stat: 'ast', min: 8 }])
  })
  it('a reach over seasons falls back to games', () => {
    expect(parseUrl('?how=reach&seq=seasons&n=1000').query.seq).toBe('games')
  })
})
