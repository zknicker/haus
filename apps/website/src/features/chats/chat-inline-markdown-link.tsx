import type * as React from 'react';
import { useArtifactPanelOpen } from './artifact-panel-context.tsx';
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

    if (hausTarget && openArtifactPanel) {
        return (
            <a
                className="cursor-pointer text-accent underline underline-offset-2 hover:text-accent-hover"
                href={href}
                onClick={(event) => {
                    event.preventDefault();
                    openArtifactPanel(hausTarget);
                }}
            >
                {children}
            </a>
        );
    }

    return (
        <a
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
            href={href}
            rel="noreferrer"
            target="_blank"
        >
            {children}
        </a>
    );
}

export function matchMarkdownLink(text: string, cursor: number) {
    if (text[cursor] !== '[') {
        return null;
    }

    const labelEnd = text.indexOf(']', cursor + 1);

    if (labelEnd <= cursor + 1 || text[labelEnd + 1] !== '(') {
        return null;
    }

    const hrefEnd = text.indexOf(')', labelEnd + 2);

    if (hrefEnd <= labelEnd + 2) {
        return null;
    }

    const href = sanitizeUrl(text.slice(labelEnd + 2, hrefEnd).trim());

    if (!href) {
        return null;
    }

    return {
        end: hrefEnd + 1,
        href,
        label: text.slice(cursor + 1, labelEnd),
    };
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

    if (parseHausResourceLink(href)) {
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
