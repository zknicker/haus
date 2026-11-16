import { Markdown } from '@heroui-pro/react/markdown';
import * as React from 'react';
import { MarkdownCodeBlock } from '../../components/code/markdown-code-block.tsx';
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
            () => ({
                ...amazonMarkdownComponents(serverId),
                a: ContextLink,
                pre: MarkdownCodeBlock,
                table: WideTable,
            }),
            [serverId]
        );

        return (
            <ReferenceLinksContext value={links}>
                <Markdown className={className} components={components} data-selectable-text="">
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

/** One span of the source to rewrite: `linkText` is the Markdown link it becomes, given its token. */
interface MarkdownReferenceEdit {
    end: number;
    link: PreparedLink;
    linkText: (token: string) => string;
    start: number;
}

export function prepareMarkdownReferences(content: string, suppliedMentions?: readonly Mention[]) {
    const mentions = suppliedMentions ?? readMentionsFromMarkdown(content);
    const links = new Map<string, PreparedLink>();
    const edits = [...linkEdits(content, mentions), ...bareMentionEdits(content, mentions)].sort(
        (left, right) => left.start - right.start
    );
    let cursor = 0;
    let preparedContent = '';

    for (const edit of edits) {
        if (edit.start < cursor) {
            continue;
        }
        const token = `${referenceOrigin}/${links.size}`;
        preparedContent += content.slice(cursor, edit.start);
        preparedContent += edit.linkText(token);
        cursor = edit.end;
        links.set(token, edit.link);
    }

    preparedContent += content.slice(cursor);
    return { content: preparedContent, links };
}

/** The source's own reference and resource links, retargeted at a token. */
function linkEdits(content: string, mentions: readonly Mention[]): MarkdownReferenceEdit[] {
    const mentionsByStart = new Map(mentions.map((mention) => [mention.start, mention]));
    return [...content.matchAll(markdownLinkPattern)].flatMap((match) => {
        const start = match.index;
        const text = match[0];
        const target = match[2]?.trim();
        if (!(text && target) || content[start - 1] === '!') {
            return [];
        }
        const reference = mentionsByStart.get(start);
        const resource = parseHausResourceLink(target);
        if (!(reference || resource)) {
            return [];
        }
        const targetStart = text.indexOf('](') + 2;
        return [
            {
                end: start + text.length,
                link: reference
                    ? ({ kind: 'reference', reference } as const)
                    : ({ href: target, kind: 'resource' } as const),
                linkText: (token: string) => `${text.slice(0, targetStart)}${token})`,
                start,
            },
        ];
    });
}

/**
 * A mention written as plain text, a bare Task key, has no link to retarget, so
 * it gains one: Markdown then hands it to `ContextLink` like any other chip.
 */
function bareMentionEdits(content: string, mentions: readonly Mention[]): MarkdownReferenceEdit[] {
    return mentions
        .filter((mention) => mention.kind === 'task' && !content.startsWith('[', mention.start))
        .map((reference) => ({
            end: reference.end,
            link: { kind: 'reference', reference },
            linkText: (token: string) => `[${reference.text}](${token})`,
            start: reference.start,
        }));
}
