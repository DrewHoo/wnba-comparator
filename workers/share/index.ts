// The share worker: sits on drewhoover.com/wnba-comparator/* in front of
// GitHub Pages and makes a shared URL unfurl as itself. GitHub Pages serves
// one HTML for every query string; this is the piece that makes every board
// and every open player read as its own page.
//
//   <head> rewrite  a URL whose query says more than the root (a slot off
//                   its default, or a player open with ?t=) gets its own
//                   title, description and og tags, worded by
//                   src/lib/share.ts (pure); a crawler's request also gets
//                   the leader or the open player's claim, read from the
//                   ledger.
//   /share/og.png   the board drawn on demand (card.ts): the worker fetches
//                   the ledger the prerender publishes (dist/share/players.json),
//                   runs the site's own evaluate, and renders the top of the
//                   board. Cached at the edge.
//
// Anything else — and anything that goes wrong — passes through untouched:
// this worker must never be the reason the site is down.
//
// Deploy: npx wrangler deploy -c workers/share/wrangler.jsonc (deploy.yml
// does it after every push to main). To see a card locally: npm run build,
// npx vite preview (4173), then
//   npx wrangler dev -c workers/share/wrangler.jsonc --local --var ORIGIN:http://localhost:4173 --var NO_REPORT:1
// and open http://localhost:8787/wnba-comparator/share/og.png?n=50

import { decodeLedger, type Ledger, type LedgerFile } from '../../src/lib/ledger.ts';
import { evaluate, type Board, type Row } from '../../src/lib/query.ts';
import { parseUrl, toUrl } from '../../src/lib/url.ts';
import { queryWords } from '../../src/lib/words.ts';
import { cardHeading, cardRows, isShared, shareDescription, shareTitle } from '../../src/lib/share.ts';
import { renderCard } from './card.ts';

interface Env { ORIGIN?: string; NO_REPORT?: string }

const BASE = '/wnba-comparator';
const SITE = 'wnba-comparator';
// the committed ledger, for the window between a worker deploy and the next Pages deploy
const RAW_LEDGER = 'https://raw.githubusercontent.com/DrewHoo/wnba-comparator/main/src/data/players.json';

// Analytics: one Mixpanel event per link preview, sent server-side to the
// index site's project (the public token its embed carries; a project token
// only writes). The client embed never sees an unfurl, because the bot that
// fetches a shared link runs no script, so this is the only place a share
// can be counted. Nothing personal goes: the crawler's name, its user agent
// only when it is a crawler, the country Cloudflare saw, the URL itself and
// its slots. A browser's visit is the embed's to count, so the head rewrite
// reports crawlers only; the card is reported whoever asked for it.
const MIXPANEL_TOKEN = '1c6a0f45b8a5768185a8d9a2f4d65452';
const AGENTS: [RegExp, string][] = [
  [/Slackbot|Slack-ImgProxy/i, 'slack'],
  [/Discordbot/i, 'discord'],
  [/TelegramBot/i, 'telegram'],
  [/WhatsApp/i, 'whatsapp'],
  [/LinkedInBot/i, 'linkedin'],
  [/redditbot/i, 'reddit'],
  [/Bluesky/i, 'bluesky'],
  [/Mastodon/i, 'mastodon'],
  [/Facebot.*Twitterbot|Twitterbot.*Facebot/i, 'imessage'],
  [/Twitterbot/i, 'twitter'],
  [/facebookexternalhit|Facebot/i, 'facebook'],
  [/Googlebot/i, 'google'],
  [/bingbot/i, 'bing'],
  [/Applebot/i, 'apple'],
  [/bot|crawler|spider|preview|fetch|embed|scraper/i, 'other-bot'],
];
const agentOf = (ua: string | null): string => AGENTS.find(([re]) => re.test(ua ?? ''))?.[1] ?? 'browser';

function report(env: Env, ctx: ExecutionContext, request: Request, event: string, props: Record<string, unknown>) {
  if (env.NO_REPORT) return;
  try {
    const ua = request.headers.get('user-agent');
    const agent = agentOf(ua);
    const body = [{
      event,
      properties: {
        token: MIXPANEL_TOKEN,
        distinct_id: `unfurl:${agent}`,
        $insert_id: crypto.randomUUID(),
        time: Math.floor(Date.now() / 1000),
        site: SITE,
        agent,
        crawler: agent === 'browser' ? null : (ua ?? '').slice(0, 200),
        country: (request as Request & { cf?: { country?: string } }).cf?.country ?? null,
        ...props,
      },
    }];
    ctx.waitUntil(fetch('https://api.mixpanel.com/track?ip=0', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/plain' },
      body: JSON.stringify(body),
    }).then((r) => r.body?.cancel()).catch(() => {}));
  } catch {}
}
/** The URL itself and its slots, for an event. */
const urlProps = (url: URL) => {
  const { query: q, open } = parseUrl(url.search);
  return {
    url: url.href,
    $current_url: url.href,
    path: url.pathname.replace(BASE, '') || '/',
    words: queryWords(q),
    pos: q.pos, stat: q.stat, how: q.how, n: q.n, seq: q.seq, scope: q.scope, since: q.since, dir: q.dir,
    tests: q.tests.map((t) => `${t.stat}:${t.min}${t.max != null ? `-${t.max}` : ''}`).join(',') || null,
    t: open,
  };
};

/** Bump on any change to what the card draws or how a URL reads; it keys the edge cache. */
const CARD_VERSION = '2026-10-20a';

const edge = (ttl: number) => ({ cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ttl, '400-599': 30 } } }) as RequestInit;
// a fresh cache key each UTC day: GitHub Pages ignores query strings, and a
// 404 cached before a Pages deploy must not outlive the day it happened on
const dayKey = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// the ledger, decoded once per isolate per UTC day; a failed load clears the
// slot so the next request retries rather than inheriting the failure
let ledgerCache: { day: string; ledger: Promise<Ledger> } | null = null;
function loadLedger(origin: string): Promise<Ledger> {
  const day = dayKey();
  if (ledgerCache?.day !== day) {
    const ledger = (async () => {
      let res = await fetch(`${origin}${BASE}/share/players.json?d=${day}`, edge(3600));
      if (!res.ok) { await res.body?.cancel(); res = await fetch(RAW_LEDGER, edge(3600)); }
      if (!res.ok) throw new Error(`ledger ${res.status}`);
      return decodeLedger((await res.json()) as LedgerFile);
    })().catch((e) => { ledgerCache = null; throw e; });
    ledgerCache = { day, ledger };
  }
  return ledgerCache.ledger;
}

const findRow = (board: Board, key: string | null): Row | null => (key ? [...board.ranked, ...board.onTheWay].find((r) => r.key === key) ?? null : null);

async function ogCard(origin: string, search: string): Promise<Response> {
  const L = await loadLedger(origin);
  const { query, open } = parseUrl(search);
  const board = evaluate(L, query);
  const res = renderCard({
    heading: cardHeading(query),
    words: queryWords(query),
    rows: cardRows(board, query, open),
    footer: `${query.since ?? L.firstSeason}–${L.currentSeason} · ${board.ranked.length.toLocaleString('en-US')} ${query.seq === 'teamGames' ? 'player-seasons' : 'careers'} with the whole window · drewhoover.com`,
  });
  // buffer the render: workers-og streams lazily, and a failure mid-stream
  // would otherwise ship a 200 with an empty body
  const png = await res.arrayBuffer();
  if (!png.byteLength) throw new Error('empty render');
  return new Response(png, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600, s-maxage=43200' },
  });
}

/** The og image URL for a board URL: the same slots, in the one order toUrl writes them. */
const ogImageUrl = (origin: string, search: string) => `${origin}${BASE}/share/og.png${toUrl(parseUrl(search))}`;

const content = (text: string) => ({
  element(e: Element) { e.setAttribute('content', text); },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ORIGIN ?? 'https://drewhoover.com';

    // the dynamic card, cached at the edge under this deploy's version, so a
    // card an older worker drew for the same URL can't outlive the deploy
    if (url.pathname === `${BASE}/share/og.png`) {
      try {
        const canon = toUrl(parseUrl(url.search));
        const key = new Request(`${url.origin}${url.pathname}?v=${CARD_VERSION}&${canon.slice(1)}`, { method: 'GET' });
        const cached = await caches.default.match(key);
        report(env, ctx, request, 'share card', { ...urlProps(url), cached: !!cached });
        if (cached) return cached;
        const res = await ogCard(origin, url.search);
        ctx.waitUntil(caches.default.put(key, res.clone()));
        return res;
      } catch (e) {
        console.log(JSON.stringify({ event: 'og_render_failed', url: url.search, error: String((e as Error)?.stack ?? e) }));
        // the committed board image, so a share still carries something
        return Response.redirect(`${origin}${BASE}/og.png`, 302);
      }
    }

    // everything else: origin, with <head> rewritten where the URL says more
    // than the prerendered page could. A same-zone subrequest skips the
    // worker and lands on GitHub Pages (and lets `wrangler dev` hit the live site).
    const res = await fetch(new Request(`${origin}${url.pathname}${url.search}`, request));
    try {
      if (request.method !== 'GET') return res;
      if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res;
      const { query, open } = parseUrl(url.search);
      if (!isShared(query, open)) return res;
      const crawler = agentOf(request.headers.get('user-agent')) !== 'browser';
      if (crawler) report(env, ctx, request, 'share unfurl', urlProps(url));
      // a crawler's description names the leader or the open player, from the ledger; a browser's is the pure sentence
      let board: Board | null = null, openRow: Row | null = null, firstSeason = 1997;
      if (crawler) {
        try { const L = await loadLedger(origin); board = evaluate(L, query); openRow = findRow(board, open); firstSeason = L.firstSeason; } catch {}
      }
      const title = shareTitle(query);
      const description = shareDescription(query, board, openRow, firstSeason);
      const img = ogImageUrl(origin, url.search);
      return new HTMLRewriter()
        .on('title', { element(e) { e.setInnerContent(title); } })
        .on('meta[name="description"]', content(description))
        .on('meta[property="og:title"]', content(title))
        .on('meta[property="og:description"]', content(description))
        .on('meta[property="og:url"]', content(`${origin}${url.pathname}${url.search}`))
        .on('meta[property="og:image"]', content(img))
        .on('meta[property="og:image:alt"]', content(`${title.replace(` · ${'WNBA Comparator'}`, '')}, on a dark leaderboard.`))
        .on('meta[name="twitter:image"]', content(img))
        .on('meta[name="twitter:title"]', content(title))
        .on('meta[name="twitter:description"]', content(description))
        .transform(res);
    } catch (e) {
      console.log(JSON.stringify({ event: 'share_rewrite_failed', url: url.pathname + url.search, error: String(e) }));
      return res;
    }
  },
} satisfies ExportedHandler<Env>;
