// What to read next, the citing ask and Ko-fi, and the Method notes: where
// the games come from and the rulings the words rest on.
import { track } from '../lib/analytics.ts'
import { OTHERS } from '../../scripts/lib/siblings.mjs'

export const KOFI_URL = 'https://ko-fi.com/drewhooverdotcom'

export function Notes({ ledger }) {
  return (
    <>
      <h2 className="notes-h">What to read next</h2>
      <div className="notes">
        {OTHERS.map((s) => (
          <p key={s.slug}>
            <a href={s.url}>{s.name}</a>{s.links ? ': ' : ' — '}{s.words}.{s.links?.map((l, i) => <span key={l.url}>{i ? ' | ' : ' '}<a href={l.url}>{l.name}</a></span>)}
          </p>
        ))}
      </div>

      <h2 className="notes-h">Using a comparison from here</h2>
      <div className="notes">
        <p>
          If a comparison from this page ends up in your article, broadcast, podcast or thread, please cite it: name
          the site and link to the board; the url encodes the comparison.
        </p>
        <p>
          The site is free and serves no ads. If you enjoyed using it, consider{' '}
          <a href={KOFI_URL} onClick={() => track('kofi', { from: 'notes' })}>buying me some server compute</a> or
          donating to The Internet Archive's <a href="https://archive.org/donate">Wayback Machine</a> (I am a monthly
          donor, FTR).
        </p>
      </div>

      <section className="notes" id="method" aria-label="Method">
        <h2>Method</h2>
        <p>
          Every row is a player's games in order, with the box-score line and the result, from the WNBA Stats player
          game logs that <a href="https://github.com/sportsdataverse/wehoop-wnba-stats-data">wehoop</a> (sportsdataverse)
          publishes, CC BY 4.0, {ledger.firstSeason} to {ledger.currentSeason}, every game of every season, rebuilt from
          the files of {String(ledger.builtAt).slice(0, 10)}. The league's first season is {ledger.firstSeason}, so a
          claim here holds for the whole league. The sections below say where the games come from, what the box score
          records and since when, what the words mean, and why the old names sit where they do.
        </p>

        <details>
          <summary>Where the games come from</summary>
          <p>
            The WNBA Stats player game logs have every game of every season, {ledger.firstSeason} on. The games the logs
            don't have yet (the running season's tail, when the Stats pipeline is behind) are filled from wehoop's ESPN
            box scores, joined to the logs by player and date through wehoop's player crosswalk.
          </p>
          <p>
            A <b>position</b> is ESPN's where ESPN has one, else the one the WNBA's own rosters list (wehoop publishes
            those too, {ledger.firstSeason} on), else one researched from the player's archived wnba.com player file or
            her Wikipedia article, each with the line that says it (the receipts are in the repo). Combo positions fold to
            the first letter, so a G-F is a guard, and every player in the ledger has one. "Players" is everyone. Birth
            dates are ESPN's, through wehoop's player crosswalk.
          </p>
        </details>

        <details>
          <summary>What the box score records, and since when</summary>
          <p>
            The logs carry the full box-score line from {ledger.firstSeason}: points, rebounds, assists, steals, blocks,
            turnovers, fouls, minutes, and the shooting splits. A <b>start</b> is the ESPN box score's starter flag,
            joined to the log by player and date, and ESPN's box scores begin in {ledger.startsSince}: a career that
            began before then sits out the starts fields, as does one with a game inside its window that has no box score
            (a few in 2003 to 2008, one or two in 2010, 2012 and 2016), and the board says how many sat out.
          </p>
        </details>

        <details>
          <summary>What the words mean</summary>
          <p>
            A <b>game</b> is one the player appeared in; the logs have no row for a player who didn't play. A <b>win</b> is
            the result of a game in the sequence. "Team games of a season" count the team's schedule, so a player who sat
            one has a gap the window still counts. The All-Star game and the Commissioner's Cup final are not in the logs;
            the Cup's regular-season games are. The regular season is the default; the word beside it switches the
            playoffs in. A clean line ("no turnovers", "no fouls") counts only in a game the player was on the floor for
            ten minutes or more, so a two-minute cameo can't build a streak of them; every other test reads the box score
            as it is.
          </p>
          <p>
            Ranks are competition ranks, ties included. "Still inside the window" lists the players who haven't played the
            whole window yet, with their total so far. The panel reads a row against a peer: where their curves met, and
            what the player needs over the next five games to match the peer there; the peer rides in the url, so a shared
            link opens the same comparison. On a "fastest to" board the small text under the number is the player's
            age at the game she got there, where her birth date is known.
          </p>
        </details>

        <details>
          <summary>Why the old names sit where they do, and the eras</summary>
          <p>
            A career window favors the league's first seasons. The founding stars arrived as finished pros (Cynthia
            Cooper played her first WNBA game at 34, with a decade in Europe behind her), the first seasons were 28 to 32
            games against 40 and 44 now, and eight teams held all the talent. So "fastest to 1,000 points" reads Cooper
            first, and the modern names on these boards are the ones who were great from game one. The board shows a
            player's age where her birth date is known. The bios that carry it begin with the 2003 box scores, so many
            of the founding players have none, Cooper among them.
          </p>
          <p>
            The era word in the sentence is how to ask the fair question. Its cuts are the league's own: {ledger.startsSince},
            the first season with an ESPN box score for every game, so the starts fields begin there; 2006, four
            10-minute quarters in place of two 20-minute halves and the 24-second shot clock in place of the 30; 2013,
            the three-point line moved out to the FIBA distance and the defensive three-second rule; 2020, the new
            collective bargaining agreement and the 22-game bubble season in Bradenton; 2024, charter flights for every
            team and the draft class that brought the league its record crowds.
          </p>
        </details>

        <p>
          A sibling of <a href="https://drewhoover.com/nfl-comparator/">NFL Comparator</a>, <a href="https://drewhoover.com/nhl-comparator/">NHL Comparator</a>, <a href="https://drewhoover.com/nba-comparator/">NBA Comparator</a> and{' '}
          <a href="https://drewhoover.com/cfb-streak-king/">College Football Streak King</a>.
        </p>
      </section>
    </>
  )
}
