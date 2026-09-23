import { expect, test } from 'bun:test';
import { agentHtmlTokenNames } from '../../../apps/website/src/agent-html/tokens.ts';
import {
    extractFragment,
    fragmentFiles,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { defaultVisualsSkill, visualsSkillFiles } from './managed-skills.ts';

/**
 * The fragments are the highest-leverage text in the skill: a model copies one
 * far more faithfully than it follows a rule, so a fragment that breaks a rule
 * ships that break five ways at once. These checks walk `references/fragments/`
 * as it is seeded, not a separate copy.
 */
const source = (slug: string) => visualsSkillFiles[`references/fragments/${slug}.md`] ?? '';
const fragments = fragmentFiles()
    .map((file: string) => extractFragment(visualsSkillFiles[`references/fragments/${file}`], file))
    .filter((fragment: { html: string } | null) => fragment !== null);
const visualFragments = fragments.filter((fragment) => fragment.kind === 'visual');

/**
 * A chart fragment is one that computes a plot from data, and the marker for
 * that is the `<!-- scale: … -->` comment every such fragment carries: it is
 * the one comment a visual body may hold, so nothing else in the skill can
 * wear it by accident. Detecting on the marker rather than on a hardcoded list
 * means a new plotted form is linted the day it lands; the list below then
 * pins the forms that must never stop being plots.
 */
const chartFragments = visualFragments.filter((fragment) => fragment.html.includes('<!-- scale:'));
const plottedForms = [
    'area',
    'combo-bar-line',
    'diverging-bar',
    'donut',
    'emphasis-bar',
    'grouped-bar',
    'multi-line',
    'paired-panels',
    'ranked-horizontal-bar',
    'scatter-bubble',
    'stacked-bar',
    'trend-line',
];
/** Bare marks: a shape beside a number, with no plot and nothing to hover. */
const bareMarks = new Set(['kpi-row', 'meter', 'sparkline', 'tile-with-sparkline']);
const publishedTokens = new Set<string>([...agentHtmlTokenNames, '--chart-grid', '--chart-label']);

test('the skill ships a fragment file for every shape it teaches', () => {
    expect(fragments.length).toBe(fragmentFiles().length);
    expect(visualFragments.length).toBeGreaterThanOrEqual(25);
    expect(chartFragments.length).toBeGreaterThanOrEqual(10);
    for (const slug of plottedForms) {
        expect(
            chartFragments.some((fragment) => fragment.slug === slug),
            `${slug} is a plot and must carry its scale derivation`
        ).toBe(true);
    }
    for (const fragment of fragments) {
        // Heading, then a few lines on when to use it and what to change, then
        // the fence. A fence with no guidance above it is a snippet, not a
        // fragment worth copying.
        const guidance = source(fragment.slug).split('```html')[0].trim();
        expect(guidance.split('\n').length, fragment.slug).toBeGreaterThan(2);
    }
});

test('no fragment hardcodes a color', () => {
    for (const fragment of fragments) {
        // An `rgba(` built by concatenation from a token is fine. A literal one
        // is a color that cannot follow the theme.
        expect(fragment.html, fragment.slug).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
        expect(fragment.html, fragment.slug).not.toMatch(/\brgba?\(\s*[\d.]/u);
        expect(fragment.html, fragment.slug).not.toMatch(/\b(?:hsl|oklch|lab|lch)\(/u);
    }
});

test('no fragment names a token the frame does not publish', () => {
    for (const fragment of fragments) {
        for (const [name] of fragment.html.matchAll(/--[a-z][a-z0-9-]*/gu)) {
            expect(publishedTokens.has(name), `${fragment.slug}: ${name}`).toBe(true);
        }
    }
});

test('the only heading in a visual fragment is the hidden summary', () => {
    for (const fragment of visualFragments) {
        for (const [tag] of fragment.html.matchAll(/<h[1-6]\b[^>]*>/giu)) {
            expect(tag, fragment.slug).toContain('clip-path:inset(50%)');
        }
    }
});

test('a bordered box in a visual fragment is a record card, never a plate', () => {
    for (const fragment of visualFragments) {
        for (const [tag] of fragment.html.matchAll(
            /<[a-z][a-z0-9]*\b[^>]*style="[^"]*"[^>]*>/giu
        )) {
            // The hover tooltip is a bordered surface by contract, and it is
            // not a box in the layout: it floats over one.
            if (tag.includes('class="tip"')) {
                continue;
            }
            const style = /style="([^"]*)"/u.exec(tag)?.[1] ?? '';
            if (!style.includes('border:1px solid var(--border)')) {
                continue;
            }
            expect(style, fragment.slug).toContain('var(--surface)');
            expect(style, fragment.slug).toContain('var(--radius-card)');
        }
    }
});

/**
 * Charts are hand-written SVG now, so the accessible name is the only thing
 * standing between a reader on a screen reader and a wall of paths. A
 * decorative `<svg>` opts out by saying so.
 */
test('every chart svg states its takeaway and titles itself', () => {
    for (const fragment of chartFragments) {
        for (const [, open, body] of fragment.html.matchAll(/(<svg\b[^>]*>)([\s\S]*?)<\/svg>/giu)) {
            if (open.includes('aria-hidden="true"')) {
                continue;
            }
            expect(open, fragment.slug).toContain('role="img"');
            expect(open, fragment.slug).toMatch(/aria-label="[^"]{20,}"/u);
            expect(body, `${fragment.slug} svg title`).toContain('<title>');
        }
    }
});

/**
 * A pixel `height` beside `width="100%"` letterboxes the drawing: the viewBox
 * keeps its aspect ratio and floats centered, narrower than the tiles above
 * it. Only a bare mark that stretches on purpose (`preserveAspectRatio="none"`)
 * may pair the two.
 */
test('no full-width svg fixes a pixel height unless it stretches on purpose', () => {
    let checked = 0;
    for (const fragment of visualFragments) {
        for (const [open] of fragment.html.matchAll(/<svg\b[^>]*>/giu)) {
            if (!open.includes('width="100%"') || open.includes('preserveAspectRatio="none"')) {
                continue;
            }
            checked += 1;
            expect(open, fragment.slug).not.toMatch(/\sheight="/u);
        }
    }
    expect(checked).toBeGreaterThanOrEqual(chartFragments.length);
});

/**
 * The reply column is 46rem, 736px, so a 736-wide viewBox draws one SVG unit
 * per CSS pixel and a 12px label renders at 12px. Any other width scales every
 * label with the column. Maps keep their own 700 frame and are not charts.
 */
test('every chart svg is drawn on the 736 column width', () => {
    let checked = 0;
    for (const fragment of chartFragments) {
        for (const [open] of fragment.html.matchAll(/<svg\b[^>]*>/giu)) {
            if (open.includes('aria-hidden="true"')) {
                continue;
            }
            checked += 1;
            expect(open, fragment.slug).toContain('viewBox="0 0 736 ');
        }
    }
    expect(checked).toBeGreaterThanOrEqual(plottedForms.length);
});

test('every chart fragment opens with the summary, shows its scale, and hovers', () => {
    for (const fragment of chartFragments) {
        expect(fragment.html, fragment.slug).toContain(
            '<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">'
        );
        // The derivation, so the next reader can check the arithmetic rather
        // than trust the pixels.
        expect(fragment.html, fragment.slug).toMatch(/<!-- scale:[^>]+-->/u);
        if (bareMarks.has(fragment.slug)) {
            continue;
        }
        // The canonical hover layer, copied verbatim from interaction.md.
        expect(fragment.html, fragment.slug).toContain('class="tip"');
    }
});

/**
 * Every value axis states the `niceStep` result it drew, spelled
 * `step <n> · max <n>`, so the lint can hold each fragment to the recipe in
 * marks-and-anatomy.md: the step is 1, 2 or 5 times a power of ten and the
 * axis ends on a whole multiple of it; a `· mirrored` diverging axis counts
 * the intervals on both arms. A copied fragment with a hand-picked
 * step ($3K ticks, 15% ticks) teaches the improvisation the recipe exists to
 * stop. The donut and the ranked bar label every mark and draw no value axis.
 */
const noValueAxis = new Set(['donut', 'ranked-horizontal-bar']);
const isNiceStep = (step: number) => {
    const pow = 10 ** Math.floor(Math.log10(step));
    return [1, 2, 5, 10].some((multiple) => Math.abs(step - multiple * pow) < pow * 1e-9);
};

test('every value axis states a nice step and a max on a whole multiple of it', () => {
    let axes = 0;
    for (const fragment of chartFragments) {
        if (noValueAxis.has(fragment.slug)) {
            continue;
        }
        for (const [comment] of fragment.html.matchAll(/<!-- scale:[\s\S]*?-->/gu)) {
            const pairs = [
                ...comment.matchAll(/step (\d+(?:\.\d+)?) · max (\d+(?:\.\d+)?)( · mirrored)?/gu),
            ];
            expect(pairs.length, `${fragment.slug} names its step and max`).toBeGreaterThan(0);
            // The rule rides inline with every pair: a model copies the fragment
            // and skips marks-and-anatomy.md, so the fragment has to teach it.
            expect(
                comment.split('→ step = smallest of 1, 2, 5 × 10^k at or above ').length - 1,
                `${fragment.slug} spells out the tick rule for every axis`
            ).toBe(pairs.length);
            for (const [, stepText, maxText, mirrored] of pairs) {
                const label = `${fragment.slug}: step ${stepText} · max ${maxText}`;
                const step = Number(stepText);
                const intervals = (Number(maxText) / step) * (mirrored ? 2 : 1);
                const whole = Math.round(intervals);
                expect(isNiceStep(step), label).toBe(true);
                expect(Math.abs(intervals - whole), label).toBeLessThan(1e-9);
                expect(whole, label).toBeGreaterThanOrEqual(3);
                expect(whole, label).toBeLessThanOrEqual(5);
                axes += 1;
            }
        }
    }
    expect(axes).toBeGreaterThanOrEqual(12);
});

/** The recipe's own snippet, run against the worked cases the prose quotes. */
test('the niceStep recipe lands the worked cases on round axes', () => {
    const marks = visualsSkillFiles['references/marks-and-anatomy.md'] ?? '';
    const recipe = /const niceStep[\s\S]*?const ticks = [^\n]+/u.exec(marks)?.[0] ?? '';
    const axis = new Function('values', `${recipe}\nreturn [step, max, ticks.length];`) as (
        values: number[]
    ) => [number, number, number];
    const cases: [number, number, number][] = [
        [75, 20, 80],
        [282, 100, 300],
        [1342, 500, 1500],
        [8100, 2000, 10_000],
        [63, 20, 80],
        [4, 1, 4],
        [41, 10, 50],
    ];
    for (const [peak, step, max] of cases) {
        const [gotStep, gotMax, labels] = axis([peak]);
        expect([gotStep, gotMax], `peak ${peak}`).toEqual([step, max]);
        expect(labels, `peak ${peak}`).toBeGreaterThanOrEqual(4);
        expect(labels, `peak ${peak}`).toBeLessThanOrEqual(6);
    }
});

/** No chart library survives anywhere in the skill: the agent draws the SVG. */
test('the skill ships no chart library', () => {
    const everyFile = { 'SKILL.md': defaultVisualsSkill, ...visualsSkillFiles };
    for (const [file, text] of Object.entries(everyFile)) {
        expect(text.toLowerCase(), file).not.toContain('chart.js');
        expect(text.toLowerCase(), file).not.toContain('chart.umd');
        expect(text, file).not.toContain('<canvas');
        expect(text, file).not.toContain('new Chart(');
    }
});
