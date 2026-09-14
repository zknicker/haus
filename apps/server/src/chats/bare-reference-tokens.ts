/** One bare `@handle` or `#channel` token an Agent typed in prose. */
export interface BareReferenceToken {
    end: number;
    /** The token without its sigil, lowercased for directory lookup. */
    key: string;
    sigil: '#' | '@';
    start: number;
    text: string;
}

interface ReferenceRange {
    end: number;
    start: number;
}

/**
 * The one rule for what counts as a bare reference in Agent-authored prose.
 *
 * A token is a sigil, then a handle-shaped run, standing on its own: it may sit
 * against any punctuation — inside parentheses, before a comma, at the end of a
 * sentence — but not against another handle character, and not inside code, a
 * fence, an existing Markdown link, or a plain URL.
 *
 * Everything that has to agree on that rule reads it here: the canonicalizer
 * that rewrites these tokens into stable links, and the Agent-creation gate that
 * requires the announcement to name the new teammate.
 */
export function readBareReferenceTokens(content: string): BareReferenceToken[] {
    const protectedRanges = readProtectedRanges(content);
    const tokens: BareReferenceToken[] = [];
    const tokenPattern = /(?:@[A-Za-z0-9][A-Za-z0-9_-]{0,31}|#[A-Za-z0-9_-]{1,32})/gu;

    for (const match of content.matchAll(tokenPattern)) {
        const text = match[0];
        const start = match.index;
        if (!(text && start !== undefined)) {
            continue;
        }
        const end = start + text.length;
        if (
            isProtectedRange(protectedRanges, start, end) ||
            isInsidePlainUrl(content, start) ||
            !hasTokenBoundary(content[start - 1]) ||
            !hasTokenBoundary(content[end])
        ) {
            continue;
        }
        tokens.push({
            end,
            key: text.slice(1).toLocaleLowerCase('en-US'),
            sigil: text.startsWith('@') ? '@' : '#',
            start,
            text,
        });
    }

    return tokens;
}

/** Whether prose names one Agent by the bare `@handle` a reader can click. */
export function mentionsBareAgentHandle(content: string, handle: string): boolean {
    const wanted = handle.toLocaleLowerCase('en-US');
    return readBareReferenceTokens(content).some(
        (token) => token.sigil === '@' && token.key === wanted
    );
}

function hasTokenBoundary(character: string | undefined) {
    return !(character && /[-A-Za-z0-9_@#]/u.test(character));
}

function isInsidePlainUrl(content: string, start: number) {
    return /(?:https?:\/\/|www\.)[^\s]*$/iu.test(content.slice(0, start));
}

function readProtectedRanges(content: string): ReferenceRange[] {
    const ranges = readMarkdownLinkRanges(content);
    const fences = readFenceRanges(content);
    ranges.push(...fences);
    ranges.push(...readInlineCodeRanges(content, fences));
    return mergeRanges(ranges);
}

function readMarkdownLinkRanges(content: string): ReferenceRange[] {
    const ranges: ReferenceRange[] = [];
    const linkPattern = /!?\[[^\]\n]*\]\([^)\n]*\)/gu;
    for (const match of content.matchAll(linkPattern)) {
        if (match[0] && match.index !== undefined) {
            ranges.push({ end: match.index + match[0].length, start: match.index });
        }
    }
    return ranges;
}

function readFenceRanges(content: string): ReferenceRange[] {
    const ranges: ReferenceRange[] = [];
    let fence: { character: string; length: number; start: number } | null = null;
    let lineStart = 0;

    while (lineStart <= content.length) {
        const newline = content.indexOf('\n', lineStart);
        const lineEnd = newline === -1 ? content.length : newline;
        const line = content.slice(lineStart, lineEnd);
        const marker = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/u)?.[1];

        if (marker) {
            if (!fence) {
                fence = { character: marker[0], length: marker.length, start: lineStart };
            } else if (marker[0] === fence.character && marker.length >= fence.length) {
                ranges.push({
                    end: newline === -1 ? content.length : newline + 1,
                    start: fence.start,
                });
                fence = null;
            }
        }

        if (newline === -1) {
            break;
        }
        lineStart = newline + 1;
    }

    if (fence) {
        ranges.push({ end: content.length, start: fence.start });
    }
    return ranges;
}

function readInlineCodeRanges(content: string, fences: ReferenceRange[]): ReferenceRange[] {
    const ranges: ReferenceRange[] = [];
    let index = 0;
    while (index < content.length) {
        if (isProtectedRange(fences, index, index + 1)) {
            index += 1;
            continue;
        }
        if (content[index] !== '`') {
            index += 1;
            continue;
        }

        const start = index;
        while (content[index] === '`') {
            index += 1;
        }
        const length = index - start;
        const closing = content.indexOf('`'.repeat(length), index);
        const lineEnd = content.indexOf('\n', index);
        if (closing === -1 || (lineEnd !== -1 && closing > lineEnd)) {
            continue;
        }
        const end = closing + length;
        ranges.push({ end, start });
        index = end;
    }
    return ranges;
}

function isProtectedRange(ranges: ReferenceRange[], start: number, end: number) {
    return ranges.some((range) => start >= range.start && end <= range.end);
}

function mergeRanges(ranges: ReferenceRange[]) {
    const sorted = [...ranges].sort((left, right) => left.start - right.start);
    const merged: ReferenceRange[] = [];
    for (const range of sorted) {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end) {
            previous.end = Math.max(previous.end, range.end);
        } else {
            merged.push({ ...range });
        }
    }
    return merged;
}
