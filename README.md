# WNBA Comparator

Compare WNBA players at the same point in their careers. Set the sentence (who · did what · how much · over which games · against whom) and the board ranks every career, or every player-season, by its value at that window: points through the first 100 games, assists through a team's first 40 games of a season, the fewest games to 1,000 points, 30-point games in a season's first 20. Open a row to read it against a peer: where their curves met, and what the player needs over the next five games to match.

The data is the WNBA Stats player game logs that [wehoop](https://github.com/sportsdataverse/wehoop-wnba-stats-data) (sportsdataverse) publishes, CC BY 4.0, every game since the league's first season in 1997, with the starter flag, positions and birth dates from wehoop's ESPN box scores and bios (2003 on). The planning spec and the research behind the sibling NFL site are in the [cfb-streak-king](https://github.com/DrewHoo/cfb-streak-king) repo under `specs/`; this is that engine over a different ledger.

```bash
npm install
npm run fetch     # wehoop files into data/raw/
npm run ledger    # src/data/players.json
npm test          # the known-answer gate
npm run coverage  # what the ledger still lacks (positions by source, who has none)
npm run receipts  # every researched position's quote, string-checked against its saved page
npm run dev
```

Positions are ESPN's, else the WNBA's own rosters', else researched from archived wnba.com player files and Wikipedia with a verbatim receipt per row (`data/ref/positions.json`, pages and worklist under `data/research/positions/`).

A sibling of [NFL Comparator](https://drewhoover.com/nfl-comparator/) and [College Football Streak King](https://drewhoover.com/cfb-streak-king/).
