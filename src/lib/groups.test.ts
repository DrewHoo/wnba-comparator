// The team pages' gate: every team id in the ledger belongs to one
// franchise, and a few franchise leaders a fan would check.
import { describe, expect, it } from 'vitest'
import { decodeLedger, type LedgerFile } from './ledger.ts'
import { FRANCHISES, franchiseBySlug, groupData, groupPath, posFromSlug, MIN_GAMES } from './groups.ts'
import file from '../data/players.json'

const L = decodeLedger(file as unknown as LedgerFile)
const team = (id: string) => franchiseBySlug(id)!

describe('franchises', () => {
  it('every team id in the ledger belongs to exactly one franchise', () => {
    const ids = new Set(L.players.flatMap((p) => p.games.map((g) => g.team)))
    for (const id of ids) expect(FRANCHISES.filter((f) => f.ids.includes(id)).map((f) => f.id), id).toHaveLength(1)
  })
  it('the address round-trips', () => {
    expect(groupPath('LVA', 'G')).toBe('/team/lva/guards/')
    expect(franchiseBySlug('lva')!.name).toBe('Las Vegas Aces')
    expect(posFromSlug('centers')).toBe('C')
  })
})

describe('leaders', () => {
  it("Taurasi leads the Mercury's guards, Wilson the Aces' forwards (the Starzz and Stars included), Catchings the Fever's", () => {
    const phx = groupData(L, team('phx'), 'G')
    expect(phx.rows[0].name).toBe('Diana Taurasi')
    // she played only for Phoenix: the franchise's total is her regular-season career
    expect(phx.rows[0].totals[0]).toBe(L.players.find((p) => p.name === 'Diana Taurasi')!.games.filter((g) => !g.post).reduce((s, g) => s + g.pts, 0))
    const lva = groupData(L, team('lva'), 'F')
    expect(lva.rows[0].name).toBe("A'ja Wilson")
    expect(lva.from).toBe(1997)
    expect(groupData(L, team('ind'), 'F').rows[0].name).toBe('Tamika Catchings')
  })
  it('a row has the minimum games and only the curves of the top eight', () => {
    const d = groupData(L, team('nyl'), 'G')
    for (const r of d.rows) expect(r.games).toBeGreaterThanOrEqual(MIN_GAMES)
    expect(d.rows.filter((r) => r.curves).length).toBe(Math.min(8, d.rows.length))
    expect(d.rows[0].curves![0].at(-1)).toBe(d.rows[0].totals[0])
  })
})
