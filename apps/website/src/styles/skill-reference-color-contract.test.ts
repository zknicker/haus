import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const productTokensCss = readFileSync(join(import.meta.dir, 'product-tokens.css'), 'utf8');
const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');

function ruleBlock(css: string, selectorAnchor: string): string {
    const start = css.indexOf(selectorAnchor);
    expect(start).toBeGreaterThan(-1);
    const open = css.indexOf('{', start);
    return css.slice(open, css.indexOf('}', open)).replace(/\s+/gu, ' ');
}

describe('Skill reference color contract', () => {
    test('uses a mode-aware purple identity token instead of a status color', () => {
        const darkTokens = ruleBlock(productTokensCss, '\n    :root {');
        const lightTokens = ruleBlock(productTokensCss, ":root[data-theme='light']");

        expect(darkTokens).toContain('--skill-reference: var(--color-purple-400)');
        expect(lightTokens).toContain('--skill-reference: var(--color-purple-700)');
        expect(productTokensCss).toContain('--color-skill-reference: var(--skill-reference)');
    });

    test('shares that identity between the inline Chip and dark preview', () => {
        const chip = ruleBlock(themeCss, '\n    .chip.reference-chip--skill {');
        const contrastCard = ruleBlock(themeCss, '\n    .hover-card__content.haus-hover-card {');

        expect(chip).toContain('--chip-fg: var(--skill-reference)');
        expect(contrastCard).toContain('--skill-reference: var(--color-purple-400)');
        expect(chip).not.toContain('warning');
    });

    test('compensates for the sparkle mark viewbox only inside Skill Chips', () => {
        const mark = ruleBlock(
            themeCss,
            '\n    .chip.reference-chip--skill .reference-chip__mark {'
        );

        expect(mark).toContain('margin-inline-end: calc(var(--spacing) * -0.5)');
        expect(themeCss).not.toContain('.chip.reference-chip--channel .reference-chip__mark');
    });
});
