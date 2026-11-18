import { describe, expect, test } from 'bun:test';
import {
    OUTPUT_PATH,
    renderSwiftSource,
    resolveTokens,
} from '../../../../scripts/agent-html-tokens/generate-ios-tokens.ts';
import { agentHtmlTokenNames } from './tokens.ts';

/**
 * The generator lives under `scripts/`, but its test lives here on purpose: it
 * resolves the app's stylesheets, `@heroui-pro/react/dist/css/index.css` among
 * them, and that dist is a licensed download the Quality job deliberately does
 * not fetch. `apps/website/src` is exactly the tree whose tests are heavy for
 * that reason, so `test:app-unit` owns this drift gate rather than `test:fast`.
 */
/**
 * Names the contract used to publish as aliases. Nothing emits them any more:
 * a stored visual that references one must be reauthored.
 */
const retiredTokenNames = [
    '--font-heading',
    '--app-code-font-size',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--subtle',
    '--foreground-quaternary',
    '--brand',
    '--brand-foreground',
    '--brand-muted',
    '--brand-muted-foreground',
    '--destructive',
    '--destructive-foreground',
    '--info',
    '--info-foreground',
    '--info-bg',
    '--input',
    '--ring',
    '--surface-shadow',
    '--overlay-shadow',
    '--t-micro',
    '--t-fast',
    '--t-normal',
    '--t-slow',
    '--ease-out',
    '--ease-in',
    '--ease-standard',
    '--radius-sm',
    '--radius-md',
    '--radius-lg',
    '--radius-xl',
    '--radius-2xl',
    '--label-amber-fg',
    '--label-blue-fg',
    '--label-gray-fg',
    '--label-green-fg',
    '--label-orange-fg',
    '--label-pink-fg',
    '--label-purple-fg',
    '--label-red-fg',
    '--label-teal-fg',
];

describe('agent-html iOS token snapshot', () => {
    test('the checked-in Swift table matches a fresh generation', async () => {
        const checkedIn = await Bun.file(OUTPUT_PATH).text();

        expect(checkedIn).toBe(renderSwiftSource());
    });

    test('every taught name is resolved for both schemes, and nothing else', () => {
        for (const scheme of ['dark', 'light'] as const) {
            const names = resolveTokens(scheme).map((token) => token.name);

            expect(names).toEqual([...agentHtmlTokenNames, '--chart-grid', '--chart-label']);
            expect(names).toHaveLength(40);
        }
    });

    test('the taught vocabulary is 40 names: 38 snapshotted plus the derived pair', () => {
        expect(agentHtmlTokenNames.length).toBe(38);
        expect(agentHtmlTokenNames.length + 2).toBe(40);
    });

    test('no retired name survives in the emitted list or the generated table', () => {
        const emitted = new Set<string>(agentHtmlTokenNames);
        const swift = renderSwiftSource();

        for (const retired of retiredTokenNames) {
            expect(emitted.has(retired)).toBe(false);
            expect(swift).not.toContain(`name: "${retired}"`);
        }
    });

    test('the layout tier resolves to the HeroUI steps it derives from', () => {
        const dark = new Map(resolveTokens('dark').map((token) => [token.name, token.value]));

        // Fields tier off a 6px --radius, and the capped shell tier.
        expect(dark.get('--radius')).toBe('9px');
        expect(dark.get('--radius-card')).toBe('18px');
        // --spacing is 3.75px: the Card pad, the item pad, the control pad.
        expect(dark.get('--pad-lg')).toBe('15px');
        expect(dark.get('--pad-md')).toBe('11.25px');
        expect(dark.get('--pad-sm')).toBe('7.5px');
        expect(dark.get('--gap-xs')).toBe('3.75px');
    });

    test('no resolved value leaks an unevaluated expression', () => {
        for (const scheme of ['dark', 'light'] as const) {
            for (const token of resolveTokens(scheme)) {
                expect(token.value).not.toContain('var(');
                expect(token.value).not.toContain('calc(');
                // The shell tier carries a `min()` cap; it folds too.
                expect(token.value).not.toContain('min(');
                expect(token.value).not.toContain('max(');
            }
        }
    });
});
