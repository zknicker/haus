import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, serverMembershipsTable, serversTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface ComputerFacts {
    attacherHandle: string | null;
    id: string;
    name: string;
    slug: string;
}

export async function readComputerFacts(
    db: Reader,
    input: { computerId: string; serverId: string }
) {
    const [row] = await db
        .select({
            attacherHandle: serverMembershipsTable.handle,
            inventory: computersTable.reportedInventory,
            slug: serversTable.slug,
        })
        .from(computersTable)
        .innerJoin(serversTable, eq(serversTable.id, computersTable.serverId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, computersTable.serverId),
                eq(serverMembershipsTable.userId, computersTable.attachedByUserId)
            )
        )
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const facts: ComputerFacts = {
        attacherHandle: row.attacherHandle,
        id: input.computerId,
        name: computerLabel({ id: input.computerId, name: row.inventory?.name }),
        slug: row.slug,
    };
    return facts;
}

export function computerLabel(computer: { id: string; name: string | null | undefined }) {
    return computer.name?.trim() ? computer.name : computer.id;
}

export function computerSettingsLink(
    appOrigin: string,
    computer: Pick<ComputerFacts, 'id' | 'slug'>
) {
    return new URL(
        `/s/${computer.slug}/settings/computers/${computer.id}#access`,
        appOrigin
    ).toString();
}
