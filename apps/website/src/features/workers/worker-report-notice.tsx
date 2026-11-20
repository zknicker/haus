import type { WorkerReportOutcome } from '@haus/api';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { opensPlace } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useWorkerSummary } from '../../hooks/servers/use-worker.ts';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';
import { useOpenWorkerView } from './use-open-worker-view.ts';
import { useKnownWorker } from './worker-summaries.tsx';

const outcomeWords = {
    done: 'finished',
    failed: 'failed',
    'needs-you': 'needs you',
} as const satisfies Record<WorkerReportOutcome, string>;

export function WorkerReportNotice({
    outcome,
    serverId,
    timestamp,
    workerId,
}: {
    outcome: WorkerReportOutcome;
    serverId: null | string;
    timestamp: string;
    workerId: string;
}) {
    const known = useKnownWorker(workerId);
    const fetched = useWorkerSummary(serverId, workerId, known === null);
    const openWorker = useOpenWorkerView();
    const work = known ?? fetched;
    return (
        <p
            className="text-muted flex min-w-0 items-center gap-2 py-2 pr-5 pl-11.5 text-sm"
            data-testid="worker-report-notice"
        >
            {work ? <WorkerKeycap provider={work.place} size={16} /> : null}
            <button
                className="text-foreground min-w-0 cursor-(--cursor-interactive) truncate font-medium hover:underline"
                onClick={() => openWorker(workerId)}
                type="button"
                {...opensPlace}
            >
                {work?.title ?? 'Worker'}
            </button>
            <span className="shrink-0">{outcomeWords[outcome]}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 text-xs">
                <RelativeTime value={timestamp} />
            </span>
        </p>
    );
}
