import * as z from 'zod';

/**
 * Generative visual: the fence body is model-authored HTML/SVG rendered in a
 * sandboxed opaque-origin iframe. The body is attacker-controlled content —
 * this schema enforces shape and size only; containment is the renderer's
 * sandbox (never allow-same-origin, CSP-pinned external sources).
 *
 * Authored as a ```visual fence (raw HTML body, optional info-string title),
 * not a widget:<name> JSON fence; it rides the widget render envelope for
 * persistence and replay.
 */

export const visualBodyLimit = 60_000;

export const widgetVisualPropsSchema = z
    .object({
        html: z.string().min(1).max(visualBodyLimit),
        title: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

export type WidgetVisualProps = z.output<typeof widgetVisualPropsSchema>;

/**
 * Fallback text for a visual: explicit title, else the document's <title>,
 * else the first h1-h3 heading, else a generic label. Used for notification
 * previews, search, and the unavailable state.
 */
export function visualFallbackText(props: { html?: unknown; title?: unknown }): string {
    const title = typeof props.title === 'string' ? props.title.trim() : '';
    if (title) {
        return title.slice(0, 500);
    }

    const html = typeof props.html === 'string' ? props.html : '';
    const documentTitle = extractTagText(html, /<title[^>]*>([\s\S]*?)<\/title>/iu);
    if (documentTitle) {
        return documentTitle;
    }

    const heading = extractTagText(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/iu);
    return heading ?? 'Visual';
}

export type VisualFenceSegment =
    | { kind: 'text'; text: string }
    | { html: string; kind: 'visual'; open: boolean; title?: string };

/** The tag that opens a visual: exactly three backticks and the word. */
const visualFenceTag = '```visual';

/** A backtick or tilde run opening a fenced block of some other language. */
const enclosingFenceOpenPattern = /^[ \t]{0,3}(`{3,}|~{3,})/u;
const closingRunPattern = /`{3,}/u;

/**
 * Split message content into prose and visual-fence segments, in order.
 * Closed fences yield complete visuals; an unclosed fence yields an open
 * visual with the partial body streamed so far.
 *
 * The grammar is deliberately forgiving about where the fence sits, because
 * one missing newline used to turn a whole answer into raw markup: the tag
 * opens a fence at the start of a line *or* glued to the end of a sentence
 * ("…a $964 run rate.```visual Sales"), and the body ends at the first
 * backtick run of a body line, whether that run stands alone or is glued to
 * the markup ("</script>```"). Text on either side of the fence stays prose.
 *
 * It stays strict about what a fence is. Whitespace in front of the tag means
 * prose ("a ```visual fence" and an indented block both read as text), a
 * backtick in front means a longer fence or inline code, the info word must be
 * exactly `visual`, and a tag inside another fenced block — the ```` ```` ````
 * examples the visuals skill itself ships — belongs to that block.
 */
export function splitVisualFences(content: string): VisualFenceSegment[] {
    const segments: VisualFenceSegment[] = [];
    let textStart = 0;
    let cursor = 0;
    let enclosingRun: string | null = null;

    while (cursor <= content.length) {
        const lineEnd = lineEndIndex(content, cursor);
        const line = content.slice(cursor, lineEnd);
        // A fence only opens or closes at a true line start; after a closing
        // run the cursor sits mid-line, and the rest of that line is prose.
        const startsLine = cursor === 0 || content[cursor - 1] === '\n';

        if (enclosingRun) {
            if (startsLine && closesEnclosingFence(line, enclosingRun)) {
                enclosingRun = null;
            }
            cursor = lineEnd + 1;
            continue;
        }

        const opener = findVisualOpener(content, cursor, line);

        if (opener === null) {
            if (startsLine) {
                enclosingRun = enclosingFenceOpenPattern.exec(line)?.[1] ?? null;
            }
            cursor = lineEnd + 1;
            continue;
        }

        if (opener > textStart) {
            segments.push({ kind: 'text', text: content.slice(textStart, opener) });
        }

        const fence = readVisualFence(content, opener, lineEnd);
        segments.push(visualSegment(fence.title, fence.html, fence.open));
        textStart = fence.end;
        cursor = fence.end;
    }

    if (textStart < content.length) {
        segments.push({ kind: 'text', text: content.slice(textStart) });
    }

    return segments;
}

/** The absolute index of the first real fence opener on this line, if any. */
function findVisualOpener(content: string, lineStart: number, line: string): number | null {
    let from = 0;

    while (from <= line.length) {
        const index = line.indexOf(visualFenceTag, from);

        if (index < 0) {
            return null;
        }

        const absolute = lineStart + index;
        const before = absolute === 0 ? '\n' : (content[absolute - 1] ?? '\n');
        const after = line[index + visualFenceTag.length];
        const opensFence = before === '\n' || !/[\s`]/u.test(before);
        const wordEnds = after === undefined || /\s/u.test(after);

        if (opensFence && wordEnds) {
            return absolute;
        }

        from = index + 1;
    }

    return null;
}

/**
 * The fence that starts at `opener`: its title, its body, and the index the
 * message resumes at. The body ends at the first backtick run of a body line —
 * on its own line the run drops the newline before it, glued to the markup it
 * keeps that line — and anything after the run on that line is prose again.
 */
function readVisualFence(content: string, opener: number, openerLineEnd: number) {
    const title = content.slice(opener + visualFenceTag.length, openerLineEnd).trim();

    if (openerLineEnd >= content.length) {
        return { end: content.length, html: '', open: true, title };
    }

    const bodyStart = openerLineEnd + 1;
    let lineStart = bodyStart;

    while (lineStart <= content.length) {
        const lineEnd = lineEndIndex(content, lineStart);
        const line = content.slice(lineStart, lineEnd);
        const run = closingRunPattern.exec(line);

        if (run) {
            const closer = lineStart + run.index;
            const ownLine = line.slice(0, run.index).trim().length === 0;
            const bodyEnd = ownLine ? Math.max(bodyStart, lineStart - 1) : closer;

            return {
                end: closer + run[0].length,
                html: content.slice(bodyStart, bodyEnd),
                open: false,
                title,
            };
        }

        lineStart = lineEnd + 1;
    }

    return { end: content.length, html: content.slice(bodyStart), open: true, title };
}

function closesEnclosingFence(line: string, enclosingRun: string) {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\r?$/u.exec(line)?.[1];

    return match !== undefined && match[0] === enclosingRun[0] && match.length >= enclosingRun.length;
}

function lineEndIndex(content: string, from: number) {
    const index = content.indexOf('\n', from);

    return index < 0 ? content.length : index;
}

function visualSegment(title: string | undefined, html: string, open: boolean): VisualFenceSegment {
    const trimmedTitle = title?.trim();
    return {
        html,
        kind: 'visual',
        open,
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
    };
}

function extractTagText(html: string, pattern: RegExp): string | null {
    const match = html.match(pattern);
    if (!match?.[1]) {
        return null;
    }
    const text = match[1]
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return text.length > 0 ? text.slice(0, 500) : null;
}
