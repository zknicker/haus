import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    chatMessagesTable,
    chatsTable,
    pullRequestReadingsTable,
    taskPullRequestsTable,
} from '../postgres/schema.ts';
import type { SeededDemoTask } from './seed-demo-tasks.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

const repository = 'zknicker/haus';
const pullRequestNumber = 512;
const title = 'Avatar upload: crop, resize, and save';

export async function seedDemoTaskWork(
    tx: Tx,
    input: { agentId: string; serverId: string; task: SeededDemoTask }
): Promise<void> {
    const { serverId, task } = input;
    const now = new Date();
    const messageId = createOpaqueId('msg');
    const sequence = task.messageCount + 1;
    const pullRequestUrl = `https://github.com/${repository}/pull/${pullRequestNumber}`;
    await tx.insert(chatMessagesTable).values({
        authorAgentId: input.agentId,
        chatId: task.chatId,
        content: `I built it and opened a draft pull request: ${pullRequestUrl}`,
        id: messageId,
        nonce: `dev-${task.chatId}-${sequence}`,
        replyRootMessageId: messageId,
        sequence,
        serverId,
    });
    await tx
        .update(chatsTable)
        .set({ lastActivityAt: now, lastMessageSequence: sequence })
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, task.chatId)));
    await tx.insert(pullRequestReadingsTable).values({
        additions: 214,
        changedFiles: 9,
        checks: 'pending',
        deletions: 38,
        number: pullRequestNumber,
        observedAt: now,
        repository,
        review: 'none',
        serverId,
        source: 'github',
        state: 'draft',
        title,
        url: pullRequestUrl,
    });
    await tx.insert(taskPullRequestsTable).values({
        number: pullRequestNumber,
        repository,
        serverId,
        taskId: task.id,
    });
}
