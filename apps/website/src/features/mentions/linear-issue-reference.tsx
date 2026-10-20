import type { LinearIssueUrl } from '@haus/api';
import { HoverCard } from '@heroui-pro/react';
import type * as React from 'react';
import { hausHoverCardClassName } from '../../components/ui/cursor-hover-card.tsx';
import { useLinearIssue } from '../../hooks/linear/use-linear-issue.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { cn } from '../../lib/utils.ts';
import {
    type LinearChipAgent,
    type LinearChipState,
    linearChipState,
    linearIssueHoverModel,
    linearIssueNotice,
    linearMarkUrl,
} from './linear-issue-model.ts';
import { LinearIssuePreview } from './linear-issue-preview.tsx';
import { ReferenceChip } from './reference-chip.tsx';
import { ReferencePreviewText } from './reference-preview-header.tsx';

/**
 * A Linear issue link as a reference chip: the inline mark and dotted
 * underline every reference uses, labelled with the issue key and title, and
 * a hover card with its state and who holds it. A link into a workspace this
 * Server has not connected stays the plain link it was (`fallback`).
 */
export function LinearIssueReference({
    fallback,
    href,
    issue,
    serverId,
}: {
    fallback: React.ReactNode;
    href: string;
    issue: LinearIssueUrl;
    serverId: string;
}) {
    const read = useLinearIssue(serverId, issue);
    const agents = useAgents(serverId).data;
    const state = linearChipState(issue, read);
    if (state.kind === 'plain') {
        return fallback;
    }
    return (
        <LinearIssueChip
            agents={agents ?? []}
            href={href}
            issue={issue}
            notice={state.view ? null : linearIssueNotice(read.data, read.isError)}
            state={state}
        />
    );
}

export function LinearIssueChip({
    agents,
    href,
    issue,
    notice,
    state,
}: {
    agents: readonly LinearChipAgent[];
    href: string;
    issue: LinearIssueUrl;
    notice: string | null;
    state: Extract<LinearChipState, { kind: 'issue' }>;
}) {
    return (
        <HoverCard openDelay={250}>
            <HoverCard.Trigger>
                <a
                    aria-busy={state.pending || undefined}
                    aria-label={`Open ${state.label} in Linear`}
                    className="reference-chip-trigger inline-flex max-w-full align-middle no-underline"
                    href={href}
                    rel="noreferrer"
                    target="_blank"
                >
                    <ReferenceChip
                        className="max-w-64"
                        id={issue.url}
                        kind="website"
                        label={state.label}
                        metadata={{ iconDataUrl: linearMarkUrl }}
                    />
                </a>
            </HoverCard.Trigger>
            {state.view || notice ? (
                <HoverCard.Content
                    aria-label={`${issue.identifier} details`}
                    className={cn(hausHoverCardClassName, 'w-96 max-w-[calc(100vw-2rem)]')}
                    placement="bottom start"
                >
                    {state.view ? (
                        <LinearIssuePreview model={linearIssueHoverModel(state.view, agents)} />
                    ) : (
                        <ReferencePreviewText>{notice}</ReferencePreviewText>
                    )}
                </HoverCard.Content>
            ) : null}
        </HoverCard>
    );
}
