import { cloudAgentPullRequestNumber, parseAmazonProduct } from '@haus/api';
import * as React from 'react';
import { MarkdownLink } from '../chats/chat-inline-markdown-link.tsx';
import { AmazonReference } from './amazon-reference.tsx';
import type { Mention, ReferenceActivation } from './mention-types.ts';
import { ReferenceChip } from './reference-chip.tsx';

export type PreparedLink =
    | { href: string; kind: 'resource' }
    | { kind: 'reference'; reference: Mention };

/** What a message's links render from: its prepared references and their activation. */
interface ReferenceLinks {
    chatId?: string;
    links: ReadonlyMap<string, PreparedLink>;
    onReferenceActivate?: ReferenceActivation;
    previewReferences?: boolean;
    serverId?: string;
}

export const ReferenceLinksContext = React.createContext<ReferenceLinks>({ links: new Map() });

/** The markdown `a`: one stable element type that reads the message's links from context. */
export function ContextLink({ children, href }: { children?: React.ReactNode; href?: string }) {
    return (
        <ReferenceLink {...React.use(ReferenceLinksContext)} href={href}>
            {children}
        </ReferenceLink>
    );
}

/**
 * A wide table overflows the prose measure and would otherwise widen the whole
 * transcript column. The visual frame wraps tables in a scroller
 * (`wrapWideTables` in visual-card.tsx); a Markdown table in the reply gets the
 * same treatment, so both halves of a message handle width the same way.
 */
export function WideTable({ children }: { children?: React.ReactNode }) {
    return (
        <div className="chat-markdown-table max-w-full overflow-x-auto">
            <table>{children}</table>
        </div>
    );
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
                className="inline-flex max-w-full align-middle no-underline"
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
            <AmazonReference href={website.href} product={product} serverId={serverId} />
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
