import { describe, expect, it } from 'vitest'
import { LANDINGS, landingFor, landingFromPath, parseLocation, toAddress } from './landing.ts'
import { DEFAULT_QUERY } from './query.ts'
import { parseUrl } from './url.ts'

describe('landing pages', () => {
  it('every slug is a path, unique, and not the root', () => {
    const slugs = LANDINGS.map((l) => l.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(landingFor(DEFAULT_QUERY)).toBeNull()
    expect(LANDINGS.length).toBeGreaterThanOrEqual(10)
  })
  it('every landing round-trips through its path, with and without a player open', () => {
    for (const l of LANDINGS) {
      expect(landingFromPath(`${l.slug}/`)).toBe(l)
      expect(landingFromPath(`/${l.slug}`)).toBe(l)
      const s = parseLocation(`${l.slug}/`, '')
      expect(s.query).toEqual(l.query)
      expect(s.landing).toBe(l)
      expect(toAddress(s)).toBe(`${l.slug}/`)
      const t = parseLocation(`${l.slug}/`, '?t=100073')
      expect(t.open).toBe('100073')
      expect(toAddress(t)).toBe(`${l.slug}/?t=100073`)
    }
  })
  it('a query that lands on a landing writes its path; a slot moved off it writes the root', () => {
    const s = parseLocation('', '?how=reach&n=1000&dir=fewest')
    expect(s.landing?.slug).toBe('fastest-to-1000-points')
    expect(toAddress(s)).toBe('fastest-to-1000-points/')
    const moved = parseLocation('fastest-to-1000-points/', '?n=1500')
    expect(moved.landing).toBeNull()
    expect(toAddress(moved)).toBe('?how=reach&n=1500&dir=fewest')
    expect(parseLocation('', '')).toMatchObject({ query: DEFAULT_QUERY, open: null, landing: null })
    expect(parseLocation('nope/', '?n=50').query).toEqual(parseUrl('?n=50').query)
  })
})
