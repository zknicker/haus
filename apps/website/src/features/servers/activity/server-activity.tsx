import { Button } from '@heroui/react';
import type * as React from 'react';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useServerTurns } from '../../../hooks/members/use-server-turns.ts';
import { ActivityNote } from '../../members/agent-profile/agent-activity.tsx';
import { ActivityLog } from '../../members/agent-profile/agent-activity-log.tsx';
import {
    type ActivityLogAgent,
    useLogEntries,
} from '../../members/agent-profile/agent-activity-log-entries.ts';
import { getTurnDetailAccess } from '../../members/agent-profile/agent-activity-model.ts';
import { useServerContext } from '../server-context.ts';
import { HeartbeatsView } from './heartbeats/heartbeats-view.tsx';
import { ActivityAgentFilter, useActivityAgentFilter } from './server-activity-filter.tsx';
import { readServerActivityGroups } from './server-activity-turns.ts';
import { ActivityViewSwitch, useActivityView } from './server-activity-view.tsx';

/**
 * The Server's Activity page, in two lenses kept in the address: the Log, every
 * Agent's turns interleaved in the same event log an Agent's Activity tab
 * shows, and Heartbeats, each Agent's slots across the day. The Agent filter in
 * the day bar narrows both. Settled turns come a page at a time from
 * `agent.serverTurns`; working runs come from the Server's one current-activity
 * projection.
 */
export function ServerActivity() {
    const { server } = useServerContext();
    const agentsQuery = useAgents(server.id);
    const agents = agentsQuery.data ?? [];
    const filter = useActivityAgentFilter(agents);
    const { openTrace, revealRunId, setView, view } = useActivityView();
    const controls = (
        <>
            <ActivityViewSwitch onChange={setView} view={view} />
            {agents.length > 1 ? (
                <ActivityAgentFilter
                    agents={agents}
                    onSelectionChange={filter.select}
                    selected={filter.selected}
                />
            ) : null}
        </>
    );

    if (agentsQuery.isPending) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    return view === 'heartbeats' ? (
        <HeartbeatsView
            action={controls}
            agentIds={filter.selected}
            agents={agents}
            onOpenTrace={openTrace}
            serverId={server.id}
            serverSlug={server.slug}
        />
    ) : (
        <ServerActivityLog
            agents={agents}
            controls={controls}
            revealRunId={revealRunId}
            selected={filter.selected}
        />
    );
}

function ServerActivityLog({
    agents,
    controls,
    revealRunId,
    selected,
}: {
    agents: readonly ActivityLogAgent[];
    controls: React.ReactNode;
    revealRunId: string | null;
    selected: readonly string[];
}) {
    const { server } = useServerContext();
    const turns = useServerTurns(server.id, selected.length > 0 ? selected : undefined);
    const current = useOptionalCurrentAgentActivity()?.activities ?? [];
    const groups = readServerActivityGroups({ agents, current, settled: turns.turns });
    const entries = useLogEntries(server.id, groups);
    const shown = selected.length > 0 ? selected : agents.map((agent) => agent.id);

    // Blank while loading; the empty state only once there is truly nothing.
    if (turns.isPending) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    if (turns.error && entries.every((entry) => !shown.includes(entry.agent.id))) {
        return (
            <>
                <div className="flex justify-end px-3 pt-2">{controls}</div>
                <ActivityNote>Activity is unavailable right now.</ActivityNote>
            </>
        );
    }
    return (
        <ActivityLog
            access={getTurnDetailAccess(server.role)}
            dayBarAction={controls}
            entries={entries}
            filter={{ agentIds: shown }}
            footer={
                turns.hasMore ? (
                    <div className="flex justify-center px-3 py-3">
                        <Button
                            isDisabled={turns.isFetchingMore}
                            onPress={turns.loadMore}
                            size="sm"
                            variant="ghost"
                        >
                            {turns.isFetchingMore
                                ? 'Loading older activity...'
                                : 'Load older activity'}
                        </Button>
                    </div>
                ) : null
            }
            revealRunId={revealRunId}
            serverId={server.id}
            serverSlug={server.slug}
        />
    );
}
