export function escapeMarkdownText(text: string, atLineStart: boolean) {
    return text
        .split('\n')
        .map((line, index) => escapeLine(line, atLineStart || index > 0))
        .join('\n');
}

const wordCharacter = /[\p{L}\p{N}]/u;
const space = /\s/u;

function escapeLine(line: string, atLineStart: boolean) {
    let out = '';
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index] ?? '';
        const before = line[index - 1] ?? ' ';
        const after = line[index + 1] ?? ' ';
        out += escapesCharacter(character, before, after, line.slice(index))
            ? `\\${character}`
            : character;
    }
    return atLineStart ? escapeLineStart(out) : out;
}

function escapesCharacter(character: string, before: string, after: string, rest: string) {
    switch (character) {
        case '\\':
        case '`':
            return true;
        case '*':
            return !(space.test(before) && space.test(after));
        case '_':
            return (
                !(wordCharacter.test(before) && wordCharacter.test(after)) &&
                !(space.test(before) && space.test(after))
            );
        case '~':
            return before === '~' || rest.slice(1).includes('~');
        case '[':
            return /^\[[^\]]*\][([:]/u.test(rest);
        case '<':
            return /^<[/!?a-z]/iu.test(rest);
        case '&':
            return /^&(#\d+|#x[\da-f]+|[a-z][\da-z]*);/iu.test(rest);
        default:
            return false;
    }
}

function escapeLineStart(line: string) {
    const indent = /^ */u.exec(line)?.[0] ?? '';
    const body = line.slice(indent.length);
    if (/^(#{1,6}(\s|$)|>|[-+](\s|$)|=+\s*$|-{3,}\s*$)/u.test(body)) {
        return `${indent}\\${body}`;
    }
    const ordered = /^(\d{1,9})([.)])(\s|$)/u.exec(body);
    if (ordered) {
        return `${indent}${ordered[1]}\\${body.slice(ordered[1]?.length ?? 0)}`;
    }
    return line;
}
