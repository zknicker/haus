import type * as React from 'react';
import { useState } from 'react';
import { useRelativeNow } from '../../../../components/time/relative-time.tsx';
import { useAgentHeartbeats } from '../../../../hooks/members/use-agent-heartbeats.ts';
import { ActivityNote } from '../../../members/agent-profile/agent-activity.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatLanes } from './heartbeat-lanes.tsx';
import { HeartbeatRunsLog } from './heartbeat-runs-log.tsx';
import { HeartbeatsDayBar } from './heartbeats-day-bar.tsx';
import { readDayWindow, readLanes } from './heartbeats-model.ts';

/**
 * The Server Activity page's Heartbeats lens: the day bar (older and newer day,
 * then the Agent filter), one lane per Agent across the viewer's local day, and
 * under them the real Activity log of that day's heartbeat and dream runs. The
 * Server reads one day at a time; the lens holds only which day and which mark.
 */
export function HeartbeatsView({
    action,
    agentIds,
    agents,
    serverId,
    serverSlug,
}: {
    action: React.ReactNode;
    /** The Agent filter: empty is every Agent. */
    agentIds: readonly string[];
    agents: readonly ActivityLogAgent[];
    serverId: string;
    serverSlug: string;
}) {
    const nowMs = useRelativeNow(30_000);
    const [offset, setOffset] = useState(0);
    const [chosen, setChosen] = useState<{
        key: string;
        press: number;
        runId: string | null;
    } | null>(null);
    const day = readDayWindow(offset, nowMs);
    const query = useAgentHeartbeats(serverId, day, agentIds.length > 0 ? agentIds : undefined);
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    // Every visible Agent gets a lane, in the roster's order the Log filter uses.
    const lanes = readLanes(
        query.data?.lanes ?? [],
        agents
            .map((agent) => agent.id)
            .filter((id) => agentIds.length === 0 || agentIds.includes(id))
    );
    const hasMarks = lanes.some(({ lane }) => lane.marks.length > 0);
    const showDay = (next: number) => {
        setOffset(next);
        setChosen(null);
    };

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
                onShowDay={showDay}
            />
            {query.error && !query.data ? (
                <ActivityNote>Heartbeats are unavailable right now.</ActivityNote>
            ) : (
                <>
                    <HeartbeatLanes
                        agents={byId}
                        isToday={offset === 0}
                        lanes={lanes}
                        nowMs={nowMs}
                        onSelect={(key, runId) =>
                            setChosen((last) => ({ key, press: (last?.press ?? 0) + 1, runId }))
                        }
                        selectedKey={chosen?.key ?? null}
                        window={day}
                    />
                    {hasMarks ? (
                        <HeartbeatRunsLog
                            agentIds={agentIds}
                            agents={agents}
                            lanes={lanes}
                            revealKey={chosen?.press ?? 0}
                            revealRunId={chosen?.runId ?? null}
                            serverId={serverId}
                            serverSlug={serverSlug}
                            window={day}
                        />
                    ) : (
                        <EmptyDay isToday={offset === 0} />
                    )}
                </>
            )}
        </div>
    );
}

/** No check-in on the day: said once the day is truly empty, never while loading. */
function EmptyDay({ isToday }: { isToday: boolean }) {
    return (
        <p className="px-(--trace-pad) py-3 text-muted text-sm">
            {isToday ? 'No heartbeats today' : 'No heartbeats this day'}
        </p>
    );
}
