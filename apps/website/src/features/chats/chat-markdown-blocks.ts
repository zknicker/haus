export type ChatMarkdownBlock =
    | ChatMarkdownHeadingBlock
    | ChatMarkdownProseBlock
    | ChatMarkdownTableBlock;

export interface ChatMarkdownHeadingBlock {
    depth: number;
    kind: 'heading';
    start: number;
    text: string;
    textStart: number;
}

export interface ChatMarkdownTableBlock {
    kind: 'table';
    start: number;
    text: string;
}

interface ChatMarkdownProseBlock {
    kind: 'prose';
    start: number;
    text: string;
}

export function parseChatMarkdownBlocks(content: string): ChatMarkdownBlock[] {
    const blocks: ChatMarkdownBlock[] = [];
    const lines = splitMarkdownLines(content);
    let proseStart: number | null = null;
    let prose = '';
    let offset = 0;
    let index = 0;
    let inFence: null | string = null;

    const flushProse = () => {
        if (proseStart === null) {
            return;
        }

        const trimmed = trimBoundaryNewlines(prose);

        blocks.push({
            kind: 'prose',
            start: proseStart + trimmed.startOffset,
            text: trimmed.text,
        });

        prose = '';
        proseStart = null;
    };

    while (index < lines.length) {
        const line = lines[index] ?? '';
        const lineText = stripNewline(line);
        const fence = matchFence(lineText);

        if (fence) {
            inFence = inFence === fence ? null : (inFence ?? fence);
        }

        const table = inFence ? null : matchTable(lines, index, offset);

        if (table) {
            flushProse();
            blocks.push(table.block);
            offset = table.end;
            index = table.nextIndex;
            continue;
        }

        const heading = inFence ? null : matchHeading(lineText, offset);

        if (heading) {
            flushProse();
            blocks.push(heading);
        } else {
            proseStart ??= offset;
            prose += line;
        }

        offset += line.length;
        index += 1;
    }

    flushProse();
    return blocks.length > 0 ? blocks : [{ kind: 'prose', start: 0, text: content }];
}

function splitMarkdownLines(content: string) {
    if (content.length === 0) {
        return [''];
    }

    return content.match(/[^\n]*(?:\n|$)/gu)?.filter((line) => line.length > 0) ?? [content];
}

function matchHeading(line: string, lineStart: number): ChatMarkdownHeadingBlock | null {
    const match = /^([ \t]{0,3})(#{1,6})([ \t]+)(.*)$/u.exec(line);

    if (!match) {
        return null;
    }

    const [, indent = '', markers = '', separator = '', rawText = ''] = match;
    const text = rawText.replace(/[ \t]+#{1,}[ \t]*$/u, '').trimEnd();

    if (text.length === 0) {
        return null;
    }

    return {
        depth: markers.length,
        kind: 'heading',
        start: lineStart,
        text,
        textStart: lineStart + indent.length + markers.length + separator.length,
    };
}

function matchFence(line: string) {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})/u.exec(line);

    return match?.[1]?.[0] ?? null;
}

const tableDelimiterPattern = /^\s{0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/u;

/**
 * A GFM pipe table, recognized only once its delimiter row has arrived and its
 * cell count matches the header — the same gate remark-gfm applies when the
 * message settles. Until then the lines stay prose, so a half-typed table never
 * flickers into a one-column table and back. The body runs to the last
 * contiguous line that still carries a pipe: stopping there keeps a trailing
 * sentence out of the table rather than swallowing it as a row.
 */
function matchTable(lines: readonly string[], index: number, lineStart: number) {
    const header = stripNewline(lines[index] ?? '');
    const delimiterLine = lines[index + 1];

    if (delimiterLine === undefined) {
        return null;
    }

    const delimiter = stripNewline(delimiterLine);

    if (!(hasUnescapedPipe(header) && tableDelimiterPattern.test(delimiter))) {
        return null;
    }

    if (countCells(header) !== countCells(delimiter)) {
        return null;
    }

    let end = index + 2;

    while (end < lines.length) {
        const row = stripNewline(lines[end] ?? '');

        if (row.trim().length === 0 || matchFence(row) || !hasUnescapedPipe(row)) {
            break;
        }

        end += 1;
    }

    const raw = lines.slice(index, end).join('');

    return {
        block: { kind: 'table', start: lineStart, text: stripNewline(raw) } as const,
        end: lineStart + raw.length,
        nextIndex: end,
    };
}

// `\|` is a literal pipe in GFM, so both of these drop escaped pairs before
// looking at the line. Dropping the pair whole also disposes of `\\`, which
// would otherwise escape the pipe that follows it.
const escapedPairPattern = /\\./gu;

function hasUnescapedPipe(line: string) {
    return line.replace(escapedPairPattern, '').includes('|');
}

function countCells(line: string) {
    const cells = line.trim().replace(escapedPairPattern, '').split('|');

    if (cells[0]?.trim() === '') {
        cells.shift();
    }

    if (cells.length > 0 && cells.at(-1)?.trim() === '') {
        cells.pop();
    }

    return cells.length;
}

function stripNewline(text: string) {
    return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function trimBoundaryNewlines(text: string) {
    const startOffset = /^\n*/u.exec(text)?.[0].length ?? 0;
    const endOffset = /\n*$/u.exec(text)?.[0].length ?? 0;
    const end = endOffset === 0 ? text.length : text.length - endOffset;

    return {
        startOffset,
        text: text.slice(startOffset, end),
    };
}
