import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarded contract for the Channel appearance resolution in the theme layer.
 *
 * The Channel mark and label resolve the Channel palette per theme on
 * `.channel-icon-box` and `.reference-chip--channel`, with the always-dark
 * reference preview keyed into the dark branch. The colorless default is a
 * strong translucent foreground wash: the sidebar row's hover and current
 * fills are `--default`, so an opaque box built from that token vanished into
 * the exact states meant to emphasize the row. These tests pin both the
 * mechanism and the minimum visual strength that keeps compact marks legible.
 */

const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');

/** One flat declaration block, whitespace-normalized so formatting cannot fail the contract. */
function ruleBlock(selectorAnchor: string): string {
    const start = themeCss.indexOf(selectorAnchor);
    expect(start).toBeGreaterThan(-1);
    const open = themeCss.indexOf('{', start);
    return themeCss.slice(open, themeCss.indexOf('}', open)).replace(/\s+/gu, ' ');
}

describe('channel appearance contract', () => {
    const lightBox = ruleBlock('\n    .channel-icon-box {');
    const darkBox = ruleBlock('.haus-hover-card .channel-icon-box');
    const lightSidebarBox = ruleBlock("[data-theme='light'] .channel-icon-box--sidebar");

    test('the mark resolves the configured palette per theme', () => {
        expect(lightBox).toMatch(/var\( ?--channel-color-bg-light,/u);
        expect(lightBox).toMatch(/var\( ?--channel-color-light,/u);
        expect(darkBox).toMatch(/var\( ?--channel-color-bg-dark,/u);
        expect(darkBox).toMatch(/var\( ?--channel-color-dark,/u);
    });

    test('the dark branch also serves the always-dark reference preview', () => {
        // Tailwind's `dark:` variant keys on the `.dark` class, which the
        // contrast card never adds — it rebinds tokens instead. The dark
        // palette branch must be reachable from all three scopes.
        const darkSelectors = themeCss.slice(
            themeCss.indexOf("[data-theme='dark'] .channel-icon-box"),
            themeCss.indexOf('.haus-hover-card .channel-icon-box')
        );
        expect(darkSelectors).toContain('.dark .channel-icon-box');
    });

    test('the colorless default is a translucent foreground wash, never an opaque ground fill', () => {
        for (const block of [lightBox, darkBox]) {
            // An alpha wash composites over the row's hover and current
            // fills; `--default` IS those fills, and `--muted` is caption
            // gray — both regressions this contract exists to prevent.
            expect(block).toMatch(/color-mix\(in srgb, var\(--foreground\) \d+%, transparent\)/);
            expect(block).not.toContain('var(--default');
            expect(block).not.toContain('var(--muted');
        }

        expect(lightBox).toContain('var(--foreground) 16%');
        expect(lightBox).toContain('var(--foreground) 86%');
        expect(darkBox).toContain('var(--foreground) 18%');
        expect(darkBox).toContain('var(--foreground) 90%');
    });

    test('the colorless label falls back to foreground ink, not muted', () => {
        const lightLabel = ruleBlock('\n    .chip.reference-chip--channel {');
        const darkLabel = ruleBlock('.dark .chip.reference-chip--channel');
        expect(lightLabel).toContain('var(--channel-color-light, var(--foreground))');
        expect(darkLabel).toContain('var(--channel-color-dark, var(--foreground))');
    });

    test('the larger sidebar mark uses a quieter fill only in the light theme', () => {
        expect(lightSidebarBox).toMatch(/var\( ?--channel-color-bg-sidebar-light,/u);
        expect(lightSidebarBox).toContain('var(--foreground) 14%');
        expect(themeCss).not.toContain('--channel-color-bg-sidebar-dark');
    });

    test('hover moves a reference away from its ground in both themes', () => {
        const lightHover = ruleBlock('\n    .reference-chip-trigger:hover .chip.reference-chip,');
        const darkHover = ruleBlock('.dark .reference-chip-trigger:hover .chip.reference-chip');
        const brightness = (block: string) => {
            const match = block.match(/brightness\(([\d.]+)\)/);
            expect(match).not.toBeNull();
            return Number(match?.[1]);
        };
        // Light text grounds are light: hover deepens. Dark grounds: hover
        // brightens. One shared brightness washed light mode out on hover.
        expect(brightness(lightHover)).toBeLessThan(1);
        expect(brightness(darkHover)).toBeGreaterThan(1);
    });

    test('the icon catalog previews the configured palette per theme', () => {
        const lightSwatch = ruleBlock('\n    .channel-icon-swatches {');
        const darkSwatch = ruleBlock('.dark .channel-icon-swatches');
        expect(lightSwatch).toMatch(/--channel-swatch: var\( ?--channel-color-light,/u);
        expect(darkSwatch).toMatch(/--channel-swatch: var\( ?--channel-color-dark,/u);
    });

    test('a colorless catalog glyph is muted ink, never the full foreground', () => {
        // A thousand solid glyphs at full `--foreground` is the wall of ink
        // this fallback exists to avoid; the chosen cell keeps full strength.
        const lightSwatch = ruleBlock('\n    .channel-icon-swatches {');
        expect(lightSwatch).toMatch(
            /--channel-swatch: var\( ?--channel-color-light, color-mix\(in srgb, var\(--foreground\) \d+%, transparent\) ?\)/u
        );
        expect(lightSwatch).toContain(
            '--channel-swatch-strong: var(--channel-color-light, var(--foreground))'
        );
    });
});
