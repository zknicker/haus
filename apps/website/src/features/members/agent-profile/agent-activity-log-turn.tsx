import { Disclosure } from '@heroui/react';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { formatShortTime } from '../../../lib/format.ts';
import { cn } from '../../../lib/utils.ts';
import { readTurnTraceAxis } from '../../turn-trace/turn-trace.tsx';
import { TraceNested, traceRowClass } from '../../turn-trace/turn-trace-grid.tsx';
import { TurnTraceScopeProvider } from '../../turn-trace/turn-trace-scope.tsx';
import { TurnTraceSteps } from '../../turn-trace/turn-trace-steps-view.tsx';
import { buildTurnTraceView, type TurnTraceView } from '../../turn-trace/turn-trace-view.ts';
import { useTurnTraceNow } from '../../turn-trace/use-turn-trace-now.ts';
import { type ActivityLogEntry, readStepMarks } from './agent-activity-log-entries.ts';
import { useLogTurnJournal } from './agent-activity-log-journal.ts';
import { useActivityLogStores, useIsLinkedFromOverview } from './agent-activity-log-stores.ts';
import { ChatButtonRoom, LogChatButton, readChatTarget } from './agent-activity-log-turn-parts.tsx';
import type { TurnDetailAccess, TurnJournalPresentation } from './agent-activity-model.ts';
import { TurnDuration, TurnRowTitleLine, TurnStatusGlyph } from './agent-turn-row.tsx';
import { formatTurnOutcome, getTurnRowStatus } from './agent-turn-row-model.ts';

/**
 * One turn as a group in the flat log: a header
 * row on the log's columns (clock time, request, the turn's span on the
 * track, length), then its steps one depth in on the same columns, each
 * step's time its offset from the turn's start and its bar on the turn's own
 * scale. Nothing is boxed; the group's hairline separates it from the next.
 */
export function ActivityLogTurn({
    access,
    entry,
    isOpen,
    onOpenChange,
    serverId,
    serverSlug,
    showAgent,
}: {
    access: TurnDetailAccess;
    entry: ActivityLogEntry;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    serverSlug: string;
    showAgent: boolean;
}) {
    const { agent, row, title } = entry;
    const turn = row.latest;
    const { hover, marks } = useActivityLogStores();
    const presentation = useLogTurnJournal({
        access,
        agentId: agent.id,
        isOpen,
        serverId,
        turn,
    });
    const journal = presentation?.kind === 'available' ? presentation.journal : null;
    const isRunning = journal?.status === 'running' || turn.kind === 'active';
    const now = useTurnTraceNow(isRunning);
    const view = buildTurnTraceView(journal, turn.events, now);
    const turnMs = turn.kind === 'active' ? now - Date.parse(turn.startedAt) : turn.durationMs;
    const axisMs = Math.max(readTurnTraceAxis(view), turnMs);
    const stepMarks = journal ? readStepMarks(view.steps, axisMs) : null;
    React.useEffect(() => {
        if (stepMarks) {
            marks.set(turn.runId, stepMarks);
        }
    });
    const isLinked = useIsLinkedFromOverview(turn.runId);
    const status = getTurnRowStatus(row);
    const chatTarget = readChatTarget(title, turn.trigger);

    return (
        <div
            className={cn(
                'grid min-w-0 scroll-mt-40 pt-1.5 pb-1 transition-colors duration-150 motion-reduce:transition-none',
                isLinked && 'bg-default [--trace-ring:var(--default)]'
            )}
            data-log-turn={turn.runId}
            onPointerLeave={() => hover.set(null)}
            onPointerOver={(event) => {
                hover.set({
                    runId: turn.runId,
                    source: 'row',
                    span: readStepSpan(event.target, axisMs),
                });
            }}
        >
            <TurnTraceScopeProvider scope={{ axisMs, workspace: { agentId: agent.id, serverId } }}>
                <Disclosure isExpanded={isOpen} onExpandedChange={onOpenChange}>
                    <div className="group/turn-header relative">
                        <Disclosure.Heading>
                            <Disclosure.Trigger
                                className={cn(
                                    traceRowClass('default', 'log'),
                                    'hover:bg-default hover:[--trace-ring:var(--default)]'
                                )}
                                data-log-header
                            >
                                <time
                                    className="whitespace-nowrap text-foreground text-sm tabular-nums"
                                    dateTime={turn.startedAt}
                                >
                                    {formatShortTime(turn.startedAt)}
                                </time>
                                {/* A section title: the request across label and track, no bar. */}
                                <span className="@max-2xl/activity-log:col-span-1 col-span-2 flex min-w-0 items-center gap-2 font-semibold">
                                    {status ? <TurnStatusGlyph status={status} /> : null}
                                    {showAgent ? (
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            <EntityAvatar
                                                name={agent.displayName}
                                                size={16}
                                                src={agent.avatarUrl}
                                            />
                                            {agent.displayName}
                                        </span>
                                    ) : null}
                                    <TurnRowTitleLine
                                        count={status?.kind === 'failed' ? status.count : 1}
                                        title={title}
                                        turn={turn}
                                    />
                                    {chatTarget ? <ChatButtonRoom /> : null}
                                </span>
                                <span className="whitespace-nowrap text-end text-muted text-sm tabular-nums">
                                    <TurnDuration turn={turn} />
                                </span>
                                <span className="flex size-4 items-center justify-center">
                                    <Disclosure.Indicator />
                                </span>
                            </Disclosure.Trigger>
                        </Disclosure.Heading>
                        {chatTarget ? (
                            <LogChatButton
                                agentName={agent.displayName}
                                serverSlug={serverSlug}
                                target={chatTarget}
                            />
                        ) : null}
                    </div>
                    <Disclosure.Content>
                        <TurnSteps
                            access={access}
                            outcome={formatTurnOutcome(turn)}
                            presentation={presentation}
                            view={view}
                        />
                    </Disclosure.Content>
                </Disclosure>
            </TurnTraceScopeProvider>
        </div>
    );
}

function TurnSteps({
    access,
    outcome,
    presentation,
    view,
}: {
    access: TurnDetailAccess;
    outcome: string;
    presentation: TurnJournalPresentation | null;
    view: TurnTraceView;
}) {
    if (access === 'summary') {
        return <LogNote>{outcome}</LogNote>;
    }
    // Blank while the journal reads; never a skeleton.
    if (!presentation) {
        return null;
    }
    if (presentation.kind !== 'available') {
        return <LogNote>{`${outcome} · ${presentation.title}`}</LogNote>;
    }
    if (view.steps.length === 0) {
        return (
            <LogNote>{view.error?.message ?? 'No activity was recorded for this turn.'}</LogNote>
        );
    }
    return (
        <TraceNested>
            <TurnTraceSteps steps={view.steps} />
        </TraceNested>
    );
}

/** A muted line on the step depth, where a step's label would start. */
function LogNote({ children }: { children: React.ReactNode }) {
    return (
        <p
            className="pe-(--trace-pad) pb-1 text-muted text-sm"
            style={{ paddingInlineStart: 'calc(var(--trace-lead) + var(--trace-pad) + 0.75rem)' }}
        >
            {children}
        </p>
    );
}

/** The hovered step's span, read off its time cell; the header names no span. */
function readStepSpan(target: EventTarget, axisMs: number) {
    if (!(target instanceof Element) || axisMs <= 0) {
        return null;
    }
    const cell = target.closest('[data-trace-row]')?.querySelector('[data-trace-cell="time"]');
    const offset = Number(cell?.getAttribute('data-offset-ms'));
    if (!(cell && Number.isFinite(offset))) {
        return null;
    }
    const duration = Number(cell.getAttribute('data-duration-ms') ?? 0) || 0;
    return { start: Math.min(1, offset / axisMs), width: Math.min(1, duration / axisMs) };
}
