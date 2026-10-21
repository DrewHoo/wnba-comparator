// The query as a sentence: who · did what · how much · over which games ·
// against whom, every word that can change a Picker. The shape of the
// sentence follows `how` (a total, a count of games, every game, a streak,
// a race to a number); src/lib/words.ts says the same sentence in prose.
import { Picker } from './Picker.jsx'
import { Chevron } from './Icons.jsx'
import { POSITIONS } from '../lib/ledger.ts'
import { STATS, statByKey, isUnit } from '../lib/stats.ts'
import { POS_WORDS, testWords, seqWords } from '../lib/words.ts'

const POS_OPTIONS = POSITIONS.map((p) => ({ value: p, label: POS_WORDS[p] }))

// how + dir in one word: what the sentence says before the stat
const HOW_OPTIONS = [
  { value: 'sum:most', label: 'with the most' },
  { value: 'sum:fewest', label: 'with the fewest' },
  { value: 'count:most', label: 'with the most games of' },
  { value: 'count:fewest', label: 'with the fewest games of' },
  { value: 'every:most', label: 'with every game at' },
  { value: 'streak:most', label: 'with the longest streak of' },
  { value: 'reach:fewest', label: 'fastest to' },
  { value: 'reach:most', label: 'slowest to' },
]

const SCOPE_OPTIONS = [
  { value: 'reg', label: 'regular season' },
  { value: 'all', label: 'playoffs included' },
]

// the eras: the whole ledger, the first season with the starter flag, then a few round cuts
const eraOptions = (ledger) => [
  { value: 0, label: `since ${ledger.firstSeason}`, hint: 'the whole league' },
  { value: ledger.startsSince, label: `since ${ledger.startsSince}`, hint: 'starts flagged' },
  ...[2008, 2013, 2016, 2020, 2024].filter((y) => y > ledger.startsSince && y < ledger.currentSeason).map((y) => ({ value: y, label: `since ${y}` })),
]

const STAT_OPTIONS = STATS.map((s) => ({ value: s.key, label: s.noun }))

/** every threshold of every stat, as one test each: "30+ points", "a double-double" */
function testOptions() {
  const out = []
  for (const s of STATS) {
    if (isUnit(s)) { out.push({ value: `${s.key}:1`, label: testWords({ stat: s.key, min: 1 }) }); continue }
    if (s.thresholds[0] === 0) out.push({ value: `${s.key}:0-0`, label: testWords({ stat: s.key, min: 0, max: 0 }) })
    for (const t of s.thresholds) if (t > 0) out.push({ value: `${s.key}:${t}`, label: testWords({ stat: s.key, min: t }) })
  }
  return out
}
const TEST_OPTIONS = testOptions()
const testValue = (t) => `${t.stat}:${t.min}${t.max != null ? `-${t.max}` : ''}`
const parseTest = (v) => { const m = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(v); return m[3] == null ? { stat: m[1], min: Number(m[2]) } : { stat: m[1], min: Number(m[2]), max: Number(m[3]) } }

function NumberWord({ value, onChange, step = 1, wide, label }) {
  return (
    <span className="nwrap">
      <button className="nstep" onClick={() => onChange(Math.max(1, value - step))} aria-label={`${label} down`}><Chevron left /></button>
      <input className={'nin' + (wide ? ' wide' : '')} type="number" min="1" value={value} aria-label={label}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v > 0) onChange(v) }} />
      <button className="nstep" onClick={() => onChange(value + step)} aria-label={`${label} up`}><Chevron /></button>
    </span>
  )
}

export function Sentence({ query, ledger, onChange }) {
  const set = (patch) => onChange({ ...query, ...patch })
  const seqOptions = [
    { value: 'games', label: seqWords('games', query.n) },
    { value: 'starts', label: seqWords('starts', query.n), hint: `flagged since ${ledger.startsSince}` },
    { value: 'seasons', label: seqWords('seasons', query.n) },
    { value: 'teamGames', label: `team ${seqWords('teamGames', query.n)}` },
  ]
  const isTest = query.how === 'count' || query.how === 'every' || query.how === 'streak'
  const setTest = (i, v) => set({ tests: query.tests.map((t, k) => (k === i ? parseTest(v) : t)) })
  const addTest = () => {
    const used = new Set(query.tests.map((t) => t.stat))
    const next = STATS.find((s) => !used.has(s.key) && s.key !== 'win' && s.key !== 'loss') ?? STATS[0]
    set({ tests: [...query.tests, { stat: next.key, min: next.thresholds[Math.min(1, next.thresholds.length - 1)] }] })
  }
  const stat = statByKey(query.stat)
  const reachSeq = seqOptions.filter((o) => o.value === 'games' || o.value === 'starts')

  return (
    <div className="sentence" role="group" aria-label="The comparison">
      <Picker value={query.pos} options={POS_OPTIONS} onChange={(pos) => set({ pos })} ariaLabel="Position" />
      <Picker value={`${query.how}:${query.dir}`} options={HOW_OPTIONS} onChange={(v) => { const [how, dir] = v.split(':'); set({ how, dir }) }} ariaLabel="How the games count" />
      {query.how === 'reach' && (
        <>
          <NumberWord value={query.n} onChange={(n) => set({ n })} step={stat.thresholds[0] >= 10 ? 100 : 10} wide label="The target" />
          <Picker value={query.stat} options={STAT_OPTIONS} onChange={(stat) => set({ stat })} ariaLabel="The stat" />
          <span>by</span>
          <Picker value={query.seq} options={reachSeq} onChange={(seq) => set({ seq })} ariaLabel="Counting what" />
        </>
      )}
      {query.how === 'sum' && (
        <>
          <Picker value={query.stat} options={STAT_OPTIONS} onChange={(stat) => set({ stat })} ariaLabel="The stat" />
          <span>through their first</span>
        </>
      )}
      {isTest && (
        <>
          {query.tests.map((t, i) => (
            <span key={i} className="nwrap">
              {i > 0 && <span>and&nbsp;</span>}
              <Picker value={testValue(t)} options={TEST_OPTIONS} onChange={(v) => setTest(i, v)} ariaLabel={`Test ${i + 1}`} />
              {query.tests.length > 1 && <button className="xbtn" onClick={() => set({ tests: query.tests.filter((_, k) => k !== i) })} aria-label="Remove this test">×</button>}
            </span>
          ))}
          {query.tests.length < 3 && <button className="addbtn" onClick={addTest} aria-label="Add a test">+</button>}
          <span>in their first</span>
        </>
      )}
      {query.how !== 'reach' && (
        <>
          <NumberWord value={query.n} onChange={(n) => set({ n })} label="The window" />
          <Picker value={query.seq} options={seqOptions} onChange={(seq) => set({ seq })} ariaLabel="Counting what" />
        </>
      )}
      <span>·</span>
      <Picker value={query.scope} options={SCOPE_OPTIONS} onChange={(scope) => set({ scope })} ariaLabel="Playoffs" />
      <span>·</span>
      <Picker value={query.since ?? 0} options={eraOptions(ledger)} onChange={(v) => set({ since: v || null })} ariaLabel="Era" />
    </div>
  )
}
