import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';
import { findDevelopmentComputer } from './seed-computer-attachment.ts';

/** Every record the Inbox seed writes against, resolved once and fully. */
export interface InboxSeedContext {
    allChatId: string;
    blippyDmChatId: string;
    blippyId: string;
    computerId: string;
    productChatId: string;
    serverId: string;
    tinyDmChatId: string;
    tinyId: string;
    userId: string;
}

/**
 * Resolves the demo workspace the Inbox activity hangs off, or null when this
 * Server is not that workspace. Every lookup is required: a missing Agent,
 * Chat, or Computer means the demo Server is not the one this seed describes,
 * and writing half of it would leave records the product's own reads refuse
 * to project. Null rather than a throw, because this runs inside every dev
 * bootstrap: a dev database that predates the seed, or a Server a developer
 * built by hand, must still boot — it simply gets no demo activity.
 */
export async function findInboxSeedContext(
    tx: HausDatabase,
    input: { serverId: string; userId: string }
): Promise<InboxSeedContext | null> {
    const agents = await tx
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), isNull(agentsTable.retiredAt)));
    const chats = await tx
        .select({ dmAgentId: chatsTable.dmAgentId, id: chatsTable.id, name: chatsTable.name })
        .from(chatsTable)
        .where(eq(chatsTable.serverId, input.serverId));
    const computer = await findDevelopmentComputer(tx, input.serverId);
    const agentIdByHandle = new Map(agents.map((agent) => [agent.handle, agent.id]));
    const blippyId = agentIdByHandle.get('blippy');
    const tinyId = agentIdByHandle.get('tiny');
    const chatIdByName = new Map(
        chats.flatMap((chat) => (chat.name ? [[chat.name, chat.id]] : []))
    );
    const chatIdByDmAgentId = new Map(
        chats.flatMap((chat) => (chat.dmAgentId ? [[chat.dmAgentId, chat.id]] : []))
    );

    const allChatId = chatIdByName.get('haus');
    const productChatId = chatIdByName.get('product');
    const blippyDmChatId = blippyId ? chatIdByDmAgentId.get(blippyId) : undefined;
    const tinyDmChatId = tinyId ? chatIdByDmAgentId.get(tinyId) : undefined;

    if (
        !(
            computer &&
            blippyId &&
            tinyId &&
            allChatId &&
            productChatId &&
            blippyDmChatId &&
            tinyDmChatId
        )
    ) {
        return null;
    }

    return {
        allChatId,
        blippyDmChatId,
        blippyId,
        computerId: computer.id,
        productChatId,
        serverId: input.serverId,
        tinyDmChatId,
        tinyId,
        userId: input.userId,
    };
}
