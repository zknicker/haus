import type {
    AgentCreateAgentReceipt,
    AgentCreateAgentRequest,
    AgentCreatedAvatarOutcome,
    AgentReasoningEffort,
    AvatarMediaType,
    ServerDurableEvent,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../agent-api/chat-freshness.ts';
import type { AvatarBytes } from '../avatars/avatar-bytes.ts';
import { resolveAgentDmOwnerUserId } from '../chats/agent-dm-owner.ts';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import { insertLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { suggestAvailableParticipantHandle } from '../servers/participant-handles.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import { createAgentInTransaction } from './create-agent.ts';
import {
    channelMembershipEvents,
    joinCreationChannels,
    readAgentChannels,
    requireCreationChannels,
} from './creation-channels.ts';
import { requireAgentCreationGuidance } from './creation-guidance.ts';
import {
    agentCreationRequestHash,
    readAgentCreationReplay,
    resolveCreationContext,
} from './creation-request.ts';
import { AgentCreateNoComputerError } from './errors.ts';

/** The avatar decision the route already made, generated outside this transaction. */
export interface CreationAvatar {
    bytes: (AvatarBytes & { mediaType: AvatarMediaType }) | null;
    outcome: AgentCreatedAvatarOutcome;
}

/** What the Computer must apply after the transaction commits. */
export interface AgentCreationConfiguration {
    agentDescription: string;
    agentId: string;
    agentName: string;
    computerId: string;
    modelId: string;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string;
}

export interface CreateAgentFromAgentResult {
    configure: AgentCreationConfiguration | null;
    events: ServerDurableEvent[];
    receipt: AgentCreateAgentReceipt;
}

/** Creates one Agent and its memberships. Introductions are ordinary later sends. */
export async function createAgentFromAgent(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCreateAgentRequest,
    avatar: CreationAvatar
): Promise<CreateAgentFromAgentResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const plan = await resolveCreationContext(tx, runner, input.target);

        const replay = await readAgentCreationReplay(tx, runner, plan.chatId, input);
        if (replay) {
            return { configure: null, events: [], receipt: replay };
        }

        await assertFreshAgentView(tx, runner, plan.chatId);
        await requireAgentCreationGuidance(tx, runner, input.brief);
        // Nothing is written until every requested channel is there to join, so
        // a typo in `--channel` creates nothing.
        const channels = await requireCreationChannels(tx, runner.serverId, input.channels);
        const execution = await requireCallerExecution(tx, runner);
        const handle = await suggestAvailableParticipantHandle(
            tx,
            runner.serverId,
            input.displayName
        );
        const created = await createAgentInTransaction(
            tx,
            { agentId: runner.agentId, kind: 'agent' },
            {
                brief: input.brief,
                computerId: execution.computerId,
                creationRequest: { hash: agentCreationRequestHash(input), nonce: input.nonce },
                description: input.description,
                displayName: input.displayName,
                handle,
                modelId: execution.modelId,
                reasoningEffort: execution.reasoningEffort,
                runtimeId: execution.runtimeId,
                serverId: runner.serverId,
                signatureEmoji: input.signatureEmoji,
            },
            avatar.bytes
        );

        // No human created this Agent, so nothing else can name the human its
        // Owner DM belongs to. Materialize that DM record here — it carries no
        // message, so the DM still becomes a visible Chat on its first one, and
        // the human has a place to talk to the new Agent from the start.
        const dmOwnerUserId = await resolveAgentDmOwnerUserId(tx, {
            contextChatId: plan.chat.kind === 'thread' ? plan.chat.parentChatId : plan.chatId,
            creatorAgentId: runner.agentId,
            serverId: runner.serverId,
        });
        const dm = dmOwnerUserId
            ? await ensureAgentDmRecord(tx, {
                  agentId: created.agent.id,
                  serverId: runner.serverId,
                  userId: dmOwnerUserId,
              })
            : null;
        const dmCreatedEvent = dm?.created
            ? await insertLifecycleEvent(
                  tx,
                  { chatId: dm.id, serverId: runner.serverId },
                  'created',
                  new Date()
              )
            : null;

        // `#all` is joined by the shared creation seam; these are the lanes the
        // request named on top of it.
        await joinCreationChannels(tx, runner.serverId, created.agent.id, channels);
        const joined = await readAgentChannels(tx, runner.serverId, created.agent.id);

        const summary = await readCreatedAgent(tx, runner.serverId, created.agent.id);
        if (!summary) {
            throw new Error('The created Agent could not be projected after creation.');
        }

        return {
            configure: {
                agentDescription: input.description,
                agentId: created.agent.id,
                agentName: input.displayName,
                computerId: execution.computerId,
                modelId: execution.modelId,
                reasoningEffort: execution.reasoningEffort,
                runtimeId: execution.runtimeId,
            },
            events: [
                ...(dmCreatedEvent ? [dmCreatedEvent] : []),
                ...(await channelMembershipEvents(tx, runner.serverId, joined)),
            ],
            receipt: {
                agent: summary,
                avatar: avatar.outcome,
                channels: joined.map((channel) => `#${channel.name}`),
                chatId: plan.chatId,
                computerId: execution.computerId,
                idempotent: false,
                modelId: execution.modelId,
                reasoningEffort: execution.reasoningEffort,
                runtimeId: execution.runtimeId,
                target: input.target,
            },
        };
    });
}

/** The new Agent inherits exactly what the creating Agent runs on. */
async function requireCallerExecution(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner
): Promise<{
    computerId: string;
    modelId: string;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string;
}> {
    const [caller] = await db
        .select({
            computerId: agentsTable.computerId,
            modelId: agentsTable.desiredModelId,
            reasoningEffort: agentsTable.desiredReasoningEffort,
            runtimeId: agentsTable.desiredRuntimeId,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!(caller?.computerId && caller.modelId && caller.runtimeId)) {
        throw new AgentCreateNoComputerError();
    }
    return {
        computerId: caller.computerId,
        modelId: caller.modelId,
        reasoningEffort: caller.reasoningEffort,
        runtimeId: caller.runtimeId,
    };
}
