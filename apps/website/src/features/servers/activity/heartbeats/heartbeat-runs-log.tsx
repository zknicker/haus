import { useEffect } from 'react';
import { useOptionalCurrentAgentActivity } from '../../../../hooks/agents/use-current-agent-activity.tsx';
import { useServerTurns } from '../../../../hooks/members/use-server-turns.ts';
import { ActivityLog } from '../../../members/agent-profile/agent-activity-log.tsx';
import {
    type ActivityLogAgent,
    useLogEntries,
} from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { getTurnDetailAccess } from '../../../members/agent-profile/agent-activity-model.ts';
import { useServerContext } from '../../server-context.ts';
import { readServerActivityGroups } from '../server-activity-turns.ts';
import { readHeartbeatEntries } from './heartbeat-runs.ts';
import type { DayWindow, LaneView } from './heartbeats-model.ts';

/**
 * The real Activity log under the lanes, for the day's heartbeat and dream runs
 * of the shown Agents. Settled turns come newest first a page at a time, so an
 * older day pages in until the day's start is reached; the log stays blank
 * until then. A pressed mark's run opens and scrolls into view.
 */
export function HeartbeatRunsLog({
    agentIds,
    agents,
    lanes,
    revealRunId,
    serverId,
    serverSlug,
    window,
}: {
    agentIds: readonly string[];
    agents: readonly ActivityLogAgent[];
    lanes: readonly LaneView[];
    revealRunId: string | null;
    serverId: string;
    serverSlug: string;
    window: DayWindow;
}) {
    const { server } = useServerContext();
    const turns = useServerTurns(serverId, agentIds.length > 0 ? agentIds : undefined);
    const current = useOptionalCurrentAgentActivity()?.activities ?? [];
    const groups = readServerActivityGroups({ agents, current, settled: turns.turns });
    const entries = readHeartbeatEntries(useLogEntries(serverId, groups), lanes);
    const oldest = turns.turns.at(-1);
    const isBeforeDay = !oldest || Date.parse(oldest.startedAt) > window.startMs;
    const isLoadingDay = turns.isFetchingMore || (turns.hasMore && isBeforeDay);

    const { hasMore, isFetchingMore, loadMore } = turns;
    useEffect(() => {
        if (hasMore && isBeforeDay && !isFetchingMore) {
            loadMore();
        }
    }, [hasMore, isBeforeDay, isFetchingMore, loadMore]);

    if (turns.isPending || isLoadingDay) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    return (
        <ActivityLog
            access={getTurnDetailAccess(server.role)}
            entries={entries}
            filter={{ agentIds: lanes.map((laneView) => laneView.agentId) }}
            revealRunId={revealRunId}
            scope={window}
            serverId={serverId}
            serverSlug={serverSlug}
        />
    );
}
