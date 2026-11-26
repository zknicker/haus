import type {
    AgentCreateAgentReceipt,
    AgentCreateAgentRequest,
    AgentCreatedAvatarOutcome,
    AgentReasoningEffort,
    AvatarMediaType,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../agent-api/chat-freshness.ts';
import type { AvatarBytes } from '../avatars/avatar-bytes.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { homeChangeEvents, readAgentHomeKey } from '../projects/agent-home.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { suggestAvailableParticipantHandle } from '../servers/participant-handles.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import { type AgentModelCatalog, inheritedModel } from './agent-model-catalog.ts';
import { captainChatCreatedEvents, createAgentInTransaction } from './create-agent.ts';
import { requireAgentCreationGuidance } from './creation-guidance.ts';
import {
    agentCreationRequestHash,
    readAgentCreationReplay,
    requireCreationHome,
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
    events: PreparedRealtimeEvent[];
    receipt: AgentCreateAgentReceipt;
}

/** Creates one Agent in its home Project. Introductions are ordinary later sends. */
export async function createAgentFromAgent(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCreateAgentRequest,
    avatar: CreationAvatar,
    catalog: AgentModelCatalog
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
        // Nothing is written until the requested Project is there to live in, so
        // a typo in `--project` creates nothing.
        const homeProjectId = await requireCreationHome(tx, runner, input.project);
        const caller = await requireCallerExecution(tx, runner);
        const execution = inheritedModel(catalog, caller);
        if (execution.modelId !== caller.modelId) {
            console.info(
                '[haus] a new Agent took the successor of its creator model the runner retired',
                {
                    creatorAgentId: runner.agentId,
                    from: caller.modelId,
                    to: execution.modelId,
                }
            );
        }
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
                homeProjectId,
                modelId: execution.modelId,
                reasoningEffort: execution.reasoningEffort,
                runtimeId: execution.runtimeId,
                serverId: runner.serverId,
                signatureEmoji: input.signatureEmoji,
            },
            avatar.bytes,
            catalog
        );

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
                ...captainChatCreatedEvents(runner.serverId, created.agent.captainChatId),
                ...homeChangeEvents(runner.serverId, [created.homeProjectId]),
                ...created.driveEvents,
            ],
            receipt: {
                agent: summary,
                avatar: avatar.outcome,
                chatId: plan.chatId,
                computerId: execution.computerId,
                idempotent: false,
                modelId: execution.modelId,
                project: await readAgentHomeKey(tx, {
                    agentId: created.agent.id,
                    serverId: runner.serverId,
                }),
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
