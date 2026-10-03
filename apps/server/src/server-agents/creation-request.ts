import { createHash } from 'node:crypto';
import type { AgentCreateAgentInput, AgentCreateAgentReceipt } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../agent-api/chat-freshness.ts';
import { resolveAgentTarget } from '../agent-api/resolve-target.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import { readAgentChannels, requireCreationChannels } from './creation-channels.ts';
import { AgentCreateConflictError } from './errors.ts';

export function agentCreationRequestHash(input: AgentCreateAgentInput): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                input.target,
                input.displayName,
                input.description,
                input.avatarConcept,
                input.brief,
                [...new Set(input.channels)].sort(),
            ])
        )
        .digest('hex');
}

export async function resolveCreationContext(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const chatId = await resolveAgentTarget(db, runner, target);
    await requireChatWritable(db, { chatId, serverId: runner.serverId });
    const [chat] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new Error('The creation context Chat no longer exists.');
    }
    return { chatId, chat };
}

/** Retry identity belongs to the created Agent, independently of any announcement. */
export async function readAgentCreationReplay(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: AgentCreateAgentInput
): Promise<AgentCreateAgentReceipt | null> {
    const [row] = await db
        .select()
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.createdByAgentId, runner.agentId),
                eq(agentsTable.creationNonce, input.nonce)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    if (row.creationRequestHash !== agentCreationRequestHash(input)) {
        throw new AgentCreateConflictError();
    }
    const agent = await readCreatedAgent(db, runner.serverId, row.id);
    if (!(agent && row.computerId && row.desiredModelId && row.desiredRuntimeId)) {
        throw new Error('The created Agent has no execution configuration.');
    }
    return {
        agent,
        avatar: { status: 'none' },
        channels: (await readAgentChannels(db, runner.serverId, row.id)).map(
            (channel) => `#${channel.name}`
        ),
        chatId,
        computerId: row.computerId,
        idempotent: true,
        modelId: row.desiredModelId,
        reasoningEffort: row.desiredReasoningEffort,
        runtimeId: row.desiredRuntimeId,
        target: input.target,
    };
}

/** Reject invalid requests before spending an avatar generation. Recheck under the lock. */
export async function precheckAgentCreation(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCreateAgentInput
): Promise<{ replayed: boolean }> {
    const { chatId } = await resolveCreationContext(db, runner, input.target);
    if (await readAgentCreationReplay(db, runner, chatId, input)) {
        return { replayed: true };
    }
    await assertFreshAgentView(db, runner, chatId);
    await requireCreationChannels(db, runner.serverId, input.channels);
    return { replayed: false };
}
