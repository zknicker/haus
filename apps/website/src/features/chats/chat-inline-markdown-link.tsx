import { readMarkdownLinkAt } from '@haus/api';
import type * as React from 'react';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useArtifactPanelOpen } from './artifact-panel-context.tsx';
import { isDriveCitationHref } from './drive-citation-link.ts';
import { parseHausResourceLink } from './haus-resource-link.ts';
import { SharedArtifactChip } from './shared-artifact-chip.tsx';
import { useSharedArtifactScope, useSharedArtifactTarget } from './shared-artifact-scope.tsx';

export function MarkdownLink({ children, href }: { children: React.ReactNode; href: string }) {
    const openArtifactPanel = useArtifactPanelOpen();
    const hausTarget = parseHausResourceLink(href);
    const artifactScope = useSharedArtifactScope();
    const artifactTarget = useSharedArtifactTarget(href);

    if (artifactScope && artifactTarget) {
        return (
            <SharedArtifactChip scope={artifactScope} target={artifactTarget}>
                {children}
            </SharedArtifactChip>
        );
    }

    if (isDriveCitationHref(href)) {
        return children;
    }

    if (hausTarget && openArtifactPanel) {
        return (
            <a
                className="text-accent hover:text-accent-hover cursor-pointer underline underline-offset-2"
                href={href}
                onClick={(event) => {
                    event.preventDefault();
                    openArtifactPanel(hausTarget);
                }}
                {...opensPlace}
            >
                {children}
            </a>
        );
    }

    return (
        <a
            className="text-accent hover:text-accent-hover underline underline-offset-2"
            href={href}
            rel="noreferrer"
            target="_blank"
        >
            {children}
        </a>
    );
}

export function matchMarkdownLink(text: string, cursor: number) {
    const link = readMarkdownLinkAt(text, cursor);
    const href = link ? sanitizeUrl(link.target) : null;

    if (!(link && href)) {
        return null;
    }

    return { end: link.end, href, label: link.label };
}

export function matchBareUrl(text: string) {
    const match = /^(?:https?:\/\/|www\.)[^\s<>()]+/u.exec(text);

    if (!match) {
        return null;
    }

    const raw = match[0];
    const label = stripTrailingUrlPunctuation(raw);
    const href = sanitizeUrl(label);

    if (!href) {
        return null;
    }

    return {
        href,
        label,
        length: label.length,
    };
}

function sanitizeUrl(value: string) {
    const href = value.startsWith('www.') ? `https://${value}` : value;

    if (parseHausResourceLink(href) || isDriveCitationHref(href)) {
        return href;
    }

    try {
        const url = new URL(href);
        return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function stripTrailingUrlPunctuation(value: string) {
    let end = value.length;

    while (end > 0 && /[.,;:!?]/u.test(value[end - 1] ?? '')) {
        end -= 1;
    }

    return value.slice(0, end);
}
