import { type DriveConflictAttention, driveConflictAttentionSchema } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';

export function driveConflictKey(pushId: string) {
    return `drive-conflict:${pushId}`;
}

export function driveUnsentKey(pushId: string) {
    return `${driveConflictKey(pushId)}:unsent`;
}

export async function queueDriveConflict(
    tx: HausDatabase,
    agentDelivery: Pick<AgentDelivery, 'enqueue'>,
    input: { attention: DriveConflictAttention; recipientAgentId: string; serverId: string }
) {
    const { attention, recipientAgentId, serverId } = input;
    if (recipientAgentId !== attention.writer.agentId) {
        throw new Error(`Drive conflict ${attention.id} belongs to the writer's own Agent.`);
    }
    if (
        attention.id !== driveConflictKey(attention.pushId) &&
        attention.id !== driveUnsentKey(attention.pushId)
    ) {
        throw new Error(`Drive conflict ${attention.id} does not name push ${attention.pushId}.`);
    }
    await agentDelivery.enqueue(tx, {
        agentId: recipientAgentId,
        chatId: null,
        content: JSON.stringify(attention),
        dedupeKey: attention.id,
        mentioned: true,
        serverId,
        source: 'drive_conflict',
    });
    return { agentId: recipientAgentId, serverId };
}

export function decodeDriveConflict(content: string) {
    return driveConflictAttentionSchema.parse(JSON.parse(content));
}
