import type { AddressedReason } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { ensureInlineReplyParticipants, mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, agentTaskFollowsTable, chatsTable } from '../postgres/schema.ts';
import { type HearingPlace, hears, listHearingCandidates } from './hearing.ts';
import { readInlineReplyChain } from './inline-reply-recipients.ts';
import { followMentionedIntoTask } from './task-recipients.ts';

export interface AgentMessageRecipientPlan {
    /**
     * Why this delivery names the Agent personally: a DM, an @mention, a
     * committed Jev routing, or the sole Agent of a one-human channel. Null is an
     * ordinary ambient delivery.
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
            dmAgentId: chatsTable.dmAgentId,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat) {
        return [];
    }
    if (chat.kind === 'dm') {
        if (input.messageId) {
            await ensureInlineReplyParticipants(db, { ...input, messageId: input.messageId });
        }
        return chat.dmAgentId && chat.dmAgentId !== input.authorAgentId
            ? await activeDmRecipient(db, input.serverId, chat.dmAgentId)
            : [];
    }
    const projectId = chat.kind === 'task' ? chat.parentChatId : input.chatId;
    if (!projectId) {
        return [];
    }
    // Sequential, not Promise.all: `db` is often the caller's transaction, and
    // overlapping reads on that one connection deadlocked the send against the
    // Server row lock the same transaction already held.
    const candidates = (await listHearingCandidates(db, input.serverId)).filter(
        (agent) => agent.id !== input.authorAgentId
    );
    const mentioned = mentionedAgentIds(input.content, candidates);
    const heard =
        chat.kind === 'task'
            ? await readTaskFollows(db, input, candidates, mentioned)
            : await readChannelPlace(db, input);
    return candidates.flatMap((agent) => {
        const hearer = {
            follows: heard.follows.get(agent.id) === true,
            home: agent.homeProjectId === projectId,
            mentioned: mentioned.has(agent.id),
        };
        if (!hears(heard.place, hearer, heard.participated)) {
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
}

interface HeardPlace {
    follows: Map<string, boolean>;
    participated: boolean;
    place: HearingPlace;
    reactivated: Set<string>;
}

async function readChannelPlace(db: HausDatabase, input: PlanInput): Promise<HeardPlace> {
    const chain = input.messageId
        ? await readInlineReplyChain(db, { ...input, messageId: input.messageId })
        : null;
    return {
        follows: chain?.follows ?? new Map(),
        participated: chain?.participated ?? false,
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
    return { follows, participated: false, place: 'task', reactivated };
}

/**
 * A retired Agent keeps its durable DM history but can never receive new work,
 * so a DM resolves a recipient only while the Agent is active.
 */
async function activeDmRecipient(
    db: HausDatabase,
    serverId: string,
    agentId: string
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
        ? [{ addressedReason: 'dm', agentId, mentioned: false, taskFollowReactivated: false }]
        : [];
}
