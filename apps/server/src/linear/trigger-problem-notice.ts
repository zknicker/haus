import type { LinearTriggerProblem } from '@haus/api';
import { enqueueInboxItem, ensureDeliveryState } from '../agent-delivery/store.ts';
import { triggerProblemInboxSource } from '../github/problem-notice.ts';
import type { HausDatabase } from '../postgres/connection.ts';

const problemFix: Record<LinearTriggerProblem, { cause: string; fix: string }> = {
    agent_access_revoked: {
        cause: 'you no longer have access to its Linear connection',
        fix: 'Ask a Server Owner or Admin to grant you the Linear connection again.',
    },
    references_unavailable: {
        cause: 'a label, workflow state, project, or project status it names was deleted or archived in Linear',
        fix: 'Update the Trigger to name objects that still exist.',
    },
    sign_in_required: {
        cause: 'its Linear workspace needs to be connected again',
        fix: 'Ask a Server Owner or Admin to reconnect Linear in Settings → Connections.',
    },
    teams_unavailable: {
        cause: 'a team it listens to left the Haus app’s team access in Linear',
        fix: 'Ask a Linear admin to give the Haus app access to the team again, or update the Trigger’s teams.',
    },
    workspace_removed: {
        cause: 'its Linear workspace was removed from Haus',
        fix: 'Ask a Server Owner or Admin to connect Linear again, then recreate this Trigger.',
    },
};

export interface LinearTriggerProblemNotice {
    anchorChatId: string;
    ownerAgentId: string;
    problem: LinearTriggerProblem;
    problemSince: Date;
    serverId: string;
    title: string;
    triggerId: string;
}

/**
 * One `trigger_problem` notice to the owning Agent in the anchor Chat, inside
 * the caller's transaction. The dedupe key names the Trigger, the problem, and
 * when it began, so re-entering the same problem later notifies again.
 */
export async function enqueueLinearTriggerProblemNotice(
    tx: HausDatabase,
    notice: LinearTriggerProblemNotice
): Promise<void> {
    await ensureDeliveryState(tx, { agentId: notice.ownerAgentId, serverId: notice.serverId });
    await enqueueInboxItem(tx, {
        agentId: notice.ownerAgentId,
        chatId: notice.anchorChatId,
        content: linearTriggerProblemNoticeText(notice),
        createdAt: notice.problemSince,
        dedupeKey: `problem:${notice.triggerId}:${notice.problem}:${notice.problemSince.toISOString()}`,
        serverId: notice.serverId,
        source: triggerProblemInboxSource,
    });
}

export function linearTriggerProblemNoticeText(
    notice: Pick<LinearTriggerProblemNotice, 'problem' | 'title' | 'triggerId'>
): string {
    const { cause, fix } = problemFix[notice.problem];
    return [
        `⚠️ Trigger paused: ${notice.title}`,
        `Your Linear Trigger ${notice.triggerId} stays armed but will not fire: ${cause} (problem=${notice.problem}).`,
        `Fix: ${fix}`,
        'It resumes on its own once the cause is gone. Tell the person who asked for it if they need to act.',
    ].join('\n');
}
