import { suggestParticipantHandle } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable } from '../postgres/schema.ts';

export const participantHandleConstraint = 'participant_handles_server_handle_key';

export class ParticipantHandleTakenError extends Error {
    constructor(handle: string) {
        super(`The handle "${handle}" is already taken on this Server.`);
        this.name = 'ParticipantHandleTakenError';
    }
}

/** Picks a friendly seed while the caller holds the Server row lock. */
export async function suggestAvailableParticipantHandle(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    ...sources: Array<null | string | undefined>
): Promise<string> {
    const base = suggestParticipantHandle(...sources);
    const [humanRows, agentRows] = await Promise.all([
        db
            .select({ handle: serverMembershipsTable.handle })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, serverId),
                    isNull(serverMembershipsTable.revokedAt),
                    sql`${serverMembershipsTable.handle} is not null`
                )
            ),
        db
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), isNull(agentsTable.retiredAt))),
    ]);
    const claimed = new Set(
        [...humanRows, ...agentRows].flatMap(({ handle }) => (handle ? [handle.toLowerCase()] : []))
    );

    if (!claimed.has(base)) {
        return base;
    }

    for (let suffix = 2; suffix < 10_000; suffix += 1) {
        const ending = `-${suffix}`;
        const candidate = `${base.slice(0, 31 - ending.length).replace(/-+$/gu, '')}${ending}`;
        if (!claimed.has(candidate)) {
            return candidate;
        }
    }

    throw new Error('No participant handle is available for this profile.');
}
