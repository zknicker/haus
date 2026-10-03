import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// An upgrade renames the patchedDependencies key, so this fails until someone re-checks the
// patch's removal condition in docs/operations/dependency-patches.md.
const root = join(import.meta.dir, '..');
const patched: Record<string, string> = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
).patchedDependencies;
const rows = documentedPatches(
    readFileSync(join(root, 'docs/operations/dependency-patches.md'), 'utf8')
);

test('every patched dependency has exactly one documented row, and every row a patch', () => {
    expect(rows.map((row) => row.key).sort()).toEqual(Object.keys(patched).sort());
});

test('every documented patch names a removal condition', () => {
    for (const row of rows) {
        expect({ key: row.key, removeWhen: row.removeWhen.length > 0 }).toEqual({
            key: row.key,
            removeWhen: true,
        });
    }
});

test('every patchedDependencies entry points at a checked-in patch without bun tag hunks', () => {
    for (const path of Object.values(patched)) {
        const file = join(root, path);
        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file, 'utf8')).not.toContain('.bun-tag-');
    }
});

/** Table rows whose first cell is a backticked `name@version`. */
function documentedPatches(markdown: string) {
    return markdown
        .split('\n')
        .filter((line) => line.startsWith('| `'))
        .map((line) => {
            const cells = line.split(' | ');
            return {
                key: (cells[0] ?? '').replace('| `', '').replace(/`$/, ''),
                removeWhen: (cells.at(-1) ?? '').replace(/\|$/, '').trim(),
            };
        });
}
