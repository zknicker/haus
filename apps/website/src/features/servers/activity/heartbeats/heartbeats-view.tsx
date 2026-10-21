import { useRelativeNow } from '../../../../components/time/relative-time.tsx';
import { useAgentHeartbeats } from '../../../../hooks/members/use-agent-heartbeats.ts';
import { useLoadMoreSentinel } from '../../../../hooks/shell/use-load-more-sentinel.ts';
import { ActivityNote } from '../../../members/agent-profile/agent-activity.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { readFeedDays } from './heartbeat-feed-model.ts';
import { HeartbeatRoster } from './heartbeat-roster.tsx';
import { readRoster } from './heartbeat-roster-model.ts';
import { HeartbeatsFeed } from './heartbeats-feed.tsx';

/**
 * The Server Activity page's Heartbeats lens, as a social feed: a roster of
 * Agents (which is also the Agent filter) over one continuous column of what
 * they noticed and learned, newest first, older days loading as you scroll.
 */
export function HeartbeatsView({
    agentIds,
    agents,
    onSelectAgents,
    readLogSearch,
    serverId,
}: {
    /** The Agent filter: empty is every Agent. */
    agentIds: readonly string[];
    agents: readonly ActivityLogAgent[];
    onSelectAgents: (agentIds: readonly string[]) => void;
    /** The Log's address with a run to reveal. */
    readLogSearch: (runId: string | null) => string;
    serverId: string;
}) {
    const nowMs = useRelativeNow(30_000);
    const heartbeats = useAgentHeartbeats(serverId);
    const { hasMore, isFetchingMore, loadMore } = heartbeats;
    const sentinelRef = useLoadMoreSentinel({
        isActive: hasMore && !isFetchingMore,
        onReachEnd: loadMore,
    });

    // Blank while loading; the empty line only once there is truly nothing.
    if (heartbeats.isPending) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const visible = heartbeats.lanes.filter((lane) => byId.has(lane.agentId));
    const days = readFeedDays(visible, agentIds);
    const roster = readRoster(
        agents.map((agent) => agent.id),
        visible,
        nowMs
    );
    const isEmpty = days.length === 0 && !hasMore && !isFetchingMore;
    return (
        <div className="mx-auto min-w-0 max-w-[42.5rem] cursor-default px-4 pb-10">
            <HeartbeatRoster
                agents={agents}
                entries={roster}
                onSelect={onSelectAgents}
                selected={agentIds}
            />
            {heartbeats.error && days.length === 0 ? (
                <ActivityNote>Heartbeats are unavailable right now.</ActivityNote>
            ) : (
                <HeartbeatsFeed
                    agents={byId}
                    days={days}
                    lanes={visible}
                    readLogSearch={readLogSearch}
                    serverId={serverId}
                />
            )}
            {isEmpty ? <p className="py-6 text-muted text-sm">No observations yet</p> : null}
            {hasMore ? <div aria-hidden className="h-px" ref={sentinelRef} /> : null}
        </div>
    );
}
