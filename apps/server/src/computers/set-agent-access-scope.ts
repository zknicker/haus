import type { ComputerSetAgentAccessScopeInput } from '@haus/api';
import { eq } from 'drizzle-orm';
import { readAgentsBarredFrom } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireComputerSteward } from './computer-steward.ts';
import { ComputerSetupDeniedError } from './service.ts';

export async function setAgentAccessScope(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerSetAgentAccessScopeInput
) {
    return await db.transaction(async (tx) => {
        const computer = await requireComputerSteward(tx, member, input);
        if (computer.agentAccessScope === input.scope) {
            return { barred: [], computerId: computer.id };
        }
        if (input.scope === 'all' && computer.attachedByUserId !== computer.stewardUserId) {
            throw new ComputerSetupDeniedError(
                'Only the person who attached this Device can let every Captain use it.'
            );
        }
        await tx
            .update(computersTable)
            .set({ agentAccessScope: input.scope })
            .where(eq(computersTable.id, computer.id));
        const barred =
            input.scope === 'selected' ? await readAgentsBarredFrom(tx, computer.id) : [];
        return { barred, computerId: computer.id };
    });
}
