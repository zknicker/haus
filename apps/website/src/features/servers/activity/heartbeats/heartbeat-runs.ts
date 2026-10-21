import type { ActivityLogEntry } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import type { LaneView } from './heartbeats-model.ts';

const heartbeatTriggers: ReadonlySet<string> = new Set(['dream', 'heartbeat', 'heartbeat_report']);

/**
 * The log entries that are heartbeats or dreams. A running turn has no trigger
 * yet, so a run a lane already marks counts too.
 */
export function readHeartbeatEntries(
    entries: readonly ActivityLogEntry[],
    lanes: readonly LaneView[]
): ActivityLogEntry[] {
    const marked = new Set(
        lanes.flatMap(({ lane }) => lane.marks.flatMap((mark) => (mark.runId ? [mark.runId] : [])))
    );
    return entries.filter((entry) => {
        const turn = entry.row.latest;
        return (
            marked.has(turn.runId) ||
            (turn.trigger !== null && heartbeatTriggers.has(turn.trigger.kind))
        );
    });
}
