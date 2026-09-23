import { Chip } from '@heroui/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
    const journal = useTurnJournal({
        access,
        agentId,
        enabled,
        live: turn?.kind === 'active',
        runId,
        serverId,
    });
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
    const reducedMotion = useReducedMotion();
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
                <TurnTraceScroll>
                    <AnimatePresence initial={false}>
                        {entries.map((entry) => (
                            <motion.div
                                animate={{ opacity: 1 }}
                                className="min-w-0"
                                data-trace-anchor={entry.key}
                                initial={{ opacity: 0 }}
                                key={entry.key}
                                transition={{ duration: reducedMotion ? 0 : 0.15 }}
                            >
                                {entry.kind === 'event' ? (
                                    <TurnTraceNote>
                                        {formatAgentActivityEvent(entry.event)}
                                    </TurnTraceNote>
                                ) : entry.kind === 'reasoning' ? (
                                    <TurnTraceReasoning reasoning={entry.reasoning} />
                                ) : (
                                    <TurnTraceToolCall tool={entry.tool} />
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </TurnTraceScroll>
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
