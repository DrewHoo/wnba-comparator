import { useEffect, useMemo, useRef, useState } from 'react'
import { Sentence } from './components/Sentence.jsx'
import { Board, rowId } from './components/Board.jsx'
import { Panel } from './components/Panel.jsx'
import { Notes } from './components/Notes.jsx'
import { PlayerFinder } from './components/PlayerFinder.jsx'
import { ShareIcon } from './components/Icons.jsx'
import { useShare } from './hooks/useShare.ts'
import { decodeLedger } from './lib/ledger.ts'
import { evaluate, normalize, DEFAULT_QUERY } from './lib/query.ts'
import { parseUrl, toUrl } from './lib/url.ts'
import { queryWords } from './lib/words.ts'
import { claimWords, peerOf, shareTitle } from './lib/share.ts'
import { track } from './lib/analytics.ts'
import { writeUrl } from './urlState.js'
import file from './data/players.json'

// the whole ledger ships with the page (2MB gzipped): one file, every player
const L = decodeLedger(file)

/** the open row's top, clear of the index site's sticky back bar */
const BACK_BAR = 64

export default function App() {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [open, setOpen] = useState(null)
  const [vs, setVs] = useState(null)
  const { copied, share } = useShare()
  // a `t=` deep link lands on its row once the board has rendered it
  const landOn = useRef(null)

  // URL state after mount, never during render: the prerender has no window
  useEffect(() => {
    const s = parseUrl(window.location.search)
    setQuery(s.query)
    setOpen(s.open)
    setVs(s.vs)
    landOn.current = s.open
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

  // the tab says what the share worker would: the sentence, or the open comparison
  useEffect(() => { document.title = shareTitle(query, row, peer) }, [query, row, peer])

  const change = (q) => {
    const next = normalize(q)
    // a position change that drops the open player out of the field closes her
    const drops = row != null && next.pos !== 'ALL' && row.player.pos !== next.pos
    setQuery(next)
    if (drops) { setOpen(null); setVs(null) }
    writeUrl(toUrl({ query: next, open: drops ? null : open, vs: drops ? null : vs }), 'replace')
    track('query', { words: queryWords(next) })
  }
  const openRow = (key) => {
    const next = open === key ? null : key
    setOpen(next)
    setVs(null)
    writeUrl(toUrl({ query, open: next }), 'replace')
    if (next) track('open', { player: next })
  }
  // the finder: open her row and land on it, wherever it is on the board; a player-season board opens her latest season
  const findPlayer = (p) => {
    const key = query.seq === 'teamGames' ? [...board.ranked, ...board.onTheWay].filter((r) => r.player.id === p.id).sort((a, b) => b.season - a.season)[0]?.key ?? null : p.id
    if (!key) return
    landOn.current = key
    setOpen(key)
    setVs(null)
    writeUrl(toUrl({ query, open: key }), 'replace')
    track('open', { player: key, from: 'finder' })
  }
  // the peer the panel reads against, in the URL so a shared link opens the same comparison
  const setPeer = (key) => {
    setVs(key)
    writeUrl(toUrl({ query, open, vs: key }), 'replace')
    track('peer', { player: open, vs: key })
  }
  const onShare = () => {
    const text = row ? claimWords(row, query, board, L.firstSeason) : shareTitle(query)
    share(text, window.location.href)
    track('share', { words: queryWords(query), player: open, vs: peer?.key ?? null })
  }

  return (
    <main>
      <div className="dateline">
        <span>{`drewhoover.com · ${L.firstSeason}–${L.currentSeason}`}<span className="dateline-upd"> · updated {String(L.builtAt).slice(0, 10)}</span></span>
        <span className="dateline-acts">
          <PlayerFinder current={row?.player.id ?? null} onPick={findPlayer} />
          <button className="ico" onClick={onShare} aria-label="Share this board"><ShareIcon /></button>
          {copied && <span className="toast">copied</span>}
        </span>
      </div>
      <h1>WNBA Comparator</h1>
      <Sentence query={query} ledger={L} onChange={change} />
      <p className="baserate">
        <span className="sr-only">{queryWords(query)}. </span>
        Same point in the career, every {query.seq === 'teamGames' ? 'season' : 'career'} since {query.since ?? L.firstSeason}.
        {board.ranked[0] && board.ranked[0].value != null && <> The leader: <b>{board.ranked[0].player.name}</b>, {board.ranked[0].value.toLocaleString('en-US')}.</>}
      </p>
      <Board board={board} query={query} open={open} onOpen={openRow} panel={row && <Panel key={row.key} row={row} board={board} query={query} peerKey={vs} onPeer={setPeer} onClose={() => openRow(row.key)} />} />
      <Notes ledger={L} />
    </main>
  )
}
