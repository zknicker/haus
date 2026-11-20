import type { WorkerAttention } from '@haus/api';

type WorkerNotice = WorkerAttention['notice'];

export const workerInboxSources = {
    pull_request: 'pull_request',
    settled: 'worker_report',
    stall: 'worker_stall',
} as const satisfies Record<WorkerNotice, string>;

export type WorkerInboxSource = (typeof workerInboxSources)[WorkerNotice];

const noticeBySource = new Map<string, WorkerNotice>(
    Object.entries(workerInboxSources).map(([notice, source]) => [source, notice as WorkerNotice])
);

export function workerNoticeOf(source: string) {
    return noticeBySource.get(source) ?? null;
}

export function isWorkerInboxSource(source: string): source is WorkerInboxSource {
    return noticeBySource.has(source);
}
