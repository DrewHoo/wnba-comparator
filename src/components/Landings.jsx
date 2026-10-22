// The named definition pages (landing.ts), listed under the board as real
// links, so a crawler reaches every one from the root and a reader finds the
// question she came with. A tap is a full navigation to the prerendered page.
// The last link is the team pages' index (groups.ts).
import { LANDINGS } from '../lib/landing.ts'

const BASE = import.meta.env.BASE_URL

export function Landings({ current }) {
  return (
    <nav className="landings" aria-label="Questions">
      <h2>Questions</h2>
      <ul>
        {LANDINGS.map((l) => (
          <li key={l.slug}>
            {current === l.slug ? <span aria-current="page">{l.h1}</span> : <a href={`${BASE}${l.slug}/`}>{l.h1}</a>}
          </li>
        ))}
        <li><a href={`${BASE}team/`}>Every WNBA team's best players by position</a></li>
      </ul>
    </nav>
  )
}
