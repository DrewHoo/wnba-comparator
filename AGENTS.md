# Idiosyncrasies of the data and the logic

What building the first version turned up that isn't obvious from the code or the
wehoop docs. CLAUDE.md has the layout; this is the list of places where the numbers
can surprise you. Add to it whenever a gate or a reader's correction teaches us one.
The NFL Comparator's AGENTS.md is the sibling list; the engine is the same, so a
ruling there usually holds here.

## The data

- **Two wehoop pipelines, two jobs.** The WNBA Stats player game logs (release tag
  `wnba_stats_player_game_logs`) are the spine: every game of every season from 1997,
  one row per player who appeared, no starter flag, no position, no birth date, players
  keyed by the WNBA Stats id. The ESPN box scores (`espn_wnba_player_boxscores`, 2003 on)
  carry the starter flag and a position, the ESPN bios the birth date, and wehoop's
  crosswalk (`wnba_crosswalk`, one file a season) maps the two ids. The first build used
  ESPN as the spine and inherited its holes (109 games missing in 2003–2016, nothing
  before 2003); the logs have all of them.
- **The Stats pipeline can fall behind, and ESPN fills the hole.** The 2026 game log
  stops on July 22 while ESPN's box scores run to the Finals, so the builder adds any
  ESPN game the logs lack (same date, same two teams, after mapping ESPN's team codes to
  the logs' codes by season through the players the two sources share on a date) with
  its appearances from the ESPN rows, the player id from the inverse crosswalk (then
  the name, then `espn:<id>` for a player neither knows). Those games get ids
  `espn:<game id>`. An ESPN game whose mapped home team already has a game that day in
  the logs is skipped as a duplicate, not added, and the builder prints both counts.
  When the Stats pipeline catches up, the next build replaces the filled games with the
  logs' own rows, and a player who only ever had an `espn:` id would change id (her
  URL's `t`); none did at first build.
- **A game-log row is an appearance.** The logs have no row for a player who didn't play;
  a few rows carry 0 minutes (she was in for seconds) and those count. Team rows have a
  blank `player_id` and the builder skips them.
- **The logs don't carry the All-Star game or the Cup final**, so nothing is dropped. The
  Cup's pool games are regular-season games and are there. The 2003 log has 238
  regular-season games where ESPN's schedule has 236: ESPN is missing two real games
  (June 12 and July 22, 2003), not the other way round.
- **The starter flag is joined by player and date.** A player has one game a day. The
  ESPN id comes from the crosswalk (the id most seasons vote for), and when the crosswalk
  has no row for her (Han Xu, Camille Smith, Asia Durr) the join falls back to the
  normalized name on that date, then first initial plus last name, giving up when two
  players share the key that day. What's left with no flag: games with no ESPN box
  (every game before 2003; 61 in 2003, 23 in 2004, a handful a season through 2008, one
  or two in 2010, 2012 and 2016) and a few box scores that omit a player who played. The
  builder prints the coverage by season.
- **A game with no flag makes the starts sequence unreadable past it.** `started` is null
  there, and `query.ts` sits a career out of a starts field when it began before
  `startsSince` (2003) or a null-flag game comes before the window's last start (or
  anywhere, when the window isn't filled). `board.gapped` is the count, the board says it,
  and the starts picker's hint says "flagged since 2003". Every other sequence reads the
  whole ledger.
- **Positions come from three layers, in order, and the row says which (`posSrc`).**
  ESPN's first (the modal one across her box rows, then the bio's, then the crosswalk's;
  missing before 2003 and thin before 2012), then the WNBA Stats rosters (`rosters_<season>.csv`,
  stats.wnba.com's commonteamroster, every season from 1997; 321 of the 413 ESPN lacked),
  then the researched layer `data/ref/positions.json` (88 rows at first build: 77 from
  scripted harvests of Wayback captures of wnba.com player files, 13 from Wikipedia
  infoboxes, 2 with both; every row with a verbatim receipt; `data/research/positions/` has
  the worklist, the research files, the saved pages and the harvest scripts). The last four
  (Chastity Reed, Felicia Chester-Wootton, Julie Wojta, Miranda Ayim; 2011–2013, 11 games
  or fewer) had captured player files that were the page shell without the bio, and came
  in as leads Drew gave: `leads.json`, one page each, from Basketball-Reference (a
  receipts-only source here, never a harvest, since its terms bar bulk use) and the
  current wnba.com player profiles, whose header prints the position in the fetched HTML.
  Every player in the ledger has a position now. Combo positions fold to the first letter (G-F to G, F-C to F). ESPN and
  the rosters disagree on the group for about one player in seven where both speak, nearly
  always a combo read the other way (Swoopes F on the roster, G at ESPN), so a position is
  a `label` grade claim, not a fact about play, and ESPN wins only because it covers the
  recent era the boards show most. Players no layer names sit out the position fields;
  `npm run coverage` lists them.
- **Research rows are gated, not trusted.** `npm run receipts` string-matches every quote
  against the saved page (scripts/check-receipts.mjs, from the receipts-research skill);
  `npm run merge:positions` is the only way a row enters the ruling file, and it sends a
  player whose sources disagree to `triage.json` instead. The Wayback harvest needs pacing
  (a 1.5s sleep and a retry on anything but 200/404); the first run without it went quiet
  after sixteen players and looked like missing data. wnba.com filed three players under
  nicknames (`ALIASES` in the harvester) and changed the page shape in 2008 from
  "Position: Guard" to "Chioma Nnamaka #11 Guard - Atlanta Dream"; both patterns are in it.
- **Team codes are WNBA Stats' codes of the day** (NYL, LAS, PHO, WAS, LVA; DET for the
  Shock, SAN for the Silver Stars), not ESPN's (NY, LA, PHX, WSH, LV). `teamGames` is
  keyed the same way, so a franchise move is two keys.
- **Season lengths vary a lot**: 28 games in 1997, 30 to 32 through 2002, 34 for most of
  2003–2018, 22 in the 2020 bubble, 36, 40 (2023–24), 44 (2025–26). A `teamGames` window
  of 40 puts every pre-2023 season on the way, so a season gate picks N by the season.
- **Names are the log's latest spelling** and carry accents (Ivana Dojkić); ESPN's may
  differ (a nickname in parentheses, a married name), which is why the fallback join
  normalizes.
- **Dates are YYYYMMDD integers**; a player has at most one game a day, so the date is
  the order key (no week number).

## The logic

- **Sequences are four different things.** `games` is every appearance, `starts` the
  flagged ones, `seasons` groups games by season, `teamGames` counts the team's
  schedule. A win is the result of whatever game is in the sequence.
- **"Team games of a season" measures the team's first N, not the player's.** A player
  who missed game 3 fails "each of" and has a gap in a streak; a traded player's
  season uses her first team's schedule only.
- **A seasons window is complete only when the Nth season is over.**
- **`reach` reuses `n` as the target.** "Fastest to 1,000 points" is `how: reach, n:
  1000`, the value is the ordinal, and `dir: fewest` ranks it.
- **`every` and `count` rank by the count.** The value is the number of games that
  passed the test, so the qualifiers lead and the near misses follow.
- **Double-doubles and triple-doubles are per-game 0/1 stats** (`dd`, `td`: how many
  of points, rebounds, assists, steals, blocks reached 10), so they sum, count and
  streak like anything else; their only test is "a double-double" (`isUnit`).
- **Ranks are competition ranks with ties**; the `tied` flag draws the T.
- **Crossings are entries into a tie or a lead**, read on both curves at the same
  ordinal. **`toMatch` is arithmetic, not a forecast.**
- **Normalize runs before every evaluate and in `parseUrl`**: a test query with no
  tests gets the stat's second threshold; a reach over seasons or team games becomes
  games.
- **A clean-game test (max 0) needs `played`: ten minutes on the floor.** "No turnovers"
  and "no fouls" are the only max-0 tests the picker offers, and before the floor a
  streak of them was built from cameos: 16,840 of the ledger's 41,849 zero-turnover games
  are under ten minutes (11,348 rows are under five). `played(g)` is `g.min >= PLAYED_MIN`
  in `query.ts` and lives inside `holds()`, so the board, the panel's ledger ticks and
  the worker agree; a cap above zero ("0–2 turnovers") and a plain threshold read the
  line as it is. The NFL site's floor is the same rule with attempts, carries and
  targets (QB 10+ attempts, RB 5+ carries + targets, WR/TE 3+ targets). The ledger's
  `min` is the WNBA Stats minutes, rounded to the minute, and a few rows carry 0 (she
  was in for seconds); those count as appearances and never as clean games.
- **Nothing sits out a career field for its debut any more.** The ledger starts with the
  league, so every career's first game is its real first game. The NFL site's "joined in
  progress" rule survives here only as the starts rule above.

## Working here

- The share worker (`workers/share`) decodes the whole 8.7MB ledger in the isolate (about
  40MB resident); that is inside a Worker's 128MB, and the per-isolate, per-day cache means
  one cold load. If the ledger doubles, give the worker a slimmer payload (the columns the
  stat catalog reads, nothing else) before anything else.
- The worker is typechecked by `tsconfig.worker.json` (the Workers runtime types can't
  share a program with the DOM lib, so it is its own config; `workers/share/env.d.ts`
  declares the `.ttf` imports). `npm run worker:dev` plus a card that renders is still
  the real test: satori wants `display:flex` on every div with children, and `wrangler
  dev` logs "initWasm() can be used only once" on a second render and still returns the
  PNG. The worker's subrequest to the origin drops `accept-encoding`, or HTMLRewriter
  gets a gzip body from a local preview and rewrites nothing.
- The worker loads the ledger only for a crawler's request (the head rewrite) and for
  a card; a browser gets the pure sentence as its title and the page sets `document.title`
  itself once it hydrates, so a person never waits on the 8MB decode.
- The finder's index (`public/players/index.json`) is gitignored and written by
  `npm run index` (and first thing in `npm run build`); the dev server 404s it until
  then and the finder says "loading…" forever. A Radix dropdown hands focus back to its
  trigger when it closes, which scrolls the page to the dateline; the finder's menu
  sets `onCloseAutoFocus` to prevent that so a pick can land on the row.

- `rtk` rewrites `vitest` output and its parser fails on it; run
  `rtk proxy npx vitest run --reporter=verbose` to see which test failed and why.
- Node 22 strips types, so `scripts/*.mjs` import `src/lib/*.ts` directly.
- Text in the OG card is glyph outlines through opentype.js pinned to 1.3.4 with the
  TTFs committed under `scripts/fonts/`. The favicon is the index site's, copied by
  `gen-favicon`.
- The dev-server preview config is `.claude/launch.json` (port 5176, gitignored).
- The deploy workflow refetches and rebuilds the ledger on the daily schedule and on a
  manual run, never on a push; the ledger in `src/data/` is what a push deploys, so
  commit it after a local `npm run ledger` when a code change should ship with fresh
  data.
