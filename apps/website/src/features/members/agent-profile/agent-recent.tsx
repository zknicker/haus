import type { Agent } from '@haus/api';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import { groupAgentActivityTurns, withRunTriggers } from './agent-activity-turns.ts';
import { recentRowLine, turnSummaries } from './agent-recent-model.ts';
import { formatTurnOutcome } from './agent-turn-outcome.ts';
import { getTurnRowStatus, turnTriggerPlace } from './agent-turn-row-model.ts';
import { TurnDuration, TurnStatusGlyph } from './agent-turn-row.tsx';
import {
    CaptainListEmpty,
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
} from './captain-list.tsx';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';
import { useTurnRowTitles } from './use-turn-row-titles.ts';

const recentRowLimit = 5;

export function AgentRecent({
    agent,
    onSeeAll,
    server,
}: {
    agent: Agent;
    onSeeAll: () => void;
    server: ServerDetail;
}) {
    const activity = useAgentActivityHistory(server.id, agent.id);
    const settledTurns = useAgentTurns(server.id, agent.id);
    if (activity.isPending || settledTurns.isPending) {
        return null;
    }
    const turns = withRunTriggers(
        groupAgentActivityTurns(activity.events, settledTurns.data ?? []),
        activity.runTriggers
    );
    const rows = collapseRecentActivity(turns, recentRowLimit);

    return (
        <CaptainListGroup
            action={{ label: 'All activity', onPress: onSeeAll }}
            count={turns.length}
            title="Recent"
        >
            {rows.length === 0 ? (
                <CaptainListEmpty>
                    {activity.error && settledTurns.error
                        ? 'Activity history is unavailable right now.'
                        : 'No activity yet.'}
                </CaptainListEmpty>
            ) : (
                <RecentRows
                    agentId={agent.id}
                    onOpen={onSeeAll}
                    rows={rows}
                    serverId={server.id}
                    summaries={turnSummaries(settledTurns.data)}
                />
            )}
        </CaptainListGroup>
    );
}

function RecentRows({
    agentId,
    onOpen,
    rows,
    serverId,
    summaries,
}: {
    agentId: string;
    onOpen: () => void;
    rows: readonly RecentActivityRow[];
    serverId: string;
    summaries: ReadonlyMap<string, string | null>;
}) {
    const now = useRelativeNow(60_000);
    const chatsById = new Map((useChats(serverId).data ?? []).map((chat) => [chat.id, chat]));
    const titleOf = useTurnRowTitles(
        serverId,
        agentId,
        rows.map((row) => row.latest)
    );
    return (
        <CaptainListRows label="Recent" onAction={onOpen}>
            {rows.map((row) => {
                const turn = row.latest;
                const status = getTurnRowStatus(row);
                const title = titleOf(turn);
                const line = recentRowLine({
                    outcome: formatTurnOutcome(turn),
                    summary: summaries.get(turn.runId),
                    title,
                });
                return (
                    <CaptainListRow
                        age={taskAge({ createdAt: turn.startedAt }, now)}
                        glyph={status ? <TurnStatusGlyph status={status} /> : null}
                        id={turn.runId}
                        key={turn.runId}
                        note={row.count > 1 ? `${row.count}×` : null}
                        place={turnTriggerPlace(turn.trigger, chatsById)}
                        status={<TurnDuration turn={turn} />}
                        textValue={line.text}
                        title={
                            <span className={line.muted ? 'text-muted' : undefined}>
                                {line.text}
                            </span>
                        }
                    />
                );
            })}
        </CaptainListRows>
    );
}
