import type { ServerDurableEvent, Trigger, TriggerKind } from '@haus/api';
import { requireChatWritable } from '../chats/chat-access.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import { insertLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireActiveAgent } from '../reminders/reminder-model.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireTriggerOperator } from './operator-triggers.ts';
import type { TriggerClock } from './trigger-model.ts';
import { triggerCurlCommand } from './trigger-url.ts';
import { createTriggerRow } from './trigger-writes.ts';

export interface CreateOperatorTriggerInput {
    agentId: string;
    instruction?: string;
    kind: TriggerKind;
    origin: string;
    serverId: string;
    title: string;
}

/**
 * Creates one trigger on behalf of a Server Owner or Admin. A human has no
 * asking message to anchor to, so the trigger anchors on the DM between the
 * creator and the owning Agent and carries no anchor message at all: nothing is
 * written to the transcript. Every later fire lands in that DM, which is
 * exactly where the person who wired it will look.
 */
export async function createOperatorTrigger(
    db: HausDatabase,
    member: HausUser | null,
    input: CreateOperatorTriggerInput,
    clock: TriggerClock
): Promise<{ curl: string; secret: string; trigger: Trigger; url: string }> {
    const operator = await requireTriggerOperator(db, member, input.serverId);
    // Set by the transaction callback; emitted only once the trigger commits.
    let dmCreatedEvent: ServerDurableEvent | null = null;
    const created = await createTriggerRow(
        db,
        {
            createdByUserId: operator.id,
            instruction: input.instruction?.trim() || null,
            kind: input.kind,
            origin: input.origin,
            ownerAgentId: input.agentId,
            serverId: input.serverId,
            title: input.title,
        },
        async (tx) => {
            dmCreatedEvent = null;
            await requireTriggerOperator(tx, member, input.serverId);
            await requireActiveAgent(tx, input.serverId, input.agentId);
            const dm = await ensureAgentDmRecord(tx, {
                agentId: input.agentId,
                serverId: input.serverId,
                userId: operator.id,
            });
            await requireChatWritable(tx, { chatId: dm.id, serverId: input.serverId });
            if (dm.created) {
                dmCreatedEvent = await insertLifecycleEvent(
                    tx,
                    { chatId: dm.id, serverId: input.serverId },
                    'created',
                    clock.now()
                );
            }
            return { chatId: dm.id, messageId: null };
        },
        clock
    );
    if (dmCreatedEvent) {
        emitDurableChatEvent({ audienceUserId: null, event: dmCreatedEvent });
    }

    return {
        curl: triggerCurlCommand(created.trigger.url, created.secret),
        secret: created.secret,
        trigger: created.trigger,
        url: created.trigger.url,
    };
}
