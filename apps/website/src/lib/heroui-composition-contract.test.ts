import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guarded contract for HeroUI composition. See docs/internals/react.md.
 *
 * HeroUI components carry their own padding and gap. Cancelling that spacing at
 * a call site is how a component gets neutralized so hand-drawn layout can take
 * its place — the shape that produced a whole parallel settings row kit, and an
 * invisible card whose only visible effect was indenting its own text.
 *
 * The structural half of this rule (a layout element dropped straight into a
 * compound header or footer) is enforced by the Biome plugins under
 * `apps/website/lint/`. GritQL cannot inspect className strings, which is why
 * this half is a test. Do not widen the allowlist to make the suite pass; a new
 * entry is a deliberate decision that names its reason.
 */

const sourceRoot = join(import.meta.dir, '..');

/**
 * Call sites allowed to cancel a HeroUI component's own spacing. Every entry
 * states why the component is hosting a full-bleed surface rather than content.
 */
const spacingOverrideAllowlist: Record<string, string> = {
    'features/onboarding/cove-meet-step.tsx':
        'Card.Content hosts a two-column split whose halves each carry their own padding and divider',
};

/** Components whose spacing is part of the design system, not a suggestion. */
const spacingOwners = [
    'Card',
    'ItemCard',
    'ItemCardGroup',
    'Modal',
    'Drawer',
    'Sheet',
    'AlertDialog',
];

const cancelledSpacing = ['p-0', 'px-0', 'py-0', 'pt-0', 'pb-0', 'ps-0', 'pe-0', 'gap-0', 'm-0'];

const spacingOverridePattern = new RegExp(
    `<(?:${spacingOwners.join('|')})(?:\\.[A-Za-z]+)?[^>]*className="[^"]*\\b(?:${cancelledSpacing.join('|')})\\b`,
    's'
);

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return listSourceFiles(path);
        }
        if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}

describe('heroui composition contract', () => {
    const files = listSourceFiles(sourceRoot).map((path) => ({
        content: readFileSync(path, 'utf8'),
        path: relative(sourceRoot, path),
    }));

    test('no call site cancels a HeroUI component’s own spacing', () => {
        const offenders = files
            .filter((file) => spacingOverridePattern.test(file.content))
            .filter((file) => !(file.path in spacingOverrideAllowlist))
            .map((file) => file.path);
        expect(offenders).toEqual([]);
    });

    test('the spacing-override allowlist stays honest', () => {
        // Entries must still exist and must still override; stale entries get
        // removed so the list only names real exceptions.
        const byPath = new Map(files.map((file) => [file.path, file.content]));
        for (const path of Object.keys(spacingOverrideAllowlist)) {
            const content = byPath.get(path);
            expect(content, `${path} is allowlisted but no longer exists`).toBeDefined();
            expect(
                content !== undefined && spacingOverridePattern.test(content),
                `${path} no longer overrides HeroUI spacing; remove its allowlist entry`
            ).toBe(true);
        }
    });
});
