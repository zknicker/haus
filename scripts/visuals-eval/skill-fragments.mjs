// The copy-ready fragments carried by the visuals skill modules, read straight
// out of the markdown the skill seeds.
//
// A fragment is a ```html fence under a `###` heading. The fence language is
// the opt-in: prose in these files uses a bare ``` for snippets that are not
// meant to be copied whole, and only ```html blocks are rendered, linted, and
// shown in the lab gallery.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The skill directory this repo publishes, source of truth for every module. */
export const skillDir = path.join(here, '../../packages/agent-workspace/src/visuals-skill');

/** Every module that may carry fragments, in reading order. */
export const fragmentModules = [
    'design-system.md',
    'charts.md',
    'diagrams.md',
    'components.md',
    'pages.md',
];

const slugify = (text) =>
    text
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');

/**
 * Every ```html fence in one module, tagged with the `###` heading above it.
 * `kind` is `page` for a whole artifact document and `visual` for a fence body;
 * the two obey different rules and only the second renders in the visual frame.
 */
export function extractFragments(markdown, module) {
    const fragments = [];
    const lines = markdown.split('\n');
    const seen = new Map();
    let heading = module.replace(/\.md$/u, '');
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const headingMatch = /^###\s+(.+?)\s*$/u.exec(line);
        if (headingMatch) {
            heading = headingMatch[1];
            index += 1;
            continue;
        }
        if (line.trimEnd() !== '```html') {
            index += 1;
            continue;
        }
        const start = index + 1;
        let end = start;
        while (end < lines.length && lines[end].trimEnd() !== '```') {
            end += 1;
        }
        const count = (seen.get(heading) ?? 0) + 1;
        seen.set(heading, count);
        const html = lines.slice(start, end).join('\n');
        const name = count === 1 ? heading : `${heading} (${count})`;
        fragments.push({
            html,
            kind: /^\s*<!doctype/iu.test(html) ? 'page' : 'visual',
            line: start,
            module,
            name,
            slug: `${slugify(module.replace(/\.md$/u, ''))}-${slugify(name)}`,
        });
        index = end + 1;
    }

    return fragments;
}

/** Every fragment in every module, read from disk at call time. */
export function readSkillFragments(directory = skillDir) {
    return fragmentModules.flatMap((module) => {
        const source = readFileSync(path.join(directory, module), 'utf8');
        return extractFragments(source, module);
    });
}
