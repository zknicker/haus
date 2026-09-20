// The prose a turn shipped around its visual, as HTML for the page.
//
// `marked` is borrowed from the website package so the reply renders with the
// same markdown parser the product uses.
import { createRequire } from 'node:module';
import path from 'node:path';
import { repoRoot } from './before-skill.mjs';

const { marked } = createRequire(path.join(repoRoot, 'apps/website/package.json'))('marked');

/** The reply with its visual fences removed, rendered and scrubbed. */
export const replyToHtml = (markdown) =>
    scrubHtml(marked.parse(stripVisualFences(markdown), { async: false, gfm: true }));

// The frame above already shows the visual, so the prose below it must not
// repeat the fence body. An unterminated fence (a truncated reply) drops
// everything from the opener rather than leaking raw markup into the page.
export const stripVisualFences = (markdown) => {
    const stripped = markdown.replaceAll(
        /^[ \t]*```(?:visual|artifact)\b[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*(?:\n|$)/gmu,
        ''
    );
    const dangling = stripped.search(/^[ \t]*```(?:visual|artifact)\b/mu);
    return dangling === -1 ? stripped : stripped.slice(0, dangling);
};

// Our own agents' output, so this is hygiene rather than a security boundary:
// no scripts, no inline event handlers.
function scrubHtml(html) {
    return html
        .replaceAll(/<script\b[\s\S]*?(?:<\/script\s*>|$)/giu, '')
        .replaceAll(/\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '');
}
