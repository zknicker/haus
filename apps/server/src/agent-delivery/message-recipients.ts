import type { AddressedReason } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, agentTaskFollowsTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import {
    type HearingPlace,
    hearersOf,
    hears,
    listHearingCandidates,
    readHearingPlace,
} from './hearing.ts';
import { readInlineReplyChain } from './inline-reply-recipients.ts';
import { followMentionedIntoTask } from './task-recipients.ts';

export interface AgentMessageRecipientPlan {
    /**
     * Why this delivery names the Agent personally: its own Captain or Task chat, an @mention, a
     * committed Jev routing, or the sole Agent of a one-human channel. Null is an ordinary
     * ambient delivery.
     */
    addressedReason: AddressedReason | null;
    agentId: string;
    mentioned: boolean;
    taskFollowReactivated: boolean;
}

interface PlanInput {
    authorAgentId: string | null;
    chatId: string;
    content: string;
    messageId?: string;
    serverId: string;
}

export async function planAgentMessageRecipients(
    db: HausDatabase,
    input: PlanInput
): Promise<AgentMessageRecipientPlan[]> {
    const [chat] = await db
        .select({
            captainAgentId: chatsTable.captainAgentId,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat || chat.kind === 'dm') {
        return [];
    }
    if (chat.kind === 'captain') {
        // A Captain chat reaches its own Captain and no other agent, even one @mentioned there.
        return chat.captainAgentId && chat.captainAgentId !== input.authorAgentId
            ? await activeAddressedRecipient(
                  db,
                  input.serverId,
                  chat.captainAgentId,
                  'captain_chat'
              )
            : [];
    }
    const projectId = chat.kind === 'task' ? chat.parentChatId : input.chatId;
    if (!projectId) {
        return [];
    }
    // Sequential, not Promise.all: `db` is often the caller's transaction, and
    // overlapping reads on that one connection deadlocked the send against the
    // Server row lock the same transaction already held.
    const everyone = await listHearingCandidates(db, input.serverId);
    const place = await readHearingPlace(db, { projectId, serverId: input.serverId });
    const hearerIds = new Set(hearersOf(everyone, place).map((agent) => agent.id));
    const candidates = everyone.filter((agent) => agent.id !== input.authorAgentId);
    const mentioned = mentionedAgentIds(input.content, candidates);
    const heard =
        chat.kind === 'task'
            ? await readTaskFollows(db, input, candidates, mentioned)
            : await readChannelPlace(db, input);
    const taskAgent = chat.kind === 'task' ? await readTaskAgentRecipient(db, input) : [];
    const heardAgents = candidates.flatMap((agent) => {
        const hearer = {
            ambient: hearerIds.has(agent.id),
            follows: heard.follows.get(agent.id) === true,
            mentioned: mentioned.has(agent.id),
        };
        if (!hears(heard.place, hearer)) {
            return [];
        }
        return [
            {
                addressedReason: hearer.mentioned ? ('mention' as const) : null,
                agentId: agent.id,
                mentioned: hearer.mentioned,
                taskFollowReactivated: heard.reactivated.has(agent.id),
            },
        ];
    });
    return [...taskAgent, ...heardAgents];
}

/** Every message in a Task's chat reaches its own Task agent, addressed (ADR 0062). */
async function readTaskAgentRecipient(db: HausDatabase, input: PlanInput) {
    const [task] = await db
        .select({ agentId: tasksTable.agentId })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.chatId, input.chatId),
                isNull(tasksTable.archivedAt)
            )
        )
        .limit(1);
    return task?.agentId && task.agentId !== input.authorAgentId
        ? await activeAddressedRecipient(db, input.serverId, task.agentId, 'task_chat')
        : [];
}

interface HeardPlace {
    follows: Map<string, boolean>;
    place: HearingPlace;
    reactivated: Set<string>;
}

async function readChannelPlace(db: HausDatabase, input: PlanInput): Promise<HeardPlace> {
    const chain = input.messageId
        ? await readInlineReplyChain(db, { ...input, messageId: input.messageId })
        : null;
    return {
        follows: chain ?? new Map(),
        place: chain ? 'reply' : 'channel',
        reactivated: new Set(),
    };
}

async function readTaskFollows(
    db: HausDatabase,
    input: PlanInput,
    candidates: { id: string }[],
    mentioned: Set<string>
): Promise<HeardPlace> {
    const rows = await db
        .select({
            agentId: agentTaskFollowsTable.agentId,
            followed: agentTaskFollowsTable.followed,
        })
        .from(agentTaskFollowsTable)
        .where(
            and(
                eq(agentTaskFollowsTable.serverId, input.serverId),
                eq(agentTaskFollowsTable.taskChatId, input.chatId)
            )
        );
    const follows = new Map(rows.map((row) => [row.agentId, row.followed]));
    const reactivated = await followMentionedIntoTask(db, {
        agentIds: candidates.map((agent) => agent.id),
        causeMessageId: input.messageId ?? null,
        followByAgent: follows,
        mentioned,
        serverId: input.serverId,
        taskChatId: input.chatId,
    });
    return { follows, place: 'task', reactivated };
}

/**
 * A retired agent keeps its chat as history but never receives new work, so its own chat
 * resolves a recipient only while the agent is active.
 */
async function activeAddressedRecipient(
    db: HausDatabase,
    serverId: string,
    agentId: string,
    addressedReason: 'captain_chat' | 'task_chat'
): Promise<AgentMessageRecipientPlan[]> {
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return agent
        ? [{ addressedReason, agentId, mentioned: false, taskFollowReactivated: false }]
        : [];
}
