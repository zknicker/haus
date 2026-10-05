import { Markdown } from '@heroui-pro/react/markdown';
import * as React from 'react';
import { escapeBareOrderedMarkers } from '../chats/bare-ordered-marker.ts';
import { parseHausResourceLink } from '../chats/haus-resource-link.ts';
import { amazonMarkdownComponents } from './amazon-markdown-components.tsx';
import { areMentionsEqual, readMentionsFromMarkdown } from './mention-metadata.ts';
import type { Mention, ReferenceActivation } from './mention-types.ts';
import {
    ContextLink,
    type PreparedLink,
    ReferenceLinksContext,
    WideTable,
} from './reference-link.tsx';

const referenceOrigin = 'https://references.haus.invalid';
const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/gu;

interface ReferenceMarkdownProps {
    chatId?: string;
    className?: string;
    content: string;
    mentions?: readonly Mention[];
    onReferenceActivate?: ReferenceActivation;
    previewReferences?: boolean;
    serverId?: string;
}

// A rendered message re-parses its whole markdown source on every render, and
// a transcript re-renders far more often than its history changes. Callers
// re-read mentions from the same text each time, so equality is by value.
export const ReferenceMarkdown = React.memo(
    ({
        className,
        chatId,
        content,
        mentions,
        onReferenceActivate,
        previewReferences,
        serverId,
    }: ReferenceMarkdownProps) => {
        const prepared = prepareMarkdownReferences(content, mentions);
        const links = React.useMemo(
            () => ({
                chatId,
                links: prepared.links,
                onReferenceActivate,
                previewReferences,
                serverId,
            }),
            [chatId, prepared.links, onReferenceActivate, previewReferences, serverId]
        );
        // Stable element types: a component created per render would remount the whole
        // message under the pointer, so a press that re-renders it (pane focus) lost its click.
        const components = React.useMemo(
            () => ({ ...amazonMarkdownComponents(serverId), a: ContextLink, table: WideTable }),
            [serverId]
        );

        return (
            <ReferenceLinksContext value={links}>
                <Markdown className={className} components={components}>
                    {escapeBareOrderedMarkers(prepared.content)}
                </Markdown>
            </ReferenceLinksContext>
        );
    },
    (previous, next) =>
        previous.className === next.className &&
        previous.chatId === next.chatId &&
        previous.content === next.content &&
        areMentionsEqual(previous.mentions, next.mentions) &&
        previous.onReferenceActivate === next.onReferenceActivate &&
        previous.previewReferences === next.previewReferences &&
        previous.serverId === next.serverId
);

ReferenceMarkdown.displayName = 'ReferenceMarkdown';

export function prepareMarkdownReferences(content: string, suppliedMentions?: readonly Mention[]) {
    const mentions = suppliedMentions ?? readMentionsFromMarkdown(content);
    const mentionsByStart = new Map(mentions.map((mention) => [mention.start, mention]));
    const links = new Map<string, PreparedLink>();
    let cursor = 0;
    let preparedContent = '';

    for (const match of content.matchAll(markdownLinkPattern)) {
        const start = match.index;
        const text = match[0];
        const target = match[2]?.trim();

        if (
            start === undefined ||
            !text ||
            !target ||
            content[start - 1] === '!' ||
            start < cursor
        ) {
            continue;
        }

        const reference = mentionsByStart.get(start);
        const resource = parseHausResourceLink(target);

        if (!(reference || resource)) {
            continue;
        }

        const token = `${referenceOrigin}/${links.size}`;
        const targetStart = text.indexOf('](') + 2;
        const rewritten = `${text.slice(0, targetStart)}${token})`;

        preparedContent += content.slice(cursor, start);
        preparedContent += rewritten;
        cursor = start + text.length;
        links.set(
            token,
            reference ? { kind: 'reference', reference } : { href: target, kind: 'resource' }
        );
    }

    preparedContent += content.slice(cursor);
    return { content: preparedContent, links };
}
