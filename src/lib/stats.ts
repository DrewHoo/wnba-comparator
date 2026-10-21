// The stat catalog: what a game can be counted by. Each stat reads one row
// of the ledger. `noun` is how a sum reads ("1,021 points"), a test how a
// per-game threshold reads ("30+ points"). Every stat is every position's;
// the position is a filter on the field, not on the catalog.

import type { Game } from './ledger.ts'

export type StatKey =
  | 'win' | 'loss'
  | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov'
  | 'tpm' | 'tpa' | 'fgm' | 'fga' | 'ftm' | 'fta' | 'oreb' | 'dreb' | 'pf' | 'min'
  | 'dd' | 'td' | 'stocks' | 'pra'

export interface Stat {
  key: StatKey
  /** plural noun for a total: "points" */
  noun: string
  /** singular for a count of 1: "point" */
  one: string
  read: (g: Game) => number
  /** the per-game thresholds the test picker offers */
  thresholds: number[]
}

const S = (key: StatKey, noun: string, one: string, read: (g: Game) => number, thresholds: number[]): Stat => ({ key, noun, one, read, thresholds })

/** how many of the five counting stats reached 10 */
const tens = (g: Game) => [g.pts, g.reb, g.ast, g.stl, g.blk].filter((v) => v >= 10).length

export const STATS: Stat[] = [
  S('win', 'wins', 'win', (g) => (g.result === 2 ? 1 : 0), [1]),
  S('loss', 'losses', 'loss', (g) => (g.result === 0 ? 1 : 0), [1]),
  S('pts', 'points', 'point', (g) => g.pts, [10, 15, 20, 25, 30, 40]),
  S('reb', 'rebounds', 'rebound', (g) => g.reb, [5, 8, 10, 15, 20]),
  S('ast', 'assists', 'assist', (g) => g.ast, [5, 8, 10, 12]),
  S('stl', 'steals', 'steal', (g) => g.stl, [2, 3, 4, 5]),
  S('blk', 'blocks', 'block', (g) => g.blk, [2, 3, 4, 5]),
  S('tpm', '3-pointers made', '3-pointer made', (g) => g.tpm, [2, 3, 4, 5, 6]),
  S('tpa', '3-point attempts', '3-point attempt', (g) => g.tpa, [5, 8, 10]),
  S('fgm', 'field goals made', 'field goal made', (g) => g.fgm, [5, 8, 10, 12]),
  S('fga', 'field goal attempts', 'field goal attempt', (g) => g.fga, [10, 15, 20]),
  S('ftm', 'free throws made', 'free throw made', (g) => g.ftm, [5, 8, 10]),
  S('fta', 'free throw attempts', 'free throw attempt', (g) => g.fta, [5, 8, 10]),
  S('oreb', 'offensive rebounds', 'offensive rebound', (g) => g.oreb, [3, 5, 8]),
  S('dreb', 'defensive rebounds', 'defensive rebound', (g) => g.dreb, [5, 8, 10]),
  S('tov', 'turnovers', 'turnover', (g) => g.tov, [0, 1, 3, 5]),
  S('pf', 'fouls', 'foul', (g) => g.pf, [0, 5, 6]),
  S('min', 'minutes', 'minute', (g) => g.min, [20, 30, 35, 40]),
  S('dd', 'double-doubles', 'double-double', (g) => (tens(g) >= 2 ? 1 : 0), [1]),
  S('td', 'triple-doubles', 'triple-double', (g) => (tens(g) >= 3 ? 1 : 0), [1]),
  S('stocks', 'steals + blocks', 'steal or block', (g) => g.stl + g.blk, [3, 4, 5, 6]),
  S('pra', 'points + rebounds + assists', 'point, rebound or assist', (g) => g.pts + g.reb + g.ast, [20, 30, 40, 50]),
]

export const statByKey = (key: StatKey): Stat => {
  const s = STATS.find((x) => x.key === key)
  if (!s) throw new Error(`no stat ${key}`)
  return s
}

/** a count stat: a game either has one or doesn't, so its only test is "a double-double" */
export const isUnit = (s: Stat) => s.thresholds.length === 1 && s.thresholds[0] === 1

/** the words of a count: "1 win", "115 wins", "1,021 points" */
export function countWords(n: number, stat: Stat): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? stat.one : stat.noun}`
}
