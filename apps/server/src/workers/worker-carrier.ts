import { type WorkerPlace, cloudAgentProviderReadinessSchema, workerPlaces } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { WorkerPlaceUnavailableError } from './errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readReadyPlaces(db: Reader, serverId: string) {
    const carriers = await readReadyCarriers(db, serverId);
    return workerPlaces.filter((place) => carriers.some((carrier) => carrier.places.has(place)));
}

export async function chooseCarrier(
    db: Reader,
    input: { agentId: string; place: WorkerPlace; serverId: string }
) {
    const carriers = (await readReadyCarriers(db, input.serverId)).filter((carrier) =>
        carrier.places.has(input.place)
    );
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    const own = carriers.find((carrier) => carrier.computerId === agent?.computerId);
    const chosen = own ?? carriers[0];
    if (!chosen) {
        throw new WorkerPlaceUnavailableError(input.place);
    }
    return chosen.computerId;
}

async function readReadyCarriers(db: Reader, serverId: string) {
    const rows = await db
        .select({ computerId: computersTable.id, inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, serverId),
                inArray(computersTable.health, ['healthy', 'degraded'])
            )
        )
        .orderBy(asc(computersTable.createdAt), asc(computersTable.id));
    return rows.map(({ computerId, inventory }) => ({
        computerId,
        places: new Set(
            (inventory?.cloudAgentProviders ?? []).flatMap((reported) => {
                const parsed = cloudAgentProviderReadinessSchema.safeParse(reported);
                return parsed.success && parsed.data.ready ? [parsed.data.provider] : [];
            })
        ),
    }));
}
