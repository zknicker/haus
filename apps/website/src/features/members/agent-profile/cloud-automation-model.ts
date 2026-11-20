import type { WorkerAutomation } from '@haus/api';
import { formatRelativeTime } from '../../../lib/format.ts';
import {
    workerJobChipColor,
    workerJobLabels,
    quietFor,
} from '../../workers/worker-presentation.ts';

export function cloudAutomationPresentation(row: WorkerAutomation, now: number) {
    const updated = `Last update ${formatRelativeTime(row.worker.updatedAt, now)}`;
    switch (row.notification) {
        case 'pending':
            return {
                label: 'Result queued',
                detail: 'Waiting for the Captain to receive the result',
                color: 'accent',
            } as const;
        case 'delivered':
            return {
                label: workerJobLabels[row.worker.job.state],
                detail: 'Result delivered to the Captain',
                color: workerJobChipColor(row.worker.job.state),
            } as const;
        case 'computer-removed':
            return {
                label: 'Tracking unavailable',
                detail: 'The device was removed; automatic notification is unavailable',
                color: 'warning',
            } as const;
        case 'chat-removed':
            return {
                label: 'Notification unavailable',
                detail: 'The requesting conversation was deleted',
                color: 'warning',
            } as const;
        case 'agent-retired':
            return {
                label: 'Notification unavailable',
                detail: 'The delegating Captain was retired',
                color: 'warning',
            } as const;
        case 'unavailable':
            return {
                label: workerJobLabels[row.worker.job.state],
                detail: 'No delivery record is available',
                color: 'warning',
            } as const;
        case 'waiting':
            if (row.computerHealth !== 'healthy' || quietFor(row.worker, now) !== null) {
                return {
                    label: 'Status unconfirmed',
                    detail: `${updated} · Notification resumes when tracking recovers`,
                    color: 'warning',
                } as const;
            }
            return {
                label: row.worker.turns[0]?.stopRequestedAt ? 'Stopping' : 'Working',
                detail: 'Will notify the Captain when this run finishes or needs input',
                color: 'accent',
            } as const;
    }
}
