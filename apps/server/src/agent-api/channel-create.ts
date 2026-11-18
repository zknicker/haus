import type { AgentCreateChannelInput, AgentCreateChannelReceipt } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { insertChannel } from '../chats/create-channel.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { AgentTargetError } from './resolve-target.ts';

/**
 * `haus channel create`: an Agent opens a channel the way any Server member
 * does in the App. Creating a channel is a member capability, not an admin one,
 * so the runner credential is the whole authority. The creating Agent joins it,
 * and so does every human the request names: a human sees a channel only as its
 * participant, so a channel nobody human is in would be invisible in the App.
 */
export async function createAgentChannel(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentCreateChannelInput
): Promise<{ event: PreparedRealtimeEvent; receipt: AgentCreateChannelReceipt }> {
    const handles = [
        ...new Set(
            input.humans.map((human) =>
                (human.startsWith('@') ? human.slice(1) : human).toLowerCase()
            )
        ),
    ];
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const humans = await tx
            .select({
                handle: serverMembershipsTable.handle,
                userId: serverMembershipsTable.userId,
            })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, runner.serverId),
                    isNull(serverMembershipsTable.revokedAt),
                    inArray(sql<string>`lower(${serverMembershipsTable.handle})`, handles)
                )
            );
        const found = new Set(humans.map((human) => human.handle?.toLowerCase()));
        const missing = handles.find((handle) => !found.has(handle));
        if (missing) {
            throw new AgentTargetError(`No human on this Server answers to "@${missing}".`);
        }

        const { event } = await insertChannel(tx, {
            agentIds: [runner.agentId],
            description: input.description ?? null,
            name: input.name,
            serverId: runner.serverId,
            userIds: humans.map((human) => human.userId),
        });
        return {
            event,
            receipt: {
                description: input.description ?? null,
                humans: humans.flatMap((human) => (human.handle ? [human.handle] : [])).sort(),
                target: `#${input.name}`,
            },
        };
    });
}
