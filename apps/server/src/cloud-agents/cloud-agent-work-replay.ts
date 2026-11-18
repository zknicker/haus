import type { AgentCloudAgentReceipt, AgentCloudAgentStartInput } from '@haus/api';
import { agentCloudAgentStartInputSchema, formatCloudAgentWorkLink } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { findAgentMessageByNonce } from '../chats/agent-authored-message.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import { replayCloudAgentWorkLinks } from '../chats/cloud-agent-work-links.ts';
import { resolveInlineReplyParent } from '../chats/reply-context.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable } from '../postgres/schema.ts';
import { findCloudAgentWorkByLaunchMessage } from './cloud-agent-shape.ts';
import { CloudAgentWorkConflictError } from './errors.ts';

/**
 * A replay rebuilds the whole stored content from `--say`, the links the
 * launch recorded, and the trusted suffix, then compares; it never strips
 * link syntax to make a retry match.
 */
export async function readWorkByNonce(
    db: HausDatabase,
    runner: ResolvedRunner,
    place: { chatId: string; target: string },
    input: AgentCloudAgentStartInput
): Promise<AgentCloudAgentReceipt | null> {
    const { chatId } = place;
    const message = await findAgentMessageByNonce(db, {
        chatId,
        nonce: input.nonce,
        serverId: runner.serverId,
    });
    if (!message) {
        return null;
    }
    const work = await findCloudAgentWorkByLaunchMessage(db, runner.serverId, message.id);
    if (!work) {
        throw new CloudAgentWorkConflictError();
    }
    const authored = await authoredContent(db, runner.serverId, input.content, message.content);
    const expected = withLaunchLink(
        await replayCloudAgentWorkLinks(db, {
            content: authored,
            messageId: message.id,
            serverId: runner.serverId,
        }),
        work.title,
        work.id
    );
    const reply = input.replyToMessageId
        ? await resolveInlineReplyParent(db, {
              chatId,
              replyToMessageId: input.replyToMessageId,
              serverId: runner.serverId,
          })
        : null;
    if (
        message.authorAgentId !== runner.agentId ||
        message.content !== expected ||
        message.replyToMessageId !== (reply?.parent.id ?? null) ||
        work.title !== input.title ||
        work.repository !== input.repository ||
        work.startingRef !== input.startingRef ||
        work.provider !== input.provider
    ) {
        throw new CloudAgentWorkConflictError();
    }
    const [firstRun] = await db
        .select({ id: cloudAgentRunsTable.id })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, runner.serverId),
                eq(cloudAgentRunsTable.workId, work.id)
            )
        )
        .orderBy(asc(cloudAgentRunsTable.createdAt))
        .limit(1);
    if (!firstRun) {
        throw new CloudAgentWorkConflictError('That Cloud Agent work has no Run to launch.');
    }
    return {
        state: 'started',
        chatId,
        idempotent: true,
        messageId: message.id,
        runId: firstRun.id,
        sequence: message.sequence,
        target: place.target,
        work,
    };
}

/** `--say` with bare references resolved, within the authored content cap. */
export async function authoredContent(
    db: HausDatabase,
    serverId: string,
    content: string,
    existingContent?: string
): Promise<string> {
    return agentCloudAgentStartInputSchema.shape.content.parse(
        await canonicalizeAgentMessageContentForPersistence(db, {
            content,
            existingContent,
            serverId,
        })
    );
}

export function withLaunchLink(authored: string, title: string, workId: string): string {
    return `${authored}\n\n${formatCloudAgentWorkLink(title, workId)}`;
}
