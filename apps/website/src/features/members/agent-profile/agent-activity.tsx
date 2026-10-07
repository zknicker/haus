import type { Agent } from '@haus/api';
import { Accordion, Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { CopyButton } from '../../../components/copy-button.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { useHausServerConnectionState } from '../../../lib/haus-server.tsx';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { TurnTrace } from '../../turn-trace/turn-trace.tsx';
import { TurnTraceScroll } from '../../turn-trace/turn-trace-scroll.tsx';
import {
    formatAgentActivityDiagnosticInfo,
    getTurnDetailAccess,
    type TurnDetailAccess,
} from './agent-activity-model.ts';
import { type AgentActivityTurn, groupAgentActivityTurns } from './agent-activity-turns.ts';
import { AgentLoading } from './agent-loading.tsx';
import { TurnRowBody, TurnRowContent } from './agent-turn-row.tsx';
import {
    groupTurnRowsByDay,
    type TurnRowTitle,
    turnChatActionLabel,
} from './agent-turn-row-model.ts';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';
import { useTurnRowTitles } from './use-turn-row-titles.ts';

export function AgentActivity({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const activity = useAgentActivityHistory(server.id, agent.id);
    const settledTurns = useAgentTurns(server.id, agent.id);
    const connectionState = useHausServerConnectionState();
    const events = activity.events;
    const unavailable =
        events.length === 0 && activity.error !== null && settledTurns.error !== null;
    const diagnosticInfo = formatAgentActivityDiagnosticInfo(events);
    const turns = groupAgentActivityTurns(events, settledTurns.data ?? []);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>Activity History</ItemCardGroup.Title>
                {/* Icon-only, with the negative margin absorbing the
                        button's box so this header stays the same height as
                        the button-less headers on sibling tabs. */}
                <CopyButton
                    className="-my-1.5"
                    disabled={events.length === 0}
                    label="Copy diagnostic info"
                    value={diagnosticInfo}
                />
            </ItemCardGroup.Header>
            {activity.isPending || settledTurns.isPending ? (
                <AgentLoading label="Loading activity history..." />
            ) : unavailable ? (
                // Empty and error states sit in the group they replace, so
                // the section keeps its shape instead of collapsing to a
                // loose line of grey text.
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                {connectionState === 'connecting' ||
                                connectionState === 'reconnecting'
                                    ? 'Activity history is unavailable while offline. Reconnect to try again.'
                                    : 'Activity history is unavailable right now.'}
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                </ItemCardGroup>
            ) : turns.length === 0 ? (
                <ItemCardGroup className="overflow-hidden">
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>No activity yet.</ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                </ItemCardGroup>
            ) : (
                <ActivityTurnHistory
                    access={getTurnDetailAccess(server.role)}
                    agentId={agent.id}
                    agentName={agent.displayName}
                    serverId={server.id}
                    serverSlug={server.slug}
                    turns={turns}
                />
            )}
            {events.length > 0 && activity.hasMore ? (
                <div className="flex justify-center border-separator border-t px-4 py-3">
                    <Button
                        isDisabled={activity.isFetching}
                        onPress={activity.loadMore}
                        size="sm"
                        variant="ghost"
                    >
                        {activity.isFetching ? 'Loading older activity...' : 'Load older activity'}
                    </Button>
                </div>
            ) : null}
        </ItemCardGroup>
    );
}

function ActivityTurnHistory({
    access,
    agentId,
    agentName,
    serverId,
    serverSlug,
    turns,
}: {
    access: TurnDetailAccess;
    agentId: string;
    agentName: string;
    serverId: string;
    serverSlug: string;
    turns: readonly AgentActivityTurn[];
}) {
    // Expansion is the journal's request gate: a turn asks its Computer for
    // execution detail only once someone opens it.
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
    const rows = collapseRecentActivity(turns, Number.POSITIVE_INFINITY);
    const titleOf = useTurnRowTitles(
        serverId,
        agentId,
        rows.map((row) => row.latest)
    );

    return (
        <TurnTraceScroll>
            <div className="flex min-w-0 flex-col gap-4">
                {groupTurnRowsByDay(rows).map((day) => (
                    <section aria-label={day.label} className="flex flex-col gap-2" key={day.key}>
                        <h3 className="px-4 font-medium text-muted text-xs">{day.label}</h3>
                        <Accordion
                            allowsMultipleExpanded
                            className="accordion--activity-history"
                            expandedKeys={expanded}
                            onExpandedChange={(keys) =>
                                setExpanded(replaceDayKeys(expanded, day.rows, keys))
                            }
                            variant="surface"
                        >
                            {day.rows.map((row) => (
                                <Accordion.Item id={row.latest.runId} key={row.latest.runId}>
                                    <Accordion.Heading>
                                        <Accordion.Trigger>
                                            <TurnRowContent
                                                isExpanded={expanded.has(row.latest.runId)}
                                                row={row}
                                                title={titleOf(row.latest)}
                                            />
                                            <Accordion.Indicator />
                                        </Accordion.Trigger>
                                    </Accordion.Heading>
                                    <Accordion.Panel>
                                        <Accordion.Body>
                                            <TurnRowBody>
                                                {/* Trace rows pad their own hover fill;
                                                    their icons, not the fill, meet the
                                                    request's edge. */}
                                                <div className="-mx-2 min-w-0">
                                                    <TurnTrace
                                                        access={access}
                                                        agentId={agentId}
                                                        enabled={expanded.has(row.latest.runId)}
                                                        runId={row.latest.runId}
                                                        serverId={serverId}
                                                        stripAction={
                                                            <TurnChatButton
                                                                agentName={agentName}
                                                                serverSlug={serverSlug}
                                                                title={titleOf(row.latest)}
                                                                turn={row.latest}
                                                            />
                                                        }
                                                        totalsPlacement="strip"
                                                        turn={row.latest}
                                                    />
                                                </div>
                                            </TurnRowBody>
                                        </Accordion.Body>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    </section>
                ))}
            </div>
        </TurnTraceScroll>
    );
}

/** The way back to the Chat the request came from, ending the open row's totals line. */
function TurnChatButton({
    agentName,
    serverSlug,
    title,
    turn,
}: {
    agentName: string;
    serverSlug: string;
    title: TurnRowTitle;
    turn: AgentActivityTurn;
}) {
    const navigate = useNavigate();
    const trigger = turn.trigger;
    if (!(trigger && trigger.kind !== 'private' && title.kind === 'text' && title.place)) {
        return null;
    }
    return (
        <Button
            onPress={() => navigate(serverChatRoute(serverSlug, trigger.chatId))}
            size="sm"
            variant="secondary"
        >
            {turnChatActionLabel(title.place, agentName)}
            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
        </Button>
    );
}

/** Each day is its own Accordion; one day's change keeps the other days' open rows. */
function replaceDayKeys(
    expanded: ReadonlySet<string>,
    dayRows: readonly RecentActivityRow[],
    dayKeys: Iterable<React.Key>
): ReadonlySet<string> {
    const day = new Set(dayRows.map((row) => row.latest.runId));
    return new Set([
        ...[...expanded].filter((runId) => !day.has(runId)),
        ...[...dayKeys].map(String),
    ]);
}
