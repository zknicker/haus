import type { CloudAgentAutomation } from '@haus/api';
import { formatRelativeTime } from '../../../lib/format.ts';
import {
    cloudAgentJobChipColor,
    cloudAgentJobLabels,
    quietFor,
} from '../../cloud-agents/cloud-agent-presentation.ts';

export function cloudAutomationPresentation(row: CloudAgentAutomation, now: number) {
    const updated = `Last update ${formatRelativeTime(row.work.updatedAt, now)}`;
    switch (row.notification) {
        case 'pending':
            return {
                label: 'Result queued',
                detail: 'Waiting for the agent to receive the result',
                color: 'accent',
            } as const;
        case 'delivered':
            return {
                label: cloudAgentJobLabels[row.work.job.state],
                detail: 'Result delivered to the agent',
                color: cloudAgentJobChipColor(row.work.job.state),
            } as const;
        case 'computer-removed':
            return {
                label: 'Tracking unavailable',
                detail: 'The Computer was removed; automatic notification is unavailable',
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
                detail: 'The delegating agent was retired',
                color: 'warning',
            } as const;
        case 'unavailable':
            return {
                label: cloudAgentJobLabels[row.work.job.state],
                detail: 'No delivery record is available',
                color: 'warning',
            } as const;
        case 'waiting':
            if (row.computerHealth !== 'healthy' || quietFor(row.work, now) !== null) {
                return {
                    label: 'Status unconfirmed',
                    detail: `${updated} · Notification resumes when tracking recovers`,
                    color: 'warning',
                } as const;
            }
            return {
                label: row.work.cancelRequestedAt ? 'Stopping' : 'Working',
                detail: 'Will notify the agent when this run finishes or needs input',
                color: 'accent',
            } as const;
    }
}
