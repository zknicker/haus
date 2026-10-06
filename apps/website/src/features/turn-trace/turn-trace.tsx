import { Chip } from '@heroui/react';
import { CancelCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { DisclosureGroupStateContext } from 'react-aria-components';
import { Icon } from '../../components/ui/icon.tsx';
import type { TurnJournalSnapshot } from '../../hooks/members/turn-journal-relay.ts';
import { useTurnJournal } from '../../hooks/members/use-turn-journal.ts';
import {
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
import { TraceFailure } from './turn-trace-call-body.tsx';
import { formatTraceDuration } from './turn-trace-duration.ts';
import { TurnTraceReveal } from './turn-trace-reveal.tsx';
import { TurnTraceScopeProvider, type TurnTraceWorkspace } from './turn-trace-scope.tsx';
import { TurnTraceScroll } from './turn-trace-scroll.tsx';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { buildTurnTraceView, type TurnTraceView } from './turn-trace-view.ts';
import { useTurnTraceNow } from './use-turn-trace-now.ts';

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
            workspace={agentId ? { agentId, serverId } : null}
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
    workspace = null,
}: {
    access: TurnDetailAccess;
    events?: AgentActivityTurn['events'];
    isPending: boolean;
    presentation: TurnJournalPresentation | null;
    refreshError?: string | null;
    workspace?: TurnTraceWorkspace | null;
}) {
    const journal =
        access === 'journal' && presentation?.kind === 'available' ? presentation.journal : null;
    const now = useTurnTraceNow(journal?.status === 'running');
    const view = buildTurnTraceView(journal, events, now);

    return (
        // Every step row is its own disclosure. Inside the Activity tab's
        // accordion, React Aria would otherwise enrol each one in the turn
        // rows' group: the group's keys would decide a call's state, so a
        // failed call would not open on its own there as it does in the drawer.
        <DisclosureGroupStateContext.Provider value={null}>
            {/* The Activity tab animates a row's open only when this holds
                something to measure (`default-theme.css`). */}
            <div className="@container grid min-w-0 gap-2 text-sm" data-turn-trace>
                <TurnTraceNotice
                    access={access}
                    isPending={isPending}
                    presentation={presentation}
                />
                {view.error ? <TurnTraceError error={view.error} /> : null}
                {view.steps.length === 0 ? (
                    journal && journal.status !== 'running' && !view.error ? (
                        <TurnTraceNote>No activity was recorded for this turn.</TurnTraceNote>
                    ) : null
                ) : (
                    // The relay answers after the row or drawer has opened, so the
                    // trace grows into place instead of landing at full height.
                    <TurnTraceReveal className="grid min-w-0 gap-1">
                        <TurnTraceTotals view={view} />
                        <TurnTraceScopeProvider scope={{ axisMs: readAxis(view), workspace }}>
                            <TurnTraceScroll>
                                <TurnTraceSteps steps={view.steps} />
                            </TurnTraceScroll>
                        </TurnTraceScopeProvider>
                    </TurnTraceReveal>
                )}
                {refreshError ? <TurnTraceNote>{refreshError}</TurnTraceNote> : null}
            </div>
        </DisclosureGroupStateContext.Provider>
    );
}

/** The turn's own failure, above its steps: the reason the turn stopped, not a call's. */
function TurnTraceError({ error }: { error: NonNullable<TurnTraceView['error']> }) {
    return (
        <div className="flex min-w-0 gap-2 text-sm">
            <span className="flex h-5 shrink-0 items-center">
                <Icon className="size-3.5 text-danger" icon={CancelCircleIcon} />
            </span>
            <TraceFailure failure={error} />
        </div>
    );
}

/** The trace's totals, stated once: how long, how much, and what went wrong. */
function TurnTraceTotals({ view }: { view: TurnTraceView }) {
    const { totals } = view;
    const duration = formatTraceDuration(totals.durationMs, { isRunning: totals.isRunning });
    const facts = [
        totals.isRunning ? `Working${duration ? ` for ${duration}` : ''}` : duration,
        plural(totals.calls, 'call'),
        plural(totals.subagents, 'sub-agent'),
        plural(totals.images, 'image'),
    ].filter((fact): fact is string => Boolean(fact));

    return (
        <p className="text-muted text-sm tabular-nums">
            {facts.join(' · ')}
            {totals.failed > 0 ? (
                <span className="text-danger">{`${facts.length > 0 ? ' · ' : ''}${totals.failed} failed`}</span>
            ) : null}
        </p>
    );
}

function plural(count: number, noun: string): string | null {
    if (count === 0) {
        return null;
    }
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Every bar's scale: the turn's wall time, widened to any step that outlasts it. */
function readAxis(view: TurnTraceView): number {
    const ends = view.steps.map((step) => step.timing.offsetMs + (step.timing.durationMs ?? 0));
    return Math.max(view.totals.durationMs ?? 0, ...ends);
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
