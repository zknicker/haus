import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { AgentClaimError } from './claim-error.ts';
import { resolveAgentTarget } from './resolve-target.ts';

/**
 * Resolves a claim command's target. `chatId` is the Chat it names; `claimChatId`
 * is the top-level Channel or DM that numbers its claims, so a Thread target and
 * its parent find the same claim numbers.
 */
export async function resolveAgentClaimTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const chatId = await resolveAgentTarget(db, runner, target);
    const [chat] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (chat?.kind === 'thread' && chat.parentChatId) {
        return { chatId, claimChatId: chat.parentChatId };
    }
    return { chatId, claimChatId: chatId };
}

export async function findAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    const rows = await queryAgentClaims(db, runner, chatId, input);
    if (rows.length === 0) {
        throw new AgentClaimError('No matching claim exists in that target.');
    }
    return rows;
}

export async function queryAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    return await db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, runner.serverId),
                eq(messageClaimsTable.chatId, chatId),
                input.messageId ? eq(messageClaimsTable.messageId, input.messageId) : undefined,
                input.numbers?.length
                    ? inArray(messageClaimsTable.number, input.numbers)
                    : undefined
            )
        );
}

/**
 * `haus claim create` posts a new top-level message, so it needs a top-level
 * Channel or DM. Claiming an existing message may also land in a Thread.
 */
export async function requireTopLevelClaimChat(
    db: HausDatabase,
    runner: ResolvedRunner,
    parentChatId: string
) {
    const [parent] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, parentChatId)));
    if (!parent || parent.kind === 'thread') {
        throw new AgentClaimError('Claims require a top-level Channel or DM.');
    }
}
