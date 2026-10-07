import { Button } from '@heroui/react';
import { useOptionalCurrentAgentActivity } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useServerTurns } from '../../../hooks/members/use-server-turns.ts';
import { ActivityNote } from '../../members/agent-profile/agent-activity.tsx';
import { ActivityLog } from '../../members/agent-profile/agent-activity-log.tsx';
import { useLogEntries } from '../../members/agent-profile/agent-activity-log-entries.ts';
import { getTurnDetailAccess } from '../../members/agent-profile/agent-activity-model.ts';
import { useServerContext } from '../server-context.ts';
import { ActivityAgentFilter, useActivityAgentFilter } from './server-activity-filter.tsx';
import { readServerActivityGroups } from './server-activity-turns.ts';

/**
 * The Server's Activity page: every Agent's turns interleaved in the same
 * event log an Agent's Activity tab shows, narrowed by the Agent filter in the
 * day bar. Settled turns come a page at a time from `agent.serverTurns`;
 * working runs come from the Server's one current-activity projection.
 */
export function ServerActivity() {
    const { server } = useServerContext();
    const agentsQuery = useAgents(server.id);
    const agents = agentsQuery.data ?? [];
    const filter = useActivityAgentFilter(agents);
    const turns = useServerTurns(
        server.id,
        filter.selected.length > 0 ? filter.selected : undefined
    );
    const current = useOptionalCurrentAgentActivity()?.activities ?? [];
    const groups = readServerActivityGroups({ agents, current, settled: turns.turns });
    const entries = useLogEntries(server.id, groups);
    const shown = filter.selected.length > 0 ? filter.selected : agents.map((agent) => agent.id);
    const agentFilter =
        agents.length > 1 ? (
            <ActivityAgentFilter
                agents={agents}
                onSelectionChange={filter.select}
                selected={filter.selected}
            />
        ) : null;

    // Blank while loading; the empty state only once there is truly nothing.
    if (agentsQuery.isPending || turns.isPending) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    if (entries.every((entry) => !shown.includes(entry.agent.id))) {
        return (
            <>
                {agentFilter ? (
                    <div className="flex justify-end px-3 pt-2">{agentFilter}</div>
                ) : null}
                <ActivityNote>
                    {turns.error ? 'Activity is unavailable right now.' : 'No activity yet.'}
                </ActivityNote>
            </>
        );
    }
    return (
        <ActivityLog
            access={getTurnDetailAccess(server.role)}
            dayBarAction={agentFilter}
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
            serverId={server.id}
            serverSlug={server.slug}
        />
    );
}
