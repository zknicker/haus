import type { GithubTriggerProblem } from '@haus/api';
import { enqueueInboxItem, ensureDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';

/** The inbox source of a Trigger problem notice: concrete and bodiless (inbox-lanes.ts). */
export const triggerProblemInboxSource = 'trigger_problem';

const problemFix: Record<GithubTriggerProblem, { cause: string; fix: string }> = {
    agent_access_revoked: {
        cause: 'you no longer have access to its GitHub connection',
        fix: 'Ask a Server Owner or Admin to grant you the GitHub connection again.',
    },
    installation_removed: {
        cause: 'its GitHub installation was removed from Haus',
        fix: 'Ask a GitHub org owner to install the Haus App again and bind it in Settings → Connections, then recreate this Trigger.',
    },
    installation_suspended: {
        cause: 'its GitHub installation is suspended on GitHub',
        fix: 'Ask a GitHub org owner to unsuspend the Haus App installation.',
    },
    permissions_missing: {
        cause: 'the GitHub installation lacks a permission one of its events needs',
        fix: 'Ask a GitHub org owner to accept the Haus App permission update on GitHub.',
    },
    repositories_unavailable: {
        cause: 'a selected repository left the installation or the GitHub user’s access',
        fix: 'Ask a GitHub org owner to restore repository access, or update the Trigger’s repositories.',
    },
    sign_in_required: {
        cause: 'its GitHub connection needs to sign in again',
        fix: 'Ask a Server Owner or Admin to sign in to GitHub again in Settings → Connections.',
    },
};

export interface TriggerProblemNotice {
    anchorChatId: string;
    ownerAgentId: string;
    problem: GithubTriggerProblem;
    problemSince: Date;
    serverId: string;
    title: string;
    triggerId: string;
}

/**
 * Enqueues one problem notice to the owning Agent in the anchor Chat, inside
 * the caller's transaction. The dedupe key names the Trigger, the problem, and
 * when it began, so re-entering the same problem later notifies again.
 */
export async function enqueueTriggerProblemNotice(
    tx: HausDatabase,
    notice: TriggerProblemNotice
): Promise<void> {
    await ensureDeliveryState(tx, { agentId: notice.ownerAgentId, serverId: notice.serverId });
    await enqueueInboxItem(tx, {
        agentId: notice.ownerAgentId,
        chatId: notice.anchorChatId,
        content: triggerProblemNoticeText(notice),
        createdAt: notice.problemSince,
        dedupeKey: `problem:${notice.triggerId}:${notice.problem}:${notice.problemSince.toISOString()}`,
        serverId: notice.serverId,
        source: triggerProblemInboxSource,
    });
}

export function triggerProblemNoticeText(
    notice: Pick<TriggerProblemNotice, 'problem' | 'title' | 'triggerId'>
): string {
    const { cause, fix } = problemFix[notice.problem];
    return [
        `⚠️ Trigger paused: ${notice.title}`,
        `Your GitHub Trigger ${notice.triggerId} stays armed but will not fire: ${cause} (problem=${notice.problem}).`,
        `Fix: ${fix}`,
        'It resumes on its own once the cause is gone. Tell the person who asked for it if they need to act.',
    ].join('\n');
}
