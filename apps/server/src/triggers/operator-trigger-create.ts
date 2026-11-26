import type { TriggerCreateInput, TriggerCreateResult } from '@haus/api';
import { readCaptainChatId } from '../chats/captain-chat.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { requireActiveAgent } from '../reminders/reminder-model.ts';
import type { HausUser } from '../users/haus-user.ts';
import { createGithubTriggerRow } from './github-trigger-writes.ts';
import { requireTriggerOperator, type TriggerAuthoringServices } from './operator-triggers.ts';
import type { TriggerClock } from './trigger-model.ts';
import { triggerCurlCommand } from './trigger-url.ts';
import { createTriggerRow, type TriggerAnchor } from './trigger-writes.ts';

export type CreateOperatorTriggerInput = TriggerCreateInput & { origin: string };

/**
 * Creates one trigger on behalf of a Server Owner or Admin. A human has no
 * asking message to anchor to, so the trigger anchors on the DM between the
 * creator and the owning Agent and carries no anchor message at all: nothing is
 * written to the transcript. Every later fire lands in that DM, which is
 * exactly where the person who wired it will look. A webhook answers with its
 * one readable secret; a `github` Trigger has none and answers with itself.
 */
export async function createOperatorTrigger(
    db: HausDatabase,
    member: HausUser | null,
    input: CreateOperatorTriggerInput,
    clock: TriggerClock,
    services: TriggerAuthoringServices
): Promise<TriggerCreateResult> {
    const operator = await requireTriggerOperator(db, member, input.serverId);
    const row = {
        createdByUserId: operator.id,
        instruction: input.instruction?.trim() || null,
        origin: input.origin,
        ownerAgentId: input.agentId,
        serverId: input.serverId,
        title: input.title,
    };
    const resolveAnchor = (tx: HausDatabase) =>
        anchorOnCaptainChat(tx, member, { ...input, userId: operator.id });
    if (input.kind === 'github') {
        const created = await createGithubTriggerRow(
            { db, transport: services.githubTransport },
            { ...row, github: input.github },
            resolveAnchor,
            clock
        );
        if (created.event) {
            publishRealtime(created.event);
        }
        return { trigger: created.trigger };
    }
    const created = await createTriggerRow(db, { ...row, kind: 'webhook' }, resolveAnchor, clock);
    if (created.event) {
        publishRealtime(created.event);
    }
    return {
        curl: triggerCurlCommand(created.trigger.url, created.secret),
        secret: created.secret,
        trigger: created.trigger,
        url: created.trigger.url,
    };
}

/** Re-checks the operator inside the transaction and anchors on the owning Captain's chat. */
async function anchorOnCaptainChat(
    tx: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string; userId: string }
): Promise<TriggerAnchor> {
    await requireTriggerOperator(tx, member, input.serverId);
    await requireActiveAgent(tx, input.serverId, input.agentId);
    const chatId = await readCaptainChatId(tx, input);
    if (!chatId) {
        throw new Error('This Captain has no Captain chat to anchor the trigger in.');
    }
    await requireChatWritable(tx, { chatId, serverId: input.serverId });
    return { chatId, messageId: null };
}
