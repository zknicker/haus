import { Spinner } from '@heroui/react';
import type * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { agentExecutionLabels, availabilityLabel } from '../computers/presentation.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewText,
} from '../mentions/reference-preview-header.tsx';
import { AgentExecutionChips } from './agent-execution-chips.tsx';
import { AgentHoverActivity } from './agent-hover-activity.tsx';
import {
    AgentRuntimeIssueLine,
    AgentWakePauseBanner,
    agentHoverAttention,
} from './agent-hover-attention.tsx';
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
            className="haus-hover-card--sectioned w-80"
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
            <span className="haus-hover-card__section flex min-h-12 items-center justify-center gap-2 text-muted text-xs">
                <Spinner color="current" size="sm" />
                Loading Agent…
            </span>
        );
    }

    if (!agent.data) {
        return (
            <div className="haus-hover-card__section">
                <ReferencePreviewHeader mark={null} meta="Agent" title={agentName}>
                    <ReferencePreviewText>Agent details are unavailable.</ReferencePreviewText>
                </ReferencePreviewHeader>
            </div>
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
    const modelChange = resolveAgentHoverModelChange(value);
    const desiredExecution = agentExecutionLabels(value, computer?.reportedInventory ?? null);
    const attention = agentHoverAttention(value, computer ?? null);
    const banner =
        attention?.kind === 'wake-pause' ? (
            <AgentWakePauseBanner wakePause={attention.wakePause} />
        ) : null;

    const identity = (
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
            meta={availabilityLabel(value)}
            title={value.displayName}
        >
            {value.description ? (
                <ReferencePreviewText className="line-clamp-2">
                    {value.description}
                </ReferencePreviewText>
            ) : null}
        </ReferencePreviewHeader>
    );
    const body = (
        <>
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
            {attention?.kind === 'runtime-issue' ? (
                <AgentRuntimeIssueLine
                    agent={value}
                    computer={attention.computer}
                    runtimeId={attention.runtimeId}
                />
            ) : null}
            {modelChange ? (
                <p className="text-muted text-xs">
                    Switching to {desiredExecution.runtime} · {desiredExecution.model} ·{' '}
                    {modelChange}
                </p>
            ) : null}
            <AgentHoverActivity agentId={agentId} serverId={serverId} />
        </>
    );

    return (
        // The section carries the card inset so the banner can run edge to edge.
        <div className="flex min-w-0 flex-col">
            {banner}
            <div className="haus-hover-card__section flex min-w-0 flex-col gap-2.5">
                {identity}
                {body}
            </div>
        </div>
    );
}
