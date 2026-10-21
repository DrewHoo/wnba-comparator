// The open player: the claim the row makes, a peer to read it against (the
// leader by default), where their curves crossed, what the subject needs
// over the next games to match the peer, and the window's games.
import { useMemo, useState } from 'react'
import { Picker } from './Picker.jsx'
import { CloseIcon } from './Icons.jsx'
import { crossings, curve, holds, toMatch } from '../lib/query.ts'
import { statByKey, countWords } from '../lib/stats.ts'
import { rowName, rowWords, rankWords, seqWords, testsWords } from '../lib/words.ts'
import { fmtDate } from '../lib/ledger.ts'

const K = 5

function Chart({ me, them, n, names }) {
  const len = Math.max(me.length, them.length, n)
  const top = Math.max(1, ...me.slice(0, len), ...them.slice(0, len))
  const W = 560, H = 200, L = 36, R = 12, T = 12, B = 22
  const x = (i) => L + ((i) / Math.max(1, len - 1)) * (W - L - R)
  const y = (v) => T + (1 - v / top) * (H - T - B)
  const path = (c) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const ticks = [0, Math.round(top / 2), top]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${names[0]} and ${names[1]}, cumulative by game`}>
      <line className="axis" x1={L} y1={y(0)} x2={W - R} y2={y(0)} />
      {ticks.map((t) => <text key={t} className="tick" x={L - 6} y={y(t) + 3} textAnchor="end">{t.toLocaleString('en-US')}</text>)}
      <text className="tick" x={x(0)} y={H - 6} textAnchor="start">1</text>
      <text className="tick" x={x(len - 1)} y={H - 6} textAnchor="end">{len}</text>
      {n <= len && <line className="win" x1={x(n - 1)} y1={T} x2={x(n - 1)} y2={y(0)} />}
      <path className="them" d={path(them)} />
      <path className="me" d={path(me)} />
      <text className="lab me" x={x(Math.min(me.length, len) - 1)} y={y(me[Math.min(me.length, len) - 1] ?? 0) - 5} textAnchor="end">{names[0]}</text>
      <text className="lab" x={x(Math.min(them.length, len) - 1)} y={y(them[Math.min(them.length, len) - 1] ?? 0) + 12} textAnchor="end">{names[1]}</text>
    </svg>
  )
}

function Ledger({ r, q }) {
  const [all, setAll] = useState(false)
  const stat = statByKey(q.stat)
  const isTest = q.how === 'count' || q.how === 'every' || q.how === 'streak'
  const games = [...r.games].reverse()
  const shown = all ? games : games.slice(0, 10)
    return (
    <div className="ledger">
      <div className="xrow xhead"><span>#</span><span>date</span><span>game</span><span>{isTest ? testsWords(q.tests) : stat.noun}</span></div>
      {shown.map((g, i) => {
        const idx = games.length - i
        const res = g.result === 2 ? 'W' : g.result === 0 ? 'L' : 'T'
        return (
          <div key={g.date} className="xrow">
            <span className="xn">{q.seq === 'teamGames' ? g.tgn : idx}</span>
            <span className="xd">{fmtDate(g.date)}</span>
            <span className="xg"><span className={res === 'W' ? 'w' : 'l'}>{res}</span> {g.team} {g.home ? 'v' : '@'} {g.opp}{g.post ? ' · playoff' : ''}{g.started === false && q.seq !== 'starts' ? ' · off the bench' : ''}</span>
            <span className={'xv' + (isTest ? (holds(g, q.tests) ? ' yes' : ' no') : '')}>{isTest ? (holds(g, q.tests) ? '✓' : '✗') + ' ' + q.tests.map((t) => statByKey(t.stat).read(g)).join(' / ') : stat.read(g)}</span>
          </div>
        )
      })}
      {games.length > shown.length && <button className="morebtn" onClick={() => setAll(true)}>all {games.length} games</button>}
    </div>
  )
}

export function Panel({ row, board, query, onClose, onOpen }) {
  const q = query
  const field = board.ranked.length
  const career = q.seq !== 'teamGames'
  const others = useMemo(() => [...board.ranked, ...board.onTheWay].filter((r) => r.key !== row.key).slice(0, 40), [board, row.key])
  const [peerKey, setPeerKey] = useState(null)
  const peer = others.find((r) => r.key === peerKey) ?? others[0] ?? null
  const curves = useMemo(() => {
    if (!career || !peer || q.how === 'every' || q.how === 'count' || q.how === 'streak') return null
    const cq = q.how === 'reach' ? { ...q, how: 'sum' } : q
    return { me: curve(row.player, cq), them: curve(peer.player, cq) }
  }, [career, peer, q, row.player])
  const xs = curves ? crossings(curves.me, curves.them).filter((c) => c.n <= Math.max(q.n, curves.me.length)).slice(-6).reverse() : []
  const match = curves && q.how === 'sum' ? toMatch(curves.me.slice(0, Math.max(row.reached, Math.min(curves.me.length, q.n))), curves.them, K) : null
  const stat = statByKey(q.stat)
  const age = row.player.born ? ` · born ${row.player.born.slice(0, 4)}` : ''

  return (
    <section className="panel" aria-label={`${row.player.name}'s comparison`}>
      <div className="panel-head">
        <div className="panel-id">
          <span className="panel-name">{rowName(row)}</span>
          <span className="panel-meta" title={row.player.posSrc ? `position from ${{ espn: 'ESPN', roster: 'the WNBA roster', research: 'research (see the method)' }[row.player.posSrc]}` : undefined}>{row.player.pos ?? 'position unlisted'} · {row.player.games[0].season}–{row.player.games[row.player.games.length - 1].season}{age}</span>
        </div>
        <button className="ico panel-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>
      <p className="claim">
        <b>{row.player.name}</b> {row.value == null ? 'has' : 'has'} {rowWords(row, q)}{row.complete && row.value != null ? <>, <b>{rankWords(row, field)}</b> {q.seq === 'teamGames' ? 'player-seasons' : 'careers'}{q.since ? ` since ${q.since}` : ` since ${board.since}`}.</> : row.value == null ? '.' : <>, still inside the window.</>}
      </p>
      {peer && (
        <div className="peer">
          <span>against</span>
          <Picker value={peer.key} options={others.map((r) => ({ value: r.key, label: rowName(r), hint: r.value == null ? '' : String(r.value) }))} onChange={setPeerKey} ariaLabel="The peer" />
          <span>{peer.value == null ? '' : `(${rowWords(peer, q)})`}</span>
        </div>
      )}
      {curves && xs.length > 0 && (
        <ul className="xings">
          {xs.map((c) => (
            <li key={c.n}><span className="n">{seqWords(q.seq, 1)} {c.n}</span>{c.kind} <b>{peer.player.name}</b> at {countWords(c.value, stat)}</li>
          ))}
        </ul>
      )}
      {curves && xs.length === 0 && <p className="track">Their curves never met{curves.me.length < 2 ? '' : ` in ${Math.min(curves.me.length, curves.them.length)} ${seqWords(q.seq, 2)}`}.</p>}
      {match && (
        <p className="track">
          To match {peer.player.name}'s {countWords(curves.them[match.at - 1], stat)} at {seqWords(q.seq, 1)} {match.at}, {row.player.name} needs <b>{countWords(Math.max(0, match.need), stat)}</b> over her next {K} {seqWords(q.seq, K)}{match.need <= 0 ? ' (she is already past it)' : ''}.
        </p>
      )}
      {curves && <Chart me={curves.me} them={curves.them} n={q.how === 'reach' ? Math.max(row.value ?? 0, peer.value ?? 0) : q.n} names={[row.player.name, peer.player.name]} />}
      <Ledger r={row} q={q} />
    </section>
  )
}
