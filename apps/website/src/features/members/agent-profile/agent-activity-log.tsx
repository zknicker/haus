import * as React from 'react';
import { cn } from '../../../lib/utils.ts';
import { TraceLayoutProvider } from '../../turn-trace/turn-trace-grid.tsx';
import {
    type ActivityLogAgent,
    type ActivityLogDay,
    type ActivityLogEntry,
    type ActivityLogFilter,
    readLogDays,
    readOpenOnArrival,
    useLogEntries,
} from './agent-activity-log-entries.ts';
import { ActivityLogOverview } from './agent-activity-log-overview.tsx';
import {
    type ActivityLogStores,
    ActivityLogStoresContext,
    JournalQueue,
    LinkedHoverStore,
    StepMarksStore,
} from './agent-activity-log-stores.ts';
import { ActivityLogTurn } from './agent-activity-log-turn.tsx';
import type { TurnDetailAccess } from './agent-activity-model.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';

/** The Activity tab's log: one Agent's turns, through the same log an all-Agents view would use. */
export function AgentActivityLog({
    agent,
    serverId,
    turns,
    ...log
}: Omit<ActivityLogProps, 'entries' | 'filter'> & {
    agent: ActivityLogAgent;
    turns: readonly AgentActivityTurn[];
}) {
    const entries = useLogEntries(serverId, [{ agent, turns }]);
    return (
        <ActivityLog
            {...log}
            entries={entries}
            filter={{ agentIds: [agent.id] }}
            serverId={serverId}
        />
    );
}

interface ActivityLogProps {
    access: TurnDetailAccess;
    /** Ends the pinned day bar, after the day's readout. */
    dayBarAction?: React.ReactNode;
    entries: readonly ActivityLogEntry[];
    filter: ActivityLogFilter;
    /** Closes the log under its last day, still beneath the pinned band. */
    footer?: React.ReactNode;
    serverId: string;
    serverSlug: string;
}

/**
 * Agent activity as one flat, full-width event log: the day being read
 * pinned on top (day bar and overview strip), then turns as collapsible
 * groups under day rows, each step on the same columns as its turn's header.
 * Rows run edge to edge; text keeps the page gutter (`--trace-pad`). The band
 * follows the day under it as the log scrolls. Entries may come from any
 * number of Agents; `filter` picks which show.
 */
export function ActivityLog({
    access,
    dayBarAction,
    entries,
    filter,
    footer,
    serverId,
    serverSlug,
}: ActivityLogProps) {
    const days = readLogDays(entries, filter);
    const showAgent = filter.agentIds.length > 1;
    const [toggled, setToggled] = React.useState<ReadonlyMap<string, boolean>>(new Map());
    const openByDefault = readOpenOnArrival(days);
    const isOpen = (runId: string) => toggled.get(runId) ?? openByDefault.has(runId);
    const setOpen = React.useCallback((runId: string, open: boolean) => {
        setToggled((current) => new Map(current).set(runId, open));
    }, []);
    const [stores] = React.useState<ActivityLogStores>(() => ({
        hover: new LinkedHoverStore(),
        marks: new StepMarksStore(),
        queue: new JournalQueue(),
        reveal: (runId) => {
            setOpen(runId, true);
            requestAnimationFrame(() =>
                scrollToLogTarget(`[data-log-turn="${CSS.escape(runId)}"]`)
            );
        },
    }));
    const isRunning = days.some((day) =>
        day.entries.some((entry) => entry.row.latest.kind === 'active')
    );
    const now = useLogNow(isRunning);
    const root = React.useRef<HTMLDivElement>(null);
    const [viewedKey, setViewedKey] = useViewedDay(root);
    const viewed = days.findIndex((day) => day.key === viewedKey);
    const index = viewed === -1 ? 0 : viewed;
    const day = days[index];
    const showDay = (next: ActivityLogDay) => {
        setViewedKey(next.key, true);
        scrollToLogTarget(`[data-log-day="${CSS.escape(next.key)}"]`);
    };

    return (
        <ActivityLogStoresContext value={stores}>
            <TraceLayoutProvider layout="log">
                <div className="@container/activity-log min-w-0 cursor-default" ref={root}>
                    <div
                        className={cn(
                            'grid min-w-0 text-sm [--trace-ground:var(--background)]',
                            // The page gutter: the shell band's, as other full-bleed lists use.
                            '[--trace-pad:calc(var(--spacing)*3)]',
                            '[--trace-lead:calc(4.5rem+var(--spacing)*2)]',
                            '@max-2xl/activity-log:[--trace-lead:calc(3.75rem+var(--spacing)*2)]'
                        )}
                        data-activity-log
                        data-turn-trace
                    >
                        {day ? (
                            <ActivityLogOverview
                                access={access}
                                action={dayBarAction}
                                day={day}
                                newer={days[index - 1] ?? null}
                                now={now}
                                older={days[index + 1] ?? null}
                                onDayChange={showDay}
                                serverId={serverId}
                                showAgent={showAgent}
                            />
                        ) : null}
                        {days.map((logDay, dayIndex) => (
                            <section
                                aria-label={logDay.label}
                                className={cn(
                                    'grid min-w-0 scroll-mt-28 content-start',
                                    // The last day can still scroll under the strip, so
                                    // the switcher always lands on the day it names.
                                    dayIndex === days.length - 1 && 'min-h-[calc(100dvh-14rem)]'
                                )}
                                data-log-day={logDay.key}
                                key={logDay.key}
                            >
                                {/* The pinned strip names the first day; later days get a row. */}
                                {dayIndex > 0 ? (
                                    <h3 className="px-(--trace-pad) pt-6 pb-1 font-medium text-muted text-xs">
                                        {logDay.label}
                                    </h3>
                                ) : null}
                                <div className="grid min-w-0 divide-y divide-separator">
                                    {logDay.entries.map((entry) => (
                                        <ActivityLogTurn
                                            access={access}
                                            entry={entry}
                                            isOpen={isOpen(entry.row.latest.runId)}
                                            key={entry.row.latest.runId}
                                            onOpenChange={(open) =>
                                                setOpen(entry.row.latest.runId, open)
                                            }
                                            serverId={serverId}
                                            serverSlug={serverSlug}
                                            showAgent={showAgent}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                        {footer}
                    </div>
                </div>
            </TraceLayoutProvider>
        </ActivityLogStoresContext>
    );
}

/**
 * The day under the pinned strip: the last day section whose top has scrolled
 * past the strip's bottom. A switcher press pins its choice while the scroll
 * it starts settles, so a short last day still reads as chosen.
 */
function useViewedDay(
    root: React.RefObject<HTMLDivElement | null>
): [string | null, (key: string, fromSwitcher?: boolean) => void] {
    const [key, setKey] = React.useState<string | null>(null);
    const lockedUntil = React.useRef(0);
    React.useEffect(() => {
        let frame = 0;
        const read = () => {
            frame = 0;
            const node = root.current;
            if (!node || performance.now() < lockedUntil.current) {
                return;
            }
            const strip = node.querySelector('[data-log-overview]')?.getBoundingClientRect();
            const edge = (strip?.bottom ?? 0) + 8;
            let current: string | null = null;
            for (const section of node.querySelectorAll<HTMLElement>('[data-log-day]')) {
                if (section.getBoundingClientRect().top <= edge) {
                    current = section.dataset.logDay ?? null;
                }
            }
            setKey(current);
        };
        const onScroll = () => {
            frame ||= requestAnimationFrame(read);
        };
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => {
            document.removeEventListener('scroll', onScroll, { capture: true });
            cancelAnimationFrame(frame);
        };
    }, [root]);
    const choose = React.useCallback((next: string, fromSwitcher = false) => {
        if (fromSwitcher) {
            lockedUntil.current = performance.now() + 900;
        }
        setKey(next);
    }, []);
    return [key, choose];
}

/** Today's axis runs to now: every second while a turn runs, otherwise every half minute. */
function useLogNow(isRunning: boolean): number {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), isRunning ? 1000 : 30_000);
        return () => window.clearInterval(timer);
    }, [isRunning]);
    return now;
}

function scrollToLogTarget(selector: string) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
