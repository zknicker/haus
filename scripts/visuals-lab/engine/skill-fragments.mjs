// The copy-ready fragments carried by the visuals skill, read straight out of
// the markdown the skill seeds.
//
// One fragment per file under `fragments/`: a `# Name` heading, a few lines on
// when to use it and what to change, then one ```html fence. A module carries
// only rules and an index pointing here, so a chart turn reads the core, one
// module, and one fragment rather than every fence the skill ships.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The skill directory this repo publishes, source of truth for every module. */
export const skillDir = path.join(here, '../../../packages/agent-workspace/src/visuals-skill');

/** The topic modules, in reading order. They carry rules and an index, no fences. */
export const skillModules = [
    'design-system.md',
    'charts.md',
    'marks-and-anatomy.md',
    'interaction.md',
    'anti-patterns.md',
    'diagrams.md',
    'components.md',
    'pages.md',
    'icons.md',
];

/** Every fragment file name, sorted, as the seeded skill carries them. */
export const fragmentFiles = (directory = skillDir) =>
    readdirSync(path.join(directory, 'fragments'))
        .filter((file) => file.endsWith('.md'))
        .sort();

/**
 * The one ```html fence in a fragment file, with the `# Name` heading above it.
 * `kind` is `page` for a whole artifact document and `visual` for a fence body;
 * the two obey different rules and only the second renders in the visual frame.
 */
export function extractFragment(markdown, file) {
    const lines = markdown.split('\n');
    const heading = /^#\s+(.+?)\s*$/mu.exec(markdown);
    const open = lines.findIndex((line) => line.trimEnd() === '```html');
    if (open === -1) {
        return null;
    }
    let end = open + 1;
    while (end < lines.length && lines[end].trimEnd() !== '```') {
        end += 1;
    }
    const html = lines.slice(open + 1, end).join('\n');
    return {
        html,
        kind: /^\s*<!doctype/iu.test(html) ? 'page' : 'visual',
        module: `fragments/${file}`,
        name: heading ? heading[1] : file.replace(/\.md$/u, ''),
        slug: file.replace(/\.md$/u, ''),
    };
}

/** Every fragment the skill ships, read from disk at call time. */
export function readSkillFragments(directory = skillDir) {
    return fragmentFiles(directory)
        .map((file) =>
            extractFragment(readFileSync(path.join(directory, 'fragments', file), 'utf8'), file)
        )
        .filter((fragment) => fragment !== null);
}
