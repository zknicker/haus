import { Button } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Icon } from '../../../../components/ui/icon.tsx';
import { useAgentHeartbeats } from '../../../../hooks/members/use-agent-heartbeats.ts';
import { ActivityNote } from '../../../members/agent-profile/agent-activity.tsx';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { formatDayLabel } from '../../../members/agent-profile/agent-turn-row-model.ts';
import { HeartbeatDetail } from './heartbeat-detail.tsx';
import { HeartbeatLanes } from './heartbeat-lanes.tsx';
import { HeartbeatSummary } from './heartbeat-summary.tsx';
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
    const lanes = readLanes(
        query.data?.lanes ?? [],
        agents.map((agent) => agent.id)
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
            <section
                aria-label="Heartbeats day"
                className="sticky top-0 z-10 -mt-px flex min-w-0 items-center gap-1 border-separator border-b bg-background px-(--trace-pad) pt-2 pb-1"
            >
                <Button
                    aria-label="Show the earlier day"
                    isIconOnly
                    onPress={() => showDay(offset + 1)}
                    size="sm"
                    variant="ghost"
                >
                    <Icon icon={ArrowLeft01Icon} size={16} />
                </Button>
                <Button
                    aria-label={offset > 0 ? 'Show the later day' : 'No later days'}
                    isDisabled={offset === 0}
                    isIconOnly
                    onPress={() => showDay(offset - 1)}
                    size="sm"
                    variant="ghost"
                >
                    <Icon icon={ArrowRight01Icon} size={16} />
                </Button>
                <h3 aria-live="polite" className="ms-1 shrink-0 font-medium text-sm">
                    {formatDayLabel(new Date(day.startMs), nowMs)}
                </h3>
                <span className="ms-auto flex items-center gap-1">{action}</span>
            </section>
            {query.error && !query.data ? (
                <ActivityNote>Heartbeats are unavailable right now.</ActivityNote>
            ) : query.data && lanes.length > 0 ? (
                <>
                    <HeartbeatSummary summary={query.data.summary} />
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
                    ) : null}
                </>
            ) : (
                <p className="px-(--trace-pad) py-3 text-muted text-sm">
                    {offset === 0 ? 'No heartbeats today' : 'No heartbeats this day'}
                </p>
            )}
        </div>
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
