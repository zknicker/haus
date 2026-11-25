import type { AgentCreated, AvatarMediaType, CreateAgentInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { enqueueAgentGreeting } from '../agent-delivery/greeting.ts';
import { type AvatarBytes, createAvatarId, readAvatarBytes } from '../avatars/avatar-bytes.ts';
import { archiveRetiredAgentFolder } from '../drive/agent-folder.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, avatarsTable, chatsTable, computersTable } from '../postgres/schema.ts';
import {
    homeChangeEvents,
    openAgentHomeReads,
    requireHomeProject,
} from '../projects/agent-home.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { participantHandleConstraint } from '../servers/participant-handles.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';
import { resolveAssignedComputer } from './agent-inventory.ts';
import { type AgentModelCatalog, assertModelAvailable } from './agent-model-catalog.ts';
import { toAgent } from './agent-shape.ts';

/**
 * Who is creating an Agent. The App path carries a signed-in human and is
 * authorized by their Server role; the Agent path's authority is the runner
 * credential itself, which already proves an active managed Agent of the Server.
 */
export type AgentCreator = { agentId: string; kind: 'agent' } | { kind: 'human'; user: HausUser };

export interface CreatedAgentFromApp extends AgentCreated {
    /** The home Project's change, for the App's Project and channel reads. */
    events: PreparedRealtimeEvent[];
}

/** Creates one Agent; its per-human DMs remain implicit until first use. */
export async function createAgent(
    db: HausDatabase,
    member: HausUser | null,
    input: CreateAgentInput,
    catalog: AgentModelCatalog
): Promise<CreatedAgentFromApp> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const creator = await requireAgentCreationAuthority(tx, member, input.serverId);
        await requireMachineConsent(tx, creator, input);
        await requireHomeProject(tx, creator, {
            projectId: input.homeProjectId,
            serverId: input.serverId,
        });
        const avatar = input.avatar
            ? {
                  ...readAvatarBytes(input.avatar.bytesBase64, input.avatar.mediaType),
                  mediaType: input.avatar.mediaType,
              }
            : null;
        const created = await createAgentInTransaction(
            tx,
            { kind: 'human', user: creator },
            input,
            avatar,
            catalog
        );
        return {
            agent: created.agent,
            events: [
                ...homeChangeEvents(input.serverId, [created.homeProjectId]),
                ...created.driveEvents,
            ],
        };
    });
}

/** Shared write seam for the App's creation flow and one Agent creating another. */
export async function createAgentInTransaction(
    db: HausDatabase,
    creator: AgentCreator,
    input: CreateAgentInput & {
        brief?: string | null;
        creationRequest?: { hash: string; nonce: string };
    },
    avatar: (AvatarBytes & { mediaType: AvatarMediaType }) | null,
    catalog: AgentModelCatalog
): Promise<AgentCreated & { driveEvents: PreparedRealtimeEvent[]; homeProjectId: string }> {
    const createdByAgentId = creator.kind === 'agent' ? creator.agentId : null;
    const createdByUserId = creator.kind === 'human' ? creator.user.id : null;

    const { health: computerHealth, inventory } = await resolveAssignedComputer(db, {
        computerId: input.computerId,
        serverId: input.serverId,
    });
    await assertModelAvailable(db, catalog, inventory, input);

    const avatarId = avatar ? createAvatarId() : null;
    if (avatar && avatarId) {
        await db.insert(avatarsTable).values({
            byteSize: avatar.bytes.byteLength,
            bytes: avatar.bytes,
            id: avatarId,
            mediaType: avatar.mediaType,
            sha256: avatar.sha256,
        });
    }

    const agentId = createOpaqueId('agt');
    const { homeProjectId } = input;
    try {
        await db.insert(agentsTable).values({
            avatarId,
            brief: input.brief ?? null,
            computerId: input.computerId,
            createdByAgentId,
            createdByUserId,
            creationNonce: input.creationRequest?.nonce ?? null,
            creationRequestHash: input.creationRequest?.hash ?? null,
            description: input.description ?? null,
            desiredModelId: input.modelId,
            desiredReasoningEffort: input.reasoningEffort,
            desiredRuntimeId: input.runtimeId,
            displayName: input.displayName,
            handle: input.handle,
            homeProjectId,
            homeTimezone: 'UTC',
            id: agentId,
            serverId: input.serverId,
            signatureEmoji: input.signatureEmoji ?? null,
        });
    } catch (cause) {
        if (
            violatesConstraint(cause, 'agents_server_handle_key') ||
            violatesConstraint(cause, participantHandleConstraint)
        ) {
            throw new AgentConfigDeniedError(`The handle "${input.handle}" is already taken.`);
        }
        throw cause;
    }
    const archivedFiles = await archiveRetiredAgentFolder(db, {
        handle: input.handle,
        serverId: input.serverId,
    });

    await openAgentHomeReads(db, { agentId, projectId: homeProjectId, serverId: input.serverId });
    // The new Agent introduces itself once in `#all`, as soon as it can run,
    // rather than waiting for its first delivery. The caller dispatches after commit.
    await enqueueAgentGreeting(db, {
        agentId,
        allChannelId: await requireAllChannelId(db, input.serverId),
        serverId: input.serverId,
    });

    return {
        driveEvents:
            archivedFiles > 0
                ? [artifactUpdatedTopic.prepare({ artifactId: null, serverId: input.serverId })]
                : [],
        homeProjectId,
        agent: toAgent({
            activeRunId: null,
            avatarId,
            computerId: input.computerId,
            computerHealth,
            consecutiveFailures: 0,
            lastFailureAt: null,
            lastFailureCode: null,
            lastFailureKind: null,
            pausedAt: null,
            retryAfter: null,
            connectionAdmin: false,
            modelConnectionId: null,
            createdAt: new Date(),
            createdByAgentId,
            createdByUserId,
            description: input.description ?? null,
            desiredModelId: input.modelId,
            desiredReasoningEffort: input.reasoningEffort,
            desiredRuntimeId: input.runtimeId,
            displayName: input.displayName,
            dmChatId: null,
            effectiveBackgroundSubagents: 0,
            effectiveHausAgentAppliedAt: null,
            effectiveHausAgentStatus: null,
            effectiveHausAgentVersion: null,
            effectiveMissing: null,
            effectiveModelId: null,
            effectiveReasoningEffort: null,
            effectiveReportedAt: null,
            effectiveRuntimeId: null,
            handle: input.handle,
            id: agentId,
            serverId: input.serverId,
            stopped: false,
        }),
    };
}

/** Authorizes the App's Agent-creation boundary and names the human creator. */
async function requireAgentCreationAuthority(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
): Promise<HausUser> {
    const server = await requireServerMembership(db, member, serverId);
    if (!member) {
        throw new AgentConfigDeniedError('Sign in to create an Agent.');
    }
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new AgentConfigDeniedError('Only a Server Owner or Admin can create an Agent.');
    }
    return member;
}

/**
 * ADR 0057 decision 7: a new Agent's Machine needs its attacher's consent, given
 * by creating the Agent themselves or by allowing All Captains on this Server.
 */
async function requireMachineConsent(
    db: Pick<HausDatabase, 'select'>,
    creator: HausUser,
    input: { computerId: string; serverId: string }
) {
    const [computer] = await db
        .select({
            agentAccessScope: computersTable.agentAccessScope,
            attachedByUserId: computersTable.attachedByUserId,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (
        computer &&
        computer.attachedByUserId !== creator.id &&
        computer.agentAccessScope !== 'all'
    ) {
        throw new AgentConfigDeniedError(
            'Only the person who attached that Computer can create an Agent on it, unless it allows All Captains on this Server.'
        );
    }
}

async function requireAllChannelId(db: Pick<HausDatabase, 'select'>, serverId: string) {
    const [channel] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.isAll, true)))
        .limit(1);
    if (!channel) {
        throw new Error(`Server ${serverId} has no #all channel for the greeting.`);
    }
    return channel.id;
}
