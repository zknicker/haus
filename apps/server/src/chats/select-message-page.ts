import type { ChatMessagesInput } from '@haus/api';
import { and, asc, desc, eq, getTableColumns, gt, lt, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';

export class ChatMessageNotFoundError extends Error {
    constructor() {
        super('That Message does not exist in this Chat or history filter.');
        this.name = 'ChatMessageNotFoundError';
    }
}

const messageRowSelection = {
    ...getTableColumns(chatMessagesTable),
    authorAgentAvatarId: agentsTable.avatarId,
    authorAgentDescription: agentsTable.description,
    authorAgentDisplayName: agentsTable.displayName,
    authorAgentRetiredAt: agentsTable.retiredAt,
    authorUserAvatarId: usersTable.avatarId,
    authorUserDescription: usersTable.description,
    authorUserDisplayName: usersTable.displayName,
    authorUserRevokedAt: serverMembershipsTable.revokedAt,
};

async function selectMessageRows(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    order: ReturnType<typeof asc> | ReturnType<typeof desc>,
    limit: number
) {
    return await db
        .select(messageRowSelection)
        .from(chatMessagesTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(usersTable, eq(usersTable.id, chatMessagesTable.authorUserId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatMessagesTable.serverId),
                eq(serverMembershipsTable.userId, chatMessagesTable.authorUserId)
            )
        )
        .where(and(...predicates))
        .orderBy(order)
        .limit(limit);
}

async function hasMessage(db: HausDatabase, predicates: SQL<unknown>[]) {
    const [message] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(and(...predicates))
        .limit(1);
    return message !== undefined;
}

type SelectedMessageRow = Awaited<ReturnType<typeof selectMessageRows>>[number];

interface MessagePage {
    messages: SelectedMessageRow[];
    nextAfterSequence: number | null;
    nextBeforeSequence: number | null;
}

async function selectAroundMessagePage(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    aroundMessageId: string,
    limit: number
): Promise<MessagePage> {
    const [anchor] = await selectMessageRows(
        db,
        [...predicates, eq(chatMessagesTable.id, aroundMessageId)],
        asc(chatMessagesTable.sequence),
        1
    );
    if (!anchor) {
        throw new ChatMessageNotFoundError();
    }

    const [olderRows, newerRows] = await Promise.all([
        selectMessageRows(
            db,
            [...predicates, lt(chatMessagesTable.sequence, anchor.sequence)],
            desc(chatMessagesTable.sequence),
            limit
        ),
        selectMessageRows(
            db,
            [...predicates, gt(chatMessagesTable.sequence, anchor.sequence)],
            asc(chatMessagesTable.sequence),
            limit
        ),
    ]);
    const olderTarget = Math.floor((limit - 1) / 2);
    const newerTarget = limit - olderTarget - 1;
    let olderCount = Math.min(olderTarget, olderRows.length);
    let newerCount = Math.min(newerTarget, newerRows.length);
    let remaining = limit - olderCount - newerCount - 1;

    if (remaining > 0) {
        const addedOlder = Math.min(remaining, olderRows.length - olderCount);
        olderCount += addedOlder;
        remaining -= addedOlder;
    }
    if (remaining > 0) {
        newerCount += Math.min(remaining, newerRows.length - newerCount);
    }

    const messages = [
        ...olderRows.slice(0, olderCount).reverse(),
        anchor,
        ...newerRows.slice(0, newerCount),
    ];
    return {
        messages,
        nextAfterSequence:
            newerRows.length > newerCount ? (messages.at(-1)?.sequence ?? null) : null,
        nextBeforeSequence: olderRows.length > olderCount ? (messages[0]?.sequence ?? null) : null,
    };
}

async function selectAfterMessagePage(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    afterSequence: number,
    limit: number
): Promise<MessagePage> {
    const rows = await selectMessageRows(
        db,
        [...predicates, gt(chatMessagesTable.sequence, afterSequence)],
        asc(chatMessagesTable.sequence),
        limit + 1
    );
    const messages = rows.slice(0, limit);
    const beforeCursor = messages[0]?.sequence ?? afterSequence + 1;
    const hasOlder = await hasMessage(db, [
        ...predicates,
        lt(chatMessagesTable.sequence, beforeCursor),
    ]);
    return {
        messages,
        nextAfterSequence: rows.length > limit ? (messages.at(-1)?.sequence ?? null) : null,
        nextBeforeSequence: hasOlder ? beforeCursor : null,
    };
}

async function selectBeforeMessagePage(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    beforeSequence: number,
    limit: number
): Promise<MessagePage> {
    const rows = await selectMessageRows(
        db,
        [...predicates, lt(chatMessagesTable.sequence, beforeSequence)],
        desc(chatMessagesTable.sequence),
        limit + 1
    );
    const messages = rows.slice(0, limit).reverse();
    const afterCursor = messages.at(-1)?.sequence ?? beforeSequence - 1;
    const hasNewer = await hasMessage(db, [
        ...predicates,
        gt(chatMessagesTable.sequence, afterCursor),
    ]);
    return {
        messages,
        nextAfterSequence: hasNewer ? afterCursor : null,
        nextBeforeSequence: rows.length > limit ? (messages[0]?.sequence ?? null) : null,
    };
}

async function selectLatestMessagePage(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    limit: number
): Promise<MessagePage> {
    const rows = await selectMessageRows(
        db,
        predicates,
        desc(chatMessagesTable.sequence),
        limit + 1
    );
    const messages = rows.slice(0, limit).reverse();
    return {
        messages,
        nextAfterSequence: null,
        nextBeforeSequence: rows.length > limit ? (messages[0]?.sequence ?? null) : null,
    };
}

export async function selectMessagePage(
    db: HausDatabase,
    predicates: SQL<unknown>[],
    input: ChatMessagesInput
): Promise<MessagePage> {
    if (input.aroundMessageId !== undefined) {
        return await selectAroundMessagePage(db, predicates, input.aroundMessageId, input.limit);
    }
    if (input.afterSequence !== undefined) {
        return await selectAfterMessagePage(db, predicates, input.afterSequence, input.limit);
    }
    if (input.beforeSequence !== undefined) {
        return await selectBeforeMessagePage(db, predicates, input.beforeSequence, input.limit);
    }
    return await selectLatestMessagePage(db, predicates, input.limit);
}
