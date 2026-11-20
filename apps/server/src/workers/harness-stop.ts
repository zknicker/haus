import { and, eq, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerTurnCredentialsTable, workerTurnsTable } from '../postgres/schema.ts';

type TurnColumns = Record<'endedAt' | 'id' | 'outcome' | 'serverId', AnyPgColumn>;

export function owesHarnessStop(turns: TurnColumns) {
    return sql<boolean>`(${turns.outcome} is not null
        and ${turns.endedAt} is null
        and exists (
            select 1 from ${workerTurnCredentialsTable} minted
            where minted.server_id = ${turns.serverId}
                and minted.turn_id = ${turns.id}
                and minted.kind = 'turn'
        ))`;
}

export async function hasEarlierHarnessStop(
    tx: Pick<HausDatabase, 'select'>,
    turn: { createdAt: Date; serverId: string; workerId: string }
) {
    const [earlier] = await tx
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, turn.serverId),
                eq(workerTurnsTable.workerId, turn.workerId),
                lt(workerTurnsTable.createdAt, turn.createdAt),
                owesHarnessStop(workerTurnsTable)
            )
        )
        .limit(1);
    return earlier !== undefined;
}
