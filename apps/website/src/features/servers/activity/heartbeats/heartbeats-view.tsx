import type * as React from 'react';
import { useEffect, useState } from 'react';
import { useAgentHeartbeats } from '../../../../hooks/members/use-agent-heartbeats.ts';
import { ActivityNote } from '../../../members/agent-profile/agent-activity.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { HeartbeatDetail } from './heartbeat-detail.tsx';
import { HeartbeatLanes } from './heartbeat-lanes.tsx';
import { HeartbeatSummary } from './heartbeat-summary.tsx';
import { HeartbeatsDayBar } from './heartbeats-day-bar.tsx';
import { readDayWindow, readLanes, resolveSelection } from './heartbeats-model.ts';

/**
 * The Server Activity page's Heartbeats lens: the day bar (older and newer day,
 * then the page's view and Agent controls), a summary strip, one lane per Agent
 * across the viewer's local day, and the selected mark's detail. The Server
 * reads one day at a time; the lens holds only which day and which mark.
 */
export function HeartbeatsView({
    action,
    agentIds,
    agents,
    onOpenTrace,
    serverId,
    serverSlug,
}: {
    action: React.ReactNode;
    /** The Agent filter: empty is every Agent. */
    agentIds: readonly string[];
    agents: readonly ActivityLogAgent[];
    onOpenTrace: (runId: string) => void;
    serverId: string;
    serverSlug: string;
}) {
    const nowMs = useNow(30_000);
    const [offset, setOffset] = useState(0);
    const [chosenKey, setChosenKey] = useState<string | null>(null);
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
    const selected = resolveSelection(lanes, chosenKey);
    const showDay = (next: number) => {
        setOffset(next);
        setChosenKey(null);
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
            ) : query.data && lanes.length > 0 ? (
                <>
                    <HeartbeatSummary lanes={lanes} summary={query.data.summary} />
                    <HeartbeatLanes
                        agents={byId}
                        isToday={offset === 0}
                        lanes={lanes}
                        nowMs={nowMs}
                        onSelect={setChosenKey}
                        selectedKey={selected?.key ?? null}
                        window={day}
                    />
                    {selected ? (
                        <HeartbeatDetail
                            agent={byId.get(selected.agentId)}
                            key={selected.key}
                            onOpenTrace={onOpenTrace}
                            selected={selected}
                            serverId={serverId}
                            serverSlug={serverSlug}
                        />
                    ) : (
                        <EmptyDay isToday={offset === 0} />
                    )}
                </>
            ) : (
                <EmptyDay isToday={offset === 0} />
            )}
        </div>
    );
}

/** No heartbeat on the day: said once the day is truly empty, never while loading. */
function EmptyDay({ isToday }: { isToday: boolean }) {
    return (
        <p className="px-(--trace-pad) py-3 text-muted text-sm">
            {isToday ? 'No heartbeats today' : 'No heartbeats this day'}
        </p>
    );
}

/** The clock the Now line and the day label read, ticking on an interval. */
function useNow(intervalMs: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(timer);
    }, [intervalMs]);
    return now;
}
