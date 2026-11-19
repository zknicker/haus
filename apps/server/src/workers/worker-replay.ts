import type { AgentWorkerReceipt, AgentWorkerStartInput } from '@haus/api';
import { agentWorkerStartInputSchema, formatWorkerLink } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { findAgentMessageByNonce } from '../chats/agent-authored-message.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import { resolveInlineReplyParent } from '../chats/reply-context.ts';
import { replayWorkerLinks } from '../chats/worker-links.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnsTable } from '../postgres/schema.ts';
import { WorkerConflictError } from './errors.ts';
import { findWorkerByLaunchMessage } from './worker-shape.ts';

export async function readWorkByNonce(
    db: HausDatabase,
    runner: ResolvedRunner,
    place: { chatId: string; target: string },
    input: AgentWorkerStartInput
): Promise<AgentWorkerReceipt | null> {
    const { chatId } = place;
    const message = await findAgentMessageByNonce(db, {
        chatId,
        nonce: input.nonce,
        serverId: runner.serverId,
    });
    if (!message) {
        return null;
    }
    const work = await findWorkerByLaunchMessage(db, runner.serverId, message.id);
    if (!work) {
        throw new WorkerConflictError();
    }
    const authored = await authoredContent(db, runner.serverId, input.content, message.content);
    const expected = withLaunchLink(
        await replayWorkerLinks(db, {
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
        throw new WorkerConflictError();
    }
    const [firstRun] = await db
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, runner.serverId),
                eq(workerTurnsTable.workId, work.id)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt))
        .limit(1);
    if (!firstRun) {
        throw new WorkerConflictError('That Worker has no Run to launch.');
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

export async function authoredContent(
    db: HausDatabase,
    serverId: string,
    content: string,
    existingContent?: string
): Promise<string> {
    return agentWorkerStartInputSchema.shape.content.parse(
        await canonicalizeAgentMessageContentForPersistence(db, {
            content,
            existingContent,
            serverId,
        })
    );
}

export function withLaunchLink(authored: string, title: string, workId: string): string {
    return `${authored}\n\n${formatWorkerLink(title, workId)}`;
}
