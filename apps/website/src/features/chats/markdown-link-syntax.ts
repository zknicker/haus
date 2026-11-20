import { codeRangeAt, readCodeRanges } from './markdown-code-ranges.ts';

export function readMarkdownLinkAt(text: string, start: number) {
    if (text[start] !== '[') {
        return null;
    }
    const labelEnd = text.indexOf(']', start + 1);
    const label = text.slice(start + 1, labelEnd);
    if (labelEnd <= start + 1 || label.includes('\n') || text[labelEnd + 1] !== '(') {
        return null;
    }
    const destinationStart = labelEnd + 2;
    const destination =
        text[destinationStart] === '<'
            ? readAngleDestination(text, destinationStart)
            : readBareDestination(text, destinationStart);
    if (!destination?.target) {
        return null;
    }
    return {
        end: destination.end,
        label,
        start,
        target: destination.target,
        targetStart: destinationStart,
    };
}

export function readMarkdownLinks(text: string) {
    const code = readCodeRanges(text);
    const links: NonNullable<ReturnType<typeof readMarkdownLinkAt>>[] = [];
    let cursor = text.indexOf('[');
    while (cursor !== -1) {
        const codeRange = codeRangeAt(code, cursor);
        const link = codeRange ? null : readMarkdownLinkAt(text, cursor);
        if (link) {
            links.push(link);
        }
        cursor = text.indexOf('[', codeRange?.end ?? link?.end ?? cursor + 1);
    }
    return links;
}

function readAngleDestination(text: string, open: number) {
    const close = text.indexOf('>', open + 1);
    const target = text.slice(open + 1, close);
    if (close === -1 || /[<\n]/u.test(target) || text[close + 1] !== ')') {
        return null;
    }
    return { end: close + 2, target: target.trim() };
}

function readBareDestination(text: string, from: number) {
    let depth = 0;
    for (let index = from; index < text.length; index += 1) {
        const character = text[index];
        if (character === '\n') {
            return null;
        }
        if (character === '(') {
            depth += 1;
        } else if (character === ')' && depth > 0) {
            depth -= 1;
        } else if (character === ')') {
            return { end: index + 1, target: text.slice(from, index).trim() };
        }
    }
    return null;
}
