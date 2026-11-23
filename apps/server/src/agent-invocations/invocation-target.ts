import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

const computerPrefix = 'computer:';

export type InvocationTarget =
    | { computerId: string | null; kind: 'computer' }
    | { candidates: string[]; kind: 'not-found' };

export async function resolveInvocationTarget(
    db: Pick<HausDatabase, 'select'>,
    input: { home: string | null; requested: string | undefined; serverId: string }
) {
    if (input.requested === undefined) {
        return { computerId: input.home, kind: 'computer' } satisfies InvocationTarget;
    }
    const text = input.requested.trim();
    const named = text.startsWith(computerPrefix) ? text.slice(computerPrefix.length) : text;
    const computers = await db
        .select({ id: computersTable.id, inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(eq(computersTable.serverId, input.serverId));
    const byId = computers.find((computer) => computer.id === named);
    if (byId) {
        return { computerId: byId.id, kind: 'computer' } satisfies InvocationTarget;
    }
    const byName = computers.filter(
        (computer) => computer.inventory?.name?.toLowerCase() === named.toLowerCase()
    );
    const [only, ...others] = byName;
    if (only && others.length === 0) {
        return { computerId: only.id, kind: 'computer' } satisfies InvocationTarget;
    }
    return {
        candidates: byName.map((computer) => computer.id).sort(),
        kind: 'not-found',
    } satisfies InvocationTarget;
}
