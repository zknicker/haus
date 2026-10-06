import type { AgentCurrentActivity } from '@haus/api';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useAgentActivityPreview } from '../../hooks/members/use-agent-activity-preview.ts';
import { useAgentTurns } from '../../hooks/members/use-agent-turns.ts';
import { formatRelativeTime } from '../../lib/format.ts';
import { formatHoverLiveLine, selectHoverLogLines } from './agent-hover-activity-model.ts';
import { formatAgentDelegationSummary } from './agent-hover-delegations.ts';
import { groupAgentActivityTurns } from './agent-profile/agent-activity-turns.ts';
import {
    formatTurnOutcome,
    getTurnRowStatus,
    type TurnRowTitle,
} from './agent-profile/agent-turn-row-model.ts';
import {
    collapseRecentActivity,
    type RecentActivityRow,
} from './agent-profile/recent-activity-rows.ts';
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
                    {title.place ? <span className="shrink-0 text-muted">{title.place}</span> : null}
                </p>
            )}
            <p className="truncate font-medium text-accent tabular-nums">
                {formatHoverLiveLine(current, now)}
            </p>
            {delegations ? <p className="text-foreground tabular-nums">{delegations}</p> : null}
            {log.length > 0 ? (
                <ul className="mt-1 flex min-w-0 flex-col gap-1">
                    {log.map((line) => (
                        <li className="flex min-w-0 items-center gap-2" key={line.id}>
                            <time
                                className="w-14 shrink-0 text-muted tabular-nums"
                                dateTime={line.occurredAt}
                            >
                                {line.time}
                            </time>
                            <span className="min-w-0 truncate text-foreground">{line.label}</span>
                        </li>
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

function AgentHoverTurn({ row, title }: { row: RecentActivityRow; title: TurnRowTitle }) {
    const now = useRelativeNow();
    const outcome = formatTurnOutcome(row.latest);
    const status = getTurnRowStatus(row);
    const statusLabel =
        status && status.kind !== 'working'
            ? `${status.kind === 'failed' ? 'Failed' : 'Interrupted'}${status.count > 1 ? ` ${status.count}×` : ''}`
            : null;
    const heading = title.kind === 'text' ? title.text : title.kind === 'none' ? outcome : '';

    return (
        <li className="flex min-w-0 flex-col">
            <span className="flex min-h-4 min-w-0 items-center gap-1.5">
                {statusLabel ? (
                    <span
                        className={
                            status?.kind === 'failed'
                                ? 'shrink-0 text-danger'
                                : 'shrink-0 text-warning'
                        }
                    >
                        {statusLabel}
                    </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-foreground">{heading}</span>
                <time className="shrink-0 text-muted tabular-nums" dateTime={row.latest.startedAt}>
                    {formatRelativeTime(row.latest.startedAt, now)}
                </time>
            </span>
            {title.kind === 'none' ? null : (
                <span className="min-w-0 truncate text-muted">
                    {title.place ? `${title.place} · ${outcome}` : outcome}
                </span>
            )}
        </li>
    );
}
