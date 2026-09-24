import { cloudAgentPullRequestNumber, parseAmazonProduct } from '@haus/api';
import { Markdown } from '@heroui-pro/react/markdown';
import * as React from 'react';
import { MarkdownLink } from '../chats/chat-inline-markdown-link.tsx';
import { parseHausResourceLink } from '../chats/haus-resource-link.ts';
import { amazonMarkdownComponents } from './amazon-markdown-components.tsx';
import { AmazonReference } from './amazon-reference.tsx';
import { areMentionsEqual, readMentionsFromMarkdown } from './mention-metadata.ts';
import type { Mention, ReferenceActivation } from './mention-types.ts';
import { ReferenceChip } from './reference-chip.tsx';

const referenceOrigin = 'https://references.haus.invalid';
const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/gu;

type PreparedLink = { href: string; kind: 'resource' } | { kind: 'reference'; reference: Mention };

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

        return (
            <Markdown
                className={className}
                components={{
                    ...amazonMarkdownComponents(serverId),
                    a: ({ children, href }) => (
                        <ReferenceLink
                            chatId={chatId}
                            href={href}
                            links={prepared.links}
                            onReferenceActivate={onReferenceActivate}
                            previewReferences={previewReferences}
                            serverId={serverId}
                        >
                            {children}
                        </ReferenceLink>
                    ),
                    // A wide table overflows the prose measure and would
                    // otherwise widen the whole transcript column. The visual
                    // frame solves this by wrapping tables in a scroller
                    // (`wrapWideTables` in visual-card.tsx); a Markdown table
                    // in the reply gets the same treatment, so both halves of
                    // a message handle width the same way.
                    table: ({ children }) => (
                        <div className="chat-markdown-table max-w-full overflow-x-auto">
                            <table>{children}</table>
                        </div>
                    ),
                }}
            >
                {prepared.content}
            </Markdown>
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

function ReferenceLink({
    children,
    chatId,
    href,
    links,
    onReferenceActivate,
    previewReferences,
    serverId,
}: {
    children: React.ReactNode;
    chatId?: string;
    href?: string;
    links: ReadonlyMap<string, PreparedLink>;
    onReferenceActivate?: ReferenceActivation;
    previewReferences?: boolean;
    serverId?: string;
}) {
    const prepared = href ? links.get(href) : undefined;

    if (prepared?.kind === 'reference') {
        const reference = prepared.reference;
        return (
            <ReferenceChip
                chatId={chatId}
                id={reference.id}
                kind={reference.kind}
                label={reference.label}
                metadata={reference.metadata}
                onActivate={onReferenceActivate}
                preview={previewReferences}
                serverId={serverId}
            />
        );
    }

    if (prepared?.kind === 'resource') {
        return <MarkdownLink href={prepared.href}>{children}</MarkdownLink>;
    }

    const pullRequest = getPullRequestReference(href);

    if (pullRequest) {
        return (
            <a
                aria-label={`Open pull request ${pullRequest.label}`}
                className="reference-chip-trigger inline-flex max-w-full align-middle no-underline"
                href={pullRequest.href}
                rel="noreferrer"
                target="_blank"
            >
                <ReferenceChip
                    id={pullRequest.href}
                    kind="pull-request"
                    label={pullRequest.label}
                />
            </a>
        );
    }

    const website = getWebsiteReference(href, children);

    if (website) {
        const link = (
            <a
                aria-label={`Open ${website.label}`}
                className="inline-flex no-underline"
                href={website.href}
                rel="noreferrer"
                target="_blank"
            >
                <ReferenceChip
                    id={website.href}
                    kind="website"
                    label={website.label}
                    metadata={{ iconDataUrl: website.iconUrl }}
                />
            </a>
        );
        const product = parseAmazonProduct(website.href);
        return product && serverId ? (
            <AmazonReference href={website.href} product={product} serverId={serverId}>
                {link}
            </AmazonReference>
        ) : (
            link
        );
    }

    return href ? <MarkdownLink href={href}>{children}</MarkdownLink> : children;
}

function getPullRequestReference(href: string | undefined) {
    if (!href) {
        return null;
    }

    try {
        const url = new URL(href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }
        const number = cloudAgentPullRequestNumber(url.toString());
        return number === null ? null : { href: url.toString(), label: `#${number}` };
    } catch {
        return null;
    }
}

function getWebsiteReference(href: string | undefined, children: React.ReactNode) {
    if (!href) {
        return null;
    }

    try {
        const url = new URL(href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }

        const childLabel = getNodeText(children).trim();
        const hostname = url.hostname.replace(/^www\./u, '');
        const normalizedChild = childLabel.startsWith('www.')
            ? `https://${childLabel}`
            : childLabel;
        const label =
            normalizedChild === href || normalizedChild === url.toString()
                ? hostname
                : childLabel || hostname;

        return {
            href: url.toString(),
            iconUrl: new URL('/favicon.ico', url.origin).toString(),
            label,
        };
    } catch {
        return null;
    }
}

function getNodeText(node: React.ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(getNodeText).join('');
    }
    if (node && typeof node === 'object' && 'props' in node) {
        return getNodeText(
            (node as React.ReactElement<{ children?: React.ReactNode }>).props.children
        );
    }
    return '';
}
