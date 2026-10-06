import { Spinner } from '@heroui/react';
import type * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import {
    agentExecutionLabels,
    availabilityLabel,
    computerLabel,
} from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../mentions/reference-preview-header.tsx';
import { AgentExecutionChips } from './agent-execution-chips.tsx';
import { AgentHoverActivity } from './agent-hover-activity.tsx';
import {
    resolveAgentHoverExecution,
    resolveAgentHoverModelChange,
} from './agent-hover-execution.ts';

export function AgentHoverCard({
    agentId,
    agentName,
    children,
    serverId,
}: {
    agentId: string;
    agentName: string;
    children: React.ReactNode;
    serverId: string;
}) {
    return (
        <CursorHoverCard
            className="w-80"
            content={
                <AgentHoverCardContent
                    agentId={agentId}
                    agentName={agentName}
                    serverId={serverId}
                />
            }
        >
            {children}
        </CursorHoverCard>
    );
}

export function AgentHoverCardContent({
    agentId,
    agentName,
    serverId,
}: {
    agentId: string;
    agentName: string;
    serverId: string;
}) {
    const agent = useAgent(serverId, agentId);
    const computers = useComputers(serverId);

    if (agent.isPending && !agent.data) {
        return (
            <span className="flex min-h-12 items-center justify-center gap-2 text-muted text-xs">
                <Spinner color="current" size="sm" />
                Loading Agent…
            </span>
        );
    }

    if (!agent.data) {
        return (
            <ReferencePreviewHeader mark={null} meta="Agent" title={agentName}>
                <ReferencePreviewText>Agent details are unavailable.</ReferencePreviewText>
            </ReferencePreviewHeader>
        );
    }

    const value = agent.data;
    const computer = computers.data?.find((candidate) => candidate.id === value.computerId);
    const effectiveExecution = resolveAgentHoverExecution(value);
    const execution =
        effectiveExecution.kind === 'effective'
            ? agentExecutionLabels(
                  {
                      desiredModelId: effectiveExecution.modelId,
                      desiredRuntimeId: effectiveExecution.runtimeId,
                  },
                  computer?.reportedInventory ?? null
              )
            : null;
    const issue = agentRuntimeIssue(value, computer?.reportedInventory ?? null);
    const modelChange = resolveAgentHoverModelChange(value);
    const desiredExecution = agentExecutionLabels(value, computer?.reportedInventory ?? null);

    return (
        <div className="flex min-w-0 flex-col gap-2.5">
            <ReferencePreviewHeader
                // The `·` clause states availability, so the mark drops the badge.
                mark={
                    <EntityAvatar
                        className="shrink-0"
                        name={value.displayName}
                        size={18}
                        src={value.avatarUrl}
                    />
                }
                meta={availabilityLabel(value.availability)}
                title={value.displayName}
            >
                {value.description ? (
                    <ReferencePreviewText className="line-clamp-2">
                        {value.description}
                    </ReferencePreviewText>
                ) : null}
            </ReferencePreviewHeader>
            {effectiveExecution.kind === 'effective' && execution ? (
                <AgentExecutionChips
                    modelLabel={execution.model}
                    reasoningEffort={effectiveExecution.reasoningEffort}
                    runtimeId={effectiveExecution.runtimeId}
                    runtimeLabel={execution.runtime}
                />
            ) : (
                <span className="text-muted text-xs">
                    {effectiveExecution.kind === 'unavailable' ? effectiveExecution.label : null}
                </span>
            )}
            {computer && issue ? (
                <p className="text-warning text-xs">
                    {runtimeIssueLabel(issue.runtimeId)}. Sign in on {computerLabel(computer)} to
                    let {value.displayName} continue.
                </p>
            ) : null}
            {modelChange ? (
                <p className="text-muted text-xs">
                    Switching to {desiredExecution.runtime} · {desiredExecution.model} ·{' '}
                    {modelChange}
                </p>
            ) : null}
            <AgentHoverActivity agentId={agentId} serverId={serverId} />
        </div>
    );
}
