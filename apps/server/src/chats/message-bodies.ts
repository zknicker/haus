import type { MessageBody } from '@haus/api';
import { readCloudAgentWorkForMessages } from '../cloud-agents/cloud-agent-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { readCreatedAgentsForMessages } from '../server-agents/agent-created-shape.ts';

/**
 * Projects every typed Message body for one page of Messages. This is the one
 * place a Server record becomes a `Message.body`, so Chat history, Threads,
 * search, and Task rows all read the same projection.
 */
export async function readMessageBodies(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, MessageBody>> {
    const [cloudAgentWork, createdAgents] = await Promise.all([
        readCloudAgentWorkForMessages(db, serverId, messageIds),
        readCreatedAgentsForMessages(db, serverId, messageIds),
    ]);
    return new Map<string, MessageBody>([
        ...[...cloudAgentWork].map(
            ([messageId, work]) =>
                [messageId, { kind: 'cloud-agent-work', work }] as [string, MessageBody]
        ),
        ...[...createdAgents].map(
            ([messageId, agent]) =>
                [messageId, { agent, kind: 'agent-created' }] as [string, MessageBody]
        ),
    ]);
}
