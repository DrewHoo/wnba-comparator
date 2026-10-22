// The one file to edit when you start a project from this template.
// The URL slug is NOT here: it is the "name" in package.json, and it has to
// equal the GitHub repo name, because the site serves at https://<domain>/<repo>/.
import { FIRST_SEASON } from './scripts/lib/window.mjs'

export default {
  domain: 'drewhoover.com',
  title: 'WNBA Comparator',
  // the root's <title> and og:title: the query the page can win, then the name
  pageTitle: 'Compare WNBA players at the same point in their careers · WNBA Comparator',
  // the year is the ledger's first season (scripts/lib/window.mjs), never typed here
  description:
    `Compare WNBA players at the same point in their careers: points through the first 100 games, assists through a rookie season, fastest to 1,000 points, 30-point games in a season's first 20. Build the comparison, see who stacks up, every career since ${FIRST_SEASON}.`,
  ogSubtitle: 'Same point in the career. Who stacks up.',
  ogImageAlt: 'A ranked list of WNBA players compared at the same point in their careers, on a dark background.',
  accent: '#c36c36',
}
