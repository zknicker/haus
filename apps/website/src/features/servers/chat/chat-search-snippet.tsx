import type * as React from 'react';

// Snippets center on the first term hit so long messages still show why they
// matched; every term occurrence inside the window is highlighted.
const snippetWindowChars = 220;
const snippetLeadInChars = 60;

export function renderSnippet(content: string, query: string): React.ReactNode {
    const text = content.replaceAll(/\s+/gu, ' ').trim();
    const terms = query.split(/\s+/u).filter(Boolean).map(escapeRegExp);
    if (terms.length === 0) {
        return clipSnippet(text, 0);
    }

    const pattern = new RegExp(`(?:${terms.join('|')})`, 'giu');
    const firstMatch = text.search(pattern);
    const start = firstMatch <= snippetLeadInChars ? 0 : firstMatch - snippetLeadInChars;
    const window = text.slice(start, start + snippetWindowChars);

    // Adjacent term hits separated only by whitespace merge into one run, so
    // a phrase like "Send me" highlights as a single unbroken mark.
    const runs: { end: number; start: number }[] = [];
    for (const match of window.matchAll(pattern)) {
        const previous = runs.at(-1);
        if (previous && /^\s*$/u.test(window.slice(previous.end, match.index))) {
            previous.end = match.index + match[0].length;
        } else {
            runs.push({ end: match.index + match[0].length, start: match.index });
        }
    }

    const nodes: React.ReactNode[] = [];
    if (start > 0) {
        nodes.push('…');
    }

    let cursor = 0;
    for (const run of runs) {
        if (run.start > cursor) {
            nodes.push(window.slice(cursor, run.start));
        }
        nodes.push(
            <mark
                className="rounded-sm bg-accent/15 px-0.5 font-medium text-accent"
                key={start + run.start}
            >
                {window.slice(run.start, run.end)}
            </mark>
        );
        cursor = run.end;
    }
    if (cursor < window.length) {
        nodes.push(window.slice(cursor));
    }
    if (start + snippetWindowChars < text.length) {
        nodes.push('…');
    }

    return nodes;
}

function clipSnippet(text: string, start: number): string {
    const window = text.slice(start, start + snippetWindowChars);
    return start + snippetWindowChars < text.length ? `${window}…` : window;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}
