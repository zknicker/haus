import type * as React from 'react';

import { MarkdownLink, matchBareUrl, matchMarkdownLink } from './chat-inline-markdown-link.tsx';
import {
    type ChatTextAnimationRange,
    renderTextWithAnimatedRanges,
} from './chat-inline-text-animation.tsx';

const maxParseDepth = 6;

export function renderInlineMarkdown(
    text: string,
    keyPrefix: string,
    depth: number,
    options: {
        animatedRanges: readonly ChatTextAnimationRange[];
        sourceOffset: number;
    }
): React.ReactNode[] {
    if (text.length === 0) {
        return [];
    }

    if (depth > maxParseDepth) {
        return renderTextWithAnimatedRanges(
            text,
            options.sourceOffset,
            `${keyPrefix}:max-depth`,
            options.animatedRanges
        );
    }

    const nodes: React.ReactNode[] = [];
    let buffer = '';
    let bufferStart: number | null = null;
    let cursor = 0;

    const flushBuffer = () => {
        if (buffer.length === 0 || bufferStart === null) {
            return;
        }

        nodes.push(
            ...renderTextWithAnimatedRanges(
                buffer,
                options.sourceOffset + bufferStart,
                `${keyPrefix}:text:${bufferStart}`,
                options.animatedRanges
            )
        );
        buffer = '';
        bufferStart = null;
    };

    while (cursor < text.length) {
        const urlMatch = matchBareUrl(text.slice(cursor));

        if (urlMatch) {
            flushBuffer();
            nodes.push(
                <MarkdownLink href={urlMatch.href} key={`${keyPrefix}:url:${cursor}`}>
                    {renderTextWithAnimatedRanges(
                        urlMatch.label,
                        options.sourceOffset + cursor,
                        `${keyPrefix}:url-label:${cursor}`,
                        options.animatedRanges
                    )}
                </MarkdownLink>
            );
            cursor += urlMatch.length;
            continue;
        }

        if (text[cursor] === '`') {
            const end = text.indexOf('`', cursor + 1);

            if (end > cursor + 1) {
                flushBuffer();
                nodes.push(
                    <code
                        className="bg-surface-secondary rounded px-1 py-0.5 font-mono text-[0.92em] [overflow-wrap:anywhere] break-words"
                        key={`${keyPrefix}:code:${cursor}`}
                    >
                        {renderTextWithAnimatedRanges(
                            text.slice(cursor + 1, end),
                            options.sourceOffset + cursor + 1,
                            `${keyPrefix}:code-text:${cursor}`,
                            options.animatedRanges
                        )}
                    </code>
                );
                cursor = end + 1;
                continue;
            }
        }

        const link = matchMarkdownLink(text, cursor);

        if (link) {
            flushBuffer();
            nodes.push(
                <MarkdownLink href={link.href} key={`${keyPrefix}:link:${cursor}`}>
                    {renderInlineMarkdown(
                        link.label,
                        `${keyPrefix}:link-label:${cursor}`,
                        depth + 1,
                        {
                            animatedRanges: options.animatedRanges,
                            sourceOffset: options.sourceOffset + cursor + 1,
                        }
                    )}
                </MarkdownLink>
            );
            cursor = link.end;
            continue;
        }

        const strong = matchDelimited(text, cursor, '**') ?? matchDelimited(text, cursor, '__');

        if (strong) {
            flushBuffer();
            nodes.push(
                <strong className="font-semibold" key={`${keyPrefix}:strong:${cursor}`}>
                    {renderInlineMarkdown(
                        strong.content,
                        `${keyPrefix}:strong:${cursor}`,
                        depth + 1,
                        {
                            animatedRanges: options.animatedRanges,
                            sourceOffset: options.sourceOffset + strong.contentStart,
                        }
                    )}
                </strong>
            );
            cursor = strong.end;
            continue;
        }

        const emphasis = matchDelimited(text, cursor, '*');

        if (emphasis) {
            flushBuffer();
            nodes.push(
                <em className="italic" key={`${keyPrefix}:em:${cursor}`}>
                    {renderInlineMarkdown(
                        emphasis.content,
                        `${keyPrefix}:em:${cursor}`,
                        depth + 1,
                        {
                            animatedRanges: options.animatedRanges,
                            sourceOffset: options.sourceOffset + emphasis.contentStart,
                        }
                    )}
                </em>
            );
            cursor = emphasis.end;
            continue;
        }

        if (buffer.length === 0) {
            bufferStart = cursor;
        }

        buffer += text[cursor];
        cursor += 1;
    }

    flushBuffer();
    return nodes;
}

function matchDelimited(text: string, cursor: number, delimiter: '*' | '**' | '__') {
    if (!text.startsWith(delimiter, cursor)) {
        return null;
    }

    const contentStart = cursor + delimiter.length;
    const contentEnd = text.indexOf(delimiter, contentStart);

    if (contentEnd <= contentStart) {
        return null;
    }

    return {
        content: text.slice(contentStart, contentEnd),
        contentStart,
        end: contentEnd + delimiter.length,
    };
}
