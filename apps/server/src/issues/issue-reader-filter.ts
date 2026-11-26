import type { IssueActor, IssueListInput } from '@haus/api';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    issueCommentsTable,
    issueSubscriptionsTable,
    issuesTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function issueReaderFilter(
    db: Reader,
    actor: IssueActor,
    input: Pick<IssueListInput, 'reader' | 'serverId'>
) {
    if (!input.reader) {
        return;
    }
    if (actor.kind !== 'user') {
        return sql`false`;
    }
    if (input.reader === 'subscribed') {
        return inArray(
            issuesTable.id,
            db
                .select({ issueId: issueSubscriptionsTable.issueId })
                .from(issueSubscriptionsTable)
                .where(
                    and(
                        eq(issueSubscriptionsTable.serverId, input.serverId),
                        eq(issueSubscriptionsTable.userId, actor.userId)
                    )
                )
        );
    }
    const handle = await readHandle(db, input.serverId, actor.userId);
    if (!handle) {
        return sql`false`;
    }
    const pattern = `(^|[^a-z0-9_-])@${handle}([^a-z0-9_-]|$)`;
    return or(
        sql`${issuesTable.description} ~* ${pattern}`,
        inArray(
            issuesTable.id,
            db
                .select({ issueId: issueCommentsTable.issueId })
                .from(issueCommentsTable)
                .where(
                    and(
                        eq(issueCommentsTable.serverId, input.serverId),
                        sql`${issueCommentsTable.body} ~* ${pattern}`
                    )
                )
        )
    );
}

async function readHandle(db: Reader, serverId: string, userId: string) {
    const [membership] = await db
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    return membership?.handle ?? null;
}
