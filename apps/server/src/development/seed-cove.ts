import { and, eq, isNull } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import { createCoveAvatarRow } from '../onboarding/cove-avatar.ts';
import { sendPendingCoveApplication } from '../onboarding/create-cove.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentsTable,
    avatarsTable,
    channelAgentParticipantsTable,
    chatsTable,
    serverMembershipsTable,
    serverOnboardingTable,
} from '../postgres/schema.ts';

const developmentCoveModelId = 'gpt-5.6-terra';
const developmentCoveRuntimeId = 'codex';

/** Ensures the dev Server has one real factory Cove, including its pending workspace application. */
export async function ensureDevelopmentCove(
    db: HausDatabase,
    input: { serverId: string; userId: string }
) {
    return await db.transaction(async (tx) => {
        const [existing] = await tx
            .select({ computerId: agentsTable.computerId, factoryKind: agentsTable.factoryKind })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.handle, 'cove'),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (existing) {
            if (existing.factoryKind !== 'cove') {
                throw new Error('The development Server already has a non-factory @cove Agent.');
            }
            return existing.computerId;
        }

        const [[onboarding], [membership]] = await Promise.all([
            tx
                .select({
                    channelId: serverOnboardingTable.channelId,
                    computerId: serverOnboardingTable.computerId,
                })
                .from(serverOnboardingTable)
                .where(eq(serverOnboardingTable.serverId, input.serverId))
                .limit(1),
            tx
                .select({ stint: serverMembershipsTable.stint })
                .from(serverMembershipsTable)
                .where(
                    and(
                        eq(serverMembershipsTable.serverId, input.serverId),
                        eq(serverMembershipsTable.userId, input.userId),
                        isNull(serverMembershipsTable.revokedAt)
                    )
                )
                .limit(1),
        ]);
        if (!(onboarding?.computerId && membership)) {
            throw new Error(
                'The development Server cannot seed Cove without its Owner and Computer.'
            );
        }

        const agentId = createOpaqueId('agt');
        const applicationId = createOpaqueId('cap');
        const avatar = await createCoveAvatarRow();
        await tx.insert(avatarsTable).values(avatar);
        await tx.insert(agentsTable).values({
            avatarId: avatar.id,
            computerId: onboarding.computerId,
            createdByUserId: input.userId,
            description: 'Onboarding Assistant',
            desiredModelId: developmentCoveModelId,
            desiredRuntimeId: developmentCoveRuntimeId,
            displayName: 'Cove',
            factoryKind: 'cove',
            handle: 'cove',
            homeTimezone: 'UTC',
            id: agentId,
            serverId: input.serverId,
        });
        await tx.insert(chatsTable).values({
            dmAgentId: agentId,
            dmMemberOneStint: membership.stint,
            dmMemberOneUserId: input.userId,
            id: createOpaqueId('cht'),
            kind: 'dm',
            serverId: input.serverId,
        });
        await tx.insert(agentDeliveryTable).values({ agentId, serverId: input.serverId });
        await tx.insert(channelAgentParticipantsTable).values({
            agentId,
            chatId: onboarding.channelId,
            serverId: input.serverId,
        });
        await tx
            .update(serverOnboardingTable)
            .set({
                agentId,
                applicationId,
                failureCode: null,
                failureDetail: null,
                modelId: developmentCoveModelId,
                phase: 'applying',
                runtimeId: developmentCoveRuntimeId,
                updatedAt: new Date(),
            })
            .where(eq(serverOnboardingTable.serverId, input.serverId));
        return onboarding.computerId;
    });
}

/** Offers a newly seeded Cove application immediately when the dev Computer is already online. */
export async function sendPendingDevelopmentCoveApplication(
    db: HausDatabase,
    connections: ComputerConnections,
    serverId: string
) {
    const [onboarding] = await db
        .select({
            computerId: serverOnboardingTable.computerId,
            phase: serverOnboardingTable.phase,
        })
        .from(serverOnboardingTable)
        .where(eq(serverOnboardingTable.serverId, serverId))
        .limit(1);
    if (onboarding?.phase !== 'applying' || !onboarding.computerId) {
        return false;
    }
    return await sendPendingCoveApplication(db, connections, onboarding.computerId);
}
