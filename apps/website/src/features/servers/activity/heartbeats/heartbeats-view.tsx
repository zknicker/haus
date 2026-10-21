import type * as React from 'react';
import { useState } from 'react';
import { useRelativeNow } from '../../../../components/time/relative-time.tsx';
import { useAgentHeartbeats } from '../../../../hooks/members/use-agent-heartbeats.ts';
import { ActivityNote } from '../../../members/agent-profile/agent-activity.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatsDayBar } from './heartbeats-day-bar.tsx';
import { HeartbeatsFeed } from './heartbeats-feed.tsx';
import { readDayWindow } from './heartbeats-model.ts';

/**
 * The Server Activity page's Heartbeats lens: the day bar (older and newer day,
 * then the Agent filter) over a feed of the day's heartbeat and dream outputs.
 * The Server reads one day at a time; the lens holds only which day.
 */
export function HeartbeatsView({
    action,
    agentIds,
    agents,
    readLogSearch,
    serverId,
}: {
    action: React.ReactNode;
    /** The Agent filter: empty is every Agent. */
    agentIds: readonly string[];
    agents: readonly ActivityLogAgent[];
    /** The Log's address with a run to reveal. */
    readLogSearch: (runId: string | null) => string;
    serverId: string;
}) {
    const nowMs = useRelativeNow(30_000);
    const [offset, setOffset] = useState(0);
    const day = readDayWindow(offset, nowMs);
    const query = useAgentHeartbeats(serverId, day, agentIds.length > 0 ? agentIds : undefined);
    const byId = new Map(agents.map((agent) => [agent.id, agent]));

    // Blank while loading; the empty line only once the day is truly empty.
    if (query.isPending) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    return (
        <div className="@container/heartbeats min-w-0 cursor-default [--trace-pad:calc(var(--spacing)*3)]">
            <HeartbeatsDayBar
                action={action}
                dayStartMs={day.startMs}
                nowMs={nowMs}
                offset={offset}
                onShowDay={setOffset}
            />
            {query.error && !query.data ? (
                <ActivityNote>Heartbeats are unavailable right now.</ActivityNote>
            ) : (
                <HeartbeatsFeed
                    agents={byId}
                    isToday={offset === 0}
                    lanes={query.data?.lanes ?? []}
                    readLogSearch={readLogSearch}
                    serverId={serverId}
                    window={day}
                />
            )}
        </div>
    );
}
