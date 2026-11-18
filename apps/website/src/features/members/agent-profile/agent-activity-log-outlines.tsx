import * as React from 'react';
import { useTurnOutlines } from '../../../hooks/members/use-turn-outlines.ts';
import { type ActivityLogDay, readOutlineMarks } from './agent-activity-log-entries.ts';
import { useActivityLogStores } from './agent-activity-log-stores.ts';
import type { TurnDetailAccess } from './agent-activity-model.ts';

/**
 * Reads the outlines of the day's settled turns, one batched request per
 * Agent, and publishes their step marks for the overview. A running turn keeps
 * its live journal; an opened turn's journal marks take over from its outline.
 * Renders nothing.
 */
export function ActivityLogDayOutlines({
    access,
    day,
    serverId,
}: {
    access: TurnDetailAccess;
    day: ActivityLogDay;
    serverId: string;
}) {
    const agentIds = [...new Set(day.entries.map((entry) => entry.agent.id))];
    return agentIds.map((agentId) => (
        <AgentDayOutlines
            access={access}
            agentId={agentId}
            day={day}
            key={agentId}
            serverId={serverId}
        />
    ));
}

function AgentDayOutlines({
    access,
    agentId,
    day,
    serverId,
}: {
    access: TurnDetailAccess;
    agentId: string;
    day: ActivityLogDay;
    serverId: string;
}) {
    const { marks } = useActivityLogStores();
    const turns = day.entries
        .filter((entry) => entry.agent.id === agentId)
        .map((entry) => entry.row.latest)
        .filter((turn) => turn.kind !== 'active');
    const outlines = useTurnOutlines({
        agentId,
        enabled: access === 'journal',
        runIds: turns.map((turn) => turn.runId),
        serverId,
    });
    React.useEffect(() => {
        for (const turn of turns) {
            const outline = outlines.get(turn.runId);
            if (outline) {
                marks.setOutline(turn.runId, readOutlineMarks(outline, turn.durationMs));
            }
        }
    });
    return null;
}
