import { AGENT_TASK_CREATE_MAX_TITLES } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AgentMessageRecipientPlan } from '../agent-delivery/message-recipients.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
} from '../postgres/schema.ts';
import { messageSelection } from './message-view.ts';
import { AgentTaskError, AgentTaskNonceReusedError } from './task-error.ts';
import { queryAgentTasks } from './task-lookup.ts';
import { stripAt, taskRow } from './task-row.ts';

export async function resolveTaskAssignee(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    value: string
) {
    const handle = stripAt(value);
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.handle, handle),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentTaskError(`No active Agent has handle @${handle}.`);
    }
    if (agent.id === runner.agentId) {
        return agent.id;
    }
    const [joined] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, chatId),
                eq(channelAgentParticipantsTable.agentId, agent.id)
            )
        )
        .limit(1);
    if (!joined) {
        throw new AgentTaskError('The assigned Agent must belong to the target Channel.');
    }
    return agent.id;
}

/**
 * Replays a batch already created under this nonce, or returns null when the
 * nonce is fresh. Every index a batch could have used is looked up, so a retry
 * naming fewer or more titles than the original is a reuse, not a partial replay.
 */
export async function replayAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    titles: string[],
    nonce: string,
    assigneeAgentId: string | null
) {
    const existing = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                inArray(
                    chatMessagesTable.nonce,
                    Array.from({ length: AGENT_TASK_CREATE_MAX_TITLES }, (_, index) =>
                        taskNonce(nonce, index)
                    )
                )
            )
        );
    if (existing.length === 0) {
        return null;
    }
    if (existing.length !== titles.length) {
        throw new AgentTaskNonceReusedError();
    }
    const byNonce = new Map(existing.map((message) => [message.nonce, message]));
    return await Promise.all(
        titles.map(async (title, index) => {
            const message = byNonce.get(taskNonce(nonce, index));
            if (message?.authorAgentId !== runner.agentId || message.content !== title.trim()) {
                throw new AgentTaskNonceReusedError();
            }
            const [task] = await queryAgentTasks(db, runner, chatId, { messageId: message.id });
            if (!task) {
                throw new AgentTaskError('That task creation nonce has no canonical task.');
            }
            if (task.assigneeAgentId !== assigneeAgentId) {
                throw new AgentTaskNonceReusedError();
            }
            return await taskRow(db, runner, message, task);
        })
    );
}

/** The message nonce for one title of a batch. */
export function taskNonce(nonce: string, index: number) {
    return `${nonce}:${index}`;
}

export function dedupeRecipients(recipients: AgentMessageRecipientPlan[]) {
    const byAgent = new Map<string, AgentMessageRecipientPlan>();
    for (const recipient of recipients) {
        const current = byAgent.get(recipient.agentId);
        byAgent.set(recipient.agentId, {
            addressedReason: recipient.addressedReason ?? current?.addressedReason ?? null,
            agentId: recipient.agentId,
            mentioned: Boolean(current?.mentioned || recipient.mentioned),
            threadFollowReactivated: Boolean(
                current?.threadFollowReactivated || recipient.threadFollowReactivated
            ),
        });
    }
    return [...byAgent.values()];
}
