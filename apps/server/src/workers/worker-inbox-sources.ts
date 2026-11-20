import type { WorkerAttention } from '@haus/api';

type WorkerNotice = WorkerAttention['notice'];

export const workerInboxSources = {
    pull_request: 'pull_request',
    stall: 'worker_stall',
} as const satisfies Record<WorkerNotice, string>;

const noticeBySource = new Map<string, WorkerNotice>(
    Object.entries(workerInboxSources).map(([notice, source]) => [source, notice as WorkerNotice])
);

export function workerNoticeOf(source: string) {
    return noticeBySource.get(source) ?? null;
}

export function isWorkerAttentionSource(source: string) {
    return noticeBySource.has(source);
}
