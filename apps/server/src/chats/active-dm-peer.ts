import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export class RetiredAgentDmSendError extends Error {
    constructor() {
        super(
            'This Agent is retired. You can read this conversation, but you can’t send new messages.'
        );
        this.name = 'RetiredAgentDmSendError';
    }
}

export async function requireActiveDmPeer(
    db: HausDatabase,
    chat: {
        dmAgentId: string | null;
        kind: 'channel' | 'dm' | 'task';
        parentChatId: string | null;
        serverId: string;
    }
) {
    const agentId = chat.kind === 'dm' ? chat.dmAgentId : null;
    if (!agentId) {
        return;
    }

    const [agent] = await db
        .select({ retiredAt: agentsTable.retiredAt })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, chat.serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    if (!agent || agent.retiredAt) {
        throw new RetiredAgentDmSendError();
    }
}
