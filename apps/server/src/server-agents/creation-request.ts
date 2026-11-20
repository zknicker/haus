import { createHash } from 'node:crypto';
import type { AgentCreateAgentReceipt, AgentCreateAgentRequest } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../agent-api/chat-freshness.ts';
import { AgentTargetError, resolveAgentTarget } from '../agent-api/resolve-target.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';
import { findLiveProjectByKey, isLiveProject, readAgentHomeKey } from '../projects/agent-home.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import { requireAgentCreationGuidance } from './creation-guidance.ts';
import { AgentCreateConflictError } from './errors.ts';

export function agentCreationRequestHash(input: AgentCreateAgentRequest): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                input.target,
                input.displayName,
                input.description,
                input.avatarConcept,
                input.brief,
                // The slot channel lists held, so a request without a Project keeps its hash.
                input.project === null ? [] : [input.project],
                // Appended only when set, so requests stored before the field keep their hash.
                ...(input.signatureEmoji === null ? [] : [input.signatureEmoji]),
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
    input: AgentCreateAgentRequest
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
        chatId,
        computerId: row.computerId,
        idempotent: true,
        modelId: row.desiredModelId,
        project: await readAgentHomeKey(db, { agentId: row.id, serverId: runner.serverId }),
        reasoningEffort: row.desiredReasoningEffort,
        runtimeId: row.desiredRuntimeId,
        target: input.target,
    };
}

/** Reject invalid requests before spending an avatar generation. Recheck under the lock. */
export async function precheckAgentCreation(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCreateAgentRequest
): Promise<{ replayed: boolean }> {
    const { chatId } = await resolveCreationContext(db, runner, input.target);
    if (await readAgentCreationReplay(db, runner, chatId, input)) {
        return { replayed: true };
    }
    await assertFreshAgentView(db, runner, chatId);
    await requireAgentCreationGuidance(db, runner, input.brief);
    await requireCreationHome(db, runner, input.project);
    return { replayed: false };
}

/** The live Project `--project` names, or else the creating Agent's own home. */
export async function requireCreationHome(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner,
    key: string | null
) {
    if (key === null) {
        const home = await findCreatorHome(db, runner);
        if (!home) {
            throw new AgentTargetError(
                'Your Project is not open, so the new Agent cannot join it. Pass --project <KEY>.'
            );
        }
        return home;
    }
    const project = await findLiveProjectByKey(db, { key, serverId: runner.serverId });
    if (!project) {
        throw new AgentTargetError(
            `There is no open Project with key ${key} on this Server to make the new Agent's home.`
        );
    }
    return project.id;
}

async function findCreatorHome(db: Pick<HausDatabase, 'select'>, runner: ResolvedRunner) {
    const [creator] = await db
        .select({ homeProjectId: agentsTable.homeProjectId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!creator) {
        return null;
    }
    return (await isLiveProject(db, {
        projectId: creator.homeProjectId,
        serverId: runner.serverId,
    }))
        ? creator.homeProjectId
        : null;
}
