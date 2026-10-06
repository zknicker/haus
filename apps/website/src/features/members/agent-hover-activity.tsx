import type { AgentCurrentActivity } from '@haus/api';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useAgentActivityPreview } from '../../hooks/members/use-agent-activity-preview.ts';
import { useAgentTurns } from '../../hooks/members/use-agent-turns.ts';
import { formatHoverLiveLine, selectHoverLogLines } from './agent-hover-activity-model.ts';
import { formatAgentDelegationSummary } from './agent-hover-delegations.ts';
import { AgentHoverTurn, HoverLogRow, HoverTimedRow } from './agent-hover-rows.tsx';
import { groupAgentActivityTurns } from './agent-profile/agent-activity-turns.ts';
import { collapseRecentActivity } from './agent-profile/recent-activity-rows.ts';
import { useRunTitle, useTurnRowTitles } from './agent-profile/use-turn-row-titles.ts';

/** Turns read to find the last two rows once repeated failures fold. */
const recentTurnRead = 10;
const recentTurnRows = 2;

/**
 * The hover card's activity: while the Agent works, the request it is on, what
 * it is doing now, its running sub-agents, and the run's latest steps; while
 * idle, its last two turns.
 */
export function AgentHoverActivity({ agentId, serverId }: { agentId: string; serverId: string }) {
    const context = useOptionalCurrentAgentActivity();
    const current =
        context?.serverId === serverId
            ? context.activities.find((activity) => activity.agentId === agentId)
            : undefined;

    return (
        <section
            aria-label={current ? 'Current activity' : 'Recent turns'}
            className="flex min-w-0 flex-col gap-1 border-separator border-t pt-2.5 text-xs empty:hidden"
        >
            {current ? (
                <AgentHoverLive agentId={agentId} current={current} serverId={serverId} />
            ) : (
                <AgentHoverRecentTurns agentId={agentId} serverId={serverId} />
            )}
        </section>
    );
}

function AgentHoverLive({
    agentId,
    current,
    serverId,
}: {
    agentId: string;
    current: AgentCurrentActivity;
    serverId: string;
}) {
    const now = useRelativeNow(1000);
    const preview = useAgentActivityPreview(serverId, agentId);
    const live = formatHoverLiveLine(current, now);
    const delegations = formatAgentDelegationSummary(current.activeDelegations, now);
    const log = selectHoverLogLines(preview.data?.events ?? [], current);
    const title = useRunTitle(serverId, agentId, current.runId);

    return (
        <>
            {title.kind === 'none' ? null : (
                // Held blank while the trigger reads, so the live line never jumps.
                <p className="flex min-h-4 min-w-0 gap-1.5">
                    <span className="min-w-0 truncate text-foreground">
                        {title.kind === 'text' ? title.text : null}
                    </span>
                    {title.place ? (
                        <span className="shrink-0 text-muted">{title.place}</span>
                    ) : null}
                </p>
            )}
            <HoverTimedRow className="font-medium text-accent" line={live} />
            {delegations ? <HoverTimedRow className="text-foreground" line={delegations} /> : null}
            {log.length > 0 ? (
                <ul className="mt-1 flex min-w-0 flex-col gap-1">
                    {log.map((line) => (
                        <HoverLogRow key={line.id} line={line} />
                    ))}
                </ul>
            ) : null}
        </>
    );
}

function AgentHoverRecentTurns({ agentId, serverId }: { agentId: string; serverId: string }) {
    const turns = useAgentTurns(serverId, agentId, recentTurnRead);
    const rows = collapseRecentActivity(
        groupAgentActivityTurns([], turns.data ?? []),
        recentTurnRows
    );
    const titleOf = useTurnRowTitles(
        serverId,
        agentId,
        rows.map((row) => row.latest)
    );
    // Blank while the first read is out; "none yet" only when there are none.
    if (!turns.data) {
        return null;
    }
    if (rows.length === 0) {
        return <p className="text-muted">No turns yet.</p>;
    }
    return (
        <ul className="flex min-w-0 flex-col gap-2">
            {rows.map((row) => (
                <AgentHoverTurn key={row.latest.runId} row={row} title={titleOf(row.latest)} />
            ))}
        </ul>
    );
}
