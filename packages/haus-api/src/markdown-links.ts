import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

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
    align?: unknown[] | null;
    children?: SourceNode[];
    position?: { end: { offset?: number }; start: { offset?: number } };
    type: string;
    url?: string;
}

/**
 * The inline links and code a GFM reader sees, the way the App's remark-gfm
 * renderer reads them, in source order. Links inside code or image syntax are
 * never links, and an autolink (`<…>` or a GFM literal) is not a written
 * `[label](target)`, so neither is listed.
 */
export function readMarkdownSpans(content: string) {
    const links: MarkdownLinkSpan[] = [];
    const code: MarkdownCodeSpan[] = [];
    const visit = (node: SourceNode) => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) {
            renderedChildren(node).forEach(visit);
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
        renderedChildren(node).forEach(visit);
    };
    visit(
        fromMarkdown(content, {
            extensions: [gfm()],
            mdastExtensions: [gfmFromMarkdown()],
        }) as SourceNode
    );
    return { code, links };
}

function renderedChildren(node: SourceNode) {
    const children = node.children ?? [];
    if (node.type !== 'table') {
        return children;
    }
    const headerWidth = node.align?.length ?? 0;
    return children.map((row) => ({ ...row, children: row.children?.slice(0, headerWidth) }));
}
