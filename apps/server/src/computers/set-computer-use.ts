import type { ComputerSetComputerUseInput } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireComputerSteward } from './computer-steward.ts';
import { ComputerSetupDeniedError } from './service.ts';

export async function setComputerUse(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerSetComputerUseInput
) {
    return await db.transaction(async (tx) => {
        const computer = await requireComputerSteward(tx, member, input);
        if (
            input.enabled &&
            !computer.computerUseEnabled &&
            computer.attachedByUserId !== computer.stewardUserId
        ) {
            throw new ComputerSetupDeniedError(
                'Only the person who attached this Device can turn computer use on.'
            );
        }
        await tx
            .update(computersTable)
            .set({ computerUseChangedAt: new Date(), computerUseEnabled: input.enabled })
            .where(
                and(
                    eq(computersTable.id, computer.id),
                    ne(computersTable.computerUseEnabled, input.enabled)
                )
            );
        return { computerId: computer.id };
    });
}
