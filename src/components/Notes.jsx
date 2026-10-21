// Method notes: where the games come from and the rulings the words rest on.
export function Notes({ ledger }) {
  return (
    <section className="notes" aria-label="Method">
      <h2>Method</h2>
      <p>
        Every row is a player's games in order, with the box-score line and the result, from the WNBA Stats player game
        logs that <a href="https://github.com/sportsdataverse/wehoop-wnba-stats-data">wehoop</a> (sportsdataverse)
        publishes, CC BY 4.0, {ledger.firstSeason} to {ledger.currentSeason}, every game of every season, with the games
        the logs don't have yet filled from wehoop's ESPN box scores, rebuilt from the files of{' '}
        {String(ledger.builtAt).slice(0, 10)}. The league's first season is {ledger.firstSeason}, so a claim here holds
        for the whole league.
      </p>
      <p>
        A <b>game</b> is one the player appeared in; the logs have no row for a player who didn't play. A <b>start</b> is
        the ESPN box score's starter flag, joined to the log by player and date, and ESPN's box scores begin in{' '}
        {ledger.startsSince}: a career that began before then sits out the starts fields, as does one with a game
        inside its window that has no box score (a few in 2003 to 2008, one or two in 2010, 2012 and 2016), and the
        board says how many sat out. A <b>win</b> is the result of a game in the sequence. "Team games of a season"
        count the team's schedule, so a player who sat one has a gap the window still counts. The All-Star game and
        the Commissioner's Cup final are not in the logs; the Cup's regular-season games are. The regular season is the
        default; the word beside it switches the playoffs in. A clean line ("no turnovers", "no fouls") counts only in
        a game the player was on the floor for ten minutes or more, so a two-minute cameo can't build a streak of them;
        every other test reads the box score as it is.
      </p>
      <p>
        A <b>position</b> is ESPN's where ESPN has one, else the one the WNBA's own rosters list (wehoop publishes those
        too, 1997 on), else one researched from the player's archived wnba.com player file or her Wikipedia article,
        each with the line that says it (the receipts are in the repo). Combo positions fold to the first letter, so a
        G-F is a guard, and every player in the ledger has one. "Players" is everyone. Birth dates are ESPN's, through wehoop's player crosswalk.
      </p>
      <p>
        Ranks are competition ranks, ties included. "Still inside the window" lists the players who haven't played the
        whole window yet, with their total so far. The panel reads a row against a peer: where their curves met, and
        what the player needs over the next five games to match the peer there.
      </p>
      <p>
        A sibling of <a href="https://drewhoover.com/nfl-comparator/">NFL Comparator</a> and{' '}
        <a href="https://drewhoover.com/cfb-streak-king/">College Football Streak King</a>.
      </p>
    </section>
  )
}
