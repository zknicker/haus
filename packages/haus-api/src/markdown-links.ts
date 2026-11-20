import { fromMarkdown } from 'mdast-util-from-markdown';

export interface MarkdownLinkSpan {
    end: number;
    labelEnd: number;
    start: number;
    url: string;
}

export interface MarkdownCodeSpan {
    contentEnd: number;
    contentStart: number;
    end: number;
    kind: 'block' | 'inline';
    start: number;
}

interface SourceNode {
    children?: SourceNode[];
    position?: { end: { offset?: number }; start: { offset?: number } };
    type: string;
    url?: string;
}

/**
 * The inline links and code a CommonMark reader sees, in source order. Links
 * inside code or image syntax are never links, and an autolink is not a
 * written `[label](target)`, so neither is listed.
 */
export function readMarkdownSpans(content: string) {
    const links: MarkdownLinkSpan[] = [];
    const code: MarkdownCodeSpan[] = [];
    const visit = (node: SourceNode) => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) {
            node.children?.forEach(visit);
            return;
        }
        if (node.type === 'link' && node.url !== undefined && content[start] === '[') {
            const labelEnd = node.children?.at(-1)?.position?.end.offset ?? start + 1;
            links.push({ end, labelEnd, start, url: node.url });
            return;
        }
        if (node.type === 'inlineCode') {
            const ticks = /^`+/u.exec(content.slice(start))?.[0].length ?? 0;
            code.push({
                contentEnd: end - ticks,
                contentStart: start + ticks,
                end,
                kind: 'inline',
                start,
            });
            return;
        }
        if (node.type === 'code') {
            code.push({ contentEnd: end, contentStart: start, end, kind: 'block', start });
            return;
        }
        node.children?.forEach(visit);
    };
    visit(fromMarkdown(content) as SourceNode);
    return { code, links };
}
