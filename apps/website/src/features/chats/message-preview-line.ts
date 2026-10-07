import { splitVisualFences, visualFallbackText } from '@haus/api/widgets/visual';

/**
 * Message content as one line of plain text: a rich reference or link reads as
 * its label (`#product`, `@Blippy`) rather than its Markdown target, a visual
 * fence reads as its title rather than its raw HTML body, Markdown that only
 * exists to shape a block — headings, bullets, emphasis, code ticks — drops
 * away, a backslash escape (`\&\&`, `\*`) reads as the character it protects,
 * and newlines or code fences collapse to single spaces.
 *
 * Every surface that quotes a message without rendering it — a Thread preview
 * row, a Task's title, the Inbox, a Cloud Agent work's detail line — shares
 * this so they cannot disagree about what a quoted line says.
 */
export function messagePreviewLine(content: string) {
    return visualsAsFallbackText(content)
        .replace(markdownLinkPattern, (_match, label: string) => label)
        .replace(blockMarkerPattern, '')
        .replace(emphasisMarkerPattern, '')
        .replace(escapePattern, '$1')
        .replace(/\s+/gu, ' ')
        .trim();
}

/**
 * A visual's body is model-authored HTML, never prose: an open or closed
 * ```visual fence reads as the same fallback label the unavailable state uses.
 */
function visualsAsFallbackText(content: string) {
    return splitVisualFences(content)
        .map((segment) => (segment.kind === 'visual' ? visualFallbackText(segment) : segment.text))
        .join('');
}

/** Mirrors the link grammar `parseHausRichReferences` reads references from. */
const markdownLinkPattern = /(?<!\\)\[([^\]\n]+)\]\((?:[^)\n]+)\)/gu;

/**
 * Heading and bullet markers, which only mean anything at the start of a line.
 * Both require the space Markdown itself requires, so a `#product` reference
 * and a bare `-5m` keep their first character.
 */
const blockMarkerPattern = /^[\t ]*(?:#{1,6}|[*+-])[\t ]+/gmu;

/**
 * Emphasis and code ticks, which carry no meaning once the line is flat. An
 * escaped marker is literal text, so it stays for {@link escapePattern}.
 */
const emphasisMarkerPattern = /(?<!\\)(?:\*\*|__|`)/gu;

/** CommonMark escapes: a backslash before ASCII punctuation is that punctuation. */
const escapePattern = /\\([!-/:-@[-`{-~])/gu;
