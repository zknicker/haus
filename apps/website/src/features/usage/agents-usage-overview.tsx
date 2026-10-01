import { Skeleton } from '@heroui/react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useUsage } from '../../hooks/servers/use-usage.ts';
import { computerLabel } from '../computers/presentation.ts';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { AgentUsageScopePicker } from '../stats/agent-usage-scope.tsx';
import { TokenUsageDashboard, TokenUsageRangePicker } from '../stats/token-usage-module.tsx';
import { buildTokenUsageView, type TokenUsageRange } from '../stats/token-usage-view.ts';
import { UsageEmptyCard } from './usage-empty.tsx';
import { ActiveUsageFilters, usageFilterChips } from './usage-filters.tsx';

export function AgentsUsageOverview({ serverId }: { serverId: string }) {
    const usage = useUsage(serverId);
    const agents = useAgents(serverId);
    const computers = useComputers(serverId);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedComputerId = searchParams.get('computer');
    const runtimeId = searchParams.get('runtime') || undefined;
    // Agent scope is URL-backed like the Computer and runtime filters, so an
    // Agent profile can link here already scoped to itself.
    const selectedAgentId = searchParams.get('agent');
    const computer = computers.data?.find((item) => item.id === requestedComputerId);
    const computerId = computer?.id;
    const scope = useMemo(
        () => ({
            agentIds: requestedComputerId
                ? computerId
                    ? (agents.data ?? [])
                          .filter((agent) => agent.computerId === computerId)
                          .map((agent) => agent.id)
                    : []
                : undefined,
            knownAgents: (agents.data ?? []).map((agent) => ({
                agentAvatarUrl: agent.avatarUrl,
                agentHandle: agent.handle,
                agentId: agent.id,
                agentName: agent.displayName,
            })),
            runtimeId,
        }),
        [agents.data, computerId, requestedComputerId, runtimeId]
    );
    // A scoped link must not paint Server-wide totals on its way to the scope
    // it asked for, so every roster the scope depends on has to settle first.
    const isFilterPending =
        (Boolean(requestedComputerId) &&
            ((!agents.data && agents.isPending) || (!computers.data && computers.isPending))) ||
        (Boolean(selectedAgentId) && agents.isPending);
    const filterChips = usageFilterChips({
        agentsPending: agents.isPending,
        computerLabel: computer ? computerLabel(computer) : undefined,
        computersPending: computers.isPending,
        requestedAgentId: selectedAgentId,
        requestedComputerId,
        resolvedAgent: (agents.data ?? []).some((agent) => agent.id === selectedAgentId),
        runtimeId,
    });
    const [days, setDays] = useState<TokenUsageRange>(30);
    const selectAgent = (agentId: null | string) =>
        setSearchParams(
            (params) => {
                const next = new URLSearchParams(params);
                if (agentId) {
                    next.set('agent', agentId);
                } else {
                    next.delete('agent');
                }
                return next;
            },
            { replace: true }
        );
    const tokenUsage = usage.data?.tokenUsage;
    const view = useMemo(
        () =>
            tokenUsage && !isFilterPending
                ? buildTokenUsageView(tokenUsage, days, selectedAgentId, new Date(), scope)
                : null,
        [days, isFilterPending, scope, selectedAgentId, tokenUsage]
    );

    return (
        // A Settings section: the settings frame owns the band's breadcrumb.
        // Scope and range stay in the column with the cards they filter; the
        // 3rem band fits compact chrome only (Select has no compact size).
        <PageColumn>
            <SettingsPageHeader
                description="Processed tokens across this Server's Agents."
                title="Usage"
            />
            {filterChips.length > 0 ? (
                <ActiveUsageFilters
                    chips={filterChips}
                    onRemove={(key) =>
                        setSearchParams(
                            (params) => {
                                const next = new URLSearchParams(params);
                                next.delete(key);
                                return next;
                            },
                            { replace: true }
                        )
                    }
                />
            ) : null}
            {isFilterPending ? (
                <TokenUsageSkeleton />
            ) : view ? (
                <TokenUsageDashboard
                    controls={
                        <>
                            {view.agents.length > 0 ? (
                                <AgentUsageScopePicker
                                    agents={view.agents}
                                    onSelect={selectAgent}
                                    selectedAgentId={view.selectedAgent?.agentId ?? null}
                                />
                            ) : null}
                            <TokenUsageRangePicker days={days} onChange={setDays} />
                        </>
                    }
                    emptyMessage={
                        runtimeId === 'pi'
                            ? 'Usage will appear after a Pi Agent completes a model turn.'
                            : undefined
                    }
                    view={view}
                />
            ) : usage.data ? (
                <UsageEmptyCard
                    description="Usage will appear after an Agent completes a model turn."
                    title="No Agent Usage Yet"
                />
            ) : usage.error ? (
                <UsageEmptyCard description={usage.error.message} title="Usage Unavailable" />
            ) : (
                <TokenUsageSkeleton />
            )}
        </PageColumn>
    );
}

function TokenUsageSkeleton() {
    return (
        <div aria-busy="true" className="grid gap-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
    );
}
