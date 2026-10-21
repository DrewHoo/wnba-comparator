import { useEffect, useMemo, useRef, useState } from 'react'
import { Sentence } from './components/Sentence.jsx'
import { Board } from './components/Board.jsx'
import { Panel } from './components/Panel.jsx'
import { Notes } from './components/Notes.jsx'
import { ShareIcon } from './components/Icons.jsx'
import { decodeLedger } from './lib/ledger.ts'
import { evaluate, normalize, DEFAULT_QUERY } from './lib/query.ts'
import { parseUrl, toUrl } from './lib/url.ts'
import { queryWords } from './lib/words.ts'
import { writeUrl } from './urlState.js'
import file from './data/players.json'

// the whole ledger ships with the page (1.7MB gzipped): one file, every player
const L = decodeLedger(file)

const track = (name, props) => { try { window.dhAnalytics?.track(name, props) } catch {} }

export default function App() {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [open, setOpen] = useState(null)
  const [copied, setCopied] = useState(false)
  const booted = useRef(false)

  // URL state after mount, never during render: the prerender has no window
  useEffect(() => {
    const s = parseUrl(window.location.search)
    setQuery(s.query)
    setOpen(s.open)
    booted.current = true
    track('query', { words: queryWords(s.query) })
  }, [])

  const board = useMemo(() => evaluate(L, query), [query])
  const row = useMemo(() => (board && open ? [...board.ranked, ...board.onTheWay].find((r) => r.key === open) ?? null : null), [board, open])

  const change = (q) => {
    const next = normalize(q)
    setQuery(next)
    writeUrl(toUrl({ query: next, open }), 'replace')
    track('query', { words: queryWords(next) })
  }
  const openRow = (key) => {
    const next = open === key ? null : key
    setOpen(next)
    writeUrl(toUrl({ query, open: next }), 'replace')
    if (next) track('open', { player: next })
  }
  const share = async () => {
    const url = window.location.href
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch {}
    track('share', { words: queryWords(query) })
  }

  return (
    <main>
      <div className="dateline">
        <span>drewhoover.com · {L.firstSeason}–{L.currentSeason} · updated {String(L.builtAt).slice(0, 10)}</span>
        <span className="dateline-acts">
          <button className="ico" onClick={share} aria-label="Share this board"><ShareIcon /></button>
          {copied && <span className="toast">copied</span>}
        </span>
      </div>
      <h1>WNBA Comparator</h1>
      <Sentence query={query} onChange={change} />
      <p className="baserate">
        <span className="sr-only">{queryWords(query)}. </span>
        Same point in the career, every {query.seq === 'teamGames' ? 'season' : 'career'} since {query.since ?? L.firstSeason}.
        {board && board.ranked[0] && board.ranked[0].value != null && <> The leader: <b>{board.ranked[0].player.name}</b>, {board.ranked[0].value.toLocaleString('en-US')}.</>}
      </p>
      {row && <Panel key={row.key} row={row} board={board} query={query} onClose={() => openRow(row.key)} onOpen={openRow} />}
      <Board board={board} query={query} open={open} onOpen={openRow} />
      <Notes ledger={L} />
    </main>
  )
}
