import { expect, test } from 'bun:test';
import {
    extractFragment,
    fragmentFiles,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { visualsSkillFiles } from './managed-skills.ts';

/**
 * The geometry a hand-drawn chart has to get right, linted on the fragments as
 * they are seeded: the accessible name, the two scaffoldings (a 736 viewBox, or
 * a fluid plot with a fixed-width tick gutter), and text that stays inside the
 * drawing. The house rules for tokens and anatomy live in
 * visuals-fragments.test.ts.
 */
const visualFragments = fragmentFiles()
    .map((file: string) => extractFragment(visualsSkillFiles[`references/fragments/${file}`], file))
    .filter((fragment: { kind: string } | null) => fragment?.kind === 'visual');
const chartFragments = visualFragments.filter((fragment) => fragment.html.includes('<!-- scale:'));

/**
 * Charts are hand-written SVG now, so the accessible name is the only thing
 * standing between a reader on a screen reader and a wall of paths. A
 * decorative `<svg>` opts out by saying so.
 */
test('every chart svg states its takeaway and titles itself', () => {
    for (const fragment of chartFragments) {
        for (const [, open, body] of fragment.html.matchAll(/(<svg\b[^>]*>)([\s\S]*?)<\/svg>/giu)) {
            if (open.includes('aria-hidden="true"') || isBarViewport(open)) {
                continue;
            }
            expect(open, fragment.slug).toContain('role="img"');
            expect(open, fragment.slug).toMatch(/aria-label="[^"]{20,}"/u);
            expect(body, `${fragment.slug} svg title`).toContain('<title>');
        }
    }
});

/**
 * A pixel `height` beside `width="100%"` letterboxes a viewBox drawing: it
 * keeps its aspect ratio and floats centered, narrower than the tiles above
 * it. Only a bare mark that stretches on purpose (`preserveAspectRatio="none"`)
 * may pair the two. A fluid plot is the other way round: it has no viewBox, so
 * the pixel height is what keeps its y scale and 12px text at any width.
 */
test('no full-width svg fixes a pixel height unless it stretches on purpose', () => {
    let checked = 0;
    for (const fragment of visualFragments) {
        for (const [open] of fragment.html.matchAll(/<svg\b[^>]*>/giu)) {
            if (!open.includes('width="100%"') || open.includes('preserveAspectRatio="none"')) {
                continue;
            }
            checked += 1;
            if (isFluidPlot(open)) {
                expect(open, fragment.slug).toMatch(/\sheight="\d+"/u);
                continue;
            }
            expect(open, fragment.slug).not.toMatch(/\sheight="/u);
        }
    }
    expect(checked).toBeGreaterThanOrEqual(chartFragments.length - 1);
});

/**
 * The reply column is 46rem, 736px, so a 736-wide viewBox draws one SVG unit
 * per CSS pixel and a 12px label renders at 12px. Any other width scales every
 * label with the column. Column charts are fluid plots instead (x in percent,
 * y in pixels) so they keep 12px text on a phone; each carries a fixed-width
 * gutter for its ticks. Maps keep their own 700 frame and are not charts.
 */
test('every chart svg is drawn on the 736 column width or as a fluid plot', () => {
    let viewBoxPlots = 0;
    let fluidPlots = 0;
    for (const fragment of chartFragments) {
        for (const [open] of fragment.html.matchAll(/<svg\b[^>]*>/giu)) {
            if (open.includes('aria-hidden="true"') || isBarViewport(open)) {
                continue;
            }
            if (isFluidPlot(open)) {
                fluidPlots += 1;
                expect(open, fragment.slug).toContain('min-width:0');
                expect(fragment.html, `${fragment.slug} gutter`).toMatch(
                    /<svg width="\d+" height="\d+" aria-hidden="true"/u
                );
                continue;
            }
            viewBoxPlots += 1;
            expect(open, fragment.slug).toContain('viewBox="0 0 736 ');
        }
    }
    expect(viewBoxPlots).toBeGreaterThanOrEqual(8);
    expect(fluidPlots).toBeGreaterThanOrEqual(3);
});

/**
 * No tick or label may start left of the svg's x 0 or run past its right
 * edge. Widths use the skill's own budget — 7.6px a character at 12px, 11.4
 * for `%` and `M` — which over-counts commas, so a pass here is conservative.
 * A battery chart sized an `8%` gutter at 7.6 a character and clipped every
 * tick by 3px.
 */
test('no svg text runs past the left or right edge of its drawing', () => {
    let checked = 0;
    for (const fragment of visualFragments) {
        for (const [, open, body] of fragment.html.matchAll(/(<svg\b[^>]*>)([\s\S]*?)<\/svg>/giu)) {
            const width = drawingWidth(open);
            if (width === null) {
                continue;
            }
            for (const [tag, label] of body.matchAll(/<text\b[^>]*>([^<]+)<\/text>/gu)) {
                const x = Number(/\sx="(-?[\d.]+)"/u.exec(tag)?.[1] ?? Number.NaN);
                if (Number.isNaN(x)) {
                    continue;
                }
                const size = Number(/font-size="([\d.]+)"/u.exec(tag)?.[1] ?? 12);
                const w = (labelWidth(label) * size) / 12;
                const anchor = /text-anchor="(start|middle|end)"/u.exec(tag)?.[1] ?? 'start';
                const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
                const where = `${fragment.slug}: "${label}" at x ${x} (${anchor})`;
                expect(left, where).toBeGreaterThanOrEqual(0);
                // Only ticks and short values are budgeted for the right edge:
                // a name's letters run narrower than figures.
                if (/^[-−+$\d.,%KM ]+$/u.test(label)) {
                    expect(left + w, where).toBeLessThanOrEqual(width);
                }
                checked += 1;
            }
        }
    }
    expect(checked).toBeGreaterThanOrEqual(100);
});

/** A fluid plot: full width, a fixed pixel height, and no viewBox. */
function isFluidPlot(open: string) {
    return open.includes('width="100%"') && !open.includes('viewBox=');
}

/** A fluid column's bar: a nested viewport placed in percent, not a drawing. */
function isBarViewport(open: string) {
    return /^<svg\s+x="/u.test(open);
}

/** The svg's own coordinate width: its viewBox, or a fixed gutter's pixel width. */
function drawingWidth(open: string): number | null {
    const viewBox = /viewBox="0 0 ([\d.]+) /u.exec(open);
    if (viewBox) {
        return Number(viewBox[1]);
    }
    const fixed = /^<svg width="(\d+)"/u.exec(open);
    return fixed ? Number(fixed[1]) : null;
}

/** The skill's width budget at 12px: 7.6 a character, 11.4 for `%` and `M`. */
function labelWidth(label: string) {
    return [...label.trim()].reduce((w, c) => w + ('%M'.includes(c) ? 11.4 : 7.6), 0);
}
