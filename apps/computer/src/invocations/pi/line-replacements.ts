export interface TextReplacement {
    matchIndex: number;
    matchLength: number;
    newText: string;
}

interface LineSpan {
    end: number;
    start: number;
}

export function applyReplacements(content: string, replacements: TextReplacement[], offset = 0) {
    let result = content;
    for (const replacement of [...replacements].reverse()) {
        const matchIndex = replacement.matchIndex - offset;
        result =
            result.slice(0, matchIndex) +
            replacement.newText +
            result.slice(matchIndex + replacement.matchLength);
    }
    return result;
}

export function widenReplacementsToLines(
    originalContent: string,
    baseContent: string,
    replacements: TextReplacement[]
) {
    const originalLines = getLineSpans(originalContent);
    const baseLines = getLineSpans(baseContent);
    if (originalLines.length !== baseLines.length) {
        throw new Error(
            'Cannot preserve unchanged lines because the base content has a different line count.'
        );
    }

    const groups: { endLine: number; replacements: TextReplacement[]; startLine: number }[] = [];
    for (const replacement of [...replacements].sort((a, b) => a.matchIndex - b.matchIndex)) {
        const range = getReplacementLineRange(baseLines, replacement);
        const current = groups.at(-1);
        if (current && range.startLine < current.endLine) {
            current.endLine = Math.max(current.endLine, range.endLine);
            current.replacements.push(replacement);
            continue;
        }
        groups.push({ ...range, replacements: [replacement] });
    }

    return groups.map((group) => {
        const groupStart = lineAt(baseLines, group.startLine).start;
        const groupEnd = lineAt(baseLines, group.endLine - 1).end;
        const originalStart = lineAt(originalLines, group.startLine).start;
        return {
            matchIndex: originalStart,
            matchLength: lineAt(originalLines, group.endLine - 1).end - originalStart,
            newText: applyReplacements(
                baseContent.slice(groupStart, groupEnd),
                group.replacements,
                groupStart
            ),
        };
    });
}

function getLineSpans(content: string) {
    let offset = 0;
    return (content.match(/[^\n]*\n|[^\n]+/gu) ?? []).map((line) => {
        const span = { end: offset + line.length, start: offset };
        offset = span.end;
        return span;
    });
}

function lineAt(lines: LineSpan[], index: number) {
    const line = lines[index];
    if (!line) {
        throw new Error('Replacement range is outside the base content.');
    }
    return line;
}

function getReplacementLineRange(lines: LineSpan[], replacement: TextReplacement) {
    const replacementStart = replacement.matchIndex;
    const replacementEnd = replacement.matchIndex + replacement.matchLength;
    const startLine = lines.findIndex(
        (line) => replacementStart >= line.start && replacementStart < line.end
    );
    if (startLine === -1) {
        throw new Error('Replacement range is outside the base content.');
    }
    let endLine = startLine;
    while (endLine < lines.length && lineAt(lines, endLine).end < replacementEnd) {
        endLine++;
    }
    if (endLine >= lines.length) {
        throw new Error('Replacement range is outside the base content.');
    }
    return { endLine: endLine + 1, startLine };
}
