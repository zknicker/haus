import {
    type IssueActor,
    type IssueCommentInput,
    type IssueEditCommentInput,
    issueCommentSchema,
    sameIssueActor,
} from '@haus/api';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { issueCommentsTable } from '../postgres/schema.ts';
import { issueCommentedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { actorColumns, requireIssueActor, requiredActorFromColumns } from './issue-actor.ts';
import { IssueInvariantError, IssueNotFoundError } from './issue-errors.ts';
import { subscribeToIssue } from './issue-fields.ts';
import { readIssue } from './issue-read.ts';
import { deriveIssueComment } from './issue-wakes.ts';

type Reader = Pick<HausDatabase, 'select'>;
type CommentRow = typeof issueCommentsTable.$inferSelect;

export async function addIssueComment(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueCommentInput
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const issue = await readIssue(tx, serverId, input.issueId);
        const reply = input.replyToCommentId
            ? await readComment(tx, serverId, input.replyToCommentId)
            : null;
        if (reply && reply.issueId !== issue.id) {
            throw new IssueInvariantError('A reply answers a comment on the same Issue.');
        }
        const author = actorColumns(actor);
        const id = createOpaqueId('icm');
        await tx.insert(issueCommentsTable).values({
            authorAgentId: author.agentId,
            authorTaskId: author.taskId,
            authorUserId: author.userId,
            body: input.body,
            id,
            issueId: issue.id,
            parentCommentId: reply ? (reply.parentCommentId ?? reply.id) : null,
            replyToCommentId: reply?.id ?? null,
            serverId,
        });
        if (author.userId) {
            await subscribeToIssue(tx, { issueId: issue.id, serverId, userId: author.userId });
        }
        return {
            comment: await readComment(tx, serverId, id),
            events: [issueCommentedTopic.prepare({ commentId: id, issueId: issue.id, serverId })],
            issue,
            wakes: deriveIssueComment({ actor, commentId: id, issue }),
        };
    });
}

export async function editIssueComment(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueEditCommentInput
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const current = await readComment(tx, serverId, input.commentId);
        if (!sameIssueActor(current.author, actor)) {
            throw new IssueInvariantError('Only its author edits a comment.');
        }
        await tx
            .update(issueCommentsTable)
            .set({ body: input.body, editedAt: sql`now()` })
            .where(
                and(
                    eq(issueCommentsTable.serverId, serverId),
                    eq(issueCommentsTable.id, current.id)
                )
            );
        return {
            comment: await readComment(tx, serverId, current.id),
            events: [
                issueCommentedTopic.prepare({
                    commentId: current.id,
                    issueId: current.issueId,
                    serverId,
                }),
            ],
        };
    });
}

export async function listIssueComments(db: Reader, serverId: string, issueId: string) {
    const rows = await db
        .select()
        .from(issueCommentsTable)
        .where(
            and(eq(issueCommentsTable.serverId, serverId), eq(issueCommentsTable.issueId, issueId))
        )
        .orderBy(asc(issueCommentsTable.createdAt), asc(issueCommentsTable.id));
    return rows.map(toComment);
}

async function readComment(db: Reader, serverId: string, commentId: string) {
    const [row] = await db
        .select()
        .from(issueCommentsTable)
        .where(and(eq(issueCommentsTable.serverId, serverId), eq(issueCommentsTable.id, commentId)))
        .limit(1);
    if (!row) {
        throw new IssueNotFoundError('No comment exists with that id on this Server.');
    }
    return toComment(row);
}

function toComment(row: CommentRow) {
    return issueCommentSchema.parse({
        author: requiredActorFromColumns({
            agentId: row.authorAgentId,
            taskId: row.authorTaskId,
            userId: row.authorUserId,
        }),
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        editedAt: row.editedAt?.toISOString() ?? null,
        id: row.id,
        issueId: row.issueId,
        parentCommentId: row.parentCommentId,
        replyToCommentId: row.replyToCommentId,
    });
}
