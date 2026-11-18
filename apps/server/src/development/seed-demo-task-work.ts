import { formatCloudAgentWorkLink } from '@haus/api';
import { and, eq } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    chatMessagesTable,
    chatsTable,
    cloudAgentPullRequestsTable,
    cloudAgentRunsTable,
    cloudAgentWorkLinksTable,
    cloudAgentWorkTable,
    taskPullRequestsTable,
} from '../postgres/schema.ts';
import type { SeededDemoTask } from './seed-demo-tasks.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

const repository = 'zknicker/haus';
const pullRequestNumber = 512;
const title = 'Avatar upload: crop, resize, and save';

export async function seedDemoTaskWork(
    tx: Tx,
    input: { agentId: string; computerId: string; serverId: string; task: SeededDemoTask }
): Promise<void> {
    const { serverId, task } = input;
    const now = new Date();
    const messageId = createOpaqueId('msg');
    const workId = createOpaqueId('caw');
    const sequence = task.messageCount + 1;
    const pullRequestUrl = `https://github.com/${repository}/pull/${pullRequestNumber}`;
    await tx.insert(chatMessagesTable).values({
        authorAgentId: input.agentId,
        chatId: task.chatId,
        content: `A cloud agent built it and opened a draft pull request.\n\n${formatCloudAgentWorkLink(title, workId)}`,
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
    await tx.insert(cloudAgentWorkTable).values({
        activityAt: now,
        activitySummary: 'Opened a draft pull request with the crop step',
        agentId: input.agentId,
        chatId: task.chatId,
        computerId: input.computerId,
        id: workId,
        launchMessageId: messageId,
        provider: 'cursor',
        repository,
        serverId,
        startedAt: now,
        startingRef: 'main',
        status: 'completed',
        taskId: task.id,
        terminalAt: now,
        title,
    });
    await tx.insert(cloudAgentRunsTable).values({
        branches: [{ branch: 'cloud/avatar-upload', pullRequestUrl, repository }],
        id: createOpaqueId('car'),
        observedAt: now,
        serverId,
        startedAt: now,
        status: 'completed',
        summary: 'Added square cropping and a resize step before upload. Checks are still running.',
        terminalAt: now,
        workId,
    });
    await tx.insert(cloudAgentWorkLinksTable).values({
        chatId: task.chatId,
        messageId,
        ordinal: 0,
        serverId,
        workId,
    });
    await tx.insert(cloudAgentPullRequestsTable).values({
        additions: 214,
        changedFiles: 9,
        checks: 'pending',
        deletions: 38,
        number: pullRequestNumber,
        observedAt: now,
        repository,
        review: 'none',
        serverId,
        source: 'computer',
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
