import { useEffect, useMemo, useRef, useState } from 'react'
import { Sentence } from './components/Sentence.jsx'
import { Board, rowId } from './components/Board.jsx'
import { Panel } from './components/Panel.jsx'
import { Notes, KOFI_URL } from './components/Notes.jsx'
import { PlayerFinder } from './components/PlayerFinder.jsx'
import { CoffeeIcon, ShareIcon } from './components/Icons.jsx'
import { useShare } from './hooks/useShare.ts'
import { decodeLedger } from './lib/ledger.ts'
import { evaluate, normalize, DEFAULT_QUERY } from './lib/query.ts'
import { toUrl } from './lib/url.ts'
import { landingFor, parseLocation, toAddress } from './lib/landing.ts'
import { Landings } from './components/Landings.jsx'
import { queryWords } from './lib/words.ts'
import { peerOf } from './lib/compare.ts'
import { shareText, shareTitle } from './lib/share.ts'
import { track } from './lib/analytics.ts'
import { writeUrl } from './urlState.js'
import file from './data/players.json'

// the whole ledger ships with the page (2MB gzipped): one file, every player
const L = decodeLedger(file)

/** the open row's top, clear of the index site's sticky back bar */
const BACK_BAR = 64
const BASE = import.meta.env.BASE_URL
/** the path relative to the site's base: "fastest-to-1000-points/" on a landing, "" at the root */
const relPath = (pathname) => (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, ''))

/** `initial` is the page's own query (a landing's, from its path; the prerender and main.jsx pass the same one, so the hydrate matches) */
export default function App({ initial = null }) {
  const [query, setQuery] = useState(initial?.query ?? DEFAULT_QUERY)
  const [open, setOpen] = useState(null)
  const [vs, setVs] = useState(null)
  const { copied, share } = useShare()
  // a `t=` deep link lands on its row once the board has rendered it
  const landOn = useRef(null)
  const booted = useRef(false)
  // the prerendered title, for the bare address
  const rootTitle = useRef(null)

  // URL state after mount, never during render: the prerender has no window
  useEffect(() => {
    const s = parseLocation(relPath(window.location.pathname), window.location.search)
    setQuery(s.query)
    setOpen(s.open)
    setVs(s.vs)
    landOn.current = s.open
    rootTitle.current = document.title
    booted.current = true
    track('query', { words: queryWords(s.query) })
  }, [])

  const board = useMemo(() => evaluate(L, query), [query])
  const row = useMemo(() => (open ? [...board.ranked, ...board.onTheWay].find((r) => r.key === open) ?? null : null), [board, open])
  const peer = useMemo(() => (row ? peerOf(board, row, vs) : null), [board, row, vs])

  useEffect(() => {
    if (!landOn.current || !row) return
    landOn.current = null
    const el = document.getElementById(rowId(row.key))
    if (el) requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - BACK_BAR }))
  }, [row])

  // the tab says what the share worker would: the open comparison, a landing's own title, the sentence; the page's own title at the bare address
  useEffect(() => {
    if (!booted.current) return
    const l = landingFor(query)
    document.title = row ? shareTitle(query, row, peer) : l ? `${l.title} · WNBA Comparator` : toUrl({ query, open: null }) ? shareTitle(query) : rootTitle.current
  }, [query, row, peer, vs])

  // `track: false` is the typed number's keystrokes: the board and URL follow every one, the `query` event waits for blur
  const change = (q, { track: tracked = true } = {}) => {
    const next = normalize(q)
    // a position change that drops the open player out of the field closes her
    const drops = row != null && next.pos !== 'ALL' && row.player.pos !== next.pos
    setQuery(next)
    if (drops) { setOpen(null); setVs(null) }
    writeUrl(toAddress({ query: next, open: drops ? null : open, vs: drops ? null : vs }), 'replace')
    if (tracked) track('query', { words: queryWords(next) })
  }
  const openRow = (key) => {
    const next = open === key ? null : key
    setOpen(next)
    setVs(null)
    writeUrl(toAddress({ query, open: next }), 'replace')
    if (next) track('open', { player: next })
  }
  // the finder: open her row and land on it, wherever it is on the board; a player-season board opens her latest season
  const findPlayer = (p) => {
    const key = query.seq === 'teamGames' ? [...board.ranked, ...board.onTheWay].filter((r) => r.player.id === p.id).sort((a, b) => b.season - a.season)[0]?.key ?? null : p.id
    if (!key) return
    landOn.current = key
    setOpen(key)
    setVs(null)
    writeUrl(toAddress({ query, open: key }), 'replace')
    track('open', { player: key, from: 'finder' })
  }
  // the peer the panel reads against, in the URL so a shared link opens the same comparison
  const setPeer = (key) => {
    setVs(key)
    writeUrl(toAddress({ query, open, vs: key }), 'replace')
    track('peer', { player: open, vs: key })
  }
  const onShare = () => {
    share(shareText(query, board, row), window.location.href)
    track('share', { words: queryWords(query), player: open, vs: peer?.key ?? null })
  }

  const landing = landingFor(query)

  return (
    <main>
      <div className="dateline">
        <span>{`drewhoover.com · ${L.firstSeason}–${L.currentSeason}`}<span className="dateline-upd"> · updated {String(L.builtAt).slice(0, 10)}</span></span>
        <span className="dateline-acts">
          <PlayerFinder current={row?.player.id ?? null} onPick={findPlayer} />
          <a className="ico" href={KOFI_URL} onClick={() => track('kofi', { from: 'icons board' })} aria-label="Buy me a coffee"><CoffeeIcon /></a>
          <button className="ico" onClick={onShare} aria-label="Share this board"><ShareIcon /></button>
          {copied && <span className="toast">copied</span>}
        </span>
      </div>
      {landing ? <><p className="kicker"><a href={BASE}>WNBA Comparator</a></p><h1 className="h1-q">{landing.h1}</h1></> : <h1>WNBA Comparator</h1>}
      <Sentence query={query} ledger={L} onChange={change} />
      <p className="baserate">
        <span className="sr-only">{queryWords(query)}. </span>
        Same point in the career, every {query.seq === 'teamGames' ? 'season' : 'career'} since {query.since ?? L.firstSeason}.
        {board.ranked[0] && board.ranked[0].value != null && <> The leader: <b>{board.ranked[0].player.name}</b>, {board.ranked[0].value.toLocaleString('en-US')}.</>}
      </p>
      <Board board={board} query={query} open={open} onOpen={openRow} panel={row && <Panel key={row.key} row={row} board={board} query={query} peerKey={vs} onPeer={setPeer} onClose={() => openRow(row.key)} />} />
      <Landings current={landing?.slug ?? null} />
      <Notes ledger={L} />
      <footer>
        <a href="https://drewhoover.com/">drewhoover.com</a> · data rebuilt daily in season ·{' '}
        <a href="https://github.com/DrewHoo/wnba-comparator">source & receipts</a> ·{' '}
        <a href={KOFI_URL} onClick={() => track('kofi', { from: 'footer' })}>buy me a coffee</a>
      </footer>
    </main>
  )
}
