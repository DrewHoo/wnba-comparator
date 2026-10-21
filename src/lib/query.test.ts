// The known-answer gate: published factoids the ledger has to reproduce.
// Each pin says where the data's definition differs from the publisher's.
import { describe, expect, it } from 'vitest'
import { decodeLedger, type LedgerFile } from './ledger.ts'
import { crossings, curve, evaluate, holds, toMatch, DEFAULT_QUERY, PLAYED_MIN, type Board } from './query.ts'
import file from '../data/players.json'

const L = decodeLedger(file as unknown as LedgerFile)
const row = (b: Board, name: string, season?: number) => [...b.ranked, ...b.onTheWay].find((r) => r.player.name === name && (season == null || r.season === season))
const player = (name: string) => L.players.find((p) => p.name === name)!
const season = (stat: typeof DEFAULT_QUERY.stat, n: number) => evaluate(L, { ...DEFAULT_QUERY, stat, seq: 'teamGames', n })

describe('the gate', () => {
  it('Cynthia Cooper scored 621 points in 1997, the first season (WNBA)', () => {
    const c = row(season('pts', 28), 'Cynthia Cooper', 1997)!
    expect(c.value).toBe(621)
    expect(c.games.length).toBe(28)
    expect(c.complete).toBe(true)
  })

  it('Tamika Catchings scored 594 points in 2002, her rookie season (WNBA)', () => {
    const t = row(season('pts', 32), 'Tamika Catchings', 2002)!
    expect(t.value).toBe(594)
    expect(t.games.length).toBe(32)
  })

  it("A'ja Wilson scored 1,021 points in 2024, the first 1,000-point season (WNBA)", () => {
    const w = row(season('pts', 40), "A'ja Wilson", 2024)!
    expect(w.value).toBe(1021)
    expect(w.games.length).toBe(38) // she sat two of the Aces' 40
    expect(w.complete).toBe(true)
  })

  it('Caitlin Clark had 337 assists in 2024, the single-season record at the time (WNBA)', () => {
    const c = row(season('ast', 40), 'Caitlin Clark', 2024)!
    expect(c.value).toBe(337)
    expect(c.games.length).toBe(40)
  })

  it('Sabrina Ionescu made 128 threes in 2023, the single-season record at the time (WNBA)', () => {
    expect(row(season('tpm', 40), 'Sabrina Ionescu', 2023)!.value).toBe(128)
  })

  it('Tina Charles had 398 rebounds in 2010, the single-season record at the time (WNBA)', () => {
    expect(row(season('reb', 34), 'Tina Charles', 2010)!.value).toBe(398)
  })

  it('Caitlin Clark had two triple-doubles in 2024, the first by a rookie (WNBA)', () => {
    expect(row(season('td', 40), 'Caitlin Clark', 2024)!.value).toBe(2)
  })

  it('Paige Bueckers scored 44 on Aug 20, 2025, the rookie record (WNBA): one 40-point game in the Wings\' 44', () => {
    const b = evaluate(L, { ...DEFAULT_QUERY, how: 'count', tests: [{ stat: 'pts', min: 40 }], seq: 'teamGames', n: 44 })
    const p = row(b, 'Paige Bueckers', 2025)!
    expect(p.value).toBe(1)
    expect(p.games.find((g) => g.pts === 44)?.date).toBe(20250820)
  })

  it('the ledger starts with the league: every season from 1997 has games, and a 2002 debut is a career', () => {
    expect(L.firstSeason).toBe(1997)
    const bird = row(evaluate(L, DEFAULT_QUERY), 'Sue Bird')!
    expect(bird.player.games[0].season).toBe(2002)
    expect(bird.complete).toBe(true)
  })

  it('starts are flagged from 2003: a career from before sits out a starts field, and the board counts it', () => {
    const b = evaluate(L, { ...DEFAULT_QUERY, stat: 'win', seq: 'starts', n: 50 })
    expect(L.startsSince).toBe(2003)
    expect(b.gapped).toBeGreaterThan(0)
    expect(row(b, 'Sue Bird')).toBeUndefined()
    for (const r of b.ranked) {
      expect(r.player.games[0].season).toBeGreaterThanOrEqual(2003)
      expect(r.games.every((g) => g.started === true)).toBe(true)
    }
  })
})

describe('the clean-game floor', () => {
  const game = (min: number, tov: number) => ({ ...player('Caitlin Clark').games[0], min, tov })
  it('a no-turnover game counts only when she played ten minutes; a threshold test needs no floor', () => {
    const clean = [{ stat: 'tov' as const, min: 0, max: 0 }]
    expect(holds(game(PLAYED_MIN, 0), clean)).toBe(true)
    expect(holds(game(PLAYED_MIN - 1, 0), clean)).toBe(false)
    expect(holds(game(PLAYED_MIN - 1, 1), clean)).toBe(false)
    // a cap above zero ("0–2 turnovers") and a plain threshold read the line as it is
    expect(holds(game(2, 1), [{ stat: 'tov', min: 0, max: 2 }])).toBe(true)
    expect(holds(game(2, 12), [{ stat: 'pts', min: 10 }])).toBe(true)
  })
  it('no streak of clean games is built from cameos', () => {
    const clean = [{ stat: 'tov' as const, min: 0, max: 0 }]
    const b = evaluate(L, { ...DEFAULT_QUERY, how: 'streak', tests: clean, n: 50 })
    expect(b.ranked[0].value).toBeGreaterThan(0)
    const cameos = b.ranked.slice(0, 20).flatMap((r) => r.games).filter((g) => g.tov === 0 && g.min < PLAYED_MIN)
    expect(cameos.length).toBeGreaterThan(0)
    for (const g of cameos) expect(holds(g, clean)).toBe(false)
  })
})

describe('peer readings', () => {
  it('Clark and Ionescu meet on assists by game', () => {
    const q = { ...DEFAULT_QUERY, stat: 'ast' as const }
    const c = curve(player('Caitlin Clark'), q)
    const s = curve(player('Sabrina Ionescu'), q)
    const x = crossings(c, s)
    expect(x.length).toBeGreaterThan(0)
    expect(x.map((v) => v.n)).toEqual([...x.map((v) => v.n)].sort((a, b) => a - b))
  })

  it('toMatch says what the subject needs over its next k games', () => {
    expect(toMatch([1, 2, 3], [2, 4, 6, 8, 10], 2)).toEqual({ need: 7, at: 5 })
    expect(toMatch([1, 2, 3], [2, 4], 2)).toBeNull()
  })
})
