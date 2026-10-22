// The other sports sites on drewhoover.com, in the order every one of them
// lists them, with the words every one of them uses. "What to read next" on
// the page and the sibling list in llms.txt both read this file. The site's
// own entry is here too (`self`), so the list stays whole; the page skips it.
export const SELF = 'wnba-comparator'

export const SIBLINGS = [
  { slug: 'nfl-comparator', name: 'NFL Comparator', words: 'the same comparator over every NFL career since 1999, with a page for every player and what he leads' },
  { slug: 'nba-comparator', name: 'NBA Comparator', words: 'the same comparator over every NBA career since 1946-47, Wilt and Jordan included, with a page for every player and what he leads' },
  { slug: 'wnba-comparator', name: 'WNBA Comparator', words: 'the same comparator over every WNBA career since 1997' },
  { slug: 'nhl-comparator', name: 'NHL Comparator', words: 'the same comparator over every NHL career since 1917-18, Gretzky and Howe included' },
  { slug: 'cfb-comparator', name: 'College Football Comparator', words: 'every coach, team and player at the same point in their careers, since 1869, with the best players of each position at every school and conference' },
  { slug: 'cfb-streak-king', name: 'College Football Streak King', words: 'the longest active and all-time winning and losing streaks in college football, under any definition, every FBS game since 1936' },
  { slug: 'hostile-territory', name: 'Hostile Territory', words: "every head coach's true road record against AP top-10 teams since 1936" },
  { slug: 'how-many-rings', name: 'How Many Rings?', words: 'every person on a national-championship staff since 1990, ranked by the number of rings they can claim' },
  { slug: 'collegiate-championships', name: 'Collegiate Championships', words: 'which schools have won the most NCAA championships, across 33 sports' },
  { slug: 'cfb-all-time-records', name: 'CFB All-Time Records', words: 'all-time win-loss, bowl and national-title records for every FBS program' },
].map((s) => ({ ...s, url: `https://drewhoover.com/${s.slug}/` }))

/** the list without this site */
export const OTHERS = SIBLINGS.filter((s) => s.slug !== SELF)
