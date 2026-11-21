import type { ComputerSetComputerUseInput } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireComputerSteward } from './computer-steward.ts';

export async function setComputerUse(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerSetComputerUseInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const computer = await requireComputerSteward(tx, member, input);
        await tx
            .update(computersTable)
            .set({ computerUseAccess: input.access })
            .where(eq(computersTable.id, computer.id));
        return { computerId: computer.id };
    });
}
