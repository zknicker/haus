import type { Trigger, TriggerStatus, WebhookTrigger } from '@haus/api';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireActiveAgent, requireAgentAnchor } from '../reminders/reminder-model.ts';
import type { TriggerClock } from './trigger-model.ts';
import { readOwnedTrigger } from './trigger-queries.ts';
import {
    createTriggerRow,
    deleteTriggerRow,
    rotateTriggerSecretRow,
    setTriggerStatusRow,
} from './trigger-writes.ts';

/**
 * The Agent's own trigger mutations. Authorization is ownership plus continued
 * access to the anchor; the row work itself is the shared core in
 * `trigger-writes.ts`, which the operator path uses with its own check.
 */

export interface CreateTriggerInput {
    anchorChatId: string;
    anchorMessageId: string;
    instruction: string | null;
    kind: 'webhook';
    origin: string;
    serverId: string;
    title: string;
}

/**
 * Creates one armed trigger for the calling Agent, anchored to a message it can
 * already reach. The minted secret is returned once and never stored in the
 * clear.
 */
export async function createTrigger(
    db: HausDatabase,
    agentId: string,
    input: CreateTriggerInput,
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    return await createTriggerRow(
        db,
        {
            createdByUserId: null,
            instruction: input.instruction,
            kind: input.kind,
            origin: input.origin,
            ownerAgentId: agentId,
            serverId: input.serverId,
            title: input.title,
        },
        async (tx) => {
            await requireActiveAgent(tx, input.serverId, agentId);
            await requireAgentAnchor(tx, {
                agentId,
                anchorChatId: input.anchorChatId,
                anchorMessageId: input.anchorMessageId,
                serverId: input.serverId,
            });
            await requireChatWritable(tx, {
                chatId: input.anchorChatId,
                serverId: input.serverId,
            });
            return { chatId: input.anchorChatId, messageId: input.anchorMessageId };
        },
        clock
    );
}

/** Arms or disables one of the calling Agent's own triggers. */
export async function setTriggerStatus(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; status: TriggerStatus; triggerId: string },
    clock: TriggerClock
): Promise<Trigger> {
    return await setTriggerStatusRow(db, input, ownedBy(agentId, input), clock);
}

/** Replaces the bearer secret. The previous secret stops working immediately. */
export async function rotateTriggerSecret(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; triggerId: string },
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    return await rotateTriggerSecretRow(db, input, ownedBy(agentId, input), clock);
}

/** Removes one Trigger from active use while retaining its recent fire history. */
export async function deleteTrigger(
    db: HausDatabase,
    agentId: string,
    input: { origin: string; serverId: string; triggerId: string },
    clock: TriggerClock
): Promise<void> {
    await deleteTriggerRow(db, input, ownedBy(agentId, input), clock);
}

/** The Agent authorization every verb shares: it owns the row and can still reach the anchor. */
function ownedBy(agentId: string, input: { origin: string; serverId: string; triggerId: string }) {
    return async (tx: HausDatabase) =>
        await readOwnedTrigger(tx, {
            agentId,
            origin: input.origin,
            serverId: input.serverId,
            triggerId: input.triggerId,
        });
}
