type LineEnding = '\n' | '\r' | '\r\n';

interface SourceLine {
    ending: LineEnding | null;
    text: string;
}

export interface Replacement {
    newLines: readonly string[];
    oldLength: number;
    start: number;
}

export function parseSourceFile(contents: string) {
    const lines: SourceLine[] = [];
    let preferredEnding: LineEnding | null = null;
    let lineStart = 0;
    for (const match of contents.matchAll(/\r\n|\r|\n/gu)) {
        const ending = match[0] as LineEnding;
        preferredEnding ??= ending;
        lines.push({ ending, text: contents.slice(lineStart, match.index) });
        lineStart = match.index + ending.length;
    }
    if (lineStart < contents.length) {
        lines.push({ ending: null, text: contents.slice(lineStart) });
    }
    return { lines, preferredEnding: preferredEnding ?? '\n' };
}

export function applyReplacements(
    file: ReturnType<typeof parseSourceFile>,
    replacements: readonly Replacement[]
) {
    const lines: SourceLine[] = [];
    let sourceIndex = 0;
    for (const { newLines, oldLength, start } of replacements) {
        lines.push(...file.lines.slice(sourceIndex, start));
        lines.push(...newLines.map((text) => ({ ending: file.preferredEnding, text })));
        sourceIndex = start + oldLength;
    }
    lines.push(...file.lines.slice(sourceIndex));
    return lines.map(({ ending, text }) => `${text}${ending ?? file.preferredEnding}`).join('');
}
