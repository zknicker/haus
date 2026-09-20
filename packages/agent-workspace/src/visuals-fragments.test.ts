import { expect, test } from 'bun:test';
import { agentHtmlTokenNames } from '../../../apps/website/src/agent-html/tokens.ts';
import {
    extractFragment,
    fragmentFiles,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { visualsSkillFiles } from './managed-skills.ts';

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
const chartFragments = visualFragments.filter((fragment) => fragment.html.includes('<canvas'));
const publishedTokens = new Set<string>([...agentHtmlTokenNames, '--chart-grid', '--chart-label']);

test('the skill ships a fragment file for every shape it teaches', () => {
    expect(fragments.length).toBe(fragmentFiles().length);
    expect(visualFragments.length).toBeGreaterThanOrEqual(25);
    expect(chartFragments.length).toBeGreaterThanOrEqual(9);
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
        // An `rgba(` the alpha helper builds by concatenation is fine — it is
        // computed from a token. A literal one is a color that cannot follow
        // the theme.
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
        for (const [, style] of fragment.html.matchAll(/style="([^"]*)"/gu)) {
            if (!style.includes('border:1px solid var(--border)')) {
                continue;
            }
            expect(style, fragment.slug).toContain('var(--surface)');
            expect(style, fragment.slug).toContain('var(--radius-card)');
        }
    }
});

test('every canvas states its takeaway and keeps its numbers', () => {
    for (const fragment of chartFragments) {
        for (const [, open, fallback] of fragment.html.matchAll(
            /(<canvas\b[^>]*>)([\s\S]*?)<\/canvas>/giu
        )) {
            expect(open, fragment.slug).toContain('role="img"');
            expect(open, fragment.slug).toMatch(/aria-label="[^"]{20,}"/u);
            expect(fallback.trim().length, `${fragment.slug} canvas fallback`).toBeGreaterThan(10);
        }
    }
});

test('every chart fragment opens with the hidden summary and holds the Chart.js floor', () => {
    for (const fragment of chartFragments) {
        expect(fragment.html, fragment.slug).toContain(
            '<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">'
        );
        expect(fragment.html, fragment.slug).toContain('animation: false');
        expect(fragment.html, fragment.slug).toContain('legend: { display: false }');
        // Numbers are formatted where they reach the screen: in the tooltip
        // always, and on the ticks of any chart that draws an axis.
        expect(fragment.html, fragment.slug).toContain('tooltip: { callbacks:');
        if (fragment.html.includes('scales: {')) {
            // Singular `callback:` is the tick formatter; the tooltip's is plural.
            expect(fragment.html, fragment.slug).toMatch(/\bcallback: \(value/u);
        }
        expect(fragment.html, fragment.slug).toContain(
            'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js'
        );
    }
});
