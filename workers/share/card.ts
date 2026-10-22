// The share card: a board, or an open player read against her peer, drawn
// as a 1200x630 PNG through workers-og (satori + resvg wired for workerd,
// wasm included). The design follows gen-og.mjs: the dark room, Graduate
// counts, serif names, mono small print. Fonts ride in the bundle (OFL; the
// same four the site uses). The comparison is NFL Comparator's card.

import { ImageResponse } from 'workers-og';
// wrangler's Data rule hands these over as ArrayBuffers
import graduate from './fonts/Graduate-Regular.ttf';
import mono from './fonts/IBMPlexMono-Regular.ttf';
import monoBold from './fonts/IBMPlexMono-SemiBold.ttf';
import serif from './fonts/SourceSerif4-Regular.ttf';
import type { CardComparison, CardRow } from '../../src/lib/share.ts';

const BG = '#282127';
const INK = '#efe6d9';
const MUTED = '#bfb2a6';
const FAINT = '#857a75';
const LINE = '#453a42';
const CREAM = '#f3e2bc';
const RUST = '#c36c36';

export interface Card {
  /** "MOST POINTS THROUGH THE FIRST 100 GAMES", or "CAITLIN CLARK VS CYNTHIA COOPER" */
  heading: string;
  /** the whole sentence */
  words: string;
  /** a board: its top rows */
  rows?: CardRow[];
  /** a comparison: the two sides, the lines under them, the curves */
  comparison?: CardComparison;
  /** "1997–2026 · 1,219 careers · drewhoover.com" */
  footer: string;
}

// satori reads the text as-is, entities included, so only the characters
// that would open a tag or close an attribute are escaped
const esc = (s: string) => s.replace(/</g, '&lt;').replace(/"/g, '&quot;');
const nowrap = 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

// every meaningful glyph stays inside the centered safe column: Reddit's
// compact feed center-crops the 1.91:1 card to a near-square thumbnail, and a
// safe-zone layout survives any such crop
export const SAFE = 720;

// the heading is one line inside the safe column: Graduate runs about 0.62em
// a character, so a long sentence ("MOST POINTS THROUGH THE FIRST 50 GAMES")
// drops its size rather than leaving a word alone on a second line
const HEADING_MAX = 34;
const HEADING_MIN = 20;
export const headingSize = (heading: string): number => Math.max(HEADING_MIN, Math.min(HEADING_MAX, Math.floor(SAFE / (0.62 * Math.max(1, heading.length)))));

type Chart = NonNullable<CardComparison['chart']>;

/** the two curves as an SVG, embedded as an image: the panel's chart in the card's colors (its labels are HTML around it; resvg draws no text inside a nested image) */
function chartSvg(c: Chart, W: number, H: number): { svg: string; len: number; top: number } {
  const len = Math.max(c.me.length, c.them.length, c.n);
  const top = Math.max(1, ...c.me.slice(0, len), ...c.them.slice(0, len));
  const L = 2, R = 2, T = 6, B = 2;
  const x = (i: number) => L + (i / Math.max(1, len - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (s: number[]) => s.slice(0, len).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const parts = [`<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="${LINE}"/>`];
  if (c.n <= len) parts.push(`<line x1="${x(c.n - 1)}" y1="${T}" x2="${x(c.n - 1)}" y2="${y(0)}" stroke="${LINE}" stroke-dasharray="2 3"/>`);
  parts.push(`<path d="${path(c.them)}" fill="none" stroke="${MUTED}" stroke-width="2"/>`);
  parts.push(`<path d="${path(c.me)}" fill="none" stroke="${CREAM}" stroke-width="2.5"/>`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`, len, top };
}

/** the chart and its labels: the unit's first and last ordinal under it, the top value at its middle */
function chart(c: Chart): string {
  const { svg, len, top } = chartSvg(c, SAFE, 130);
  const lab = `font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:1px; color:${FAINT};`;
  return `
    <div style="display:flex; flex-direction:row; width:${SAFE}px; margin-top:12px;">
      <div style="display:flex; width:${SAFE / 3}px; justify-content:flex-start; ${lab}">${esc(c.unit.toUpperCase())} 1</div>
      <div style="display:flex; width:${SAFE / 3}px; justify-content:center; ${lab}">TOP ${top.toLocaleString('en-US')}</div>
      <div style="display:flex; width:${SAFE / 3}px; justify-content:flex-end; ${lab}">${esc(c.unit.toUpperCase())} ${len}</div>
    </div>
    <img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="${SAFE}" height="130" style="margin-top:2px;" />`;
}

/** the comparison: the open player on the left in cream, her peer on the right, the curves, the panel's lines */
function comparisonBody(c: CardComparison): string {
  const half = SAFE / 2 - 10;
  return `
    <div style="display:flex; flex-direction:row; justify-content:space-between; width:${SAFE}px; margin-top:6px;">
      ${c.sides.map((s, i) => `
      <div style="display:flex; flex-direction:column; width:${half}px; align-items:${i ? 'flex-end' : 'flex-start'};">
        <div style="display:flex; font-family:'Source Serif 4'; font-size:24px; color:${INK}; ${nowrap} max-width:${half}px;">${esc(s.name)}</div>
        <div style="display:flex; flex-direction:row; align-items:baseline; gap:10px;">
          <div style="display:flex; font-family:'Graduate'; font-size:46px; color:${i ? MUTED : CREAM};">${esc(s.value)}</div>
          <div style="display:flex; font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:1px; color:${FAINT};">${esc(s.unit.toUpperCase())}</div>
        </div>
        <div style="display:flex; font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:1px; color:${FAINT}; ${nowrap} max-width:${half}px;">${esc(s.claim.toUpperCase())}</div>
      </div>`).join('')}
    </div>
    ${c.chart ? chart(c.chart) : ''}
    ${c.lines.map((l, i) => `<div style="display:flex; font-family:'Source Serif 4'; font-size:18px; line-height:1.3; color:${i ? MUTED : INK}; margin-top:${i ? 2 : 8}px; width:${SAFE}px;">${esc(l)}</div>`).join('')}`;
}

export function renderCard(card: Card): Response {
  const rows = (card.rows ?? []).map((r) => `
    <div style="display:flex; flex-direction:row; align-items:center; gap:16px; padding:7px 10px; margin:0 -10px; border-bottom:1px dashed ${LINE}; ${r.hi ? `background-color: rgba(243,226,188,0.08); border-radius:6px;` : ''}">
      <div style="display:flex; justify-content:flex-end; width:44px; font-family:'IBM Plex Mono'; font-size:15px; letter-spacing:1px; color:${r.rank === '1' ? CREAM : FAINT};">${esc(r.rank)}</div>
      <div style="display:flex; flex-direction:column; flex-grow:1; width:470px;">
        <div style="display:flex; font-family:'Source Serif 4'; font-size:25px; color:${INK}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(r.name)}</div>
        <div style="display:flex; font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:1px; color:${r.live ? RUST : FAINT}; margin-top:1px;">${esc(r.span.toUpperCase())}</div>
      </div>
      <div style="display:flex; justify-content:flex-end; width:150px; font-family:'Graduate'; font-size:32px; color:${r.live ? RUST : CREAM};">${esc(r.value)}</div>
    </div>`).join('');

  const html = `
  <div style="display:flex; flex-direction:column; align-items:center; width:1200px; height:630px; background-color:${BG}; padding:40px 0 32px;
              background-image: radial-gradient(circle at 600px -126px, rgba(243,226,188,0.13) 0%, rgba(243,226,188,0) 65%);">
    <div style="display:flex; font-family:'IBM Plex Mono'; font-weight:600; font-size:16px; letter-spacing:4px; color:${RUST};">WNBA COMPARATOR</div>
    <div style="display:flex; font-family:'Graduate'; font-size:${headingSize(card.heading)}px; color:${CREAM}; margin-top:10px; max-width:${SAFE}px; ${nowrap}">${esc(card.heading.toUpperCase())}</div>
    <div style="display:flex; font-family:'Source Serif 4'; font-size:21px; color:${MUTED}; margin-top:2px; max-width:${SAFE}px; text-align:center;">${esc(card.words)}</div>
    <div style="display:flex; flex-direction:column; margin-top:12px; flex-grow:1; width:${SAFE}px;">${card.comparison ? comparisonBody(card.comparison) : rows}</div>
    <div style="display:flex; font-family:'IBM Plex Mono'; font-size:14px; letter-spacing:2px; color:${FAINT}; margin-top:10px;">${esc(card.footer.toUpperCase())}</div>
  </div>`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Graduate', data: graduate as ArrayBuffer, weight: 400, style: 'normal' },
      { name: 'IBM Plex Mono', data: mono as ArrayBuffer, weight: 400, style: 'normal' },
      { name: 'IBM Plex Mono', data: monoBold as ArrayBuffer, weight: 600, style: 'normal' },
      { name: 'Source Serif 4', data: serif as ArrayBuffer, weight: 400, style: 'normal' },
    ],
  });
}
