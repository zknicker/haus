import type { WorkerReportOutcome } from '@haus/api';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useWorkerSummary } from '../../hooks/servers/use-worker.ts';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import { formatWorkerDuration } from './worker-presentation.ts';
import { useKnownWorker } from './worker-summaries.tsx';

const outcomeWords = {
    done: 'finished',
    failed: 'failed',
    'needs-you': 'needs you',
} as const satisfies Record<WorkerReportOutcome, string>;

export function WorkerReportNotice({
    outcome,
    serverId,
    turnId,
    workerId,
}: {
    outcome: WorkerReportOutcome;
    serverId: null | string;
    turnId: string;
    workerId: string;
}) {
    const known = useKnownWorker(workerId);
    const fetched = useWorkerSummary(serverId, workerId, known === null);
    const openWorker = useOpenWorkerView();
    const work = known ?? fetched;
    const span = work?.turnSpans[turnId] ?? null;
    return (
        <p
            className="text-muted flex min-w-0 justify-center gap-1 px-5 py-2 text-center text-sm"
            data-testid="worker-report-notice"
        >
            <button
                className="min-w-0 cursor-(--cursor-interactive) truncate hover:underline"
                onClick={() => openWorker(workerId)}
                type="button"
                {...opensPlace}
            >
                {work?.title ?? 'Worker'}
            </button>
            <span className="shrink-0">
                {span === null
                    ? outcomeWords[outcome]
                    : `${outcomeWords[outcome]}, worked for ${formatWorkerDuration(span)}`}
            </span>
        </p>
    );
}
