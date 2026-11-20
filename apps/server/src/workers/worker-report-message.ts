import type { WorkerReport } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { followAgentTask } from '../agent-api/attention.ts';
import type { InboxWork } from '../agent-delivery/inbox-work.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from '../chats/message-created-event.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { followTaskMentions } from '../tasks/task-follows.ts';
import type { WorkerPerson } from './worker-person.ts';

export function workerReportContent(report: WorkerReport, person: WorkerPerson | null) {
    const mention = person ? `[@${person.handle}](user://${person.id})` : null;
    const ask = report.outcome === 'needs-you' && report.ask !== report.text ? report.ask : null;
    const askLine = [ask, mention].filter(Boolean).join(' ');
    const pullRequests = report.pullRequestUrls.filter((url) => !report.text.includes(url));
    return [report.text, askLine, pullRequests.join('\n')].filter(Boolean).join('\n\n');
}

export async function postWorkerReportMessage(
    tx: HausDatabase,
    agentDelivery: InboxWork,
    input: {
        agentId: string;
        chatId: string;
        content: string;
        messageId: string;
        serverId: string;
        turnId: string;
    }
) {
    const { agentId, chatId, content, messageId, serverId } = input;
    const [agent] = await tx
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    if (!agent) {
        throw new Error(`Agent ${agentId} is missing, so its Worker report cannot post.`);
    }
    const [numbered] = await tx
        .update(chatsTable)
        .set({
            lastActivityAt: sql`now()`,
            lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
        })
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    if (!numbered) {
        throw new Error(`Task Chat ${chatId} is missing, so a Worker report cannot post.`);
    }
    const [message] = await tx
        .insert(chatMessagesTable)
        .values({
            authorAgentId: agentId,
            bodyKind: 'worker-report',
            chatId,
            content,
            id: messageId,
            mentionedUserIds: mentionedUserIds(content),
            nonce: `worker-report:${input.turnId}`,
            replyRootMessageId: messageId,
            sequence: numbered.sequence,
            serverId,
        })
        .returning();
    await followAgentTask(tx, { agentId, serverId, taskChatId: chatId });
    await followTaskMentions(tx, {
        chatId,
        mentionedUserIds: message.mentionedUserIds,
        serverId,
    });
    const recipients = await planAgentMessageRecipients(tx, {
        authorAgentId: agentId,
        chatId,
        content,
        messageId,
        serverId,
    });
    for (const recipient of recipients) {
        await agentDelivery.enqueue(tx, {
            addressedReason: recipient.addressedReason,
            agentId: recipient.agentId,
            chatId,
            content,
            dedupeKey: messageId,
            mentioned: recipient.mentioned,
            sequence: message.sequence,
            serverId,
            source: `agent:${agent.handle}`,
            taskFollowReactivated: recipient.taskFollowReactivated,
        });
    }
    return {
        event: await prepareMessageCreatedEvent(tx, message, null),
        wakes: recipients.map((recipient) => ({ agentId: recipient.agentId, serverId })),
    };
}
