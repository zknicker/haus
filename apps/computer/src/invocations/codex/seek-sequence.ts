const dashes = /[‐-―−]/gu;
const singleQuotes = /[‘-‛]/gu;
const doubleQuotes = /[“-‟]/gu;
const spaces = /[  -   　]/gu;

const comparisons = [
    (line: string) => line,
    (line: string) => line.trimEnd(),
    (line: string) => line.trim(),
    (line: string) =>
        line
            .trim()
            .replace(dashes, '-')
            .replace(singleQuotes, "'")
            .replace(doubleQuotes, '"')
            .replace(spaces, ' '),
];

export function seekSequence(
    lines: readonly string[],
    pattern: readonly string[],
    start: number,
    eof: boolean
) {
    if (pattern.length === 0) {
        return start;
    }
    if (pattern.length > lines.length) {
        return null;
    }
    const searchStart = eof ? Math.max(lines.length - pattern.length, start) : start;
    for (const normalize of comparisons) {
        for (let index = searchStart; index <= lines.length - pattern.length; index += 1) {
            if (
                pattern.every(
                    (expected, offset) =>
                        normalize(lines[index + offset] ?? '') === normalize(expected)
                )
            ) {
                return index;
            }
        }
    }
    return null;
}
