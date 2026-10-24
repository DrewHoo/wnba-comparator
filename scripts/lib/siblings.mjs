// The other sports sites on drewhoover.com, in the order every one of them
// lists them, with the words every one of them uses. "What to read next" on
// the page and the sibling list in llms.txt both read this file. The site's
// own entry is here too (`self`), so the list stays whole; the page skips it.
export const SELF = 'wnba-comparator'
/** Putting Up Numbers (puttingupnumbers.com), where the comparators live now: one link a sport */
const PUN_SPORTS = [['College Football', 'cfb'], ['NFL', 'nfl'], ['NBA', 'nba'], ['WNBA', 'wnba'], ['NHL', 'nhl'], ['Soccer', 'soccer']].map(([name, id]) => ({ name, url: `https://puttingupnumbers.com/${id}/` }))

export const SIBLINGS = [
  { slug: 'puttingupnumbers', name: 'Putting Up Numbers', url: 'https://puttingupnumbers.com/', words: 'compare players, coaches, and teams on wins', links: PUN_SPORTS },
  { slug: 'cfb-streak-king', name: 'College Football Streak King', words: 'the longest active and all-time winning and losing streaks in college football, under any definition, every FBS game since 1936' },
  { slug: 'hostile-territory', name: 'Hostile Territory', words: "every head coach's true road record against AP top-10 teams since 1936" },
  { slug: 'how-many-rings', name: 'How Many Rings?', words: 'every person on a national-championship staff since 1990, ranked by the number of rings they can claim' },
  { slug: 'collegiate-championships', name: 'Collegiate Championships', words: 'which schools have won the most NCAA championships, across 33 sports' },
  { slug: 'cfb-all-time-records', name: 'CFB All-Time Records', words: 'all-time win-loss, bowl and national-title records for every FBS program' },
].map((s) => ({ url: `https://drewhoover.com/${s.slug}/`, ...s }))

/** the list without this site */
export const OTHERS = SIBLINGS.filter((s) => s.slug !== SELF)
