import type { CloudAgentProvider, CloudAgentWork } from '@haus/api';
import {
    type CloudAgentPresentationStatus,
    cloudAgentPresentationStatus,
} from './cloud-agent-presentation.ts';

/**
 * The Thread preview states the work inside a Thread once per provider: one
 * work keeps its own row, and a fan-out collapses to a count and a status
 * breakdown so the preview stays at a glance however many Runs an Agent starts.
 */
export type ThreadCloudAgentSummary =
    | { kind: 'single'; provider: CloudAgentProvider; work: CloudAgentWork }
    | {
          count: number;
          kind: 'group';
          provider: CloudAgentProvider;
          statuses: readonly { count: number; status: CloudAgentPresentationStatus }[];
      };

/** Providers keep first-seen order; live states lead each breakdown. */
export function summarizeThreadCloudAgentWork(
    works: readonly CloudAgentWork[]
): ThreadCloudAgentSummary[] {
    const byProvider = new Map<CloudAgentProvider, CloudAgentWork[]>();
    for (const work of works) {
        const group = byProvider.get(work.provider) ?? [];
        group.push(work);
        byProvider.set(work.provider, group);
    }
    return [...byProvider].map(([provider, group]) => {
        const [only] = group;
        if (group.length === 1 && only) {
            return { kind: 'single', provider, work: only };
        }
        return { count: group.length, kind: 'group', provider, statuses: statusCounts(group) };
    });
}

export const cloudAgentStatusLabels: Record<CloudAgentPresentationStatus, string> = {
    cancelled: 'Cancelled',
    cancelling: 'Cancelling',
    completed: 'Done',
    expired: 'Expired',
    failed: 'Failed',
    queued: 'Queued',
    running: 'Running',
};

/** "7 running · 1 done · 1 failed" */
export function statusBreakdownText(summary: ThreadCloudAgentSummary & { kind: 'group' }) {
    return summary.statuses
        .map(({ count, status }) => `${count} ${cloudAgentStatusLabels[status].toLowerCase()}`)
        .join(' · ');
}

const statusOrder: readonly CloudAgentPresentationStatus[] = [
    'running',
    'queued',
    'cancelling',
    'completed',
    'failed',
    'expired',
    'cancelled',
];

function statusCounts(works: readonly CloudAgentWork[]) {
    const counts = new Map<CloudAgentPresentationStatus, number>();
    for (const work of works) {
        const status = cloudAgentPresentationStatus(work);
        counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return statusOrder.flatMap((status) => {
        const count = counts.get(status);
        return count ? [{ count, status }] : [];
    });
}
