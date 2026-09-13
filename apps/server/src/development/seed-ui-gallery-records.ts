import {
    type CloudAgentStatus,
    isTerminalCloudAgentStatus,
    type MessageTask,
    type TaskOrigin,
} from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    asksTable,
    chatsTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
    messageTasksTable,
} from '../postgres/schema.ts';
import { ensureThreadRecord } from '../threads/ensure-thread.ts';
import { appendSeedMessages } from './seed-inbox-messages.ts';

export interface GalleryContext {
    agentId: string;
    chatId: string;
    computerId: string;
    now: Date;
    serverId: string;
    userId: string;
}

export async function galleryMessage(
    db: HausDatabase,
    context: GalleryContext,
    content: string,
    bodyKind: 'text' | 'ask' | 'cloud-agent-work' = 'text'
) {
    const id = createOpaqueId('msg');
    await appendSeedMessages(db, {
        serverId: context.serverId,
        chatId: context.chatId,
        messages: [
            {
                id,
                nonce: `dev-ui-${id}`,
                authorAgentId: context.agentId,
                content,
                bodyKind,
                createdAt: context.now,
            },
        ],
    });
    return id;
}

export async function galleryThread(db: HausDatabase, context: GalleryContext, messageId: string) {
    const thread = await ensureThreadRecord(db, {
        serverId: context.serverId,
        parentChatId: context.chatId,
        anchorMessageId: messageId,
    });
    return { ...context, chatId: thread.id };
}

export async function galleryTask(
    db: HausDatabase,
    context: GalleryContext,
    messageId: string,
    origin: TaskOrigin,
    status: MessageTask['status']
) {
    const [chat] = await db
        .update(chatsTable)
        .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
        .where(eq(chatsTable.id, context.chatId))
        .returning({ number: chatsTable.lastTaskNumber });
    if (!chat) {
        throw new Error('UI gallery channel is missing');
    }
    await db.insert(messageTasksTable).values({
        serverId: context.serverId,
        chatId: context.chatId,
        messageId,
        number: chat.number,
        origin,
        status,
        assigneeAgentId: context.agentId,
        createdByAgentId: context.agentId,
        claimedAt: origin === 'claimed' ? context.now : null,
        trackedAt:
            origin === 'claimed' && (status === 'in_progress' || status === 'done')
                ? null
                : context.now,
    });
}

export async function galleryAsk(
    db: HausDatabase,
    context: GalleryContext,
    input: {
        content: string;
        answered: boolean;
        inThread?: boolean;
        options?: string[];
        discussion?: boolean;
    }
) {
    const messageId = await galleryMessage(db, context, input.content, 'ask');
    const thread = input.inThread ? context : await galleryThread(db, context, messageId);
    if (input.discussion) {
        await galleryMessage(
            db,
            thread,
            'I recommend the smaller change. This is still waiting for your answer.'
        );
    }
    let answerMessageId: string | null = null;
    if (input.answered) {
        answerMessageId = createOpaqueId('msg');
        await appendSeedMessages(db, {
            serverId: context.serverId,
            chatId: thread.chatId,
            messages: [
                {
                    id: answerMessageId,
                    nonce: `dev-ui-${answerMessageId}`,
                    authorUserId: context.userId,
                    content: 'Yes, that works. Go ahead.',
                    createdAt: context.now,
                },
            ],
        });
    }
    await db.insert(asksTable).values({
        id: createOpaqueId('ask'),
        serverId: context.serverId,
        chatId: context.chatId,
        messageId,
        agentId: context.agentId,
        addresseeUserId: context.userId,
        title: input.content,
        summary: 'UI gallery sample decision. Replies here are real messages.',
        options: input.options ?? ['Yes, go ahead', 'Keep it as it is'],
        status: input.answered ? 'answered' : 'open',
        answerMessageId,
        answeredAt: input.answered ? context.now : null,
        answeredByUserId: input.answered ? context.userId : null,
    });
    return messageId;
}

export async function galleryWork(
    db: HausDatabase,
    context: GalleryContext,
    input: {
        title: string;
        status: CloudAgentStatus;
        cancelling?: boolean;
        stale?: boolean;
        withBranch?: boolean;
    }
) {
    const messageId = await galleryMessage(db, context, input.title, 'cloud-agent-work');
    const workId = createOpaqueId('caw');
    const terminalAt = isTerminalCloudAgentStatus(input.status) ? context.now : null;
    const observedAt = new Date(context.now.getTime() - (input.stale ? 25 * 60_000 : 0));
    await db.insert(cloudAgentWorkTable).values({
        id: workId,
        serverId: context.serverId,
        chatId: context.chatId,
        messageId,
        agentId: context.agentId,
        computerId: context.computerId,
        provider: 'cursor',
        repository: 'demo/ui-gallery',
        startingRef: 'main',
        title: input.title,
        status: input.status,
        terminalAt,
        startedAt: input.status === 'queued' ? null : new Date(context.now.getTime() - 180_000),
        updatedAt: observedAt,
        activityAt: observedAt,
        activitySummary:
            input.status === 'running'
                ? 'Checking keyboard navigation in the sidebar.'
                : 'Static UI gallery example; no external run exists.',
        cancelRequestedAt: input.cancelling ? context.now : null,
        cancelRequestedByUserId: input.cancelling ? context.userId : null,
    });
    await db.insert(cloudAgentRunsTable).values({
        id: createOpaqueId('car'),
        serverId: context.serverId,
        workId,
        status: input.status,
        terminalAt,
        observedAt,
        startedAt: input.status === 'queued' ? null : new Date(context.now.getTime() - 180_000),
        summary:
            input.status === 'failed'
                ? 'The sample build failed. Check the branch before retrying.'
                : null,
        errorCode: input.status === 'failed' ? 'sample_build_failed' : null,
        branches: input.withBranch
            ? [
                  {
                      repository: 'demo/ui-gallery',
                      branch: 'demo/keyboard-navigation',
                      pullRequestUrl: null,
                      pullRequest: {
                          number: 182,
                          state: 'open',
                          additions: 48,
                          deletions: 19,
                          changedFiles: 3,
                          observedAt: context.now.toISOString(),
                      },
                  },
              ]
            : [],
    });
    return messageId;
}
