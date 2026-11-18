/**
 * Emits the bundled app icon geometry for the native iPhone app.
 *
 * The two clients share one icon vocabulary and this script keeps it that way
 * mechanically: it reads the hugeicons names the App's own React source
 * imports, rather than curating a second list that could drift. `HausIconName`
 * on the Swift side then picks which of those names the phone actually shows.
 *
 * App iconography is the stroke-rounded family, not the solid-rounded one the
 * channel glyphs use, so every element arrives as a stroked path and keeps its
 * width, cap, and join for the Swift renderer.
 *
 *   bun apps/ios-swift/scripts/generate-ui-icon-paths.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertIcons, report } from './hugeicon-paths.ts';

const iosRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(iosRoot, '../..');
const appSource = join(repoRoot, 'apps/website/src');
const iconDistPath = join(
    repoRoot,
    'apps/website/node_modules/@hugeicons-pro/core-stroke-rounded/dist/esm'
);
const outputPath = join(iosRoot, 'Sources/HausUI/Resources/ui-icons.json');
const swiftIconSource = join(iosRoot, 'Sources/HausUI/Icon/HausIcon.swift');

const imported = [...new Set(collectImportedNames(appSource))];

if (imported.length === 0) {
    throw new Error(`No hugeicons imports found under ${appSource}.`);
}

// The phone draws what `HausIconName` names, so those are read back out the
// same way and are the ones that must resolve. Anything the App imports comes
// along for free, which is what keeps a later Swift call site from having to
// pick a second icon for a concept the App has already named.
const required = [...new Set(collectSwiftNames(swiftIconSource))];
const available = new Set(
    readdirSync(iconDistPath)
        .filter((file) => file.endsWith('.js'))
        .map((file) => file.slice(0, -3))
);

const unavailable = required.filter((name) => !available.has(name));
if (unavailable.length > 0) {
    throw new Error(
        `HausIconName asks for ${unavailable.join(', ')}, which the stroke-rounded family does not carry.`
    );
}

const names = [...new Set([...imported, ...required])].filter((name) => available.has(name));
const result = await convertIcons(iconDistPath, names);

const unrenderable = required.filter((name) => !result.icons[name]);
if (unrenderable.length > 0) {
    throw new Error(`No renderable geometry for ${unrenderable.join(', ')}.`);
}

writeFileSync(outputPath, `${JSON.stringify({ icons: result.icons, version: 1 })}\n`);

report(outputPath, result, statSync(outputPath).size);
const iosOnly = required.filter((name) => !imported.includes(name));
console.log(
    `  named by the phone but not by the App: ${iosOnly.length}${iosOnly.length ? ` (${iosOnly.join(', ')})` : ''}`
);
console.log(
    `  App names not in the stroke-rounded family: ${imported.filter((name) => !available.has(name)).join(', ') || 'none'}`
);

/** Every hugeicons name `HausIconName` carries as a raw value. */
function collectSwiftNames(path: string): string[] {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/case\s+\w+\s*=\s*"([A-Z][A-Za-z0-9]*Icon)"/gu)].map(
        (match) => match[1]
    );
}

/** Every `*Icon` identifier the App imports from a hugeicons package. */
function collectImportedNames(root: string): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            found.push(...collectImportedNames(path));
            continue;
        }
        if (!(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            continue;
        }
        // The generated channel catalog imports a thousand-name pictorial set
        // that is already shipped as `channel-icons.json` in the solid family.
        // App iconography is only what the product's own screens import.
        if (entry.name.endsWith('.generated.ts')) {
            continue;
        }
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@hugeicons[^']*'/gu)) {
            for (const identifier of match[1].matchAll(/\b([A-Z][A-Za-z0-9]*Icon)\b/gu)) {
                found.push(identifier[1]);
            }
        }
    }

    return found;
}
