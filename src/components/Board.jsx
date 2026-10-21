// The board: every entity with the whole window, ranked, then the ones still
// inside it. One dense row each; a tap opens the panel. Long lists page.
import { useState } from 'react'
import { rowName, seqWords, testsWords } from '../lib/words.ts'
import { statByKey } from '../lib/stats.ts'

const PAGE = 25

function ValueCell({ r, q }) {
  if (r.value == null) return <span className="bval soft">—<small>{r.reached} {seqWords(q.seq, r.reached)}</small></span>
  const n = q.how === 'reach' ? r.value : r.value
  return (
    <span className={'bval' + (r.complete ? '' : ' otl')}>
      {n.toLocaleString('en-US')}
      <small>{q.how === 'reach' ? seqWords(q.seq, n) : r.complete ? (q.how === 'every' ? `of ${q.n}` : '') : `thru ${r.reached}`}</small>
    </span>
  )
}

function Rows({ rows, q, open, onOpen, start = 0 }) {
  return rows.map((r, i) => (
    <button key={r.key} className={'brow' + (open === r.key ? ' hi' : '')} onClick={() => onOpen(r.key)} aria-pressed={open === r.key}>
      <span className={'brank' + (r.rank === 1 ? ' one' : '')}>{r.complete ? `${r.tied ? 'T' : ''}${r.rank}` : start + i + 1}</span>
      <span className="bname">
        <b>{rowName(r)}</b>
        <small>{r.season != null ? `${r.team} · ${r.reached} of ${q.n} games` : r.from === r.to ? r.from : `${r.from}–${r.to}`}{r.player.born && r.season == null ? '' : ''}</small>
      </span>
      <ValueCell r={r} q={q} />
    </button>
  ))
}

export function Board({ board, query, open, onOpen }) {
  const [shown, setShown] = useState(PAGE)
  const [shownWay, setShownWay] = useState(6)
  const q = query
  const stat = statByKey(q.stat)
  const ranked = board.ranked
  const way = board.onTheWay
  const unit = q.seq === 'teamGames' ? 'player-seasons' : 'careers'
  return (
    <section className="board" aria-label="The board">
      <div className="board-h">
        <span>{ranked.length.toLocaleString('en-US')} {unit} with the whole window</span>
        <span>{q.how === 'reach' ? seqWords(q.seq, 2) : q.how === 'sum' ? stat.noun : q.how === 'streak' ? `straight games of ${testsWords(q.tests)}` : `games of ${testsWords(q.tests)}`}</span>
      </div>
      {board.gapped > 0 && <p className="gapped">{board.gapped} {board.gapped === 1 ? 'career sits' : 'careers sit'} out: starts are flagged from {board.startsSince} on, and a game without the flag falls inside the window.</p>}
      {ranked.length === 0 && <p className="empty">Nobody has {q.how === 'reach' ? 'got there' : 'the whole window'} yet. Shorten it.</p>}
      <Rows rows={ranked.slice(0, shown)} q={q} open={open} onOpen={onOpen} />
      {ranked.length > shown && <button className="morebtn" onClick={() => setShown(shown + PAGE * 2)}>see more · {ranked.length - shown} below</button>}
      {way.length > 0 && (
        <>
          <div className="board-h" style={{ marginTop: 18 }}>
            <span>{way.length.toLocaleString('en-US')} still inside the window</span>
            <span>so far</span>
          </div>
          <Rows rows={way.slice(0, shownWay)} q={q} open={open} onOpen={onOpen} />
          {way.length > shownWay && <button className="morebtn" onClick={() => setShownWay(shownWay + PAGE)}>see more · {way.length - shownWay} below</button>}
        </>
      )}
    </section>
  )
}
