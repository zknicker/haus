import type { AgentExecutionJournal } from '@haus/api';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TurnTraceTotals } from './turn-trace-view.ts';

/**
 * The trace's totals as one muted line above its rows — `32s · 8 calls ·
 * 3 sub-agents · 1 failed · Done` — so they read as a caption, never as
 * another row. A count of zero is no fact; failures alone take `danger`.
 */
export function TurnTraceStatsStrip({
    status,
    totals,
}: {
    /** How the run ended, from its journal; null when only activity events stand in. */
    status: AgentExecutionJournal['status'] | null;
    totals: TurnTraceTotals;
}) {
    const label = totals.isRunning ? 'Running' : status ? statusLabels[status] : null;
    const parts = [
        formatTraceDuration(totals.durationMs, { isRunning: totals.isRunning }),
        count(totals.calls, 'call', 'calls'),
        count(totals.subagents, 'sub-agent', 'sub-agents'),
        count(totals.images, 'image', 'images'),
        totals.failed > 0 ? `${totals.failed.toLocaleString()} failed` : null,
        label,
    ].filter((part): part is string => part !== null && part !== '');

    return (
        <p
            className="flex min-w-0 flex-wrap items-center gap-x-1.5 px-2 text-muted text-xs tabular-nums"
            data-trace-strip
        >
            {parts.map((part, index) => (
                <span className="flex items-center gap-x-1.5" key={part}>
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <span className={part.endsWith('failed') ? 'text-danger' : undefined}>
                        {part}
                    </span>
                </span>
            ))}
        </p>
    );
}

const statusLabels: Record<AgentExecutionJournal['status'], string> = {
    completed: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
    running: 'Running',
};

function count(value: number, one: string, many: string): string | null {
    return value > 0 ? `${value.toLocaleString()} ${value === 1 ? one : many}` : null;
}
