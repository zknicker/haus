import type { TriggerCreateInput, TriggerCreateResult } from '@haus/api';
import { requireChatWritable } from '../chats/chat-access.ts';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { GithubApiTransport } from '../github/github-api.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { requireActiveAgent } from '../reminders/reminder-model.ts';
import type { HausUser } from '../users/haus-user.ts';
import { createGithubTriggerRow } from './github-trigger-writes.ts';
import { requireTriggerOperator } from './operator-triggers.ts';
import { refuseLinearTriggers, type TriggerClock } from './trigger-model.ts';
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
    githubTransport: GithubApiTransport = {}
): Promise<TriggerCreateResult> {
    const operator = await requireTriggerOperator(db, member, input.serverId);
    if (input.kind === 'linear') {
        refuseLinearTriggers();
    }
    const row = {
        createdByUserId: operator.id,
        instruction: input.instruction?.trim() || null,
        origin: input.origin,
        ownerAgentId: input.agentId,
        serverId: input.serverId,
        title: input.title,
    };
    const resolveAnchor = (tx: HausDatabase) =>
        anchorOnOperatorDm(tx, member, { ...input, userId: operator.id });
    if (input.kind === 'github') {
        const created = await createGithubTriggerRow(
            { db, transport: githubTransport },
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

/**
 * Re-checks the operator inside the transaction and anchors on their DM with
 * the owning Agent, creating it when needed. A DM created here is announced
 * only once the trigger commits.
 */
async function anchorOnOperatorDm(
    tx: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string; userId: string }
): Promise<TriggerAnchor> {
    await requireTriggerOperator(tx, member, input.serverId);
    await requireActiveAgent(tx, input.serverId, input.agentId);
    const dm = await ensureAgentDmRecord(tx, {
        agentId: input.agentId,
        serverId: input.serverId,
        userId: input.userId,
    });
    await requireChatWritable(tx, { chatId: dm.id, serverId: input.serverId });
    return {
        chatId: dm.id,
        ...(dm.created
            ? {
                  event: prepareLifecycleEvent(
                      { chatId: dm.id, serverId: input.serverId },
                      'created'
                  ),
              }
            : {}),
        messageId: null,
    };
}
