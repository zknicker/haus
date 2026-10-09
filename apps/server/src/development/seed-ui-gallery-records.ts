import {
    type CloudAgentStatus,
    formatUserReferenceTarget,
    isTerminalCloudAgentStatus,
    type MessageTask,
    type TaskOrigin,
} from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
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
    bodyKind: 'text' | 'cloud-agent-work' = 'text'
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

/**
 * An Agent asking the gallery's human by @mention (ADR 0037). An answered one
 * carries the human's reply in the Thread on it (or in the same Thread when it
 * is already inside one).
 */
export async function galleryMention(
    db: HausDatabase,
    context: GalleryContext,
    input: { content: string; answered: boolean; inThread?: boolean; discussion?: boolean }
) {
    const mention = `[@you](${formatUserReferenceTarget(context.userId)})`;
    const messageId = await galleryMessage(db, context, `${mention} ${input.content}`);
    if (!(input.discussion || input.answered)) {
        return messageId;
    }
    const thread = input.inThread ? context : await galleryThread(db, context, messageId);
    if (input.discussion) {
        await galleryMessage(
            db,
            thread,
            'I recommend the smaller change. This is still waiting for your answer.'
        );
    }
    if (input.answered) {
        const answerMessageId = createOpaqueId('msg');
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
    return messageId;
}

export async function galleryWork(
    db: HausDatabase,
    context: GalleryContext,
    input: {
        title: string;
        status: CloudAgentStatus;
        cancelling?: boolean;
        /** A follow-up Run the Agent sent after the first one settled. */
        followUp?: GalleryFollowUp;
        repository?: string;
        stale?: boolean;
        withBranch?: boolean;
    }
) {
    const messageId = await galleryMessage(db, context, input.title, 'cloud-agent-work');
    const workId = createOpaqueId('caw');
    const terminalAt = isTerminalCloudAgentStatus(input.status) ? context.now : null;
    const observedAt = new Date(context.now.getTime() - (input.stale ? 25 * 60_000 : 0));
    const followUpAt = new Date(context.now.getTime() + 1000);
    await db.insert(cloudAgentWorkTable).values({
        id: workId,
        serverId: context.serverId,
        chatId: context.chatId,
        messageId,
        agentId: context.agentId,
        computerId: context.computerId,
        provider: 'cursor',
        repository: input.repository ?? 'demo/ui-gallery',
        startingRef: 'main',
        title: input.title,
        ...workLifecycle(input, context, { followUpAt, observedAt, terminalAt }),
        cancelRequestedAt: input.cancelling ? context.now : null,
        cancelRequestedByUserId: input.cancelling ? context.userId : null,
    });
    await db.insert(cloudAgentRunsTable).values({
        id: createOpaqueId('car'),
        serverId: context.serverId,
        workId,
        createdAt: new Date(context.now.getTime() - 200_000),
        // A queued sample is still in Haus's local queue; any other one reached Cursor.
        providerRunId: input.status === 'queued' ? null : createOpaqueId('run'),
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
                      pullRequestUrl: 'https://github.com/demo/ui-gallery/pull/182',
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
    if (input.followUp) {
        await galleryFollowUpRun(db, context, { at: followUpAt, followUp: input.followUp, workId });
    }
    return messageId;
}

type GalleryFollowUp = 'running' | 'waiting';

async function galleryFollowUpRun(
    db: HausDatabase,
    context: GalleryContext,
    input: { at: Date; followUp: GalleryFollowUp; workId: string }
) {
    const { at, followUp } = input;
    await db.insert(cloudAgentRunsTable).values({
        id: createOpaqueId('car'),
        serverId: context.serverId,
        workId: input.workId,
        createdAt: at,
        providerRunId: followUp === 'running' ? createOpaqueId('run') : null,
        status: followUpStatus[followUp],
        terminalAt: null,
        observedAt: at,
        startedAt: followUp === 'running' ? at : null,
        summary: null,
        errorCode: null,
    });
}

const followUpStatus = {
    running: 'running',
    waiting: 'queued',
} as const satisfies Record<GalleryFollowUp, CloudAgentStatus>;

/** The work row projects its newest Run, which is the follow-up when there is one. */
function workLifecycle(
    input: { followUp?: GalleryFollowUp; status: CloudAgentStatus },
    context: GalleryContext,
    times: { followUpAt: Date; observedAt: Date; terminalAt: Date | null }
) {
    if (input.followUp) {
        return {
            activityAt: null,
            activitySummary: null,
            startedAt: input.followUp === 'running' ? times.followUpAt : null,
            status: followUpStatus[input.followUp],
            terminalAt: null,
            updatedAt: times.followUpAt,
        };
    }
    return {
        activityAt: times.observedAt,
        activitySummary:
            input.status === 'running'
                ? 'Checking keyboard navigation in the sidebar.'
                : 'Static UI gallery example; no external run exists.',
        startedAt: input.status === 'queued' ? null : new Date(context.now.getTime() - 180_000),
        status: input.status,
        terminalAt: times.terminalAt,
        updatedAt: times.observedAt,
    };
}
