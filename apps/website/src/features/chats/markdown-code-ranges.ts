export interface CodeRange {
    end: number;
    kind: 'fence' | 'inline';
    start: number;
    ticks: number;
}

export function readCodeRanges(content: string) {
    const fences = readFenceRanges(content);
    return [...fences, ...readInlineCodeRanges(content, fences)].sort(
        (left, right) => left.start - right.start
    );
}

export function codeRangeAt(ranges: readonly CodeRange[], index: number) {
    return ranges.find((range) => index >= range.start && index < range.end);
}

function readFenceRanges(content: string) {
    const ranges: CodeRange[] = [];
    let open: { marker: string; start: number } | null = null;
    let lineStart = 0;
    for (const line of content.split('\n')) {
        const marker = /^[ \t]{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
        const lineEnd = lineStart + line.length + 1;
        if (marker && !open) {
            open = { marker, start: lineStart };
        } else if (marker && open && closesFence(marker, open.marker)) {
            ranges.push(fence(open.start, Math.min(lineEnd, content.length)));
            open = null;
        }
        lineStart = lineEnd;
    }
    return open ? [...ranges, fence(open.start, content.length)] : ranges;
}

function fence(start: number, end: number) {
    return { end, kind: 'fence', start, ticks: 0 } satisfies CodeRange;
}

function closesFence(marker: string, opening: string) {
    return marker[0] === opening[0] && marker.length >= opening.length;
}

function readInlineCodeRanges(content: string, fences: readonly CodeRange[]) {
    const ranges: CodeRange[] = [];
    for (const match of content.matchAll(/`+/gu)) {
        const start = match.index;
        const inFence = fences.some((range) => start >= range.start && start < range.end);
        const covered = ranges.some((range) => start < range.end);
        if (inFence || covered) {
            continue;
        }
        const end = inlineCodeEnd(content, start + match[0].length, match[0]);
        if (end !== null) {
            ranges.push({ end, kind: 'inline', start, ticks: match[0].length });
        }
    }
    return ranges;
}

function inlineCodeEnd(content: string, from: number, ticks: string) {
    const closing = content.indexOf(ticks, from);
    const lineEnd = content.indexOf('\n', from);
    if (closing === -1 || (lineEnd !== -1 && closing > lineEnd)) {
        return null;
    }
    return closing + ticks.length;
}
