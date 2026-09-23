import type { Agent } from '@haus/api';
import { Accordion, Button, Chip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { CopyButton } from '../../../components/copy-button.tsx';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { useHausServerConnectionState } from '../../../lib/haus-server.tsx';
import { TurnTrace } from '../../turn-trace/turn-trace.tsx';
import { TurnTraceScroll } from '../../turn-trace/turn-trace-scroll.tsx';
import {
    formatAgentActivityDiagnosticInfo,
    getAgentActivityColor,
    getAgentActivityPhaseLabel,
    getTurnDetailAccess,
    type TurnDetailAccess,
} from './agent-activity-model.ts';
import {
    type AgentActivityTurn,
    formatActivityTurnCounts,
    formatActivityTurnHeadline,
    formatActivityTurnTime,
    getActivityTurnPhase,
    groupAgentActivityTurns,
} from './agent-activity-turns.ts';
import { AgentLoading } from './agent-loading.tsx';

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
            {activity.isPending && settledTurns.isPending ? (
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
                    serverId={server.id}
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
    serverId,
    turns,
}: {
    access: TurnDetailAccess;
    agentId: string;
    serverId: string;
    turns: readonly AgentActivityTurn[];
}) {
    // Expansion is the journal's request gate: a turn asks its Computer for
    // execution detail only once someone opens it.
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());

    return (
        <TurnTraceScroll>
            <Accordion
                allowsMultipleExpanded
                className="accordion--activity-history"
                expandedKeys={expanded}
                onExpandedChange={(keys) => setExpanded(new Set([...keys].map(String)))}
                variant="surface"
            >
                {turns.map((turn) => {
                    const phase = getActivityTurnPhase(turn);
                    return (
                        <Accordion.Item id={turn.runId} key={turn.runId}>
                            <Accordion.Heading>
                                <Accordion.Trigger>
                                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                                        {/* The trigger is medium weight for the
                                            headline; time and counts are body text. */}
                                        <time
                                            className="shrink-0 font-normal text-muted text-sm tabular-nums"
                                            dateTime={turn.startedAt}
                                        >
                                            {formatActivityTurnTime(turn.startedAt)}
                                        </time>
                                        <Chip
                                            color={getAgentActivityColor(phase)}
                                            size="sm"
                                            variant="soft"
                                        >
                                            {getAgentActivityPhaseLabel(phase)}
                                        </Chip>
                                        <span className="font-medium text-foreground text-sm">
                                            {formatActivityTurnHeadline(turn)}
                                        </span>
                                        <span className="font-normal text-muted text-sm">
                                            {formatActivityTurnCounts(turn)}
                                        </span>
                                    </span>
                                    <Accordion.Indicator />
                                </Accordion.Trigger>
                            </Accordion.Heading>
                            <Accordion.Panel>
                                <Accordion.Body>
                                    <TurnTrace
                                        access={access}
                                        agentId={agentId}
                                        enabled={expanded.has(turn.runId)}
                                        runId={turn.runId}
                                        serverId={serverId}
                                        turn={turn}
                                    />
                                </Accordion.Body>
                            </Accordion.Panel>
                        </Accordion.Item>
                    );
                })}
            </Accordion>
        </TurnTraceScroll>
    );
}
