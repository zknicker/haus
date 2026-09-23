import { Chip } from '@heroui/react';
import { AnimatePresence } from 'motion/react';
import * as React from 'react';
import type { TurnJournalSnapshot } from '../../hooks/members/turn-journal-relay.ts';
import { useTurnJournal } from '../../hooks/members/use-turn-journal.ts';
import {
    formatAgentActivityEvent,
    getAgentActivityColor,
    getAgentActivityPhaseLabel,
    type TurnDetailAccess,
    type TurnJournalPresentation,
} from '../members/agent-profile/agent-activity-model.ts';
import {
    type AgentActivityTurn,
    formatActivityTurnCounts,
    formatActivityTurnHeadline,
    getActivityTurnPhase,
} from '../members/agent-profile/agent-activity-turns.ts';
import { TurnTraceNote } from './turn-trace-blocks.tsx';
import { buildTurnTrace } from './turn-trace-model.ts';
import { TurnTraceReasoning } from './turn-trace-reasoning.tsx';
import { TurnTraceReveal } from './turn-trace-reveal.tsx';
import { TurnTraceScroll } from './turn-trace-scroll.tsx';
import { TurnTraceToolCall } from './turn-trace-tool.tsx';

/** The turn's outcome at a glance, for surfaces that do not already say it. */
export function TurnTraceHeader({ turn }: { turn: AgentActivityTurn }) {
    const phase = getActivityTurnPhase(turn);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Chip color={getAgentActivityColor(phase)} size="sm" variant="soft">
                {getAgentActivityPhaseLabel(phase)}
            </Chip>
            <span className="font-medium text-foreground text-sm">
                {formatActivityTurnHeadline(turn)}
            </span>
            <span className="text-muted text-sm">{formatActivityTurnCounts(turn)}</span>
        </div>
    );
}

/**
 * What the Agent actually did, in order: the Computer's reasoning and tool calls.
 * The journal is requested only
 * while this is mounted and open, and only for viewers Server allows.
 */
export function TurnTrace({
    access,
    agentId,
    enabled,
    runId,
    serverId,
    turn,
}: {
    access: TurnDetailAccess;
    agentId: string | null;
    enabled: boolean;
    runId: string | null;
    serverId: string;
    turn: AgentActivityTurn | null;
}) {
    const journal = useRetainedJournal(
        runId,
        useTurnJournal({
            access,
            agentId,
            enabled,
            live: turn?.kind === 'active',
            runId,
            serverId,
        })
    );
    const presentation = journal.presentation;

    if (!runId) {
        return <TurnTraceNote>This message has no available turn identity.</TurnTraceNote>;
    }

    return (
        <TurnTracePresentation
            access={access}
            events={turn?.events}
            isPending={journal.isPending}
            presentation={presentation}
            refreshError={journal.refreshError}
        />
    );
}

/** The rendered trace, split from the relay so its shape can be proved directly. */
export function TurnTracePresentation({
    access,
    events,
    isPending,
    presentation,
    refreshError = null,
}: {
    access: TurnDetailAccess;
    events?: AgentActivityTurn['events'];
    isPending: boolean;
    presentation: TurnJournalPresentation | null;
    refreshError?: string | null;
}) {
    const entries = buildTurnTrace(
        access === 'journal' && presentation?.kind === 'available' ? presentation.journal : null,
        events
    );

    return (
        <div className="grid min-w-0 gap-2">
            <TurnTraceNotice access={access} isPending={isPending} presentation={presentation} />
            {entries.length === 0 ? (
                presentation?.kind === 'available' && presentation.journal.status !== 'running' ? (
                    <TurnTraceNote>No activity was recorded for this turn.</TurnTraceNote>
                ) : null
            ) : (
                // The relay answers after the row or drawer has opened, so the
                // trace grows into place instead of landing at full height.
                <TurnTraceReveal className="min-w-0">
                    <TurnTraceScroll>
                        <AnimatePresence initial={false}>
                            {entries.map((entry) => (
                                <TurnTraceReveal
                                    className="min-w-0"
                                    data-trace-anchor={entry.key}
                                    key={entry.key}
                                >
                                    {entry.kind === 'event' ? (
                                        <TurnTraceNote>
                                            {formatAgentActivityEvent(entry.event)}
                                        </TurnTraceNote>
                                    ) : entry.kind === 'reasoning' ? (
                                        <TurnTraceReasoning
                                            isStreaming={entry.isStreaming}
                                            reasoning={entry.reasoning}
                                        />
                                    ) : (
                                        <TurnTraceToolCall tool={entry.tool} />
                                    )}
                                </TurnTraceReveal>
                            ))}
                        </AnimatePresence>
                    </TurnTraceScroll>
                </TurnTraceReveal>
            )}
            {refreshError ? <TurnTraceNote>{refreshError}</TurnTraceNote> : null}
        </div>
    );
}

function TurnTraceNotice({
    access,
    isPending,
    presentation,
}: {
    access: TurnDetailAccess;
    isPending: boolean;
    presentation: TurnJournalPresentation | null;
}) {
    if (access === 'summary') {
        return <TurnTraceNote>Execution details are available to owners and admins.</TurnTraceNote>;
    }
    if (isPending && !presentation) {
        return null;
    }
    if (!presentation || presentation.kind === 'available') {
        return null;
    }
    return <TurnTraceNote>{`${presentation.title} — ${presentation.description}`}</TurnTraceNote>;
}

/**
 * A closed view stops asking its Computer, which empties the live snapshot.
 * Keeping the last answer on screen lets a collapsing row animate the trace it
 * showed, and lets a reopened row show it at once while the relay refreshes.
 */
function useRetainedJournal(runId: string | null, snapshot: TurnJournalSnapshot) {
    const [retained, setRetained] = React.useState<{
        runId: string | null;
        snapshot: TurnJournalSnapshot;
    } | null>(null);

    if (snapshot.presentation && retained?.snapshot !== snapshot) {
        setRetained({ runId, snapshot });
    }
    if (!snapshot.presentation && retained?.runId === runId && retained.snapshot.presentation) {
        return retained.snapshot;
    }
    return snapshot;
}
