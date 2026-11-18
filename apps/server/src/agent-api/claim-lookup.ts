import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { AgentClaimError } from './claim-error.ts';
import { resolveAgentTarget } from './resolve-target.ts';

export async function resolveAgentClaimTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    return await resolveAgentTarget(db, runner, target);
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

export async function requireClaimChat(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
    const [chat] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)));
    if (!chat) {
        throw new AgentClaimError('Claims require a Channel, DM, or Task.');
    }
}
