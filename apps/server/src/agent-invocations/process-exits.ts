import {
    type ProcessExitAck,
    type ProcessExitAttention,
    processExitAttentionSchema,
    processExitFrameSchema,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { readComputerFacts } from '../computer-access/computer-facts.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export function processExitKey(processId: string) {
    return `process-exit:${processId}`;
}

export async function ingestProcessExit(
    db: HausDatabase,
    delivery: Pick<AgentDelivery, 'deliver'>,
    input: {
        acknowledge: (ack: ProcessExitAck) => void;
        computerId: string;
        frame: unknown;
        serverId: string;
    }
) {
    const parsed = processExitFrameSchema.safeParse(input.frame);
    if (!parsed.success) {
        return false;
    }
    const { agentId, sessionGeneration: _generation, type: _type, ...exit } = parsed.data;
    const { computerId, serverId } = input;
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    if (agent) {
        const computer = await readComputerFacts(db, { computerId, serverId });
        const attention: ProcessExitAttention = {
            ...exit,
            computerName: computer?.name ?? computerId,
        };
        await delivery.deliver({
            agentId,
            chatId: null,
            content: JSON.stringify(attention),
            dedupeKey: processExitKey(exit.processId),
            mentioned: true,
            serverId,
            source: 'process_exit',
        });
    }
    input.acknowledge({ processId: exit.processId, type: 'process-exit-ack' });
    return true;
}

export function decodeProcessExit(content: string) {
    return processExitAttentionSchema.parse(JSON.parse(content));
}
