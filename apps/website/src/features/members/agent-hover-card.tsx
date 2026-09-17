import type { Agent, AgentReasoningEffort } from '@haus/api';
import { Separator, Spinner } from '@heroui/react';
import type * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useAgentActivityPreview } from '../../hooks/members/use-agent-activity-preview.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { formatShortTime } from '../../lib/format.ts';
import { cn } from '../../lib/utils.ts';
import { agentExecutionLabels, availabilityLabel } from '../computers/presentation.ts';
import { AgentAvatar } from './agent-avatar.tsx';
import { AgentExecutionChips } from './agent-execution-chips.tsx';
import {
    formatAgentActivityEvent,
    getAgentActivityColor,
} from './agent-profile/agent-activity-model.ts';
import { AgentRuntimeIssue } from './agent-runtime-issue.tsx';

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
            className="w-88"
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

function AgentHoverCardContent({
    agentId,
    agentName,
    serverId,
}: {
    agentId: string;
    agentName: string;
    serverId: string;
}) {
    const agent = useAgent(serverId, agentId);
    const activity = useAgentActivityPreview(serverId, agentId);
    const computers = useComputers(serverId);

    if (agent.isPending && !agent.data) {
        return (
            <span className="flex min-h-20 items-center justify-center gap-2 text-muted text-sm">
                <Spinner color="current" size="sm" />
                Loading Agent…
            </span>
        );
    }

    if (!agent.data) {
        return (
            <div className="flex min-w-0 flex-col gap-1">
                <strong className="truncate text-foreground">{agentName}</strong>
                <span className="text-muted text-sm">Agent details are unavailable.</span>
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
    const events = activity.data?.events ?? [];

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <header className="flex min-w-0 items-center gap-3">
                <AgentAvatar agent={value} className="shrink-0" size={44} />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                        <strong className="truncate font-semibold text-foreground text-lg leading-tight">
                            {value.displayName}
                        </strong>
                        <span className="shrink-0 text-muted text-sm leading-tight">
                            · {availabilityLabel(value.availability)}
                        </span>
                    </div>
                    {value.description ? (
                        <span className="min-w-0 truncate text-muted text-sm leading-tight">
                            {value.description}
                        </span>
                    ) : null}
                </div>
            </header>
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
            <AgentRuntimeIssue agent={value} />
            <Separator />
            <section className="flex min-w-0 flex-col gap-2">
                <h3 className="font-semibold text-muted text-xs uppercase tracking-wider">
                    Recent activity
                </h3>
                {activity.isPending ? (
                    <span className="flex items-center gap-2 text-muted text-sm">
                        <Spinner color="current" size="sm" />
                        Loading activity…
                    </span>
                ) : events.length === 0 ? (
                    <p className="text-muted text-sm">No recent activity.</p>
                ) : (
                    <ul className="flex min-w-0 flex-col gap-1.5">
                        {events.map((event) => (
                            <li className="flex min-w-0 items-center gap-2 text-sm" key={event.id}>
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'size-1.5 shrink-0 rounded-full',
                                        activityDotClassName(getAgentActivityColor(event.phase))
                                    )}
                                />
                                <time
                                    className="w-16 shrink-0 text-muted tabular-nums"
                                    dateTime={event.occurredAt}
                                >
                                    {formatShortTime(event.occurredAt)}
                                </time>
                                <span className="min-w-0 truncate text-foreground">
                                    {formatAgentActivityEvent(event)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

export type AgentHoverExecution =
    | {
          kind: 'effective';
          modelId: string;
          reasoningEffort: AgentReasoningEffort;
          runtimeId: string;
      }
    | { kind: 'unavailable'; label: string };

export function resolveAgentHoverExecution(
    agent: Pick<
        Agent,
        'effectiveModelId' | 'effectiveReasoningEffort' | 'effectiveRuntimeId' | 'status'
    >
): AgentHoverExecution {
    if (agent.effectiveModelId && agent.effectiveReasoningEffort && agent.effectiveRuntimeId) {
        return {
            kind: 'effective',
            modelId: agent.effectiveModelId,
            reasoningEffort: agent.effectiveReasoningEffort,
            runtimeId: agent.effectiveRuntimeId,
        };
    }

    return {
        kind: 'unavailable',
        label: agent.status === 'degraded' ? 'Configuration unavailable' : 'Configuration pending',
    };
}

function activityDotClassName(color: ReturnType<typeof getAgentActivityColor>) {
    switch (color) {
        case 'danger':
            return 'bg-danger';
        case 'warning':
            return 'bg-warning';
        case 'success':
            return 'bg-success';
    }
}
