import type {
    AgentCreated,
    AvatarMediaType,
    CreateAgentInput,
    ServerDurableEvent,
} from '@haus/api';
import { type AvatarBytes, createAvatarId, readAvatarBytes } from '../avatars/avatar-bytes.ts';
import { findAllChannel, joinChannelAgents } from '../chats/channel-agent-membership.ts';
import { insertLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, avatarsTable } from '../postgres/schema.ts';
import { participantHandleConstraint } from '../servers/participant-handles.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';
import { assertRuntimeModelReported, resolveAssignedComputer } from './agent-inventory.ts';
import { toAgent } from './agent-shape.ts';

/**
 * Who is creating an Agent. The App path carries a signed-in human and is
 * authorized by their Server role; the Agent path's authority is the runner
 * credential itself, which already proves an active managed Agent of the Server.
 */
export type AgentCreator = { agentId: string; kind: 'agent' } | { kind: 'human'; user: HausUser };

export interface CreatedAgentFromApp extends AgentCreated {
    /** The `#all` membership change, for the App's channel member lists. */
    event: ServerDurableEvent | null;
}

/** Creates one Agent; its per-human DMs remain implicit until first use. */
export async function createAgent(
    db: HausDatabase,
    member: HausUser | null,
    input: CreateAgentInput
): Promise<CreatedAgentFromApp> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const creator = await requireAgentCreationAuthority(tx, member, input.serverId);
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
            avatar
        );
        return {
            agent: created.agent,
            event: created.allChannelId
                ? await insertLifecycleEvent(
                      tx,
                      { chatId: created.allChannelId, serverId: input.serverId },
                      'updated',
                      new Date()
                  )
                : null,
        };
    });
}

/** Shared write seam for the App's creation flow and one Agent creating another. */
export async function createAgentInTransaction(
    db: HausDatabase,
    creator: AgentCreator,
    input: CreateAgentInput & {
        agentId?: string;
        brief?: string | null;
        creationMessageId?: string;
    },
    avatar: (AvatarBytes & { mediaType: AvatarMediaType }) | null
): Promise<AgentCreated & { allChannelId: string | null }> {
    const createdByAgentId = creator.kind === 'agent' ? creator.agentId : null;
    const createdByUserId = creator.kind === 'human' ? creator.user.id : null;

    const { health: computerHealth, inventory } = await resolveAssignedComputer(db, {
        computerId: input.computerId,
        serverId: input.serverId,
    });
    assertRuntimeModelReported(inventory, input.runtimeId, input.modelId, input.reasoningEffort);

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

    // The caller may mint the id first when it has to appear in something else
    // written in this same transaction, such as a creation announcement.
    const agentId = input.agentId ?? createOpaqueId('agt');
    try {
        await db.insert(agentsTable).values({
            avatarId,
            brief: input.brief ?? null,
            computerId: input.computerId,
            createdByAgentId,
            createdByUserId,
            creationMessageId: input.creationMessageId ?? null,
            description: input.description ?? null,
            desiredModelId: input.modelId,
            desiredReasoningEffort: input.reasoningEffort,
            desiredRuntimeId: input.runtimeId,
            displayName: input.displayName,
            handle: input.handle,
            homeTimezone: 'UTC',
            id: agentId,
            serverId: input.serverId,
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

    // Every Agent belongs to `#all`, whoever made it. The Server owns that
    // guarantee here, at the one seam both creation paths share, rather than in
    // the App dialog and the Agent route separately.
    const allChannel = await findAllChannel(db, input.serverId);
    if (allChannel) {
        await joinChannelAgents(db, {
            agentIds: [agentId],
            chatId: allChannel.id,
            serverId: input.serverId,
        });
    }

    return {
        allChannelId: allChannel?.id ?? null,
        agent: toAgent({
            activeRunId: null,
            avatarId,
            computerId: input.computerId,
            computerHealth,
            consecutiveFailures: 0,
            createdAt: new Date(),
            createdByAgentId,
            createdByUserId,
            description: input.description ?? null,
            desiredModelId: input.modelId,
            desiredReasoningEffort: input.reasoningEffort,
            desiredRuntimeId: input.runtimeId,
            displayName: input.displayName,
            dmChatId: null,
            effectiveHausAgentAppliedAt: null,
            effectiveHausAgentStatus: null,
            effectiveHausAgentVersion: null,
            effectiveMissing: null,
            effectiveModelId: null,
            effectiveReasoningEffort: null,
            effectiveReportedAt: null,
            effectiveRuntimeId: null,
            factoryKind: 'ordinary',
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
