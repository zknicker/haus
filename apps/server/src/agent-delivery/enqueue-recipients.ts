import type { TaskDeliveryMode } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentDelivery } from './delivery.ts';
import type { AgentMessageRecipientPlan } from './message-recipients.ts';

export async function enqueueMessageRecipients(
    tx: HausDatabase,
    agentDelivery: Pick<AgentDelivery, 'enqueue'>,
    input: {
        chatId: string;
        content: string;
        delivery: TaskDeliveryMode;
        messageId: string;
        recipients: readonly AgentMessageRecipientPlan[];
        sequence: number;
        serverId: string;
        source: string;
    }
) {
    const interrupts: Array<{ agentId: string; serverId: string }> = [];
    for (const recipient of input.recipients) {
        const delivery = recipient.addressedReason === 'task_chat' ? input.delivery : 'steer';
        await agentDelivery.enqueue(tx, {
            addressedReason: recipient.addressedReason,
            agentId: recipient.agentId,
            chatId: input.chatId,
            content: input.content,
            dedupeKey: input.messageId,
            delivery,
            mentioned: recipient.mentioned,
            sequence: input.sequence,
            serverId: input.serverId,
            source: input.source,
            taskFollowReactivated: recipient.taskFollowReactivated,
        });
        if (delivery === 'interrupt') {
            interrupts.push({ agentId: recipient.agentId, serverId: input.serverId });
        }
    }
    return interrupts;
}
