// A team page: the best players of one position in one franchise's history
// (src/lib/groups.ts), ranked by the position's first metric, with one
// cumulative line per player for each of the first three metrics and the
// table of every qualifying player. The data is computed by the prerender
// and embedded in the page (#group-data), so the client needs no ledger.
// CFB Comparator's group page, by franchise.
import { useEffect, useState } from 'react'
import { CoffeeIcon, ShareIcon } from './Icons.jsx'
import { PlayerFinder } from './PlayerFinder.jsx'
import { KOFI_URL } from './Notes.jsx'
import { useShare } from '../hooks/useShare.ts'
import { track } from '../lib/analytics.ts'
import { statByKey } from '../lib/stats.ts'
import { POS_WORDS } from '../lib/words.ts'
import { groupH1, groupLead, groupTitle, groupPath, wasWords, CURVES, MIN_GAMES, GROUP_POS } from '../lib/groups.ts'
import { SITE } from '../lib/share.ts'

const BASE = import.meta.env.BASE_URL
const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'))
const span = (a, b) => (a === b ? String(a) : `${a}–${b}`)
const short = (name) => { const parts = name.split(' '); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name }

/** one cumulative line per player, the leader in cream, the rest faint; a hover lifts a line */
function Curves({ rows, m, stat }) {
  const lines = rows.filter((r) => r.curves?.[m]).slice(0, CURVES)
  if (!lines.length) return null
  const len = Math.max(...lines.map((r) => r.curves[m].length))
  const top = Math.max(1, ...lines.map((r) => r.curves[m][r.curves[m].length - 1]))
  const W = 560, H = 220, L = 42, R = 110, T = 12, B = 24
  const x = (i) => L + (i / Math.max(1, len - 1)) * (W - L - R)
  const y = (v) => T + (1 - v / top) * (H - T - B)
  const path = (c) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const ticks = [0, Math.round(top / 2), top]
  // the names in a column at the right edge, in the order the lines end, nudged apart
  const ends = lines.map((r, k) => ({ k, y: y(r.curves[m][r.curves[m].length - 1]) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11
  // then back up from the floor, so a name pushed past it doesn't land on the one above
  for (let i = ends.length - 1; i >= 0; i--) { const limit = i === ends.length - 1 ? H - B : ends[i + 1].y - 11; if (ends[i].y > limit) ends[i].y = limit }
  const labelY = new Map(ends.map((e) => [e.k, e.y]))
  return (
    <figure className="gchart">
      <figcaption>{stat.noun} · by game</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${stat.noun}, cumulative by game, ${lines.map((r) => r.name).join(', ')}`}>
        <line className="axis" x1={L} y1={y(0)} x2={W - R} y2={y(0)} />
        {ticks.map((t) => <text key={t} className="tick" x={L - 6} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>)}
        <text className="tick" x={x(0)} y={H - 6} textAnchor="start">1</text>
        <text className="tick" x={x(len - 1)} y={H - 6} textAnchor="end">{len}</text>
        {lines.map((r, k) => (
          <g key={r.id} className={'gl' + (k === 0 ? ' lead' : '')}>
            <path d={path(r.curves[m])} />
            <line className="lead-line" x1={x(r.curves[m].length - 1)} y1={y(r.curves[m][r.curves[m].length - 1])} x2={W - R + 4} y2={labelY.get(k)} />
            <text x={W - R + 7} y={labelY.get(k) + 3}>{short(r.name)}</text>
          </g>
        )).reverse()}
      </svg>
    </figure>
  )
}

function Dateline({ from, share, copied }) {
  return (
    <div className="dateline">
      <span><a href={BASE}>← the board</a> · drewhoover.com</span>
      <span className="dateline-acts">
        <PlayerFinder />
        <a className="ico" href={KOFI_URL} onClick={() => track('kofi', { from })} aria-label="Buy me a coffee"><CoffeeIcon /></a>
        {share && <button className="ico" onClick={share} aria-label="Share this page"><ShareIcon /></button>}
        {copied && <span className="toast">copied</span>}
      </span>
    </div>
  )
}

/** `pages` is the set of player ids with a page: a name links there, else to her row on the board */
export function GroupPage({ id, pos, preload }) {
  const [data] = useState(preload?.data ?? null)
  const pages = new Set(preload?.pages ?? [])
  const { copied, share: send } = useShare()
  useEffect(() => { track('team page', { team: id, pos }) }, [id, pos])
  useEffect(() => { if (data) document.title = groupTitle(data, SITE) }, [data])
  const share = () => {
    send(data ? groupLead(data) || groupH1(data) : window.location.href, window.location.href)
    track('share team', { team: id, pos })
  }
  if (!data) return <main><h1>No page here</h1><p className="baserate">No page for {POS_WORDS[pos] ?? pos} of <code>{id}</code>.</p></main>
  const metrics = data.metrics.map((k) => statByKey(k))
  const was = wasWords(data)
  const others = GROUP_POS.filter((p) => p !== data.pos)
  return (
    <main>
      <Dateline from="icons team" share={share} copied={copied} />
      <p className="kicker"><a href={BASE}>WNBA Comparator</a> · <a href={`${BASE}team/`}>every team</a></p>
      <h1 className="h1-q">{groupH1(data)}</h1>
      <p className="baserate">
        {groupLead(data)} Every {POS_WORDS[data.pos].replace(/s$/, '')} with {MIN_GAMES} or more regular-season games for the franchise{was ? ` (${was})` : ''}, {span(data.from, data.to)}, ranked by {metrics[0].noun}.
        The lines are each player's totals game by game, the top {Math.min(CURVES, data.rows.length)} drawn.
      </p>
      <div className="gcharts">
        {metrics.slice(0, 3).map((s, m) => <Curves key={s.key} rows={data.rows} m={m} stat={s} />)}
      </div>
      <section className="board" aria-label="The ranking">
        <div className="board-h"><span>{data.rows.length} {POS_WORDS[data.pos]} with {MIN_GAMES}+ games</span><span>{metrics[0].noun}</span></div>
        <div className="gscroll"><table className="gtable">
          <thead><tr><th>#</th><th>player</th><th>seasons</th><th className="num">games</th>{metrics.map((s) => <th key={s.key} className="num">{s.noun}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={r.id}>
                <td className="xn">{i + 1}</td>
                <td className="gname"><a href={pages.has(r.id) ? `${BASE}player/${encodeURIComponent(r.id)}/` : `${BASE}?t=${encodeURIComponent(r.id)}`}>{r.name}</a></td>
                <td className="xd">{span(r.from, r.to)}</td>
                <td className="num xd">{r.games}</td>
                {r.totals.map((v, m) => <td key={m} className={'num' + (m === 0 ? ' lead' : '')}>{fmt(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      <p className="notes" style={{ marginTop: 24 }}>
        Also for the {data.name.replace(/ \(.*\)$/, '')}: {others.map((p, i) => <span key={p}>{i > 0 && ', '}<a href={`${BASE}${groupPath(data.id, p).slice(1)}`}>{POS_WORDS[p]}</a></span>)}. <a href={`${BASE}team/`}>Every team</a>.
        The games are the WNBA Stats logs, regular season only; a position is ESPN's, else the WNBA roster's, else researched (the <a href={`${BASE}#method`}>Method</a> says how).
      </p>
      <footer>
        <a href="https://drewhoover.com/">drewhoover.com</a> ·{' '}
        <a href="https://github.com/DrewHoo/wnba-comparator">source & receipts</a> ·{' '}
        <a href={KOFI_URL} onClick={() => track('kofi', { from: 'footer team' })}>buy me a coffee</a>
      </footer>
    </main>
  )
}

/** the index of every team page: the franchises, current then folded, with a link per position */
export function GroupIndex({ preload }) {
  const items = preload?.items ?? []
  const row = (it) => <li key={it.id}><b>{it.name}</b> {it.pos.map((p) => <a key={p} href={`${BASE}${groupPath(it.id, p).slice(1)}`}>{POS_WORDS[p]}</a>)}</li>
  return (
    <main>
      <Dateline from="icons team index" />
      <p className="kicker"><a href={BASE}>WNBA Comparator</a></p>
      <h1 className="h1-q">Every WNBA team's best players by position</h1>
      <p className="baserate">The best guards, forwards and centers in every franchise's history, its earlier cities included, each with the players' numbers drawn game by game.</p>
      <ul className="gindex">{items.filter((it) => it.active).map(row)}</ul>
      <h2 className="notes-h">The teams that folded</h2>
      <ul className="gindex">{items.filter((it) => !it.active).map(row)}</ul>
      <footer>
        <a href="https://drewhoover.com/">drewhoover.com</a> ·{' '}
        <a href="https://github.com/DrewHoo/wnba-comparator">source & receipts</a> ·{' '}
        <a href={KOFI_URL} onClick={() => track('kofi', { from: 'footer team index' })}>buy me a coffee</a>
      </footer>
    </main>
  )
}
