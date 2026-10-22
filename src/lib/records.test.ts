// The records gate: golden lines written as the complaints they guard
// against, over the committed ledger. The whole catalog takes a few seconds
// to mine, so this mines a handful of shapes (points over games, both
// scopes; points and assists over a team's games; wins over starts; fastest
// to a points milestone; 30-point games) once at load, plus the file round
// trip and the nesting of a page in the mine. The miner is NBA Comparator's.
import { describe, expect, it } from 'vitest'
import { decodeLedger, type LedgerFile } from './ledger.ts'
import { evaluate, DEFAULT_QUERY, type Query } from './query.ts'
import { RECORDS, decodePlayer, encodePlayer, milestones, mineShape, page, shapesFor, type RecordRow, type Shape } from './records.ts'
import file from '../data/players.json'

const L = decodeLedger(file as unknown as LedgerFile)
const S = (patch: Partial<Shape>): Shape => ({ pos: 'ALL', stat: 'pts', tests: [], how: 'sum', seq: 'games', scope: 'reg', since: null, dir: 'most', ...patch })
const SHAPES = {
  pts: S({}),
  ptsAll: S({ scope: 'all' }),
  ptsSeason: S({ seq: 'teamGames' }),
  astSeason: S({ stat: 'ast', seq: 'teamGames' }),
  winStarts: S({ stat: 'win', seq: 'starts' }),
  reach: S({ how: 'reach', dir: 'fewest' }),
  thirty: S({ how: 'count', tests: [{ stat: 'pts', min: 30 }] }),
}
const mined = Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, mineShape(L, s)])) as Record<keyof typeof SHAPES, RecordRow[]>
const kept = Object.values(mined).flat().filter((r) => r.score >= RECORDS.keepFloor)
const player = (name: string) => L.players.find((p) => p.name === name)!
const board = (patch: Partial<Query>) => evaluate(L, { ...DEFAULT_QUERY, ...patch })
const allRows = (fams: ReturnType<typeof page>) => fams.flatMap((f) => [f.best, ...f.rest])

describe('the shapes', () => {
  it('walks every stat but losses, with no count of wins and no clean test outside turnovers and fouls', () => {
    const shapes = shapesFor('ALL')
    expect(shapes.some((s) => s.stat === 'loss')).toBe(false)
    expect(shapes.some((s) => s.stat === 'win' && s.how === 'count')).toBe(false)
    expect([...new Set(shapes.flatMap((s) => s.tests.filter((t) => t.max === 0).map((t) => t.stat)))].sort()).toEqual(['pf', 'tov'])
    expect(shapes.some((s) => s.seq === 'seasons' && s.how !== 'sum')).toBe(false)
    expect(shapes.some((s) => s.dir === 'fewest' && s.how === 'sum' && s.seq !== 'starts')).toBe(false)
  })
})

describe('golden rows', () => {
  it('Cynthia Cooper leads points through 100 games (2,187), and the mine agrees with the board', () => {
    const r = mined.pts.find((x) => x.player.name === 'Cynthia Cooper' && x.kind === 'held' && x.lo <= 100 && x.hi >= 100)!
    expect(r).toBeTruthy()
    const b = board({ n: 100 })
    expect(b.ranked[0].player.name).toBe('Cynthia Cooper')
    expect(b.ranked[0].value).toBe(2187)
    const at = board({ n: r.at }).ranked.find((x) => x.player.id === r.player.id)!
    expect(at.rank).toBe(1)
    expect(r.value).toBe(at.value)
  })

  it("a held row's value is the board's at its worded N, and first there", () => {
    const boards = new Map<string, ReturnType<typeof board>>()
    const rows = Object.entries(mined).filter(([k]) => k !== 'reach').flatMap(([, rs]) => rs.filter((r) => r.kind === 'held').sort((a, b) => b.score - a.score).slice(0, 8))
    for (const r of rows) {
      const key = `${JSON.stringify(r.shape)}|${r.at}`
      const b = boards.get(key) ?? boards.set(key, board({ ...r.shape, n: r.at })).get(key)!
      const x = [...b.ranked, ...b.onTheWay].find((y) => y.key === r.key)!
      expect(x.value, `${r.key} ${r.shape.stat} ${r.shape.how} ${r.shape.seq} @${r.at}`).toBe(r.value)
      // a season's field is the seasons she played (half the starts or 15 minutes a game), the board's every season
      if (r.season == null) expect(x.rank).toBe(1)
    }
  })

  it("A'ja Wilson's 1,021 points in the Aces' first 40 games of 2024 is a held row, and so are Clark's 337 assists", () => {
    const w = mined.ptsSeason.find((x) => x.player.name === "A'ja Wilson" && x.kind === 'held' && x.season === 2024 && x.at === 40)
    expect(w?.value).toBe(1021)
    expect(w?.team).toBe('LVA')
    expect(w!.score).toBeGreaterThan(RECORDS.keepFloor)
    const c = mined.astSeason.find((x) => x.player.name === 'Caitlin Clark' && x.season === 2024 && x.at === 40)
    expect(c?.value).toBe(337)
  })

  it('a reach row is worded at a milestone on the grid, and its run starts on one', () => {
    expect(mined.reach.length).toBeGreaterThan(0)
    for (const r of mined.reach) {
      expect(milestones(r.shape.stat, r.at)).toContain(r.at)
      expect(milestones(r.shape.stat, r.at)).toContain(r.from)
    }
  })

  it('no row starts under the noise floor', () => {
    for (const r of Object.values(mined).flat()) if (r.shape.how !== 'reach') expect(r.lo).toBeGreaterThanOrEqual(RECORDS.minN[r.shape.seq])
  })

  it('a set row was set in a field of at least fieldFloor', () => {
    for (const r of Object.values(mined).flat()) if (r.kind === 'set') expect(r.field).toBeGreaterThanOrEqual(RECORDS.fieldFloor)
  })

  it('a career from before the starter flag has no starts rows: Sue Bird (2002) sits out, as on the board', () => {
    const bird = player('Sue Bird')
    expect(mined.winStarts.some((r) => r.player.id === bird.id)).toBe(false)
    expect(mined.winStarts.length).toBeGreaterThan(0)
    for (const r of mined.winStarts) expect(L.players.find((p) => p.id === r.player.id)!.debut).toBeGreaterThanOrEqual(L.startsSince)
  })
})

describe('the file and the page', () => {
  it('a player file round-trips to the same scores', () => {
    const p = player('Diana Taurasi')
    const own = kept.filter((r) => r.player.id === p.id)
    expect(own.length).toBeGreaterThan(0)
    const f = encodePlayer(L, p, own)
    expect(f.games).toBe(p.games.length)
    expect(f.teams).toEqual(['PHO'])
    const back = decodePlayer(JSON.parse(JSON.stringify(f)))
    expect(back.map((r) => Math.round(r.score * 1000))).toEqual(own.map((r) => Math.round(r.score * 1000)))
    expect(back.map((r) => r.breaker?.name ?? '')).toEqual(own.map((r) => r.breaker?.name ?? ''))
    expect(back.map((r) => `${r.lo}-${r.hi}@${r.at}`)).toEqual(own.map((r) => `${r.lo}-${r.hi}@${r.at}`))
  })

  it("a page's rows nest in the mine: every mined row is shown or folded, nothing is added", () => {
    for (const name of ['Cynthia Cooper', "A'ja Wilson"]) {
      const p = player(name)
      const own = kept.filter((r) => r.player.id === p.id)
      const fams = page(kept, p.id)
      const seen = new Set<RecordRow>()
      const walk = (r: RecordRow) => { seen.add(r); r.folded.forEach(walk) }
      allRows(fams).forEach(walk)
      expect(seen.size).toBe(own.length)
      for (const r of seen) expect(own).toContain(r)
      for (const f of fams) for (const r of f.rest) expect(r.score).toBeLessThanOrEqual(f.best.score)
      for (const r of kept) r.folded = []
    }
  })
})
